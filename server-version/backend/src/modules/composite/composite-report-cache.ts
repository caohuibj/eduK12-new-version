import { decryptField, encryptField } from '../../utils/encryption'
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
  if (Buffer.byteLength(JSON.stringify(envelope)) > assessmentReportConfig().maxReportBytes) {
    throw new Error('REPORT_PAYLOAD_LIMIT')
  }
  return encryptField(envelope)
}

export const decryptCompositeCollectionReport = (encrypted: string, binding: ReportBinding): Record<string, any> => {
  const envelope = decryptField<Envelope>(encrypted)
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
