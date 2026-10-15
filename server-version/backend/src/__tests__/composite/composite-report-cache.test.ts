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
