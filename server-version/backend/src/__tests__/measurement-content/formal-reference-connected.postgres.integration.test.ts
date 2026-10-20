import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Redirect only the database binding to one restricted-runtime connection. All
// admission, consent, scoring, source, authority and publication code is real.
const binding = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }))
vi.mock('../../config/database', () => ({ prisma: new Proxy({}, { get(_target, key) {
  const value = (binding.db as any)[key]
  return typeof value === 'function' ? value.bind(binding.db) : value
} }) }))
// No media/export/background consumers are started by this focused acceptance.
vi.mock('../../config/queue', () => ({ exportQueue: {}, videoQueue: {}, imageQueue: {} }))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import * as questionnaire from '../../modules/questionnaire-product/service'
import * as study from '../../modules/anonymous-study/service'
import { publishStudyConsent, acceptStudyConsent } from '../../modules/anonymous-study/governance'
import { getAttemptState, finalizeCompositeAttemptIfReady } from '../../modules/composite/composite.service'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { claimCompositeReportJob } from '../../modules/assessment-runtime/report-outbox.service'
import { processCompositeReportJob } from '../../workers/compositeReportWorker'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { createTrainingReferenceCandidate } from '../../modules/training-analysis/reference-candidates.service'
import { readTrainingReferenceSource } from '../../modules/training-analysis/reference-source'
import { submitFormalReferenceCandidate, readFormalReferenceCandidate, reviewFormalReferenceCandidate,
  publishFormalReferenceCandidate } from '../../modules/measurement-content/formal-reference.service'
import { resolveFormalReferenceRelease } from '../../modules/measurement-content/formal-reference-resolver'
import { getContentRelease } from '../../modules/measurement-content/repository'
import { referenceConsentBodyHash } from '../../modules/measurement-content/reference-candidate'

const suite = process.env.MEASUREMENT_V10_FIXTURE === '1' ? describe : describe.skip
const state = process.env.MEASUREMENT_V10_STATE || '/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-20261020-0717'
const fixturePath = path.join(state, 'formal-reference-fixture-private.json')
let db: PrismaClient, owner: PrismaClient, holder: PrismaClient | undefined
let base: any, f: any
const consentBody = 'SYNTHETIC ACCEPTANCE ONLY. These generated SCALE responses may be used as aggregate cross-entry reference evidence in this isolated test. No participant-level publication, unrelated data use, or real scientific validity is authorized.'
const save = () => fs.writeFileSync(fixturePath, JSON.stringify(f, null, 2), { mode: 0o600 })
const txOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3000, timeout: 10000 }
const check = (name: string) => { f.checks ??= []; if (!f.checks.includes(name)) f.checks.push(name); save() }
const context = () => ({ actorId: base.teacher.id, courseId: base.courseId, compositeId: f.product.id, grantId: f.analyzeGrantId })
function promotion(source: any, grantId: string) {
  return { sourceCandidateId: source.candidateId, sourceCandidateHash: source.candidateHash, analyzeGrantId: grantId,
    statement: 'Synthetic source-owner proposal for independent review; not a scientific norm endorsement.',
    populationDescription: 'Five newly consented synthetic study participants in the isolated acceptance fixture.',
    applicability: 'Exact synthetic measurement only; no real population claim.', sampleAdequacy: 'Five satisfies software floor only, not population adequacy.',
    uncertainty: 'Synthetic fixture provides no real-world statistical or scientific validity.',
    consentUseAssessment: 'The actual accepted body permits this isolated aggregate cross-entry test and forbids participant-level publication.',
    targetPopulation: { kind: 'GENERAL_POPULATION', basis: 'Explicit fixture-only software matching exercise, not evidence of representativeness.' } }
}
async function fixtureGrant(id: string, subject: string, capabilities: string[], scopeKind = 'PLATFORM', scopeId = 'reference-governance', keys = [base.conversion.measurementReleaseId], expiresMs = 3600000) {
  // Test owner setup only. This is NOT root issuance, WebAuthn signing, a real
  // administrator grant, or a mutation to any actual user's security settings.
  await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
    (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
     delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
    VALUES (${id},${subject},${base.otherTeacher.id},'TRAINING',${scopeKind},${scopeId},'reference',${keys}::text[],
      ${capabilities}::text[],ARRAY[]::text[],0,clock_timestamp()-interval '1 minute',
      clock_timestamp()+${expiresMs}*interval '1 millisecond',ARRAY[${id}]) ON CONFLICT(id) DO NOTHING`)
}
async function ensureSource() {
  const actor = { userId: base.teacher.id, role: UserRole.TEACHER }
  f.productCreateInput ??= { requestId: f.productRequestId, name: 'V10 fresh consented formal source',
    questionnaireType: 'COURSE', courseIds: [base.courseId], publicEnabled: true,
    expiresAt: new Date(Date.now() + 86400000).toISOString() }; save()
  if (!f.product) { f.product = await questionnaire.create(actor, f.productCreateInput); save() }
  if (!f.itemId) { f.product = await questionnaire.addItem(actor, f.product.id, { revision: f.product.revision,
    item: { type: 'SCALE', scaleId: base.scaleId, required: true } }); f.itemId = f.product.items[0].id; save() }
  if (!f.published) { f.product = await questionnaire.publish(actor, f.product.id, { revision: f.product.revision }); f.published = true; save() }
  if (!f.study) { f.study = await study.createStudy(base.teacher.id, 'V10 synthetic prior-consent source'); save() }
  if (!f.consent) { f.consent = await publishStudyConsent(base.teacher.id, f.study.id, { requestId: f.consentRequestId,
    expectedVersionId: null, body: consentBody, scope: { purpose: 'Isolated synthetic aggregate cross-entry reference acceptance', dataCategories: ['SCALE'] } }); save() }
  f.waveCreateInput ??= { requestId: f.waveRequestId, compositeId: f.product.id, title: 'Five fresh consented synthetic responses',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), maxUses: 5 }; save()
  if (!f.wave) { f.wave = await study.createWaveWithLink(base.teacher.id, UserRole.TEACHER, f.study.id, f.waveCreateInput); save() }
  const token = decodeURIComponent(f.wave.entryPath.split('/').at(-1)!)
  for (let index = 0; index < 5; index++) {
    f.participants[index] ??= { acceptanceId: randomUUID(), submissionId: randomUUID() }; save()
    const p = f.participants[index]
    if (!p.identity) { p.identity = await study.joinStudy(f.wave.id, token, true); save() }
    if (!p.accepted) { const accepted = await acceptStudyConsent(f.study.id, p.identity.credential, {
      requestId: p.acceptanceId, versionId: f.consent.id, bodyHash: f.consent.bodyHash })
      expect(accepted.eligible).toBe(true); p.accepted = true; save() }
    if (!p.attempt) { p.attempt = await study.startStudyWave(f.study.id, f.wave.id, p.identity.credential); save() }
    let parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: p.attempt.attemptId } })
    const [accepted] = await db.$queryRaw<Array<{ accepted_at: Date }>>`SELECT accepted_at FROM anonymous_study_consent_acceptances WHERE id=${p.acceptanceId}`
    expect(accepted.accepted_at.getTime()).toBeLessThanOrEqual(parent.startedAt.getTime())
    expect(parent.deliveryCourseId).toBe(base.courseId)
    if (parent.status !== 'COMPLETED') {
      const runtime = await getAttemptState(parent.id, { recoveryTokenHash: hashRecoveryToken(p.attempt.recoveryToken) })
      const child = await db.assessment.findFirstOrThrow({ where: { compositeAttemptId: parent.id } })
      if (child.status !== 'COMPLETED') {
        p.submission ??= { assessmentId: child.id, submissionId: p.submissionId, attemptEpoch: parent.attemptEpoch,
          definitionHash: runtime.currentItem.definitionHash, contextSnapshotHash: runtime.contextSnapshotHash,
          compositeAttemptId: parent.id, recoveryTokenHash: hashRecoveryToken(p.attempt.recoveryToken),
          answers: [{ itemCode: 'v10-item', responseValue: index % 2 ? 'high' : 'low', responseTimeMs: 20 }] }; save()
        await submitScaleAssessmentFinal(p.submission)
      } else expect(child.submissionId).toBe(p.submissionId)
      await finalizeCompositeAttemptIfReady(parent.id)
      parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })
      if (parent.status !== 'COMPLETED') {
        const job = await claimCompositeReportJob()
        expect(job?.attemptId).toBe(parent.id)
        if (!job || job.attemptId !== parent.id) throw new Error('Unexpected outbox job; stop rather than process unrelated work')
        await processCompositeReportJob(job)
        expect((await db.compositeReportJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('READY')
      }
    }
    parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })
    expect(parent.status).toBe('COMPLETED'); expect(parent.trainingContentInterpretationHash).toMatch(/^[a-f0-9]{64}$/)
    p.finalHash ??= canonicalHash(JSON.parse(JSON.stringify(parent))); expect(canonicalHash(JSON.parse(JSON.stringify(parent)))).toBe(p.finalHash)
    p.complete = true; save()
  }
  f.selector ??= { itemId: f.itemId, scoreKey: 'effort', publication: new Date(f.product.publishedAt).toISOString(), configDigest: null, variantKey: null }; save()
  await fixtureGrant(f.analyzeGrantId, base.teacher.id, ['reference.analyze'], 'COURSE', base.courseId, [f.product.id])
  for (const [id, subject, capabilities, keys] of [
    [f.reviewGrantId, base.otherTeacher.id, ['reference.review'], [base.conversion.measurementReleaseId]],
    [f.publishGrantId, base.otherTeacher.id, ['reference.publish'], [base.conversion.measurementReleaseId]],
    [f.selfReviewGrantId, base.teacher.id, ['reference.review'], [base.conversion.measurementReleaseId]],
    [f.wrongMeasurementGrantId, base.otherTeacher.id, ['reference.review'], [f.product.id]],
  ] as Array<[string, string, string[], string[]]>) await fixtureGrant(id, subject, capabilities, 'PLATFORM', 'reference-governance', keys)
  if (!f.source) { f.source = await createTrainingReferenceCandidate(context(), { requestId: f.sourceRequestId, selector: f.selector,
    referenceVersion: '1', evidence: { methodRationale: 'Existing trusted observed mean and sample SD', inclusionRule: 'Exactly five new study identities accepting before START',
      missingness: 'None in synthetic accepted facts', repeatResponses: 'One FINAL per new identity', organizationClustering: 'One isolated course',
      administrationDifferences: 'One exact publication', uncertainty: 'No real scientific validity', applicability: 'Isolated fixture only', sampleAdequacy: 'Software floor only' } }); save() }
  expect(f.source.sampleSize).toBe(5)
  const source = await db.$transaction(tx => readTrainingReferenceSource(tx, context(), f.selector), txOptions)
  expect(source.consentCoveredSampleCount).toBe(5); expect(source.consentScopes).toHaveLength(1)
  expect(source.consentScopes[0]).toMatchObject({ versionId: f.consent.id, body: consentBody, bodyHash: referenceConsentBodyHash(consentBody), scopeHash: f.consent.scopeHash })
  expect(source.binding.sourceIds.map(row => row.attemptId).sort()).toEqual(f.participants.map((p: any) => p.attempt.attemptId).sort())
  for (const old of base.finals) expect(source.binding.sourceIds.some(row => row.attemptId === old.attemptId)).toBe(false)
  check('Five fresh actual native FINALs accepted research notice before START; original non-consented FINALs excluded')
}
const action = () => ({ candidateId: f.formal.candidateId, candidateHash: f.formal.candidateHash })
const reviewInput = () => ({ ...action(), grantId: f.reviewGrantId, requestId: f.reviewId, decision: 'APPROVED',
  statement: 'Independent synthetic software-governance review; accepted notice restrictions checked; no scientific-validity endorsement.', consentReviewed: true })
const publishInput = () => ({ ...action(), grantId: f.publishGrantId, reviewId: f.reviewId, localKey: f.localKey, version: '1' })
function absentPrivateData(value: unknown, bodyAllowed = false) {
  const text = JSON.stringify(value)
  expect(text).not.toMatch(/"sampleManifest"|"sourceIds"|"factId"|"factVersion"|"sourceBinding"/)
  for (const p of f.participants) { expect(text).not.toContain(p.attempt.attemptId); expect(text).not.toContain(p.identity.credential) }
  if (!bodyAllowed) expect(text).not.toContain(consentBody)
}

suite('V10 consented formal source → independent exact-grant review → aggregate publication', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !/^[a-f0-9]{40}$/.test(process.env.MEASUREMENT_V10_HEAD || '')) throw new Error('Exact isolated invocation required')
    if (!state.startsWith('/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-')) throw new Error('Dedicated fixture directory required')
    const runtime = new URL(process.env.MEASUREMENT_V10_RUNTIME_DATABASE_URL || ''), admin = new URL(process.env.MEASUREMENT_V10_OWNER_DATABASE_URL || '')
    if (runtime.hostname !== '127.0.0.1' || runtime.port !== '39403' || runtime.pathname !== '/eduk12_measurement_v10_test'
      || admin.hostname !== runtime.hostname || admin.port !== runtime.port || admin.pathname !== runtime.pathname || admin.username !== 'v10_owner'
      || !/^v10_runtime_[a-f0-9]{8}$/.test(runtime.username) || process.env.DATABASE_URL !== runtime.href) throw new Error('Dedicated synthetic runtime required')
    runtime.searchParams.set('connection_limit', '1'); admin.searchParams.set('connection_limit', '1')
    db = new PrismaClient({ datasources: { db: { url: runtime.href } } }); binding.db = db
    owner = new PrismaClient({ datasources: { db: { url: admin.href } } }); await db.$connect(); await owner.$connect()
    base = JSON.parse(fs.readFileSync(path.join(state, 'training-fixture-private.json'), 'utf8'))
    expect(base.label).toContain('SYNTHETIC'); expect(base.finals.filter((p: any) => p.complete)).toHaveLength(5)
    expect(base.teacher.username).toMatch(/^v10-/); expect(base.otherTeacher.username).toMatch(/^v10-/)
    f = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath, 'utf8')) : {
      label: 'SYNTHETIC_GRANT_FIXTURE_NOT_ADMIN_WEBAUTHN_ISSUANCE; NO ACCEPTED FACT SEED',
      productRequestId: randomUUID(), consentRequestId: randomUUID(), waveRequestId: randomUUID(), sourceRequestId: randomUUID(),
      analyzeGrantId: randomUUID(), reviewGrantId: randomUUID(), publishGrantId: randomUUID(), selfReviewGrantId: randomUUID(),
      wrongMeasurementGrantId: randomUUID(), reviewId: randomUUID(), localKey: 'v10-formal-' + randomUUID(), participants: [], checks: [] }
    save(); await ensureSource(); await owner.$disconnect()
  }, 120000)
  afterAll(async () => { await holder?.$disconnect(); await owner?.$disconnect(); await db?.$disconnect() })

  it('refuses the original no-consent candidate, then promotes only the exact new accepted body/hash scope', async () => {
    await expect(submitFormalReferenceCandidate(base.teacher.id, 'TRAINING', promotion(base.candidate, base.referenceGrantId)))
      .rejects.toThrow('REFERENCE_CONSENT_EVIDENCE_UNAVAILABLE')
    f.formal = await submitFormalReferenceCandidate(base.teacher.id, 'TRAINING', promotion(f.source, f.analyzeGrantId)); save()
    expect(await submitFormalReferenceCandidate(base.teacher.id, 'TRAINING', promotion(f.source, f.analyzeGrantId))).toEqual(f.formal)
    expect(f.formal.sampleCount).toBe(5); expect(f.formal.consentEvidence).toEqual([{ version: String(f.consent.version),
      scopeHash: f.consent.scopeHash, purpose: f.consent.scope.purpose, dataCategories: ['SCALE'], body: consentBody, bodyHash: f.consent.bodyHash }])
    const read = await readFormalReferenceCandidate(base.otherTeacher.id, { candidateId: f.formal.candidateId, grantId: f.reviewGrantId })
    expect(read).toEqual(f.formal); absentPrivateData(read, true)
    expect(read.definition.entries[0].statistics).toEqual(f.source.definition.entries[0].statistics)
    expect(read.definition.entries[0].derivation).toMatchObject({ distributionAssumption: 'unknown', allowEstimatedPercentile: false })
    check('Actual accepted body/hash/scope preserved for reviewer; original non-consented source denied; exact proposal retry stable')
  })

  it('rejects foreign, wrong-scope, wrong-capability and self-review while preserving exact immutable review grant/version', async () => {
    await expect(readFormalReferenceCandidate(base.teacher.id, { candidateId: f.formal.candidateId, grantId: f.reviewGrantId })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    await expect(readFormalReferenceCandidate(base.otherTeacher.id, { candidateId: f.formal.candidateId, grantId: f.wrongMeasurementGrantId })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    await expect(readFormalReferenceCandidate(base.otherTeacher.id, { candidateId: f.formal.candidateId, grantId: f.publishGrantId })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    await expect(reviewFormalReferenceCandidate(base.teacher.id, { ...reviewInput(), requestId: randomUUID(), grantId: f.selfReviewGrantId })).rejects.toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    await expect(reviewFormalReferenceCandidate(base.otherTeacher.id, { ...reviewInput(), candidateHash: 'f'.repeat(64) })).rejects.toThrow('REFERENCE_REVIEW_STALE')
    f.review = await reviewFormalReferenceCandidate(base.otherTeacher.id, reviewInput()); save()
    expect(await reviewFormalReferenceCandidate(base.otherTeacher.id, reviewInput())).toEqual(f.review)
    await expect(reviewFormalReferenceCandidate(base.otherTeacher.id, { ...reviewInput(), statement: 'Altered immutable decision' })).rejects.toThrow('REFERENCE_REVIEW_REQUEST_CONFLICT')
    const [review] = await db.$queryRaw<any[]>`SELECT * FROM measurement_reference_reviews WHERE id=${f.reviewId}`
    expect(review).toMatchObject({ candidate_hash: f.formal.candidateHash, reviewer_id: base.otherTeacher.id,
      reviewer_grant_id: f.reviewGrantId, reviewer_grant_version: 1, decision: 'APPROVED' })
    await expect(db.$executeRaw`UPDATE measurement_reference_reviews SET reviewer_grant_version=2 WHERE id=${f.reviewId}`).rejects.toThrow('CONTENT_EVENT_IMMUTABLE')
    await expect(db.$executeRaw`UPDATE measurement_reference_reviews SET reviewer_grant_id=${f.publishGrantId} WHERE id=${f.reviewId}`).rejects.toThrow('CONTENT_EVENT_IMMUTABLE')
    await expect(db.$executeRaw`INSERT INTO measurement_reference_reviews
      (id,candidate_id,candidate_hash,reviewer_id,reviewer_grant_id,reviewer_grant_version,decision,statement)
      VALUES (${randomUUID()},${f.formal.candidateId},${f.formal.candidateHash},${base.teacher.id},${f.selfReviewGrantId},1,'APPROVED','Synthetic self-review must fail')`)
      .rejects.toThrow('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
    check('Real authority rejects foreign/wrong grant and self-review; exact review UUID/grant/version immutable at service and SQL boundaries')
  })

  it('publishes only the persisted independent approved review and exposes aggregates plus hashes, not samples or consent body', async () => {
    await expect(publishFormalReferenceCandidate(base.otherTeacher.id, { ...publishInput(), reviewId: randomUUID() })).rejects.toThrow('REFERENCE_APPROVED_REVIEW_NOT_FOUND')
    await expect(publishFormalReferenceCandidate(base.otherTeacher.id, { ...publishInput(), candidateHash: 'e'.repeat(64) })).rejects.toThrow('REFERENCE_REVIEW_STALE')
    f.release = await publishFormalReferenceCandidate(base.otherTeacher.id, publishInput()); save()
    expect(await publishFormalReferenceCandidate(base.otherTeacher.id, publishInput())).toEqual(f.release)
    const release = await db.$transaction(tx => getContentRelease(tx, f.release.releaseId, true), txOptions)
    expect(release).toMatchObject({ scope: { kind: 'PLATFORM' }, status: 'PUBLISHED', layer: 'REFERENCE',
      provenance: { candidateId: f.formal.candidateId, reviewId: f.reviewId }, content: { evidence: {
        sampleCount: 5, sampleManifestHash: f.formal.sampleManifestHash, consentScopeHashes: [f.consent.scopeHash], consentBodyHashes: [f.consent.bodyHash] } } })
    absentPrivateData(release)
    const resolved = await db.$transaction(tx => resolveFormalReferenceRelease(tx, { releaseId: f.release.releaseId,
      contentHash: f.release.contentHash, measurementReleaseId: base.conversion.measurementReleaseId, purpose: 'NEW_BINDING' }), txOptions)
    expect(resolved.entries).toHaveLength(1); absentPrivateData(resolved)
    for (const p of f.participants) expect(canonicalHash(JSON.parse(JSON.stringify(await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: p.attempt.attemptId } }))))).toBe(p.finalHash)
    check('Real publication/resolver carry aggregate evidence and sample/consent hashes only; five original accepted FINAL rows unchanged')
  })

  it('enforces actual cookie/CSRF and explicit-grant boundaries on existing governance HTTP without any admin-issuance claim', async () => {
    const status = JSON.parse(fs.readFileSync(path.join(state, 'status.json'), 'utf8'))
    expect(status.apiUrl).toBe('http://127.0.0.1:39991')
    function client() {
      const cookies = new Map<string, string>()
      return { async request(route: string, method = 'GET', body?: unknown, expected = 200, csrf = true) {
        const response = await fetch(status.apiUrl + '/api' + route, { method, signal: AbortSignal.timeout(15000), headers: {
          'content-type': 'application/json', ...(cookies.size ? { cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
          ...(csrf && cookies.has('ptool_csrf') ? { 'x-csrf-token': cookies.get('ptool_csrf')! } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
        for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';', 1)[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)) }
        expect(response.status).toBe(expected)
        const data = await response.json() as any
        if (expected === 200) expect(data.code).toBe(0)
        return data.data
      }, async login(actor: any) {
        await this.request('/auth/csrf')
        await this.request('/auth/training-login', 'POST', { username: actor.username, password: base.password, expectedRole: actor.role })
      } }
    }
    const reviewer = client(), analyzer = client(); await reviewer.login(base.otherTeacher); await analyzer.login(base.teacher)
    const route = '/training/reference-governance'
    await reviewer.request(route + '/read', 'POST', { candidateId: f.formal.candidateId, grantId: f.reviewGrantId }, 403, false)
    await analyzer.request(route + '/read', 'POST', { candidateId: f.formal.candidateId, grantId: f.reviewGrantId }, 403)
    const read = await reviewer.request(route + '/read', 'POST', { candidateId: f.formal.candidateId, grantId: f.reviewGrantId })
    expect(read).toEqual(f.formal); absentPrivateData(read, true)
    expect(await reviewer.request(route + '/reviews', 'POST', reviewInput())).toEqual(f.review)
    expect(await reviewer.request(route + '/publish', 'POST', publishInput())).toEqual(f.release)
    check('Existing live API accepts exact governance retry under real cookies/CSRF and fixture grants; foreign/no-CSRF denied; no WebAuthn/admin issuance fabricated')
  }, 45000)

  it('rolls publication back after an observed real release-axis wait outlives the exact publisher grant', async () => {
    const grantId = randomUUID(), localKey = 'v10-formal-expiry-' + randomUUID()
    f.expiryAttempt = { grantId, localKey, outcome: 'NOT_STARTED' }; save()
    // Owner connects only to create this labelled synthetic grant, then closes.
    // Exactly two runtime connections remain for the real wait and clock proof.
    await owner.$connect(); await fixtureGrant(grantId, base.otherTeacher.id, ['reference.publish'], 'PLATFORM', 'reference-governance', [base.conversion.measurementReleaseId], 4500); await owner.$disconnect()
    const runtime = new URL(process.env.DATABASE_URL!); runtime.searchParams.set('connection_limit', '1')
    holder = new PrismaClient({ datasources: { db: { url: runtime.href } } }); await holder.$connect()
    const key = `reference:${canonicalHash({ kind: 'PLATFORM' })}:${localKey}`, lockHash = canonicalHash(['SCALE', 'REFERENCE', key, '1'])
    let result: Promise<{ ok: boolean; error?: unknown }> | undefined
    await holder.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockHash}))`)
      f.expiryAttempt.outcome = 'PENDING'; save()
      result = publishFormalReferenceCandidate(base.otherTeacher.id, { ...publishInput(), grantId, localKey })
        .then(() => ({ ok: true }), error => ({ ok: false, error }))
      const deadline = Date.now() + 3000
      let waiting = false
      while (Date.now() < deadline) {
        const [row] = await tx.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS(
          SELECT 1 FROM pg_locks w JOIN pg_locks h ON w.locktype=h.locktype AND w.database=h.database
            AND w.classid=h.classid AND w.objid=h.objid AND w.objsubid=h.objsubid
          WHERE h.pid=pg_backend_pid() AND h.locktype='advisory' AND h.granted AND NOT w.granted AND w.pid<>h.pid) AS waiting`
        if (row.waiting) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      expect(waiting).toBe(true)
      const [clock] = await tx.$queryRaw<Array<{ wait_ms: number }>>`SELECT GREATEST(0,EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))*1000)::float8+100 AS wait_ms FROM content_capability_grants WHERE id=${grantId}`
      expect(clock.wait_ms).toBeLessThan(5000)
      await tx.$executeRaw(Prisma.sql`SELECT pg_sleep(${clock.wait_ms / 1000})`)
    }, { ...txOptions, timeout: 9000 })
    const observed = await result!; f.expiryAttempt.outcome = observed.ok ? 'UNEXPECTED_PUBLICATION' : String(observed.error); save()
    expect(observed.ok).toBe(false); expect(String(observed.error)).toContain('CONTENT_AUTHORITY_DENIED')
    expect(await db.$queryRaw<any[]>`SELECT id FROM measurement_content_releases WHERE content_key=${key}`).toHaveLength(0)
    expect(await db.$queryRaw<any[]>`SELECT id FROM measurement_reference_reviews WHERE id=${f.reviewId}`).toHaveLength(1)
    await holder.$disconnect(); holder = undefined
    check('Observed PostgreSQL release-axis advisory wait crosses exact publisher expiry; post-write authority rejection rolls back new release without harming immutable review')
  }, 15000)
})
