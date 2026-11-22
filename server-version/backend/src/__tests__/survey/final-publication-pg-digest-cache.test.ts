import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import * as canonical from '../../modules/assessment-runtime/canonical'
import { resetSurveyFinalPublicationCacheForTests } from '../../modules/survey/final.compute'
import { submitResearchFinal } from '../../modules/survey/final.service'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'

const mocks = vi.hoisted(() => ({
  verified: vi.fn(),
  transaction: vi.fn(),
  attempt: vi.fn(),
  final: vi.fn(),
  lock: vi.fn(),
  encrypt: vi.fn(),
  consent: vi.fn(),
  createFinal: vi.fn(),
  updateAttempt: vi.fn(),
  deleteCheckpoint: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: { $transaction: mocks.transaction, $queryRaw: mocks.lock } }))
vi.mock('../../services/questionnaireProgressService', () => ({ withFinalOnlyCompletionTransaction: mocks.transaction }))
vi.mock('../../modules/survey/admission.service', () => ({
  verifiedSurveyAttempt: mocks.verified,
  verifiedSurveyFinalLocator: mocks.verified,
}))
vi.mock('../../modules/survey/identity.service', () => ({ hashResearchCredential: () => 'credential-hash' }))
vi.mock('../../modules/assessment-runtime/security', () => ({ encryptUnifiedRuntimePayload: mocks.encrypt }))

function snapshot(): ResearchFrozenPublication {
  const form = {
    schemaVersion: 1,
    pages: [{
      pageKey: 'page',
      title: 'Synthetic',
      questions: [{
        itemKey: 'choice',
        type: 'SINGLE',
        prompt: 'Choose',
        required: true,
        options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }],
        rows: [],
      }],
    }],
  }
  return {
    schemaVersion: 1,
    purpose: 'RESEARCH_ONLY',
    projectId: 'project',
    waveId: 'wave',
    collectionMode: 'SINGLE_UNLINKED',
    consentVersion: 1,
    linkageNoticeConfirmed: false,
    consentDigest: 'consent',
    runtimeStatus: 'SURVEY_FINAL_V1',
    units: [{
      draftId: 'draft',
      instrumentKey: 'form',
      kind: 'FORM',
      title: 'Synthetic',
      draftRevision: 1,
      sourceDigest: 'source',
      scoringDigest: null,
      compiledDefinition: form,
      displayDefinition: form,
    }],
  }
}

const sqlText = (query: any): string => (
  Array.isArray(query?.strings) ? query.strings.join('?') : String(query?.sql ?? query)
)

const oldFlag = process.env.SURVEY_PUBLICATION_ENABLED

describe('Survey FINAL PG-digest publication fast path', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetSurveyFinalPublicationCacheForTests()
    process.env.SURVEY_PUBLICATION_ENABLED = 'true'
  })

  afterEach(() => {
    process.env.SURVEY_PUBLICATION_ENABLED = oldFlag
  })

  it('skips compiledSnapshot transfer and JS rehash on warm PG sha256 match, and rejects corrupted bytes on sha256 mismatch', async () => {
    let liveSnapshot = snapshot()
    const definitionDigest = canonicalHash(liveSnapshot)
    let livePgSha = 'd'.repeat(64)

    mocks.verified.mockResolvedValue({
      attemptId: 'attempt',
      projectId: 'project',
      waveId: 'wave',
      participantId: null,
      status: 'STARTED',
      publicationId: 'pub-1',
      definitionDigest,
      generalText: 'Thanks',
    })
    mocks.attempt.mockImplementation(async (args: any) => {
      const includeSnapshot = Boolean(args?.select?.wave?.select?.publication?.select?.compiledSnapshot)
      return {
        id: 'attempt',
        projectId: 'project',
        waveId: 'wave',
        participantId: null,
        status: 'STARTED',
        excludedAt: null,
        sessionHash: 'credential-hash',
        startedAt: new Date('2026-11-22T00:00:00Z'),
        wave: {
          id: 'wave',
          consentVersion: 1,
          generalText: 'Thanks',
          finishUntil: new Date(Date.now() + 3_600_000),
          closesAt: null,
          hardStopAt: null,
          publication: includeSnapshot
            ? { id: 'pub-1', definitionDigest, compiledSnapshot: liveSnapshot }
            : { id: 'pub-1', definitionDigest },
        },
      }
    })
    mocks.lock.mockImplementation(async (query: any) => {
      const text = sqlText(query)
      if (text.includes('snapshotSha256')) return [{ snapshotSha256: livePgSha }]
      return [{ id: 'locked' }]
    })
    mocks.final.mockResolvedValue(null)
    mocks.consent.mockResolvedValue({ id: 'consent' })
    mocks.createFinal.mockResolvedValue({ id: 'receipt', completedAt: new Date('2026-11-22T00:01:00Z') })
    mocks.updateAttempt.mockResolvedValue({ count: 1 })
    mocks.deleteCheckpoint.mockResolvedValue({ count: 1 })
    mocks.encrypt.mockReturnValue('cipher')
    mocks.transaction.mockImplementation(async (fn: any) => fn({
      $queryRaw: mocks.lock,
      surveyWaveAttempt: { findFirst: mocks.attempt, updateMany: mocks.updateAttempt },
      surveyWaveFinal: { findUnique: mocks.final, create: mocks.createFinal },
      surveyConsent: { findFirst: mocks.consent },
      surveyAttemptCheckpoint: { deleteMany: mocks.deleteCheckpoint },
    }))

    const req = {
      publicId: 'public',
      attemptId: 'attempt',
      accessCredential: 'A'.repeat(43),
      submissionId: '00000000-0000-4000-8000-000000000001',
      answers: { form: { choice: 'yes' } },
    }

    // 1. Cold miss: selects compiledSnapshot and warms PG sha256 cache
    await expect(submitResearchFinal(req)).resolves.toMatchObject({ status: 'COMPLETED', idempotent: false })
    expect(mocks.attempt.mock.calls[0][0].select.wave.select.publication.select.compiledSnapshot).toBe(true)

    // 2. Warm hit: omits compiledSnapshot from findFirst and skips full publication canonicalHash
    const hashSpy = vi.spyOn(canonical, 'canonicalHash')
    await expect(submitResearchFinal(req)).resolves.toMatchObject({ status: 'COMPLETED', idempotent: false })
    expect(mocks.attempt.mock.calls[1][0].select.wave.select.publication.select.compiledSnapshot).toBeUndefined()
    expect(hashSpy.mock.calls.filter(([v]) => (v as ResearchFrozenPublication)?.runtimeStatus === 'SURVEY_FINAL_V1')).toHaveLength(0)

    // 3. Corrupted DB bytes: live PG sha256 changes -> reloads compiledSnapshot and rejects with 403
    livePgSha = 'e'.repeat(64)
    liveSnapshot = { ...snapshot(), consentDigest: 'tampered' }
    await expect(submitResearchFinal(req)).rejects.toMatchObject({ statusCode: 403 })
  })
})
