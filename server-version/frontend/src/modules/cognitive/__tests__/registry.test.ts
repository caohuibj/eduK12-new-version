import { describe, it, expect } from 'vitest'
import { resolveRunner } from '../registry'
import { FakeTask } from '../tasks/fake/FakeTask'

describe('cognitive frontend registry', () => {
  it('resolves fake / 1.0.0 to the FakeTask runner', () => {
    const entry = resolveRunner('fake', '1.0.0')
    expect(entry).toBeDefined()
    expect(entry?.RunnerComponent).toBe(FakeTask)
  })

  it('rejects an unknown engineVersion (no nearby/latest fallback)', () => {
    expect(resolveRunner('fake', '9.9.9')).toBeUndefined()
    expect(resolveRunner('fake', '0.0.1')).toBeUndefined()
  })

  it('rejects an unknown testType', () => {
    expect(resolveRunner('reaction', '1.0.0')).toBeUndefined()
    expect(resolveRunner('memory', '1.0.0')).toBeUndefined()
    expect(resolveRunner('stroop', '1.0.0')).toBeUndefined()
  })
})
