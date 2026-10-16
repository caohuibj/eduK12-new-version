import { beforeAll, describe, expect, it } from 'vitest'
import { encryptCompositeCollectionReport, decryptCompositeCollectionReport } from '../../modules/composite/composite-report-cache'
import { resolveLegacyScaleProjectionPolicy } from '../../modules/scale/projection/policy-resolver'
import { projectCompositeCollectionReport } from '../../modules/composite/composite-report.projector'

const binding = { attemptId: 'cache-attempt', attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextHash: null, aggregateInputHash: 'b'.repeat(64) }
beforeAll(() => { process.env.DATA_ENCRYPTION_KEY = '5'.repeat(64) })

describe('encrypted report materialization boundary', () => {
  it('preserves hidden frozen disclosure metadata without serializing it into an HTTP projection', () => {
    const policy = resolveLegacyScaleProjectionPolicy('unrecognized-standard', '1.0.0', 'STANDARD')
    const unit = { itemId: 'scale-1', type: 'SCALE', kind: 'scale', scaleId: 's', scaleCode: 'unrecognized-standard', scaleName: 'Restricted', result: null, scores: [{ key: 'secret', value: 77 }] }
    Object.defineProperty(unit, '__scaleProjectionPolicy', { value: policy, enumerable: false })
    const report = { id: binding.attemptId, name: 'Fixture', unitReports: [unit], backgroundValues: [], completedAt: new Date(), totalTime: 1 }
    const encrypted = encryptCompositeCollectionReport(report, binding)
    expect(encrypted).not.toContain('secret')
    const restored = decryptCompositeCollectionReport(encrypted, binding)
    expect(restored.unitReports[0].__scaleProjectionPolicy).toEqual(policy)
    expect(JSON.stringify(restored)).not.toContain('__scaleProjectionPolicy')
    const projected = JSON.stringify(projectCompositeCollectionReport(restored, 'participant'))
    expect(projected).not.toContain('77')
    expect(projected).not.toContain('__scaleProjectionPolicy')
  })

  it('rejects another participant attempt, epoch, context or aggregate fingerprint', () => {
    const encrypted = encryptCompositeCollectionReport({ id: binding.attemptId, unitReports: [] }, binding)
    for (const changed of [ { attemptId: 'other' }, { attemptEpoch: 2 }, { contextHash: 'c'.repeat(64) }, { aggregateInputHash: 'd'.repeat(64) } ]) {
      expect(() => decryptCompositeCollectionReport(encrypted, { ...binding, ...changed })).toThrow()
    }
  })

  it('does not publish a report with a source decryption failure', () => {
    expect(() => encryptCompositeCollectionReport({ id: binding.attemptId, unitReports: [{ itemId: 'bad', decryptError: true }] }, binding)).toThrow('REPORT_SOURCE_UNAVAILABLE')
  })
})

it('retains the version-1 envelope and ciphertext integrity with serialized payload encryption', async () => {
  const { decryptField, encryptField } = await import('../../utils/encryption')
  const report = { id: binding.attemptId, unitReports: [], text: '多维报告', when: new Date('2026-10-15T00:00:00Z'), omitted: undefined }
  const encrypted = encryptCompositeCollectionReport(report, binding)
  const envelope = decryptField<any>(encrypted)
  expect(envelope.schemaVersion).toBe(1)
  expect(decryptCompositeCollectionReport(encryptField(envelope), binding)).toEqual(decryptCompositeCollectionReport(encrypted, binding))
  const parts = encrypted.split(':')
  parts[1] = (parts[1][0] === 'a' ? 'b' : 'a') + parts[1].slice(1)
  expect(() => decryptCompositeCollectionReport(parts.join(':'), binding)).toThrow('数据解密失败')
  envelope.report.text = 'changed'
  expect(() => decryptCompositeCollectionReport(encryptField(envelope), binding)).toThrow()
})

describe('versioned compressed report storage', () => {
  const mixed = () => ({
    id: binding.attemptId, completedAt: '2026-10-16T00:00:00Z', backgroundValues: [{ key: 'grade', value: '12' }],
    unitReports: [
      { itemId: 'scale', type: 'SCALE', scores: [{ key: 'wellbeing', value: 17 }], text: '冻结量表解释与维度。'.repeat(900) },
      { itemId: 'cognitive', type: 'COGNITIVE', metrics: [{ key: 'accuracy', value: 0.82 }, { key: 'reactionTime', value: 392 }], text: '认知任务结果。'.repeat(600) },
    ],
  })
  it('reads both formats with equal complete content and preserves hidden policies on rollback', async () => {
    const { decryptField } = await import('../../utils/encryption')
    const report = mixed()
    Object.defineProperty(report.unitReports[0], '__scaleProjectionPolicy', { value: { schemaVersion: 1, scores: ['wellbeing'] }, enumerable: false })
    Object.defineProperty(report.unitReports[1], '__frozenMetricDefinitions', { value: [{ key: 'accuracy', unit: 'ratio' }], enumerable: false })
    try {
      delete process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED
      const legacy = encryptCompositeCollectionReport(report, binding)
      process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED = 'true'
      const packed = encryptCompositeCollectionReport(report, binding)
      expect(decryptField<any>(packed).schemaVersion).toBe(2)
      expect(packed.length).toBeLessThan(legacy.length / 3)
      const decoded = decryptCompositeCollectionReport(packed, binding)
      expect(decoded).toEqual(decryptCompositeCollectionReport(legacy, binding))
      expect(decoded.unitReports[1].__frozenMetricDefinitions).toEqual([{ key: 'accuracy', unit: 'ratio' }])
      delete process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED
      const rollback = encryptCompositeCollectionReport(decoded, binding)
      expect(decryptField<any>(rollback).schemaVersion).toBe(1)
      expect(decryptCompositeCollectionReport(rollback, binding)).toEqual(decoded)
      expect(decryptCompositeCollectionReport(rollback, binding).unitReports[0].__scaleProjectionPolicy).toEqual(decoded.unitReports[0].__scaleProjectionPolicy)
    } finally { delete process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED }
  })

  it('rejects codec, length, digest, payload, ciphertext and attempt binding tampering', async () => {
    const { decryptField, encryptField } = await import('../../utils/encryption')
    try {
      process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED = 'true'
      const encrypted = encryptCompositeCollectionReport(mixed(), binding)
      const packed = decryptField<any>(encrypted)
      for (const changed of [{ codec: 'future' }, { plainBytes: packed.plainBytes + 1 }, { plainBytes: 2 ** 31 },
        { plainSha256: '0'.repeat(64) }, { payload: '!!!!' }, { payload: Buffer.from('not gzip').toString('base64') }]) {
        expect(() => decryptCompositeCollectionReport(encryptField({ ...packed, ...changed }), binding)).toThrow()
      }
      const parts = encrypted.split(':')
      parts[1] = (parts[1][0] === 'a' ? 'b' : 'a') + parts[1].slice(1)
      expect(() => decryptCompositeCollectionReport(parts.join(':'), binding)).toThrow()
      for (const changed of [{ attemptId: 'other' }, { attemptEpoch: 2 }, { slotSetHash: 'c'.repeat(64) },
        { contextHash: 'd'.repeat(64) }, { aggregateInputHash: 'e'.repeat(64) }]) {
        expect(() => decryptCompositeCollectionReport(encrypted, { ...binding, ...changed })).toThrow()
      }
    } finally { delete process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED }
  })

  it('bounds decompression before accepting a misleading declared size', async () => {
    const { gzipSync } = await import('node:zlib')
    const { encryptField } = await import('../../utils/encryption')
    try {
      process.env.ASSESSMENT_REPORT_MAX_BYTES = '8192'
      const malicious = encryptField({ schemaVersion: 2, codec: 'gzip-json-v1', plainBytes: 100,
        plainSha256: '0'.repeat(64), payload: gzipSync('x'.repeat(16384)).toString('base64') })
      expect(() => decryptCompositeCollectionReport(malicious, binding)).toThrow()
    } finally { delete process.env.ASSESSMENT_REPORT_MAX_BYTES }
  })

  it('keeps small reports legacy and retains the original uncompressed write limit', () => {
    try {
      process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED = 'true'
      const small = { id: binding.attemptId, unitReports: [] }
      expect(decryptCompositeCollectionReport(encryptCompositeCollectionReport(small, binding), binding)).toEqual(small)
      process.env.ASSESSMENT_REPORT_MAX_BYTES = '8192'
      expect(() => encryptCompositeCollectionReport(mixed(), binding)).toThrow('REPORT_PAYLOAD_LIMIT')
    } finally {
      delete process.env.ASSESSMENT_REPORT_COMPRESSION_ENABLED
      delete process.env.ASSESSMENT_REPORT_MAX_BYTES
    }
  })
})
