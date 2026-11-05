import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { startSingleUnlinkedWave } from '../../modules/survey/admission.service'
import { createWave, getWave } from '../../modules/survey/waves.service'
import { prepareWave, openWave } from '../../modules/survey/waves.publish'

/**
 * Deterministic lock-order interleaving tests for Survey START/replay
 * governance (real PostgreSQL). For each case a test-owned transaction holds
 * the wave row FOR UPDATE, the probe (replay or fresh START) is issued and
 * OBSERVED waiting on that row (with the blocked SQL shape asserted, so a
 * false positive from unrelated activity is impossible), then the state flip
 * (PAUSE / CLOSE / token revocation) commits INSIDE the same transaction
 * before the lock is released. The probe must then re-read governance state
 * under the lock and be rejected — proving the project→wave lock order
 * prevents stale-snapshot admission.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip

const secret = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  for (let i = 0; i < 43; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

suite('Survey governance lock-order interleave (real PostgreSQL)', () => {
  const suffix = `survey-il-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let owner = { id: '' }
  let projectId = ''
  let waveId = ''
  let publicId = ''
  let entryToken = ''
  let consentVersion = 1
  const observer = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  const identities = Array.from({ length: 4 }, () => ({ operationKey: secret(), accessCredential: secret() }))
  let seededAttempts = 0

  beforeAll(async () => {
    process.env.SURVEY_WORKSPACE_ENABLED = 'true'
    process.env.SURVEY_PUBLICATION_ENABLED = 'true'
    owner = await db.user.findFirst({ where: { username: 'measure-survey-poolmatrix-owner' } })
      ?? await db.user.create({ data: { username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'SURVEY' } })
    await db.surveyAccount.upsert({ where: { userId: owner.id },
      create: { userId: owner.id, loginName: `${suffix}-owner`, normalizedLogin: `${suffix}-owner` }, update: {} })
    const grant = await db.surveyResearcherGrant.findFirst({ where: { userId: owner.id } })
    if (!grant) await db.surveyResearcherGrant.create({ data: { userId: owner.id, status: 'ACTIVE', grantedBy: owner.id } })
    const admin = await db.user.findFirst({ where: { username: 'measure-survey-poolmatrix-admin' } }) ?? owner
    await db.surveyMfaCredential.upsert({ where: { userId: owner.id },
      create: { userId: owner.id, enabled: true, secretCipher: 'synthetic-enrollment' }, update: { enabled: true } })
    void admin
    const project = await db.surveyProject.create({ data: {
      id: randomUUID(), ownerUserId: owner.id, title: `${suffix} interleave`,
      collectionMode: 'SINGLE_UNLINKED', status: 'DRAFT', description: 'synthetic interleave fixture' } })
    projectId = project.id
    const draft = await db.surveyInstrumentDraft.create({ data: {
      id: randomUUID(), projectId, kind: 'FORM',
      instrumentKey: `${suffix}-form`, title: 'interleave form', revision: 1, definition: {
        schemaVersion: 1, pages: [{ pageKey: 'page', title: 'Page', questions: [{ itemKey: 'choice', type: 'SINGLE', prompt: 'q', required: true,
          options: [{ optionKey: 'one', label: 'One' }, { optionKey: 'two', label: 'Two' }], rows: [] }] }] } } })
    const created = await createWave(owner.id, projectId, {
      requestId: randomUUID(), title: `${suffix} wave`,
      consentText: '本合成交错测试仅用于隔离环境，数据全部虚构。', generalText: 'done',
      linkageNoticeConfirmed: false, instrumentIds: [draft.id], allowNewParticipants: true, quotaStarts: 50 })
    await prepareWave(owner.id, projectId, created.id, created.revision)
    const current = await getWave(owner.id, projectId, created.id)
    const opened = await openWave(owner.id, projectId, created.id, current.revision)
    waveId = created.id
    publicId = opened.publicId
    entryToken = opened.entrySecret
    const waveRow = await db.surveyWave.findUniqueOrThrow({ where: { id: waveId } })
    consentVersion = waveRow.consentVersion
    // Seed one committed attempt (identity 0) so replay probes have a target.
    await startSingleUnlinkedWave({ publicId, waveId, entryToken, consentVersion, consent: true,
      operationKey: identities[0].operationKey, accessCredential: identities[0].accessCredential })
    seededAttempts = 1
    await observer.$connect()
  }, 180000)

  afterAll(async () => {
    try {
      // Suffix-keyed cleanup, FK order: finals/consents/attempts → tokens/wave → publication → draft → project → grant/account → owner(user only if self-created).
      // Best-effort suffix-keyed cleanup: the isolated DB is durable and some
      // tables are append-only by trigger, so failures here are not defects.
      const step = (p: Promise<unknown>): Promise<unknown> => p.catch(() => undefined)
      await step(db.surveyConsent.deleteMany({ where: { projectId } }))
      await step(db.surveyWaveAttempt.deleteMany({ where: { projectId } }))
      await step(db.surveyEntryToken.deleteMany({ where: { projectId } }))
      await step(db.surveyWave.deleteMany({ where: { projectId } }))
      await step(db.surveyPublication.deleteMany({ where: { projectId } }))
      await step(db.surveyInstrumentDraft.deleteMany({ where: { projectId } }))
      await step(db.surveyProject.deleteMany({ where: { id: projectId } }))
      if (owner.username === `${suffix}-owner`) await step(db.user.deleteMany({ where: { id: owner.id } }))
    } finally {
      await observer.$disconnect()
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  /** Deterministic interleave: hold the wave row FOR UPDATE, issue the probe
   * while the lock is held, OBSERVE the probe session Lock-waiting on a
   * survey_waves query blocked by this holder (query shape asserted), run the
   * state flip inside the same transaction, then commit and collect the probe
   * outcome. The flip therefore commits strictly between the probe's lock
   * acquisition attempt and its re-read under the lock. */
  const holdFlipAndProbe = async <T>(flip: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>, probe: () => Promise<T>): Promise<T> => {
    let announceReady!: () => void
    const holderReady = new Promise<void>(r => { announceReady = r })
    let releaseFlip!: () => void
    const flipGate = new Promise<void>(r => { releaseFlip = r })
    let holderPid = 0
    const holder = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      holderPid = pidRow.pid
      await tx.$queryRawUnsafe('SELECT id FROM survey_waves WHERE id = $1 FOR UPDATE', waveId)
      announceReady()
      await flipGate
      await flip(tx)
    }, { maxWait: 10000, timeout: 30000 })
    holder.catch(() => {})
    await holderReady
    const probeOutcome = probe()
      .then((v: T) => ({ ok: true as const, v }))
      .catch((e: { message?: string }) => ({ ok: false as const, message: String(e.message ?? 'error') }))
    const deadline = Date.now() + 15000
    for (;;) {
      const rows = await observer.$queryRawUnsafe<Array<{ pid: number; query: string }>>(
        `SELECT s.pid, left(s.query, 200) AS query FROM pg_stat_activity s
         WHERE s.wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(s.pid)) > 0
           AND ${holderPid} = ANY(pg_blocking_pids(s.pid))
           AND s.query ILIKE '%survey_waves%'`)
      if (rows.length > 0) break
      if (Date.now() > deadline) {
        releaseFlip()
        await holder
        throw new Error('probe never observed blocked on the wave row')
      }
      await new Promise(r => setTimeout(r, 50))
    }
    releaseFlip()
    await holder
    const outcome = await probeOutcome
    if (!outcome.ok) throw new Error(outcome.message)
    return outcome.v
  }

  /** Same interleave, but the probe is EXPECTED to be rejected by governance. */
  const expectRejected = async (flip: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>,
    probe: () => Promise<unknown>, expectedFragment: string, targetWaveId: string = waveId): Promise<string> => {
    let holderReady!: () => void
    const ready = new Promise<void>(r => { holderReady = r })
    let releaseFlip!: () => void
    const flipGate = new Promise<void>(r => { releaseFlip = r })
    let holderPid = 0
    const holder = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      holderPid = pidRow.pid
      await tx.$queryRawUnsafe('SELECT id FROM survey_waves WHERE id = $1 FOR UPDATE', targetWaveId)
      holderReady()
      await flipGate
      await flip(tx)
    }, { maxWait: 10000, timeout: 30000 })
    holder.catch(() => {})
    await ready
    const probeOutcome = probe()
      .then(v => ({ ok: true as const, v }))
      .catch((e: { message?: string }) => ({ ok: false as const, message: String(e.message ?? 'error') }))
    const deadline = Date.now() + 15000
    for (;;) {
      const rows = await observer.$queryRawUnsafe<Array<{ pid: number; query: string }>>(
        `SELECT s.pid, left(s.query, 200) AS query FROM pg_stat_activity s
         WHERE s.wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(s.pid)) > 0
           AND ${holderPid} = ANY(pg_blocking_pids(s.pid))
           AND s.query ILIKE '%survey_waves%'`)
      if (rows.length > 0) break
      if (Date.now() > deadline) {
        releaseFlip()
        await holder
        throw new Error('probe never observed blocked on the wave row')
      }
      await new Promise(r => setTimeout(r, 50))
    }
    releaseFlip()
    await holder
    const outcome = await probeOutcome
    expect(outcome.ok).toBe(false)
    expect((outcome as { ok: false; message: string }).message).toContain(expectedFragment)
    return (outcome as { ok: false; message: string }).message
  }

  it('replay is rejected when a PAUSE commits while the replay waits on the wave lock', async () => {
    const u = identities[0]
    await expectRejected(
      tx => tx.$executeRawUnsafe(`UPDATE survey_waves SET status='PAUSED' WHERE id='${waveId}'`),
      (): Promise<unknown> => startSingleUnlinkedWave({ publicId, waveId, entryToken, consentVersion, consent: true,
        operationKey: u.operationKey, accessCredential: u.accessCredential }),
      '研究波次尚未开放')
  }, 30000)

  it('replay after a committed PAUSE is blocked by the governance gate (re-under-lock)', async () => {
    const u = identities[0]
    // Sequential after-pause call must be blocked (state now PAUSED from prior case).
    await expect(startSingleUnlinkedWave({ publicId, waveId, entryToken, consentVersion, consent: true,
      operationKey: u.operationKey, accessCredential: u.accessCredential }))
      .rejects.toMatchObject({ message: '研究波次尚未开放' })
    const starts = await db.surveyWave.findUniqueOrThrow({ where: { id: waveId }, select: { startsCount: true } })
    expect(starts.startsCount).toBe(seededAttempts)
    // Restore OPEN for the remaining cases via product path.
    const { transitionWave } = await import('../../modules/survey/waves.publish')
    const row = await db.surveyWave.findUniqueOrThrow({ where: { id: waveId }, select: { revision: true } })
    await transitionWave(owner.id, projectId, waveId, row.revision, 'RESUME')
  }, 30000)

  it('fresh START is rejected when a CLOSE commits while it waits on the wave lock', async () => {
    const u = identities[1]
    await expectRejected(
      tx => tx.$executeRawUnsafe(`UPDATE survey_waves SET status='CLOSED' WHERE id='${waveId}'`),
      (): Promise<unknown> => startSingleUnlinkedWave({ publicId, waveId, entryToken, consentVersion, consent: true,
        operationKey: u.operationKey, accessCredential: u.accessCredential }),
      '研究波次尚未开放')
    const waveRow = await db.surveyWave.findUniqueOrThrow({ where: { id: waveId }, select: { status: true, startsCount: true } })
    expect(waveRow.status).toBe('CLOSED')
    expect(waveRow.startsCount).toBe(seededAttempts)
  }, 30000)

  it('token revocation committed while the replay waits on the wave lock is re-checked under the lock', async () => {
    // Restore OPEN via product path after the previous CLOSE.
    const { transitionWave } = await import('../../modules/survey/waves.publish')
    const closed = await db.surveyWave.findUniqueOrThrow({ where: { id: waveId }, select: { revision: true } })
    // CLOSED cannot resume; open a fresh state by re-issuing openWave is not
    // allowed either. Instead run this case on the identity-1 fresh START
    // against a NEW wave created on the same project.
    void closed
    const created = await createWave(owner.id, projectId, {
      requestId: randomUUID(), title: `${suffix} wave2`,
      consentText: '本合成交错测试仅用于隔离环境，数据全部虚构。', generalText: 'done',
      linkageNoticeConfirmed: false, instrumentIds: [(await db.surveyInstrumentDraft.findFirstOrThrow({ where: { projectId } })).id],
      allowNewParticipants: true, quotaStarts: 50 })
    await prepareWave(owner.id, projectId, created.id, created.revision)
    const current = await getWave(owner.id, projectId, created.id)
    const opened = await openWave(owner.id, projectId, created.id, current.revision)
    const token = await db.surveyEntryToken.findFirstOrThrow({ where: { waveId: created.id, revokedAt: null }, select: { id: true } })
    const u = identities[1]
    await expectRejected(
      tx => tx.$executeRawUnsafe(`UPDATE survey_entry_tokens SET revoked_at=now() WHERE id='${token.id}'`),
      (): Promise<unknown> => startSingleUnlinkedWave({ publicId: opened.publicId, waveId: created.id, entryToken: opened.entrySecret,
        consentVersion, consent: true, operationKey: u.operationKey, accessCredential: u.accessCredential }),
      '研究招募链接已经失效', created.id)
    const attempts = await db.surveyWaveAttempt.count({ where: { waveId: created.id } })
    expect(attempts).toBe(0)
    const starts = await db.surveyWave.findUniqueOrThrow({ where: { id: created.id }, select: { startsCount: true } })
    expect(starts.startsCount).toBe(0)
  })
})
