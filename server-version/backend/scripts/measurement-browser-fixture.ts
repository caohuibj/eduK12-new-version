/**
 * Fresh CI-only browser prerequisites, not a repeated acceptance suite.
 * seed: restricted runtime role, real operator enrollment ticket, draft sources.
 * finals: five original native Scale FINALs required by the reference UI floor.
 * No session/JWT/admin proof, accepted fact, release or report is fabricated.
 * NEVER upload this private directory, handoffs, database or browser storage.
 */
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import pg from 'pg'

const phase = process.argv[2] || 'seed'
assert.ok(['seed', 'finals', 'grant'].includes(phase), 'Explicit fixture phase required')
const browserPhase = process.env.MEASUREMENT_BROWSER_PHASE
assert.ok(['admin', 'journeys'].includes(browserPhase || ''), 'Exact independent browser job required')
if (phase !== 'seed') assert.equal(browserPhase, 'journeys')
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.CI, 'true')
assert.equal(process.env.NODE_ENV, 'test')
assert.equal(process.env.MEASUREMENT_BROWSER_ISOLATED, '1')
assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_ENV)
const privateRoot = path.resolve(process.env.RUNNER_TEMP!, 'measurement-browser-private')
assert.equal(path.resolve(process.env.MEASUREMENT_BROWSER_FIXTURE_DIR || privateRoot), privateRoot)
mkdirSync(privateRoot, { recursive: true, mode: 0o700 })
assert.ok(lstatSync(privateRoot).isDirectory() && !lstatSync(privateRoot).isSymbolicLink())
assert.equal(lstatSync(privateRoot).mode & 0o077, 0)
assert.equal(realpathSync(privateRoot), privateRoot)
assert.ok(path.resolve(process.env.GITHUB_ENV!).startsWith(path.resolve(process.env.RUNNER_TEMP!) + path.sep))
const fixturePath = path.join(privateRoot, 'fixture.json')
const ownerUrl = new URL(process.env.MEASUREMENT_BROWSER_OWNER_DATABASE_URL || '')
assert.ok(['localhost', '127.0.0.1'].includes(ownerUrl.hostname))
assert.equal(ownerUrl.port || '5432', '5432')
assert.equal(ownerUrl.pathname, '/ptool')
assert.equal(ownerUrl.username, 'ptool')
const mask = (value: string) => {
  assert.ok(value && !/[\r\n]/.test(value))
  process.stdout.write(`::add-mask::${value}\n`)
}
const password = () => randomBytes(24).toString('base64url') + 'Az7!'
const owner = new PrismaClient({ datasources: { db: { url: ownerUrl.href } } })
let runtime: PrismaClient | undefined
let closeQueues: (() => Promise<void>) | undefined
let fixture: any
const save = () => {
  const temporary = fixturePath + '.tmp'
  writeFileSync(temporary, JSON.stringify(fixture, null, 2), { mode: 0o600 })
  renameSync(temporary, fixturePath)
}

async function restrictedRuntime() {
  assert.ok(new URL(process.env.DATABASE_URL || '').href === ownerUrl.href, 'Seed starts with the explicit disposable owner only')
  const runtimeName = 'measurement_runtime_' + randomBytes(8).toString('hex')
  const runtimePassword = password()
  const database = new pg.Client({ connectionString: ownerUrl.href })
  await database.connect()
  try {
    const existing = await database.query('SELECT count(*)::int AS n FROM users')
    assert.equal(existing.rows[0].n, 0, 'Fresh migrated database required, never add credentials to an existing deployment')
    await database.query(`CREATE ROLE ${pg.escapeIdentifier(runtimeName)} LOGIN PASSWORD ${pg.escapeLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`)
    await database.query(`GRANT CONNECT ON DATABASE ptool TO ${pg.escapeIdentifier(runtimeName)}`)
    await database.query(`GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(runtimeName)}`)
    // Execute the reviewed policy unchanged, substituting only its four literal
    // psql parameters. Never grant wildcard table or default future-table rights.
    const policy = readFileSync(path.resolve('scripts/runtime-table-policy.json'), 'utf8')
    const parameters: Record<string, string> = {
      target_database: 'ptool', migration_owner: 'ptool', runtime_role: runtimeName, table_policy: policy,
    }
    const sql = readFileSync(path.resolve('scripts/runtime-role-defaults.sql'), 'utf8')
      .replace(/:'(target_database|migration_owner|runtime_role|table_policy)'/g, (_match, key: string) => pg.escapeLiteral(parameters[key]))
    assert.ok(!/:'[a-z_]+'/.test(sql), 'Unresolved SQL parameter')
    await database.query(sql)
  } finally { await database.end() }
  const url = new URL(ownerUrl.href)
  url.username = runtimeName
  url.password = runtimePassword
  url.searchParams.set('connection_limit', '4')
  url.searchParams.set('pool_timeout', '30')
  mask(runtimePassword)
  mask(url.href)
  process.env.DATABASE_URL = url.href
  process.env.DATABASE_URL_RUNTIME = url.href
  appendFileSync(process.env.GITHUB_ENV!, `DATABASE_URL=${url.href}\nDATABASE_URL_RUNTIME=${url.href}\nMEASUREMENT_BROWSER_RUNTIME_ROLE=${runtimeName}\n`)
  // This is readiness for this fresh CI database, not rerunning historical
  // runtime assertions or a second migration/deploy.
  const { verifyConfiguredRuntime } = await import('./runtime-role-contract.mjs')
  const verified = await verifyConfiguredRuntime({ current: true })
  assert.equal(verified.restrictedRuntimeRole, true)
}

async function seed() {
  assert.ok(!existsSync(fixturePath), 'Refuse uncertain fixture replacement; a new CI job uses a fresh database')
  await restrictedRuntime()
  const { prisma } = await import('../src/config/database')
  runtime = prisma
  const { hashPassword } = await import('../src/utils/password')
  const runId = randomUUID().slice(0, 8)
  const actor = (suffix: string, role: UserRole) => {
    const secret = password(); mask(secret)
    return { id: randomUUID(), username: `mb-${runId}-${suffix}`, password: secret, role }
  }
  fixture = { schemaVersion: 1, isolated: true, sourceCommit: process.env.GITHUB_SHA, runId, status: 'CREATING',
    label: 'NEW SYNTHETIC CI ONLY; NOT SCIENTIFIC EVIDENCE OR ACCEPTED FACT SEED',
    trainingUrl: 'https://training.eduk12.top:3189', surveyUrl: 'https://survey.eduk12.top:3189',
    teacher: actor('teacher', UserRole.TEACHER), otherTeacher: actor('foreign', UserRole.TEACHER),
    // The five reference prerequisites are new study participants who accept
    // consent before START, not additional password-bearing student accounts.
    students: [],
    courseId: randomUUID(), foreignCourseId: randomUUID(), scaleId: randomUUID(), finals: [] }
  save()
  const systemPassword = password(); mask(systemPassword)
  const systemUsername = `mb-${runId}-system`
  const handoff = path.join(privateRoot, 'system-enrollment.json')
  const bootstrap = spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/admin-security-bootstrap.ts'], {
    input: JSON.stringify({ action: 'CREATE_SYSTEM_ADMIN', username: systemUsername, password: systemPassword,
      reason: 'Fresh isolated measurement browser CI fixture; browser must enroll and verify a real virtual security key' }),
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...process.env, DATABASE_URL: ownerUrl.href, ADMIN_SECURITY_BOOTSTRAP_ENABLED: 'true', ADMIN_SECURITY_HANDOFF_FILE: handoff },
  })
  assert.equal(bootstrap.status, 0, 'Real operator bootstrap failed; no output with credentials is published')
  const issued = JSON.parse(bootstrap.stdout.trim().split('\n').at(-1)!)
  const ticket = JSON.parse(readFileSync(handoff, 'utf8'))
  mask(ticket.enrollmentToken)
  fixture.system = { id: issued.userId, username: systemUsername, password: systemPassword, enrollmentToken: ticket.enrollmentToken }
  save()
  for (const account of [fixture.teacher, fixture.otherTeacher, ...fixture.students]) {
    await owner.user.create({ data: { id: account.id, username: account.username, passwordHash: await hashPassword(account.password),
      role: account.role, accountDomain: 'TRAINING', teacherApproved: true } })
  }
  await owner.course.createMany({ data: [
    { id: fixture.courseId, creatorId: fixture.teacher.id, title: 'Synthetic measurement browser course', courseCode: randomUUID(), courseType: 'TRAINING_COURSE', status: 'PUBLISHED' },
    { id: fixture.foreignCourseId, creatorId: fixture.otherTeacher.id, title: 'Synthetic foreign ownership course', courseCode: randomUUID(), courseType: 'TRAINING_COURSE', status: 'PUBLISHED' },
  ] })
  const { compileResearchScale } = await import('../src/modules/survey/builder.compiler')
  const { hashScaleDefinition } = await import('../src/modules/scale/scale-definition')
  const definition = compileResearchScale('Synthetic browser descriptive Scale', { schemaVersion: 1, respondentType: 'student_self_report',
    aggregation: 'mean', responseOptions: [{ optionKey: 'low', label: 'Low', score: 1 }, { optionKey: 'high', label: 'High', score: 2 }],
    dimensions: [{ dimensionKey: 'effort', label: 'Synthetic effort', direction: 'descriptive' }],
    items: [{ itemKey: 'v10-item', prompt: 'Synthetic response', required: true, reverse: false, dimensionKeys: ['effort'] }] })
  await owner.scale.create({ data: { id: fixture.scaleId, creatorId: fixture.teacher.id, code: `MB-${runId}`,
    name: 'Synthetic browser Scale', status: 'PUBLISHED', visibility: 'COURSE', instrumentClass: 'CUSTOM_DESCRIPTIVE',
    instrumentVersion: '2.0.0', definition: definition as any, definitionHash: hashScaleDefinition(definition), itemCount: 1, dimensionCount: 1 } })
  const { planLegacyScaleMeasurementConversion, convertLegacyScaleMeasurement } = await import('../src/modules/scale/onboarding/measurement-conversion')
  const conversionInput = { requestId: randomUUID(), scaleId: fixture.scaleId, actorUserId: fixture.teacher.id,
    recoveryPoint: 'FRESH DISPOSABLE CI DATABASE; NO HISTORICAL USER DATA' }
  const plan = await planLegacyScaleMeasurementConversion(prisma, conversionInput)
  fixture.conversion = await convertLegacyScaleMeasurement(prisma, { ...conversionInput, expectedProofHash: plan.proofHash })
  const questionnaire = await import('../src/modules/questionnaire-product/service')
  closeQueues = (await import('../src/config/queue')).closeQueues
  const createDraft = async (account: any, courseId: string, title: string, scale: boolean, publicEnabled = false) => {
    const author = { userId: account.id, role: UserRole.TEACHER }
    let draft = await questionnaire.create(author, { requestId: randomUUID(), name: title, questionnaireType: 'COURSE', courseIds: [courseId], publicEnabled,
      ...(publicEnabled ? { expiresAt: new Date(Date.now() + 2 * 3600000).toISOString() } : {}) })
    if (scale) draft = await questionnaire.addItem(author, draft.id, { revision: draft.revision, item: { type: 'SCALE', scaleId: fixture.scaleId, required: true } })
    return draft
  }
  fixture.product = await createDraft(fixture.teacher, fixture.courseId, 'Measurement browser report source', true, browserPhase === 'journeys')
  fixture.itemId = fixture.product.items[0].id
  fixture.compositeId = fixture.product.id
  fixture.selectionProduct = await createDraft(fixture.teacher, fixture.courseId, 'Measurement browser explicit reference target', true)
  fixture.selectionItemId = fixture.selectionProduct.items[0].id
  fixture.foreignProduct = await createDraft(fixture.otherTeacher, fixture.foreignCourseId, 'Measurement browser foreign scope', false)
  fixture.foreignCompositeId = fixture.foreignProduct.id
  if (browserPhase === 'journeys') {
    fixture.grantProvenance = 'SYNTHETIC_DB_FIXTURE_NOT_ADMIN_ISSUANCE_OR_CROSS_JOB_END_TO_END'
    fixture.reportGrantId = await scientificFixtureGrant('report', ['report.edit', 'report.publish'], fixture.product.id)
    fixture.referenceGrantId = await scientificFixtureGrant('reference', ['reference.analyze', 'reference.review', 'reference.publish'], fixture.product.id)
    fixture.formalGrantId = randomUUID()
    fixture.formalGovernanceGrantId = fixture.formalGrantId
    await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
      (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
       delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
      VALUES(${fixture.formalGrantId},${fixture.otherTeacher.id},${fixture.system.id},'TRAINING','PLATFORM','reference-governance','reference',
       ${[fixture.conversion.measurementReleaseId]}::text[],ARRAY['reference.review','reference.publish'],ARRAY[]::text[],0,
       clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',${[fixture.formalGrantId]}::text[])`)
    await surveyPrerequisites(runId)
  }
  fixture.status = 'READY'
  save()
  assert.equal(await prisma.compositeAssessmentAttempt.count(), 0)
  assert.equal(await prisma.assessmentUnitSnapshot.count(), 0)
  console.log(JSON.stringify({ fixtureReady: true, phase, browserPhase, nativeFinalsCreated: 0, credentialOutput: 'private-file-only' }))
}

async function scientificFixtureGrant(kind: 'report' | 'reference' | 'data', capabilities: string[], resourceKey: string, expired = false) {
  assert.equal(browserPhase, 'journeys')
  const id = randomUUID()
  // This isolated DB fixture is not the admin job's real WebAuthn/UI issuance.
  // Parent and subject accounts are synthetic; no real grant is changed.
  await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
    (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
     delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
    VALUES(${id},${fixture.teacher.id},${fixture.system.id},'TRAINING','COURSE',${fixture.courseId},${kind},
      ${[resourceKey]}::text[],${capabilities}::text[],ARRAY[]::text[],0,clock_timestamp()-interval '2 hours',
      clock_timestamp()+${expired ? -60000 : 3600000}*interval '1 millisecond',${[id]}::text[])`)
  return id
}

async function surveyPrerequisites(runId: string) {
  assert.match(process.env.SURVEY_MFA_ENCRYPTION_KEY || '', /^[a-f0-9]{64}$/i)
  const secret = randomBytes(20), iv = randomBytes(12), accountPassword = password()
  mask(secret.toString('base64')); mask(accountPassword)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.SURVEY_MFA_ENCRYPTION_KEY!, 'hex'), iv)
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  const secretCipher = [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64url')).join('.')
  const { hashPassword } = await import('../src/utils/password')
  const user = await owner.user.create({ data: { username: `mb-${runId}-researcher`, passwordHash: await hashPassword(accountPassword),
    role: 'STUDENT', accountDomain: 'SURVEY' } })
  await owner.surveyAccount.create({ data: { userId: user.id, loginName: user.username, normalizedLogin: user.username } })
  await owner.surveyResearcherGrant.create({ data: { userId: user.id, grantedBy: fixture.system.id, status: 'ACTIVE' } })
  await owner.surveyMfaCredential.create({ data: { userId: user.id, enabled: true, secretCipher, enabledAt: new Date() } })
  const project = await owner.surveyProject.create({ data: { ownerUserId: user.id, title: 'Synthetic measurement browser Survey',
    description: 'Fresh isolated UI fixture only; no real participant information.', collectionMode: 'SINGLE_UNLINKED' } })
  const { createDraft, updateDraft, validateDraftForPreview } = await import('../src/modules/survey/builder.service')
  let draft = await createDraft(user.id, project.id, { requestId: randomUUID(), kind: 'SCALE', instrumentKey: 'browser-scale', title: 'Synthetic Survey Scale' })
  draft = await updateDraft(user.id, project.id, draft.id, { revision: draft.revision, title: draft.title,
    definition: { schemaVersion: 1, respondentType: 'participant_self_report', presentationMode: 'ONE_BY_ONE', aggregation: 'mean',
      responseOptions: [{ optionKey: 'low', label: 'Low', score: 1 }, { optionKey: 'high', label: 'High', score: 2 }],
      dimensions: [{ dimensionKey: 'effort', label: 'Synthetic effort', direction: 'descriptive' }],
      items: [{ itemKey: 'survey-item', prompt: 'Synthetic response', required: true, reverse: false, dimensionKeys: ['effort'] }] } })
  assert.equal((await validateDraftForPreview(user.id, project.id, draft.id)).ok, true)
  fixture.survey = { researcher: { id: user.id, username: user.username, password: accountPassword, totpSecretBase64: secret.toString('base64') },
    project: { id: project.id, title: project.title }, instruments: [{ id: draft.id, kind: 'SCALE', title: draft.title }] }
  // The browser must obtain its own actual password/TOTP session. No JWT,
  // mfaVerifiedAt claim or preauthenticated cookie is written to this fixture.
}

async function finals() {
  assert.ok(existsSync(fixturePath))
  assert.equal(lstatSync(fixturePath).mode & 0o077, 0)
  fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  assert.equal(fixture.isolated, true)
  assert.equal(fixture.sourceCommit, process.env.GITHUB_SHA)
  assert.equal(fixture.status, 'READY')
  const runtimeUrl = new URL(process.env.DATABASE_URL || '')
  assert.equal(runtimeUrl.hostname, ownerUrl.hostname)
  assert.equal(runtimeUrl.port, ownerUrl.port)
  assert.equal(runtimeUrl.pathname, ownerUrl.pathname)
  assert.match(runtimeUrl.username, /^measurement_runtime_[a-f0-9]{16}$/)
  const { prisma } = await import('../src/config/database'); runtime = prisma
  const { getAttemptState, finalizeCompositeAttemptIfReady } = await import('../src/modules/composite/composite.service')
  const { submitScaleAssessmentFinal } = await import('../src/modules/scale/scale-final-submit.service')
  const { claimCompositeReportJob } = await import('../src/modules/assessment-runtime/report-outbox.service')
  const { processCompositeReportJob } = await import('../src/workers/compositeReportWorker')
  closeQueues = (await import('../src/config/queue')).closeQueues
  const product = await prisma.compositeAssessment.findUniqueOrThrow({ where: { id: fixture.product.id } })
  assert.equal(product.status, 'PUBLISHED', 'The real browser must publish the draft before reference prerequisites')
  assert.equal(product.createdBy, fixture.teacher.id)
  assert.ok(product.trainingContentSnapshotHash)
  assert.equal(product.publicEnabled, true)
  const study = await import('../src/modules/anonymous-study/service')
  const { publishStudyConsent, acceptStudyConsent } = await import('../src/modules/anonymous-study/governance')
  const { hashRecoveryToken } = await import('../src/services/anonymousAccess')
  fixture.referenceConsent ??= { requestId: randomUUID(),
    body: 'SYNTHETIC BROWSER CI ONLY. Generated SCALE responses may be used as aggregate cross-entry reference evidence in this isolated test. No participant-level publication, unrelated use, or real scientific validity is authorized.' }
  save()
  if (!fixture.study) { fixture.study = await study.createStudy(fixture.teacher.id, 'Synthetic browser prior-consent reference source'); save() }
  if (!fixture.referenceConsent.version) {
    fixture.referenceConsent.version = await publishStudyConsent(fixture.teacher.id, fixture.study.id, {
      requestId: fixture.referenceConsent.requestId, expectedVersionId: null, body: fixture.referenceConsent.body,
      scope: { purpose: 'Isolated synthetic aggregate cross-entry reference browser acceptance', dataCategories: ['SCALE'] },
    }); save()
  }
  fixture.waveInput ??= { requestId: randomUUID(), compositeId: product.id, title: 'Five newly consented synthetic reference responses',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), maxUses: 5 }; save()
  if (!fixture.wave) { fixture.wave = await study.createWaveWithLink(fixture.teacher.id, UserRole.TEACHER, fixture.study.id, fixture.waveInput); save() }
  const linkToken = decodeURIComponent(fixture.wave.entryPath.split('/').at(-1)!)
  for (let index = 0; index < 5; index++) {
    fixture.finals[index] ??= { acceptanceId: randomUUID() }
    const checkpoint = fixture.finals[index]; save()
    if (!checkpoint.identity) { checkpoint.identity = await study.joinStudy(fixture.wave.id, linkToken, true); save() }
    if (!checkpoint.consentAccepted) {
      const version = fixture.referenceConsent.version
      const accepted = await acceptStudyConsent(fixture.study.id, checkpoint.identity.credential, {
        requestId: checkpoint.acceptanceId, versionId: version.id, bodyHash: version.bodyHash,
      })
      assert.equal(accepted.eligible, true); checkpoint.consentAccepted = true; save()
    }
    if (!checkpoint.attempt) {
      checkpoint.attempt = await study.startStudyWave(fixture.study.id, fixture.wave.id, checkpoint.identity.credential)
      checkpoint.attemptId = checkpoint.attempt.attemptId; save()
    }
    let parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: checkpoint.attemptId } })
    assert.equal(parent.compositeAssessmentId, fixture.product.id)
    assert.equal(parent.deliveryCourseId, fixture.courseId)
    const child = await prisma.assessment.findFirstOrThrow({ where: { compositeAttemptId: parent.id } })
    checkpoint.childId = child.id; save()
    if (child.status !== 'COMPLETED') {
      const recoveryTokenHash = hashRecoveryToken(checkpoint.attempt.recoveryToken)
      const state = await getAttemptState(parent.id, { recoveryTokenHash })
      assert.equal(state.currentItem?.type, 'SCALE')
      checkpoint.submission ??= { assessmentId: child.id, recoveryTokenHash, compositeAttemptId: parent.id,
        submissionId: randomUUID(), attemptEpoch: parent.attemptEpoch, definitionHash: (state.currentItem as any).definitionHash,
        contextSnapshotHash: state.contextSnapshotHash,
        answers: [{ itemCode: 'v10-item', responseValue: index % 2 ? 'high' : 'low', responseTimeMs: 20 }] }
      save()
      await submitScaleAssessmentFinal(checkpoint.submission)
    } else assert.equal(child.submissionId, checkpoint.submission?.submissionId, 'Never replace an uncertain accepted FINAL')
    if (parent.status !== 'COMPLETED') {
      await finalizeCompositeAttemptIfReady(parent.id)
      parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })
      if (parent.status !== 'COMPLETED') {
        const job = await claimCompositeReportJob()
        assert.equal(job?.attemptId, parent.id, 'Stop rather than process an unrelated outbox job')
        assert.ok(job)
        await processCompositeReportJob(job)
      }
    }
    parent = await prisma.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: parent.id } })
    assert.equal(parent.status, 'COMPLETED')
    assert.ok(parent.trainingContentInterpretationHash)
    checkpoint.complete = true
    checkpoint.finalReceiptHash = parent.trainingContentInterpretationHash
    save()
  }
  fixture.expiredDataGrantId ??= await scientificFixtureGrant('data', ['data.reinterpret'], fixture.finals[0].attemptId, true)
  fixture.finalsPreparation = 'FIVE_ORIGINAL_NATIVE_FINALS_FOR_REFERENCE_UI; NOT_PARTICIPANT_BROWSER_QUALIFICATION'
  save()
  console.log(JSON.stringify({ fixtureReady: true, phase, originalNativeFinals: 5, fixturePreparationOnly: true }))
}

async function grant() {
  assert.ok(existsSync(fixturePath))
  assert.equal(lstatSync(fixturePath).mode & 0o077, 0)
  fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  assert.equal(fixture.sourceCommit, process.env.GITHUB_SHA)
  assert.equal(fixture.isolated, true)
  assert.equal(fixture.status, 'READY')
  const requestPath = path.join(privateRoot, 'grant-request.json')
  assert.equal(lstatSync(requestPath).isSymbolicLink(), false)
  assert.equal(lstatSync(requestPath).mode & 0o077, 0)
  const request = JSON.parse(readFileSync(requestPath, 'utf8'))
  assert.deepEqual(Object.keys(request).filter(key => key !== 'expired').sort(), ['capabilities', 'resourceKeys', 'resourceKind', 'scopeId', 'subjectId'])
  assert.equal(request.resourceKind, 'data')
  assert.deepEqual(request.capabilities, ['data.reinterpret'])
  assert.equal(request.scopeId, fixture.courseId)
  assert.equal(request.subjectId, fixture.teacher.id)
  assert.ok(request.expired === undefined || typeof request.expired === 'boolean')
  assert.ok(Array.isArray(request.resourceKeys) && request.resourceKeys.length === 1)
  const final = fixture.finals[0]
  assert.equal(final?.attemptId, request.resourceKeys[0], 'Only the first fixture FINAL is an interpretation grant target')
  assert.equal(final?.complete, true)
  assert.ok(final, 'Only this fixture completed native attempt may receive a synthetic grant')
  const parent = await owner.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: final.attemptId } })
  assert.equal(parent.compositeAssessmentId, fixture.product.id)
  assert.equal(parent.status, 'COMPLETED')
  assert.equal(parent.trainingContentInterpretationHash, final.finalReceiptHash)
  const key = request.expired ? 'expiredDataGrantId' : 'dataGrantId'
  const grantId = fixture[key] ?? await scientificFixtureGrant('data', ['data.reinterpret'], final.attemptId, !!request.expired)
  fixture[key] = grantId; save()
  writeFileSync(path.join(privateRoot, 'grant-result.json'), JSON.stringify({ grantId }), { mode: 0o600 })
  console.log(JSON.stringify({ syntheticFixtureGrant: true, expired: !!request.expired, adminIssuance: false }))
}

void (async () => {
  await (phase === 'seed' ? seed() : phase === 'finals' ? finals() : grant())
})().catch((error: unknown) => {
  // Do not print Prisma arguments, assertion values, tokens or error.message.
  // Source-only stack frames let the CI owner locate a failing prerequisite.
  const sourceFrames = error instanceof Error ? (error.stack || '').split('\n')
    .filter(line => /^\s+at /.test(line)).slice(0, 3).map(line => line.trim()) : []
  const failure = { phase, name: error instanceof Error ? error.name : 'FixtureError', sourceFrames }
  writeFileSync(path.join(privateRoot, 'fixture-error.json'), JSON.stringify(failure), { mode: 0o600 })
  console.error(JSON.stringify(failure))
  process.exitCode = 1
}).finally(async () => {
  if (runtime) await runtime.$disconnect()
  await owner.$disconnect()
  if (closeQueues) await closeQueues()
})
