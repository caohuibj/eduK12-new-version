import { describe, expect, it } from 'vitest'
import { resolveGitReleaseStates } from '../../modules/measurement-content/git-release-manifest'

describe('shared Git release lifecycle', () => {
  it('automatically supersedes an entire chain and leaves independent holds and terminal entries intact', () => {
    expect(Object.fromEntries(resolveGitReleaseStates([
      { releaseKey: 'old', state: 'ONLINE' },
      { releaseKey: 'middle', state: 'HOLD', replaces: 'old' },
      { releaseKey: 'new', state: 'ONLINE', replaces: 'middle' },
      { releaseKey: 'held', state: 'HOLD' },
      { releaseKey: 'terminal', state: 'RETIRED' },
    ]))).toEqual({ old: 'WITHDRAWN', middle: 'WITHDRAWN', new: 'ONLINE', held: 'HOLD', terminal: 'RETIRED' })
  })

  it('restores the selected predecessor when its replacement is explicitly withdrawn', () => {
    expect(Object.fromEntries(resolveGitReleaseStates([
      { releaseKey: 'first', state: 'ONLINE' },
      { releaseKey: 'second', state: 'WITHDRAWN', replaces: 'first' },
    ]))).toEqual({ first: 'ONLINE', second: 'WITHDRAWN' })
  })

  it('rejects repeated keys, missing predecessors and cycles even when selections are not online', () => {
    const first = { releaseKey: 'first', state: 'HOLD' } as const
    expect(() => resolveGitReleaseStates([first, first])).toThrow('CONTENT_GIT_DUPLICATE_RELEASE_KEY')
    expect(() => resolveGitReleaseStates([{ ...first, replaces: 'absent' }]))
      .toThrow('CONTENT_GIT_REPLACEMENT_NOT_FOUND:first:absent')
    expect(() => resolveGitReleaseStates([
      { ...first, replaces: 'second' },
      { releaseKey: 'second', state: 'WITHDRAWN', replaces: 'first' },
    ])).toThrow('CONTENT_GIT_REPLACEMENT_CYCLE')
  })
})
