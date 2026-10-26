import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Only the database binding is redirected. Every service, compiler, registry,
// authorization decision, SQL statement and transaction below is the real one.
const binding = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }))
vi.mock('../../config/database', () => ({
  prisma: { $transaction: (...args: unknown[]) => (binding.db.$transaction as Function)(...args) },
}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { lockInstrumentSourceIdentity } from '../../modules/assessment-authorization/source-identity-lock'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { listScaleInstrumentSources, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../../modules/scale/onboarding/materialize'
import { planStandardScalePublication } from '../../modules/scale/onboarding/publish'
import { activateScaleDeploymentRevision, rollbackScaleDeploymentActivation, readActiveScaleDeployment } from '../../modules/scale/deployment/repository'
import { convertLegacyScaleMeasurement, planLegacyScaleMeasurementConversion } from '../../modules/scale/onboarding/measurement-conversion'
import { getCatalogSourceSnapshot } from '../../modules/survey/catalog.sources'
import { publishSurveyMeasurementDraft } from '../../modules/survey/measurement-publication.service'
import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from '../../modules/situational/onboarding/instruments.generated'
import { createSituationalInstrumentRegistry } from '../../modules/situational/onboarding/instrument-registry'
import { ensureStaticSjtRegistryMapping, validateStaticSjtRegistryMapping, publishStaticSjtMeasurement } from '../../modules/situational/static-measurement-release'
import { assertContentAuthority } from '../../modules/measurement-content/content-authority.repository'
import { getContentRelease, publishContentRelease } from '../../modules/measurement-content/repository'
import { publishComposite } from '../../modules/composite/composite.service'

const suite = process.env.MEASUREMENT_V10_FIXTURE === '1' ? describe : describe.skip
type Tx = Prisma.TransactionClient
type Hook = {
  start?: (tx: Tx, pid: number) => Promise<void> | void
  afterSql?: (sql: string, tx: Tx) => Promise<void> | void
  beforeCommit?: (tx: Tx) => Promise<void> | void
}
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 1500, timeout: 11000 }
let one: PrismaClient, two: PrismaClient, three: PrismaClient
const prefix = 'v10-source-race-' + randomUUID()
function signal<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const sqlText = (query: { sql?: string; strings?: string[] } | string[]) =>
  'sql' in query ? query.sql ?? '' : ('strings' in query ? query.strings! : query as string[]).join('?')
function observed<T>(promise: Promise<T>) {
  return promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
}
function readyOrFailure<T, U>(ready: Promise<T>, operation: ReturnType<typeof observed<U>>) {
  return Promise.race([ready, operation.then(result => {
    if (!result.ok) throw result.error
    throw new Error('Service completed without reaching its expected synchronization barrier')
  })])
}
async function success<T>(promise: ReturnType<typeof observed<T>>) {
  const result = await promise
  if (!result.ok) throw result.error
  return result.value
}
async function rejected<T>(promise: ReturnType<typeof observed<T>>, pattern: RegExp) {
  const result = await promise
  expect(result.ok).toBe(false)
  if (!result.ok) expect(String(result.error)).toMatch(pattern)
}
function client(db: PrismaClient, hook: Hook = {}): PrismaClient {
  return new Proxy(db, { get(target, property) {
    if (property !== '$transaction') {
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    }
    return (work: (tx: Tx) => Promise<unknown>) => target.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='6000ms'")
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='7000ms'")
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await hook.start?.(tx, row.pid)
      const traced = new Proxy(tx, { get(transaction, key) {
        const value = Reflect.get(transaction, key)
        if (key === '$executeRaw' || key === '$queryRaw') return async (...args: unknown[]) => {
          const result = await value.apply(transaction, args)
          await hook.afterSql?.(sqlText(args[0] as Parameters<typeof sqlText>[0]), tx)
          return result
        }
        return typeof value === 'function' ? value.bind(transaction) : value
      } })
      const result = await work(traced)
      await hook.beforeCommit?.(tx)
      return result
    }, options)
  } }) as PrismaClient
}
function holdCommit(db: PrismaClient) {
  const ready = signal<Tx>(), release = signal()
  return { ready: ready.promise, release: () => release.resolve(),
    db: client(db, { beforeCommit: async tx => { ready.resolve(tx); await release.promise } }) }
}
async function actualWait(observer: Tx | PrismaClient, pid: number, locktype?: string) {
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ locktype: string }>>`
      SELECT locktype FROM pg_locks WHERE pid=${pid} AND NOT granted`
    if (rows.some(row => !locktype || row.locktype === locktype)) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Expected real PostgreSQL ${locktype ?? ''} lock wait for pid ${pid}`)
}
async function createFixture(expiresInMs?: number) {
  // A separate unused, real validated registry identity per scenario. This also
  // permits failed-case-only retry without deleting prior immutable evidence.
  const sources = listScaleInstrumentSources().filter(source =>
    /^academic_self_(concept|efficacy)_.+_zh_cn$/.test(source.identity.instrumentKey)
    && source.identity.instrumentVersion === '1.0.0' && source.executable?.releaseStatus === 'PUBLISHED')
  const existing = await one.scale.findMany({ where: { code: { in: sources.map(source => source.identity.instrumentKey) } }, select: { code: true } })
  const source = sources.find(candidate => !existing.some(row => row.code === candidate.identity.instrumentKey))
  if (!source?.executable) throw new Error('Fresh synthetic registry fixture identity exhausted')
  const actor = randomUUID(), reviewer = randomUUID()
  for (const [id, suffix] of [[actor, 'author'], [reviewer, 'reviewer']]) {
    await one.user.create({ data: { id, username: `${prefix}-${suffix}-${id}`, passwordHash: 'synthetic-no-login',
      accountDomain: 'TRAINING', role: 'TEACHER', platformRole: 'SYSTEM_ADMIN', teacherApproved: true, isActive: true } })
  }
  const [clock] = await one.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  const validTo = new Date(clock.now.getTime() + (expiresInMs ?? 60000))
  // Optional historical rows are seeded as inert metadata, never as a new
  // permission or via the retired ledger API. Most scenarios have no ledger row.
  if (expiresInMs !== undefined) await one.instrumentAuthorization.create({ data: {
    authorizationKey: randomUUID(), version: 1, ...source.identity, grantor: 'Synthetic historical reference',
    grantee: 'Disposable test database', electronicAdministration: true, scoring: true, display: true,
    translation: true, territories: ['CN'], locales: ['zh-CN'], commercialNature: 'NON_COMMERCIAL',
    validFrom: new Date(clock.now.getTime() - 60000), validTo, basis: 'Historical metadata fixture; not a current grant',
    status: 'APPROVED', approvedByUserId: reviewer, approvedAt: clock.now, createdByUserId: actor, recordHash: 'a'.repeat(64),
  } })
  const materialized = await materializeScaleInstrumentContent(one, { ...source.identity, actorUserId: actor })
  await one.$transaction(tx => activateScaleDeploymentRevision({ db: tx, id: randomUUID(), scaleId: materialized.scale.id,
    createdByUserId: actor, policy: { schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'CN',
      deploymentModes: ['COMPOSITE'],
      runtimePolicyHash: getScaleInstrumentRuntimePolicy(source.identity.instrumentKey, '1.0.0')!.runtimePolicyHash,
      localizationVersion: source.localization!.localizationVersion, inFlightCompletion: 'FROZEN_DEADLINE' } }))
  const ready = await planStandardScalePublication(one, { ...source.identity, actorUserId: actor, visibility: 'COURSE' })
  expect(ready.blockers).toEqual([])
  // Recreate the valid pre-upgrade state: a fully validated legacy publication,
  // exact registered bytes, operational deployment, and no invented pointer.
  // Calling today's publisher here would already convert it and erase the test.
  const scale = await one.scale.update({ where: { id: materialized.scale.id }, data: { status: 'PUBLISHED', visibility: 'COURSE' } })
  const input = { requestId: randomUUID(), scaleId: scale.id, actorUserId: actor,
    recoveryPoint: 'isolated synthetic empty-cluster baseline; no historical data' }
  const preview = await planLegacyScaleMeasurementConversion(client(one), input)
  return { actor, reviewer, source, scale, validTo,
    request: { ...input, expectedProofHash: preview.proofHash }, targetKey: preview.proof.target.key }
}
type Fixture = Awaited<ReturnType<typeof createFixture>>
// Exercise a real operational deployment withdrawal, not copyright revocation.
// This trusted repository operation uses the same source-identity lock as readers.
const withdraw = (db: PrismaClient, f: Fixture) => db.$transaction(async tx => {
  await lockInstrumentSourceIdentity(tx, f.source.identity, 'WRITE')
  const active = await readActiveScaleDeployment(tx, f.scale.id)
  if (!active) throw new Error('Synthetic operational deployment already absent')
  await rollbackScaleDeploymentActivation({ db: tx, scaleId: f.scale.id, appliedRevision: active.revision,
    expectedPolicyHash: active.policyHash, previousRevision: null })
})
async function scaleState(db: PrismaClient, f: Fixture) {
  const scale = await db.scale.findUniqueOrThrow({ where: { id: f.scale.id } })
  const releases = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM measurement_content_releases WHERE content_key=${f.targetKey}`
  const audits = await db.scalePublicationAudit.count({ where: { scaleId: f.scale.id } })
  return { pointer: scale.measurementReleaseId, releases: Number(releases[0].n), audits,
    preserved: canonicalHash({ definition: scale.definition, definitionHash: scale.definitionHash, updatedAt: scale.updatedAt.toISOString(),
      status: scale.status, visibility: scale.visibility, code: scale.code, creatorId: scale.creatorId }) }
}
async function surveyFixture(f: Fixture) {
  const converted = await convertLegacyScaleMeasurement(client(one), f.request)
  const actor = randomUUID(), projectId = randomUUID(), draftId = randomUUID(), grantId = randomUUID()
  await one.user.create({ data: { id: actor, username: `${prefix}-researcher-${actor}`, passwordHash: 'synthetic-no-login',
    accountDomain: 'SURVEY', role: 'TEACHER', isActive: true } })
  const login = 'race_' + actor.replaceAll('-', '').slice(0, 24)
  await one.surveyAccount.create({ data: { userId: actor, loginName: login, normalizedLogin: login } })
  await one.surveyResearcherGrant.create({ data: { userId: actor, status: 'ACTIVE', grantedBy: f.reviewer } })
  await one.surveyMfaCredential.create({ data: { userId: actor, secretCipher: 'synthetic-unusable-no-login', enabled: true } })
  await one.surveyProject.create({ data: { id: projectId, ownerUserId: actor, title: 'V10 synthetic catalog publication', collectionMode: 'SINGLE_UNLINKED' } })
  const snapshot = await one.$transaction(tx => getCatalogSourceSnapshot({ actorUserId: f.reviewer,
    ref: { kind: 'SCALE', sourceId: f.scale.id, sourceVersion: '1.0.0' } }, tx))
  await one.$executeRaw(Prisma.sql`INSERT INTO survey_tool_grants (id,user_id,status,snapshot,snapshot_digest,created_by)
    VALUES (${grantId},${actor},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${canonicalHash(snapshot)},${f.reviewer})`)
  await one.surveyInstrumentDraft.create({ data: { id: draftId, projectId, catalogGrantId: grantId, instrumentKey: 'source_fixture',
    kind: 'SCALE', title: snapshot.title, revision: 1, definition: snapshot.displayDefinition as Prisma.InputJsonValue } })
  return { actor, projectId, draftId, converted }
}
type Survey = Awaited<ReturnType<typeof surveyFixture>>
function publish(db: PrismaClient, f: Survey) {
  binding.db = db
  return publishSurveyMeasurementDraft(f.actor, f.projectId, f.draftId, 1)
}
async function surveyState(db: PrismaClient, f: Survey) {
  const releases = await db.$queryRaw<Array<{ id: string; source_release_id: string | null; content_hash: string; published_by: string }>>`
    SELECT id,source_release_id,content_hash,published_by FROM measurement_content_releases
    WHERE scope->>'resourceId'=${f.projectId} ORDER BY id`
  return { releases, draft: await db.surveyInstrumentDraft.findUniqueOrThrow({ where: { id: f.draftId } }),
    events: await db.surveyEvent.count({ where: { projectId: f.projectId } }) }
}

suite('V10 high-level source authority races through real services and PostgreSQL', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !/^[a-f0-9]{40}$/.test(process.env.MEASUREMENT_V10_HEAD || '')) throw new Error('Exact isolated invocation required')
    const selected = integrationDatabaseUrl('MEASUREMENT_V10_RUNTIME_DATABASE_URL')
    if (!selected) throw new Error('Explicit synthetic runtime URL required')
    requireIsolatedReleaseDatabase(selected)
    const url = new URL(selected)
    url.searchParams.set('connection_limit', '1')
    one = new PrismaClient({ datasources: { db: { url: url.href } } })
    two = new PrismaClient({ datasources: { db: { url: url.href } } })
    three = new PrismaClient({ datasources: { db: { url: url.href } } })
    await Promise.all([one.$connect(), two.$connect(), three.$connect()])
    const [role] = await one.$queryRaw<Array<{rolsuper: boolean; rolbypassrls: boolean}>>`
      SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`
    if (!role || role.rolsuper || role.rolbypassrls) throw new Error('Synthetic non-superuser, non-bypass runtime required')
  }, 15000)
  afterAll(async () => {
    // Keep immutable evidence in the disposable cluster; no deletion/grant changes.
    await Promise.all([one?.$disconnect(), two?.$disconnect(), three?.$disconnect()])
  })

  it('Scale conversion waits for source withdrawal, denies fresh and retried requests, and leaves no release/pointer/audit', async () => {
    const f = await createFixture(), before = await scaleState(three, f), writer = holdCommit(one), readerPid = signal<number>()
    const revoked = observed(withdraw(writer.db, f))
    const held = await readyOrFailure(writer.ready, revoked)
    const converted = observed(convertLegacyScaleMeasurement(client(two, { start: (_tx, pid) => readerPid.resolve(pid) }), f.request))
    try { await actualWait(held, await readerPid.promise, 'advisory') } finally { writer.release() }
    await success(revoked)
    await rejected(converted, /STANDARD_PUBLICATION_BLOCKED|MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    await expect(convertLegacyScaleMeasurement(client(two), f.request)).rejects.toThrow(/STANDARD_PUBLICATION_BLOCKED|MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    expect(await scaleState(three, f)).toEqual(before)
    expect(before).toMatchObject({ pointer: null, releases: 0, audits: 0 })
  }, 15000)

  it('Scale conversion protected first commits once before withdrawal; recovery reports history without granting new source authority', async () => {
    const f = await createFixture(), before = await scaleState(three, f), reader = holdCommit(one), writerPid = signal<number>()
    const converted = observed(convertLegacyScaleMeasurement(reader.db, f.request))
    const held = await readyOrFailure(reader.ready, converted)
    const revoked = observed(withdraw(client(two, { start: (_tx, pid) => writerPid.resolve(pid) }), f))
    try {
      await actualWait(held, await writerPid.promise, 'advisory')
      expect(await scaleState(three, f)).toEqual(before)
    } finally { reader.release() }
    const saved = await success(converted); await success(revoked)
    expect(await convertLegacyScaleMeasurement(client(one), f.request)).toMatchObject({ ...saved, converted: false })
    await expect(one.$transaction(tx => getCatalogSourceSnapshot({ actorUserId: f.reviewer,
      ref: { kind: 'SCALE', sourceId: f.scale.id, sourceVersion: '1.0.0' } }, tx))).rejects.toThrow(/MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    expect(await scaleState(three, f)).toEqual({ ...before, pointer: saved.measurementReleaseId, releases: 1, audits: 1 })
  }, 15000)

  it('Survey explicit catalog publication waiting behind source withdrawal fails without project release or partial draft/audit changes', async () => {
    const f = await createFixture(), survey = await surveyFixture(f), before = await surveyState(three, survey)
    const sourceBefore = await scaleState(three, f), writer = holdCommit(one), readerPid = signal<number>()
    const revoked = observed(withdraw(writer.db, f)), held = await readyOrFailure(writer.ready, revoked)
    const publication = observed(publish(client(two, { start: (_tx, pid) => readerPid.resolve(pid) }), survey))
    try { await actualWait(held, await readerPid.promise, 'advisory') } finally { writer.release() }
    await success(revoked)
    await rejected(publication, /MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    await expect(publish(client(two), survey)).rejects.toThrow(/MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    expect(await surveyState(three, survey)).toEqual(before)
    expect(before.releases).toEqual([])
    expect(await scaleState(three, f)).toEqual(sourceBefore)
  }, 15000)

  it('Survey explicit catalog publication protected first serializes before source withdrawal and cannot republish after it', async () => {
    const f = await createFixture(), survey = await surveyFixture(f), before = await surveyState(three, survey)
    const reader = holdCommit(one), writerPid = signal<number>()
    const publication = observed(publish(reader.db, survey)), held = await readyOrFailure(reader.ready, publication)
    const revoked = observed(withdraw(client(two, { start: (_tx, pid) => writerPid.resolve(pid) }), f))
    try {
      await actualWait(held, await writerPid.promise, 'advisory')
      expect(await surveyState(three, survey)).toEqual(before)
    } finally { reader.release() }
    const saved = await success(publication); await success(revoked)
    await expect(publish(client(one), survey)).rejects.toThrow(/MANAGED_SOURCE_DEPLOYMENT_REQUIRED/)
    const after = await surveyState(three, survey)
    expect(after).toEqual({ ...before, releases: [{ id: saved.releaseId, source_release_id: survey.converted.measurementReleaseId,
      content_hash: saved.contentHash, published_by: survey.actor }] })
  }, 15000)

  it('three clients: queued User writer plus Survey User-first reader cannot deadlock Scale source-first recovery; held writer NOWAIT then safe retry', async () => {
    const f = await createFixture(), survey = await surveyFixture(f)
    const before = await scaleState(one, f)
    const scaleReady = signal<Tx>(), scaleContinue = signal(), surveyReady = signal(), surveyContinue = signal()
    const surveyPid = signal<number>(), writerPid = signal<number>()
    let scaleHookUsed = false, surveyHookUsed = false, actorReadUsedNowait = false
    const unavailableActorRequest = { ...f.request, actorUserId: survey.actor }
    const conversion = observed(convertLegacyScaleMeasurement(client(one, { afterSql: async (sql, tx) => {
      if (sql.includes('FROM users')) actorReadUsedNowait = sql.includes('FOR SHARE NOWAIT')
      if (!scaleHookUsed && sql.includes('SELECT id FROM scales') && sql.includes('FOR UPDATE')) {
        scaleHookUsed = true; scaleReady.resolve(tx); await scaleContinue.promise
      }
    } }), unavailableActorRequest))
    const held = await readyOrFailure(scaleReady.promise, conversion)
    const publication = observed(publish(client(two, {
      start: (_tx, pid) => surveyPid.resolve(pid),
      afterSql: async sql => {
        if (!surveyHookUsed && sql.includes('FOR SHARE OF p,u,g,m')) {
          surveyHookUsed = true; surveyReady.resolve(); await surveyContinue.promise
        }
      },
    }), survey))
    await readyOrFailure(surveyReady.promise, publication)
    // Real account realms are immutable. The converter must break the queue
    // even for a currently ineligible actor before its ordinary role validation;
    // do not fabricate a principal simultaneously valid in both realms.
    const writer = observed(client(three, { start: (_tx, pid) => writerPid.resolve(pid) }).$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`UPDATE users SET is_active=is_active WHERE id=${survey.actor}`)
    }))
    try {
      await actualWait(held, await writerPid.promise)
      surveyContinue.resolve()
      await actualWait(held, await surveyPid.promise)
    } finally {
      surveyContinue.resolve(); scaleContinue.resolve()
    }
    // PostgreSQL may join an already compatible row SHARE while the writer is
    // queued. This is not a lock failure: ordinary realm validation must deny it,
    // immediately releasing the source/Scale locks so the other two can finish.
    await rejected(conversion, /ACTOR_UNAVAILABLE/)
    expect(actorReadUsedNowait).toBe(true)
    await success(publication); await success(writer)
    expect(await scaleState(one, f)).toEqual(before)
    await expect(convertLegacyScaleMeasurement(client(one), unavailableActorRequest)).rejects.toThrow(/ACTOR_UNAVAILABLE/)
    // Separately exercise the real 55P03 translation, not merely a query-text
    // assertion: an actual held User writer conflicts with the valid author.
    const heldWriter = holdCommit(three)
    const userWrite = observed(heldWriter.db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`UPDATE users SET is_active=is_active WHERE id=${f.actor}`)
    }))
    await readyOrFailure(heldWriter.ready, userWrite)
    try {
      await rejected(observed(convertLegacyScaleMeasurement(client(one), f.request)), /ACTOR_BUSY_RETRY/)
    } finally { heldWriter.release() }
    await success(userWrite)
    expect(await convertLegacyScaleMeasurement(client(one), f.request)).toMatchObject({
      measurementReleaseId: survey.converted.measurementReleaseId, converted: false,
    })
    expect(await scaleState(one, f)).toEqual(before)
    expect((await surveyState(one, survey)).releases).toHaveLength(1)
  }, 15000)

  it('rolls back a real inserted release, pointer and audit on a downstream failure and supports an exact retry', async () => {
    const f = await createFixture(), before = await scaleState(three, f)
    let inserted = false
    const failed = client(two, { afterSql: sql => {
      if (sql.includes('INSERT INTO measurement_content_releases')) { inserted = true; throw new Error('synthetic downstream failure after actual release insert') }
    } })
    await expect(convertLegacyScaleMeasurement(failed, f.request)).rejects.toThrow('synthetic downstream failure')
    expect(inserted).toBe(true)
    expect(await scaleState(three, f)).toEqual(before)
    const saved = await convertLegacyScaleMeasurement(client(two), f.request)
    expect(await scaleState(three, f)).toEqual({ ...before, pointer: saved.measurementReleaseId, releases: 1, audits: 1 })
    expect(await convertLegacyScaleMeasurement(client(two), f.request)).toMatchObject({ ...saved, converted: false })
  }, 15000)

  it('historical Scale copyright expiry during a real downstream wait does not change publication or replay identity', async () => {
    const f = await createFixture(3500), before = await scaleState(three, f)
    const ready = signal<Tx>(), release = signal(), readerPid = signal<number>()
    const version = [f.source.identity.instrumentVersion, f.source.executable!.definition.scoring.scoringVersion,
      f.source.localization!.localizationVersion].join(':')
    const lockKey = canonicalHash(['SCALE', 'MEASUREMENT', f.targetKey, version])
    const blocker = observed(client(one).$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
      ready.resolve(tx); await release.promise
    }))
    const held = await readyOrFailure(ready.promise, blocker)
    let inserted = false
    const conversion = observed(convertLegacyScaleMeasurement(client(two, { start: (_tx, pid) => readerPid.resolve(pid),
      afterSql: sql => { if (sql.includes('INSERT INTO measurement_content_releases')) inserted = true } }), f.request))
    try {
      await actualWait(held, await readerPid.promise, 'advisory')
      const deadline = Date.now() + 4500
      let expired = false
      while (Date.now() < deadline) {
        const [row] = await held.$queryRaw<Array<{ expired: boolean }>>`SELECT clock_timestamp()>=${f.validTo} AS expired`
        if (row.expired) { expired = true; break }
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      expect(expired).toBe(true)
    } finally { release.resolve() }
    await success(blocker)
    const saved = await success(conversion)
    expect(inserted).toBe(true)
    expect(await scaleState(three, f)).toEqual({ ...before, pointer: saved.measurementReleaseId, releases: 1, audits: 1 })
    expect(await convertLegacyScaleMeasurement(client(two), f.request)).toMatchObject({ ...saved, converted: false })
  }, 15000)

  it('static SJT Composite publication retains exact facts after historical copyright expiry during a report-row wait', async () => {
    const sources = createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES).sources
      .filter(source => source.publication.releaseStatus === 'PUBLISHED')
    const mappings = await one.$queryRaw<Array<{ instrument_key: string }>>`SELECT instrument_key FROM static_sjt_measurement_mappings`
    const source = sources.find(candidate => !mappings.some(mapping => mapping.instrument_key === candidate.content.identity.instrumentKey))
    if (!source) throw new Error('Fresh static SJT registry fixture identity exhausted')
    const identity = source.content.identity, actor = randomUUID(), reviewer = randomUUID()
    for (const id of [actor, reviewer]) await one.user.create({ data: { id, username: `${prefix}-static-${id}`,
      passwordHash: 'synthetic-no-login', accountDomain: 'TRAINING', role: 'TEACHER', teacherApproved: true,
      platformRole: 'SYSTEM_ADMIN', isActive: true } })
    const [clock] = await one.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    const expiresAt = new Date(clock.now.getTime() + 4000)
    const deployment = { locale: 'zh-CN', territory: 'CN' }
    await one.instrumentAuthorization.create({ data: { authorizationKey: randomUUID(), version: 1, ...identity,
      grantor: 'Synthetic historical reference', grantee: 'Historical synthetic deployment', electronicAdministration: true,
      scoring: true, display: true, translation: true, territories: ['CN'], locales: ['zh-CN'],
      commercialNature: 'NON_COMMERCIAL', validFrom: new Date(clock.now.getTime() - 60000), validTo: expiresAt,
      basis: 'Historical metadata fixture; not a current grant', status: 'APPROVED', approvedByUserId: reviewer,
      approvedAt: clock.now, createdByUserId: actor, recordHash: 'a'.repeat(64) } })
    const mapping = await one.$transaction(tx => ensureStaticSjtRegistryMapping(tx, identity)), grantId = randomUUID()
    // Explicit synthetic fixture, not root issuance or WebAuthn acceptance.
    // Never manufacture an admin proof or call a positive strong-auth endpoint.
    await one.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
      (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
       delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
      VALUES (${grantId},${actor},${reviewer},'TRAINING','PLATFORM','situational-registry','measurement',
        ARRAY[${mapping.id}],ARRAY['measurement.publish'],ARRAY[]::text[],0,
        clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 minute',ARRAY[${grantId}])`)
    const authority = { actorId: actor, grantId, capability: 'measurement.publish' as const,
      scope: { product: 'TRAINING' as const, scopeKind: 'PLATFORM' as const, scopeId: 'situational-registry',
        resourceKind: 'measurement' as const, resourceKeys: [mapping.id] } }
    const seeded = await one.$transaction(async tx => {
      await validateStaticSjtRegistryMapping(tx, mapping.id, 'PUBLISH')
      await assertContentAuthority(tx, authority)
      const result = await publishStaticSjtMeasurement(tx, { actorId: actor, mappingId: mapping.id, deployment })
      await assertContentAuthority(tx, authority)
      return result
    })
    const published = { measurementReleaseId: seeded.release.releaseId }
    const measurement = await one.$transaction(tx => getContentRelease(tx, published.measurementReleaseId))
    if (!measurement || measurement.layer !== 'MEASUREMENT') throw new Error('Actual static measurement publication missing')
    const compositeId = randomUUID(), itemId = randomUUID(), metricKey = measurement.content.metrics[0].metricKey
    await one.compositeAssessment.create({ data: { id: compositeId, code: `${prefix}-${compositeId}`, name: 'Synthetic static late-expiry composite',
      createdBy: actor } })
    await one.compositeAssessmentItem.create({ data: { id: itemId, compositeAssessmentId: compositeId, type: 'SITUATIONAL',
      situationalInstrumentKey: identity.instrumentKey, situationalInstrumentVersion: identity.instrumentVersion } })
    const report = await one.$transaction(tx => publishContentRelease(tx, { layer: 'REPORT', family: 'SJT',
      key: `v10-synthetic-report:${compositeId}`, version: '1', scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId: actor, resourceId: compositeId },
      provenance: { sourceKind: 'V10_SYNTHETIC_REPORT_FIXTURE' }, sourceReleaseId: null, assetRefs: [],
      content: { projectionVersion: 1, measurements: [{ releaseId: measurement.releaseId, contentHash: measurement.contentHash }],
        metricKeys: [metricKey], audience: 'teacher', language: 'zh-CN', generatorVersion: 'declarative-report-v1',
        template: { blocks: [{ type: 'METRIC', metricKey, display: 'RAW' }], limitations: [] } } }, actor))
    await one.compositeAssessment.update({ where: { id: compositeId }, data: {
      trainingReportSelectionDraft: { schemaVersion: 1, units: [{ itemId, reportReleaseId: report.releaseId }] } } })
    const before = await one.compositeAssessment.findUniqueOrThrow({ where: { id: compositeId } })
    // Historical metadata expires while a real downstream report row is held.
    // It must not enter the frozen source proof or block publication.
    const ready = signal<Tx>(), release = signal(), readerPid = signal<number>()
    const blocker = observed(client(one).$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM measurement_content_releases WHERE id=${report.releaseId} FOR UPDATE`)
      ready.resolve(tx); await release.promise
    }))
    const held = await readyOrFailure(ready.promise, blocker)
    let sourceValidated = false
    const publication = observed(client(two, { start: (_tx, pid) => readerPid.resolve(pid), afterSql: sql => {
      if (sql.includes('WITH scale_sources AS')) sourceValidated = true
    } }).$transaction(tx => publishComposite(actor, UserRole.TEACHER, compositeId, tx)))
    try {
      await actualWait(held, await readerPid.promise)
      expect(sourceValidated).toBe(true)
      const deadline = Date.now() + 4000
      let expired = false
      while (Date.now() < deadline) {
        const [row] = await held.$queryRaw<Array<{ expired: boolean }>>`SELECT clock_timestamp()>=${expiresAt} AS expired`
        if (row.expired) { expired = true; break }
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      expect(expired).toBe(true)
    } finally { release.resolve() }
    await success(blocker)
    await success(publication)
    const after = await one.compositeAssessment.findUniqueOrThrow({ where: { id: compositeId } })
    expect(before).toMatchObject({ status: 'DRAFT', trainingContentSnapshot: null, trainingContentSnapshotHash: null, publishedAt: null })
    expect(after).toMatchObject({ status: 'PUBLISHED', id: compositeId, createdBy: actor })
    expect(after.publishedAt).toBeInstanceOf(Date)
    expect(after.trainingContentSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(after.trainingContentSnapshot)).toContain(measurement.contentHash)
    expect(JSON.stringify(after.trainingContentSnapshot)).not.toContain('sourceLicenseProof')
    // Republishing a published composite remains a conflict, not a new approval.
    await expect(client(two).$transaction(tx => publishComposite(actor, UserRole.TEACHER, compositeId, tx))).rejects.toMatchObject({statusCode:409})
    const replay = await one.compositeAssessment.findUniqueOrThrow({ where: { id: compositeId } })
    expect(replay.trainingContentSnapshot).toEqual(after.trainingContentSnapshot)
    expect(replay.trainingContentSnapshotHash).toBe(after.trainingContentSnapshotHash)
    const [current] = await one.$queryRaw<Array<{ measurement_release_id: string }>>`
      SELECT measurement_release_id FROM static_sjt_measurement_mappings WHERE id=${mapping.id}`
    expect(current.measurement_release_id).toBe(published.measurementReleaseId)
  }, 15000)
})
