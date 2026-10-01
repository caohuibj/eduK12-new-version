export interface SituationalRunnerRouteContextInput {
  pathname: string
  searchParams: URLSearchParams
  attemptId?: string
}

export interface SituationalRunnerRouteContext {
  publicMode: boolean
  embedded: boolean
  compositeAttemptId: string
  compositeItemId: string
  returnTo: string
  completionPath: string
  recoveryStorageKey: string | null
}

/**
 * Route/access context only. Traversal, answers, draft state and FINAL identity
 * deliberately stay outside this helper so a parent/public route cannot mutate
 * scientific runtime state.
 */
export const resolveSituationalRunnerRouteContext = ({
  pathname,
  searchParams,
  attemptId,
}: SituationalRunnerRouteContextInput): SituationalRunnerRouteContext => {
  const publicMode = pathname.startsWith('/public/composite/')
  const relationalMode = pathname.startsWith('/relational/composite/')
  const embedded = Boolean(attemptId) && !pathname.startsWith('/teacher/situational/attempts/')
  const compositeAttemptId = searchParams.get('compositeAttemptId') || ''
  const compositeItemId = searchParams.get('compositeItemId') || ''
  const candidateReturnTo = searchParams.get('returnTo') || ''
  const allowedReturnPrefix = publicMode
    ? '/public/composite/attempts/'
    : relationalMode
      ? '/relational/attempts/'
      : '/student/composite/attempts/'
  const returnTo = candidateReturnTo.startsWith(allowedReturnPrefix) ? candidateReturnTo : ''
  const namespace = publicMode ? '/public' : relationalMode ? '/relational' : '/student'
  const completionPath = returnTo || (
    embedded && compositeAttemptId
      ? `${namespace}/composite/attempts/${compositeAttemptId}`
      : ''
  )

  return {
    publicMode,
    embedded,
    compositeAttemptId,
    compositeItemId,
    returnTo,
    completionPath,
    recoveryStorageKey: publicMode && compositeAttemptId
      ? `composite:recovery:attempt:${compositeAttemptId}`
      : null,
  }
}
