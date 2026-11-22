import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  bind: vi.fn(),
  allocate: vi.fn(),
  transaction: vi.fn(),
  projectFindFirst: vi.fn(),
  entryTokenFindFirst: vi.fn(),
  waveFindFirst: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    $transaction: m.transaction,
    $queryRaw: m.queryRaw,
    surveyProject: { findFirst: m.projectFindFirst },
    surveyEntryToken: { findFirst: m.entryTokenFindFirst },
    surveyWave: { findFirst: m.waveFindFirst },
  },
}))
vi.mock('../../modules/survey/content-binding.service', () => ({ bindSurveyAttemptContent: m.bind }))
vi.mock('../../modules/survey/flow.assignment', () => ({ allocateResearchFlowOnAdmission: m.allocate }))
vi.mock('../../modules/survey/identity.service', () => ({
  createLinkedResearchIdentity: vi.fn(),
  recoverLinkedResearchIdentity: vi.fn(async () => ({ participantId: 'person' })),
  freshUnlinkedSession: () => ({ sessionHash: 'hash', accessCredential: 'a'.repeat(43) }),
  hashResearchCredential: (v: string) => `hash:${v}`,
}))

import {
  getPublicResearchInfo,
  resetSurveyPublicationCachesForTests,
  startSingleUnlinkedWave,
} from '../../modules/survey/admission.service'

const publicId = '11111111-1111-4111-8111-111111111111'
const entryToken = 'a'.repeat(43)
const snapshot = { runtimeStatus: 'SURVEY_FINAL_V1', units: [{ kind: 'FORM', instrumentKey: 'form' }] }

beforeEach(() => {
  vi.resetAllMocks()
  resetSurveyPublicationCachesForTests()
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
  vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
})

describe('Survey START wave lock, atomic quota claim, and /info single-flight', () => {
  it('uses FOR KEY SHARE on survey_waves and runs end-of-tx advisory quota claim after content binding', async () => {
    const order: string[] = []
    m.projectFindFirst.mockResolvedValue({
      id: 'project',
      title: 'T',
      description: null,
      collectionMode: 'SINGLE_UNLINKED',
      status: 'ACTIVE',
      participantIdentityMode: 'ANON',
      participantCodeLabel: null,
      participantCodeInstructions: null,
    })
    m.entryTokenFindFirst.mockResolvedValue({ id: 'entry' })
    m.waveFindFirst.mockResolvedValue({
      publicationId: 'publication',
      publication: { id: 'publication', compiledSnapshot: snapshot },
    })

    const waveLockSql: string[] = []
    const executeSql: string[] = []
    const tx: any = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join(' ')
        if (sql.includes('"owner_user_id"')) {
          return [{ ownerUserId: 'owner', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' }]
        }
        waveLockSql.push(sql)
        return [{
          id: 'wave',
          projectId: 'project',
          publicationId: 'publication',
          status: 'OPEN',
          opensAt: null,
          closesAt: null,
          hardStopAt: null,
          consentVersion: 1,
          startsCount: 0,
          quotaStarts: 100,
        }]
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
        order.push('claimQuota')
        executeSql.push(strings.join(' '))
        return 1
      }),
      surveyEntryToken: { findFirst: vi.fn(async () => ({ id: 'entry' })) },
      surveyWaveAttempt: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          order.push('createAttempt')
          return { id: 'attempt-1' }
        }),
      },
      surveyConsent: { create: vi.fn(async () => undefined) },
    }
    m.bind.mockImplementation(async () => { order.push('bind') })
    m.allocate.mockImplementation(async () => { order.push('allocate') })
    m.transaction.mockImplementation(async (fn: any) => fn(tx))

    const first = await startSingleUnlinkedWave({
      publicId,
      waveId: 'wave',
      entryToken,
      consent: true,
      consentVersion: 1,
      operationKey: 'k'.repeat(43),
      accessCredential: 'c'.repeat(43),
    })

    expect(first.attemptId).toBe('attempt-1')
    expect(waveLockSql[0]).toContain('FOR KEY SHARE')
    expect(waveLockSql[0]).not.toContain('FOR UPDATE')
    expect(executeSql[0]).toContain('pg_advisory_xact_lock')
    expect(executeSql[0]).toContain('"starts_count" = "starts_count" + 1')
    expect(order).toEqual(['createAttempt', 'allocate', 'bind', 'claimQuota'])
    expect(m.entryTokenFindFirst).toHaveBeenCalledTimes(1)

    // Second start hits warm preparedPublicationCache and skips redundant pre-tx token query,
    // while keeping authoritative in-tx validateEntry.
    await startSingleUnlinkedWave({
      publicId,
      waveId: 'wave',
      entryToken,
      consent: true,
      consentVersion: 1,
      operationKey: 'm'.repeat(43),
      accessCredential: 'd'.repeat(43),
    })
    expect(m.entryTokenFindFirst).toHaveBeenCalledTimes(1)
    expect(tx.surveyEntryToken.findFirst).toHaveBeenCalledTimes(2)
  })

  it('rejects cleanly when end-of-tx atomic quota claim returns 0 rows', async () => {
    m.projectFindFirst.mockResolvedValue({
      id: 'project',
      title: 'T',
      description: null,
      collectionMode: 'SINGLE_UNLINKED',
      status: 'ACTIVE',
      participantIdentityMode: 'ANON',
      participantCodeLabel: null,
      participantCodeInstructions: null,
    })
    m.entryTokenFindFirst.mockResolvedValue({ id: 'entry' })
    m.waveFindFirst.mockResolvedValue(null)
    const tx: any = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => (
        strings.join(' ').includes('"owner_user_id"')
          ? [{ ownerUserId: 'owner', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' }]
          : [{
              id: 'wave',
              projectId: 'project',
              publicationId: 'publication',
              status: 'OPEN',
              opensAt: null,
              closesAt: null,
              hardStopAt: null,
              consentVersion: 1,
              startsCount: 99,
              quotaStarts: 100,
            }]
      )),
      $executeRaw: vi.fn(async () => 0),
      surveyEntryToken: { findFirst: vi.fn(async () => ({ id: 'entry' })) },
      surveyWaveAttempt: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'attempt-2' })) },
      surveyConsent: { create: vi.fn(async () => undefined) },
    }
    m.bind.mockResolvedValue(undefined)
    m.allocate.mockResolvedValue(undefined)
    m.transaction.mockImplementation(async (fn: any) => fn(tx))

    await expect(startSingleUnlinkedWave({
      publicId,
      waveId: 'wave',
      entryToken,
      consent: true,
      consentVersion: 1,
      operationKey: 'n'.repeat(43),
      accessCredential: 'e'.repeat(43),
    })).rejects.toMatchObject({ statusCode: 403, message: '本波次参与名额已用尽' })
  })

  it('coalesces concurrent getPublicResearchInfo calls via single-flight with zero TTL staleness', async () => {
    let releaseProject!: () => void
    const gate = new Promise<void>(resolve => { releaseProject = resolve })
    m.projectFindFirst.mockImplementation(async () => {
      await gate
      return {
        id: 'project',
        title: 'Study',
        description: null,
        collectionMode: 'SINGLE_UNLINKED',
        status: 'ACTIVE',
        participantIdentityMode: 'ANON',
        participantCodeLabel: null,
        participantCodeInstructions: null,
      }
    })
    m.entryTokenFindFirst.mockResolvedValue({ waveId: 'wave-1', wave: { groupIpPolicy: null } })
    m.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ')
      if (sql.includes('FROM survey_waves')) {
        return [{
          id: 'wave-1',
          title: 'Wave 1',
          ordinal: 1,
          status: 'OPEN',
          consentText: 'Consent',
          consentVersion: 1,
          opensAt: null,
          closesAt: null,
          allowNewParticipants: true,
          groupIpPolicy: null,
          groupIpActivatedAt: null,
          publicationId: 'pub-1',
        }]
      }
      return [{ id: 'pub-1', measurementNotice: null }]
    })

    const p1 = getPublicResearchInfo(publicId, entryToken)
    const p2 = getPublicResearchInfo(publicId, entryToken)
    const p3 = getPublicResearchInfo(publicId, entryToken)
    releaseProject()
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    expect(r1.project.name).toBe('Study')
    expect(r2).toEqual(r1)
    expect(r3).toEqual(r1)
    expect(m.projectFindFirst).toHaveBeenCalledTimes(1)
    expect(m.entryTokenFindFirst).toHaveBeenCalledTimes(1)

    // Sequential call after completion reads fresh (TTL = 0).
    await getPublicResearchInfo(publicId, entryToken)
    expect(m.projectFindFirst).toHaveBeenCalledTimes(2)
  })
})
