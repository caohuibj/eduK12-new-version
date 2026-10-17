/**
 * Bounded GitHub-only check of the actual backend runtime image, not a local
 * unit-suite replay. The caller starts the same image's API on 127.0.0.1:3000,
 * verifies its source/image identity, and owns destruction of the disposable DB.
 *
 * Mount this file at /probe.cjs (ro), assessment-core/fixtures at /fixtures (ro),
 * and a writable evidence directory at /evidence. Run `node /probe.cjs` inside
 * the inspected runtime image, with its normal production dependencies only.
 * Required: CI=true, GITHUB_ACTIONS=true, FOUNDATION_CI_ISOLATED=1,
 * FOUNDATION_CI_SOURCE_SHA, FOUNDATION_CI_IMAGE_ID, DATABASE_URL (restricted),
 * DATABASE_URL_ADMIN (fixture creation only), REDIS_URL, and the same disposable
 * production configuration/crypto keys as the API. No credentials are persisted.
 */
'use strict';

const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID, createCipheriv } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');

const origin = 'http://127.0.0.1:3000';
const dist = '/app/dist';
const reportPath = '/evidence/runtime-http.json';
const start = Date.now();
const deadline = new AbortController();
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonSha = value => sha(JSON.stringify(value));
const report = {
  schemaVersion: 1, status: 'running',
  scope: 'Compiled runtime packaging, three frozen Form examples, Training HTTP detail/publication boundaries, and persisted Survey Form draft. Synthetic data only.',
  limits: { wholeProbeMs: 120000, requestMs: 10000, maxHttpConcurrency: 1 },
  checks: [], requests: [], corpus: [],
  parseCount: { measured: false, reason: 'No instrumentation or mocks; the existing local parse-count contract is not replayed.' },
};
let currentCheck = 'environment';
let admin, prisma, redis;
let activeHttp = 0;
let maxHttp = 0;

function save() {
  mkdirSync('/evidence', { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
function check(label, actual, expected = true) {
  currentCheck = label;
  assert.deepEqual(actual, expected, label);
  report.checks.push({ label, pass: true });
  save();
}
function fail(error) {
  report.status = 'fail';
  // Never copy exception messages/stacks, HTTP bodies, URLs, cookies or tokens.
  const names = new Set(['AssertionError', 'TypeError', 'SyntaxError', 'TimeoutError', 'AbortError', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError']);
  const code = typeof error?.code === 'string' && /^(?:P\d{4}|ERR_ASSERTION|ECONNREFUSED|ETIMEDOUT)$/.test(error.code) ? error.code : undefined;
  report.failure = { check: currentCheck, name: names.has(error?.name) ? error.name : 'Error', ...(code ? { code } : {}) };
  report.elapsedMs = Date.now() - start;
  try { save(); } catch { /* A missing/unwritable evidence mount still exits nonzero. */ }
}
const timer = setTimeout(() => {
  currentCheck = 'whole-probe-deadline';
  deadline.abort();
  fail(new DOMException('Deadline', 'TimeoutError'));
  process.stderr.write('Foundation runtime probe failed: whole-probe-deadline\n');
  process.exit(1);
}, 120000);

function isolatedUrl(raw, kind) {
  const u = new URL(raw);
  // Literal IPv4 loopback avoids DNS, redirects and remote/service-name targets.
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.hash, '');
  if (kind === 'redis') {
    assert.equal(u.protocol, 'redis:');
    assert.equal(u.port, '6379');
    assert(['', '/0'].includes(u.pathname));
    assert(!u.username && !u.password && !u.search);
  } else {
    assert.equal(u.protocol, 'postgresql:');
    assert.equal(u.port, '5432');
    assert.equal(u.pathname, '/survey_candidate_ci_test');
    assert.equal(u.username, kind === 'admin' ? 'ptool' : 'survey_ci_runtime');
    assert.equal(u.password, kind === 'admin' ? 'ptool123' : 'survey-ci-only-runtime');
    for (const [key, value] of u.searchParams) {
      assert(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'application_name'].includes(key));
      if (key === 'schema') assert.equal(value, 'public');
    }
  }
  return u;
}
function treeHash(dir) {
  const entries = [];
  function walk(base, relative = '') {
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative + entry.name;
      if (entry.isDirectory()) walk(join(base, entry.name), name + '/');
      else {
        assert(entry.isFile(), 'Compiled artifacts must be regular files');
        entries.push([name, sha(readFileSync(join(base, entry.name)))]);
      }
    }
  }
  walk(dir);
  return jsonSha(entries);
}

class Client {
  constructor(role, token) {
    this.role = role;
    this.cookies = new Map(token ? [['ptool_session', token]] : []);
  }
  async call(label, path, { body, method = body === undefined ? 'GET' : 'POST', status = 200, envelope = true } = {}) {
    currentCheck = label;
    assert(path.startsWith('/') && !path.startsWith('//'));
    assert.equal(activeHttp, 0, 'HTTP requests must remain sequential');
    activeHttp += 1;
    maxHttp = Math.max(maxHttp, activeHttp);
    const at = Date.now();
    try {
      const response = await fetch(origin + path, {
        method, redirect: 'error',
        headers: {
          origin, 'content-type': 'application/json',
          cookie: [...this.cookies].map(([key, value]) => key + '=' + value).join('; '),
          'x-csrf-token': decodeURIComponent(this.cookies.get('ptool_csrf') || ''),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(10000)]),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const equal = pair.indexOf('=');
        if (equal > 0) this.cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
      }
      // Status-only evidence intentionally excludes all HTTP response bodies.
      const raw = await response.text();
      report.requests.push({ label, role: this.role, method, status: response.status, elapsedMs: Date.now() - at });
      save();
      check(label + '-status', response.status, status);
      if (status >= 400) return undefined;
      currentCheck = label + '-json';
      const parsed = JSON.parse(raw);
      if (!envelope) return parsed;
      check(label + '-envelope', parsed.code, 0);
      return parsed.data;
    } finally { activeHttp -= 1; }
  }
}

// Exact synthetic three-item definition shape from mini-scale-definition.ts;
// no TypeScript/test dependency is imported into the production image.
function miniScaleDefinition() {
  const itemCodes = ['FOUNDATION-1', 'FOUNDATION-2', 'FOUNDATION-3'];
  return {
    schemaVersion: 2, respondentType: 'participant_self_report',
    source: { title: 'Final submit integration fixture', citation: 'instrument-final-submit.postgres.integration.test' },
    license: { status: 'self_authored', redistribution: 'allowed' }, display: { randomizeItems: false },
    responseSets: [{ key: 'default', options: [{ value: 'no', label: '否', score: 0 }, { value: 'yes', label: '是', score: 1 }] }],
    items: itemCodes.map((itemCode, sortOrder) => ({ itemCode, content: `Integration item ${sortOrder + 1}`, type: 'single', required: true, sortOrder, responseSetKey: 'default', randomizeOptions: false })),
    scoring: {
      scoringVersion: '2.0.0', itemRules: itemCodes.map(itemCode => ({ itemCode, transform: { type: 'identity' } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{ key: 'total', type: 'total', label: '总分', direction: 'descriptive', canonical: true, displayPrecision: 2,
        source: { type: 'items', items: itemCodes.map(itemCode => ({ itemCode, weight: 1 })), aggregation: 'sum' } }],
    },
    report: {
      reportVersion: '2.0.0', primaryScoreKeys: ['total'], scoreOrder: ['total'],
      interpretations: [{ scoreKey: 'total', headline: '总分', source: { type: 'score_only' }, summary: '这是一个真实 PostgreSQL 集成测试结果。', bands: [], guidance: [] }],
      limitations: [], disclaimer: 'Integration fixture only.',
    },
    referencePolicy: { type: 'none' },
  };
}

function runCorpus(req) {
  currentCheck = 'compiled-core-and-survey-imports';
  const core = req(dist + '/modules/assessment-core/form/definition.js');
  const answers = req(dist + '/modules/assessment-core/form/answers.js');
  const runtime = req(dist + '/modules/assessment-core/form/runtime.js');
  const builder = req(dist + '/modules/survey/builder.definition.js');
  const final = req(dist + '/modules/survey/final.compute.js');
  const bulk = req(dist + '/modules/survey/builder.import.js');
  check('legacy-schema-export-is-shared-core', builder.formDraftSchema === core.formDraftSchema);
  check('legacy-error-export-is-shared-core', final.SurveyFinalValidationError === answers.FormAnswerValidationError);
  const casesBytes = readFileSync('/fixtures/form-foundation-cases.json');
  const goldenBytes = readFileSync('/fixtures/form-foundation-golden.json');
  const cases = JSON.parse(casesBytes), golden = JSON.parse(goldenBytes);
  check('frozen-oracle-baseline', golden.baselineCommit, 'aeb5ce0111d28f878d733aff73c6e60e85d4bdbf');
  report.binding.fixtures = { casesSha256: sha(casesBytes), goldenSha256: sha(goldenBytes), baselineCommit: golden.baselineCommit };
  const selected = ['v2-all-13-types', 'answer-hidden-injected', 'import-v2-csv'];
  for (const name of selected) {
    currentCheck = 'corpus-' + name;
    const test = cases.find(value => value.name === name), oracle = golden.cases.find(value => value.name === name);
    assert(test && oracle, 'Selected immutable case is required');
    let output;
    try {
      if (test.op === 'dry') output = final.dryRunSurveyForm(test.definition, test.answers);
      else {
        assert.equal(test.op, 'import');
        const preview = bulk.previewBulk(test.input, 'FORM', test.definition.schemaVersion);
        output = { preview, ...(preview.ok ? { applied: bulk.applyBulk('FORM', test.definition, test.input, preview.digest) } : {}) };
      }
    } catch (error) {
      // Synthetic golden fixture errors, never HTTP/DB exceptions or user input.
      if (!(error instanceof answers.FormAnswerValidationError)) throw error;
      output = { error: { name: error.name, message: error.message, ...(error.path === undefined ? {} : { path: error.path }), ...(error.issues === undefined ? {} : { issues: error.issues }) } };
    }
    check('frozen-bytes-' + name, JSON.stringify(output), JSON.stringify(oracle.output));
    report.corpus.push({ name, outputSha256: jsonSha(output), expectedSha256: jsonSha(oracle.output), output });
  }
  const fixture = cases.find(value => value.name === selected[0]);
  const validation = core.validateFormDefinition(fixture.definition, { forPreview: true });
  check('core-valid-definition-issues', validation.issues, []);
  check('direct-core-matches-legacy-runtime', runtime.normalizeFormAnswers(validation.definition, answers.parseAnswerMap(fixture.answers, 'answers')), golden.cases.find(value => value.name === selected[0]).output);
  return { fixture, goldenOutput: golden.cases.find(value => value.name === selected[0]).output, builder };
}

async function createFixtures(req, adminUrl) {
  currentCheck = 'synthetic-fixture-setup';
  const { PrismaClient } = req('@prisma/client');
  admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } }, errorFormat: 'minimal', log: [] });
  const { hashPassword } = req(dist + '/utils/password.js');
  const passwordHash = await hashPassword('Synthetic1!' + randomBytes(18).toString('hex'));
  const runId = randomUUID().slice(0, 8), users = {};
  for (const [name, role, accountDomain, platformRole] of [
    ['owner', 'TEACHER', 'TRAINING', 'STANDARD'], ['other', 'TEACHER', 'TRAINING', 'STANDARD'],
    ['student', 'STUDENT', 'TRAINING', 'STANDARD'], ['foreign', 'STUDENT', 'TRAINING', 'STANDARD'],
    ['researcher', 'STUDENT', 'SURVEY', 'STANDARD'], ['grantor', 'ADMIN', 'LEGACY', 'SYSTEM_ADMIN'],
  ]) {
    users[name] = await admin.user.create({ data: { username: 'fci_' + runId + '_' + name, nickname: 'Synthetic ' + name, passwordHash, role, accountDomain, platformRole, teacherApproved: true } });
  }
  const course = await admin.course.create({ data: { title: 'Synthetic retained course', courseCode: 'FCI_' + runId, creatorId: users.owner.id, status: 'PUBLISHED' } });
  const otherCourse = await admin.course.create({ data: { title: 'Synthetic other course', courseCode: 'FCIO_' + runId, creatorId: users.other.id, status: 'PUBLISHED' } });
  await admin.courseStudent.create({ data: { courseId: course.id, studentId: users.student.id, status: 'APPROVED' } });
  await admin.courseStudent.create({ data: { courseId: otherCourse.id, studentId: users.foreign.id, status: 'APPROVED' } });
  const createdAt = new Date('2020-01-01T00:00:00.000Z');
  const assignment = await admin.assignment.create({ data: { courseId: course.id, title: 'Synthetic old assignment', content: 'Retained assignment body', questions: [{ id: 'reflection', title: 'Reflection', type: 'text' }], tags: ['retained'], createdAt } });
  const checkin = await admin.checkin.create({ data: { courseId: course.id, creatorId: users.owner.id, title: 'Synthetic old checkin', content: 'Retained checkin body', tags: ['retained'], allowViewOthers: false, createdAt } });
  const researcher = users.researcher;
  await admin.surveyAccount.create({ data: { userId: researcher.id, loginName: researcher.username, normalizedLogin: researcher.username } });
  await admin.surveyResearcherGrant.create({ data: { userId: researcher.id, grantedBy: users.grantor.id, status: 'ACTIVE' } });
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.SURVEY_MFA_ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(randomBytes(20)), cipher.final()]);
  const secretCipher = [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
  await admin.surveyMfaCredential.create({ data: { userId: researcher.id, enabled: true, secretCipher, enabledAt: new Date() } });
  const project = await admin.surveyProject.create({ data: { id: randomUUID(), ownerUserId: researcher.id, title: 'Synthetic foundation study', collectionMode: 'SINGLE_UNLINKED' } });
  await admin.$disconnect();
  admin = undefined;
  check('admin-client-disconnected-after-fixtures', true);
  return { users, course, otherCourse, assignment, checkin, project, runId };
}

async function trainingHttp(req, fixture) {
  const { generateToken } = req(dist + '/utils/jwt.js');
  const clients = {};
  for (const name of ['owner', 'other', 'student', 'foreign']) {
    const user = fixture.users[name];
    clients[name] = new Client(name, generateToken({ userId: user.id, username: user.username, role: user.role, accountDomain: user.accountDomain, tokenVersion: user.tokenVersion }));
  }
  await clients.owner.call('owner-csrf', '/api/auth/csrf');
  for (const [kind, route] of [['assignment', 'assignments'], ['checkin', 'checkins']]) {
    const old = fixture[kind], path = '/api/' + route + '/' + old.id;
    const owned = await clients.owner.call(kind + '-owner-exact-context', path + '?courseId=' + fixture.course.id);
    check(kind + '-exact-identity-and-content', [owned.id, owned.course.id, owned.content, owned.tags], [old.id, fixture.course.id, old.content, ['retained']]);
    check(kind + '-owner-management-count', owned._count, { submissions: 0 });
    await clients.owner.call(kind + '-wrong-course', path + '?courseId=' + fixture.otherCourse.id, { status: 404 });
    await clients.other.call(kind + '-foreign-teacher', path, { status: 403 });
    await clients.foreign.call(kind + '-foreign-student', path, { status: 403 });
    const student = await clients.student.call(kind + '-member-exact-context', path + '?courseId=' + fixture.course.id);
    check(kind + '-student-exact-id', student.id, old.id);
    check(kind + '-student-no-management-count', Object.hasOwn(student, '_count'), false);
  }
  const scale = await clients.owner.call('scale-create', '/api/scales', { body: { code: 'FCI_' + fixture.runId, name: 'Synthetic frozen scale', visibility: 'COURSE' } });
  check('scale-created-draft', scale.status, 'DRAFT');
  const definition = miniScaleDefinition();
  const path = '/api/scales/' + scale.id;
  const saved = await clients.owner.call('scale-save-definition', path + '/definition', { method: 'PUT', body: { definition } });
  check('scale-save-item-count', saved.itemCount, 3);
  const published = await clients.owner.call('scale-publish', path + '/publish', { body: {} });
  check('scale-published', published.status, 'PUBLISHED');
  currentCheck = 'scale-read-frozen-database';
  const before = await prisma.scale.findUniqueOrThrow({ where: { id: scale.id } });
  const { hashScaleDefinition } = req(dist + '/modules/scale/scale-definition.js');
  check('scale-published-hash-matches-stored-definition', before.definitionHash, hashScaleDefinition(before.definition));
  check('scale-published-http-matches-database', [published.definitionHash, published.name], [before.definitionHash, before.name]);
  const changed = structuredClone(definition);
  changed.items[0].content = 'Rejected changed content';
  for (const [label, endpoint, options] of [
    ['scale-published-definition-denied', path + '/definition', { method: 'PUT', body: { definition: changed } }],
    ['scale-published-metadata-denied', path, { method: 'PUT', body: { name: 'Rejected changed name' } }],
    ['scale-republish-denied', path + '/publish', { body: {} }],
  ]) {
    await clients.owner.call(label, endpoint, { ...options, status: 409 });
    currentCheck = label + '-database-unchanged';
    const after = await prisma.scale.findUniqueOrThrow({ where: { id: scale.id } });
    check(label + '-database-unchanged', after, before);
  }
  report.scale = { definitionHash: before.definitionHash, definitionSha256: jsonSha(before.definition), status: before.status, name: before.name };
}

async function surveyPersistence(req, fixture, corpus) {
  currentCheck = 'compiled-survey-builder-service';
  const service = req(dist + '/modules/survey/builder.service.js');
  const { canonicalHash } = req(dist + '/modules/assessment-runtime/canonical.js');
  const userId = fixture.users.researcher.id, projectId = fixture.project.id;
  const created = await service.createDraft(userId, projectId, { requestId: randomUUID(), kind: 'FORM', instrumentKey: 'form', title: 'Synthetic persisted Form' });
  check('survey-draft-create-status', created.status, 'DRAFT');
  currentCheck = 'survey-draft-update';
  const updated = await service.updateDraft(userId, projectId, created.id, { revision: created.revision, title: created.title, definition: corpus.fixture.definition });
  check('survey-draft-revision-advanced', updated.revision, created.revision + 1);
  currentCheck = 'survey-draft-reread';
  const reread = await service.getDraft(userId, projectId, created.id);
  const stored = await prisma.surveyInstrumentDraft.findUniqueOrThrow({ where: { id: created.id } });
  const normalized = corpus.builder.assertSurveyDraft('FORM', corpus.fixture.definition);
  check('survey-definition-persisted-normalization', stored.definition, normalized);
  check('survey-read-matches-postgresql', [reread.definition, reread.revision, reread.status], [stored.definition, stored.revision, 'DRAFT']);
  currentCheck = 'survey-saved-preview';
  const preview = await service.validateDraftForPreview(userId, projectId, created.id);
  check('survey-saved-preview-valid', [preview.ok, preview.issues, preview.kind, preview.participantReport], [true, [], 'FORM', 'GENERAL_ONLY']);
  check('survey-saved-preview-definition-digest', preview.definitionDigest, canonicalHash({ kind: 'FORM', definition: normalized }));
  currentCheck = 'survey-saved-dry-run';
  const dry = await service.dryRunFormDraft(userId, projectId, created.id, corpus.fixture.answers);
  check('survey-saved-dry-run-valid', [dry.ok, dry.issues], [true, []]);
  check('survey-saved-answer-normalization', { rawAnswers: dry.rawAnswers, missing: dry.missing }, corpus.goldenOutput);
  report.survey = { definitionDigest: preview.definitionDigest, definitionSha256: jsonSha(stored.definition), normalizedAnswersSha256: jsonSha(corpus.goldenOutput), revision: reread.revision, pageCount: preview.pageCount, questionCount: preview.questionCount };
}

async function main() {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.FOUNDATION_CI_ISOLATED, '1');
  assert.equal(process.versions.node, '24.21.0');
  assert.equal(process.argv.length, 2);
  assert.equal(process.env.NODE_ENV, 'production');
  assert.equal(process.env.COOKIE_SECURE, 'false');
  assert.equal(process.env.CORS_ORIGIN, origin);
  assert.equal(process.env.TRUST_PROXY_HOPS, '1');
  assert.equal(process.env.RUNTIME_ROLE_REQUIRED, 'true');
  assert(/^[0-9a-f]{40}$/.test(process.env.FOUNDATION_CI_SOURCE_SHA || ''));
  assert(/^sha256:[0-9a-f]{64}$/.test(process.env.FOUNDATION_CI_IMAGE_ID || ''));
  assert(/^[0-9a-f]{64}$/i.test(process.env.SURVEY_MFA_ENCRYPTION_KEY || ''));
  const adminUrl = isolatedUrl(process.env.DATABASE_URL_ADMIN, 'admin');
  isolatedUrl(process.env.DATABASE_URL, 'runtime');
  isolatedUrl(process.env.REDIS_URL, 'redis');
  assert(existsSync(dist + '/index.js') && !existsSync('/app/src'));
  assert(!existsSync('/app/node_modules/vitest') && !existsSync('/app/node_modules/tsx'));
  report.sourceSha = process.env.FOUNDATION_CI_SOURCE_SHA;
  report.imageId = process.env.FOUNDATION_CI_IMAGE_ID;
  report.binding = { sourceSha: process.env.FOUNDATION_CI_SOURCE_SHA, imageId: process.env.FOUNDATION_CI_IMAGE_ID, node: process.versions.node, distSha256: treeHash(dist), probeSha256: sha(readFileSync(__filename)) };
  save();
  const req = createRequire('/app/package.json');
  ({ prisma } = req(dist + '/config/database.js'));
  currentCheck = 'restricted-database-identity-and-version';
  const [database] = await prisma.$queryRawUnsafe("SELECT current_user AS role, current_database() AS database, current_setting('server_version_num') AS version");
  check('restricted-database-identity-and-version', database, { role: 'survey_ci_runtime', database: 'survey_candidate_ci_test', version: '160015' });
  const roleContract = await import('/app/scripts/runtime-role-contract.mjs');
  currentCheck = 'restricted-runtime-privileges';
  report.runtimeRole = await roleContract.verifyRuntimePrivileges(prisma);
  check('restricted-runtime-privileges', report.runtimeRole.restrictedRuntimeRole);
  currentCheck = 'redis-connect';
  redis = req('redis').createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 10000 } });
  redis.on('error', () => {});
  await redis.connect();
  const info = await redis.info('server');
  const version = /^redis_version:([^\r\n]+)\r?$/m.exec(info)?.[1];
  check('actual-redis-version', version, '7.4.11');
  report.binding.postgres = database.version;
  report.binding.redis = version;
  const ready = await new Client('anonymous').call('actual-api-ready', '/ready', { envelope: false });
  check('actual-api-production-dependencies-ready', [ready.status, ready.dependencies.database, ready.dependencies.cacheRedis, ready.dependencies.socketRedis], ['ok', 'ready', 'ready', 'ready']);
  const corpus = runCorpus(req);
  const fixture = await createFixtures(req, adminUrl);
  await trainingHttp(req, fixture);
  await surveyPersistence(req, fixture, corpus);
  check('exactly-three-frozen-runtime-examples', report.corpus.length, 3);
  check('sequential-http-only', maxHttp, 1);
  report.maxObservedHttpConcurrency = maxHttp;
}

(async () => {
  try {
    await main();
    currentCheck = 'close-probe-clients';
    if (redis?.isOpen) await redis.quit();
    if (prisma) await prisma.$disconnect();
    report.status = 'success';
    report.elapsedMs = Date.now() - start;
    save();
    clearTimeout(timer);
    process.stdout.write('Foundation runtime probe passed; sanitized evidence saved.\n');
    process.exit(0);
  } catch (error) {
    fail(error);
    // Caller tears down all disposable services. A failed probe never attempts
    // recovery, deletion, a second API start, or a broader test suite.
    try { if (admin) await admin.$disconnect(); } catch {}
    try { if (redis?.isOpen) redis.destroy(); } catch {}
    try { if (prisma) await prisma.$disconnect(); } catch {}
    clearTimeout(timer);
    process.stderr.write('Foundation runtime probe failed; inspect sanitized check label.\n');
    process.exit(1);
  }
})();
