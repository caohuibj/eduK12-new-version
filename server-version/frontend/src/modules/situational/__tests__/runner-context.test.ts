import { describe, expect, it } from 'vitest'
import { resolveSituationalRunnerRouteContext } from '../runner-context'

const params = (value: string) => new URLSearchParams(value)

describe('situational runner route context', () => {
  it('keeps authenticated embedded parent context separate from runtime state', () => {
    expect(resolveSituationalRunnerRouteContext({
      pathname: '/student/composite/situational/child-1',
      searchParams: params('compositeAttemptId=parent-1&compositeItemId=item-1&returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fparent-1'),
      attemptId: 'child-1',
    })).toEqual({
      publicMode: false,
      embedded: true,
      compositeAttemptId: 'parent-1',
      compositeItemId: 'item-1',
      returnTo: '/student/composite/attempts/parent-1',
      completionPath: '/student/composite/attempts/parent-1',
      recoveryStorageKey: null,
    })
  })

  it('preserves relational embedded return context without public recovery state', () => {
    expect(resolveSituationalRunnerRouteContext({
      pathname: '/relational/composite/situational/child-r',
      searchParams: params('compositeAttemptId=parent-r&compositeItemId=item-r&returnTo=%2Frelational%2Fattempts%2Fparent-r'),
      attemptId: 'child-r',
    })).toEqual({
      publicMode: false,
      embedded: true,
      compositeAttemptId: 'parent-r',
      compositeItemId: 'item-r',
      returnTo: '/relational/attempts/parent-r',
      completionPath: '/relational/attempts/parent-r',
      recoveryStorageKey: null,
    })
  })

  it('uses public recovery context and rejects a cross-surface returnTo', () => {
    expect(resolveSituationalRunnerRouteContext({
      pathname: '/public/composite/situational/child-2',
      searchParams: params('compositeAttemptId=parent-2&compositeItemId=item-2&returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fparent-2'),
      attemptId: 'child-2',
    })).toEqual({
      publicMode: true,
      embedded: true,
      compositeAttemptId: 'parent-2',
      compositeItemId: 'item-2',
      returnTo: '',
      completionPath: '/public/composite/attempts/parent-2',
      recoveryStorageKey: 'composite:recovery:attempt:parent-2',
    })
  })

  it('does not invent parent context for standalone routes', () => {
    expect(resolveSituationalRunnerRouteContext({
      pathname: '/student/situational/pilot',
      searchParams: params(''),
    })).toMatchObject({
      publicMode: false,
      embedded: false,
      completionPath: '',
      recoveryStorageKey: null,
    })
  })
})
