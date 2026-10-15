/** Advisory pacing only. Answers, task ownership and recovery remain in PostgreSQL. */
export type ReportFeedbackProfile = 'FAST_START' | 'QUEUED'
const fastStarts = new Map<string, { submissionId: string; expiresAt: number }>()
const MAX_HINTS = 128
const FAST_START_MS = 5000
export const readWholeReportFeedbackHint = (attemptId: string, submissionId: string, now = performance.now()) => {
  const hint = fastStarts.get(attemptId)
  if (hint && hint.expiresAt <= now) fastStarts.delete(attemptId)
  const fast = hint && hint.expiresAt > now && hint.submissionId === submissionId
  return { profile: (fast ? 'FAST_START' : 'QUEUED') as ReportFeedbackProfile, retryAfterSeconds: fast ? 0.25 : 2 }
}
export const rememberWholeReportFeedbackHint = (attemptId: string, submissionId: string, queueDepth?: number, now = performance.now()) => {
  // Only the first durable task in an otherwise empty queue receives fast probes.
  if (queueDepth === 1) {
    for (const [key, hint] of fastStarts) if (hint.expiresAt <= now) fastStarts.delete(key)
    if (!fastStarts.has(attemptId) && fastStarts.size >= MAX_HINTS) fastStarts.delete(fastStarts.keys().next().value!)
    fastStarts.set(attemptId, { submissionId, expiresAt: now + FAST_START_MS })
  }
  return readWholeReportFeedbackHint(attemptId, submissionId, now)
}
