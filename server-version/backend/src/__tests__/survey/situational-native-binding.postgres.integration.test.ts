import { randomUUID } from 'node:crypto'
import { PrismaClient, type Prisma } from '@prisma/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_SJT_BINDING_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
/** Database relationship fixtures only, deliberately not executable scientific
 * snapshots. Every fixture is rolled back; this is not runtime acceptance. */
suite('Survey SJT additive host binding PostgreSQL constraints', () => {
  let db: PrismaClient
  beforeAll(async () => { requireIsolatedReleaseDatabase(url!); db = new PrismaClient({datasources: {db: {url: url!}}}); await db.$connect() })
  afterAll(async () => { await db?.$disconnect() })
  async function fixture(tx: Prisma.TransactionClient, bound = true) {
    const owner = randomUUID(), projectId = randomUUID(), publicationId = randomUUID(), waveId = randomUUID(), attemptId = randomUUID()
    await tx.user.create({data: {id: owner, username: 'synthetic-sjt-binding-' + owner, passwordHash: 'not-a-login', role: 'STUDENT', accountDomain: 'SURVEY'}})
    const login = 'sjt_' + owner.replaceAll('-', '').slice(0, 16)
    await tx.surveyAccount.create({data: {userId: owner, loginName: login, normalizedLogin: login}})
    await tx.surveyProject.create({data: {id: projectId, ownerUserId: owner, title: 'Synthetic binding only', collectionMode: 'SINGLE_UNLINKED'}})
    await tx.surveyPublication.create({data: {id: publicationId, projectId, definitionDigest: 'a'.repeat(64), compiledSnapshot: {}, consentVersion: 1, version: 1}})
    await tx.surveyWave.create({data: {id: waveId, projectId, publicationId, ordinal: 1, title: 'Synthetic', consentText: 'Synthetic fixture only', consentVersion: 1}})
    await tx.surveyWaveAttempt.create({data: {id: attemptId, projectId, waveId, sessionHash: 'b'.repeat(64),
      ...(bound ? {contentBindingCipher: 'synthetic-opaque-binding', contentBindingHash: 'c'.repeat(64)} : {})}})
    const child = {id: randomUUID(), participantKey: 'synthetic-' + randomUUID(), instrumentKey: 'synthetic-binding', instrumentVersion: '1.0.0',
      definitionHash: 'd'.repeat(64), compiledRuntimeHash: 'e'.repeat(64), scorerKey: 'situational.default', scoringVersion: 'synthetic',
      frozenAt: new Date(), runtimeSnapshotEncrypted: 'synthetic-opaque-not-executable',
      surveyAttemptId: attemptId, surveyPublicationId: publicationId, surveySlotKey: 'sjt', attemptEpoch: 1}
    return {owner, projectId, publicationId, waveId, attemptId, child}
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  async function isolated(work: (tx: Prisma.TransactionClient, f: Fixture) => Promise<void>, bound = true) {
    const rollback = new Error('ROLLBACK_SYNTHETIC_BINDING_FIXTURE')
    await expect(db.$transaction(async tx => { await work(tx, await fixture(tx, bound)); throw rollback }, {timeout: 15000})).rejects.toBe(rollback)
  }
  it('accepts exact frozen parent/publication and keeps native out of standalone uniqueness', async () => isolated(async (tx, f) => {
    const native = await tx.situationalAttempt.create({data: f.child})
    expect(native.surveyAttemptId).toBe(f.attemptId)
    const {surveyAttemptId: _a, surveyPublicationId: _p, surveySlotKey: _s, ...legacy} = f.child
    const standalone = await tx.situationalAttempt.create({data: {...legacy, id: randomUUID(), userId: f.owner}})
    expect(standalone.surveyAttemptId).toBeNull()
    await tx.situationalAttempt.update({where: {id: native.id}, data: {progress: 1}})
    expect((await tx.situationalAttempt.findUniqueOrThrow({where: {id: native.id}})).progress).toBe(1)
  }))
  it('rejects a parent with no frozen content binding rather than upgrading it', async () => isolated(async (tx, f) => {
    await expect(tx.situationalAttempt.create({data: f.child})).rejects.toThrow('SITUATIONAL_SURVEY_PARENT_NOT_FROZEN')
  }, false))
  it('rejects an existing but different publication in the same project', async () => isolated(async (tx, f) => {
    const other = randomUUID()
    await tx.surveyPublication.create({data: {id: other, projectId: f.projectId, definitionDigest: 'f'.repeat(64), compiledSnapshot: {}, consentVersion: 1, version: 2}})
    await expect(tx.situationalAttempt.create({data: {...f.child, surveyPublicationId: other}})).rejects.toThrow('SITUATIONAL_SURVEY_PUBLICATION_MISMATCH')
  }))
  it('rejects a partial Survey binding', async () => isolated(async (tx, f) => {
    await expect(tx.situationalAttempt.create({data: {...f.child, surveySlotKey: null}})).rejects.toThrow()
  }))
  it('rejects dual standalone/Survey ownership', async () => isolated(async (tx, f) => {
    await expect(tx.situationalAttempt.create({data: {...f.child, userId: f.owner}})).rejects.toThrow()
  }))
  it('rejects a second child for the same parent slot epoch', async () => isolated(async (tx, f) => {
    await tx.situationalAttempt.create({data: f.child})
    await expect(tx.situationalAttempt.create({data: {...f.child, id: randomUUID()}})).rejects.toThrow()
  }))
  it.each(['surveyAttemptId', 'surveyPublicationId', 'surveySlotKey', 'attemptEpoch', 'participantKey'] as const)('rejects changing frozen %s', async field => isolated(async (tx, f) => {
    await tx.situationalAttempt.create({data: f.child})
    await expect(tx.situationalAttempt.update({where: {id: f.child.id}, data: {[field]: field === 'attemptEpoch' ? 2 : 'changed'}})).rejects.toThrow('SITUATIONAL_SURVEY_HOST_IMMUTABLE')
  }))
  it('does not permit adopting a legacy row into Survey', async () => isolated(async (tx, f) => {
    const {surveyAttemptId, surveyPublicationId, surveySlotKey, ...legacy} = f.child
    await tx.situationalAttempt.create({data: legacy})
    await expect(tx.situationalAttempt.update({where: {id: f.child.id}, data: {surveyAttemptId, surveyPublicationId, surveySlotKey}})).rejects.toThrow('SITUATIONAL_SURVEY_HOST_IMMUTABLE')
  }))
  it('retains the existing parent-wave immutability supporting the binding', async () => isolated(async (tx, f) => {
    await tx.situationalAttempt.create({data: f.child})
    await expect(tx.surveyWaveAttempt.update({where: {id: f.attemptId}, data: {waveId: randomUUID()}})).rejects.toThrow('SURVEY_ATTEMPT_CONTENT_BINDING_IMMUTABLE')
  }))
  it('retains the existing published-wave immutability supporting the binding', async () => isolated(async (tx, f) => {
    await tx.situationalAttempt.create({data: f.child})
    await expect(tx.surveyWave.update({where: {id: f.waveId}, data: {publicationId: null}})).rejects.toThrow('immutable')
  }))
})
