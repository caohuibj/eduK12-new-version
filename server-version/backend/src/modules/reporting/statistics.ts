import type { ReportingAggregation } from './types'
import { reportingFail } from './types'

const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b)

export const finiteReportingNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Object.is(value, -0) ? 0 : value
}

const finiteStatistic = (value: number, operation: string): number => {
  if (!Number.isFinite(value)) {
    return reportingFail('REPORT_STATISTIC_OVERFLOW', `${operation} produced a non-finite result`, 500)
  }
  return Object.is(value, -0) ? 0 : value
}

/** Hyndman-Fan Type 7, identical to R's default quantile algorithm. */
export const type7Quantile = (input: number[], probability: number): number | null => {
  if (input.length === 0) return null
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    return reportingFail('REPORT_STATISTIC', 'quantile probability must be between 0 and 1', 500)
  }
  const values = sorted(input)
  if (values.length === 1) return values[0]
  const h = (values.length - 1) * probability + 1
  const j = Math.floor(h)
  const gamma = h - j
  if (j <= 0) return values[0]
  if (j >= values.length) return values[values.length - 1]
  return finiteStatistic(values[j - 1] + gamma * (values[j] - values[j - 1]), 'quantile interpolation')
}

const mean = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sum = finiteStatistic(values.reduce((total, value) => total + value, 0), 'mean accumulation')
  return finiteStatistic(sum / values.length, 'mean')
}

const variance = (values: number[], sample: boolean): number | null => {
  if (values.length === 0 || (sample && values.length < 2)) return null
  const average = mean(values)!
  const denominator = sample ? values.length - 1 : values.length
  const sumOfSquares = finiteStatistic(
    values.reduce((sum, value) => sum + ((value - average) ** 2), 0),
    sample ? 'sample variance accumulation' : 'population variance accumulation',
  )
  return finiteStatistic(sumOfSquares / denominator, sample ? 'sample variance' : 'population variance')
}

export const reportingAggregations = (input: {
  values: number[]
  aggregations: ReportingAggregation[]
  distributionCellFloor: number
}): Record<string, unknown> => {
  const values = input.values.map((value) => finiteReportingNumber(value))
  if (values.some((value) => value === null)) {
    return reportingFail('REPORT_STATISTIC_INPUT', 'statistics require finite numeric values', 500)
  }
  // Floating-point accumulation must use one order for a given input set.
  // Analysis identities are order-independent, so their projections must be too.
  const numeric = sorted(values as number[])
  const ordered = numeric
  const output: Record<string, unknown> = {}
  for (const aggregation of input.aggregations) {
    if (aggregation === 'MEAN') output.mean = mean(numeric)
    else if (aggregation === 'MEDIAN') output.median = type7Quantile(numeric, 0.5)
    else if (aggregation === 'SD_POPULATION') {
      const value = variance(numeric, false)
      output.sdPopulation = value === null ? null : finiteStatistic(Math.sqrt(value), 'population standard deviation')
    } else if (aggregation === 'SD_SAMPLE') {
      const value = variance(numeric, true)
      output.sdSample = value === null ? null : finiteStatistic(Math.sqrt(value), 'sample standard deviation')
    } else if (aggregation === 'MIN_MAX') {
      output.minMax = numeric.length === 0 ? null : { min: ordered[0], max: ordered[ordered.length - 1] }
    } else if (aggregation === 'QUARTILES') {
      output.quartiles = numeric.length === 0 ? null : {
        q1: type7Quantile(numeric, 0.25),
        q2: type7Quantile(numeric, 0.5),
        q3: type7Quantile(numeric, 0.75),
      }
    } else if (aggregation === 'DISTRIBUTION') {
      const counts = new Map<number, number>()
      for (const value of numeric) counts.set(value, (counts.get(value) ?? 0) + 1)
      const cells = [...counts.entries()].sort(([left], [right]) => left - right).map(([value, count]) => ({ value, count }))
      output.distribution = cells.some((cell) => cell.count < input.distributionCellFloor)
        ? { state: 'suppressed' }
        : { state: 'present', cells }
    }
  }
  return output
}
