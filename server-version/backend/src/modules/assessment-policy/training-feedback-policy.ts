import { z } from 'zod'

/** Training participant timing only. Authorization, content projection and
 * report generation remain separate. Not yet wired into publication/runtime. */
const policySchema = z.discriminatedUnion('mode', [
  z.object({ schemaVersion: z.literal(1), mode: z.literal('IMMEDIATE') }).strict(),
  z.object({ schemaVersion: z.literal(1), mode: z.literal('SCHEDULED'),
    releaseAt: z.string().datetime({ offset: true }),
  }).strict(),
])
export type TrainingFeedbackPolicy = z.infer<typeof policySchema>
export function parseTrainingFeedbackPolicy(raw: unknown): TrainingFeedbackPolicy {
  // Absence preserves the existing complete-then-view contract.
  if (raw == null) return { schemaVersion: 1, mode: 'IMMEDIATE' }
  const policy = policySchema.parse(raw)
  return policy.mode === 'SCHEDULED'
    ? { ...policy, releaseAt: new Date(policy.releaseAt).toISOString() }
    : policy
}
export type TrainingFeedbackAvailability =
  | 'WAITING_SUBMISSION'
  | 'REPORT_PROCESSING'
  | 'GENERATED_NOT_RELEASED'
  | 'AVAILABLE'

/** Pure evaluation over already loaded trusted context: no query, job, lock,
 * scoring or polling. The caller must authenticate and authorize first. */
export function trainingFeedbackAvailability(input: {
  policy: unknown; completed: boolean; reportReady: boolean; now: Date
}): { state: TrainingFeedbackAvailability; releaseAt: string | null } {
  const policy = parseTrainingFeedbackPolicy(input.policy)
  if (!Number.isFinite(input.now.getTime())) throw new Error('Invalid server time')
  const releaseAt = policy.mode === 'SCHEDULED' ? policy.releaseAt : null
  if (!input.completed) return { state: 'WAITING_SUBMISSION', releaseAt }
  if (!input.reportReady) return { state: 'REPORT_PROCESSING', releaseAt }
  if (releaseAt !== null && input.now.getTime() < Date.parse(releaseAt)) {
    return { state: 'GENERATED_NOT_RELEASED', releaseAt }
  }
  return { state: 'AVAILABLE', releaseAt }
}
