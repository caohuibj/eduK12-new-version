/** Isolated current-main Training probe. No legacy DB, internal FINAL processor,
 * per-request metric scrape, automatic write retry, or direct report draining.
 * Run with the exact built ops image; keep /state private and outside Git.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { runBurstPhase } from './training-burst-followup.mjs'
const [mode, state] = process.argv.slice(2)
assert.ok(['seed', 'prepare', 'single', 'verify', 'export', 'verify-export', 'prepare-load', 'load', 'verify-load', 'schedule-check'].includes(mode))
assert.equal(process.env.PERF_ISOLATED_TEST_MODE, '1')
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/training_followup_20261020')
const native = process.env.TRAINING_EXECUTION_PROFILE === 'NATIVE_ISOLATED'
assert.equal(new URL(process.env.DATABASE_URL).hostname, native ? process.env.TRAINING_EXPECTED_DATABASE_HOST : 'postgres')
assert.equal(process.version, 'v24.21.0')
assert.equal(state, native ? '/workspace/training-load-followup-state-20261020' : '/state')
const apiOrigin = native ? process.env.TRAINING_API_ORIGIN : 'http://backend:3000'
if (native) assert.equal(apiOrigin, 'http://127.0.0.1:3000')
const backend = process.env.TRAINING_BACKEND_DIR || '/app'
const require = createRequire(path.join(backend, 'package.json'))
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const read = name => JSON.parse(fs.readFileSync(path.join(state, name), 'utf8'))
const write = (name, data) => fs.writeFileSync(path.join(state, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
const sha = value => createHash('sha256').update(value).digest('hex')
const prefix = '/composite-assessments', products = '/questionnaire-products'
const result = { mode, startedAt: new Date().toISOString(), requests: [], milestones: [], passed: false }
const normalize = value => !value?.items ? value : { ...value, items: value.items.map(item => ({ ...item,
  scaleId: item.scale?.id ?? item.scaleId, cognitiveAssignmentId: item.cognitiveAssignment?.id ?? item.cognitiveAssignmentId })) }
function client(saved = {}, recorder = result, controls = {}) {
  const cookies = new Map(Object.entries(saved))
  return {
    cookies: () => Object.fromEntries(cookies),
    async request(route, method = 'GET', body, expected = 200, raw = false) {
      const started = performance.now()
      controls.guard?.(method)
      const requestAtMs = controls.relativeNow?.()
      controls.onStart?.(requestAtMs)
      controls.inFlight?.(1)
      try { return await perform() } finally { controls.inFlight?.(-1) }
      async function perform() {
        let response
        try {
          response = await fetch(apiOrigin + '/api' + route, { method, signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(30_000, controls.remainingMs?.() ?? 30_000)))),
            headers: { 'content-type': 'application/json', ...(cookies.size ? { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } : {}),
              ...(cookies.has('ptool_csrf') ? { 'x-csrf-token': cookies.get('ptool_csrf') } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
        } catch (error) {
          recorder.requests.push({ route, method, elapsedMs: performance.now() - started, startAtMs: requestAtMs, atMs: controls.relativeNow?.(), outcome: 'UNKNOWN', error: error.name })
          throw new Error(`Uncertain ${method} ${route}; inspect state before any retry`)
        }
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';', 1)[0], i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1))
        }
        let bytes
        try { bytes = Buffer.from(await response.arrayBuffer()) }
        catch (error) {
          recorder.requests.push({ route, method, status: response.status, elapsedMs: performance.now() - started, startAtMs: requestAtMs, atMs: controls.relativeNow?.(), outcome: 'UNKNOWN_RESPONSE_BODY', error: error.name })
          throw new Error(`Uncertain response body for ${method} ${route}; inspect state before any retry`)
        }
        const requestRecord = { route, method, status: response.status, elapsedMs: performance.now() - started, bytes: bytes.length, startAtMs: requestAtMs, atMs: controls.relativeNow?.() }
        recorder.requests.push(requestRecord)
        const expectedCodes = Array.isArray(expected) ? expected : [expected]
        if (!expectedCodes.includes(response.status)) {
          requestRecord.errorBody = bytes.toString().slice(0, 500)
          if (recorder === result) write('private/last-http-error.json', { route, method, status: response.status, body: bytes.toString() })
          throw new Error(`${method} ${route}: HTTP ${response.status}; private error retained`)
        }
        if (raw) return bytes
        let envelope
        try {
          envelope = JSON.parse(bytes.toString())
          assert.ok(envelope && typeof envelope === 'object' && typeof envelope.code === 'number')
        } catch {
          requestRecord.outcome = 'UNKNOWN_RESPONSE_ENVELOPE'
          throw new Error(`Uncertain response envelope for ${method} ${route}; inspect state before any retry`)
        }
        if (response.status !== 200) return envelope
        assert.equal(envelope.code, 0, `${route}: API code ${envelope.code}`)
        return normalize(envelope.data)
      }
    },
    async login(user) {
      await this.request('/auth/csrf')
      await this.request(user.role === 'ADMIN' ? '/auth/login' : '/auth/training-login', 'POST', {
        username: user.username, password: user.password, ...(user.role === 'ADMIN' ? {} : { expectedRole: user.role }) })
    },
  }
}
async function counts(attemptId) {
  return { parent: await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    forms: await db.compositeFormSectionAttempt.findMany({ where: { attemptId } }),
    scales: await db.assessment.findMany({ where: { compositeAttemptId: attemptId } }),
    cognitive: await db.cognitiveSession.findMany({ where: { compositeAttemptId: attemptId } }),
    sjt: await db.situationalAttempt.findMany({ where: { compositeAttemptId: attemptId } }),
    snapshots: await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attemptId } }),
    jobs: await db.compositeReportJob.findMany({ where: { attemptId } }) }
}
// Existing C19 CSV parser shape, used only after the timed download.
function parseCsv(bytes) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, ''), rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) { if (c === '"' && text[i+1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false; else cell += c }
    else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (row.length || cell) rows.push([...row, cell])
  assert.equal(quoted, false)
  const [columns, ...values] = rows
  return { columns, rows: values.map(value => Object.fromEntries(columns.map((key, index) => [key, value[index]]))) }
}
try {
  if (mode === 'seed') {
    assert.equal(await db.user.count(), 0, 'Fresh isolated database required; do not reseed')
    const bcrypt = require('bcryptjs'), password = randomBytes(24).toString('hex'), passwordHash = await bcrypt.hash(password, 10)
    const fixture = { users: {}, password, createdAt: new Date().toISOString() }
    for (const [key, role] of [['teacher','TEACHER'],['student','STUDENT'],['otherTeacher','TEACHER'],['outsider','STUDENT'],['admin','ADMIN']]) {
      const user = await db.user.create({ data: { username: 'tl-' + key + '-' + randomUUID(), passwordHash, role,
        accountDomain: role === 'ADMIN' ? 'LEGACY' : 'TRAINING', teacherApproved: true, mustChangePassword: false } })
      fixture.users[key] = { id: user.id, username: user.username, role, password }
    }
    const course = await db.course.create({ data: { creatorId: fixture.users.teacher.id, title: 'Synthetic current-main Training probe',
      courseCode: 'TL-' + randomUUID(), courseType: 'TRAINING_COURSE', status: 'PUBLISHED' } })
    fixture.courseId = course.id
    await db.courseStudent.create({ data: { courseId: course.id, studentId: fixture.users.student.id, status: 'ACTIVE' } })
    const { MIXED_SCALE_DEFINITION: definition } = require(path.join(backend, 'src/__tests__/questionnaire/product-fixtures.ts'))
    const { hashScaleDefinition } = require(path.join(backend, 'dist/modules/scale/scale-definition.js'))
    const scale = await db.scale.create({ data: { creatorId: fixture.users.teacher.id, code: 'tl-scale-' + randomUUID(), name: 'Synthetic binary Scale',
      status: 'PUBLISHED', visibility: 'COURSE', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0',
      definition, definitionHash: hashScaleDefinition(definition), itemCount: 1, dimensionCount: 1 } })
    fixture.scaleId = scale.id
    const { requireCognitiveRegistryEntry } = require(path.join(backend, 'dist/modules/cognitive/cognitive.registry.js'))
    const { freezeAssignmentProfile, freezeDataForWrite } = require(path.join(backend, 'dist/modules/cognitive/profile-freeze.js'))
    const freeze = freezeAssignmentProfile({ entry: requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0'), profile: 'standard',
      baseConfig: { totalTrials: 120, nogoRatio: .25, stimulusMs: 800, isiMs: 500, validRtFloorMs: 100,
        report: { reportVersion: '1.0.0', referenceMode: 'none' } } })
    const config = await db.cognitiveTestConfig.create({ data: { testType: 'gonogo', configVersion: '1.0.0', name: 'Synthetic Go/No-Go',
      config: freeze.resolvedConfig, status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.0.0', accessPolicy: 'OPEN', publishedAt: new Date() } })
    const assignment = await db.cognitiveAssignment.create({ data: { configId: config.id, courseId: course.id, createdBy: fixture.users.teacher.id,
      title: 'Synthetic 120-trial Go/No-Go', status: 'PUBLISHED', listedStandalone: true, ...freezeDataForWrite(freeze) } })
    fixture.cognitiveAssignmentId = assignment.id
    write('private/fixture.json', fixture)
    result.seeded = { users: 5, courses: 1, scaleSources: 1, cognitiveSources: 1, acceptedResults: 0 }
  } else if (mode === 'prepare') {
    const fixture = read('private/fixture.json'), actors = {}
    for (const key of ['teacher','admin','student','otherTeacher','outsider']) {
      actors[key] = client(); await actors[key].login(fixture.users[key])
    }
    const template = JSON.parse(fs.readFileSync(path.join(backend, 'src/modules/situational/authoring/examples/online-hand-calculated.json')))
    fixture.sjtResponses = template.goldenCases[0].responses
    fixture.sjtExpected = template.goldenCases[0].expected
    template.instrumentKey = 'tl-sjt-' + randomUUID()
    let draft = await actors.teacher.request('/situational/authoring/online/drafts', 'POST', { template, authorizationPolicy: 'COURSE_GRANT_V1' })
    const review = { revision: draft.revision, contentDigest: draft.contentDigest }
    await actors.teacher.request(`/situational/authoring/drafts/${draft.id}/request-review`, 'POST', review)
    await actors.admin.request(`/situational/authoring/drafts/${draft.id}/review`, 'POST', { ...review, approve: true, note: 'Independent synthetic fixture review' })
    draft = await actors.teacher.request(`/situational/authoring/drafts/${draft.id}`)
    fixture.sjtRelease = draft.release
    const expiry = new Date(Date.now() + 3600_000).toISOString(), release = draft.release
    await actors.admin.request(`/situational/authoring/releases/${release.id}/grants`, 'POST', { instrumentKey: release.instrumentKey,
      instrumentVersion: release.instrumentVersion, definitionHash: release.definitionHash, contentDigest: release.contentDigest,
      granteeTeacherId: fixture.users.teacher.id, courseId: fixture.courseId, purpose: 'TRAINING_COURSE', permission: 'DISTRIBUTE',
      validFrom: new Date(Date.now() - 60_000).toISOString(), expiresAt: expiry, note: 'Synthetic task-owned course' })
    let product = await actors.teacher.request(products, 'POST', { requestId: randomUUID(), name: 'Four-tool current-main Training probe',
      questionnaireType: 'COURSE', courseIds: [fixture.courseId], publicEnabled: false, expiresAt: expiry,
      trainingPersistencePolicy: { schemaVersion: 1, checkpoint: { enabled: true, ttlHours: 1 }, localCognitive: null } })
    const items = [{ type: 'FORM', formType: 'single_choice', formLabel: 'Synthetic preparation', required: true,
      formOptions: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }], formDefinition: { type: 'SINGLE', prompt: 'Synthetic preparation', required: true,
        options: [{ optionKey: 'yes', label: '是' }, { optionKey: 'no', label: '否' }], rows: [], allowRefusal: true },
      formPolicy: { version: 3, requiredRefusal: 'ALLOW_SUBMIT', hiddenRequired: 'EXEMPT' } },
      { type: 'SCALE', scaleId: fixture.scaleId, required: true },
      { type: 'COGNITIVE', cognitiveAssignmentId: fixture.cognitiveAssignmentId, required: true },
      { type: 'SITUATIONAL', situationalInstrumentKey: release.instrumentKey, situationalInstrumentVersion: release.instrumentVersion, required: true }]
    for (const item of items) product = await actors.teacher.request(`${products}/${product.id}/items`, 'POST', { revision: product.revision, item })
    const { trainingFlowUnitKey, trainingFlowItemKey } = require(path.join(backend, 'dist/modules/assessment-core/flow/training.js'))
    const config = { schemaVersion: 1, blocks: [{ blockKey: 'form', kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey(product.formSections[0].id) },
      ...product.items.filter(item => item.type !== 'FORM').map(item => ({ blockKey: item.type.toLowerCase(), kind: 'INSTRUMENT', instrumentKey: trainingFlowItemKey(item.id) }))] }
    product = await actors.teacher.request(`${products}/${product.id}/training-flow`, 'POST', { revision: product.revision, config })
    const preflight = await actors.teacher.request(`${products}/${product.id}/preflight`, 'POST', { revision: product.revision })
    assert.equal(preflight.ok, true, JSON.stringify(preflight))
    fixture.product = await actors.teacher.request(`${products}/${product.id}/publish`, 'POST', { revision: product.revision })
    fixture.cookies = Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, actor.cookies()]))
    write('private/fixture.json', fixture)
    result.prepared = { productId: product.id, courseId: fixture.courseId, fourTools: items.map(item => item.type), parentCount: await db.compositeAssessmentAttempt.count() }
  } else if (mode === 'single') {
    const fixture = read('private/fixture.json'), student = client(fixture.cookies.student)
    assert.ok(!fixture.single, 'Do not automatically repeat an existing single run')
    const started = performance.now(), submissions = []
    let { attempt } = await student.request(`${prefix}/${fixture.product.id}/attempts`, 'POST', {})
    fixture.single = { attemptId: attempt.id, submissions, status: 'STARTED' }; write('private/fixture.json', fixture)
    result.milestones.push({ stage: 'PARENT_ADMITTED', atMs: performance.now() - started })
    let checkpointRevision = 0
    for (const expected of ['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']) {
      const unit = attempt.currentItem; assert.equal(unit.type, expected)
      const unitStart = performance.now(); let route, body
      if (expected === 'FORM_SECTION' || expected === 'SCALE') {
        const checkpoint = await student.request(`${prefix}/attempts/${attempt.id}/checkpoint`)
        checkpointRevision = checkpoint.revision
        const persistence = checkpoint.trainingPersistence
        const { formSectionSlotKey, compositeItemSlotKey } = require(path.join(backend, 'dist/modules/assessment-runtime/slot-set.js'))
        const slotKey = expected === 'FORM_SECTION' ? formSectionSlotKey(unit.id) : compositeItemSlotKey(unit.id, 'SCALE')
        const answers = expected === 'FORM_SECTION' ? Object.fromEntries(unit.answers.map(item => [item.formItemId, 'yes'])) : { 'mixed-scale-item-1': 'yes' }
        await student.request(`${prefix}/attempts/${attempt.id}/checkpoint`, 'PUT', { expectedRevision: checkpointRevision, attemptEpoch: attempt.attemptEpoch,
          envelope: { schemaVersion: 1, snapshotHash: persistence.snapshotHash, definitionHash: attempt.checkpointDefinitionHash,
            drafts: [{ slotKey, answers }], cognitiveResults: [] } })
        assert.ok(persistence)
      }
      if (expected === 'FORM_SECTION') {
        route = `${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`
        body = { submissionId: randomUUID(), attemptEpoch: attempt.attemptEpoch, definitionHash: unit.definitionHash,
          contextSnapshotHash: attempt.contextSnapshotHash, answers: unit.answers.map(item => ({ formItemId: item.formItemId, value: 'yes' })) }
      } else if (expected === 'SCALE') {
        route = `${prefix}/attempts/${attempt.id}/items/${unit.id}/scale/submit`
        body = { submissionId: randomUUID(), attemptEpoch: attempt.attemptEpoch, definitionHash: unit.definitionHash,
          contextSnapshotHash: attempt.contextSnapshotHash, answers: [{ itemCode: 'mixed-scale-item-1', responseValue: 'yes', responseTimeMs: 17 }] }
      } else if (expected === 'COGNITIVE') {
        const session = unit.cognitiveSession
        assert.equal(session.config.totalTrials, 120)
        const { gonogoSequence } = require(path.join(backend, 'dist/modules/cognitive/randomization.js'))
        const { createTrialEnvelope } = require(path.join(backend, 'dist/modules/cognitive/v2/trial-envelope.js'))
        route = `/cognitive/sessions/${session.sessionId}/submit`
        body = { submissionId: randomUUID(), attemptEpoch: session.attemptEpoch, definitionHash: session.definitionHash, contextSnapshotHash: session.contextSnapshotHash,
          trials: gonogoSequence(session.randomSeed, session.config.totalTrials, session.config.nogoRatio).map((trialType, trialIndex) => createTrialEnvelope({ trialIndex, phase: 'test',
            startedAtPerfMs: trialIndex * 1500, endedAtPerfMs: trialIndex * 1500 + 800,
            payload: { trialType, responded: trialType === 'go', rtMs: trialType === 'go' ? 300 : null, interrupted: false } })) }
      } else {
        route = `${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`
        const runtime = await student.request(route)
        body = { submissionId: randomUUID(), attemptEpoch: runtime.attempt.attemptEpoch, definitionHash: runtime.attempt.definitionHash,
          compiledRuntimeHash: runtime.attempt.compiledRuntimeHash, scoringVersion: runtime.attempt.scoringVersion,
          responseProtocol: 'sjt-online-response-v1', responses: fixture.sjtResponses }; route += '/submit'
      }
      submissions.push({ type: expected, submissionId: body.submissionId, route, state: 'ABOUT_TO_SEND' }); write('private/fixture.json', fixture)
      await student.request(route, 'POST', body)
      submissions.at(-1).state = 'ACKNOWLEDGED'; write('private/fixture.json', fixture)
      attempt = await student.request(`${prefix}/attempts/${attempt.id}`)
      result.milestones.push({ stage: expected + '_FINAL_AND_ADVANCE', atMs: performance.now() - started, durationMs: performance.now() - unitStart, status: attempt.status })
    }
    assert.equal(attempt.status, 'COMPLETED'); assert.equal(attempt.currentItem, null)
    result.completedAtMs = performance.now() - started
    const teacher = client(fixture.cookies.teacher), reportStart = performance.now()
    const report = await teacher.request(`${prefix}/${fixture.product.id}/attempts/${attempt.id}/report`)
    write('private/single-report.json', report)
    result.report = { bytes: Buffer.byteLength(JSON.stringify(report)), sha256: sha(JSON.stringify(report)), durationMs: performance.now() - reportStart,
      unitCount: report.unitReports?.length ?? null, backgroundCount: report.backgroundValues?.length ?? null, source: 'SYNC_ON_REPORT_GET' }
    fixture.single.status = 'COMPLETED_REPORT_READ'; fixture.cookies.student = student.cookies(); write('private/fixture.json', fixture)
    result.totalThroughReportMs = performance.now() - started
    result.attemptId = attempt.id
  } else if (['prepare-load', 'load', 'verify-load', 'schedule-check'].includes(mode)) {
    await runBurstPhase({ mode, state, backend, require, db, read, write, sha, client, result })
  } else if (mode === 'verify') {
    const fixture = read('private/fixture.json'), accepted = await counts(fixture.single.attemptId)
    assert.equal(accepted.parent.status, 'COMPLETED'); assert.equal(accepted.parent.asyncReportEpoch, null)
    assert.equal(accepted.jobs.length, 0)
    for (const key of ['forms','scales','cognitive','sjt']) assert.equal(accepted[key].length, 1)
    assert.deepEqual(accepted.snapshots.map(row => row.unitType).sort(), ['COGNITIVE','FORM_SECTION','SCALE','SITUATIONAL'])
    const raw = await db.cognitiveRawSubmission.findFirstOrThrow({ where: { sessionId: accepted.cognitive[0].id } })
    assert.equal(raw.trialCount, 120)
    const { decryptUnifiedRuntimePayload } = require(path.join(backend, 'dist/modules/assessment-runtime/security.js'))
    assert.equal(decryptUnifiedRuntimePayload(raw.payloadEncrypted).trials.length, 120)
    const canonical = {}
    for (const row of accepted.snapshots) {
      assert.equal(row.attemptEpoch, accepted.parent.attemptEpoch)
      assert.equal(row.sourceSubmissionId, fixture.single.submissions.find(item => item.type === row.unitType).submissionId)
      if (row.unitType === 'FORM_SECTION') continue
      const envelope = decryptUnifiedRuntimePayload(row.canonicalResultEncrypted)
      assert.equal(envelope.core.unitType, row.unitType)
      assert.equal(envelope.core.sourceDefinitionHash, row.sourceDefinitionHash)
      assert.equal(envelope.core.compiledRuntimeHash, row.compiledRuntimeHash)
      canonical[row.unitType] = { metrics: Object.fromEntries(envelope.core.metrics.map(metric => [metric.key, metric.value])),
        resultHash: envelope.resultHash, instrumentKey: envelope.core.instrumentKey, instrumentVersion: envelope.core.instrumentVersion,
        sourceDefinitionHash: envelope.core.sourceDefinitionHash, scorerKey: envelope.core.scorerKey, scorerVersion: envelope.core.scorerVersion }
    }
    assert.equal(canonical.SCALE.metrics.total, 1)
    for (const [key, value] of Object.entries(fixture.sjtExpected)) assert.equal(canonical.SITUATIONAL.metrics[key], value)
    const report = read('private/single-report.json')
    assert.deepEqual(report.unitReports.map(unit => unit.type).sort(), ['COGNITIVE','SCALE','SITUATIONAL'])
    assert.equal(report.backgroundValues.length, 1)
    const cognitiveReport = report.unitReports.find(unit => unit.type === 'COGNITIVE').singleTaskReport
    assert.ok(cognitiveReport.primaryMetrics.length + cognitiveReport.secondaryMetrics.length > 0)
    const before = sha(JSON.stringify(accepted)), otherTeacher = client(fixture.cookies.otherTeacher), outsider = client(fixture.cookies.outsider)
    await otherTeacher.request(`${prefix}/${fixture.product.id}/attempts/${fixture.single.attemptId}/report`, 'GET', undefined, [403,404])
    await outsider.request(`${prefix}/attempts/${fixture.single.attemptId}`, 'GET', undefined, [403,404])
    await outsider.request(`${prefix}/${fixture.product.id}/attempts`, 'POST', {}, [403,404])
    assert.equal(sha(JSON.stringify(await counts(fixture.single.attemptId))), before)
    result.verified = { fourSnapshots: 4, cognitiveTrials: raw.trialCount, outboxJobs: 0, asyncEnrolled: false,
      parentStatus: accepted.parent.status, factsUnchangedByNegatives: true, negativeCases: 3, canonical }
  } else if (mode === 'export') {
    const fixture = read('private/fixture.json'), teacher = client(fixture.cookies.teacher)
    assert.ok(!fixture.export, 'Do not repeat an export whose outcome already exists or is uncertain')
    const started = performance.now()
    fixture.export = { state: 'ABOUT_TO_SEND' }; write('private/fixture.json', fixture)
    const queued = await teacher.request(`${prefix}/${fixture.product.id}/export`, 'POST', { detail: 'full', format: 'csv' })
    fixture.export = { ...queued, state: 'QUEUED' }; write('private/fixture.json', fixture)
    result.queued = { batchId: queued.batchId, artifacts: queued.artifacts.length }
    result.enqueueAckMs = performance.now() - started
    const route = queued.artifacts[0].downloadUrl.replace(/^\/api/, '')
    let ready
    while (performance.now() - started < 60_000) {
      ready = await teacher.request(route + '/status')
      if (ready.status === 'READY') break
      assert.notEqual(ready.status, 'FAILED', 'Real export consumer marked this batch FAILED')
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.equal(ready?.status, 'READY', 'Export did not become READY within 60 seconds; do not re-enqueue')
    result.readyMs = performance.now() - started
    const downloadStart = performance.now(), bytes = await teacher.request(route, 'GET', undefined, 200, true)
    result.downloadMs = performance.now() - downloadStart
    fs.writeFileSync(path.join(state, 'private/single-export.csv'), bytes, { mode: 0o600 })
    result.export = { bytes: bytes.length, sha256: sha(bytes), totalThroughDownloadMs: performance.now() - started, source: 'STANDARD_CONSUMER_REDIS_EXPORT_QUEUE' }
    fixture.export.state = 'DOWNLOADED'; write('private/fixture.json', fixture)
  } else {
    const fixture = read('private/fixture.json'), bytes = fs.readFileSync(path.join(state, 'private/single-export.csv'))
    const csv = parseCsv(bytes)
    assert.equal(csv.rows.length, 1)
    const row = csv.rows[0], parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: fixture.single.attemptId } })
    assert.equal(row.A_attempt_id, fixture.single.attemptId)
    assert.equal(row.P_path_hash, parent.trainingFlowPathHash)
    assert.equal(Number(row.S002_SCORE_total), 1)
    const sjtMetric = 'J004_M_cooperation_' + sha('cooperation').slice(0, 16)
    assert.equal(Number(row[sjtMetric]), fixture.sjtExpected.cooperation)
    assert.ok(csv.columns.some(key => key.startsWith('F001_')))
    assert.ok(csv.columns.some(key => key.startsWith('C003_')))
    const before = sha(JSON.stringify(await counts(fixture.single.attemptId)))
    const url = fixture.export.artifacts[0].downloadUrl.replace(/^\/api/, '')
    await client(fixture.cookies.otherTeacher).request(url, 'GET', undefined, [403,404])
    assert.equal(sha(JSON.stringify(await counts(fixture.single.attemptId))), before)
    result.verified = { rows: csv.rows.length, columns: csv.columns.length, scaleTotal: 1, sjtCooperation: fixture.sjtExpected.cooperation,
      formAndCognitiveColumnsPresent: true, pathIdentityMatched: true, crossTeacherDownloadDenied: true, bytes: bytes.length, sha256: sha(bytes) }
  }
  result.passed = true
} catch (error) {
  result.error = { name: error.name, message: error.message }
  process.exitCode = 1
} finally {
  result.endedAt = new Date().toISOString()
  write('evidence/' + mode + '-result.json', result)
  await db.$disconnect()
  console.log(JSON.stringify({ mode, passed: result.passed, requests: result.requests.length, error: result.error ?? null }))
}
