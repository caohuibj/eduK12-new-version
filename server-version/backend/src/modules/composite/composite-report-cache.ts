import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { decryptField, encryptSerializedField } from '../../utils/encryption'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assessmentReportConfig } from '../../config/assessmentReports'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import type { ReportJobIdentity } from '../assessment-runtime/report-outbox.service'

type ReportBinding = ReportJobIdentity & { attemptId: string; aggregateInputHash: string }
type Envelope = {
  schemaVersion: 1
  binding: ReportBinding
  contentHash: string
  report: Record<string, any>
  policies: Array<{ itemId: string; scaleProjectionPolicy?: unknown; frozenMetricDefinitions?: unknown }>
}

/** Preserve server-only disclosure metadata that ordinary JSON would discard. */
export const encryptCompositeCollectionReport = (report: Record<string, any>, binding: ReportBinding): string => {
  const units: any[] = Array.isArray(report.unitReports) ? report.unitReports : []
  if (units.some(unit => unit?.decryptError)) throw new Error('REPORT_SOURCE_UNAVAILABLE')
  const policies = units.map(unit => ({
    itemId: unit.itemId,
    ...(unit.__scaleProjectionPolicy ? { scaleProjectionPolicy: unit.__scaleProjectionPolicy } : {}),
    ...(unit.__frozenMetricDefinitions ? { frozenMetricDefinitions: unit.__frozenMetricDefinitions } : {}),
  }))
  const content = JSON.parse(JSON.stringify({ report, policies })) as Pick<Envelope, 'report' | 'policies'>
  const envelope: Envelope = { schemaVersion: 1, binding, ...content, contentHash: canonicalHash(content) }
  const serialized = JSON.stringify(envelope)
  if (Buffer.byteLength(serialized) > assessmentReportConfig().maxReportBytes) {
    throw new Error('REPORT_PAYLOAD_LIMIT')
  }
  if (process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED === 'true' && Buffer.byteLength(serialized) >= 4096) {
    const packed: CompressedEnvelope = {
      schemaVersion: 2, codec: 'gzip-json-v1', plainBytes: Buffer.byteLength(serialized),
      plainSha256: createHash('sha256').update(serialized).digest('hex'),
      payload: gzipSync(serialized, { level: 1 }).toString('base64'),
    }
    const compressed = JSON.stringify(packed)
    // Small or incompressible reports keep the legacy representation.
    if (Buffer.byteLength(compressed) < Buffer.byteLength(serialized)) return encryptSerializedField(compressed)
  }
  return encryptSerializedField(serialized)
}

type CompressedEnvelope = {
  schemaVersion: 2
  codec: 'gzip-json-v1'
  plainBytes: number
  plainSha256: string
  payload: string
}

/** The codec, declared length and digest are inside the authenticated ciphertext. */
const readReportEnvelope = (encrypted: string): Envelope => {
  const limit = assessmentReportConfig().maxReportBytes
  if (encrypted.length > 2 * (limit + 1024) + 66) throw new Error('REPORT_PAYLOAD_LIMIT')
  const value = decryptField<Envelope | CompressedEnvelope>(encrypted)
  if (value?.schemaVersion !== 2) return value as Envelope
  if (value.codec !== 'gzip-json-v1' || !Number.isSafeInteger(value.plainBytes)
    || value.plainBytes <= 0 || value.plainBytes > limit
    || typeof value.plainSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.plainSha256)
    || typeof value.payload !== 'string' || value.payload.length > 4 * Math.ceil(limit / 3)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.payload)) {
    throw new Error('REPORT_CODEC_INVALID')
  }
  const compressed = Buffer.from(value.payload, 'base64')
  if (compressed.toString('base64') !== value.payload) throw new Error('REPORT_CODEC_INVALID')
  const plain = gunzipSync(compressed, { maxOutputLength: limit })
  if (plain.byteLength !== value.plainBytes
    || createHash('sha256').update(plain).digest('hex') !== value.plainSha256) {
    throw new Error('REPORT_CODEC_INTEGRITY')
  }
  return JSON.parse(plain.toString('utf8')) as Envelope
}

export const decryptCompositeCollectionReport = (encrypted: string, binding: ReportBinding): Record<string, any> => {
  const envelope = readReportEnvelope(encrypted)
  if (envelope?.schemaVersion !== 1 || canonicalHash(envelope.binding) !== canonicalHash(binding)
    || envelope.report?.id !== binding.attemptId
    || !Array.isArray(envelope.report?.unitReports) || !Array.isArray(envelope.policies)
    || canonicalHash({ report: envelope.report, policies: envelope.policies }) !== envelope.contentHash) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告冻结绑定无法核验', 409)
  }
  const byItem = new Map(envelope.policies.map(policy => [policy.itemId, policy]))
  for (const unit of envelope.report.unitReports) {
    const policy = byItem.get(unit.itemId)
    if (policy?.scaleProjectionPolicy) Object.defineProperty(unit, '__scaleProjectionPolicy', {
      value: policy.scaleProjectionPolicy, enumerable: false,
    })
    if (policy?.frozenMetricDefinitions) Object.defineProperty(unit, '__frozenMetricDefinitions', {
      value: policy.frozenMetricDefinitions, enumerable: false,
    })
  }
  return envelope.report
}
