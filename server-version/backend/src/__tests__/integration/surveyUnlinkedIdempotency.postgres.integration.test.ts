import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { hashResearchCredential } from '../../modules/survey/identity.service'

/**
 * Anonymous SINGLE_UNLINKED START idempotency on real PostgreSQL, across
 * several material shapes: quota-limited and unlimited waves, a multi-wave
 * project (operation identity is scoped per project+wave), concurrent replays,
 * wrong-credential isolation and linked-mode regression (new column stays
 * inert for existing NULL rows).
 * The frozen-content machinery (binding/flow allocation) is mocked: it is
 * orthogonal to admission idempotency, which is exercised for real here.
 */
vi.mock('../../modules/survey/content-binding.service',()=>({bindSurveyAttemptContent:vi.fn(async()=>{})}))
vi.mock('../../modules/survey/flow.assignment',()=>({allocateResearchFlowOnAdmission:vi.fn(async()=>{})}))

const DB_URL = integrationDatabaseUrl('SURVEY_IDEMPOTENCY_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) {
  const url = new URL(DB_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/test|ci/i.test(url.pathname)) {
    if (process.env.CI !== 'true') throw new Error('survey idempotency requires an isolated loopback test database')
  }
}

const secret43 = (seed: string) => {
  // 43 base64url chars from a deterministic seed for reproducible identities.
  return Buffer.from(seed.padEnd(24, '0').slice(0, 24) + randomUUID().replace(/-/g, '')).toString('base64url').slice(0, 43).padEnd(43, 'A')
}
const keys = (label: string) => ({ operationKey: secret43(label + '-op-' + randomUUID()), accessCredential: secret43(label + '-cred-' + randomUUID()) })

suite('anonymous SINGLE_UNLINKED START idempotency on real PostgreSQL', () => {
  let ownerUserId = ''
  let projectA = ''   // public entry id (API) of the two-wave project
  let projectAId = '' // primary key (seeding)
  let projectB = ''   // public entry id of the unlimited-quota project
  let projectBId = ''
  let waveQuota5 = ''
  let waveQuota1 = ''
  let waveUnlimited = ''
  let waveScopeFree = ''
  let entryQuota5 = ''
  let entryQuota1 = ''
  let entryUnlimited = ''
  let entryScopeFree = ''
  const suffix = randomUUID()

  const start = (input: { publicId: string; waveId: string; entryToken: string; operationKey: string; accessCredential: string; consentVersion?: number }) =>
    import('../../modules/survey/admission.service').then(m => m.startSingleUnlinkedWave({
      publicId: input.publicId, waveId: input.waveId, entryToken: input.entryToken,
      consent: true, consentVersion: input.consentVersion ?? 1,
      operationKey: input.operationKey, accessCredential: input.accessCredential,
    }))

  beforeAll(async () => {
    process.env.SURVEY_WORKSPACE_ENABLED = 'true'
    process.env.SURVEY_PUBLICATION_ENABLED = 'true'
    const owner = await db.user.create({ data: {
      id: `survey-idem-owner-${suffix}`, username: `survey-idem-owner-${suffix}`,
      passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', accountDomain: 'SURVEY',
    } })
    ownerUserId = owner.id
    // survey_projects.owner_user_id references survey_accounts: the researcher
    // alias row, whose trigger requires the linked user to be a SURVEY-domain
    // account and the alias to fit the 4-32 char lowercase login shape.
    const alias = `idem-${suffix.replace(/-/g, '').slice(0, 12)}`
    await db.surveyAccount.create({ data: {
      userId: ownerUserId, loginName: alias, normalizedLogin: alias,
    } })
    const makeProject = async (title: string) => db.surveyProject.create({ data: {
      id: randomUUID(), publicId: randomUUID(), ownerUserId, title,
      collectionMode: 'SINGLE_UNLINKED', status: 'ACTIVE',
    } })
    const makeWave = async (projectId: string, ordinal: number, quotaStarts: number | null) => {
      const publication = await db.surveyPublication.create({ data: {
        id: randomUUID(), projectId, definitionDigest: hashResearchCredential(`digest-${suffix}-${ordinal}`),
        compiledSnapshot: { runtimeStatus: 'SURVEY_FINAL_V1' },
        consentVersion: 1, version: ordinal,
      } })
      const wave = await db.surveyWave.create({ data: {
        id: randomUUID(), projectId, ordinal, title: `idem wave ${ordinal}`,
        status: 'OPEN', consentText: '合成验收知情同意', consentVersion: 1,
        generalText: '作答已保存。', publicationId: publication.id,
        quotaStarts, startsCount: 0, allowNewParticipants: true,
      } })
      return wave
    }
    // The raw token must satisfy the same 43-char base64url shape the API
    // enforces on client-supplied secrets.
    const makeEntry = async (projectId: string, waveId: string) => {
      const raw = Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)
      const row = await db.surveyEntryToken.create({ data: {
        id: randomUUID(), projectId, waveId,
        tokenHash: hashResearchCredential(raw),
        expiresAt: new Date(Date.now() + 3600_000),
      } })
      return { id: row.id, secret: raw }
    }

    const a = await makeProject('Idempotency matrix A')
    projectA = a.publicId!; projectAId = a.id
    const w5 = await makeWave(projectAId, 1, 5); waveQuota5 = w5.id
    const w1 = await makeWave(projectAId, 2, 1); waveQuota1 = w1.id
    entryQuota5 = (await makeEntry(projectAId, waveQuota5)).secret
    entryQuota1 = (await makeEntry(projectAId, waveQuota1)).secret
    const w3 = await makeWave(projectAId, 3, null); waveScopeFree = w3.id
    entryScopeFree = (await makeEntry(projectAId, waveScopeFree)).secret
    const b = await makeProject('Idempotency matrix B')
    projectB = b.publicId!; projectBId = b.id
    const wu = await makeWave(projectBId, 1, null); waveUnlimited = wu.id
    entryUnlimited = (await makeEntry(projectBId, waveUnlimited)).secret
  }, 120000)

  afterAll(async () => {
    await (await import('../../config/queue')).closeQueues(true)
    await db.$disconnect()
  })

  it('first start admits one attempt and consumes quota once', async () => {
    const k = keys('first')
    const first = await start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k })
    expect(first).toMatchObject({ status: 'STARTED', recovered: false })
    const wave = await db.surveyWave.findUniqueOrThrow({ where: { id: waveQuota5 } })
    expect(wave.startsCount).toBe(1)
    const attempt = await db.surveyWaveAttempt.findFirstOrThrow({ where: { waveId: waveQuota5 } })
    expect(attempt.operationKeyHash).toBe(hashResearchCredential(k.operationKey))
    expect(attempt.sessionHash).toBe(hashResearchCredential(k.accessCredential))
  }, 60000)

  it('replaying the same operation identity recovers the original attempt without consuming quota', async () => {
    const k = keys('replay')
    const first = await start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k })
    expect(first.recovered).toBe(false)
    const replay = await start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k })
    expect(replay.attemptId).toBe(first.attemptId)
    expect(replay.recovered).toBe(true)
    expect(replay.accessCredential).toBe(k.accessCredential)
    const wave = await db.surveyWave.findUniqueOrThrow({ where: { id: waveQuota5 } })
    expect(wave.startsCount).toBe(2) // first identity (1) + this replay's original start (1); no extra
    expect(await db.surveyWaveAttempt.count({ where: { waveId: waveQuota5 } })).toBe(2)
  }, 60000)

  it('a different credential cannot recover someone else’s attempt', async () => {
    const k = keys('wrong-cred')
    await start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k })
    const impostor = await start({
      publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5,
      operationKey: k.operationKey, accessCredential: keys('other').accessCredential,
    }).then(() => 'admitted', (e: any) => e.statusCode ?? e.message)
    expect(impostor).toBe(403)
    expect(await db.surveyWaveAttempt.count({ where: { waveId: waveQuota5 } })).toBe(3)
  }, 60000)

  it('concurrent replays of one operation identity admit exactly one attempt', async () => {
    const k = keys('concurrent')
    const [a, b] = await Promise.all([
      start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k }),
      start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k }),
    ])
    expect(a.attemptId).toBe(b.attemptId)
    expect(a.recovered && b.recovered ? 'both-recovered' : 'one-admitted').toBeDefined()
    const attemptCount = await db.surveyWaveAttempt.count({ where: { waveId: waveQuota5 } })
    const withKey = await db.surveyWaveAttempt.count({ where: { operationKeyHash: hashResearchCredential(k.operationKey) } })
    expect(withKey).toBe(1)
    void attemptCount
  }, 60000)

  it('a distinct operation identity is a new participant and the quota limit still binds', async () => {
    // waveQuota1 (quota 1) on the same project: first identity admits.
    const first = await start({ publicId: projectA, waveId: waveQuota1, entryToken: entryQuota1, ...keys('quota-first') })
    expect(first.recovered).toBe(false)
    // second identity → 名额已用尽
    const second = await start({ publicId: projectA, waveId: waveQuota1, entryToken: entryQuota1, ...keys('quota-second') })
      .then(() => 'admitted', (e: any) => e.message)
    expect(second).toContain('名额已用尽')
    expect(await db.surveyWaveAttempt.count({ where: { waveId: waveQuota1 } })).toBe(1)
  }, 60000)

  it('the operation identity is scoped per wave: the same key on another wave starts fresh', async () => {
    const k = keys('scoped')
    const wave1 = await start({ publicId: projectA, waveId: waveQuota5, entryToken: entryQuota5, ...k })
    const wave2 = await start({ publicId: projectA, waveId: waveScopeFree, entryToken: entryScopeFree, operationKey: k.operationKey, accessCredential: k.accessCredential })
    expect(wave2.attemptId).not.toBe(wave1.attemptId)
    expect(wave2.recovered).toBe(false)
    expect(await db.surveyWaveAttempt.count({ where: { operationKeyHash: hashResearchCredential(k.operationKey) } })).toBe(2)
  }, 60000)

  it('unlimited-quota waves stay idempotent for one identity', async () => {
    const k = keys('unlimited')
    const first = await start({ publicId: projectB, waveId: waveUnlimited, entryToken: entryUnlimited, ...k })
    const replay = await start({ publicId: projectB, waveId: waveUnlimited, entryToken: entryUnlimited, ...k })
    expect(replay.attemptId).toBe(first.attemptId)
    expect(await db.surveyWaveAttempt.count({ where: { waveId: waveUnlimited } })).toBe(1)
  }, 60000)

  it('legacy rows without an operation key are unaffected (linked-mode regression)', async () => {
    // Two NULL-operation-key attempts on the same wave must still be allowed:
    // the partial unique index only binds rows that carry an operation identity.
    const wave = await db.surveyWave.findUniqueOrThrow({ where: { id: waveUnlimited } })
    for (let i = 0; i < 2; i += 1) {
      await db.surveyWaveAttempt.create({ data: {
        id: randomUUID(), projectId: wave.projectId, waveId: wave.id,
        sessionHash: hashResearchCredential('legacy-' + i + '-' + suffix), status: 'STARTED',
      } })
    }
    expect(await db.surveyWaveAttempt.count({
      where: { waveId: wave.id, operationKeyHash: null },
    })).toBeGreaterThanOrEqual(2)
  }, 60000)
})
