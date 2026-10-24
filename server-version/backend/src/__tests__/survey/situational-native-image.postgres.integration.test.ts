import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { Response } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { getLocalAssetPath, storeAsset } from '../../services/assetStorage'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { issueAdminContentRoot, revokeAdminContentGrant } from '../../modules/measurement-content/admin-authority.service'
import { SJT_COURSE_GRANT_POLICY } from '../../modules/situational/authoring/grants'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { serveFrozenSituationalAsset } from '../../modules/situational/situational-asset.service'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { importCatalogDraft } from '../../modules/survey/builder.service'
import { grantCatalogSource, revokeToolGrant } from '../../modules/survey/catalog.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { authorizeSurveySituationalImage, readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
// Original 1 x 1 RGB (#1265aa) PNG, encoded from PNG chunks and a zlib scanline.
// No external image, catalog material, license assertion or network fetch is used.
const originalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQSl0FAAGuASIgVC/fAAAAAElFTkSuQmCC', 'base64')

suite('Survey native staged image: formal source, frozen authorization and actual local bytes', () => {
  let db: PrismaClient
  const temporaryFiles: string[] = []
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
    // Only files this suite created are removed. Synthetic database fixtures live
    // exclusively in the explicitly isolated test database and are never reset here.
    try { await Promise.all(temporaryFiles.map(file => rm(file, { force: true }))) }
    finally { await db?.$disconnect(); vi.unstubAllEnvs() }
  })

  const adminProof = () => ({ tokenVersion: 0, adminSessionId: 'synthetic-image-system-session', adminVerifiedAt: Date.now() / 1000 })
  async function localImage(ownerId: string) {
    const asset = await storeAsset({ buffer: originalPng, originalName: 'original-synthetic-pixel.png',
      mimeType: 'image/png', ownerId, accessScope: 'PRIVATE', scopeId: 'sjt-authoring', provider: 'local' })
    temporaryFiles.push(getLocalAssetPath(asset.objectKey))
    return asset
  }
  async function fixture() {
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY', system = false) =>
      db.user.create({ data: { username: 'native-image-' + randomUUID(), passwordHash: 'synthetic-no-login',
        role, accountDomain, platformRole: system ? 'SYSTEM_ADMIN' : 'STANDARD' } })
    const issuer = await user('ADMIN', 'LEGACY', true), entryAdmin = await user('ADMIN', 'LEGACY')
    const author = await user('STUDENT', 'LEGACY'), owner = await user('STUDENT', 'SURVEY')
    const entryGrant = await db.adminEntryGrant.create({ data: {
      id: randomUUID(), userId: entryAdmin.id, entry: 'SURVEY', grantedBy: issuer.id,
    } })
    const login = 'image_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner.id, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner.id, status: 'ACTIVE', grantedBy: issuer.id } })
    await db.surveyMfaCredential.create({ data: { userId: owner.id, enabled: true, secretCipher: 'synthetic-only' } })
    const asset = await localImage(author.id)
    const image = { asset: { assetId: asset.id, contentHash: asset.sha256, mimeType: 'image/png' as const },
      altText: 'One original blue test pixel.', rightsStatus: 'self_authored' as const,
      rightsNote: 'Original RGB pixel generated for this isolated software fixture; no external material.' }
    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-image-' + randomUUID(),
      nodes: sjtNativeStagedTemplate.nodes.map((node, index) => ({ ...node, ...(index === 0 ? { image } : {}) })) }
    const compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const draft = await createSjtDraft({ userId: author.id, admin: false }, template, { authorizationPolicy: SJT_COURSE_GRANT_POLICY })
    await requestSjtReview({ userId: author.id, admin: false }, draft.id, draft.revision, draft.contentDigest)
    await reviewSjtDraft({ userId: issuer.id, admin: true }, draft.id, draft.revision, draft.contentDigest, true,
      'Independent synthetic staged source and original pixel; no restricted registry content or human data')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { sourceDraftId: draft.id } })
    expect(release).toMatchObject({ status: 'PUBLISHED', authorizationPolicy: SJT_COURSE_GRANT_POLICY })
    expect(release.measurementReleaseId).not.toBeNull()
    const measurement = await db.measurementContentRelease.findUniqueOrThrow({ where: { id: release.measurementReleaseId! } })
    const sourcePin = await db.assetReference.findFirstOrThrow({ where: {
      assetId: asset.id, entityType: 'SjtAuthorRelease', entityId: release.id, field: 'media',
    } })
    const ref = { kind: 'SJT' as const, sourceId: release.id, sourceVersion: release.instrumentVersion }
    // A Survey entry by itself is not permission to distribute this exact source.
    await expect(grantCatalogSource(entryAdmin.id, owner.id, ref)).rejects.toMatchObject({ statusCode: 403 })
    const rootId = randomUUID()
    expect(await issueAdminContentRoot(issuer.id, adminProof(), {
      requestId: rootId, expectedVersion: 0, reason: 'Explicit Survey distribution of this original image fixture only',
      grant: { subjectId: entryAdmin.id, scope: { product: 'SURVEY', scopeKind: 'PLATFORM',
        scopeId: 'situational-library-governance', resourceKind: 'material', resourceKeys: [measurement.id] },
      capabilities: ['material.distribute'], delegableCapabilities: [], remainingDelegationDepth: 0,
      validFrom: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    })).toEqual({ grantId: rootId, version: 1, changed: true })
    const tool = await grantCatalogSource(entryAdmin.id, owner.id, ref)
    const authority = { protocol: 'sjt-survey-distribution-v1', actorId: entryAdmin.id, grantId: rootId, grantVersion: 1,
      measurementReleaseId: measurement.id, measurementContentHash: measurement.contentHash,
      releaseId: release.id, instrumentVersion: release.instrumentVersion,
      definitionHash: release.definitionHash, contentDigest: release.contentDigest }
    expect(tool.sourceProvenance.sjtEntryAuthority).toEqual(authority)
    const projectId = randomUUID(), publicId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, publicId, ownerUserId: owner.id,
      title: 'Synthetic image lifecycle', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' } })
    const imported = await importCatalogDraft(owner.id, projectId, tool.id,
      { requestId: randomUUID(), instrumentKey: 'staged', title: 'Original image staged fixture' })
    expect(imported.sourceProvenance?.sjtEntryAuthority).toEqual(authority)
    const waveId = randomUUID()
    await db.surveyWave.create({ data: { id: waveId, projectId, ordinal: 1, title: 'Synthetic image wave', instrumentIds: [imported.id],
      consentText: 'Synthetic research participation consent; no real human information is collected in this test.' } })
    const published = await freezeResearchWaveDraft({ actorUserId: owner.id, projectId, waveId, revision: 0,
      participantFeedback: [{ instrumentId: imported.id, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1',
        mode: 'DESCRIPTIVE', metricKeys: ['coordination'], release: 'AFTER_FINAL' } }] })
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: published.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(snapshot.units[0]).toMatchObject({ executionProtocol: 'SITUATIONAL_NATIVE_V1', sourceProvenance: { sjtEntryAuthority: authority } })
    const publicationPin = await db.assetReference.findFirstOrThrow({ where: {
      assetId: asset.id, entityType: 'SurveyResearchPublication', entityId: publication.id, field: 'media',
    } })
    await db.surveyWave.update({ where: { id: waveId }, data: { status: 'OPEN', opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000), finishUntil: new Date(Date.now() + 7_200_000) } })
    const accessCredential = randomBytes(32).toString('base64url'), attemptId = randomUUID()
    await db.$transaction(async tx => {
      await tx.surveyWaveAttempt.create({ data: { id: attemptId, projectId, waveId, status: 'STARTED',
        sessionHash: hashResearchCredential(accessCredential) } })
      await tx.surveyConsent.create({ data: { id: randomUUID(), projectId, waveId, attemptId, consentVersion: 1, accepted: true } })
      await bindSurveyAttemptContent(tx, { projectId, waveId, attemptId, publicationId: publication.id, newAttempt: true })
    })
    const proof = { publicId, attemptId, accessCredential }
    return { issuer, entryAdmin, entryGrant, author, owner, asset, image, compiled, release, measurement, sourcePin,
      rootId, tool, projectId, imported, waveId, publication, publicationPin, proof }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  async function start(f: Fixture) {
    const child = await startSurveySituational(f.proof, 'staged')
    expect((await startSurveySituational(f.proof, 'staged')).attempt.id).toBe(child.attempt.id)
    expect((await readSurveySituational(f.proof, 'staged', child.attempt.id)).attempt.id).toBe(child.attempt.id)
    const pin = await db.assetReference.findFirstOrThrow({ where: { assetId: f.asset.id,
      entityType: 'AssessmentFrozenRuntime', entityId: `SITUATIONAL:${child.attempt.id}`, field: 'media' } })
    expect(await db.assetReference.count({ where: { assetId: f.asset.id, entityType: pin.entityType, entityId: pin.entityId, field: pin.field } })).toBe(1)
    return { child, pin }
  }
  async function deliver(f: Fixture, childId: string) {
    const snapshot = await authorizeSurveySituationalImage(f.proof, 'staged', childId, f.asset.id)
    expect(snapshot.definition.scenes).toEqual(expect.arrayContaining([expect.objectContaining({
      stimulus: expect.objectContaining({ type: 'IMAGE', asset: f.image.asset, altText: f.image.altText }),
    })]))
    const chunks: Buffer[] = [], headers = new Map<string, unknown>()
    const sink = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done() } })
    const res = Object.assign(sink, { setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), value); return this } }) as unknown as Response
    // Actual local-file stream through the production shared delivery adapter;
    // only the HTTP transport is replaced with an in-memory writable sink.
    const completion = finished(sink)
    await serveFrozenSituationalAsset({ snapshot, assetId: f.asset.id, res })
    await completion
    expect(Buffer.concat(chunks)).toEqual(originalPng)
    expect(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')).toBe(f.image.asset.contentHash)
    expect(headers.get('content-type')).toBe('image/png')
    expect(headers.get('content-length')).toBe(String(originalPng.length))
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.has('location')).toBe(false)
    return snapshot
  }

  it('retains original source/publication/child image, survives future grant revocation, and keeps shared FINAL/report/raw semantics', async () => {
    const f = await fixture(), { child, pin } = await start(f)
    const frozen = await deliver(f, child.attempt.id)
    await revokeToolGrant(f.entryAdmin.id, f.tool.id)
    expect(await revokeAdminContentGrant(f.issuer.id, adminProof(), f.rootId,
      { expectedVersion: 1, reason: 'Synthetic future distribution withdrawal, not a participant hard stop' }))
      .toEqual({ grantId: f.rootId, version: 2, changed: true })
    await expect(importCatalogDraft(f.owner.id, f.projectId, f.tool.id,
      { requestId: randomUUID(), instrumentKey: 'revoked', title: 'Must not be imported' })).rejects.toThrow()
    expect(canonicalHash(await deliver(f, child.attempt.id))).toBe(canonicalHash(frozen))
    const nativeFixture = createSjtNativeStagedFinalFixture(child.attempt.id, 'path-A-A', f.compiled)
    const payload = situationalLegacyFinalSubmitSchema.parse({ ...nativeFixture.finalInput, submissionId: randomUUID() })
    const accepted = await submitSurveySituationalFinal(f.proof, 'staged', child.attempt.id, payload)
    expect(accepted.receipt).toBeDefined()
    expect(accepted).not.toHaveProperty('result')
    expect((await submitSurveySituationalFinal(f.proof, 'staged', child.attempt.id, payload)).receipt).toEqual(accepted.receipt)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: child.attempt.id } })).toBe(1)
    expect(await submitResearchFinal({ ...f.proof, submissionId: randomUUID(), answers: { staged: {} },
      situationalReferences: [accepted.receipt!] })).toMatchObject({ status: 'COMPLETED' })
    expect(await readGeneralForOwnAttempt(f.proof)).toMatchObject({ kind: 'DESCRIPTIVE' })
    expect((await readSurveySituational(f.proof, 'staged', child.attempt.id)).receipt).toEqual(accepted.receipt)
    const source = await loadSurveySource({ actorUserId: f.owner.id, projectId: f.projectId, waveIds: [f.waveId], includeAttendance: false })
    expect(source.scores).toHaveLength(1)
    expect(source.scores[0].value).toBe(5)
    const raw = JSON.parse(source.raw.find(row => row.itemKey === '__native_raw')!.value as string)
    expect(raw.responses).toEqual(nativeFixture.responses)
    expect(raw.researchCapture.events.length).toBeGreaterThan(0)
    const rawText = JSON.stringify({ rows: source.raw, native: raw })
    expect(rawText).not.toContain(f.proof.accessCredential)
    expect(rawText).not.toContain(f.asset.objectKey)
    expect(rawText).not.toMatch(/https?:\/\/|data:image|"(?:url|imageUrl|signedUrl|accessCredential|proof|objectKey)"\s*:/)
    expect(await db.assetReference.findUniqueOrThrow({ where: { id: f.sourcePin.id } })).toEqual(f.sourcePin)
    expect(await db.assetReference.findUniqueOrThrow({ where: { id: f.publicationPin.id } })).toEqual(f.publicationPin)
    expect(await db.assetReference.findUniqueOrThrow({ where: { id: pin.id } })).toEqual(pin)
    expect(await db.sjtAuthorRelease.findUniqueOrThrow({ where: { id: f.release.id } })).toEqual(f.release)
    expect(await db.measurementContentRelease.findUniqueOrThrow({ where: { id: f.measurement.id } })).toEqual(f.measurement)
    expect(await db.adminEntryGrant.findUniqueOrThrow({ where: { id: f.entryGrant.id } })).toEqual(f.entryGrant)
    expect(await db.surveyPublication.findUniqueOrThrow({ where: { id: f.publication.id } })).toEqual(f.publication)
  }, 30_000)

  async function rejectRolledBackMutation(mutate: (tx: Prisma.TransactionClient) => Promise<unknown>, operation: () => Promise<unknown>) {
    const transact = prisma.$transaction.bind(prisma)
    let mutated = false
    const interception = vi.spyOn(prisma, '$transaction').mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      // verifiedSurveyAttempt performs two real read transactions first. Inject
      // only inside the bounded locked-image transaction, not those proof reads.
      if (options?.maxWait !== 2_000 || options.timeout !== 10_000) return transact(work, options)
      return transact(async tx => {
        if (mutated) throw new Error('Unexpected second locked image transaction')
        await mutate(tx)
        mutated = true
        await work(tx)
        // Even an unexpected success rolls back; no immutable fixture is restored
        // by rewriting it. The statusCode expectation below then fails correctly.
        throw new Error('Expected image authorization refusal; rolling back synthetic mutation')
      }, options)
    }) as typeof prisma.$transaction)
    try { await expect(operation()).rejects.toMatchObject({ statusCode: 403 }) }
    finally { interception.mockRestore() }
    expect(mutated).toBe(true)
  }

  it('refuses foreign proof/asset, absent frozen pins, deleted/public/changed-identity assets without durable mutations', async () => {
    const f = await fixture(), { child, pin } = await start(f)
    const authorize = () => authorizeSurveySituationalImage(f.proof, 'staged', child.attempt.id, f.asset.id)
    const foreign = await localImage(f.author.id)
    await expect(authorizeSurveySituationalImage({ ...f.proof, accessCredential: randomBytes(32).toString('base64url') },
      'staged', child.attempt.id, f.asset.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(authorizeSurveySituationalImage(f.proof, 'staged', randomUUID(), f.asset.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(authorizeSurveySituationalImage(f.proof, 'staged', child.attempt.id, foreign.id)).rejects.toMatchObject({ statusCode: 403 })
    for (const missingPin of [f.publicationPin, pin]) {
      await rejectRolledBackMutation(tx => tx.assetReference.delete({ where: { id: missingPin.id } }), authorize)
      expect(await db.assetReference.findUniqueOrThrow({ where: { id: missingPin.id } })).toEqual(missingPin)
    }
    const originalAsset = await db.storedAsset.findUniqueOrThrow({ where: { id: f.asset.id } })
    for (const data of [{ deletedAt: new Date() }, { accessScope: 'PUBLIC' }, { sha256: 'f'.repeat(64) }, { mimeType: 'image/jpeg' }]) {
      await rejectRolledBackMutation(tx => tx.storedAsset.update({ where: { id: f.asset.id }, data }), authorize)
      expect(await db.storedAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).toEqual(originalAsset)
    }
    await deliver(f, child.attempt.id)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: child.attempt.id } })).toBe(0)
    expect((await readSurveySituational(f.proof, 'staged', child.attempt.id)).receipt).toBeUndefined()
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: f.proof.attemptId } })).status).toBe('STARTED')
  }, 30_000)
})
