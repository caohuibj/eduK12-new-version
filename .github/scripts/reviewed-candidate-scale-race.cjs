/**
 * GitHub-only, real PostgreSQL race check against the inspected runtime image.
 * The caller owns fresh isolated PostgreSQL/Redis, API startup, image/source
 * verification and unconditional container destruction. This is not a replay
 * of the foundation corpus, login checks or already-published HTTP checks.
 *
 * Mount this file read-only at /race.cjs and evidence writable at /evidence.
 * Use the foundation runtime probe's synthetic production environment, plus
 * CANDIDATE_HEAD_SHA. PostgreSQL needs track_activity_query_size >= 4096.
 * DATABASE_URL_ADMIN belongs only to this fixture/lock controller, never API.
 * All business writes under test are actual HTTP requests through runtime
 * Prisma. No test hooks, controller replacement, mocked database or DDL.
 */
'use strict';

const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const ORIGIN = 'http://127.0.0.1:3000';
const DIST = '/app/dist';
const LIMIT = Object.freeze({ wholeProbeMs: 120000, requestMs: 10000, lockObservationMs: 2500,
  connectMs: 2000, statementMs: 2000, queryMs: 2500, lockMs: 1500,
  idleTransactionMs: 10000, pollMs: 20, maxHttpConcurrency: 1 });
const started = Date.now();
const abort = new AbortController();
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonSha = value => sha(JSON.stringify(value));
const report = {
  schemaVersion: 1, status: 'running', sourceSha: null, currentHead: null, imageId: null,
  scope: 'Five real HTTP guarded-write races: definition/status, metadata/status, publication/status, publication/hash, publication/updatedAt. Synthetic fixtures only.',
  limits: LIMIT, checks: [], requests: [], postconditions: [], bindings: {},
  sqlConsumption: { observedApiGuardedUpdates: 0, apiTotalQueriesMeasured: false,
    controllerStatements: 0, observerStatements: 0,
    boundary: 'Only exact blocked UPDATE statements are observed. Controller/observer SQL counts exclude API work; no throughput, CPU or total API SQL claim.' },
};
let currentCheck = 'environment';
let controller, observer, transactionOpen = false, activeHttp = 0;
const cookies = new Map();

function save() {
  mkdirSync('/evidence', { recursive: true });
  writeFileSync('/evidence/scale-race.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
function check(label, actual, expected = true) {
  currentCheck = label;
  assert.deepEqual(actual, expected, label);
  report.checks.push({ label, pass: true });
  save();
}
function failure(error) {
  report.status = 'fail';
  const allowedNames = new Set(['AssertionError', 'TimeoutError', 'AbortError', 'TypeError', 'SyntaxError']);
  const code = typeof error?.code === 'string' && /^(?:P\d{4}|\d{5}|ERR_ASSERTION|ECONNREFUSED|ETIMEDOUT)$/.test(error.code) ? error.code : undefined;
  // Never persist exception text/stack, SQL text/parameters, response bodies,
  // cookies, JWTs, passwords, or database URLs.
  report.failure = { check: currentCheck, name: allowedNames.has(error?.name) ? error.name : 'Error', ...(code ? { code } : {}) };
  report.elapsedMs = Date.now() - started;
  try { save(); } catch { /* An unwritable mount must still fail closed. */ }
}
const timer = setTimeout(() => {
  currentCheck = 'whole-probe-deadline';
  abort.abort();
  failure(new DOMException('Deadline', 'TimeoutError'));
  // A hard exit closes every PostgreSQL socket, rolling back any open lock
  // transaction. The caller also destroys the disposable services on failure.
  process.stderr.write('Scale race probe failed: whole-probe-deadline\n');
  process.exit(1);
}, LIMIT.wholeProbeMs);

function isolatedUrl(raw, kind) {
  const url = new URL(raw);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.hash, '');
  if (kind === 'redis') {
    assert.equal(url.protocol, 'redis:');
    assert.equal(url.port, '6379');
    assert(['', '/0'].includes(url.pathname));
    assert(!url.username && !url.password && !url.search);
  } else {
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.port, '5432');
    assert.equal(url.pathname, '/survey_candidate_ci_test');
    assert.equal(url.username, kind === 'admin' ? 'ptool' : 'survey_ci_runtime');
    assert.equal(url.password, kind === 'admin' ? 'ptool123' : 'survey-ci-only-runtime');
    for (const [key, value] of url.searchParams) {
      assert(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'application_name'].includes(key));
      if (key === 'schema') assert.equal(value, 'public');
    }
  }
  return url;
}
function treeHash(directory) {
  const rows = [];
  function walk(base, relative = '') {
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative + entry.name;
      if (entry.isDirectory()) walk(join(base, entry.name), name + '/');
      else {
        assert(entry.isFile());
        rows.push([name, sha(readFileSync(join(base, entry.name)))]);
      }
    }
  }
  walk(directory);
  return jsonSha(rows);
}
async function query(client, sql, values = []) {
  report.sqlConsumption[client === controller ? 'controllerStatements' : 'observerStatements'] += 1;
  return client.query(sql, values);
}
async function request(label, path, method, body) {
  assert.equal(activeHttp, 0);
  activeHttp += 1;
  const at = Date.now();
  try {
    const response = await fetch(ORIGIN + path, {
      method, redirect: 'error',
      headers: { origin: ORIGIN, 'content-type': 'application/json',
        cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '),
        'x-csrf-token': decodeURIComponent(cookies.get('ptool_csrf') || '') },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(LIMIT.requestMs)]),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], equal = pair.indexOf('=');
      if (equal > 0) cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
    }
    const data = await response.json();
    report.requests.push({ label, role: 'synthetic-teacher', method, status: response.status, elapsedMs: Date.now() - at });
    save();
    return { status: response.status, data };
  } finally { activeHttp -= 1; }
}

// The already-reviewed three-item fixture shape, used only as race input.
function miniDefinition() {
  const codes = ['RACE-1', 'RACE-2', 'RACE-3'];
  return {
    schemaVersion: 2, respondentType: 'participant_self_report',
    source: { title: 'Synthetic atomic race fixture', citation: 'reviewed-candidate-scale-race' },
    license: { status: 'self_authored', redistribution: 'allowed' }, display: { randomizeItems: false },
    responseSets: [{ key: 'default', options: [{ value: 'no', label: '否', score: 0 }, { value: 'yes', label: '是', score: 1 }] }],
    items: codes.map((itemCode, sortOrder) => ({ itemCode, content: 'Synthetic item ' + sortOrder, type: 'single', required: true, sortOrder, responseSetKey: 'default', randomizeOptions: false })),
    scoring: { scoringVersion: '2.0.0', itemRules: codes.map(itemCode => ({ itemCode, transform: { type: 'identity' } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{ key: 'total', type: 'total', label: '总分', direction: 'descriptive', canonical: true, displayPrecision: 2,
        source: { type: 'items', items: codes.map(itemCode => ({ itemCode, weight: 1 })), aggregation: 'sum' } }] },
    report: { reportVersion: '2.0.0', primaryScoreKeys: ['total'], scoreOrder: ['total'],
      interpretations: [{ scoreKey: 'total', headline: '总分', source: { type: 'score_only' }, summary: 'Synthetic fixture only.', bands: [], guidance: [] }],
      limitations: [], disclaimer: 'Synthetic fixture only.' }, referencePolicy: { type: 'none' },
  };
}
async function scaleRow(client, id) {
  const result = await query(client, 'SELECT to_jsonb(s) AS row FROM public.scales s WHERE id = $1', [id]);
  assert.equal(result.rowCount, 1);
  return result.rows[0].row;
}
async function mediaRows(client, assetIds) {
  const assets = await query(client, 'SELECT to_jsonb(a) AS row FROM public.stored_assets a WHERE id = ANY($1::text[]) ORDER BY id', [assetIds]);
  const references = await query(client, 'SELECT to_jsonb(r) AS row FROM public.asset_references r WHERE asset_id = ANY($1::text[]) ORDER BY id', [assetIds]);
  return { assets: assets.rows.map(value => value.row), references: references.rows.map(value => value.row) };
}
async function createFixture(owner, scenario, scaleModule) {
  const id = randomUUID(), assetIds = [], raw = miniDefinition();
  let retainedDefinition;
  if (scenario.entry === 'publish') {
    for (const label of ['pending', 'retained']) {
      const assetId = randomUUID(), contentHash = sha('synthetic-catalog-only-' + assetId);
      assetIds.push(assetId);
      await query(controller, `INSERT INTO public.stored_assets
        (id, object_key, provider, mime_type, size_bytes, sha256, owner_id, updated_at)
        VALUES ($1, $2, 'local', 'image/png', 1, $3, $4, $5)`,
      [assetId, 'assets/' + assetId + '.png', contentHash, owner.id, new Date('2020-01-01T00:00:00Z')]);
      const image = { asset: { assetId, contentHash, mimeType: 'image/png' }, altText: 'Synthetic catalog image', order: 0 };
      if (label === 'pending') raw.items[0].images = [image];
      else {
        retainedDefinition = structuredClone(raw);
        retainedDefinition.items[0].images = [image];
        retainedDefinition.items[0].content = 'Preserved concurrent definition';
      }
    }
  }
  const definition = scaleModule.scaleDefinitionSchema.parse(raw);
  const definitionHash = scaleModule.hashScaleDefinition(definition);
  const validation = scaleModule.validateScaleDefinition(definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' });
  check(scenario.name + '-fixture-valid', validation.issues.filter(issue => issue.severity === 'error').length, 0);
  await query(controller, `INSERT INTO public.scales
    (id, code, name, status, instrument_class, definition, definition_hash, item_count, dimension_count, creator_id, updated_at)
    VALUES ($1, $2, $3, 'DRAFT', 'CUSTOM_DESCRIPTIVE', $4::jsonb, $5, 3, 0, $6, $7)`,
  [id, 'SCALE_RACE_' + id, 'Preserved synthetic scale', JSON.stringify(definition), definitionHash, owner.id, new Date('2020-01-01T00:00:00Z')]);
  if (retainedDefinition) {
    retainedDefinition = scaleModule.scaleDefinitionSchema.parse(retainedDefinition);
    // A pre-existing immutable published-version pin must survive while the
    // attempted publication's newly inserted pin is rolled back. This fixture
    // exercises catalog retention only: no media bytes or delivery are tested.
    await query(controller, `INSERT INTO public.asset_references (id, asset_id, entity_type, entity_id, field)
      VALUES ($1, $2, 'AssessmentPublishedDefinition', $3, 'media')`,
    [randomUUID(), assetIds[1], 'SCALE:' + id + ':' + scaleModule.hashScaleDefinition(retainedDefinition)]);
  }
  return { id, definition, definitionHash, retainedDefinition, assetIds };
}

async function observeBlockedUpdate(scenario, blockerPid, requestState) {
  const at = Date.now();
  let polls = 0;
  while (Date.now() - at < LIMIT.lockObservationMs) {
    if (requestState.done) throw new Error('HTTP completed before guarded UPDATE lock was observed');
    const result = await query(observer, `SELECT a.pid, a.usename, a.state, a.wait_event_type, a.wait_event,
        a.query, pg_blocking_pids(a.pid) AS blockers,
        r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
        EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND NOT l.granted) AS ungranted_lock,
        EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.relation = 'public.scales'::regclass
          AND l.mode = 'RowExclusiveLock' AND l.granted) AS scale_write_lock,
        EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.relation = 'public.asset_references'::regclass
          AND l.mode = 'RowExclusiveLock' AND l.granted) AS media_reference_write_lock
      FROM pg_stat_activity a JOIN pg_roles r ON r.rolname = a.usename
      WHERE a.datname = current_database() AND a.backend_type = 'client backend'
        AND $1::int = ANY(pg_blocking_pids(a.pid))`, [blockerPid]);
    polls += 1;
    if (result.rowCount) {
      check(scenario.name + '-one-blocked-api-writer', result.rowCount, 1);
      const row = result.rows[0];
      check(scenario.name + '-restricted-api-writer', [row.usename, row.rolsuper, row.rolbypassrls, row.rolcreaterole, row.rolcreatedb], ['survey_ci_runtime', false, false, false, false]);
      check(scenario.name + '-real-update-lock', [row.state, row.wait_event_type, row.ungranted_lock, row.scale_write_lock], ['active', 'Lock', true, true]);
      check(scenario.name + '-exact-lock-controller', row.blockers, [blockerPid]);
      const sql = row.query;
      check(scenario.name + '-actual-scale-update', /^UPDATE\s+"public"\."scales"\s+SET\s/i.test(sql));
      const whereStart = sql.indexOf(' WHERE '), returningStart = sql.indexOf(' RETURNING ', whereStart);
      check(scenario.name + '-untruncated-where', whereStart > 0 && returningStart > whereStart);
      const where = sql.slice(whereStart, returningStart);
      const columns = ['id', 'status', 'instrument_class', ...(scenario.entry === 'publish' ? ['definition_hash', 'updated_at'] : [])];
      // Prisma may cast enum parameters explicitly; both forms must remain
      // parameter-bound equality inside WHERE, never a SET-column match.
      for (const column of columns) check(scenario.name + '-where-' + column,
        new RegExp('"' + column + '"\\s*=\\s*(?:\\$[0-9]+|CAST\\(\\$[0-9]+(?:::text)?\\s+AS\\s+)', 'i').test(where));
      if (scenario.entry === 'publish') check(scenario.name + '-media-write-preceded-guarded-update', row.media_reference_write_lock);
      report.sqlConsumption.observedApiGuardedUpdates += 1;
      const evidence = { backendPid: row.pid, blockerPid, role: row.usename, state: row.state,
        waitEventType: row.wait_event_type, waitEvent: row.wait_event, ungrantedLock: true,
        scaleWriteLock: true, mediaReferenceWriteLock: row.media_reference_write_lock,
        whereColumns: columns, querySha256: sha(sql), whereSha256: sha(where),
        queryBytes: Buffer.byteLength(sql), polls, observationElapsedMs: Date.now() - at };
      save();
      return evidence;
    }
    await delay(LIMIT.pollMs, undefined, { signal: abort.signal });
  }
  throw new DOMException('Guarded UPDATE was not observed', 'TimeoutError');
}

async function runRace(owner, scenario, scaleModule) {
  currentCheck = scenario.name + '-setup';
  const fixture = await createFixture(owner, scenario, scaleModule);
  const before = await scaleRow(observer, fixture.id);
  const mediaBefore = await mediaRows(observer, fixture.assetIds);
  check(scenario.name + '-starts-as-draft', before.status, 'DRAFT');
  if (scenario.entry === 'publish') check(scenario.name + '-retained-pin-present', mediaBefore.references.length, 1);
  const body = scenario.entry === 'definition' ? { definition: { ...fixture.definition,
    items: fixture.definition.items.map((item, index) => index ? item : { ...item, content: 'Rejected stale definition save' }) } }
    : scenario.entry === 'metadata' ? { name: 'Rejected stale metadata save' } : {};
  const path = '/api/scales/' + fixture.id + (scenario.entry === 'metadata' ? '' : '/' + (scenario.entry === 'definition' ? 'definition' : 'publish'));
  let pending, expected, lockEvidence;
  try {
    await query(controller, 'BEGIN ISOLATION LEVEL READ COMMITTED');
    transactionOpen = true;
    const locked = await query(controller, 'SELECT id FROM public.scales WHERE id = $1 FOR UPDATE', [fixture.id]);
    check(scenario.name + '-one-fixture-row-locked', locked.rowCount, 1);
    const pid = (await query(controller, 'SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const state = { done: false };
    // Capture rejection immediately while observation proceeds, avoiding an
    // unhandled rejection if HTTP fails before the observer sees a lock.
    pending = request(scenario.name, path, scenario.entry === 'publish' ? 'POST' : 'PUT', body)
      .then(value => { state.done = true; return { value }; }, error => { state.done = true; return { error }; });
    currentCheck = scenario.name + '-observe-guarded-update';
    lockEvidence = await observeBlockedUpdate(scenario, pid, state);
    check(scenario.name + '-http-still-in-flight', state.done, false);
    currentCheck = scenario.name + '-commit-competing-write';
    if (scenario.guard === 'status') {
      await query(controller, "UPDATE public.scales SET status = 'PUBLISHED' WHERE id = $1", [fixture.id]);
    } else if (scenario.guard === 'definitionHash') {
      await query(controller, 'UPDATE public.scales SET definition = $2::jsonb, definition_hash = $3 WHERE id = $1',
        [fixture.id, JSON.stringify(fixture.retainedDefinition), scaleModule.hashScaleDefinition(fixture.retainedDefinition)]);
    } else {
      assert.equal(scenario.guard, 'updatedAt');
      await query(controller, "UPDATE public.scales SET updated_at = updated_at + interval '1 second' WHERE id = $1", [fixture.id]);
    }
    expected = await scaleRow(controller, fixture.id);
    // Only the selected guard changes. Hash races also carry their matching
    // definition bytes; raw SQL deliberately preserves the other two guards.
    const changedGuards = ['status', 'definition_hash', 'updated_at'].filter(key => before[key] !== expected[key]);
    check(scenario.name + '-one-guard-invalidated', changedGuards,
      [scenario.guard === 'definitionHash' ? 'definition_hash' : scenario.guard === 'updatedAt' ? 'updated_at' : 'status']);
    await query(controller, 'COMMIT');
    transactionOpen = false;
    const outcome = await pending;
    if (outcome.error) throw outcome.error;
    check(scenario.name + '-conflict-status', outcome.value.status, 409);
    check(scenario.name + '-conflict-envelope', [outcome.value.data.code, outcome.value.data.data], [-1, null]);
    const after = await scaleRow(observer, fixture.id);
    check(scenario.name + '-committed-row-not-overwritten', after, expected);
    const mediaAfter = await mediaRows(observer, fixture.assetIds);
    check(scenario.name + '-media-rows-preserved', mediaAfter, mediaBefore);
    if (scenario.entry === 'publish') {
      check(scenario.name + '-failed-publish-pin-absent', mediaAfter.references.filter(row => row.entity_id === 'SCALE:' + fixture.id + ':' + fixture.definitionHash).length, 0);
    }
    report.postconditions.push({ scenario: scenario.name, entry: scenario.entry, invalidatedGuard: scenario.guard,
      httpStatus: outcome.value.status, lockEvidence, committedStateSha256: jsonSha(expected),
      finalStateSha256: jsonSha(after), finalStatus: after.status, definitionHash: after.definition_hash,
      definitionSha256: jsonSha(after.definition), mediaBeforeSha256: jsonSha(mediaBefore), mediaAfterSha256: jsonSha(mediaAfter),
      retainedReferenceCount: mediaAfter.references.length, failedPublicationPinAbsent: scenario.entry === 'publish' ? true : null });
    save();
  } finally {
    if (transactionOpen) {
      try { await query(controller, 'ROLLBACK'); } finally { transactionOpen = false; }
    }
    if (pending) await pending;
  }
}

async function main() {
  for (const [key, expected] of Object.entries({ CI: 'true', GITHUB_ACTIONS: 'true', NODE_ENV: 'production',
    FOUNDATION_CI_ISOLATED: '1', COOKIE_SECURE: 'false', CORS_ORIGIN: ORIGIN, TRUST_PROXY_HOPS: '1', RUNTIME_ROLE_REQUIRED: 'true' })) assert.equal(process.env[key], expected);
  assert.equal(process.argv.length, 2);
  assert.equal(process.versions.node, '24.21.0');
  assert(/^[0-9a-f]{40}$/.test(process.env.FOUNDATION_CI_SOURCE_SHA || ''));
  assert(/^[0-9a-f]{40}$/.test(process.env.CANDIDATE_HEAD_SHA || ''));
  assert(/^sha256:[0-9a-f]{64}$/.test(process.env.FOUNDATION_CI_IMAGE_ID || ''));
  assert.equal(process.env.JWT_SECRET, 'synthetic-foundation-ci-jwt-not-production');
  const adminUrl = isolatedUrl(process.env.DATABASE_URL_ADMIN, 'admin');
  isolatedUrl(process.env.DATABASE_URL, 'runtime');
  isolatedUrl(process.env.REDIS_URL, 'redis');
  assert(existsSync(DIST + '/index.js') && !existsSync('/app/src'));
  assert(!existsSync('/app/node_modules/vitest') && !existsSync('/app/node_modules/tsx'));
  report.sourceSha = process.env.FOUNDATION_CI_SOURCE_SHA;
  report.currentHead = process.env.CANDIDATE_HEAD_SHA;
  report.imageId = process.env.FOUNDATION_CI_IMAGE_ID;
  report.bindings = { sourceSha: report.sourceSha, currentHead: report.currentHead, imageId: report.imageId,
    node: process.versions.node, distSha256: treeHash(DIST), probeSha256: sha(readFileSync(__filename)),
    fixtureSha256: jsonSha(miniDefinition()), apiPrincipal: 'survey_ci_runtime', controllerPrincipal: 'ptool',
    mediaScope: 'Catalog rows and transactional references only; no bytes, uploads, delivery, encoding or performance measured.' };
  save();
  const req = createRequire('/app/package.json');
  const { Client } = req('pg');
  const configuration = { host: adminUrl.hostname, port: Number(adminUrl.port), database: adminUrl.pathname.slice(1),
    user: adminUrl.username, password: adminUrl.password, connectionTimeoutMillis: LIMIT.connectMs, query_timeout: LIMIT.queryMs,
    options: '-c statement_timeout=' + LIMIT.statementMs + ' -c lock_timeout=' + LIMIT.lockMs + ' -c idle_in_transaction_session_timeout=' + LIMIT.idleTransactionMs };
  controller = new Client({ ...configuration, application_name: 'foundation-scale-race-controller' });
  observer = new Client({ ...configuration, application_name: 'foundation-scale-race-observer' });
  controller.on('error', () => {});
  observer.on('error', () => {});
  await controller.connect();
  await observer.connect();
  const identity = (await query(controller, `SELECT current_user AS role, current_database() AS database,
    current_setting('server_version_num') AS version, pg_size_bytes(current_setting('track_activity_query_size'))::int AS query_bytes`)).rows[0];
  check('isolated-controller-database', [identity.role, identity.database, identity.version], ['ptool', 'survey_candidate_ci_test', '160015']);
  check('untruncated-sql-observation-capacity', identity.query_bytes >= 4096);
  report.bindings.postgres = identity.version;
  report.bindings.trackActivityQueryBytes = identity.query_bytes;
  const id = randomUUID();
  const owner = (await query(controller, `INSERT INTO public.users
    (id, username, nickname, password_hash, role, account_domain, platform_role, teacher_approved, updated_at)
    VALUES ($1, $2, 'Synthetic race owner', $3, 'TEACHER', 'TRAINING', 'STANDARD', true, $4)
    RETURNING id, username, role, account_domain AS "accountDomain", token_version AS "tokenVersion"`,
  [id, 'scale_race_' + id, 'disabled-synthetic-login-' + randomBytes(32).toString('hex'), new Date('2020-01-01T00:00:00Z')])).rows[0];
  // This fixture session uses the existing compiled signer. It does not claim
  // to exercise password login, which already has separate official evidence.
  const { generateToken } = req(DIST + '/utils/jwt.js');
  cookies.set('ptool_session', generateToken({ userId: owner.id, username: owner.username, role: owner.role,
    accountDomain: owner.accountDomain, tokenVersion: owner.tokenVersion }));
  currentCheck = 'fixture-csrf';
  const csrf = await request('fixture-csrf', '/api/auth/csrf', 'GET');
  check('fixture-csrf-status', csrf.status, 200);
  check('fixture-csrf-cookie-present', Boolean(cookies.get('ptool_csrf')));
  const scaleModule = req(DIST + '/modules/scale/scale-definition.js');
  for (const scenario of [
    { name: 'definition-status-race', entry: 'definition', guard: 'status' },
    { name: 'metadata-status-race', entry: 'metadata', guard: 'status' },
    { name: 'publish-status-race', entry: 'publish', guard: 'status' },
    { name: 'publish-hash-race', entry: 'publish', guard: 'definitionHash' },
    { name: 'publish-time-race', entry: 'publish', guard: 'updatedAt' },
  ]) await runRace(owner, scenario, scaleModule);
  check('exactly-five-observed-guarded-races', report.sqlConsumption.observedApiGuardedUpdates, 5);
  check('exactly-five-complete-postconditions', report.postconditions.length, 5);
  check('exactly-six-http-requests', report.requests.length, 6);
  check('no-request-or-lock-left-open', [activeHttp, transactionOpen], [0, false]);
}

(async () => {
  let failed = false;
  try { await main(); } catch (error) { failed = true; abort.abort(); failure(error); }
  finally {
    try {
      if (transactionOpen && controller) await query(controller, 'ROLLBACK');
      transactionOpen = false;
      await Promise.all([controller?.end(), observer?.end()]);
    } catch (error) { failed = true; failure(error); }
  }
  if (!failed) { report.status = 'success'; report.elapsedMs = Date.now() - started; save(); }
  clearTimeout(timer);
  process.stdout.write(failed ? 'Scale race probe failed; inspect sanitized check label.\n' : 'Scale race probe passed; sanitized evidence saved.\n');
  process.exit(failed ? 1 : 0);
})();
