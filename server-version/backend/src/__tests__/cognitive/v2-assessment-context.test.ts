import { beforeAll, describe, expect, it } from 'vitest'
import {
  hashAssessmentContext,
  type AssessmentContextV1,
} from '../../modules/assessment-context'
import {
  encryptAssessmentContext,
} from '../../modules/assessment-context/security'
import {
  ensureCognitiveAssessmentContext,
  readCognitiveAssessmentContext,
} from '../../modules/cognitive/v2/assessment-context'

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.ASSESSMENT_CONTEXT_HASH_KEY = 'b'.repeat(64)
})

const context: AssessmentContextV1 = {
  schemaVersion: 1,
  frozenAt: '2026-08-27T00:00:00.000Z',
  values: {
    birthYearMonth: '2017-08',
    ageMonthsAtFreeze: 108,
    ageYearsAtFreeze: 9,
    gradeLevel: '3',
    primaryLanguage: 'zh-CN',
    countryOrRegion: 'CN',
  },
}

const dbFor = (row: { contextSnapshotEncrypted: string | null; contextSnapshotHash: string | null }) => ({
  compositeAssessmentAttempt: {
    findUnique: async () => row,
  },
})

describe('Cognitive v2 assessment context boundary', () => {
  it('keeps standalone sessions context-free', async () => {
    await expect(ensureCognitiveAssessmentContext({}, { compositeAttemptId: null })).resolves.toEqual({
      context: null,
      reference: null,
    })
  })

  it('reads a valid parent snapshot and returns only its hash reference', async () => {
    const encrypted = encryptAssessmentContext(context)
    const hash = hashAssessmentContext(context)
    const result = await ensureCognitiveAssessmentContext(
      dbFor({ contextSnapshotEncrypted: encrypted, contextSnapshotHash: hash }),
      { compositeAttemptId: 'attempt-1' },
    )
    expect(result.context).toEqual(context)
    expect(result.reference).toEqual({ schemaVersion: 1, snapshotHash: hash })
  })

  it('fails closed when a stored parent snapshot hash does not match', async () => {
    await expect(readCognitiveAssessmentContext(
      dbFor({
        contextSnapshotEncrypted: encryptAssessmentContext(context),
        contextSnapshotHash: '0'.repeat(64),
      }),
      { compositeAttemptId: 'attempt-1' },
    )).rejects.toThrow(/hash mismatch/)
  })

  it('does not turn a missing context into an empty composite context', async () => {
    await expect(readCognitiveAssessmentContext(
      dbFor({ contextSnapshotEncrypted: null, contextSnapshotHash: null }),
      { compositeAttemptId: 'attempt-1' },
    )).rejects.toThrow(/missing the frozen assessment context/)
  })
})
