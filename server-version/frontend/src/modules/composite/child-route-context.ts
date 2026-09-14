import type { CompositeCurrentItem } from './types'

export type CompositeChildRouteContext = {
  kind: 'COGNITIVE' | 'SITUATIONAL'
  parentAttemptId: string
  parentReturnTo: string
  childAttemptId: string
  target: string
}

export type CompositeChildRouteContextResult =
  | { ok: true; context: CompositeChildRouteContext }
  | { ok: false; message: string }

export const compositeParentAttemptPath = (publicMode: boolean, parentAttemptId: string) => (
  `${publicMode ? '/public' : '/student'}/composite/attempts/${encodeURIComponent(parentAttemptId)}`
)

/**
 * Resolve navigation only from identities already frozen into the parent read.
 * This helper never starts, resumes, submits or mutates a child. The child
 * runner owns resume/FINAL and returns to the same parent attempt path.
 */
export const resolveCompositeChildRouteContext = ({
  publicMode,
  parentAttemptId,
  item,
}: {
  publicMode: boolean
  parentAttemptId: string
  item: CompositeCurrentItem
}): CompositeChildRouteContextResult => {
  if (!parentAttemptId) {
    return { ok: false, message: '综合测评父级记录缺失，请刷新后重试' }
  }

  const parentReturnTo = compositeParentAttemptPath(publicMode, parentAttemptId)

  if (item.type === 'COGNITIVE') {
    const sessionId = item.cognitiveSession?.sessionId || ''
    if (!sessionId) {
      return { ok: false, message: '认知测评槽位尚未准备完成，请刷新综合测评' }
    }
    const query = new URLSearchParams()
    if (publicMode) query.set('public', '1')
    query.set('returnTo', parentReturnTo)
    return {
      ok: true,
      context: {
        kind: 'COGNITIVE',
        parentAttemptId,
        parentReturnTo,
        childAttemptId: sessionId,
        target: `${publicMode ? '/public' : '/student'}/cognitive/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
      },
    }
  }

  if (item.type === 'SITUATIONAL') {
    const childAttemptId = item.situationalAttemptId || ''
    if (!childAttemptId) {
      return { ok: false, message: '情境化测评槽位尚未准备完成，请刷新综合测评' }
    }
    const query = new URLSearchParams({
      returnTo: parentReturnTo,
      compositeAttemptId: parentAttemptId,
      compositeItemId: item.id,
    })
    return {
      ok: true,
      context: {
        kind: 'SITUATIONAL',
        parentAttemptId,
        parentReturnTo,
        childAttemptId,
        target: `${publicMode ? '/public' : '/student'}/composite/situational/${encodeURIComponent(childAttemptId)}?${query.toString()}`,
      },
    }
  }

  return { ok: false, message: '当前综合测评单元不是可跳转的子测评' }
}
