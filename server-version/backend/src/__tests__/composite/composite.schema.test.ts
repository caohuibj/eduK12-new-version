import { describe, expect, it } from 'vitest'
import {
  addCompositeItemSchema,
  compositeAnalysisExportQuerySchema,
  compositeParticipantAnalysisExportQuerySchema,
  compositeExportRequestSchema,
  compositeReanalysisBodySchema,
  compositeReportQuerySchema,
  compositeSaveSchema,
  compositeScaleAnswerSchema,
  compositeFormAnswerSchema,
  createCompositeSchema,
  createCompositeTokenSchema,
  copyCompositeSchema,
  listCompositeAttemptsQuerySchema,
  publicRecoverySchema,
  setCompositeAnalysisProtocolSchema,
} from '../../modules/composite/composite.schema'

describe('composite assessment schemas', () => {
  it('accepts scale, cognitive and form modules with strict fields', () => {
    expect(addCompositeItemSchema.parse({ type: 'SCALE', scaleId: 'scale-1' }).required).toBe(true)
    expect(addCompositeItemSchema.parse({ type: 'COGNITIVE', cognitiveAssignmentId: 'assignment-1' }).type).toBe('COGNITIVE')
    expect(addCompositeItemSchema.parse({
      type: 'FORM',
      formType: 'single_choice',
      formLabel: '年级',
      formOptions: [{ value: '3', label: '三年级' }],
    }).formType).toBe('single_choice')
    expect(() => addCompositeItemSchema.parse({ type: 'FORM', formType: 'single_choice', formLabel: '年级' })).toThrow()
    expect(() => addCompositeItemSchema.parse({ type: 'SCALE', scaleId: 'scale-1', userId: 'student-1' })).toThrow()
  })

  it('requires a valid time window for public templates and tokens', () => {
    expect(() => createCompositeSchema.parse({
      code: 'COMPOSITE-1',
      name: '综合测评',
      publicEnabled: true,
    })).not.toThrow()
    expect(() => createCompositeTokenSchema.parse({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: 10,
    })).not.toThrow()
    expect(() => createCompositeTokenSchema.parse({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: -1,
    })).toThrow()
  })

  it('keeps recovery credentials out of strict read/export query shapes', () => {
    expect(publicRecoverySchema.parse({ recoveryToken: 'a'.repeat(24) }).recoveryToken).toHaveLength(24)
    expect(() => publicRecoverySchema.parse({ recoveryToken: 'a'.repeat(24), attemptId: 'attempt-1' })).toThrow()
    expect(compositeExportRequestSchema.parse({ detail: 'full', format: 'csv' }).anonymize).toBe(true)
  })

  it('allows an empty form draft but requires both draft fields together', () => {
    expect(compositeSaveSchema.parse({ itemId: 'form-1', value: '' })).toEqual({ itemId: 'form-1', value: '' })
    expect(compositeSaveSchema.parse({})).toEqual({})
    expect(() => compositeSaveSchema.parse({ itemId: 'form-1' })).toThrow()
    expect(() => compositeSaveSchema.parse({ value: 'draft' })).toThrow()
  })

  it('bounds submitted answers and validates scale values', () => {
    expect(() => compositeScaleAnswerSchema.parse({ itemId: 'question-1', value: 1.5 })).toThrow()
    expect(() => compositeFormAnswerSchema.parse({ itemId: 'form-1', value: 'x'.repeat(10001) })).toThrow()
  })

  it('accepts teacher attempt list filters and rejects unknown query keys', () => {
    expect(listCompositeAttemptsQuerySchema.parse({ status: 'COMPLETED', q: 'ANON', page: '1', pageSize: '20' })).toMatchObject({
      status: 'COMPLETED',
      q: 'ANON',
    })
    expect(() => listCompositeAttemptsQuerySchema.parse({ _t: '1' })).toThrow()
    expect(() => listCompositeAttemptsQuerySchema.parse({ status: 'DONE' })).toThrow()
  })

  it('accepts only an explicit Snapshot id in report queries and only an empty reanalysis body', () => {
    expect(compositeReportQuerySchema.parse({ snapshotId: 'snapshot-1' })).toEqual({ snapshotId: 'snapshot-1' })
    expect(compositeReportQuerySchema.parse({})).toEqual({})
    expect(() => compositeReportQuerySchema.parse({ snapshotId: '' })).toThrow()
    expect(() => compositeReportQuerySchema.parse({ snapshotId: '   ' })).toThrow()
    expect(() => compositeReportQuerySchema.parse({ snapshotId: 'snapshot/other' })).toThrow()
    expect(() => compositeReportQuerySchema.parse({ snapshotId: ['snapshot-1'] })).toThrow()
    expect(() => compositeReportQuerySchema.parse({ attemptId: 'attempt-1' })).toThrow()
    expect(compositeReanalysisBodySchema.parse({})).toEqual({})
    expect(() => compositeReanalysisBodySchema.parse({ snapshotId: 'snapshot-1' })).toThrow()
  })

  it('keeps analysis export formats strict and forbids Snapshot selection for participant routes', () => {
    expect(compositeAnalysisExportQuerySchema.parse({})).toEqual({ format: 'zip' })
    expect(compositeAnalysisExportQuerySchema.parse({ format: 'json', snapshotId: 'snapshot-1' })).toEqual({ format: 'json', snapshotId: 'snapshot-1' })
    expect(() => compositeAnalysisExportQuerySchema.parse({ format: 'csv' })).toThrow()
    expect(() => compositeAnalysisExportQuerySchema.parse({ format: 'zip', attemptId: 'attempt-1' })).toThrow()
    expect(compositeParticipantAnalysisExportQuerySchema.parse({})).toEqual({ format: 'zip' })
    expect(() => compositeParticipantAnalysisExportQuerySchema.parse({ snapshotId: 'snapshot-1' })).toThrow()
  })

  it('allows omitting courseId on copy so self-copy can keep the source course', () => {
    expect(copyCompositeSchema.parse({})).toEqual({})
    expect(copyCompositeSchema.parse({ courseId: null }).courseId).toBeNull()
    expect(copyCompositeSchema.parse({ courseId: 'course-1' }).courseId).toBe('course-1')
  })

  it('accepts only explicit internal protocol versions and rejects bare creation', () => {
    const selection = { key: 'attention_v1', version: '1.0.0', profile: 'research' as const }
    expect(() => createCompositeSchema.parse({ code: 'ATTN', name: '注意', analysisProtocol: selection })).toThrow()
    expect(setCompositeAnalysisProtocolSchema.parse({ analysisProtocol: null })).toEqual({ analysisProtocol: null })
    expect(() => setCompositeAnalysisProtocolSchema.parse({
      analysisProtocol: { key: 'attention_v1', version: 'latest', profile: 'experience' },
    })).toThrow()
    expect(() => setCompositeAnalysisProtocolSchema.parse({
      analysisProtocol: { key: 'attention_v1', profile: 'standard' },
    })).toThrow()
    expect(() => setCompositeAnalysisProtocolSchema.parse({ analysisProtocol: null, keepItems: true })).toThrow()
  })
})
