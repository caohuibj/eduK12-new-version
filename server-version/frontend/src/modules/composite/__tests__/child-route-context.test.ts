import { describe, expect, it } from 'vitest'
import type { CompositeCurrentItem } from '../types'
import { compositeParentAttemptPath, resolveCompositeChildRouteContext } from '../child-route-context'

const cognitiveItem: CompositeCurrentItem = {
  id: 'cognitive-slot-1',
  type: 'COGNITIVE',
  position: 1,
  required: true,
  cognitiveSession: {
    sessionId: 'cognitive-session-1',
  } as CompositeCurrentItem['cognitiveSession'],
}

const situationalItem: CompositeCurrentItem = {
  id: 'situational-slot-1',
  type: 'SITUATIONAL',
  position: 2,
  required: true,
  situationalAttemptId: 'situational-attempt-1',
}

describe('Composite child route context', () => {
  it('builds an authenticated Cognitive target from the existing frozen session id', () => {
    const result = resolveCompositeChildRouteContext({
      publicMode: false,
      parentAttemptId: 'parent-1',
      item: cognitiveItem,
    })

    expect(result).toEqual({
      ok: true,
      context: {
        kind: 'COGNITIVE',
        parentAttemptId: 'parent-1',
        parentReturnTo: '/student/composite/attempts/parent-1',
        childAttemptId: 'cognitive-session-1',
        target: '/student/cognitive/sessions/cognitive-session-1?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fparent-1',
      },
    })
  })

  it('keeps the assigned organization task return path through child runners', () => {
    const result = resolveCompositeChildRouteContext({ publicMode: false, relationalMode: true, organizationTask: true, parentAttemptId: 'run-parent', item: cognitiveItem })
    expect(result).toMatchObject({ ok: true, context: { parentReturnTo: '/relational/attempts/run-parent?returnTo=%2Fmy-assessments' } })
  })

  it('builds relational child targets without creating a second runtime', () => {
    const cognitive = resolveCompositeChildRouteContext({
      publicMode: false,
      relationalMode: true,
      parentAttemptId: 'rel-parent',
      item: cognitiveItem,
    })
    expect(cognitive).toMatchObject({
      ok: true,
      context: {
        parentReturnTo: '/relational/attempts/rel-parent',
        target: '/relational/cognitive/sessions/cognitive-session-1?returnTo=%2Frelational%2Fattempts%2Frel-parent',
      },
    })

    const situational = resolveCompositeChildRouteContext({
      publicMode: false,
      relationalMode: true,
      parentAttemptId: 'rel-parent',
      item: situationalItem,
    })
    expect(situational).toMatchObject({
      ok: true,
      context: {
        parentReturnTo: '/relational/attempts/rel-parent',
        childAttemptId: 'situational-attempt-1',
      },
    })
    if (situational.ok) expect(situational.context.target).toContain('/relational/composite/situational/situational-attempt-1?')
  })

  it('keeps public Cognitive return context and existing session identity', () => {
    const result = resolveCompositeChildRouteContext({
      publicMode: true,
      parentAttemptId: 'parent public',
      item: cognitiveItem,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.context.childAttemptId).toBe('cognitive-session-1')
    expect(result.context.parentReturnTo).toBe('/public/composite/attempts/parent%20public')
    expect(result.context.target).toBe('/public/cognitive/sessions/cognitive-session-1?public=1&returnTo=%2Fpublic%2Fcomposite%2Fattempts%2Fparent%2520public')
  })

  it('builds embedded Situational context from the existing child attempt and parent slot ids', () => {
    const result = resolveCompositeChildRouteContext({
      publicMode: false,
      parentAttemptId: 'parent-1',
      item: situationalItem,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.context.childAttemptId).toBe('situational-attempt-1')
    expect(result.context.target).toBe('/student/composite/situational/situational-attempt-1?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fparent-1&compositeAttemptId=parent-1&compositeItemId=situational-slot-1')
  })

  it('fails closed when the parent or frozen child identity is missing', () => {
    expect(resolveCompositeChildRouteContext({
      publicMode: false,
      parentAttemptId: '',
      item: cognitiveItem,
    })).toMatchObject({ ok: false })

    expect(resolveCompositeChildRouteContext({
      publicMode: false,
      parentAttemptId: 'parent-1',
      item: { ...cognitiveItem, cognitiveSession: undefined },
    })).toEqual({ ok: false, message: '认知测评槽位尚未准备完成，请刷新综合测评' })

    expect(resolveCompositeChildRouteContext({
      publicMode: false,
      parentAttemptId: 'parent-1',
      item: { ...situationalItem, situationalAttemptId: undefined },
    })).toEqual({ ok: false, message: '情境化测评槽位尚未准备完成，请刷新综合测评' })
  })

  it('encodes the parent attempt path once at the path boundary', () => {
    expect(compositeParentAttemptPath(false, 'parent / 1')).toBe('/student/composite/attempts/parent%20%2F%201')
  })
})
