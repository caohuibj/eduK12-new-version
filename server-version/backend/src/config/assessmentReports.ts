import { configuredInteger } from '../services/boundedAdmissionGate'

export const assessmentReportConfig = (env: NodeJS.ProcessEnv = process.env) => {
  const enabled = env.ASSESSMENT_REPORT_ASYNC_ENABLED ?? 'false'
  if (!['true', 'false'].includes(enabled)) throw new Error('ASSESSMENT_REPORT_ASYNC_ENABLED must be true or false')
  const whole = env.ASSESSMENT_WHOLE_SUBMIT_ENABLED ?? 'false'
  if (!['true', 'false'].includes(whole)) throw new Error('ASSESSMENT_WHOLE_SUBMIT_ENABLED must be true or false')
  const integer = (key: string, fallback: number) => {
    if (env === process.env) return configuredInteger(key, fallback)
    const value = Number(env[key] ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`)
    return value
  }
  return {
    enabled: enabled === 'true',
    wholeSubmitEnabled: whole === 'true',
    courseIds: new Set((env.ASSESSMENT_REPORT_ASYNC_COURSE_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)),
    maxPending: integer('ASSESSMENT_REPORT_MAX_PENDING', 200),
    workerConcurrency: integer('ASSESSMENT_REPORT_WORKER_CONCURRENCY', 1),
    pollMs: integer('ASSESSMENT_REPORT_POLL_MS', 500),
    leaseMs: integer('ASSESSMENT_REPORT_LEASE_MS', 30_000),
    maxAttempts: integer('ASSESSMENT_REPORT_MAX_ATTEMPTS', 8),
    maxReportBytes: integer('ASSESSMENT_REPORT_MAX_BYTES', 2 * 1024 * 1024),
  }
}

export const acceptsAsyncCompositeReport = (parent: {
  runtimeGeneration?: string | null
  deliveryMode?: string
  assignmentRef?: string | null
  deliveryCourseId?: string | null
  compositeAssessment?: { productKind?: string; reportPackageKey?: string | null; analysisProtocolKey?: string | null }
}, env: NodeJS.ProcessEnv = process.env): boolean => {
  const config = assessmentReportConfig(env)
  return config.enabled && parent.runtimeGeneration === 'UNIFIED_V1'
    && parent.deliveryMode === 'FINAL_ONLY' && !parent.assignmentRef
    && parent.compositeAssessment?.productKind === 'QUESTIONNAIRE'
    && !parent.compositeAssessment.reportPackageKey && !parent.compositeAssessment.analysisProtocolKey
    && (config.courseIds.size === 0 || Boolean(parent.deliveryCourseId && config.courseIds.has(parent.deliveryCourseId)))
}
