import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { authoringFixture } from './fixtures'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { createFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
import { parseDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { freezeBundleProductionDefinition } from '../../modules/bundle-product/definition-provider'
import { bundleBirthYearMonthForm, loadBundleScaleStartContext, validateBundleStartContextMappings } from '../../modules/bundle-product/start-context'
import { createScaleAdmissionForRuntime } from '../../modules/scale/scale-admission.service'
import { parseFrozenUnitAdmissionV2 } from '../../modules/assessment-runtime/admission-snapshot-v2'

const deployment = vi.hoisted(() => vi.fn())
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/scale/deployment/service', () => ({ resolveScaleStartDeployment: deployment }))
const at = '2026-11-01T00:00:00.000Z'
const scene = 'UNIVERSITY_ONLINE_OR_BLENDED_CURRENT_COURSE'
const policyHash = canonicalHash({ synthetic: 'course-start-policy' })
const demographic = { birthYearMonth: '2006-11', ageMonthsAtFreeze: 240, ageYearsAtFreeze: 20 }

function fixture(schemaVersion: 1 | 3 = 1) {
  const raw = authoringFixture()
  raw.manifest.definition.contextDefinitionKey = 'course_context'
  raw.manifest.definition.contextDefinitionVersion = '1.0.0'
  raw.manifest.files.context = 'context.json'
  raw.manifest.definition.slots[0].admissionContext = {
    assessmentContext: scene,
    requirements: [
      { contextKey: 'course_id' }, { contextKey: 'course_mode', allowedValues: ['online', 'blended'] },
      { contextKey: 'learning_stage' }, { contextKey: 'university_student', allowedValues: [true] },
    ],
    birthYearMonthContextKey: 'birth_year_month',
  }
  raw.context = { schemaVersion: 1, contextDefinitionKey: 'course_context', contextDefinitionVersion: '1.0.0', fields: [
    { contextKey: 'course_id', required: true, valueType: 'string' },
    { contextKey: 'course_mode', required: true, valueType: 'enum', enumValues: ['online', 'blended', 'offline'] },
    { contextKey: 'learning_stage', required: true, valueType: 'string' },
    { contextKey: 'university_student', required: true, valueType: 'boolean' },
    { contextKey: 'birth_year_month', required: true, valueType: 'string' },
  ] }
  if (schemaVersion === 3) {
    raw.schemaVersion = 3
    raw.manifest.packageSchemaVersion = 3
    raw.manifest.definition.engine.version = '1.2.0'
    raw.rules.derivations = []
    raw.report.rows = []
  }
  const p = parseDeclarativePackage(raw), frozen = freezeBundleProductionDefinition(packageEntry(p), { frozenAt: at, sourceReference: 'synthetic-source' })
  const bindings = { schemaVersion: 1, slots: [{ slotKey: 'source', itemId: 'scale-item', unitType: 'SCALE' }],
    context: raw.context.fields.map((f: any) => ({ contextKey: f.contextKey, valueType: f.valueType, itemId: 'form-' + f.contextKey })) }
  const instance = { definitionHash: frozen.contentHash, definitionEncrypted: encryptCognitivePayload(frozen), bindingsHash: canonicalHash(bindings), bindingsEncrypted: encryptCognitivePayload(bindings) }
  const slot = { slotKey: 'form-section:background', unitType: 'FORM_SECTION' as const, required: true, sourceDefinitionIdentity: { key: 'background', version: '1.0.0', hash: canonicalHash({ synthetic: 'form-definition' }) }, sourceBinding: { sectionId: 'background' } }
  const active = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1, slots: [slot] })
  const values: Record<string, string> = { course_id: 'synthetic-course', course_mode: 'online', learning_stage: 'synthetic-week-4', university_student: 'true', birth_year_month: '2006-11' }
  const formFacts = () => createFormSectionCollectionFacts({ sectionKey: 'background', items: bindings.context.map((b: { itemId: string; contextKey: string }) => ({ key: b.itemId, label: b.contextKey, value: values[b.contextKey] ?? null })) })
  const row = { compositeAttemptId: 'attempt', attemptEpoch: 1, slotKey: slot.slotKey, unitType: 'FORM_SECTION', terminalState: 'COMPLETED', payloadKind: 'COLLECTION_FACTS', sourceDefinitionHash: slot.sourceDefinitionIdentity.hash, collectionFactsEncrypted: encryptUnifiedRuntimePayload(formFacts()), completedAt: new Date(at) }
  const db = { bundleInstance: { findFirst: vi.fn(async () => instance) }, assessmentUnitSnapshot: { findMany: vi.fn(async () => [row]) } }
  const parent = { id: 'attempt', attemptEpoch: 1, frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(active), frozenActiveSlotSetHash: active.snapshotHash, compositeAssessment: { productKind: 'ASSESSMENT_BUNDLE' } }
  const read = (dob: typeof demographic | null = demographic) => loadBundleScaleStartContext(db as never, parent, 'scale-item', 'unknown_scale', '1.0.0', dob)
  const rewrite = () => { row.collectionFactsEncrypted = encryptUnifiedRuntimePayload(formFacts()) }
  const runtime: any = { schemaVersion: 2, instrumentKey: 'unknown_scale', instrumentVersion: '1.0.0', sourceDefinitionHash: 'c'.repeat(64), runtimePolicyHash: policyHash,
    compiledRuntime: { compiledRuntimeHash: 'd'.repeat(64) },
    compiledPolicy: { applicability: { schemaVersion: 1, policyVersion: 'synthetic-1', respondentTypes: ['SELF'], subject: { ageMonths: { minInclusive: 216 } }, assessmentContexts: [scene], requiredContextKeys: ['birthYearMonth'] } } }
  const admit = async (bundleContext: Awaited<ReturnType<typeof read>>, dob: typeof demographic | null = demographic) => createScaleAdmissionForRuntime({ db: db as never, attemptEpoch: 1,
    scale: { id: 'scale', code: 'unknown_scale', name: 'Synthetic scale', instrumentVersion: '1.0.0', instrumentClass: 'STANDARD', status: 'PUBLISHED' }, principal: { userId: 'synthetic-student', questionnaireSessionId: null, recoveryTokenHash: null },
    parent: { kind: 'composite', parentId: 'attempt', slotKey: 'scale-item:SCALE', sourceDefinitionHash: 'c'.repeat(64), compiledRuntimeHash: 'd'.repeat(64) }, runtime, requestedMode: 'COMPOSITE',
    contextSnapshotHash: canonicalHash(demographic), contextValues: dob, contextFrozenAt: at, ...(bundleContext ? { bundleContext } : {}) })
  return { raw, p, frozen, bindings, instance, parent, db, values, row, read, rewrite, runtime, admit }
}

beforeEach(() => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  deployment.mockReset().mockResolvedValue({ kind: 'MANAGED_V2', allowNewStarts: true, runtimePolicy: { runtimePolicyHash: policyHash }, deployment: { revision: 1, policyHash: 'e'.repeat(64), policy: {} } })
})
afterEach(() => vi.unstubAllEnvs())

describe('source-owned course context into Scale START (synthetic persistence)', () => {
  it('carries schema3 slot context through the frozen package into leaf START', async () => {
    const f = fixture(3), context = await f.read(), admission = await f.admit(context)
    expect(f.frozen.declarativePackage?.schemaVersion).toBe(3)
    expect(f.frozen.bundleSnapshot.bundleDefinition.engine.version).toBe('1.2.0')
    expect(parseFrozenUnitAdmissionV2(admission).contextValues).toMatchObject({ ...demographic, bundleContext: { assessmentContext: scene, facts: context!.facts } })
    expect(admission.governance.status).toBe('READY')
  })
  it('reads accepted frozen facts, separates COMPOSITE deployment, and freezes the exact context with real DOB eligibility', async () => {
    const f = fixture(), context = await f.read(), admission = await f.admit(context)
    expect(deployment).toHaveBeenCalledWith(expect.objectContaining({ requestedMode: 'COMPOSITE' }))
    expect(admission.governance.status).toBe('READY')
    expect(parseFrozenUnitAdmissionV2(admission).contextValues).toMatchObject({ ...demographic, bundleContext: { assessmentContext: scene, facts: context!.facts } })
    f.values.course_id = 'later-course'; f.rewrite()
    expect((parseFrozenUnitAdmissionV2(admission).contextValues as any).bundleContext.facts.facts.find((x: any) => x.contextKey === 'course_id').value.value).toBe('synthetic-course')
    expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledWith({ where: { compositeAttemptId: 'attempt', attemptEpoch: 1, slotKey: { in: ['form-section:background'] } } })
  })
  it('does not start on absent FINAL facts, wrong epoch, or a mismatched frozen definition', async () => {
    for (const mutate of [(f: ReturnType<typeof fixture>) => f.db.assessmentUnitSnapshot.findMany.mockResolvedValue([]), (f: ReturnType<typeof fixture>) => { f.row.attemptEpoch = 2 }, (f: ReturnType<typeof fixture>) => { f.row.sourceDefinitionHash = 'f'.repeat(64) }]) {
      const f = fixture(); mutate(f)
      await expect(f.read()).rejects.toThrow()
    }
    expect(deployment).not.toHaveBeenCalled()
  })
  it('rejects missing, blank and nonmatching course facts instead of defaulting or widening the scene', async () => {
    for (const [key, value] of [['course_id', ''], ['course_id', '   '], ['course_mode', 'offline'], ['learning_stage', ''], ['university_student', 'false']]) {
      const f = fixture(); f.values[key] = value; f.rewrite()
      await expect(f.read()).rejects.toThrow()
    }
    expect(deployment).not.toHaveBeenCalled()
  })
  it('collects an explicitly referenced DOB through the existing context field and never substitutes adult status', async () => {
    const f = fixture()
    expect(bundleBirthYearMonthForm(f.p.manifest.definition, 'birth_year_month')).toEqual({ formType: 'year_month', formLabel: '出生年月', contextKey: 'birthYearMonth' })
    expect(bundleBirthYearMonthForm(f.p.manifest.definition, 'university_student')).toBeUndefined()
    await expect(f.read(null)).rejects.toThrow('出生年月')
    const young = { birthYearMonth: '2012-11', ageMonthsAtFreeze: 168, ageYearsAtFreeze: 14 }
    f.values.birth_year_month = young.birthYearMonth; f.rewrite()
    const context = await f.read(young)
    const underage = await f.admit(context, young) as ReturnType<typeof parseFrozenUnitAdmissionV2>
    expect(underage.governance.status).toBe('HOLD')
    expect(underage.scalePolicy!.eligibility.reasons.map(r => r.code)).toContain('SUBJECT_AGE_BELOW_MIN')
  })
  it('keeps slots without the optional mapping and non-Bundle START on their original behavior', async () => {
    const f = fixture()
    const raw = structuredClone(f.raw); delete raw.manifest.definition.slots[0].admissionContext
    const frozen = freezeBundleProductionDefinition(packageEntry(parseDeclarativePackage(raw)), { frozenAt: at, sourceReference: 'synthetic-old' })
    Object.assign(f.instance, { definitionEncrypted: encryptCognitivePayload(frozen), definitionHash: frozen.contentHash })
    expect(await f.read()).toBeUndefined()
    expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
    const old = await f.admit(undefined) as ReturnType<typeof parseFrozenUnitAdmissionV2>
    expect(old.governance.status).toBe('HOLD')
    expect(old.scalePolicy!.eligibility.reasons.map(r => r.code)).toContain('ASSESSMENT_CONTEXT_NOT_ALLOWED')
    expect(old.contextValues).toEqual(demographic)
    f.parent.compositeAssessment.productKind = 'QUESTIONNAIRE'; f.db.bundleInstance.findFirst.mockClear()
    expect(await f.read()).toBeUndefined(); expect(f.db.bundleInstance.findFirst).not.toHaveBeenCalled()
  })
  it('rejects undeclared, optional or wrongly typed source context references', () => {
    const f = fixture()
    for (const requirement of [{ contextKey: 'missing' }, { contextKey: 'course_mode', allowedValues: [true] }]) {
      const d = structuredClone(f.p.manifest.definition); d.slots[0].admissionContext!.requirements = [requirement]
      expect(() => validateBundleStartContextMappings(d, f.frozen.contextDefinition)).toThrow()
    }
    const c = structuredClone(f.frozen.contextDefinition)!; c.fields[0].required = false
    expect(() => validateBundleStartContextMappings(f.p.manifest.definition, c)).toThrow()
  })
  it('preserves legacy V1 admission and refuses to silently discard a newly declared context on V1', async () => {
    const f = fixture(), context = await f.read(); f.runtime.schemaVersion = 1
    expect((await f.admit(undefined)).governance.status).toBe('READY')
    await expect(f.admit(context)).rejects.toThrow('版本化准入策略')
    expect(deployment).not.toHaveBeenCalled()
  })
})
