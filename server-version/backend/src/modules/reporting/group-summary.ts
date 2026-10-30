import { reportingAggregations, finiteReportingNumber } from './statistics'

export type GroupToolKind = 'SCALE' | 'COGNITIVE' | 'SJT' | 'FORM'
export function groupFormMetricType(responseType: string): 'NUMBER' | 'SINGLE' | 'MULTIPLE' | null {
  return ['NUMBER', 'SLIDER'].includes(responseType) ? 'NUMBER'
    : ['SINGLE', 'LIKERT', 'MATRIX'].includes(responseType) ? 'SINGLE'
      : ['MULTIPLE', 'MATRIX_MULTIPLE'].includes(responseType) ? 'MULTIPLE' : null
}
export interface GroupMetricDefinition {
  key: string
  label: string
  measurement: unknown
  unit: string | null
  range: { min: number; max: number } | null
  type: 'NUMBER' | 'SINGLE' | 'MULTIPLE'
  options?: Array<{ value: string; label: string }>
}
export interface GroupMetricObservation {
  parentId: string
  metricKey: string
  value: number | string | string[] | null
  missingReason: string | null
  quality: string | null
}
export interface GroupMetricSummary extends GroupMetricDefinition {
  validN: number
  missingN: number
  qualityCounts: Record<string, number>
  mean: number | null
  sdSample: number | null
  observedRange: { min: number; max: number } | null
  frequencies: Array<{ value: string; label: string; count: number; proportion: number | null }>
}
export interface TaskGroupProjection {
  schemaVersion: 1
  descriptionVersion: 'group-descriptive-v1'
  title: string
  sourceLabel: string
  cutoff: string
  populationLabel: string
  completedN: number
  countUnit: 'RESPONSE' | 'PERSON'
  assignedN: number | null
  tool: { key: string; title: string; kind: GroupToolKind }
  metrics: GroupMetricSummary[]
  limitations: string[]
}

/** Only already authorized leaf facts enter here. Parent selection happens
 * before metric projection, so a missing newest score cannot revive an old one.
 * No scoring, thresholds, reference populations or participant inference. */
export function summarizeGroupMetrics(definitions: GroupMetricDefinition[], observations: GroupMetricObservation[], parentIds: string[]): GroupMetricSummary[] {
  const parents = new Set(parentIds)
  const byMetric = new Map<string, GroupMetricObservation[]>()
  for (const row of observations) if (parents.has(row.parentId)) {
    const rows = byMetric.get(row.metricKey) ?? []
    rows.push(row); byMetric.set(row.metricKey, rows)
  }
  return definitions.map(definition => {
    const rows = byMetric.get(definition.key) ?? []
    const byParent = new Map(rows.map(row => [row.parentId, row]))
    if (byParent.size !== rows.length) throw new Error('同一父结果包含重复叶指标')
    const qualityCounts: Record<string, number> = {}
    const numbers: number[] = []
    const counts = new Map((definition.options ?? []).map(option => [option.value, 0]))
    let validN = 0
    for (const row of rows) {
      if (row.quality) qualityCounts[row.quality] = (qualityCounts[row.quality] ?? 0) + 1
      if (row.missingReason || row.quality === 'invalid') continue
      if (definition.type === 'NUMBER') {
        const value = finiteReportingNumber(row.value)
        if (value === null) continue
        numbers.push(value)
      } else {
        const selected = definition.type === 'MULTIPLE' ? row.value : [row.value]
        if (!Array.isArray(selected) || selected.some(value => typeof value !== 'string' || !counts.has(value))
          || new Set(selected).size !== selected.length) continue
        for (const value of selected as string[]) counts.set(value, counts.get(value)! + 1)
      }
      validN++
    }
    const statistics = reportingAggregations({ values: numbers, aggregations: ['MEAN', 'SD_SAMPLE', 'MIN_MAX'], distributionCellFloor: 1 })
    return { ...definition, validN, missingN: parents.size - validN, qualityCounts,
      mean: statistics.mean as number | null, sdSample: statistics.sdSample as number | null,
      observedRange: statistics.minMax as GroupMetricSummary['observedRange'],
      frequencies: (definition.options ?? []).map(option => ({ ...option, count: counts.get(option.value)!,
        proportion: validN ? counts.get(option.value)! / validN : null })) }
  })
}
