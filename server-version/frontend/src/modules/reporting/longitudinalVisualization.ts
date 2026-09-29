import type { IndividualProjection, MatchedProjection, RepeatedProjection } from '../../api/reporting'

export type LongitudinalTrendState = 'comparable' | 'not_comparable' | 'suppressed' | 'unavailable'

export interface LongitudinalTrendPoint {
  label: string
  value: number | null
}

export interface LongitudinalTrendSegment {
  fromIndex: number
  toIndex: number
  connect: boolean
  comparabilityLevel: string
  delta?: number
}

export interface LongitudinalTrendModel {
  metricId: string
  state: LongitudinalTrendState
  points: LongitudinalTrendPoint[]
  segments: LongitudinalTrendSegment[]
  hasSuppressedValues: boolean
}

type WaveLabel = (ordinal: number, waveKey?: string) => string

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const stateFrom = (
  points: LongitudinalTrendPoint[],
  segments: LongitudinalTrendSegment[],
  hasSuppressedValues: boolean,
): LongitudinalTrendState => {
  const presentCount = points.filter((point) => point.value !== null).length
  if (presentCount === 0) return hasSuppressedValues ? 'suppressed' : 'unavailable'
  if (presentCount < 2) return 'unavailable'
  return segments.length > 0 && segments.every((segment) => segment.connect) ? 'comparable' : 'not_comparable'
}

const segmentFrom = (input: {
  fromIndex: number
  toIndex: number
  valueAvailable: boolean
  comparability?: { level: string; allowedOperations: string[] } | null
  delta?: number
}): LongitudinalTrendSegment => {
  const operations = input.comparability?.allowedOperations ?? []
  const connect = input.valueAvailable && operations.includes('DESCRIPTIVE_TREND')
  const output: LongitudinalTrendSegment = {
    fromIndex: input.fromIndex,
    toIndex: input.toIndex,
    connect,
    comparabilityLevel: input.comparability?.level ?? 'UNKNOWN',
  }
  if (connect && operations.includes('NUMERIC_DELTA') && finite(input.delta)) output.delta = input.delta
  return output
}

/**
 * Converts the server-projected matched longitudinal result into a rendering model.
 *
 * Safety contract:
 * - internal wave IDs never leave this adapter;
 * - suppressed metrics return no points even if a malformed object contains extra fields;
 * - connection is allowed only when the backend explicitly projected DESCRIPTIVE_TREND;
 * - delta is displayed only when the backend both permits NUMERIC_DELTA and supplied delta;
 * - the frontend never derives a delta from point values.
 */
export function toMatchedTrend(
  projection: MatchedProjection,
  metricId: string,
  labelForWave: WaveLabel,
): LongitudinalTrendModel {
  if (projection.state === 'suppressed') {
    return { metricId, state: 'suppressed', points: [], segments: [], hasSuppressedValues: true }
  }

  const metric = projection.metrics?.[metricId]
  if (!metric) return { metricId, state: 'unavailable', points: [], segments: [], hasSuppressedValues: false }
  if (metric.state === 'suppressed') {
    return { metricId, state: 'suppressed', points: [], segments: [], hasSuppressedValues: true }
  }

  const byWaveId = new Map((metric.waveMeans ?? []).map((wave) => [wave.waveId, wave]))
  const points = projection.waveIds.map((waveId, index) => {
    const wave = byWaveId.get(waveId)
    return {
      label: labelForWave(index + 1, wave?.waveKey),
      value: finite(wave?.mean) ? wave.mean : null,
    }
  })

  const comparisons = new Map(
    (metric.comparisons ?? []).map((comparison) => [`${comparison.fromWaveId}::${comparison.toWaveId}`, comparison]),
  )
  const segments = projection.waveIds.slice(0, -1).map((fromWaveId, index) => {
    const toWaveId = projection.waveIds[index + 1]
    const comparison = comparisons.get(`${fromWaveId}::${toWaveId}`)
    return segmentFrom({
      fromIndex: index,
      toIndex: index + 1,
      valueAvailable: points[index].value !== null && points[index + 1].value !== null,
      comparability: comparison?.comparability,
      delta: comparison?.delta,
    })
  })

  return {
    metricId,
    state: stateFrom(points, segments, false),
    points,
    segments,
    hasSuppressedValues: false,
  }
}

/**
 * Repeated-cohort projections do not have a dedicated waveMeans field. We render only
 * an explicitly projected numeric aggregations.mean value and never infer another
 * aggregation as a mean.
 */
export function toRepeatedTrend(
  projection: RepeatedProjection,
  metricId: string,
  labelForWave: WaveLabel,
): LongitudinalTrendModel {
  if (projection.state === 'suppressed') {
    return { metricId, state: 'suppressed', points: [], segments: [], hasSuppressedValues: true }
  }

  let hasSuppressedValues = false
  const points = projection.waves.map((wave) => {
    if (wave.state === 'suppressed') {
      hasSuppressedValues = true
      return { label: labelForWave(wave.ordinal, wave.waveKey), value: null }
    }
    const metric = wave.metrics?.[metricId]
    if (!metric) return { label: labelForWave(wave.ordinal, wave.waveKey), value: null }
    if (metric.state === 'suppressed') {
      hasSuppressedValues = true
      return { label: labelForWave(wave.ordinal, wave.waveKey), value: null }
    }
    const mean = metric.aggregations?.mean
    return { label: labelForWave(wave.ordinal, wave.waveKey), value: finite(mean) ? mean : null }
  })

  const waveIndex = new Map(projection.waves.map((wave, index) => [wave.waveId, index]))
  const comparisonByPair = new Map(
    projection.comparisons.map((pair) => [`${pair.fromWaveId}::${pair.toWaveId}`, pair]),
  )
  const segments = projection.waves.slice(0, -1).map((wave, index) => {
    const next = projection.waves[index + 1]
    const pair = comparisonByPair.get(`${wave.waveId}::${next.waveId}`)
    const decision = pair?.metrics?.[metricId]
    const fromIndex = waveIndex.get(wave.waveId) ?? index
    const toIndex = waveIndex.get(next.waveId) ?? index + 1
    return segmentFrom({
      fromIndex,
      toIndex,
      valueAvailable: points[fromIndex]?.value !== null && points[toIndex]?.value !== null,
      comparability: decision,
    })
  })

  return {
    metricId,
    state: stateFrom(points, segments, hasSuppressedValues),
    points,
    segments,
    hasSuppressedValues,
  }
}

export function toIndividualTrend(
  projection: IndividualProjection,
  metricId: string,
  labelForWave: WaveLabel,
): LongitudinalTrendModel {
  const points = projection.waves.map((wave) => {
    const metric = wave.metrics[metricId]
    return {
      label: labelForWave(wave.ordinal, wave.waveKey),
      value: metric?.state === 'present' && finite(metric.value) ? metric.value : null,
    }
  })

  const waveIndex = new Map(projection.waves.map((wave, index) => [wave.waveId, index]))
  const comparisonByPair = new Map(
    projection.comparisons.map((pair) => [`${pair.fromWaveId}::${pair.toWaveId}`, pair]),
  )
  const segments = projection.waves.slice(0, -1).map((wave, index) => {
    const next = projection.waves[index + 1]
    const pair = comparisonByPair.get(`${wave.waveId}::${next.waveId}`)
    const metric = pair?.metrics?.[metricId]
    const fromIndex = waveIndex.get(wave.waveId) ?? index
    const toIndex = waveIndex.get(next.waveId) ?? index + 1
    return segmentFrom({
      fromIndex,
      toIndex,
      valueAvailable: points[fromIndex]?.value !== null && points[toIndex]?.value !== null,
      comparability: metric?.comparability,
      delta: metric?.delta,
    })
  })

  return {
    metricId,
    state: stateFrom(points, segments, false),
    points,
    segments,
    hasSuppressedValues: false,
  }
}
