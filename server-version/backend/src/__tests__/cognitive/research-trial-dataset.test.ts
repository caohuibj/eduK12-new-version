import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveAssignment: { findUnique: vi.fn() },
    cognitiveSession: { count: vi.fn(), findMany: vi.fn() },
    cognitiveTrial: { count: vi.fn() },
    cognitiveRawSubmission: { aggregate: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  buildResearchTrialDataset,
  classifyTrialQuality,
  extractValidRtFloorMs,
  extractFrozenResearchBankFacts,
  researchParticipantId,
  summarizeTrialQuality,
} from '../../modules/cognitive/research-trial-dataset'
import { getCognitiveResearchTrialDataset } from '../../modules/cognitive/export.service'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const assignment = {
  id: 'assignment-1',
  title: '矩阵推理试测',
  courseId: 'course-1',
  course: { id: 'course-1', title: '三年级一班', courseCode: 'C-001' },
  config: { testType: 'icarmatrix', configVersion: '1.0.0-adolescent', engineVersion: '2.0.0', scoringVersion: '1.0.0' },
}

const baseSession = {
  id: 'session-1',
  userId: 'student-1',
  attemptNo: 1,
  testType: 'icarmatrix',
  configVersion: '1.0.0-adolescent',
  engineVersion: '2.0.0',
  scoringVersion: '1.0.0',
  randomSeed: 'seed-1',
  configSnapshotEncrypted: encryptCognitivePayload({ totalTrials: 8, matrixType: '3x3', stimulusSetVersion: 'matgen-bank-v1.0.0', validRtFloorMs: 500 }),
  startedAt: new Date('2026-10-31T10:00:00.000Z'),
  finishedAt: new Date('2026-10-31T10:05:00.000Z'),
  scoreEncrypted: encryptCognitivePayload(50),
  metricsEncrypted: encryptCognitivePayload({ accuracy: 0.5, medianRtMs: 4200, correctCount: 4 }),
  qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true, interrupted: false }),
  user: { id: 'student-1', nickname: '小明', username: 'student-1' },
  trials: [
    { trialIndex: 0, payloadEncrypted: encryptCognitivePayload({ trialIndex: 0, bankItemId: 'matgen-std-rotate-rotate-006', responseIndex: 2, rtMs: 4200, interrupted: false }) },
    { trialIndex: 1, payloadEncrypted: encryptCognitivePayload({ trialIndex: 1, bankItemId: 'matgen-std-identity-rotate-008', responseIndex: null, rtMs: null, interrupted: false }) },
    { trialIndex: 2, payloadEncrypted: encryptCognitivePayload({ trialIndex: 2, bankItemId: 'matgen-std-shade-rotate-009', responseIndex: 1, rtMs: 320, interrupted: false }) },
    { trialIndex: 3, payloadEncrypted: encryptCognitivePayload({ trialIndex: 3, bankItemId: 'matgen-std-identity-shape-003', responseIndex: 0, rtMs: 2800, interrupted: true }) },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment)
  mockPrisma.cognitiveSession.count.mockResolvedValue(0)
  mockPrisma.cognitiveTrial.count.mockResolvedValue(0)
  mockPrisma.cognitiveRawSubmission.aggregate.mockResolvedValue({ _sum: { trialCount: null } })
})

describe('trial quality classification (roadmap v2.0 PR4)', () => {
  it('classifies from payload observable facts with frozen-config thresholds', () => {
    expect(classifyTrialQuality({ responseIndex: 2, rtMs: 4200, interrupted: false }, 500)).toBe('complete')
    expect(classifyTrialQuality({ responseIndex: null, rtMs: null, interrupted: false }, 500)).toBe('timeout')
    expect(classifyTrialQuality({ responded: false, rtMs: null }, 500)).toBe('timeout')
    expect(classifyTrialQuality({ response: null, rtMs: 100 }, 500)).toBe('timeout')
    expect(classifyTrialQuality({ timedOut: true, responseIndex: 0, rtMs: 900 }, 500)).toBe('timeout')
    expect(classifyTrialQuality({ responseIndex: 1, rtMs: 320, interrupted: false }, 500)).toBe('rapid_guess')
    expect(classifyTrialQuality({ responseIndex: 1, rtMs: 320, interrupted: false }, null)).toBe('complete')
    expect(classifyTrialQuality({ responseIndex: 1, rtMs: 900, interrupted: true }, 500)).toBe('interrupted')
  })

  it('extracts validRtFloorMs from decoded config snapshots only', () => {
    expect(extractValidRtFloorMs({ validRtFloorMs: 500 })).toBe(500)
    expect(extractValidRtFloorMs({})).toBeNull()
    expect(extractValidRtFloorMs({ validRtFloorMs: -1 })).toBeNull()
    expect(extractValidRtFloorMs(null)).toBeNull()
    expect(extractFrozenResearchBankFacts({ stimulusSetVersion: 'matgen-bank-v1.0.0', matrixType: '3x3', totalTrials: 8 }))
      .toEqual({ stimulusSetVersion: 'matgen-bank-v1.0.0', matrixType: '3x3', plannedTotalTrials: 8 })
    expect(extractFrozenResearchBankFacts(null))
      .toEqual({ stimulusSetVersion: null, matrixType: null, plannedTotalTrials: null })
  })
})

describe('research trial dataset builder (roadmap v2.0 PR4)', () => {
  it('builds one row per trial with identity columns and quality summary', () => {
    const dataset = buildResearchTrialDataset([
      {
        id: 'session-1', userId: 'student-1', anonymousCode: null, attemptNo: 1,
        testType: 'icarmatrix', engineVersion: '2.0.0', scoringVersion: '1.0.0',
        configVersion: '1.0.0-adolescent', stimulusSetVersion: 'matgen-bank-v1.0.0', matrixType: '3x3', plannedTotalTrials: 2, randomSeed: 'seed-1', validRtFloorMs: 500,
        trials: [
          { trialIndex: 1, payload: { trialIndex: 1, responseIndex: null, rtMs: null, interrupted: false } },
          { trialIndex: 0, payload: { trialIndex: 0, responseIndex: 2, rtMs: 4200, interrupted: false } },
        ],
      },
    ], { generatedAtUtc: '2026-10-31T00:00:00Z' })
    expect(dataset.dataOrigin).toBe('real')
    expect(dataset.rowCount).toBe(2)
    expect(dataset.rows.map((row) => row.trialIndex)).toEqual([0, 1])
    expect(dataset.identities).toEqual([{ testType: 'icarmatrix', engineVersion: '2.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0-adolescent', rows: 2 }])
    expect(dataset.qualitySummary).toMatchObject({ rowCount: 2, completeCount: 1, timeoutCount: 1, completeRate: 0.5, timeoutRate: 0.5 })
    expect(dataset.rows[0]).toMatchObject({
      randomSeed: 'seed-1', trialQuality: 'complete',
      stimulusSetVersion: 'matgen-bank-v1.0.0', matrixType: '3x3', plannedTotalTrials: 2,
    })
    expect(dataset.rows[0].participantId).toMatch(/^U[a-f0-9]{32}$/)
  })

  it('keeps participant pseudonyms stable under the export anonymization convention', () => {
    expect(researchParticipantId({ id: 's1', anonymousCode: 'PUB-7', userId: 'u1' }, true)).toBe('PUB-7')
    const a = researchParticipantId({ id: 's1', anonymousCode: null, userId: 'student-1' }, true)
    const b = researchParticipantId({ id: 's2', anonymousCode: null, userId: 'student-2' }, true)
    expect(a).toMatch(/^U[a-f0-9]{32}$/)
    expect(b).not.toBe(a)
    expect(researchParticipantId({ id: 'other-session', anonymousCode: null, userId: 'student-1' }, true)).toBe(a)
    expect(researchParticipantId({ id: 's1', anonymousCode: null, userId: 'student-1' }, false)).toBe('student-1')
    expect(researchParticipantId({ id: 's1', anonymousCode: null, userId: null }, true)).not.toBe(
      researchParticipantId({ id: 's2', anonymousCode: null, userId: null }, true)
    )
  })

  it('summarizes rates as null on empty datasets', () => {
    expect(summarizeTrialQuality([])).toMatchObject({ rowCount: 0, completeRate: null, timeoutRate: null })
  })
})

describe('assignment-scoped trial dataset export (roadmap v2.0 PR4)', () => {
  it('decrypts legacy trials and the config snapshot into a real-origin dataset', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([baseSession])
    const dataset = await getCognitiveResearchTrialDataset('assignment-1', { anonymize: true })
    expect(dataset.schemaVersion).toBe(1)
    expect(dataset.dataOrigin).toBe('real')
    expect(dataset.rowCount).toBe(4)
    expect(dataset.qualitySummary).toMatchObject({
      rowCount: 4, completeCount: 1, timeoutCount: 1, rapidGuessCount: 1, interruptedCount: 1,
      interruptedRate: 0.25, rapidGuessRate: 0.25,
    })
    expect(dataset.rows[0].payload).toMatchObject({ bankItemId: 'matgen-std-rotate-rotate-006' })
    expect(dataset.rows[2].trialQuality).toBe('rapid_guess')
    expect(dataset.rows[0]).toMatchObject({ stimulusSetVersion: 'matgen-bank-v1.0.0', matrixType: '3x3', plannedTotalTrials: 8 })
    await expect(getCognitiveResearchTrialDataset('assignment-1', { previewLimit: 1 })).rejects.toThrow(/previewLimit/)
    const query = mockPrisma.cognitiveSession.findMany.mock.calls[0][0]
    expect(query.include).toHaveProperty('trials')
    expect(query.include).toHaveProperty('rawSubmissions')
  })
})
