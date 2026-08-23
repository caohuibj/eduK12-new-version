import { describe, it, expect } from 'vitest'
import { resolveRunner } from '../registry'
import { FakeTask } from '../tasks/fake/FakeTask'
import { ReactionTask } from '../tasks/reaction/ReactionTask'
import { MemoryTask } from '../tasks/memory/MemoryTask'
import { StroopTask } from '../tasks/stroop/StroopTask'

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

  it('resolves Memory and Stroop without a latest-version fallback', () => {
    expect(resolveRunner('memory', '1.0.0')?.RunnerComponent).toBe(MemoryTask)
    expect(resolveRunner('memory', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('stroop', '1.0.0')?.RunnerComponent).toBe(StroopTask)
    expect(resolveRunner('stroop', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('memory', '9.9.9')).toBeUndefined()
    expect(resolveRunner('stroop', '9.9.9')).toBeUndefined()
    expect(resolveRunner('nback', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('corsi', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('sst', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('taskswitch', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('nback', '9.9.9')).toBeUndefined()
  })

  it('rejects an unknown testType', () => {
    expect(resolveRunner('unknown-task', '1.0.0')).toBeUndefined()
  })

  it('resolves every Round 1 P0/P1 runner and contains no percentile copy', () => {
    const entries = [
      'reaction', 'memory', 'stroop',
      'gonogo', 'cpt', 'nback', 'corsi', 'sst', 'taskswitch',
    ].map((testType) => resolveRunner(testType, '1.0.0'))
    expect(entries.every(Boolean)).toBe(true)
    expect(JSON.stringify(entries)).not.toMatch(/参考位置\s*\d|百分位|percentile|超过全国\s*\d+%/i)
  })
})
