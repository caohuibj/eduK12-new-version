import type { Prisma, PrismaClient } from '@prisma/client'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { buildBundleContextFactsFromValues, type BundleContextDefinitionV1 } from '../assessment-bundle/context'
import type { AssessmentBundleDefinitionV1, BundleContextFactsV1 } from '../assessment-bundle/types'
import { readFormSectionCollectionFacts } from '../assessment-runtime/form-facts'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import type { AssessmentContextValues } from '../assessment-context/context'
import { contextValues } from './context-submission'
import { readInstance } from './instance'

const invalid = (message: string): never => { throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', message, 409) }
export type BundleScaleStartContext = { assessmentContext: string; facts: BundleContextFactsV1 }

export function bundleBirthYearMonthForm(definition: AssessmentBundleDefinitionV1, contextKey: string) {
  return definition.slots.some(slot => slot.admissionContext?.birthYearMonthContextKey === contextKey)
    ? { formType: 'year_month', formLabel: '出生年月', contextKey: 'birthYearMonth' } : undefined
}

/** Validate source references, not participant values or a caller-supplied override. */
export function validateBundleStartContextMappings(definition: AssessmentBundleDefinitionV1, context: BundleContextDefinitionV1 | null) {
  for (const slot of definition.slots) {
    const mapping = slot.admissionContext
    if (!mapping) continue
    const fields = context?.fields ?? []
    for (const requirement of mapping.requirements) {
      const field = fields.find(f => f.contextKey === requirement.contextKey)
      if (!field?.required) invalid('START context 必须引用已声明的必填字段')
      const type = field!.valueType === 'enum' ? 'string' : field!.valueType
      if (requirement.allowedValues?.some(value => typeof value !== type || field!.valueType === 'enum' && !field!.enumValues?.includes(value as string))) invalid('START context 固定值与字段类型或选项不匹配')
    }
    if (mapping.birthYearMonthContextKey && !fields.some(f => f.contextKey === mapping.birthYearMonthContextKey && f.required && f.valueType === 'string')) invalid('START 出生年月必须引用必填 string context')
  }
  const birthKeys = new Set(definition.slots.flatMap(slot => slot.admissionContext?.birthYearMonthContextKey ? [slot.admissionContext.birthYearMonthContextKey] : []))
  if (birthKeys.size > 1) invalid('同一 Bundle 只能声明一个本人出生年月字段')
}

/** First START only, after parent authorization. Read accepted FORM facts, never drafts. */
export async function loadBundleScaleStartContext(db: PrismaClient | Prisma.TransactionClient, parent: {
  id: string; attemptEpoch: number; frozenActiveSlotSetEncrypted: string | null; frozenActiveSlotSetHash: string | null
  compositeAssessment: { productKind?: string }
}, itemId: string, instrumentKey: string, instrumentVersion: string, demographicContext: AssessmentContextValues | null): Promise<BundleScaleStartContext | undefined> {
  if (!['ASSESSMENT_BUNDLE', 'ORGANIZATION_RESOURCE'].includes(parent.compositeAssessment.productKind ?? '')) return undefined
  const instance = await db.bundleInstance.findFirst({ where: { composite: { attempts: { some: { id: parent.id, attemptEpoch: parent.attemptEpoch } } } } })
  if (!instance) {
    if (parent.compositeAssessment.productKind === 'ASSESSMENT_BUNDLE') invalid('Bundle 冻结实例不存在')
    return undefined
  }
  const { frozen, bindings } = readInstance(instance)
  const binding = bindings.slots.find(s => s.itemId === itemId && s.unitType === 'SCALE')
  const slot = frozen.bundleSnapshot.bundleDefinition.slots.find(s => s.slotKey === binding?.slotKey && s.unitType === 'SCALE')
  if (!slot || slot.instrumentKey !== instrumentKey || slot.instrumentVersion !== instrumentVersion) invalid('START 量表与冻结 Bundle 槽位不匹配')
  const mapping = slot!.admissionContext
  if (!mapping) return undefined
  validateBundleStartContextMappings(frozen.bundleSnapshot.bundleDefinition, frozen.contextDefinition)
  if (!parent.frozenActiveSlotSetEncrypted) invalid('START 缺少冻结 FORM 槽位')
  const active = await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted!, db)
  if (active.snapshotHash !== parent.frozenActiveSlotSetHash || active.attemptEpoch !== parent.attemptEpoch) invalid('START FORM 槽位轮次不匹配')
  const forms = active.slots.filter(s => s.unitType === 'FORM_SECTION')
  const rows = await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch, slotKey: { in: forms.map(s => s.slotKey) } } })
  const facts = forms.flatMap(form => {
    const matches = rows.filter(row => row.slotKey === form.slotKey)
    const row = matches[0]
    if (matches.length !== 1 || row.compositeAttemptId !== parent.id || row.attemptEpoch !== parent.attemptEpoch || row.unitType !== 'FORM_SECTION' || row.terminalState !== 'COMPLETED' || row.payloadKind !== 'COLLECTION_FACTS' || row.sourceDefinitionHash !== form.sourceDefinitionIdentity.hash || !row.collectionFactsEncrypted) invalid('请先完成此 Bundle 必需的背景信息')
    const payload = readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(row.collectionFactsEncrypted!))
    if (payload.sectionKey !== form.sourceBinding.sectionId) invalid('START FORM 区段身份不匹配')
    return payload.items
  })
  const values = contextValues(bindings.context, facts)
  const contextFacts = buildBundleContextFactsFromValues({ definition: frozen.contextDefinition!, values,
    frozenAt: rows.length ? new Date(Math.max(...rows.map(r => r.completedAt.getTime()))).toISOString() : undefined })
  for (const requirement of mapping.requirements) {
    const value = values[requirement.contextKey]
    if (value === undefined || value === null || typeof value === 'string' && !value.trim() || requirement.allowedValues && !requirement.allowedValues.includes(value as string | number | boolean)) invalid('背景信息不满足此量表声明的测量情境')
  }
  if (mapping.birthYearMonthContextKey && (!demographicContext?.birthYearMonth || demographicContext.birthYearMonth !== values[mapping.birthYearMonthContextKey])) invalid('请先通过既有出生年月上下文完成年龄确认')
  if (mapping.birthYearMonthContextKey) {
    const population=frozen.bundleSnapshot.bundleDefinition.population
    if (population.subjectMinAgeYears!==undefined || population.subjectMaxAgeYears!==undefined) {
      const months=demographicContext?.ageMonthsAtFreeze
      if (typeof months!=='number' || !Number.isInteger(months) || months<0) invalid('出生年月上下文缺少已冻结的年龄事实')
      if (population.subjectMinAgeYears!==undefined && months!<population.subjectMinAgeYears*12 ||
          population.subjectMaxAgeYears!==undefined && months!>=(population.subjectMaxAgeYears+1)*12) invalid('冻结出生年月年龄不符合本测评包的适用范围')
    }
  }
  return { assessmentContext: mapping.assessmentContext, facts: contextFacts }
}
