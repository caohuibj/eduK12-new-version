import {historicalCatalogGrantFixture} from '../fixtures/historical-catalog-grant'
import {assertSjtEntryDistributionAuthority} from '../../modules/situational/entry-authority'
import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { issueAdminContentRoot, revokeAdminContentGrant } from '../../modules/measurement-content/admin-authority.service'
import { assertSjtCourseGrants, createSjtReleaseGrant, SJT_COURSE_GRANT_POLICY } from '../../modules/situational/authoring/grants'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { copyDraft, importCatalogDraft } from '../../modules/survey/builder.service'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_SJT_ENTRY_AUTHORITY_TEST_DATABASE_URL', 'SURVEY_NATIVE_SJT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip

suite('Survey SJT explicit entry authority with real published source and frozen FINAL lifecycle', () => {
  let db: PrismaClient
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
    vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
    vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
  })
  afterAll(async () => {
    await db?.$disconnect()
    vi.unstubAllEnvs()
  })

  const proof = () => ({ tokenVersion: 0, adminSessionId: 'synthetic-current-system-session', adminVerifiedAt: Date.now() / 1000 })
  async function fixture() {
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY', system = false) =>
      db.user.create({ data: { username: 'sjt-entry-' + randomUUID(), passwordHash: 'synthetic-no-login',
        role, accountDomain, platformRole: system ? 'SYSTEM_ADMIN' : 'STANDARD' } })
    const issuer = await user('ADMIN', 'LEGACY', true)
    const entryAdmin = await user('ADMIN', 'LEGACY')
    const author = await user('STUDENT', 'LEGACY')
    const owner = await user('STUDENT', 'SURVEY')
    const entryGrant = await db.adminEntryGrant.create({ data: {
      id: randomUUID(), userId: entryAdmin.id, entry: 'SURVEY', grantedBy: issuer.id,
    } })
    const login = 'entry_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner.id, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner.id, status: 'ACTIVE', grantedBy: issuer.id } })
    await db.surveyMfaCredential.create({ data: { userId: owner.id, enabled: true, secretCipher: 'synthetic-only' } })
    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-entry-' + randomUUID() }
    const compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const draft = await createSjtDraft({ userId: author.id, admin: false }, template, { authorizationPolicy: SJT_COURSE_GRANT_POLICY })
    await requestSjtReview({ userId: author.id, admin: false }, draft.id, draft.revision, draft.contentDigest)
    await reviewSjtDraft({ userId: issuer.id, admin: true }, draft.id, draft.revision, draft.contentDigest, true,
      'Independent, self-authored synthetic staged fixture; no catalog content or participant data')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { sourceDraftId: draft.id } })
    expect(release).toMatchObject({ authorizationPolicy: SJT_COURSE_GRANT_POLICY, status: 'PUBLISHED' })
    expect(release.measurementReleaseId).not.toBeNull()
    const measurement = await db.measurementContentRelease.findUniqueOrThrow({ where: { id: release.measurementReleaseId! } })
    expect(measurement).toMatchObject({ family: 'SJT', layer: 'MEASUREMENT', status: 'PUBLISHED',
      provenance: { authorReleaseId: release.id, adaptationSource: null } })
    const course = await db.course.create({ data: { title: 'Synthetic Training course', courseCode: randomUUID(),
      creatorId: entryAdmin.id, courseType: 'TRAINING_COURSE', isLibrary: false, status: 'PUBLISHED' } })
    const courseGrant = await createSjtReleaseGrant({ userId: issuer.id, admin: true }, release.id, {
      instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
      definitionHash: release.definitionHash, contentDigest: release.contentDigest,
      granteeTeacherId: entryAdmin.id, courseId: course.id, purpose: 'TRAINING_COURSE', permission: 'DISTRIBUTE',
      validFrom: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000),
      note: 'Synthetic exact Training-only grant; this is not Survey distribution authority',
    })
    const projectId = randomUUID(), publicId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, publicId, ownerUserId: owner.id,
      title: 'Synthetic entry capability lifecycle', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' } })
    const ref = { kind: 'SJT' as const, sourceId: release.id, sourceVersion: release.instrumentVersion }
    return { issuer, entryAdmin, author, owner, entryGrant, compiled, release, measurement, course, courseGrant, projectId, publicId, ref }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  async function issueRoot(f: Fixture) {
    const requestId = randomUUID()
    const result = await issueAdminContentRoot(f.issuer.id, proof(), {
      requestId, expectedVersion: 0, reason: 'Explicit Survey entry distribution for this synthetic exact version only',
      grant: { subjectId: f.entryAdmin.id, scope: { product: 'SURVEY', scopeKind: 'PLATFORM',
        scopeId: 'situational-library-governance', resourceKind: 'material', resourceKeys: [f.measurement.id] },
      capabilities: ['material.distribute'], delegableCapabilities: [], remainingDelegationDepth: 0,
      validFrom: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    })
    expect(result).toEqual({ grantId: requestId, version: 1, changed: true })
    return db.contentCapabilityGrant.findUniqueOrThrow({ where: { id: requestId } })
  }
  const importInput = (instrumentKey: string) => ({ requestId: randomUUID(), instrumentKey, title: 'Synthetic staged entry tool' })
  async function wave(f: Fixture, draftId: string, ordinal: number) {
    return db.surveyWave.create({ data: { id: randomUUID(), projectId: f.projectId, ordinal,
      title: 'Synthetic capability wave', instrumentIds: [draftId],
      consentText: 'Synthetic research participation consent; no real human information is collected in this test.' } })
  }
  const freeze = (f: Fixture, waveId: string, draftId: string) => freezeResearchWaveDraft({
    actorUserId: f.owner.id, projectId: f.projectId, waveId, revision: 0,
    participantFeedback: [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1',
      mode: 'DESCRIPTIVE', metricKeys: ['coordination'], release: 'AFTER_FINAL' } }],
  })
  async function bindParticipant(f: Fixture, waveId: string, publicationId: string) {
    await db.surveyWave.update({ where: { id: waveId }, data: { status: 'OPEN', opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000), finishUntil: new Date(Date.now() + 7_200_000) } })
    const accessCredential = randomBytes(32).toString('base64url'), attemptId = randomUUID()
    await db.$transaction(async tx => {
      await tx.surveyWaveAttempt.create({ data: { id: attemptId, projectId: f.projectId, waveId,
        status: 'STARTED', sessionHash: hashResearchCredential(accessCredential) } })
      await tx.surveyConsent.create({ data: { id: randomUUID(), projectId: f.projectId, waveId,
        attemptId, consentVersion: 1, accepted: true } })
      await bindSurveyAttemptContent(tx, { projectId: f.projectId, waveId, attemptId, publicationId, newAttempt: true })
    })
    return { publicId: f.publicId, attemptId, accessCredential }
  }

  it('requires explicit Survey authority, pins it through import/publication, and immediately stops unfinished collection while preserving saved FINAL', async () => {
    const f = await fixture()
    expect(await db.contentCapabilityGrant.count({ where: { subjectId: f.entryAdmin.id } })).toBe(0)
    await expect(grantCatalogSource(f.entryAdmin.id,f.owner.id,f.ref)).rejects.toMatchObject({statusCode:409})
    await expect(db.$transaction(tx=>assertSjtEntryDistributionAuthority(tx,{actorId:f.entryAdmin.id,releaseId:f.release.id,instrumentVersion:f.ref.sourceVersion}))).rejects.toMatchObject({statusCode:403})
    expect(await db.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM survey_tool_grants WHERE user_id=${f.owner.id}`).toEqual([{ count: 0 }])
    // An existing exact Training course grant and current Survey admin entry do
    // not acquire the other product's material capability implicitly.
    expect(await db.sjtReleaseGrant.findUniqueOrThrow({ where: { id: f.courseGrant.id } })).toEqual(f.courseGrant)
    const root = await issueRoot(f)
    expect(root).toMatchObject({ subjectId: f.entryAdmin.id, issuerId: f.issuer.id, parentGrantId: null,
      product: 'SURVEY', scopeKind: 'PLATFORM', scopeId: 'situational-library-governance', resourceKind: 'material',
      resourceKeys: [f.measurement.id], capabilities: ['material.distribute'], delegableCapabilities: [],
      remainingDelegationDepth: 0, ancestry: [root.id], version: 1, revokedAt: null })
    const tool = await historicalCatalogGrantFixture(db,f.entryAdmin.id, f.owner.id, f.ref)
    const authority = { protocol: 'sjt-survey-distribution-v1', actorId: f.entryAdmin.id, grantId: root.id, grantVersion: 1,
      measurementReleaseId: f.measurement.id, measurementContentHash: f.measurement.contentHash,
      releaseId: f.release.id, instrumentVersion: f.release.instrumentVersion,
      definitionHash: f.release.definitionHash, contentDigest: f.release.contentDigest }
    expect(tool.sourceProvenance.sjtEntryAuthority).toEqual(authority)
    const imported = await importCatalogDraft(f.owner.id, f.projectId, tool.id, importInput('staged'))
    expect(imported.sourceProvenance?.sjtEntryAuthority).toEqual(authority)
    const frozenWave = await wave(f, imported.id, 1)
    const published = await freeze(f, frozenWave.id, imported.id)
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: published.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(snapshot.units[0]).toMatchObject({ executionProtocol: 'SITUATIONAL_NATIVE_V1', sourceProvenance: { sjtEntryAuthority: authority } })
    const blockedWave = await wave(f, imported.id, 2)

    // Complete a real historical grant before withdrawal; saved facts remain addressable.
    const participant = await bindParticipant(f, frozenWave.id, published.publicationId)
    expect((await getOwnResearchTask(participant)).units[0]).toMatchObject({ executionProtocol: 'SITUATIONAL_NATIVE_V1' })
    const child = await startSurveySituational(participant, 'staged')
    const nativeFixture = createSjtNativeStagedFinalFixture(child.attempt.id, 'path-A-A', f.compiled)
    const payload = situationalLegacyFinalSubmitSchema.parse({ ...nativeFixture.finalInput, submissionId: randomUUID() })
    const accepted = await submitSurveySituationalFinal(participant, 'staged', child.attempt.id, payload)
    expect(accepted.receipt).toBeDefined()
    expect(accepted).not.toHaveProperty('result')
    expect((await submitSurveySituationalFinal(participant, 'staged', child.attempt.id, payload)).receipt).toEqual(accepted.receipt)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: child.attempt.id } })).toBe(1)
    expect(await submitResearchFinal({ ...participant, submissionId: randomUUID(), answers: { staged: {} },
      situationalReferences: [accepted.receipt!] })).toMatchObject({ status: 'COMPLETED' })
    expect(await readGeneralForOwnAttempt(participant)).toMatchObject({ kind: 'DESCRIPTIVE' })
    expect((await readSurveySituational(participant, 'staged', child.attempt.id)).receipt).toEqual(accepted.receipt)
    const source = await loadSurveySource({ actorUserId: f.owner.id, projectId: f.projectId, waveIds: [frozenWave.id], includeAttendance: false })
    expect(source.scores).toHaveLength(1)
    expect(source.scores[0].value).toBe(5)
    const raw = JSON.parse(source.raw.find(row => row.itemKey === '__native_raw')!.value as string)
    expect(raw.responses).toEqual(nativeFixture.responses)
    expect(raw.researchCapture.events.length).toBeGreaterThan(0)
    expect(canonicalHash((await db.surveyPublication.findUniqueOrThrow({ where: { id: publication.id } })).compiledSnapshot))
      .toBe(canonicalHash(publication.compiledSnapshot))
    const pendingParticipant=await bindParticipant(f,frozenWave.id,published.publicationId)
    // A second explicitly issued capability remains valid. It must never be
    // silently substituted for the first capability frozen in the old grant.
    const alternative = await issueRoot(f)
    await expect(revokeAdminContentGrant(f.issuer.id, proof(), root.id, {
      expectedVersion: 1, reason: 'Synthetic future-distribution withdrawal',
    })).resolves.toEqual({ grantId: root.id, version: 2, changed: true })
    expect(await db.contentCapabilityGrant.findUniqueOrThrow({ where: { id: alternative.id } })).toEqual(alternative)
    const deniedImport = importInput('blocked-import')
    await expect(importCatalogDraft(f.owner.id, f.projectId, tool.id, deniedImport)).rejects.toMatchObject({ statusCode: 403 })
    await expect(copyDraft(f.owner.id, f.projectId, imported.id, importInput('blocked-copy'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(freeze(f, blockedWave.id, imported.id)).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.surveyInstrumentDraft.findUnique({ where: { id: deniedImport.requestId } })).toBeNull()
    expect(await db.surveyInstrumentDraft.count({ where: { projectId: f.projectId } })).toBe(1)
    expect(await db.surveyPublication.count({ where: { projectId: f.projectId } })).toBe(1)
    expect(await db.surveyWave.findUniqueOrThrow({ where: { id: blockedWave.id } })).toMatchObject({ publicationId: null, revision: 0, status: 'DRAFT' })
    const replacement = await historicalCatalogGrantFixture(db,f.entryAdmin.id, f.owner.id, f.ref)
    expect(replacement.id).not.toBe(tool.id)
    expect(replacement.sourceProvenance.sjtEntryAuthority).toEqual({ ...authority, grantId: alternative.id })

    // The withdrawal blocks only new admission; this server-bound participant
    // still reads its task and starts the frozen situational unit, matching the
    // native lifecycle contract for established attempts.
    await expect(getOwnResearchTask(pendingParticipant)).resolves.toBeDefined()
    await startSurveySituational(pendingParticipant,'staged')
    expect(await db.situationalAttempt.count({where:{surveyAttemptId:pendingParticipant.attemptId}})).toBe(1)
    expect(await readGeneralForOwnAttempt(participant)).toMatchObject({kind:'DESCRIPTIVE'})
    // All identities and permissions pre-existing to the explicit Survey root
    // remain byte-for-byte unchanged; these are isolated synthetic rows only.
    expect(await db.sjtAuthorRelease.findUniqueOrThrow({ where: { id: f.release.id } })).toEqual(f.release)
    expect(await db.measurementContentRelease.findUniqueOrThrow({ where: { id: f.measurement.id } })).toEqual(f.measurement)
    expect(await db.sjtReleaseGrant.findUniqueOrThrow({ where: { id: f.courseGrant.id } })).toEqual(f.courseGrant)
    expect(await db.adminEntryGrant.findUniqueOrThrow({ where: { id: f.entryGrant.id } })).toEqual(f.entryGrant)
    const training = await db.$transaction(tx => assertSjtCourseGrants(tx, [f.release], {
      teacherId: f.entryAdmin.id, courseId: f.course.id, purpose: 'TRAINING_COURSE',
    }, 'DISTRIBUTE', { lock: true }))
    expect(training.get(f.release.id)).toMatchObject({ policy: SJT_COURSE_GRANT_POLICY,
      grantId: f.courseGrant.id, grantVersion: 1, permission: 'DISTRIBUTE' })
  }, 30_000)

  it('rolls back a real import when its pinned capability expires at the synthetic final database clock', async () => {
    const f = await fixture(), root = await issueRoot(f)
    const tool = await historicalCatalogGrantFixture(db,f.entryAdmin.id, f.owner.id, f.ref)
    const input = importInput('expires-at-final-fence')
    let inserted = false, finalClockReads = 0
    const transact = prisma.$transaction.bind(prisma)
    // The only injected fact is time, after a real INSERT. Sources, identities,
    // grants, row locks, writes and rollback are actual PostgreSQL operations.
    // This is deterministic expiry coverage, not a claimed lock-wait race.
    const interception = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      transact(async tx => work(new Proxy(tx, { get(target, key) {
        const value = Reflect.get(target, key)
        if (key === 'surveyInstrumentDraft') return new Proxy(value, { get(delegate, operation) {
          const method = Reflect.get(delegate, operation)
          if (operation === 'create') return async (...args: unknown[]) => {
            const row = await method.apply(delegate, args)
            inserted = true
            return row
          }
          return typeof method === 'function' ? method.bind(delegate) : method
        } })
        if (key === '$queryRaw') return async (...args: unknown[]) => {
          const result = await value.apply(target, args)
          const query = args[0] as Prisma.Sql | TemplateStringsArray
          const text = ('strings' in query ? query.strings : query).join(' ').trim().replace(/\s+/g, ' ')
          if (inserted && text === 'SELECT clock_timestamp() AS now') {
            finalClockReads++
            return [{ now: new Date(root.expiresAt.getTime() + 1) }]
          }
          return result
        }
        return typeof value === 'function' ? value.bind(target) : value
      } })))) as typeof prisma.$transaction)
    try {
      await expect(importCatalogDraft(f.owner.id, f.projectId, tool.id, input)).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      interception.mockRestore()
    }
    expect(inserted).toBe(true)
    expect(finalClockReads).toBe(1)
    expect(await db.surveyInstrumentDraft.findUnique({ where: { id: input.requestId } })).toBeNull()
    expect(await db.surveyEvent.count({ where: { projectId: f.projectId, action: 'CATALOG_TOOL_IMPORTED' } })).toBe(0)
    expect(await db.contentCapabilityGrant.findUniqueOrThrow({ where: { id: root.id } })).toEqual(root)
    // The fake clock did not expire or mutate real permissions. The identical
    // request succeeds under the actual current clock after rollback.
    expect(await importCatalogDraft(f.owner.id, f.projectId, tool.id, input)).toMatchObject({ id: input.requestId })
  }, 30_000)
})
