import { RequestHandler } from 'express'
import { instrumentError } from '../utils/response'
import { prisma } from '../config/database'

/**
 * Legacy answer endpoints remain routable for clients that need to discover
 * the migration, but they must never mutate a FINAL_ONLY attempt.
 */
export const legacyWriteDisabled: RequestHandler = (_req, res, _next) =>
  instrumentError(
    res,
    'LEGACY_WRITE_DISABLED',
    '旧的逐题/批量写入接口已停用，请重启测评后使用最终提交',
    410,
  )

/**
 * UNIFIED_V1 aggregate completion guard. The aggregate finalize is an
 * authoritative UNIFIED_V1 write driven by the closed slot set (snapshots +
 * CAS), NOT a legacy per-item mutation. Allow the /complete route only for
 * UNIFIED_V1 assessments; keep the 410 for every legacy (non-UNIFIED) attempt.
 */
export const unifiedCompletionGuard: RequestHandler = async (req, res, next) => {
  try {
    const id = (req.params as { id?: string }).id
    if (!id) return instrumentError(res, 'LEGACY_WRITE_DISABLED', '旧的写入接口已停用', 410)
    const row = await prisma.questionnaireAssessment.findUnique({
      where: { id },
      select: { runtimeGeneration: true },
    })
    if (row?.runtimeGeneration === 'UNIFIED_V1') return next()
    return instrumentError(res, 'LEGACY_WRITE_DISABLED', '旧的逐题/批量写入接口已停用，请重启测评后使用最终提交', 410)
  } catch (err) {
    // Infrastructure failure (pool exhaustion, timeout, connection reset) must
    // not be reported as the permanent business state LEGACY_WRITE_DISABLED:
    // that would suppress retries and hide outages. Delegate to the central
    // error handler so it classifies as 5xx.
    return next(err)
  }
}
