/** Direct control contracts only: no real app, HTTP listener, DB or browser. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { apiBase, forwardApi, staticResponse, verifyDist, fixtureAction, browserLaunchOptions, createBrowserPhase, scenarioIds, statusBrowserResources, readVerifiedUpstream } from './pr356-product-browser.mjs';
import { inputsSHA256 } from './pr356-artifacts.mjs';
const require = createRequire(import.meta.url);
const { guard, readPrivate, writePrivate, publicIdentity, prepare } = require('./pr356-browser-fixture.cjs');
const h = 'a'.repeat(40), image = 'sha256:' + 'b'.repeat(64), digest = 'sha256:' + 'c'.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = bytes => ({ sha256: sha(bytes), bytes: Buffer.byteLength(bytes) });
function temporary(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr356-browser-control-')); fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function environment(root) { return {
  NODE_ENV: 'test', PR356_BROWSER_FIXTURE_ISOLATED: '1', DATABASE_URL: 'postgresql://synthetic:synthetic@postgres:5432/pr356_browser_aabbccddee', REDIS_URL: 'redis://redis:6379/14',
  JWT_SECRET: 'pr356-synthetic-ci-jwt-20261026-only', DATA_ENCRYPTION_KEY: '1'.repeat(64), DATA_PSEUDONYM_KEY: 'b'.repeat(64), JWT_EXPIRES_IN: '15m',
  SURVEY_WORKSPACE_ENABLED: 'true', SURVEY_PUBLICATION_ENABLED: 'true', BACKGROUND_WORKERS_ENABLED: 'false', ASSESSMENT_REPORT_ASYNC_ENABLED: 'false',
  PR356_SOURCE_HEAD: h, PR356_BACKEND_IMAGE_ID: image, PR356_FRONTEND_IMAGE_ID: image, PR356_SCHEMA_SHA256: 'd'.repeat(64), GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '2', PR356_FIXTURE_FILE: path.join(root, 'fixture.json'),
}; }
function value(env) { return { schemaVersion: 1, isolated: true, fixtureId: 'synthetic-fixture', createdAt: new Date().toISOString(), sourceHead: env.PR356_SOURCE_HEAD, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, backendImageId: image, frontendImageId: image, schemaSHA256: env.PR356_SCHEMA_SHA256, teacher: { session: 'private-token' }, survey: { ordinary: { entrySecret: 'private-entry' } } }; }

function fakeValidation(root, env, { phaseId, role, prefix = 'PR356', files = {} }) {
  const directory = path.join(root, role), specPath = path.join(root, role + '-spec.json');
  fs.mkdirSync(directory, { recursive: true });
  const log = 'synthetic producer control log\n';
  const defaults = role === 'frontend-dist' && !Object.keys(files).length ? { 'frontend-dist.json': JSON.stringify({ head: h, run: '100', attempt: 1, files: { 'index.html': entry('<main>compiled</main>'), 'app.js': entry('void 0;') } }), 'dist/index.html': '<main>compiled</main>', 'dist/app.js': 'void 0;' } : {};
  const payload = { ...defaults, ...files, ...(role === 'frontend-dist' ? {} : { 'command.log': log }) };
  for (const [relative, data] of Object.entries(payload)) { fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true }); fs.writeFileSync(path.join(directory, relative), data); }
  const fileMap = Object.fromEntries(Object.entries(payload).map(([relative, data]) => [relative, entry(data)]));
  const inputs = { schemaVersion: 1, files: [{ path: '.github/scripts/pr356-product-browser.mjs', mode: '100644', blob: h }], tools: { node: '24.21.0' }, configuration: { phaseId }, dependencies: { lock: h } };
  const spec = { id: phaseId, jobName: 'pr356-' + phaseId, caseIds: ['synthetic-producer-check'], inputs, inputsSHA256: inputsSHA256(inputs) };
  const outputs = role === 'frontend-dist' ? { artifactFiles: { 'frontend-dist': fileMap, 'frontend-image': { 'command.log': entry(log) } } } : { files: fileMap };
  const proof = { schemaVersion: 1, kind: 'pr356-phase-proof', phaseId, status: 'success', source: { repository: 'caohuibj/eduK12-new-version', runId: '100', head: h, producerAttempt: 1 }, inputs, inputsSHA256: spec.inputsSHA256, checks: spec.caseIds.map(id => ({ id, status: 'passed' })), command: { argv: ['node', 'synthetic-producer'], cwd: '/synthetic-control', exitCode: 0, logSHA256: sha(log), startedAt: '2026-10-26T00:00:00Z', completedAt: '2026-10-26T00:00:01Z' }, outputs };
  const proofBytes = JSON.stringify(proof), proofPath = path.join(directory, 'phase-receipt.json');
  fs.writeFileSync(proofPath, proofBytes); fs.writeFileSync(specPath, JSON.stringify(spec));
  const artifactId = { 'frontend-dist': 123, 'backend-image': 124, 'schema-restore': 125 }[role];
  const artifactName = `pr356-${role}-100-1`;
  const receipt = { schemaVersion: 1, kind: 'pr356-official-artifact-validation', phaseId, role, source: proof.source, artifact: { id: artifactId, name: artifactName, digest, sizeBytes: 300 }, producerJob: { id: 900 + artifactId, name: spec.jobName, attempt: 1, conclusion: 'success' }, zipPath: directory + '.zip', zipSHA256: digest.slice(7), zipBytes: 300, directory, proofPath, inputsSHA256: spec.inputsSHA256, proofSHA256: sha(proofBytes), payloadFiles: fileMap };
  fs.writeFileSync(directory + '.verified.json', JSON.stringify(receipt));
  for (const [key, value] of Object.entries({ ARTIFACT_ID: String(artifactId), ARTIFACT_NAME: artifactName, ARTIFACT_DIGEST: digest, PRODUCER_RUN: '100', PRODUCER_HEAD: h, PRODUCER_ATTEMPT: '1' })) env[prefix + '_' + key] = value;
  return { directory, specPath, receipt, proof, fileMap };
}

test('real upstream rejection, browser write Origin, cookie, body and multiple Set-Cookie remain intact', async () => {
  let captured;
  const response = new Response(JSON.stringify({ code: -1, message: 'current authority rejected' }), { status: 403, headers: [['Content-Type', 'application/json'], ['Set-Cookie', 'one=1; Path=/; Secure'], ['Set-Cookie', 'two=2; Path=/; Secure']] });
  const bytes = Buffer.from('{"revision":7}');
  const actual = await forwardApi({ url: 'https://training.eduk12.top/api/questionnaire-products/test/items?response=receipt', method: 'POST', headers: { Origin: 'https://training.eduk12.top', Cookie: 'ptool_session=synthetic', 'X-CSRF-Token': 'csrf', 'Content-Type': 'application/json' }, body: bytes }, 'http://127.0.0.1:3100', async (url, options) => { captured = { url, options }; return response; });
  assert.equal(captured.url, 'http://127.0.0.1:3100/api/questionnaire-products/test/items?response=receipt');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.get('origin'), 'https://training.eduk12.top');
  assert.equal(captured.options.headers.get('host'), 'training.eduk12.top');
  assert.equal(captured.options.headers.get('cookie'), 'ptool_session=synthetic');
  assert.equal(captured.options.headers.get('x-csrf-token'), 'csrf');
  assert.deepEqual(captured.options.body, bytes);
  assert.equal(captured.options.redirect, 'manual');
  assert.equal(actual.status, 403);
  assert.deepEqual(JSON.parse(actual.body), { code: -1, message: 'current authority rejected' });
  assert.equal(actual.headers['set-cookie'], 'one=1; Path=/; Secure\ntwo=2; Path=/; Secure');
});

test('foreign targets and altered write origins are refused before transport; external redirect is not followed', async () => {
  let calls = 0;
  const transport = async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://external.invalid/' } }); };
  for (const base of ['https://127.0.0.1:3000', 'http://production.invalid:3000', 'http://127.0.0.1:3000/path', 'http://user:pass@127.0.0.1:3000']) assert.throws(() => apiBase(base));
  await assert.rejects(forwardApi({ url: 'https://other.invalid/api/test', method: 'GET', headers: {} }, 'http://127.0.0.1:3100', transport));
  await assert.rejects(forwardApi({ url: 'https://training.eduk12.top/api/test', method: 'POST', headers: { Origin: 'http://localhost:5173' } }, 'http://127.0.0.1:3100', transport));
  assert.equal(calls, 0);
  await assert.rejects(forwardApi({ url: 'https://survey.eduk12.top/api/public/survey/r/test/info', method: 'GET', headers: {} }, 'http://127.0.0.1:3100', transport), /External API redirect/);
  assert.equal(calls, 1);
});

test('static transport serves declared production bytes; missing assets, traversal and mutations fail', t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, 'index.html'), '<main>compiled</main>');
  const dist = { root, manifest: { files: { 'index.html': entry('<main>compiled</main>') } } };
  assert.equal(staticResponse(dist, '/questionnaire-products/test').body.toString(), '<main>compiled</main>');
  for (const name of ['/unknown.js', '/%2e%2e/fixture.json', '/a\\b.js']) assert.throws(() => staticResponse(dist, name));
  assert.throws(() => staticResponse(dist, '/', 'POST'));
});

test('independent producer and complete dist identity bind original attempt; extra bytes and changed receipts fail', t => {
  const root = temporary(t), env = { PR356_SOURCE_HEAD: h, GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: h, GITHUB_RUN_ID: '100', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'caohuibj/eduK12-new-version' };
  const files = { 'index.html': entry('<main>compiled</main>'), 'app.js': entry('void 0;') };
  const manifest = { head: h, components: { frontend: h }, run: '100', attempt: 1, files };
  const manifestBytes = JSON.stringify(manifest);
  const setup = fakeValidation(root, env, { phaseId: 'frontend-image', role: 'frontend-dist', files: { 'frontend-dist.json': manifestBytes, 'dist/index.html': '<main>compiled</main>', 'dist/app.js': 'void 0;' } });
  env.PR356_FRONTEND_PHASE_SPEC = setup.specPath;
  const artifact = setup.directory, dist = path.join(artifact, 'dist');
  const accepted = verifyDist(artifact, env);
  assert.equal(accepted.artifact.producerAttempt, 1, 'Actual producer integer survives consumer attempt 2');
  assert.equal(verifyDist(artifact, { ...env, PR356_ARTIFACT_DIGEST: digest.slice(7) }).upstream.artifactDigest, digest, 'Official action bare digest is normalized without changing its bytes');
  assert.deepEqual(accepted.upstream, { phaseId: 'frontend-image', role: 'frontend-dist', artifactId: '123', runId: '100', producerAttempt: 1, proofSHA256: setup.receipt.proofSHA256, artifactDigest: digest, inputsSHA256: setup.proof.inputsSHA256 });
  assert.throws(() => verifyDist(artifact, { ...env, PR356_SOURCE_HEAD: 'e'.repeat(40), GITHUB_SHA: 'e'.repeat(40) }), 'Cross-head adapter is not authorized');
  assert.throws(() => verifyDist(artifact, { ...env, GITHUB_RUN_ID: '101' }), 'Cross-run adapter is not authorized');
  assert.throws(() => verifyDist(artifact, { ...env, PR356_PRODUCER_ATTEMPT: '2' }));
  for (const attempt of [0, -1, 1.5, '01']) { fs.writeFileSync(path.join(artifact, 'frontend-dist.json'), JSON.stringify({ ...manifest, attempt })); assert.throws(() => verifyDist(artifact, env), /Positive original producer attempt/); }
  fs.writeFileSync(path.join(artifact, 'frontend-dist.json'), manifestBytes);
  for (const patch of [ { kind: undefined }, { proofSHA256: 'e'.repeat(64) }, { source: { ...setup.receipt.source, producerAttempt: 2 } }, { producerJob: { ...setup.receipt.producerJob, attempt: 2 } }, { role: 'backend-image' }, { payloadFiles: {} } ]) {
    fs.writeFileSync(artifact + '.verified.json', JSON.stringify({ ...setup.receipt, ...patch })); assert.throws(() => verifyDist(artifact, env));
  }
  fs.writeFileSync(artifact + '.verified.json', JSON.stringify({ artifact: setup.receipt.artifact })); assert.throws(() => verifyDist(artifact, env), 'Three artifact fields cannot replace an actual full validation receipt');
  fs.writeFileSync(artifact + '.verified.json', JSON.stringify(setup.receipt));
  fs.writeFileSync(path.join(dist, 'extra.js'), 'unreviewed'); assert.throws(() => verifyDist(artifact, env), /file set/); fs.unlinkSync(path.join(dist, 'extra.js'));
  fs.writeFileSync(path.join(dist, 'app.js'), 'mutated'); assert.throws(() => verifyDist(artifact, env));
});

test('fixture environment refuses production, shared data, source drift and artifact directory before application load', t => {
  const root = temporary(t), env = environment(root);
  assert.equal(guard(env).file, env.PR356_FIXTURE_FILE);
  for (const patch of [ { NODE_ENV: 'production' }, { DATABASE_URL: 'postgresql://synthetic:synthetic@production.invalid:5432/pr356_browser_aabbccddee' }, { DATABASE_URL: 'postgresql://synthetic:synthetic@postgres:5432/main' }, { DATABASE_URL: env.DATABASE_URL + '?host=production.invalid' }, { PR356_SOURCE_HEAD: 'old' }, { PR356_EVIDENCE_DIR: root }, { JWT_SECRET: 'a-real-secret-would-not-be-accepted' }, { REDIS_URL: 'redis://redis:6379/0' } ]) assert.throws(() => guard({ ...env, ...patch }));
});

test('private fixture creation is exclusive; identity, age, mode and symlinks fail closed; public receipt drops credentials', t => {
  const root = temporary(t), env = environment(root), fixture = value(env);
  writePrivate(env.PR356_FIXTURE_FILE, fixture);
  assert.equal(fs.statSync(env.PR356_FIXTURE_FILE).mode & 0o777, 0o600);
  assert.equal(readPrivate(env.PR356_FIXTURE_FILE, env).fixtureId, fixture.fixtureId);
  assert.throws(() => writePrivate(env.PR356_FIXTURE_FILE, fixture), /EEXIST/);
  assert.throws(() => readPrivate(env.PR356_FIXTURE_FILE, { ...env, GITHUB_RUN_ID: '101' }));
  assert(!JSON.stringify(publicIdentity(fixture)).includes('private-'));
  fs.chmodSync(env.PR356_FIXTURE_FILE, 0o644); assert.throws(() => readPrivate(env.PR356_FIXTURE_FILE, env)); fs.chmodSync(env.PR356_FIXTURE_FILE, 0o600);
  const old = { ...fixture, createdAt: new Date(Date.now() - 3600000).toISOString() }; fs.writeFileSync(env.PR356_FIXTURE_FILE, JSON.stringify(old));
  assert.throws(() => readPrivate(env.PR356_FIXTURE_FILE, env), /Fresh/);
  assert.equal(readPrivate(env.PR356_FIXTURE_FILE, env, false).fixtureId, fixture.fixtureId, 'Owned expired fixture can still be cleaned up');
  const link = path.join(root, 'link.json'); fs.symlinkSync(env.PR356_FIXTURE_FILE, link); assert.throws(() => readPrivate(link, env));
});

test('nonempty fixture database stops before provisioning source, actors or grants', async t => {
  const root = temporary(t), seen = [];
  const db = { user: { count: async () => 1 }, scale: { count: async () => 0 }, surveyProject: { count: async () => 0 }, compositeAssessment: { count: async () => 0 }, $queryRaw: async () => [] };
  await assert.rejects(prepare({ file: path.join(root, 'private.json') }, name => { seen.push(name); assert.equal(name, 'config/database'); return { prisma: db }; }), /Fresh schema-only/);
  assert.deepEqual(seen, ['config/database']);
  assert.equal(fs.readdirSync(root).length, 0);
});

test('container action cannot provision or use shell/remote Docker; proof is tied to exact runtime', () => {
  const env = { PR356_RUNTIME_CONTAINER: 'pr356-browser-runtime-100-2', PR356_CONTAINER_FIXTURE_FILE: '/qualification-private/fixture.json', PR356_SOURCE_HEAD: h, PR356_BACKEND_IMAGE_ID: image, PR356_FRONTEND_IMAGE_ID: image, PR356_SCHEMA_SHA256: 'd'.repeat(64), DOCKER_HOST: 'tcp://untrusted.invalid:2375', DOCKER_TLS_VERIFY: '1' };
  let call;
  const fake = (command, args, options) => { call = { command, args, options }; return { status: 0, stdout: 'private module startup\nPR356_FIXTURE_RESULT ' + JSON.stringify({ action: 'verify', sourceHead: h, backendImageId: image, frontendImageId: image, schemaSHA256: 'd'.repeat(64), status: 'PASS' }) + '\n' }; };
  assert.equal(fixtureAction('verify', env, fake).status, 'PASS');
  assert.equal(call.command, 'docker'); assert.equal(call.args[0], '--host=unix:///var/run/docker.sock'); assert.equal(call.args.at(-1), 'verify');
  assert(!call.options.shell); assert(!('DOCKER_HOST' in call.options.env)); assert(!('DOCKER_TLS_VERIFY' in call.options.env));
  assert.throws(() => fixtureAction('prepare', env, fake));
  assert.throws(() => fixtureAction('verify', { ...env, PR356_RUNTIME_CONTAINER: 'production' }, fake));
});

test('synthetic HTTPS transport cannot resolve production DNS or disable certificate checks', () => {
  const options = browserLaunchOptions();
  assert(options.args.includes('--host-resolver-rules=MAP * ~NOTFOUND'));
  assert(options.args.includes('--disable-background-networking'));
  assert(!JSON.stringify(options).includes('ignore-certificate-errors'));
  assert(!('ignoreHTTPSErrors' in options));
});


function receiptSetup(t, phaseId = 'status-browser') {
  const root = temporary(t), specDir = path.join(root, 'spec'), out = path.join(root, 'output');
  fs.mkdirSync(specDir);
  const ids = phaseId === 'product-browser' ? [...scenarioIds] : ['onboarding-1440-light', 'onboarding-1440-dark', 'onboarding-390-light', 'onboarding-390-dark'];
  const inputs = { schemaVersion: 1, files: [{ path: '.github/scripts/pr356-product-browser.mjs', mode: '100644', blob: h }], tools: { node: '24.21.0' }, configuration: { phase: phaseId }, dependencies: { lock: h } };
  const spec = { id: phaseId, jobName: 'pr356-' + phaseId, caseIds: ids, inputs, inputsSHA256: inputsSHA256(inputs) };
  const specFile = path.join(specDir, 'phase-spec.json'), inputFile = path.join(specDir, 'phase-inputs.json');
  fs.writeFileSync(specFile, JSON.stringify(spec)); fs.writeFileSync(inputFile, JSON.stringify(inputs));
  const env = { ...environment(root), GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'caohuibj/eduK12-new-version', GITHUB_SHA: h, PR356_PHASE_SPEC: specFile, PR356_PHASE_INPUTS: inputFile, PR356_EVIDENCE_DIR: out, PR356_FRONTEND_ARTIFACT_DIR: path.join(root, 'upstream') };
  const emitted = [], streams = [{ write(chunk) { emitted.push(String(chunk)); return true; } }, { write(chunk) { emitted.push(String(chunk)); return true; } }];
  return { root, out, ids, spec, inputs, env, streams, emitted, phaseId };
}
function actualReport(setup, alteredIds = setup.ids) {
  const product = setup.phaseId === 'product-browser';
  const directory = product ? path.join(setup.out, 'product-browser') : setup.out;
  fs.mkdirSync(directory, { recursive: true });
  const report = { ...(product ? { status: 'PASS' } : { syntheticOnly: true }), results: alteredIds.map(id => product ? { id, status: 'PASS', runtimeErrors: 0, unexpectedRequests: 0 } : { id, noMutation: true, errors: [], unexpected: [] }) };
  fs.writeFileSync(path.join(directory, product ? 'compiled-product-browser.json' : 'compiled-browser.json'), JSON.stringify(report));
  for (const id of alteredIds) fs.writeFileSync(path.join(directory, product ? id + '.png' : id.replace(/^onboarding-/, '') + '.png'), Buffer.from('fake PNG transport-control bytes'));
}

test('browser phase receipt binds actual case IDs, argv, timing, redacted original stream and every public output', t => {
  for (const phaseId of ['status-browser', 'product-browser']) {
    const setup = receiptSetup(t, phaseId), originals = setup.streams.map(stream => stream.write);
    const phase = createBrowserPhase(phaseId, setup.ids, setup);
    assert.throws(() => phase.upstream({ phaseId: 'frontend-image', role: 'frontend-dist', artifactId: '123' }), /complete actual validation receipt/);
    const required = phaseId === 'status-browser' ? [['frontend-image', 'frontend-dist', 'PR356']] : [['schema-restore', 'schema-restore', 'PR356_SCHEMA'], ['backend-image', 'backend-image', 'PR356_BACKEND'], ['frontend-image', 'frontend-dist', 'PR356']];
    const actualUpstream = required.map(([producerPhase, role, prefix]) => { const upstream = fakeValidation(setup.root, setup.env, { phaseId: producerPhase, role, prefix }); return readVerifiedUpstream(producerPhase, role, upstream.directory, upstream.specPath, setup.env, prefix).record; });
    actualUpstream.forEach(record => phase.upstream(record));
    const privateToken = 'private-receipt-session-that-must-never-be-uploaded';
    phase.protect(privateToken);
    setup.streams[0].write(privateToken.slice(0, 17)); setup.streams[1].write(privateToken.slice(17) + '\n');
    actualReport(setup);
    setup.ids.forEach(id => phase.pass(id));
    const proof = phase.finish(0);
    assert.equal(proof.schemaVersion, 1); assert.equal(proof.kind, 'pr356-phase-proof'); assert.equal(proof.phaseId, phaseId); assert.equal(proof.status, 'success');
    assert.deepEqual(proof.checks, setup.ids.map(id => ({ id, status: 'passed' })));
    assert.deepEqual(proof.outputs.upstream, actualUpstream);
    assert(proof.outputs.upstream.every(record => record.producerAttempt === 1 && typeof record.artifactId === 'string'), 'Consumer retry must preserve actual producer origins');
    assert.deepEqual(proof.command.argv, [process.execPath, ...process.execArgv, ...process.argv.slice(1)]); assert.equal(proof.command.cwd, process.cwd()); assert.equal(proof.command.exitCode, 0);
    assert(Date.parse(proof.command.completedAt) >= Date.parse(proof.command.startedAt));
    const log = fs.readFileSync(path.join(setup.out, 'command.log'));
    assert.equal(proof.command.logSHA256, sha(log)); assert(log.includes(Buffer.from('[redacted]'))); assert(!log.includes(Buffer.from(privateToken)));
    assert.deepEqual(proof.source, { repository: 'caohuibj/eduK12-new-version', runId: '100', head: h, producerAttempt: 2 });
    assert.equal(proof.inputsSHA256, inputsSHA256(setup.inputs));
    assert.equal(Object.keys(proof.outputs.files).length, setup.ids.length + 2);
    assert(!Object.hasOwn(proof.outputs.files, 'phase-receipt.json'));
    for (const [relative, file] of Object.entries(proof.outputs.files)) { const data = fs.readFileSync(path.join(setup.out, relative)); assert.equal(file.sha256, sha(data)); assert.equal(file.bytes, data.length); }
    assert.deepEqual(setup.streams.map(stream => stream.write), originals);
    assert(!setup.emitted.join('').includes(privateToken));
    assert.throws(() => phase.finish(0), /already finalized/);
  }
});

test('browser phase receipt refuses missing or duplicate execution and equal-count differently named actual reports', t => {
  const partial = receiptSetup(t), first = createBrowserPhase(partial.phaseId, partial.ids, partial);
  actualReport(partial); first.pass(partial.ids[0]);
  assert.throws(() => first.pass(partial.ids[0]), /executed browser case/);
  assert.throws(() => first.finish(0), /Actual browser cases/);
  assert.equal(fs.existsSync(path.join(partial.out, 'phase-receipt.json')), false);
  const failed = first.finish(1, new Error('Missing selected cases'));
  assert.equal(failed.status, 'failed'); assert.equal(failed.command.exitCode, 1); assert.equal(failed.checks.length, 1);
  const wrong = receiptSetup(t, 'product-browser'), second = createBrowserPhase(wrong.phaseId, wrong.ids, wrong);
  actualReport(wrong, [...wrong.ids.slice(0, -1), 'same-count-wrong-scenario']); wrong.ids.forEach(id => second.pass(id));
  assert.throws(() => second.finish(0), /Actual public report case IDs/);
  assert.equal(fs.existsSync(path.join(wrong.out, 'phase-receipt.json')), false);
  assert.equal(second.finish(1, new Error('Actual report identity mismatch')).status, 'failed');
});

test('browser phase receipt rejects spec/input/job drift and private fixture or input paths inside OUT before work', t => {
  for (const patch of [ { caseIds: ['wrong', 'same', 'count', 'cases'] }, { jobName: 'unrelated-job' }, { inputsSHA256: 'f'.repeat(64) }, { inputs: { unrelated: true } } ]) {
    const setup = receiptSetup(t); fs.writeFileSync(setup.env.PR356_PHASE_SPEC, JSON.stringify({ ...setup.spec, ...patch }));
    assert.throws(() => createBrowserPhase(setup.phaseId, setup.ids, setup)); assert.equal(fs.existsSync(setup.out), false);
  }
  const privateFile = receiptSetup(t); privateFile.env.PR356_FIXTURE_FILE = path.join(privateFile.out, 'fixture.json');
  assert.throws(() => createBrowserPhase(privateFile.phaseId, privateFile.ids, privateFile), /outside public output/);
  const inputPath = receiptSetup(t); inputPath.env.PR356_EVIDENCE_DIR = path.dirname(inputPath.env.PR356_PHASE_SPEC);
  assert.throws(() => createBrowserPhase(inputPath.phaseId, inputPath.ids, inputPath), /outside public output/);
});

test('browser phase receipt preserves earlier proof bytes and refuses to reissue into a nonempty output directory', t => {
  const setup = receiptSetup(t); fs.mkdirSync(setup.out);
  const proofPath = path.join(setup.out, 'phase-receipt.json'), original = '{"prior":"immutable"}'; fs.writeFileSync(proofPath, original);
  assert.throws(() => createBrowserPhase(setup.phaseId, setup.ids, setup), /empty phase output/);
  assert.equal(fs.readFileSync(proofPath, 'utf8'), original);
});


test('status browser launch failure closes only the listening stub server and never retries or creates a real browser', async () => {
  const calls = [], server = new EventEmitter();
  server.listening = false;
  server.listen = (port, host, callback) => { calls.push(['listen', port, host]); server.listening = true; queueMicrotask(callback); };
  server.close = callback => { calls.push(['close-server']); server.listening = false; queueMicrotask(() => callback()); };
  const resources = statusBrowserResources(server, async () => { calls.push(['launch']); throw new Error('Synthetic launch failure'); });
  await assert.rejects(async () => { try { await resources.start(); } finally { await resources.close(); } }, /Synthetic launch failure/);
  assert.deepEqual(calls, [['listen', 4179, '127.0.0.1'], ['launch'], ['close-server']]);
  await resources.close();
  assert.equal(calls.length, 3);
  await assert.rejects(resources.start(), /cannot be repeated/);
  assert.equal(server.listenerCount('error'), 0);
});

test('actual workflow reads tmpfs private fixture through exec into exclusive 0600 file',()=>{
 const workflow=fs.readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const start=workflow.indexOf('        # docker cp cannot read tmpfs mounts.');assert(start>=0);
 const segment=workflow.slice(start),begin=segment.indexOf("        python3 - <<'PYCODE'\n")+"        python3 - <<'PYCODE'\n".length,end=segment.indexOf('        PYCODE',begin);assert(end>begin);
 const code=segment.slice(begin,end).split('\n').map(l=>l.startsWith('        ')?l.slice(8):l).join('\n');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pr356-private-transfer-'));
 try{
  const file=path.join(temp,'fixture.json'),harness=`import os,subprocess,stat
os.environ.update(PR356_FIXTURE_FILE=${JSON.stringify(file)},PR356_RUNTIME_CONTAINER='owned-synthetic-container',DOCKER_HOST='forbidden')
count=[]
def run(argv,env,stdout,check):
 assert argv[:5]==['docker','--host=unix:///var/run/docker.sock','exec','owned-synthetic-container','node']
 assert argv[5]=='-e' and '/qualification-private/fixture.json' in argv[6]
 assert 'DOCKER_HOST' not in env and check is True
 count.append(1);stdout.write(b'{"synthetic":true}')
subprocess.run=run
code=${JSON.stringify(code)}
exec(compile(code,'actual-workflow-private-transfer','exec'))
assert stat.S_IMODE(os.stat(os.environ['PR356_FIXTURE_FILE']).st_mode)==0o600
assert open(os.environ['PR356_FIXTURE_FILE'],'rb').read()==b'{"synthetic":true}'
try:exec(compile(code,'repeat','exec'))
except FileExistsError:pass
else:raise AssertionError('Existing private file was overwritten')
assert len(count)==1
print('actual-inline-private-transfer-control PASS; not a real Docker execution')
`;
  const result=execFileSync('python3',['-c',harness],{encoding:'utf8'});assert(result.includes('PASS'));assert(!result.includes('synthetic":true'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('Survey completion consumer uses stable heading and published feedback, retaining FINAL and persistence checks',()=>{
 const source=fs.readFileSync(new URL('./pr356-product-browser.mjs',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../../server-version/frontend/src/survey/SurveyPublicApp.tsx',import.meta.url),'utf8');
 assert.equal((source.match(/name: '感谢参与，问卷已提交', level: 2, exact: true/g)||[]).length,2);
 assert.equal((source.match(/getByText\('Synthetic browser receipt\.'/g)||[]).length,2);
 assert(app.includes("{general.text||'你已完成问卷，可以关闭此页面。'}"));
 assert(source.includes("assert.equal(submitted[0].payload.data.status, 'COMPLETED')"));assert(source.includes("assert.equal(evidence.persistedVerification.status, 'PASS')"));
});
