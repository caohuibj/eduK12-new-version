import { parseDeclarativePackage, type DeclarativePackage } from '../assessment-bundle/onboarding/contract'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { createProductBundleAnalysisEngineRegistry } from '../assessment-bundle/bootstrap'
import { validateAssessmentBundleCatalog, validateAssessmentBundleDefinition } from '../assessment-bundle/definition'
import { parseBundleContextDefinition, hashBundleContextDefinition, type BundleContextDefinitionV1 } from '../assessment-bundle/context'
import { buildFrozenAssessmentBundleSnapshot, validateFrozenAssessmentBundleSnapshot } from '../assessment-bundle/snapshot'
import { hashMentalHealthRuleSet, validateMentalHealthRuleSet, type MentalHealthRuleSetV1 } from '../assessment-bundle/engines/mental-health-rule-v1'
import type { AssessmentBundleDefinitionV1, FrozenAssessmentBundleSnapshotV3 } from '../assessment-bundle/types'

const exact = z.string().regex(/^\d+\.\d+\.\d+$/)
const hash = z.string().regex(/^[0-9a-f]{64}$/)
export const bundleReportDefinitionSchema = z.object({
  key: z.string().min(1), version: exact, title: z.string().min(1),
  sections: z.object({
    summary: z.string().min(1), quality: z.string().min(1),
    evidence: z.string().min(1), limitations: z.string().min(1),
  }).strict(),
}).strict()
export type BundleReportDefinition = z.infer<typeof bundleReportDefinitionSchema>

export interface BundleDefinitionEntry {
  declarativePackage?: DeclarativePackage
  definition: AssessmentBundleDefinitionV1
  contextDefinition: BundleContextDefinitionV1 | null
  ruleSet: MentalHealthRuleSetV1 | null
  reportDefinition: BundleReportDefinition
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const identity = (key: string, version: string) => {
  if (!key.trim()) throw new Error('BUNDLE_IDENTITY_REQUIRED')
  exact.parse(version)
  return JSON.stringify([key, version])
}

function validateEntry(input: BundleDefinitionEntry): BundleDefinitionEntry {
  const definition = validateAssessmentBundleDefinition(input.definition)
  const contextDefinition = input.contextDefinition ? parseBundleContextDefinition(input.contextDefinition) : null
  const ruleSet = input.ruleSet ? validateMentalHealthRuleSet(input.ruleSet) : null
  const reportDefinition = bundleReportDefinitionSchema.parse(input.reportDefinition)
  if (reportDefinition.key !== definition.reportDefinitionKey || reportDefinition.version !== definition.reportDefinitionVersion) {
    throw new Error('BUNDLE_REPORT_DEFINITION_MISMATCH')
  }
  createProductBundleAnalysisEngineRegistry().resolve(definition.engine.key, definition.engine.version)
  // The existing V3 validator verifies exact Context identity and rule-engine compatibility.
  buildFrozenAssessmentBundleSnapshot(definition, {
    contextDefinition,
    ruleSetRef: ruleSet ? { key: ruleSet.ruleSetKey, version: ruleSet.ruleSetVersion, hash: hashMentalHealthRuleSet(ruleSet) } : null,
  })
  const declarativePackage = input.declarativePackage ? parseDeclarativePackage(input.declarativePackage) : undefined
  if ((definition.engine.key === 'declarative-evidence-v1') !== Boolean(declarativePackage)) throw new Error('BUNDLE_DECLARATIVE_CONTENT_REQUIRED')
  if (declarativePackage && canonicalHash({ ...definition, status: 'DRAFT' }) !== canonicalHash(declarativePackage.manifest.definition)) throw new Error('BUNDLE_DECLARATIVE_DEFINITION_MISMATCH')
  return clone({ definition, contextDefinition, ruleSet, reportDefinition, ...(declarativePackage ? { declarativePackage } : {}) })
}

/** Definition provider only. A successful lookup is never resource authorization. */
export class BundleDefinitionProvider {
  private readonly entries = new Map<string, BundleDefinitionEntry>()
  constructor(entries: readonly BundleDefinitionEntry[]) {
    validateAssessmentBundleCatalog(entries.map(entry => entry.definition))
    for (const candidate of entries) {
      const entry = validateEntry(candidate)
      this.entries.set(identity(entry.definition.bundleKey, entry.definition.bundleVersion), entry)
    }
  }
  exact(key: string, version: string): BundleDefinitionEntry | null {
    const entry = this.entries.get(identity(key, version))
    return entry ? clone(entry) : null
  }
  list(): BundleDefinitionEntry[] {
    return [...this.entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => clone(entry))
  }
  /** Structural readiness only; usage rights, population and course authorization are still required. */
  publicationBlockers(key: string, version: string): string[] {
    const entry = this.exact(key, version)
    if (!entry) return ['BUNDLE_VERSION_UNKNOWN']
    const blockers: string[] = []
    if (entry.definition.status !== 'PUBLISHED') blockers.push('BUNDLE_NOT_PUBLISHED')
    if (entry.definition.category === 'observer' || entry.definition.respondentTypes.some(value => value !== 'SELF')) {
      blockers.push('OBSERVER_DELIVERY_REQUIRES_DEDICATED_PRODUCT')
    }
    const population = entry.definition.population
    if ((population.subjectMinAgeYears !== undefined || population.subjectMaxAgeYears !== undefined) &&
        !entry.contextDefinition?.fields.some(field => field.contextKey === 'subject_age_years' && field.required && field.valueType === 'number')) {
      blockers.push('AGE_POPULATION_REQUIRES_DECLARED_CONTEXT')
    }
    const forms = entry.definition.slots.filter(slot => slot.unitType === 'FORM')
    if (forms.length > 1 || forms.some(slot => slot.instrumentKey !== entry.contextDefinition?.contextDefinitionKey || slot.instrumentVersion !== entry.contextDefinition?.contextDefinitionVersion)) {
      blockers.push('FORM_SLOT_CONTEXT_IDENTITY_MISMATCH')
    }
    if (entry.definition.slots.some(slot => slot.unitType !== 'FORM' && !slot.required)) blockers.push('OPTIONAL_MEASUREMENT_DELIVERY_NOT_SUPPORTED')
    if (entry.definition.safetyCapability.productionTriggerEnabled) blockers.push('PRODUCTION_SAFETY_TRIGGER_NOT_ENABLED')
    return blockers
  }
}

export interface FrozenBundleProductionDefinitionV1 {
  declarativePackage?: DeclarativePackage
  schemaVersion: 1 | 2
  snapshotFamily: 'ASSESSMENT_BUNDLE'
  bundleSnapshot: FrozenAssessmentBundleSnapshotV3
  contextDefinition: BundleContextDefinitionV1 | null
  ruleSet: MentalHealthRuleSetV1 | null
  reportDefinition: BundleReportDefinition
  contentHash: string
  frozenAt: string
  source: { kind: 'CODE_CATALOG' | 'DECLARATIVE_PACKAGE'; reference: string }
  freezeHash: string
}
const contentFor = (value: Omit<FrozenBundleProductionDefinitionV1, 'freezeHash' | 'contentHash'>) => ({
  schemaVersion: value.schemaVersion, snapshotFamily: value.snapshotFamily,
  bundleSnapshot: value.bundleSnapshot, contextDefinition: value.contextDefinition,
  ruleSet: value.ruleSet, reportDefinition: value.reportDefinition,
  ...(value.declarativePackage ? { declarativePackage: value.declarativePackage } : {}),
})

/** Full definition freeze; the caller must authorize publication before persisting an instance. */
export function freezeBundleProductionDefinition(
  input: BundleDefinitionEntry,
  metadata: { frozenAt: string; sourceReference: string },
): FrozenBundleProductionDefinitionV1 {
  const entry = validateEntry(input)
  const bundleSnapshot = buildFrozenAssessmentBundleSnapshot(entry.definition, {
    contextDefinition: entry.contextDefinition,
    ruleSetRef: entry.ruleSet ? { key: entry.ruleSet.ruleSetKey, version: entry.ruleSet.ruleSetVersion, hash: hashMentalHealthRuleSet(entry.ruleSet) } : null,
  })
  const material = {
    schemaVersion: entry.declarativePackage ? 2 as const : 1 as const, snapshotFamily: 'ASSESSMENT_BUNDLE' as const,
    bundleSnapshot, contextDefinition: entry.contextDefinition, ruleSet: entry.ruleSet, reportDefinition: entry.reportDefinition,
    ...(entry.declarativePackage ? { declarativePackage: entry.declarativePackage } : {}),
    frozenAt: z.string().datetime().parse(metadata.frozenAt),
    source: { kind: entry.declarativePackage ? 'DECLARATIVE_PACKAGE' as const : 'CODE_CATALOG' as const, reference: z.string().min(1).parse(metadata.sourceReference) },
  }
  const frozen = { ...material, contentHash: canonicalHash(contentFor(material)) }
  return { ...frozen, freezeHash: canonicalHash(frozen) }
}

const frozenSchema = z.object({
  declarativePackage: z.unknown().optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]), snapshotFamily: z.literal('ASSESSMENT_BUNDLE'),
  bundleSnapshot: z.unknown().refine(value => value !== undefined),
  contextDefinition: z.unknown().refine(value => value !== undefined),
  ruleSet: z.unknown().refine(value => value !== undefined),
  reportDefinition: bundleReportDefinitionSchema, contentHash: hash,
  frozenAt: z.string().datetime(), source: z.object({ kind: z.enum(['CODE_CATALOG', 'DECLARATIVE_PACKAGE']), reference: z.string().min(1) }).strict(),
  freezeHash: hash,
}).strict()

/** Historical reads validate frozen bytes only; never consult the live catalog or release status. */
export function readFrozenBundleProductionDefinition(raw: unknown): FrozenBundleProductionDefinitionV1 {
  const value = frozenSchema.parse(raw)
  const bundleSnapshot = validateFrozenAssessmentBundleSnapshot(value.bundleSnapshot)
  const contextDefinition = value.contextDefinition == null ? null : parseBundleContextDefinition(value.contextDefinition)
  const ruleSet = value.ruleSet == null ? null : validateMentalHealthRuleSet(value.ruleSet as MentalHealthRuleSetV1)
  if (value.reportDefinition.key !== bundleSnapshot.reportDefinitionKey || value.reportDefinition.version !== bundleSnapshot.reportDefinitionVersion) {
    throw new Error('BUNDLE_REPORT_DEFINITION_MISMATCH')
  }
  if ((contextDefinition ? hashBundleContextDefinition(contextDefinition) : null) !== bundleSnapshot.contextDefinitionHash) {
    throw new Error('BUNDLE_CONTEXT_HASH_MISMATCH')
  }
  if (contextDefinition && (contextDefinition.contextDefinitionKey !== bundleSnapshot.bundleDefinition.contextDefinitionKey ||
      contextDefinition.contextDefinitionVersion !== bundleSnapshot.bundleDefinition.contextDefinitionVersion)) throw new Error('BUNDLE_CONTEXT_IDENTITY_MISMATCH')
  if ((ruleSet ? hashMentalHealthRuleSet(ruleSet) : null) !== (bundleSnapshot.ruleSetRef?.hash ?? null)) throw new Error('BUNDLE_RULE_HASH_MISMATCH')
  if (ruleSet && (ruleSet.ruleSetKey !== bundleSnapshot.ruleSetRef?.key || ruleSet.ruleSetVersion !== bundleSnapshot.ruleSetRef?.version)) throw new Error('BUNDLE_RULE_IDENTITY_MISMATCH')
  const declarativePackage = value.declarativePackage ? parseDeclarativePackage(value.declarativePackage) : undefined
  if ((bundleSnapshot.engine.key === 'declarative-evidence-v1') !== Boolean(declarativePackage)) throw new Error('BUNDLE_DECLARATIVE_CONTENT_REQUIRED')
  if (declarativePackage && canonicalHash({...bundleSnapshot.bundleDefinition,status:'DRAFT'}) !== canonicalHash(declarativePackage.manifest.definition)) throw new Error('BUNDLE_DECLARATIVE_DEFINITION_MISMATCH')
  if ((value.schemaVersion === 2) !== Boolean(declarativePackage) || (value.source.kind === 'DECLARATIVE_PACKAGE') !== Boolean(declarativePackage)) throw new Error('BUNDLE_FREEZE_VERSION_MISMATCH')
  const { declarativePackage: _rawPackage, ...baseValue } = value
  const { freezeHash, ...material } = { ...baseValue, bundleSnapshot, contextDefinition, ruleSet, ...(declarativePackage ? { declarativePackage } : {}) }
  if (canonicalHash(contentFor(material)) !== material.contentHash || canonicalHash(material) !== freezeHash) {
    throw new Error('BUNDLE_FREEZE_HASH_MISMATCH')
  }
  return clone({ ...material, freezeHash })
}
