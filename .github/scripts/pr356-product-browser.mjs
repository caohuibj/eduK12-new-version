/** Exact frontend dist + compiled backend, disposable real-HTTP product journeys.
 * Importing this module does not import Playwright or start any service.
 * Static HTTPS fulfillment is transport only: API replies come from loopback.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inputsSHA256, expectedFromEnvironment, verifyProof } from './pr356-artifacts.mjs';

const TRAINING = 'https://training.eduk12.top';
const SURVEY = 'https://survey.eduk12.top';
const HASH = /^[a-f0-9]{64}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };
const verifiedUpstreams = new WeakSet();
const phaseUpstreams = { 'status-browser': [['frontend-image', 'frontend-dist']], 'product-browser': [['schema-restore', 'schema-restore'], ['backend-image', 'backend-image'], ['frontend-image', 'frontend-dist']] };
export const scenarioIds = ['teacher-course-exact-save-reload', 'teacher-general-native-and-exact-rejection', 'survey-ordinary-nonempty-frozen-instruction', 'survey-exact-empty-no-live-instruction'];

/** Standard proof for the actual selected command, never a count-only receipt. */
export function createBrowserPhase(phaseId, expectedCaseIds, { env = process.env, streams = [process.stdout, process.stderr] } = {}) {
  assert(['status-browser', 'product-browser'].includes(phaseId));
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_REPOSITORY, 'caohuibj/eduK12-new-version');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.equal(env.PR356_SOURCE_HEAD, env.GITHUB_SHA);
  assert.match(env.GITHUB_RUN_ID ?? '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9][0-9]*$/);
  const spec = JSON.parse(fs.readFileSync(env.PR356_PHASE_SPEC, 'utf8'));
  const inputs = JSON.parse(fs.readFileSync(env.PR356_PHASE_INPUTS, 'utf8'));
  assert.equal(spec.id, phaseId);
  assert.equal(spec.jobName, 'pr356-' + phaseId);
  assert(expectedCaseIds.length && new Set(expectedCaseIds).size === expectedCaseIds.length);
  assert.deepEqual(spec.caseIds, expectedCaseIds, 'Selected browser case IDs drifted');
  assert.deepEqual(spec.inputs, inputs, 'Browser phase inputs drifted');
  assert.equal(spec.inputsSHA256, inputsSHA256(inputs), 'Browser phase input digest drifted');
  const out = path.resolve(env.PR356_EVIDENCE_DIR);
  for (const name of ['PR356_FIXTURE_FILE', 'PR356_PHASE_SPEC', 'PR356_PHASE_INPUTS', 'PR356_FRONTEND_ARTIFACT_DIR']) {
    if (env[name]) assert(path.resolve(env[name]) !== out && !path.resolve(env[name]).startsWith(out + path.sep), 'Private fixture and phase inputs must stay outside public output');
  }
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  assert(fs.lstatSync(out).isDirectory() && !fs.lstatSync(out).isSymbolicLink());
  assert.deepEqual(fs.readdirSync(out), [], 'Use an empty phase output directory; prior evidence is immutable');
  const command = { argv: [process.execPath, ...process.execArgv, ...process.argv.slice(1)], cwd: process.cwd(), startedAt: new Date().toISOString() };
  const checks = [], upstream = [], chunks = [], secrets = new Set();
  let bytes = 0, overflow = false, finished = false, restored = false;
  const originals = streams.map(stream => stream.write);
  function append(chunk) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += data.length;
    if (bytes > 2 * 1024 * 1024) { overflow = true; return; }
    chunks.push(data);
  }
  streams.forEach(stream => { stream.write = (chunk, encoding, callback) => {
    append(chunk);
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') queueMicrotask(done);
    return true;
  }; });
  function restore() {
    if (!restored) { streams.forEach((stream, index) => { stream.write = originals[index]; }); restored = true; }
  }
  function redacted(text) {
    for (const secret of secrets) text = text.replaceAll(secret, '[redacted]');
    return text.replace(/\b(?:ptool_session|ptool_csrf|huisurvey_research_session)=([^;\s"']+)/g, match => match.slice(0, match.indexOf('=')) + '=[redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      .replace(/(#(?:entry|token|secret)=)[^\s"']+/g, '$1[redacted]')
      .replace(/((?:accessCredential|entrySecret|entryToken|password)"?\s*[:=]\s*"?)[^\s"',}]+/gi, '$1[redacted]');
  }
  append(JSON.stringify({ event: 'phase-start', phaseId, argv: command.argv, cwd: command.cwd, startedAt: command.startedAt }) + '\n');
  return {
    protect(...values) { values.flat().forEach(value => { if (typeof value === 'string' && value.length > 6) secrets.add(value); }); },
    upstream(record) {
      assert(verifiedUpstreams.has(record), 'Upstream must come from a complete actual validation receipt');
      assert.deepEqual([record.phaseId, record.role], phaseUpstreams[phaseId][upstream.length], 'Wrong, duplicate or reordered upstream');
      upstream.push(record);
    },
    pass(id) {
      assert(!finished);
      assert.equal(id, expectedCaseIds[checks.length], 'Missing, reordered, duplicated or unknown executed browser case');
      checks.push({ id, status: 'passed' });
      append(JSON.stringify({ event: 'case-passed', id }) + '\n');
    },
    finish(exitCode, error) {
      assert(!finished, 'Phase proof already finalized');
      assert([0, 1].includes(exitCode));
      if (exitCode === 0) {
        assert.deepEqual(checks, spec.caseIds.map(id => ({ id, status: 'passed' })), 'Actual browser cases do not match selected phase');
        const reportPath = phaseId === 'status-browser' ? 'compiled-browser.json' : 'product-browser/compiled-product-browser.json';
        const report = JSON.parse(fs.readFileSync(path.join(out, reportPath), 'utf8'));
        assert.deepEqual(report.results.map(result => result.id), spec.caseIds, 'Actual public report case IDs differ from the selected checks');
        for (const result of report.results) {
          if (phaseId === 'product-browser') {
            assert.equal(report.status, 'PASS'); assert.equal(result.status, 'PASS');
            assert.equal(result.runtimeErrors, 0); assert.equal(result.unexpectedRequests, 0);
          } else {
            assert.equal(result.noMutation, true); assert.deepEqual(result.errors, []); assert.deepEqual(result.unexpected, []);
          }
          const image = phaseId === 'status-browser' ? result.id.replace(/^onboarding-/, '') + '.png' : 'product-browser/' + result.id + '.png';
          assert(fs.lstatSync(path.join(out, image)).isFile(), 'Actual case screenshot is missing');
        }
        assert.deepEqual(upstream.map(record => [record.phaseId, record.role]), phaseUpstreams[phaseId], 'Selected upstream validation receipts are incomplete');
        assert(!overflow, 'Browser command log exceeded its bounded budget');
      }
      if (error) append(JSON.stringify({ event: 'phase-error', name: error.name, message: String(error.message || error).split('\n')[0] }) + '\n');
      if (overflow) append('Browser command log exceeded its bounded budget\n');
      command.completedAt = new Date().toISOString();
      command.exitCode = exitCode;
      append(JSON.stringify({ event: 'phase-complete', phaseId, exitCode, completedAt: command.completedAt }) + '\n');
      const log = redacted(Buffer.concat(chunks).toString('utf8'));
      const logFile = path.join(out, 'command.log');
      fs.writeFileSync(logFile, log, { flag: 'wx' });
      command.logSHA256 = sha(fs.readFileSync(logFile));
      const files = {};
      function walk(directory) {
        for (const name of fs.readdirSync(directory).sort()) {
          const file = path.join(directory, name), stat = fs.lstatSync(file);
          assert(!stat.isSymbolicLink(), 'Public output symlinks forbidden');
          if (stat.isDirectory()) walk(file);
          else {
            assert(stat.isFile());
            const relative = path.relative(out, file).split(path.sep).join('/');
            assert.notEqual(relative, 'phase-receipt.json', 'Prior proof cannot be reissued');
            assert(/\.(json|png|log)$/.test(relative) && !/(^|\/)(?:fixture|private)[.-]/i.test(relative), 'Unexpected private or non-report output');
            const data = fs.readFileSync(file);
            for (const secret of secrets) assert(!data.includes(Buffer.from(secret)), 'Private credential entered public report');
            files[relative] = { sha256: sha(data), bytes: data.length };
          }
        }
      }
      try {
        walk(out);
        const proof = { schemaVersion: 1, kind: 'pr356-phase-proof', phaseId, status: exitCode === 0 ? 'success' : 'failed',
          source: { repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, head: env.GITHUB_SHA, producerAttempt: Number(env.GITHUB_RUN_ATTEMPT) },
          inputs, inputsSHA256: spec.inputsSHA256, command, checks: [...checks], outputs: { files, upstream: [...upstream] } };
        fs.writeFileSync(path.join(out, 'phase-receipt.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
        finished = true;
        return proof;
      } finally {
        restore();
        originals[0].call(streams[0], log);
      }
    },
    restore,
  };
}

export async function runBrowserPhase(phaseId, expectedCaseIds, work) {
  const phase = createBrowserPhase(phaseId, expectedCaseIds);
  try {
    await work(phase);
    assert(process.exitCode == null || Number(process.exitCode) === 0, 'Actual browser command was marked unsuccessful');
    return phase.finish(0);
  } catch (error) {
    process.exitCode = 1;
    return phase.finish(1, error);
  } finally { phase.restore(); }
}

export function apiBase(value) {
  const u = new URL(value);
  assert.equal(u.protocol, 'http:');
  assert.equal(u.hostname, '127.0.0.1', 'Only loopback backend transport is permitted');
  assert(u.port && Number(u.port) > 1024 && Number(u.port) <= 65535);
  assert(u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password);
  return u.origin;
}

/** Bind the small local validator receipt to its actual producer proof bytes.
 * Official ZIP/API validation is the preceding pr356-artifacts command; no
 * credentials or application services are read here and no artifact is rebuilt.
 */
export function readVerifiedUpstream(phaseId, role, directory, specPath, env = process.env, prefix = 'PR356') {
  const root = fs.realpathSync(directory), proofPath = path.join(root, 'phase-receipt.json');
  const receiptPath = root + '.verified.json';
  for (const file of [proofPath, receiptPath]) assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'Regular validation/proof files required');
  const raw = fs.readFileSync(proofPath), proof = JSON.parse(raw), receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const pins = { ...env };
  for (const key of ['ARTIFACT_ID', 'ARTIFACT_NAME', 'ARTIFACT_DIGEST', 'PRODUCER_RUN', 'PRODUCER_HEAD', 'PRODUCER_ATTEMPT']) pins['PR356_' + key] = env[prefix + '_' + key];
  const expected = expectedFromEnvironment(role, spec, pins), files = verifyProof(proof, expected);
  assert.equal(expected.phaseId, phaseId);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, 'pr356-official-artifact-validation');
  assert.equal(receipt.phaseId, phaseId);
  assert.equal(receipt.role, role);
  assert.deepEqual(receipt.source, proof.source, 'Validator/producer source mismatch');
  assert.equal(receipt.directory, root);
  assert.equal(receipt.proofPath, proofPath);
  assert.equal(receipt.proofSHA256, sha(raw), 'Actual original proof bytes changed');
  assert.equal(receipt.inputsSHA256, proof.inputsSHA256);
  assert.deepEqual(receipt.payloadFiles, files, 'Validator payload declaration differs from producer');
  assert.equal(String(receipt.artifact.id), String(expected.artifactId));
  assert.equal(receipt.artifact.name, expected.artifactName);
  assert.equal(receipt.artifact.digest, expected.artifactDigest);
  assert(Number.isSafeInteger(receipt.artifact.sizeBytes) && receipt.artifact.sizeBytes > 0);
  assert.equal(receipt.zipBytes, receipt.artifact.sizeBytes);
  assert.equal('sha256:' + receipt.zipSHA256, receipt.artifact.digest);
  assert.equal(receipt.producerJob.name, spec.jobName);
  assert.equal(receipt.producerJob.attempt, proof.source.producerAttempt);
  assert.equal(receipt.producerJob.conclusion, 'success');
  assert(Number.isSafeInteger(receipt.producerJob.id) && receipt.producerJob.id > 0);
  const result = Object.freeze({ phaseId, role, artifactId: String(receipt.artifact.id), runId: String(receipt.source.runId), producerAttempt: Number(receipt.source.producerAttempt), proofSHA256: receipt.proofSHA256, artifactDigest: receipt.artifact.digest, inputsSHA256: receipt.inputsSHA256 });
  verifiedUpstreams.add(result);
  return { record: result, proof, receipt, files };
}

export function verifyDist(directory, env = process.env) {
  const root = fs.realpathSync(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend-dist.json'), 'utf8'));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'phase-receipt.json'), 'utf8'));
  const validated = readVerifiedUpstream('frontend-image', 'frontend-dist', root, env.PR356_FRONTEND_PHASE_SPEC, env);
  const verified = validated.receipt;
  const spec = JSON.parse(fs.readFileSync(env.PR356_FRONTEND_PHASE_SPEC, 'utf8'));
  assert.equal(proof.phaseId, 'frontend-image');
  // This reviewed plan accepts only the same official run and candidate head.
  assert.equal(env.PR356_SOURCE_HEAD, env.GITHUB_SHA);
  assert.equal(env.PR356_PRODUCER_HEAD, env.GITHUB_SHA);
  assert.equal(env.PR356_PRODUCER_RUN, env.GITHUB_RUN_ID);
  assert.deepEqual(proof.inputs, spec.inputs, 'Frontend phase inputs drifted');
  assert.equal(manifest.sourceHead ?? manifest.head, env.PR356_PRODUCER_HEAD);
  assert.equal(manifest.run, env.PR356_PRODUCER_RUN);
  assert(/^[1-9][0-9]*$/.test(String(manifest.attempt)) && Number.isSafeInteger(Number(manifest.attempt)), 'Positive original producer attempt required');
  assert.equal(String(manifest.attempt), env.PR356_PRODUCER_ATTEMPT);
  assert.equal(manifest.head, env.PR356_PRODUCER_HEAD);
  assert.equal(env.PR356_ARTIFACT_NAME, `pr356-frontend-dist-${env.PR356_PRODUCER_RUN}-${env.PR356_PRODUCER_ATTEMPT}`);
  assert.equal(String(verified.artifact.id), env.PR356_ARTIFACT_ID);
  assert.equal(verified.artifact.name, env.PR356_ARTIFACT_NAME);
  assert.equal(verified.artifact.digest, env.PR356_ARTIFACT_DIGEST.startsWith('sha256:') ? env.PR356_ARTIFACT_DIGEST : 'sha256:' + env.PR356_ARTIFACT_DIGEST);
  assert(IMAGE.test(verified.artifact.digest));
  const files = manifest.files;
  assert(files && files['index.html'] && Object.keys(files).length > 1, 'Complete dist manifest required');
  const dist = path.join(root, 'dist');
  assert(fs.lstatSync(dist).isDirectory() && !fs.lstatSync(dist).isSymbolicLink(), 'Dist directory symlinks forbidden');
  const seen = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name), stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Dist symlinks forbidden');
      if (stat.isDirectory()) walk(file);
      else { assert(stat.isFile()); seen.push(path.relative(dist, file).split(path.sep).join('/')); }
    }
  }
  walk(dist);
  assert.deepEqual(seen.sort(), Object.keys(files).sort(), 'Dist file set drifted');
  for (const [relative, expected] of Object.entries(files)) {
    assert(relative && !relative.startsWith('/') && !relative.split('/').includes('..'));
    const data = fs.readFileSync(path.join(dist, relative));
    assert.equal(sha(data), expected.sha256);
    assert.equal(data.length, expected.bytes);
    assert.deepEqual(proof.outputs.artifactFiles['frontend-dist']['dist/' + relative], expected, 'Producer file manifest drifted');
  }
  const manifestBytes = fs.readFileSync(path.join(root, 'frontend-dist.json'));
  assert.deepEqual(proof.outputs.artifactFiles['frontend-dist']['frontend-dist.json'], { sha256: sha(manifestBytes), bytes: manifestBytes.length });
  return { root: dist, manifest, upstream: validated.record, artifact: { id: verified.artifact.id, name: verified.artifact.name, digest: verified.artifact.digest, producerRun: manifest.run, producerAttempt: manifest.attempt } };
}

export function readFixture(file, env = process.env) {
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
  assert(IMAGE.test(value.backendImageId) && IMAGE.test(value.frontendImageId) && HASH.test(value.schemaSHA256));
  const age = Date.now() - Date.parse(value.createdAt);
  assert(age >= 0 && age < 15 * 60 * 1000, 'Fixture expired');
  assert.equal(value.combinations.length, 2);
  assert.equal(value.combinations[0].axisVersions.CONTENT, value.combinations[1].axisVersions.CONTENT);
  assert.notEqual(value.combinations[0].combination.releaseId, value.combinations[1].combination.releaseId);
  assert(value.survey.ordinary.expectedInstruction);
  assert.equal(value.survey.exact.expectedInstruction, null);
  return value;
}

/** Request/response bytes are never substituted with successful fixture data. */
export async function forwardApi(request, base, fetcher = fetch) {
  const u = new URL(request.url);
  assert([TRAINING, SURVEY].includes(u.origin), 'Unknown browser origin');
  assert(u.pathname.startsWith('/api/'), 'API path required');
  const headers = new Headers(request.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assert.equal(headers.get('origin'), u.origin, 'Original browser write origin required');
  // Node fetch otherwise decompresses gzip while retaining its encoding header.
  headers.set('accept-encoding', 'identity');
  headers.set('host', u.host);
  for (const name of ['connection', 'content-length', 'transfer-encoding', 'proxy-authorization', 'proxy-connection']) headers.delete(name);
  const upstream = await fetcher(apiBase(base) + u.pathname + u.search, {
    method: request.method, headers, redirect: 'manual',
    ...(!['GET', 'HEAD'].includes(request.method) && request.body != null ? { body: request.body } : {}),
  });
  const location = upstream.headers.get('location');
  if (location) assert.equal(new URL(location, u.origin).origin, u.origin, 'External API redirect refused');
  const responseHeaders = Object.fromEntries(upstream.headers);
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) responseHeaders['set-cookie'] = cookies.join('\n');
  const body = Buffer.from(await upstream.arrayBuffer());
  return { status: upstream.status, headers: responseHeaders, body };
}

export function staticResponse(dist, pathname, method = 'GET') {
  assert(['GET', 'HEAD'].includes(method), 'Static mutations forbidden');
  const relative = decodeURIComponent(pathname).replace(/^\//, '');
  assert(!relative.includes('\0') && !relative.includes('\\') && !relative.split('/').includes('..'), 'Static path escape refused');
  const candidate = path.extname(relative) ? relative : 'index.html';
  assert(Object.hasOwn(dist.manifest.files, candidate), 'Unknown dist asset');
  return { status: 200, contentType: mime[path.extname(candidate)] || 'application/octet-stream', body: method === 'HEAD' ? Buffer.alloc(0) : fs.readFileSync(path.join(dist.root, candidate)) };
}

export function fixtureAction(action, env = process.env, spawn = spawnSync) {
  assert(['mutate', 'verify'].includes(action), 'Browser can only mutate the owned fixture text or read verification');
  assert(/^pr356-browser-[a-z0-9-]{1,60}$/.test(env.PR356_RUNTIME_CONTAINER || ''), 'Owned runtime container name required');
  assert.equal(env.PR356_CONTAINER_FIXTURE_FILE, '/qualification-private/fixture.json');
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'].includes(key)));
  const result = spawn('docker', ['--host=unix:///var/run/docker.sock', 'exec', '--env', 'PR356_FIXTURE_FILE=/qualification-private/fixture.json', env.PR356_RUNTIME_CONTAINER, 'node', '/qualification/pr356-browser-fixture.cjs', action], { env: clean, encoding: 'utf8', timeout: 35000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, 'Fixture action failed; private output withheld');
  const lines = result.stdout.split('\n').filter(line => line.startsWith('PR356_FIXTURE_RESULT '));
  assert.equal(lines.length, 1, 'Exactly one fixture result required');
  const proof = JSON.parse(lines[0].slice('PR356_FIXTURE_RESULT '.length));
  assert.equal(proof.action, action);
  assert.equal(proof.sourceHead, env.PR356_SOURCE_HEAD);
  assert.equal(proof.backendImageId, env.PR356_BACKEND_IMAGE_ID);
  assert.equal(proof.frontendImageId, env.PR356_FRONTEND_IMAGE_ID);
  assert.equal(proof.schemaSHA256, env.PR356_SCHEMA_SHA256);
  return proof;
}

/** One attempt only; cleanup is safe when listen or browser launch fails. */
export function statusBrowserResources(server, launch) {
  let browser, started = false;
  return {
    async start() {
      assert(!started, 'Status browser startup cannot be repeated');
      started = true;
      await new Promise((resolve, reject) => {
        const failed = error => { server.off('error', failed); reject(error); };
        server.once('error', failed);
        server.listen(4179, '127.0.0.1', () => { server.off('error', failed); resolve(); });
      });
      browser = await launch();
      return browser;
    },
    async close() {
      try {
        const created = browser;
        browser = undefined;
        if (created) await created.close();
      } finally {
        if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    },
  };
}

export function browserLaunchOptions() {
  return { headless: true, args: ['--no-proxy-server', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'] };
}

const versions = axes => `内容 ${axes.CONTENT} · 参数 ${axes.PARAMETERS === 'none-v1' ? '未配置' : axes.PARAMETERS} · 报告 ${axes.REPORT === 'none-v1' ? '未配置' : axes.REPORT}`;
const sanitize = error => String(error?.message || error).split('\n')[0].replace(/[A-Za-z0-9_-]{43,}/g, '[redacted]').slice(0, 300);

async function main(receipt) {
  const env = process.env;
  const dist = verifyDist(env.PR356_FRONTEND_ARTIFACT_DIR, env);
  const schema = readVerifiedUpstream('schema-restore', 'schema-restore', env.PR356_SCHEMA_ARTIFACT_DIR, env.PR356_SCHEMA_PHASE_SPEC, env, 'PR356_SCHEMA');
  const backend = readVerifiedUpstream('backend-image', 'backend-image', env.PR356_BACKEND_ARTIFACT_DIR, env.PR356_BACKEND_PHASE_SPEC, env, 'PR356_BACKEND');
  assert.equal(schema.files['setup-schema.dump'].sha256, env.PR356_SCHEMA_SHA256);
  assert.equal(backend.proof.outputs.image.imageId, env.PR356_BACKEND_IMAGE_ID);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.PR356_FRONTEND_ARTIFACT_DIR, 'phase-receipt.json'), 'utf8')).outputs.image.imageId, env.PR356_FRONTEND_IMAGE_ID);
  receipt.upstream(schema.record); receipt.upstream(backend.record); receipt.upstream(dist.upstream);
  const fixture = readFixture(env.PR356_FIXTURE_FILE, env);
  receipt.protect(fixture.teacher.session, ...Object.values(fixture.survey).map(item => item.entrySecret));
  const base = apiBase(env.PR356_API_BASE_URL);
  const out = path.resolve(env.PR356_EVIDENCE_DIR || 'pr356-evidence', 'product-browser');
  assert(!fs.existsSync(out), 'Use a new product browser evidence directory');
  assert(!path.resolve(env.PR356_FIXTURE_FILE).startsWith(out + path.sep));
  fs.mkdirSync(out, { mode: 0o700 });
  const evidence = {
    schemaVersion: 1, sourceHead: env.PR356_SOURCE_HEAD, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    artifact: dist.artifact, backendImageId: fixture.backendImageId, frontendImageId: fixture.frontendImageId,
    schemaSHA256: fixture.schemaSHA256, fixtureId: fixture.fixtureId, harnessSHA256: sha(fs.readFileSync(new URL(import.meta.url))),
    transport: 'synthetic-https-static-dist-with-transparent-loopback-real-http-api',
    coverage: { engine: 'chromium', productionIngress: false, loginEnrollment: false, exactNonemptyRegistryInstruction: 'NOT_PROVIDED', statusPageSyntheticJourney: 'SEPARATE_ORIGINAL_FOUR_VIEWS' },
    selected: scenarioIds, results: [], requests: [], failures: [], status: 'RUNNING',
  };
  const save = () => fs.writeFileSync(path.join(out, 'compiled-product-browser.json'), JSON.stringify(evidence, null, 2) + '\n');
  save();
  const { chromium } = await import('../release-tools/node_modules/playwright-core/index.mjs');
  const browser = await chromium.launch(browserLaunchOptions());
  evidence.browserVersion = browser.version();
  let phase = 'startup', currentPage, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void browser.close(); }, 300000);
  const runFixture = action => { const proof = fixtureAction(action); assert.equal(proof.fixtureId, fixture.fixtureId, 'Fixture identity drifted'); return proof; };
  async function open(origin, width, teacher = false) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'light', serviceWorkers: 'block' });
    if (teacher) await context.addCookies([{ name: 'ptool_session', value: fixture.teacher.session, url: TRAINING, httpOnly: true, secure: true, sameSite: 'Lax' }]);
    const page = await context.newPage(), state = { errors: [], unexpected: [], calls: [] };
    page.on('pageerror', error => state.errors.push(sanitize(error)));
    await context.routeWebSocket('**/*', socket => { state.unexpected.push('Unexpected WebSocket'); socket.close(); });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      try {
        assert.equal(url.origin, origin, 'Cross-origin request refused');
        if (!url.pathname.startsWith('/api/')) return await route.fulfill(staticResponse(dist, url.pathname, req.method()));
        const trainingPath = /^\/api\/(auth\/(me|csrf)|capabilities|questionnaire-products(?:\/|$))/.test(url.pathname);
        const surveyPath = url.pathname.startsWith('/api/public/survey/r/' + (origin === SURVEY ? state.publicId : '') + '/');
        assert(origin === TRAINING ? trainingPath : surveyPath, 'Unknown API consumer');
        if (origin === TRAINING && !['GET', 'HEAD'].includes(req.method())) assert(req.method() === 'POST' && [fixture.course.id, fixture.general.id].some(id => url.pathname === `/api/questionnaire-products/${id}/items`), 'Unexpected authenticated write');
        const headers = await req.allHeaders();
        if (origin === SURVEY) assert(!headers.cookie, 'Public Survey must omit account cookies');
        const rawBody = req.postDataBuffer();
        const result = await forwardApi({ url: url.href, method: req.method(), headers, body: rawBody }, base);
        const payload = result.headers['content-type']?.includes('application/json') ? JSON.parse(result.body) : null;
        const body = rawBody ? JSON.parse(rawBody) : null;
        receipt.protect(payload?.data?.accessCredential);
        const expectedDenial = origin === TRAINING && url.pathname === `/api/questionnaire-products/${fixture.general.id}/items` && !!body?.item?.standardCombination;
        const record = { method: req.method(), path: url.pathname, status: result.status, expectedDenial };
        evidence.requests.push(record);
        state.calls.push({ ...record, payload, body }); // private in-memory only
        if (expectedDenial) {
          assert.equal(result.status, 409);
          assert.equal(payload?.message, 'CONTENT_TRAINING_STANDARD_COMPOSITE_UNAVAILABLE');
        } else assert(result.status < 400 && payload?.code === 0, 'Real API consumer failed');
        await route.fulfill(result);
      } catch (error) {
        state.unexpected.push(sanitize(error));
        await route.abort('failed');
      }
    });
    return { page, context, state };
  }
  async function stable(page, state, id) {
    assert.equal(await page.evaluate(() => window.isSecureContext && typeof crypto.randomUUID === 'function'), true);
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(size.scroll <= size.client, 'Product horizontal overflow');
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.unexpected, []);
    await page.screenshot({ path: path.join(out, id + '.png'), fullPage: true, mask: [page.locator('input,textarea')] });
    evidence.results.push({ id, status: 'PASS', size, runtimeErrors: 0, unexpectedRequests: 0 });
    save();
    receipt.pass(id);
  }
  async function picker(page) {
    await page.getByRole('button', { name: '量表', exact: true }).click();
    await page.getByRole('button', { name: /^选择量表/ }).click();
    return page.getByRole('dialog', { name: '选择量表', exact: true });
  }
  try {
    phase = scenarioIds[0];
    const training = await open(TRAINING, 1440, true);
    currentPage = training.page;
    await currentPage.goto(`${TRAINING}/questionnaire-products/${fixture.course.id}#questionnaire-content`);
    const dialog = await picker(currentPage);
    const choices = fixture.combinations.map(choice => `选择 ${fixture.scale.name}，版本 ${versions(choice.axisVersions)}`);
    await dialog.getByRole('button', { name: choices[0], exact: true }).waitFor();
    await dialog.getByRole('button', { name: choices[1], exact: true }).waitFor();
    assert.equal(training.state.calls.filter(call => call.method === 'POST').length, 0);
    assert(!((await dialog.innerText()).includes(fixture.combinations[1].combination.combinationHash)), 'Raw combination hash leaked into picker');
    await dialog.getByRole('button', { name: choices[1], exact: true }).click();
    await currentPage.getByRole('button', { name: '添加到测评', exact: true }).click();
    const summary = `配置第 1 项：1. ${fixture.scale.name} · 已批准组合 · ${versions(fixture.combinations[1].axisVersions)}`;
    await currentPage.getByRole('button', { name: summary, exact: true }).waitFor();
    const add = training.state.calls.filter(call => call.method === 'POST');
    assert.equal(add.length, 1);
    assert.deepEqual(add[0].body, { revision: fixture.course.revision, item: { type: 'SCALE', required: true, scaleId: fixture.scale.id, standardCombination: fixture.combinations[1].combination } });
    assert.equal(add[0].payload.data.revision, fixture.course.revision + 1);
    const savedItem = add[0].payload.data.items.find(item => item.type === 'SCALE');
    assert.deepEqual(savedItem.standardCombinationSummary.axisVersions, fixture.combinations[1].axisVersions);
    assert(!('authority' in savedItem.standardCombinationSummary) && !('standardCombinationSource' in savedItem));
    const detailPath = `/api/questionnaire-products/${fixture.course.id}`;
    const beforeReads = training.state.calls.filter(call => call.path === detailPath && call.method === 'GET').length;
    await currentPage.reload();
    await currentPage.getByRole('button', { name: summary, exact: true }).waitFor();
    assert(training.state.calls.filter(call => call.path === detailPath && call.method === 'GET').length > beforeReads, 'Reload did not read persisted detail');
    await stable(currentPage, training.state, phase);

    phase = scenarioIds[1];
    await currentPage.goto(`${TRAINING}/questionnaire-products/${fixture.general.id}#questionnaire-content`);
    const generalDialog = await picker(currentPage);
    for (const name of choices) assert.equal(await generalDialog.getByRole('button', { name, exact: true }).count(), 0);
    await currentPage.getByText('精确批准组合目前适用于课程问卷。', { exact: true }).waitFor();
    await generalDialog.getByRole('button', { name: `选择 ${fixture.scale.name}，版本 ${fixture.scale.version}`, exact: true }).click();
    await currentPage.getByRole('button', { name: '添加到测评', exact: true }).click();
    await currentPage.getByRole('button', { name: `配置第 1 项：1. ${fixture.scale.name}`, exact: true }).waitFor();
    const native = training.state.calls.filter(call => call.path === `/api/questionnaire-products/${fixture.general.id}/items` && !call.expectedDenial);
    assert.equal(native.length, 1);
    assert.deepEqual(native[0].body, { revision: fixture.general.revision, item: { type: 'SCALE', required: true, scaleId: fixture.scale.id } });
    const denial = await currentPage.evaluate(async ({ id, revision, scaleId, combination }) => {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(response => response.json());
      const response = await fetch(`/api/questionnaire-products/${id}/items`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.data.csrfToken }, body: JSON.stringify({ revision, item: { type: 'SCALE', required: true, scaleId, standardCombination: combination } }) });
      return { status: response.status, payload: await response.json() };
    }, { id: fixture.general.id, revision: fixture.general.revision + 1, scaleId: fixture.scale.id, combination: fixture.combinations[1].combination });
    assert.equal(denial.status, 409);
    assert.equal(denial.payload.message, 'CONTENT_TRAINING_STANDARD_COMPOSITE_UNAVAILABLE');
    await currentPage.reload();
    await currentPage.getByRole('button', { name: `配置第 1 项：1. ${fixture.scale.name}`, exact: true }).waitFor();
    const refreshed = training.state.calls.filter(call => call.path === `/api/questionnaire-products/${fixture.general.id}` && call.method === 'GET').at(-1).payload.data;
    assert.equal(refreshed.revision, fixture.general.revision + 1);
    assert.equal(refreshed.items.filter(item => item.type === 'SCALE').length, 1);
    await stable(currentPage, training.state, phase);
    await training.context.close();

    async function survey(kind, id) {
      phase = id;
      const expected = fixture.survey[kind], session = await open(SURVEY, 390);
      session.state.publicId = expected.publicId;
      currentPage = session.page;
      await currentPage.goto(`${SURVEY}/r/${expected.publicId}#entry=${expected.entrySecret}`);
      await currentPage.getByRole('checkbox', { name: '我已阅读以上说明，自愿参加本次问卷。', exact: true }).check();
      await currentPage.getByRole('button', { name: '开始填写问卷', exact: true }).click();
      let region = currentPage.getByRole('region', { name: '逐题施测：' + expected.title, exact: true });
      await region.waitFor();
      const taskPath = `/api/public/survey/r/${expected.publicId}/attempts/`;
      const currentTask = () => session.state.calls.filter(call => call.path.startsWith(taskPath) && call.path.endsWith('/task')).at(-1)?.payload.data;
      let task = currentTask();
      assert(task && task.units.length === 1 && task.definitionDigest === expected.definitionDigest);
      assert.equal(task.units[0].instruction ?? null, expected.expectedInstruction);
      assert([undefined, 'ONE_BY_ONE'].includes(task.units[0].presentationMode));
      assert.equal(await region.locator('fieldset').count(), 1);
      if (expected.expectedInstruction) assert.equal(await region.getByRole('note').innerText(), expected.expectedInstruction);
      else assert.equal(await region.getByRole('note').count(), 0);
      const answerKey = task.units[0].items[0].itemKey;
      await region.getByRole('radio').first().check();
      if (kind === 'ordinary') runFixture('mutate');
      await currentPage.reload();
      await currentPage.getByRole('button', { name: '恢复本次作答／查看已完成回执', exact: true }).click();
      region = currentPage.getByRole('region', { name: '逐题施测：' + expected.title, exact: true });
      await region.waitFor();
      task = currentTask();
      assert.equal(task.units[0].instruction ?? null, expected.expectedInstruction);
      if (expected.expectedInstruction) assert.equal(await region.getByRole('note').innerText(), expected.expectedInstruction);
      else assert.equal(await region.getByRole('note').count(), 0);
      assert.equal(await currentPage.getByText(fixture.scale.expectedAfter, { exact: true }).count(), 0);
      assert.equal(await region.locator(`input[type="radio"][name="${expected.instrumentKey}-${answerKey}"]:checked`).count(), 1, 'The first answer must survive reload');
      const progress = region.getByRole('progressbar', { name: '量表作答进度', exact: true });
      const max = Number(await progress.getAttribute('max'));
      assert(max > 0 && max <= 30, 'Explicit bounded Scale fixture required');
      for (let tries = 0; Number(await progress.getAttribute('value')) < max; tries++) {
        assert(tries < max + 2, 'Scale navigation did not progress');
        const before = Number(await progress.getAttribute('value'));
        const resume = region.getByRole('button', { name: /^继续未答题/ });
        if (await resume.count()) await resume.click();
        await region.getByRole('radio').first().check();
        await currentPage.waitForFunction(({ name, value }) => Number(document.querySelector(`progress[aria-label="${name}"]`)?.value) > value, { name: '量表作答进度', value: before });
      }
      await currentPage.getByRole('button', { name: '提交本轮正式回答', exact: true }).click();
      await currentPage.getByRole('heading', { name: '感谢参与，问卷已提交', level: 2, exact: true }).waitFor();
      await currentPage.getByText('Synthetic browser receipt.', { exact: true }).waitFor();
      const submitted = session.state.calls.filter(call => call.path.endsWith('/final'));
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].payload.data.status, 'COMPLETED');
      assert.deepEqual(Object.keys(submitted[0].body.answers), [expected.instrumentKey]);
      assert(!Object.hasOwn(submitted[0].body.answers[expected.instrumentKey], 'instruction'));
      assert(!JSON.stringify(submitted[0].body.answers).includes(fixture.scale.expectedBefore));
      await currentPage.reload();
      await currentPage.getByRole('button', { name: '恢复本次作答／查看已完成回执', exact: true }).click();
      await currentPage.getByRole('heading', { name: '感谢参与，问卷已提交', level: 2, exact: true }).waitFor();
      await currentPage.getByText('Synthetic browser receipt.', { exact: true }).waitFor();
      assert.equal(session.state.calls.filter(call => call.path.endsWith('/start-unlinked')).length, 1);
      assert.equal(session.state.calls.filter(call => call.path.endsWith('/final')).length, 1);
      await stable(currentPage, session.state, id);
      await session.context.close();
    }
    await survey('ordinary', scenarioIds[2]);
    await survey('exact', scenarioIds[3]);
    evidence.persistedVerification = runFixture('verify');
    assert.equal(evidence.persistedVerification.status, 'PASS');
    assert.deepEqual(evidence.results.map(result => result.id), scenarioIds);
    assert(!timedOut);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.failures.push({ phase, timedOut, error: sanitize(error) });
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(out, 'failure.png'), fullPage: true, mask: [currentPage.locator('input,textarea')] }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    save();
    await browser.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runBrowserPhase('product-browser', scenarioIds, main).catch(error => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', error: sanitize(error) }) + '\n');
  process.exitCode = 1;
});
