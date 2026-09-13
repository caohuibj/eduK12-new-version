import { describe, it, expect } from 'vitest'
import { resolveRunner } from '../registry'
import { FakeTask } from '../tasks/fake/FakeTask'
import { MemoryTask } from '../tasks/memory/MemoryTask'
import { StroopTask } from '../tasks/stroop/StroopTask'
import { TrailmakingTask } from '../tasks/trailmaking/TrailmakingTask'
import { ReversallearningTask } from '../tasks/reversallearning/ReversallearningTask'
import { BartTask } from '../tasks/bart/BartTask'
import { WordlistTask } from '../tasks/wordlist/WordlistTask'
import { LexicaldecisionTask } from '../tasks/lexicaldecision/LexicaldecisionTask'
import { EmotionrecognitionTask } from '../tasks/emotionrecognition/EmotionrecognitionTask'

describe('cognitive frontend registry', () => {
  it('resolves fake / 1.0.0 to the FakeTask runner', () => {
    const entry = resolveRunner('fake', '1.0.0')
    expect(entry).toBeDefined()
    expect(entry?.RunnerComponent).toBe(FakeTask)
  })

  it('resolves reaction / 1.0.0 to a config-aware Reaction runner', () => {
    const entry = resolveRunner('reaction', '1.0.0')
    expect(entry).toBeDefined()
    // FE-07B routes exact frozen config identities inside the registered runner.
    // Dedicated frame-timing tests assert legacy-vs-pilot behavior; this registry
    // contract should not pin the implementation to one concrete task function.
    expect(typeof entry?.RunnerComponent).toBe('function')
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

  it('resolves PR12 runners by exact testType and engineVersion', () => {
    expect(resolveRunner('trailmaking', '1.0.0')?.RunnerComponent).toBe(TrailmakingTask)
    expect(resolveRunner('reversallearning', '1.0.0')?.RunnerComponent).toBe(ReversallearningTask)
    expect(resolveRunner('bart', '1.0.0')?.RunnerComponent).toBe(BartTask)
    expect(resolveRunner('trailmaking', '9.9.9')).toBeUndefined()
    expect(resolveRunner('reversallearning', '9.9.9')).toBeUndefined()
    expect(resolveRunner('bart', '9.9.9')).toBeUndefined()
    expect(resolveRunner('bart', '1.0.0')?.reportDefinition.showProductIndex).toBe(false)
  })

  it('resolves PR13 runners by exact testType and engineVersion', () => {
    expect(resolveRunner('wordlist', '1.0.0')?.RunnerComponent).toBe(WordlistTask)
    expect(resolveRunner('lexicaldecision', '1.0.0')?.RunnerComponent).toBe(LexicaldecisionTask)
    expect(resolveRunner('emotionrecognition', '1.0.0')?.RunnerComponent).toBe(EmotionrecognitionTask)
    expect(resolveRunner('wordlist', '9.9.9')).toBeUndefined()
    expect(resolveRunner('lexicaldecision', '9.9.9')).toBeUndefined()
    expect(resolveRunner('emotionrecognition', '9.9.9')).toBeUndefined()
    expect(resolveRunner('wordlist', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('lexicaldecision', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('emotionrecognition', '1.0.0')?.completionMode).toBe('task')
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
