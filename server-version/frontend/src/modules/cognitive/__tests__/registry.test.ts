import { describe, it, expect } from 'vitest'
import { resolveRunner } from '../registry'
import { FakeTask } from '../tasks/fake/FakeTask'
import { ReactionTask } from '../tasks/reaction/ReactionTask'

describe('cognitive frontend registry', () => {
  it('resolves fake / 1.0.0 to the FakeTask runner', () => {
    const entry = resolveRunner('fake', '1.0.0')
    expect(entry).toBeDefined()
    expect(entry?.RunnerComponent).toBe(FakeTask)
  })

  it('resolves reaction / 1.0.0 to the ReactionTask runner (Milestone E Session 2)', () => {
    const entry = resolveRunner('reaction', '1.0.0')
    expect(entry).toBeDefined()
    expect(entry?.RunnerComponent).toBe(ReactionTask)
    expect(entry?.name).toBe('反应速度')
    expect(entry?.reportDefinition.title).toBe('反应速度')
    expect(entry?.metricDefinitions.length).toBeGreaterThan(0)
  })

  it('rejects an unknown engineVersion (no nearby/latest fallback)', () => {
    expect(resolveRunner('fake', '9.9.9')).toBeUndefined()
    expect(resolveRunner('fake', '0.0.1')).toBeUndefined()
    expect(resolveRunner('reaction', '9.9.9')).toBeUndefined()
  })

  it('rejects an unknown testType', () => {
    expect(resolveRunner('memory', '1.0.0')).toBeUndefined()
    expect(resolveRunner('stroop', '1.0.0')).toBeUndefined()
    expect(resolveRunner('unknown-task', '1.0.0')).toBeUndefined()
  })
})
