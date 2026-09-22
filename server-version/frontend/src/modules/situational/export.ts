import type { SituationalAttemptResponse, SituationalScientificContext } from './types'

export interface SituationalExportPayload {
  scientificContext: SituationalScientificContext
  instrumentKey: string
  instrumentVersion: string
  scoringVersion: string
  completedAt: string | null
  quality: NonNullable<SituationalAttemptResponse['result']>['quality']
  metrics: Array<{
    key: string
    construct: string
    channelKey: string
    value: number | null
    status: string
  }>
  disclaimer: string
  referencePolicy: 'NONE'
}

export const buildSituationalExportPayload = (data: SituationalAttemptResponse): SituationalExportPayload => ({
  scientificContext: data.instrument.scientificContext ?? { scientificMaturity: 'PILOT', governanceRevision: null, scope: null, evidenceDigest: null, provenance: 'LEGACY_MISSING' },
  instrumentKey: data.attempt.instrumentKey,
  instrumentVersion: data.attempt.instrumentVersion,
  scoringVersion: data.attempt.scoringVersion,
  completedAt: data.attempt.completedAt,
  quality: data.result?.quality ?? { status: 'invalid', flags: ['missing_result'] },
  metrics: (data.result?.metrics ?? []).map((metric) => ({
    key: metric.key,
    construct: metric.construct,
    channelKey: metric.channelKey,
    value: metric.value,
    status: metric.status,
  })),
  disclaimer: data.instrument.report.disclaimer,
  referencePolicy: 'NONE',
})

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export const buildSituationalCsv = (data: SituationalAttemptResponse): string => {
  const payload = buildSituationalExportPayload(data)
  const rows = [
    ['instrumentKey', payload.instrumentKey],
    ['instrumentVersion', payload.instrumentVersion],
    ['scoringVersion', payload.scoringVersion],
    ['scientificMaturity', payload.scientificContext.scientificMaturity],
    ['governanceRevision', payload.scientificContext.governanceRevision],
    ['scientificProvenance', payload.scientificContext.provenance],
    ['scientificScope', JSON.stringify(payload.scientificContext.scope)],
    ['evidenceDigest', payload.scientificContext.evidenceDigest],
    ['completedAt', payload.completedAt ?? ''],
    ['quality.status', payload.quality.status],
    ['quality.flags', payload.quality.flags.join('|')],
    ['referencePolicy', payload.referencePolicy],
    ['disclaimer', payload.disclaimer],
    [],
    ['metricKey', 'construct', 'channelKey', 'value', 'status'],
    ...payload.metrics.map((metric) => [metric.key, metric.construct, metric.channelKey, metric.value ?? '', metric.status]),
  ]
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export const downloadSituationalExport = (data: SituationalAttemptResponse, format: 'json' | 'csv'): void => {
  const body = format === 'json'
    ? JSON.stringify(buildSituationalExportPayload(data), null, 2)
    : buildSituationalCsv(data)
  const blob = new Blob([body], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `situational-${data.attempt.instrumentKey}-${data.attempt.instrumentVersion}.${format}`
  anchor.click()
  URL.revokeObjectURL(url)
}

