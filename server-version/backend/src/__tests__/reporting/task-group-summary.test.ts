import { describe, expect, it } from 'vitest'
import { summarizeGroupMetrics, type GroupMetricDefinition, type GroupMetricObservation } from '../../modules/reporting/group-summary'

const numeric = (key: string): GroupMetricDefinition => ({ key, label: key, type: 'NUMBER', measurement: { key }, unit: 'score', range: { min: -5, max: 5 } })
const row = (parentId: string, metricKey: string, value: GroupMetricObservation['value'], missingReason: string | null = null): GroupMetricObservation => ({ parentId, metricKey, value, missingReason, quality: null })

describe('task group leaf statistics', () => {
  it('keeps zero, signed values and per-metric missing denominators, using existing statistics', () => {
    const [score, missing] = summarizeGroupMetrics([numeric('score'), numeric('missing')], [
      row('p1', 'score', 0), row('p2', 'score', -2), row('p3', 'score', 2), row('p3', 'missing', null, 'NOT_SHOWN'),
    ], ['p1', 'p2', 'p3'])
    expect(score).toMatchObject({ validN: 3, missingN: 0, mean: 0, sdSample: 2 })
    expect(missing).toMatchObject({ validN: 0, missingN: 3, mean: null, sdSample: null })
  })
  it('uses valid respondents as the multiple-choice denominator, preserves zero-frequency options and never averages codes', () => {
    const definitions: GroupMetricDefinition[] = ['SINGLE', 'MULTIPLE'].map(type => ({ ...numeric(type), type: type as 'SINGLE' | 'MULTIPLE',
      options: [{ value: '1', label: '一' }, { value: '2', label: '二' }, { value: '3', label: '三' }] }))
    const [single, multiple] = summarizeGroupMetrics(definitions, [row('p1', 'SINGLE', '2'), row('p1', 'MULTIPLE', ['1', '2']), row('p2', 'MULTIPLE', ['2'])], ['p1', 'p2', 'p3'])
    expect(single).toMatchObject({ validN: 1, mean: null })
    expect(multiple).toMatchObject({ validN: 2, missingN: 1, mean: null, frequencies: [
      { value: '1', count: 1, proportion: .5 }, { value: '2', count: 2, proportion: 1 }, { value: '3', count: 0, proportion: 0 },
    ] })
  })
  it('does not revive an older score, infer people, count invalid quality or duplicate a parent', () => {
    expect(summarizeGroupMetrics([numeric('score')], [row('old', 'score', 100), row('latest', 'score', null)], ['latest'])[0])
      .toMatchObject({ validN: 0, missingN: 1, mean: null })
    expect(summarizeGroupMetrics([numeric('score')], [{ ...row('p1', 'score', 4), quality: 'invalid' }], ['p1'])[0])
      .toMatchObject({ validN: 0, qualityCounts: { invalid: 1 } })
    expect(() => summarizeGroupMetrics([numeric('score')], [row('p1', 'score', 1), row('p1', 'score', 2)], ['p1'])).toThrow('重复叶指标')
  })
})
