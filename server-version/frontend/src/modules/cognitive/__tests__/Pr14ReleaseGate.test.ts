import { describe, expect, it } from 'vitest'
import { resolveRunner } from '../registry'

const ROUND2_TASKS = [
  'patterncompare',
  'flanker',
  'cardsort',
  'digitbackward',
  'picturesequence',
  'pairedassociate',
  'matrix',
  'mentalrotation',
  'tower',
  'trailmaking',
  'reversallearning',
  'bart',
  'wordlist',
  'lexicaldecision',
  'emotionrecognition',
] as const

describe('PR14 frontend release gate', () => {
  it('resolves every Round 2 task by exact engine version with a complete report contract', () => {
    for (const testType of ROUND2_TASKS) {
      const entry = resolveRunner(testType, '1.0.0')
      expect(entry, testType).toBeDefined()
      expect(entry?.testType, testType).toBe(testType)
      expect(entry?.engineVersion, testType).toBe('1.0.0')
      expect(entry?.scoringVersion, testType).toBe('1.0.0')
      expect(entry?.RunnerComponent, testType).toBeTypeOf('function')
      expect(entry?.metricDefinitions.length, testType).toBeGreaterThan(0)
      expect(entry?.reportDefinition.title, testType).toBeTruthy()
      expect(entry?.reportDefinition.headlineMetric, testType).toBeTruthy()
      const reportDefinition = entry!.reportDefinition as unknown as Record<string, unknown>
      for (const forbiddenKey of ['overallScore', 'averageScore', 'percentile', 'IQ']) {
        expect(Object.keys(reportDefinition), `${testType}/${forbiddenKey}`).not.toContain(forbiddenKey)
        expect(reportDefinition.headlineMetric, `${testType}/${forbiddenKey}`).not.toBe(forbiddenKey)
        expect(reportDefinition.summaryMetrics, `${testType}/${forbiddenKey}`).not.toContain(forbiddenKey)
      }
    }
  })

  it('fails closed for package/task version mismatch and never uses latest fallback', () => {
    for (const testType of ROUND2_TASKS) {
      expect(resolveRunner(testType, 'latest'), testType).toBeUndefined()
      expect(resolveRunner(testType, '9.9.9'), testType).toBeUndefined()
    }
    expect(resolveRunner('unknown-round2-task', '1.0.0')).toBeUndefined()
  })
})
