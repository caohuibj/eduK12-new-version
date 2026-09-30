import { z } from 'zod'

export const resultAudiences = ['RESPONDENT', 'SUBJECT', 'TEACHER', 'PARENT', 'PROFESSIONAL', 'ORGANIZATION', 'RESEARCH'] as const
export type ResultAudience = typeof resultAudiences[number]
const audiencePolicy = z.object({
  mode: z.enum(['NONE', 'COMPLETION_ONLY', 'INDIVIDUAL_SUMMARY', 'CLASS_AGGREGATE', 'ORGANIZATION_AGGREGATE', 'AGGREGATE_ONLY', 'DELAYED_AGGREGATE', 'RESEARCH_PROJECTION']),
  metricKeys: z.array(z.string().trim().min(1)).max(100),
  longitudinalMetricKeys: z.array(z.string().trim().min(1)).max(100),
  delaySeconds: z.number().int().min(1).max(31536000).optional(),
}).strict()
const contractSchema = z.object({
  schemaVersion: z.literal(1), policyKey: z.string().trim().min(1),
  minimumRespondents: z.number().int().min(3).nullable(),
  audiences: z.object({ RESPONDENT: audiencePolicy, SUBJECT: audiencePolicy, TEACHER: audiencePolicy,
    PARENT: audiencePolicy, PROFESSIONAL: audiencePolicy, ORGANIZATION: audiencePolicy, RESEARCH: audiencePolicy }).strict(),
}).strict()
export type ResultDisclosureContractV1 = z.infer<typeof contractSchema>

/** One content-owned contract. There are no role defaults or client-selected audiences. */
export function validateResultDisclosureContract(input: unknown): ResultDisclosureContractV1 {
  const contract = contractSchema.parse(input)
  for (const audience of resultAudiences) {
    const rule = contract.audiences[audience]
    if (new Set(rule.metricKeys).size !== rule.metricKeys.length || new Set(rule.longitudinalMetricKeys).size !== rule.longitudinalMetricKeys.length) throw new Error('duplicate disclosure metric')
    if (rule.longitudinalMetricKeys.some(key => !rule.metricKeys.includes(key))) throw new Error('longitudinal cannot widen immediate metric disclosure')
    if (['NONE', 'COMPLETION_ONLY'].includes(rule.mode) && (rule.metricKeys.length || rule.longitudinalMetricKeys.length)) throw new Error('completion-only disclosure cannot contain metrics')
    if (rule.mode.includes('AGGREGATE') && contract.minimumRespondents === null) throw new Error('aggregate requires a content minimum-N floor')
    if ((rule.mode === 'DELAYED_AGGREGATE') !== (rule.delaySeconds !== undefined)) throw new Error('only delayed aggregate requires delaySeconds')
    if (audience !== 'RESEARCH' && rule.mode === 'RESEARCH_PROJECTION') throw new Error('research projection requires research authority')
    if (audience === 'ORGANIZATION' && rule.mode === 'INDIVIDUAL_SUMMARY') throw new Error('organization delivery authority cannot grant individual disclosure')
    if (rule.longitudinalMetricKeys.length && rule.mode !== 'INDIVIDUAL_SUMMARY') throw new Error('participant longitudinal requires individual summary authority')
  }
  return contract
}

/** Narrow numeric summaries of an existing projection. No calculation or canonical mutation. */
export function projectAudienceResult(input: {
  contract: ResultDisclosureContractV1; audience: ResultAudience; metrics: Record<string, unknown>
  respondentCount?: number; aggregateReleasedAt?: Date; now?: Date
}) {
  const contract = validateResultDisclosureContract(input.contract)
  const rule = contract.audiences[input.audience]
  if (rule.mode === 'NONE') return { schemaVersion: 1 as const, mode: 'NONE' as const, state: 'WITHHELD' as const }
  if (rule.mode === 'COMPLETION_ONLY') return { schemaVersion: 1 as const, mode: rule.mode, state: 'COMPLETED' as const }
  if (rule.mode.includes('AGGREGATE')) {
    if (!Number.isInteger(input.respondentCount) || input.respondentCount! < contract.minimumRespondents!) return { schemaVersion: 1 as const, mode: rule.mode, state: 'WITHHELD' as const }
    if (rule.mode === 'DELAYED_AGGREGATE' && (!input.aggregateReleasedAt || (input.now ?? new Date()).getTime() < input.aggregateReleasedAt.getTime() + rule.delaySeconds! * 1000)) return { schemaVersion: 1 as const, mode: rule.mode, state: 'WITHHELD' as const }
  }
  const metrics: Record<string, number | null> = {}
  for (const key of rule.metricKeys) { const value = input.metrics[key]; metrics[key] = typeof value === 'number' && Number.isFinite(value) ? value : null }
  return { schemaVersion: 1 as const, mode: rule.mode, state: 'READY' as const, metrics }
}
