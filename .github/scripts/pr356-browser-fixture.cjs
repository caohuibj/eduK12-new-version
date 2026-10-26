/**
 * Disposable PR356 browser data. Run only inside the verified backend runtime:
 *   node /qualification/pr356-browser-fixture.cjs prepare|mutate|verify|cleanup
 * No source imports, migration/install commands, ONLINE seeding, or DB cleanup.
 * The private mode-0600 file must never be uploaded with evidence.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const HASH = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;
const KEY = 'academic_self_concept_biology_zh_cn';
const VERSION = '1.0.0';
const BEFORE = 'Synthetic browser instruction: answer using your situation in this administration.';
const AFTER = 'SYNTHETIC LATER LIVE TEXT MUST NOT ENTER A FROZEN SURVEY';
const sha = value => createHash('sha256').update(value).digest('hex');

function guard(env = process.env) {
  assert.equal(env.NODE_ENV, 'test', 'Test environment required');
  assert.equal(env.PR356_BROWSER_FIXTURE_ISOLATED, '1', 'Explicit browser fixture opt-in required');
  const db = new URL(env.DATABASE_URL || 'invalid:');
  assert.equal(db.protocol, 'postgresql:');
  assert(['127.0.0.1', 'localhost', 'postgres', 'pr356-browser-postgres'].includes(db.hostname), 'Owned test PostgreSQL required');
  assert(/^\/pr356_browser_[a-f0-9]{10}$/.test(db.pathname), 'Dedicated browser DB required');
  assert(['5432', '55439'].includes(db.port), 'Explicit test PostgreSQL port required');
  assert(!db.search && !db.hash, 'DB URL overrides forbidden');
  const redis = new URL(env.REDIS_URL || 'invalid:');
  assert.equal(redis.protocol, 'redis:');
  assert(['127.0.0.1', 'localhost', 'redis', 'pr356-browser-redis'].includes(redis.hostname), 'Owned test Redis required');
  assert.equal(redis.pathname, '/14', 'Dedicated Redis namespace required');
  assert(!redis.search && !redis.hash);
  assert.equal(env.JWT_SECRET, 'pr356-synthetic-ci-jwt-20261026-only');
  assert.equal(env.DATA_ENCRYPTION_KEY, '1'.repeat(64));
  assert.equal(env.DATA_PSEUDONYM_KEY, 'b'.repeat(64));
  assert.equal(env.JWT_EXPIRES_IN, '15m', 'Short-lived synthetic session required');
  assert.equal(env.SURVEY_WORKSPACE_ENABLED, 'true');
  assert.equal(env.SURVEY_PUBLICATION_ENABLED, 'true');
  assert.equal(env.BACKGROUND_WORKERS_ENABLED, 'false');
  assert.equal(env.ASSESSMENT_REPORT_ASYNC_ENABLED, 'false');
  assert.notEqual(env.MATERIAL_GRANTS_ENABLED, 'false');
  assert(HEAD.test(env.PR356_SOURCE_HEAD || ''), 'Exact source head required');
  assert(IMAGE.test(env.PR356_BACKEND_IMAGE_ID || '') && IMAGE.test(env.PR356_FRONTEND_IMAGE_ID || ''), 'Verified runtime identities required');
  assert(HASH.test(env.PR356_SCHEMA_SHA256 || ''), 'Verified schema setup identity required');
  assert(/^\d+$/.test(env.GITHUB_RUN_ID || '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT || ''), 'Official run identity required');
  const file = env.PR356_FIXTURE_FILE;
  assert(file && path.isAbsolute(file) && !/[\r\n\0]/.test(file), 'Absolute private fixture path required');
  const parent = fs.realpathSync(path.dirname(file));
  assert.equal(fs.lstatSync(parent).isDirectory(), true);
  assert.equal(fs.statSync(parent).mode & 0o077, 0, 'Private directory must be mode 0700');
  if (env.PR356_EVIDENCE_DIR) {
    const evidence = path.resolve(env.PR356_EVIDENCE_DIR);
    assert(file !== evidence && !path.resolve(file).startsWith(evidence + path.sep), 'Private fixture cannot be an evidence artifact');
  }
  return { file: path.join(parent, path.basename(file)), runtime: path.resolve(env.PR356_RUNTIME_ROOT || '/app') };
}

function readPrivate(file, env = process.env, fresh = true) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'Private regular mode-0600 fixture required');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.isolated, true);
  assert.equal(value.sourceHead, env.PR356_SOURCE_HEAD);
  assert.equal(value.run, env.GITHUB_RUN_ID);
  assert.equal(value.attempt, env.GITHUB_RUN_ATTEMPT);
  assert.equal(value.backendImageId, env.PR356_BACKEND_IMAGE_ID);
  assert.equal(value.frontendImageId, env.PR356_FRONTEND_IMAGE_ID);
  assert.equal(value.schemaSHA256, env.PR356_SCHEMA_SHA256);
  const age = Date.now() - Date.parse(value.createdAt);
  if (fresh) assert(age >= 0 && age < 15 * 60 * 1000, 'Fresh synthetic fixture required');
  return value;
}

function writePrivate(file, value) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); } finally { fs.closeSync(fd); }
}

function publicIdentity(value) {
  return {
    schemaVersion: 1, fixtureId: value.fixtureId, sourceHead: value.sourceHead,
    run: value.run, attempt: value.attempt, backendImageId: value.backendImageId,
    frontendImageId: value.frontendImageId, schemaSHA256: value.schemaSHA256,
    source: { key: KEY, version: VERSION },
    instructionCases: { ordinary: 'NONEMPTY_FROZEN_FIELD', exact: 'REGISTERED_EMPTY_NO_LIVE_FALLBACK', exactNonemptyRegistry: 'NOT_PROVIDED' },
    syntheticOnly: true,
  };
}

function runtimeLoader(root) {
  assert(fs.existsSync(path.join(root, 'dist/index.js')), 'Verified compiled runtime entry missing');
  return relative => {
    assert(!relative.includes('..') && !path.isAbsolute(relative), 'Runtime module escape refused');
    const file = path.join(root, 'dist', relative + '.js');
    assert(fs.existsSync(file), 'Required compiled runtime module missing');
    return require(file);
  };
}

async function prepare({ file }, load) {
  assert(!fs.existsSync(file), 'Fixture already exists; do not repeat provisioning');
  const { prisma: db } = load('config/database');
  const counts = await Promise.all([db.user.count(), db.scale.count(), db.surveyProject.count(), db.compositeAssessment.count(), db.$queryRaw`SELECT id FROM survey_standard_releases LIMIT 1`]);
  assert.deepEqual(counts, [0, 0, 0, 0, []], 'Fresh schema-only owned DB required');
  const migrations = await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(migrations[0].count, 237, 'Verified schema237 setup required');
  const { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } = load('modules/scale/onboarding/instrument-registry');
  const source = getScaleInstrumentSource(KEY, VERSION), runtime = getScaleInstrumentRuntimePolicy(KEY, VERSION);
  assert(source?.executable && runtime, 'Existing non-HOLD executable source required');
  assert.equal(source.instruction, undefined, 'Registered instruction changed; review fixture inputs before use');
  const fixtureId = randomUUID();
  const create = (name, role = 'STUDENT', accountDomain = 'TRAINING', platformRole = 'STANDARD') => db.user.create({ data: {
    username: 'pr356-browser-' + name + '-' + fixtureId, passwordHash: 'SYNTHETIC NON-LOGIN FIXTURE',
    role, accountDomain, platformRole, teacherApproved: role === 'TEACHER',
  } });
  const system = await create('system', 'STUDENT', 'TRAINING', 'SYSTEM_ADMIN');
  const issuer = await create('training-issuer');
  const teacher = await create('teacher', 'TEACHER');
  const manager = await create('survey-manager');
  const researcher = await create('researcher', 'STUDENT', 'SURVEY');
  await db.adminEntryGrant.createMany({ data: [
    { id: randomUUID(), userId: issuer.id, entry: 'TRAINING', grantedBy: system.id },
    { id: randomUUID(), userId: manager.id, entry: 'SURVEY', grantedBy: system.id },
  ] });
  const login = 'br' + fixtureId.replaceAll('-', '').slice(0, 18);
  await db.surveyAccount.create({ data: { userId: researcher.id, loginName: login, normalizedLogin: login } });
  await db.surveyResearcherGrant.create({ data: { userId: researcher.id, status: 'ACTIVE', grantedBy: manager.id } });
  await db.surveyMfaCredential.create({ data: { userId: researcher.id, enabled: true, secretCipher: 'SYNTHETIC NON-LOGIN FIXTURE' } });

  const onboarding = load('modules/scale/onboarding/install');
  const install = { instrumentKey: KEY, instrumentVersion: VERSION, actorUserId: system.id, deploymentPolicy: {
    schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: source.scientificReview?.territory ?? 'ZZ',
    deploymentModes: ['STANDALONE', 'COMPOSITE', 'QUESTIONNAIRE'], runtimePolicyHash: runtime.runtimePolicyHash,
    localizationVersion: VERSION, inFlightCompletion: 'FROZEN_DEADLINE',
  } };
  assert.deepEqual((await onboarding.planScaleInstrumentInstall(db, install)).blockers, []);
  const installed = await onboarding.installScaleInstrument(db, install);
  assert(installed.scaleId);
  const publication = load('modules/scale/onboarding/publish');
  const nativePublication = { instrumentKey: KEY, instrumentVersion: VERSION, actorUserId: system.id, visibility: 'HIDDEN', allowedProducts: ['TRAINING', 'SURVEY'] };
  const plan = await publication.planStandardScalePublication(db, nativePublication);
  assert.deepEqual(plan.blockers, []);
  await publication.publishStandardScale(db, { ...nativePublication, expectedProofHash: plan.proofHash });
  await load('services/materialGrant').createGrant({ teacherId: teacher.id, resourceType: 'SCALE', resourceId: installed.scaleId, grantedBy: system.id });

  const standard = load('modules/survey/standard-triplet.service');
  const { canonicalHash } = load('modules/assessment-runtime/canonical');
  const detail = await standard.standardTripletDetail(system.id, KEY, VERSION);
  const selections = [detail.selection, { ...detail.selection, PARAMETERS: canonicalHash(null), REPORT: canonicalHash(null) }];
  const combinations = [];
  const proof = { tokenVersion: system.tokenVersion, adminVerifiedAt: Math.floor(Date.now() / 1000), adminSessionId: randomUUID() };
  for (const selection of selections) {
    const preview = await standard.previewStandardTriplet(db, system.id, selection);
    assert.deepEqual(preview.blockers, []);
    const approved = await standard.approveStandardTriplet(system.id, { ...selection, requestId: randomUUID(), expectedCombinationHash: preview.combinationHash, reason: 'Disposable synthetic same-dist browser fixture', allowedProducts: ['TRAINING', 'SURVEY'] }, proof);
    assert.equal(approved.state, 'ONLINE', 'Normal approval and real trials must reach ONLINE');
    const trials = await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${approved.id}`;
    assert.equal(trials.length, 3);
    const combination = { releaseId: approved.id, combinationHash: approved.combinationHash };
    await load('modules/measurement-content/standard-combination-use').grantTrainingStandardCombinationUse(issuer.id, approved.id, { requestId: randomUUID(), userId: teacher.id, combinationHash: approved.combinationHash });
    combinations.push({ combination, axisVersions: Object.fromEntries(Object.entries(approved.versions).map(([axis, part]) => [axis, part.version])) });
  }
  assert.equal(combinations[0].axisVersions.CONTENT, combinations[1].axisVersions.CONTENT);
  assert.notEqual(combinations[0].combination.releaseId, combinations[1].combination.releaseId);
  const actor = { userId: teacher.id, role: 'TEACHER' };
  const course = await db.course.create({ data: { creatorId: teacher.id, title: 'Synthetic browser course', courseType: 'TRAINING_COURSE', courseCode: 'pr356-browser-' + fixtureId, status: 'PUBLISHED' } });
  const q = load('modules/questionnaire-product/service');
  const courseDraft = await q.create(actor, { requestId: randomUUID(), name: 'Synthetic browser exact C P R', questionnaireType: 'COURSE', courseIds: [course.id] });
  const generalDraft = await q.create(actor, { requestId: randomUUID(), name: 'Synthetic browser GENERAL boundary', questionnaireType: 'GENERAL', courseIds: [], publicEnabled: true, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const resources = await q.resources(actor);
  const native = resources.scales.find(row => row.id === installed.scaleId);
  assert(native, 'Native Scale must have real current use authority');
  for (const combination of combinations) assert(resources.standardCombinations.some(row => row.combination.releaseId === combination.combination.releaseId), 'Exact choices must use real current authority');

  await db.scale.update({ where: { id: installed.scaleId }, data: { instruction: BEFORE } });
  const catalog = load('modules/survey/catalog.service');
  const builder = load('modules/survey/builder.service');
  const measurement = load('modules/survey/measurement-publication.service');
  const waves = load('modules/survey/waves.service');
  const wavePublish = load('modules/survey/waves.publish');
  async function survey(kind, ref) {
    const grant = await catalog.grantCatalogSource(manager.id, researcher.id, ref);
    const projectId = randomUUID();
    await db.surveyProject.create({ data: { id: projectId, ownerUserId: researcher.id, title: 'Synthetic browser ' + kind, collectionMode: 'SINGLE_UNLINKED' } });
    const draft = await builder.importCatalogDraft(researcher.id, projectId, grant.id, { requestId: randomUUID(), instrumentKey: kind + 'scale', title: 'Synthetic ' + kind + ' Scale' });
    await measurement.publishSurveyMeasurementDraft(researcher.id, projectId, draft.id, draft.revision);
    const wave = await waves.createWave(researcher.id, projectId, { requestId: randomUUID(), title: 'Synthetic ' + kind + ' wave', consentText: 'Only synthetic automated CI responses; no human participant.', generalText: 'Synthetic browser receipt.', instrumentIds: [draft.id], allowNewParticipants: true });
    await wavePublish.prepareWave(researcher.id, projectId, wave.id, wave.revision);
    const frozen = await waves.getWave(researcher.id, projectId, wave.id);
    const opened = await wavePublish.openWave(researcher.id, projectId, wave.id, frozen.revision);
    const saved = await db.surveyPublication.findUniqueOrThrow({ where: { id: opened.publicationId } });
    const unit = saved.compiledSnapshot.units[0];
    assert.equal(saved.compiledSnapshot.units.length, 1);
    assert.equal(unit.kind, 'SCALE');
    assert.equal(unit.instruction ?? null, kind === 'ordinary' ? BEFORE : null);
    return { projectId, waveId: wave.id, publicationId: opened.publicationId, publicId: opened.publicId, entrySecret: opened.entrySecret, definitionDigest: saved.definitionDigest, instrumentKey: unit.instrumentKey, title: unit.title, expectedInstruction: kind === 'ordinary' ? BEFORE : null };
  }
  const ordinary = await survey('ordinary', { kind: 'SCALE', sourceId: installed.scaleId, sourceVersion: VERSION });
  const exact = await survey('exact', { kind: 'SCALE', sourceId: 'survey-standard:' + combinations[0].combination.releaseId, sourceVersion: combinations[0].combination.combinationHash });
  const value = {
    schemaVersion: 1, isolated: true, fixtureId, createdAt: new Date().toISOString(),
    sourceHead: process.env.PR356_SOURCE_HEAD, run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    backendImageId: process.env.PR356_BACKEND_IMAGE_ID, frontendImageId: process.env.PR356_FRONTEND_IMAGE_ID, schemaSHA256: process.env.PR356_SCHEMA_SHA256,
    teacher: { id: teacher.id, session: load('utils/jwt').generateToken({ userId: teacher.id, username: teacher.username, role: 'TEACHER', accountDomain: 'TRAINING', tokenVersion: teacher.tokenVersion }) },
    scale: { id: installed.scaleId, name: native.name, version: native.version, expectedBefore: BEFORE, expectedAfter: AFTER },
    course: { id: courseDraft.id, revision: courseDraft.revision }, general: { id: generalDraft.id, revision: generalDraft.revision },
    combinations, survey: { ordinary, exact },
  };
  writePrivate(file, value);
  return { ...publicIdentity(value), action: 'prepare', status: 'PREPARED', privateFileSHA256: sha(fs.readFileSync(file)) };
}

async function mutate(value, load) {
  const { prisma: db } = load('config/database');
  const row = await db.scale.findUniqueOrThrow({ where: { id: value.scale.id } });
  assert.equal(row.code, KEY);
  assert.equal(row.instrumentVersion, VERSION);
  if (row.instruction === AFTER) return { ...publicIdentity(value), action: 'mutate', replay: true };
  assert.equal(row.instruction, BEFORE, 'Fixture live row drifted; mutation refused');
  assert.equal(await db.surveyPublication.count({ where: { id: { in: [value.survey.ordinary.publicationId, value.survey.exact.publicationId] } } }), 2);
  await db.scale.update({ where: { id: row.id }, data: { instruction: AFTER } });
  return { ...publicIdentity(value), action: 'mutate', replay: false };
}

async function verify(value, load) {
  const { prisma: db } = load('config/database');
  const { decodeTrainingStandardItemSource } = load('modules/composite/training-standard-combination');
  const course = await db.compositeAssessment.findUniqueOrThrow({ where: { id: value.course.id }, include: { items: true } });
  const general = await db.compositeAssessment.findUniqueOrThrow({ where: { id: value.general.id }, include: { items: true } });
  assert.equal(course.items.length, 1);
  assert.equal(course.revision, value.course.revision + 1);
  const selected = decodeTrainingStandardItemSource(course.items[0].standardCombinationSource);
  assert.deepEqual({ releaseId: selected.reference.combination.releaseId, combinationHash: selected.reference.combination.combinationHash }, value.combinations[1].combination);
  for (const axis of ['CONTENT', 'PARAMETERS', 'REPORT']) assert.equal(selected.reference.combination.axes[axis].version, value.combinations[1].axisVersions[axis]);
  assert.equal(general.items.length, 1);
  assert.equal(general.items[0].scaleId, value.scale.id);
  assert.equal(general.items[0].standardCombinationSource, null);
  assert.equal(general.revision, value.general.revision + 1);
  assert.equal((await db.scale.findUniqueOrThrow({ where: { id: value.scale.id } })).instruction, AFTER);
  const finals = [];
  for (const [kind, expected] of Object.entries(value.survey)) {
    const attempts = await db.surveyWaveAttempt.findMany({ where: { projectId: expected.projectId, waveId: expected.waveId } });
    const rows = await db.surveyWaveFinal.findMany({ where: { projectId: expected.projectId, waveId: expected.waveId } });
    assert.equal(attempts.length, 1, 'Reload must not create another admission');
    assert.equal(rows.length, 1, 'Exactly one durable FINAL required');
    assert.equal(attempts[0].status, 'COMPLETED');
    assert.equal(rows[0].attemptId, attempts[0].id);
    assert.equal(rows[0].publicationId, expected.publicationId);
    assert.equal(rows[0].definitionDigest, expected.definitionDigest);
    assert(HASH.test(rows[0].payloadHash));
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: expected.publicationId } });
    assert.equal(publication.compiledSnapshot.units[0].instruction ?? null, expected.expectedInstruction);
    finals.push({ kind, count: rows.length, payloadHash: rows[0].payloadHash, definitionDigest: rows[0].definitionDigest });
  }
  return { ...publicIdentity(value), action: 'verify', status: 'PASS', courseItems: 1, generalItems: 1, finals };
}

async function main() {
  const command = process.argv[2];
  assert(['prepare', 'mutate', 'verify', 'cleanup'].includes(command), 'Unknown fixture action');
  const config = guard();
  if (command === 'cleanup') {
    const value = readPrivate(config.file, process.env, false);
    fs.unlinkSync(config.file);
    return { ...publicIdentity(value), action: 'cleanup', privateFileRemoved: true, databaseUntouched: true };
  }
  const load = runtimeLoader(config.runtime);
  try {
    if (command === 'prepare') return await prepare(config, load);
    const value = readPrivate(config.file);
    return command === 'mutate' ? await mutate(value, load) : await verify(value, load);
  } finally {
    await load('config/queue').closeQueues(true);
    await load('config/database').prisma.$disconnect();
  }
}
module.exports = { guard, readPrivate, writePrivate, publicIdentity, runtimeLoader, prepare, mutate, verify };
if (require.main === module) main().then(result => {
  process.stdout.write('PR356_FIXTURE_RESULT ' + JSON.stringify(result) + '\n');
}).catch(error => {
  // App/Prisma errors may contain DSNs, tokens, SQL parameters or answers.
  try {
    const config = guard();
    fs.writeFileSync(config.file + '.failure.json', JSON.stringify({ action: process.argv[2], failedAt: new Date().toISOString(), error: String(error.stack || error) }) + '\n', { mode: 0o600, flag: 'wx' });
  } catch { /* Never overwrite an earlier private failure or weaken the fence. */ }
  process.stderr.write(JSON.stringify({ status: 'FAIL', action: process.argv[2], errorType: error.name || 'Error', reason: 'Fixture action failed; private state retained for diagnosis' }) + '\n');
  process.exitCode = 1;
});
