import { logger } from '../../utils/logger'

/** Shared School #667 inline current-unit delivery. Opt-in additive field on
 * START; projection failure returns the committed START payload unchanged. */
export type InlineCurrentUnitRequest = {
  query?: { view?: unknown; delivery?: unknown }
  body?: { view?: unknown; delivery?: unknown } | null
}

type CurrentUnit = Awaited<ReturnType<typeof import('./composite.service').getAttemptState>>

export const requestedInlineCurrentUnit = (req: InlineCurrentUnitRequest): boolean =>
  req.query?.view === 'current-unit'
  || req.query?.delivery === 'inline'
  || req.body?.delivery === 'inline'
  || req.body?.view === 'current-unit'

const fallbackReason = (error: { status?: unknown; code?: unknown }): string => {
  if (error.status === 403 || error.code === 'FORBIDDEN') return 'ACCESS_FORBIDDEN'
  if (error.status === 404) return 'ATTEMPT_NOT_FOUND'
  if (error.status === 409) return 'STATE_CONFLICT'
  if (error.code === 'ETIMEDOUT') return 'NETWORK_TIMEOUT'
  return 'PROJECTION_ERROR'
}

export const attachInlineCurrentUnit = async <T extends object>(input: {
  requested: boolean
  started: T
  attemptId?: string | null
  actorUserId: string
  accountDomain?: string
  campusAuthority?: boolean
}): Promise<T | (T & { currentUnit: CurrentUnit })> => {
  if (!input.requested || !input.attemptId) return input.started
  const startMs = Date.now()
  try {
    if (input.campusAuthority && input.accountDomain === 'SCHOOL') {
      const { checkCampusCompositeAccessAuthority } = await import('../campus/campus-composite-authority')
      const allowed = await checkCampusCompositeAccessAuthority({
        attemptId: input.attemptId,
        userId: input.actorUserId,
      })
      if (!allowed) {
        logger.info('assessment-run inline delivery', { phase: 'inline_delivery', outcome: 'fallback', reason: 'CAMPUS_AUTHORITY_DENIED' })
        return input.started
      }
    }
    const { getAttemptState } = await import('./composite.service')
    const currentUnit = await getAttemptState(
      input.attemptId,
      { userId: input.actorUserId },
      undefined,
      'current-unit',
    )
    logger.info('assessment-run inline delivery', {
      phase: 'inline_delivery',
      outcome: 'success',
      wallTimeMs: Date.now() - startMs,
    })
    return { ...input.started, currentUnit }
  } catch (projectionErr: unknown) {
    const error = projectionErr as { status?: unknown; code?: unknown }
    logger.warn('assessment-run inline delivery', {
      phase: 'inline_delivery',
      outcome: 'fallback',
      reason: fallbackReason(error),
      wallTimeMs: Date.now() - startMs,
    })
    return input.started
  }
}
