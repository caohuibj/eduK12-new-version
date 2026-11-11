import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  flow: vi.fn(),
  bind: vi.fn(),
  claim: vi.fn(),
  person: vi.fn(),
  attempt: vi.fn(),
  consent: vi.fn(),
  codeCreate: vi.fn(),
  codeFind: vi.fn(),
  codeUpdate: vi.fn(),
  scrypt: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: { $transaction: mocks.transaction, $queryRaw: mocks.query },
}))
vi.mock('../../modules/survey/flow.assignment', () => ({ allocateResearchFlowOnAdmission: mocks.flow }))
vi.mock('../../modules/survey/content-binding.service', () => ({ bindSurveyAttemptContent: mocks.bind }))
vi.mock('../../modules/survey/memorable-code.crypto', async (original) => {
  const actual = await original<typeof import('../../modules/survey/memorable-code.crypto')>()
  return {
    ...actual,
    memorableCredential: mocks.scrypt,
    generateStudyCode: () => 'GENCODE1SKY7XX',
    generatedCodeLookup: () => '001',
  }
})

import { createLinkedResearchIdentity, ResearchIdentityError } from '../../modules/survey/identity.service'

const entryToken = 'a'.repeat(43)
const memorable = { prefix: '001', suffix: 'SKY7' }
const openWave = {
  waveId: 'wave', ordinal: 1, allowNewParticipants: true, consentVersion: 1,
  startsCount: 0, quotaStarts: null, publicationId: 'pub', groupIpPolicy: null, closesAt: null,
}

const tx = {
  $queryRaw: mocks.query,
  surveyWave: { updateMany: mocks.claim },
  surveyParticipant: { create: mocks.person },
  surveyWaveAttempt: { create: mocks.attempt },
  surveyConsent: { create: mocks.consent },
  surveyParticipantCode: { create: mocks.codeCreate, findUnique: mocks.codeFind, update: mocks.codeUpdate },
}

type QueryPlan = {
  project?: Record<string, unknown>[]
  wave?: Record<string, unknown>[]
  codeVersion?: Record<string, unknown>[]
  lockedCode?: Record<string, unknown>[]
}

function sqlText(query: unknown, rest: unknown[]): string {
  const raw = typeof query === 'object' && query && 'strings' in (query as object)
    ? (query as { strings: string[] }).strings.join('?')
    : Array.isArray(query)
      ? (query as string[]).join('?')
      : String(query ?? '')
  return `${raw} ${rest.map(String).join(' ')}`
}

function queueQueries(plan: QueryPlan) {
  mocks.query.mockImplementation(async (query: unknown, ...rest: unknown[]) => {
    const sql = sqlText(query, rest)
    if (sql.includes('survey_waves') || sql.includes('consent_version') || sql.includes('allow_new_participants')) {
      return plan.wave ?? []
    }
    if (sql.includes('survey_projects') || sql.includes('collection_mode') || sql.includes('collectionMode')) {
      return plan.project ?? []
    }
    if (sql.includes('participantId') || sql.includes('participant_id')) {
      return plan.lockedCode ?? []
    }
    if (sql.includes('survey_participant_codes') || sql.includes('credential_version')) {
      return plan.codeVersion ?? []
    }
    throw new Error(`unexpected survey query: ${sql}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx))
  mocks.claim.mockResolvedValue({ count: 1 })
  mocks.bind.mockResolvedValue(undefined)
  mocks.scrypt.mockResolvedValue('precomputed-secret')
  mocks.codeFind.mockResolvedValue(null)
  mocks.codeCreate.mockResolvedValue({ id: 'code-row' })
})

describe('linked enrollment prechecks before scrypt', () => {
  it('does not compute scrypt for a generated code when the unlocked wave preview fails', async () => {
    queueQueries({ project: [] })
    await expect(createLinkedResearchIdentity({
      projectId: 'project', waveId: 'wave', entryToken, consentVersion: 1, consent: true, generatedCode: true,
    })).rejects.toBeInstanceOf(ResearchIdentityError)
    expect(mocks.scrypt).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not compute scrypt for a memorable code when consent is stale', async () => {
    queueQueries({
      project: [{ id: 'project', collectionMode: 'LINKED_WAVES' }],
      wave: [{ ...openWave, consentVersion: 2 }],
    })
    await expect(createLinkedResearchIdentity({
      projectId: 'project', waveId: 'wave', entryToken, consentVersion: 1, consent: true, memorable,
    })).rejects.toBeInstanceOf(ResearchIdentityError)
    expect(mocks.scrypt).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps the in-transaction wave lock check after a successful preview and scrypt', async () => {
    queueQueries({
      project: [{ id: 'project', collectionMode: 'LINKED_WAVES' }],
      wave: [openWave],
      codeVersion: [{ credentialVersion: 0 }],
      lockedCode: [{ id: 'code-row', participantId: null, credentialVersion: 0 }],
    })
    const result = await createLinkedResearchIdentity({
      projectId: 'project', waveId: 'wave', entryToken, consentVersion: 1, consent: true, memorable,
    })
    expect(mocks.scrypt).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(result.accessCredential).toBe('precomputed-secret')
  })
})
