import { getHeapStatistics } from 'node:v8'
import { buildDatabaseUrl } from './databasePool'
const intEnv = (name: string, fallback: number, min: number, max: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`❌ ${name} must be an integer between ${min} and ${max} (got '${raw}')`)
  }
  return value
}

const boolEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`❌ ${name} must be 'true' or 'false' (got '${raw}')`)
}

const enumEnv = <T extends string>(name: string, fallback: T, values: readonly T[]): T => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  if ((values as readonly string[]).includes(raw)) return raw as T
  throw new Error(`❌ ${name} must be one of ${values.join(', ')} (got '${raw}')`)
}

const bitrateEnv = (name: string, fallback: string): string => {
  const raw = process.env[name] || fallback
  if (!/^\d+(?:[kKmM])$/.test(raw)) throw new Error(`❌ ${name} must look like 800k or 2M (got '${raw}')`)
  return raw
}

const VIDEO_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const
const VIDEO_RESOLUTIONS = ['360p', '480p', '720p', '1080p'] as const

/**
 * One validated, non-secret source for worker resource knobs. Defaults are
 * conservative compatibility values, not a 4C4G capacity certification.
 */
export const runtimeResourceConfig = Object.freeze({
  videoConcurrency: intEnv('VIDEO_CONCURRENCY', 2, 1, 8),
  imageConcurrency: intEnv('IMAGE_CONCURRENCY', 2, 1, 8),
  exportConcurrency: intEnv('EXPORT_CONCURRENCY', 1, 1, 4),
  imageTimeoutSeconds: intEnv('IMAGE_TIMEOUT', 30, 1, 600),
  videoTimeoutSeconds: intEnv('VIDEO_TIMEOUT', 1800, 30, 7200),
  exportTimeoutSeconds: intEnv('EXPORT_TIMEOUT', 1800, 30, 7200),
  workerShutdownTimeoutSeconds: intEnv('WORKER_SHUTDOWN_TIMEOUT_SECONDS', 30, 5, 300),
  videoLowPowerMode: boolEnv('VIDEO_LOW_POWER_MODE', true),
  videoResolution: enumEnv('VIDEO_RESOLUTION', '480p', VIDEO_RESOLUTIONS),
  videoPreset: enumEnv('VIDEO_PRESET', 'veryfast', VIDEO_PRESETS),
  videoCrf: intEnv('VIDEO_CRF', 26, 0, 51),
  videoBitrate: bitrateEnv('VIDEO_BITRATE', '800k'),
  videoAudioBitrate: bitrateEnv('VIDEO_AUDIO_BITRATE', '96k'),
  videoSmartCompression: boolEnv('VIDEO_SMART_COMPRESSION', true),
})

export const effectiveRuntimeResourceConfig = () => ({
  heapLimitMiB: Math.round(getHeapStatistics().heap_size_limit / 1048576),
  prismaConnectionLimit: new URL(buildDatabaseUrl(process.env.DATABASE_URL) ?? 'postgresql://localhost').searchParams.get('connection_limit'),
  prismaPoolTimeoutSeconds: new URL(buildDatabaseUrl(process.env.DATABASE_URL) ?? 'postgresql://localhost').searchParams.get('pool_timeout'),
  admissionOverrides: Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(?:UNIT_SUBMIT|AGGREGATE_FINALIZATION|QUESTIONNAIRE_COMPLETION|UPLOAD|LOGIN|PASSWORD_CHANGE|REGISTRATION)_/.test(name) && /(?:LIMIT|QUEUE|TIMEOUT_MS|MAX_WAIT_MS|MAX_CONCURRENT|MAX_PIXELS|MAX_ACTIVE_ACCOUNTS|BYTE_BUDGET|RETRY_AFTER_SECONDS)$/.test(name)).map(([name]) => [name, intEnv(name, 1, name.endsWith('_QUEUE') ? 0 : 1, Number.MAX_SAFE_INTEGER)])),
  videoConcurrency: runtimeResourceConfig.videoConcurrency,
  imageConcurrency: runtimeResourceConfig.imageConcurrency,
  exportConcurrency: runtimeResourceConfig.exportConcurrency,
  imageTimeoutSeconds: runtimeResourceConfig.imageTimeoutSeconds,
  videoTimeoutSeconds: runtimeResourceConfig.videoTimeoutSeconds,
  exportTimeoutSeconds: runtimeResourceConfig.exportTimeoutSeconds,
  workerShutdownTimeoutSeconds: runtimeResourceConfig.workerShutdownTimeoutSeconds,
  videoLowPowerMode: runtimeResourceConfig.videoLowPowerMode,
  videoResolution: runtimeResourceConfig.videoResolution,
  videoPreset: runtimeResourceConfig.videoPreset,
  videoCrf: runtimeResourceConfig.videoCrf,
  videoBitrate: runtimeResourceConfig.videoBitrate,
  videoAudioBitrate: runtimeResourceConfig.videoAudioBitrate,
  videoSmartCompression: runtimeResourceConfig.videoSmartCompression,
})
