import { beforeEach, describe, expect, it, vi } from 'vitest'
const composite = vi.hoisted(() => ({
  startPublicAttempt: vi.fn(),
  projectStartedAttempt: vi.fn(),
  assertPublicCompositeAdmission: vi.fn(),
  getPublicCompositeInfo: vi.fn(),
  revealAccessToken: vi.fn(),
  createAccessTokenForComposite: vi.fn(),
}))
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  compositeAssessmentAttempt: { findFirst: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/composite/composite.service', () => composite)
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: {} }))
vi.mock('../../modules/composite/composite-export-projection', () => ({}))
import { recoverStudyWave, startStudyWave } from '../../modules/anonymous-study/service'

const credential = 'a'.repeat(43)
const hash = 'ab'.repeat(32)
const wave = {
  id: 'wave', studyId: 'study', studyTitle: 'Study', studyStatus: 'ACTIVE', title: 'Wave', ordinal: 1,
  mode: 'PERSONAL_LINK', label: '编号', instructions: '',
  tokenId: 'tok', compositeId: 'comp', token: 'public-token', tokenEncrypted: null, active: true,
  expiresAt: new Date('2030-01-01T00:00:00Z'), status: 'PUBLISHED', publicEnabled: true, ownerActive: true,
}
const participant = { id: 'person', displayCode: 'P-1', title: 'Study', status: 'ACTIVE', generation: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
  db.$queryRaw.mockImplementation((query: TemplateStringsArray) => {
    const sql = query.join('')
    if (sql.includes('anonymous_study_participants p')) return Promise.resolve([participant])
    if (sql.includes('FROM anonymous_study_waves w')) return Promise.resolve([wave])
    if (sql.includes('FROM anonymous_study_attempts sa')) return Promise.resolve([{ id: 'attempt', state: 'IN_PROGRESS' }])
    return Promise.resolve([])
  })
})

describe('anonymous study whole-template hash', () => {
  it('returns a binding when the client already knows the template, and the full definition otherwise', async () => {
    composite.startPublicAttempt.mockResolvedValueOnce({
      attempt: { id: 'attempt', status: 'IN_PROGRESS' },
      wholeBinding: { templateHash: hash },
    })
    const known = await startStudyWave('study', 'wave', credential, { wantsWholeDelivery: true, knownTemplateHashes: new Set([hash]) })
    expect(known).toMatchObject({ attemptId: 'attempt', wholeBinding: { templateHash: hash } })
    expect(known).not.toHaveProperty('wholeDefinition')
    expect(composite.startPublicAttempt.mock.calls[0][3]).toMatchObject({
      wantsWholeDelivery: true,
      knownTemplateHashes: new Set([hash]),
    })

    composite.startPublicAttempt.mockResolvedValueOnce({
      attempt: { id: 'attempt', status: 'IN_PROGRESS' },
      wholeDefinition: { templateHash: hash, units: [{ itemCode: 'q1' }] },
    })
    const cold = await startStudyWave('study', 'wave', credential, { wantsWholeDelivery: true })
    expect(cold.wholeDefinition).toMatchObject({ templateHash: hash })
    expect(cold).not.toHaveProperty('wholeBinding')
    expect(composite.startPublicAttempt.mock.calls[1][3].knownTemplateHashes).toBeUndefined()
  })

  it('passes a known hash through study recover and still returns a full definition on a miss', async () => {
    db.compositeAssessmentAttempt.findFirst.mockResolvedValue({ id: 'attempt' })
    composite.projectStartedAttempt.mockResolvedValueOnce({ wholeBinding: { templateHash: hash } })
    const known = await recoverStudyWave('study', 'wave', credential, { wantsWholeDelivery: true, knownTemplateHashes: new Set([hash]) })
    expect(known.wholeBinding).toMatchObject({ templateHash: hash })
    expect(composite.projectStartedAttempt.mock.calls[0][6]).toEqual(new Set([hash]))

    composite.projectStartedAttempt.mockResolvedValueOnce({ wholeDefinition: { templateHash: hash } })
    const cold = await recoverStudyWave('study', 'wave', credential, { wantsWholeDelivery: true })
    expect(cold.wholeDefinition).toMatchObject({ templateHash: hash })
    expect(composite.projectStartedAttempt.mock.calls[1][6]).toBeUndefined()
  })
})
