/* Pure contract tests. No app entrypoint, server, browser or DB is started.
 * Run against an existing dependency-equipped checkout, without building:
 * node --test server-version/e2e/school-teacher-startup-contract.test.cjs
 */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { backendEnvironment, validateBuildReuse, validateBuildManifest, classifyStartupLog } = require('./school-teacher-browser.cjs')

const fixture = { runtimeUrl: 'postgresql://synthetic:unused@127.0.0.1:1/config_contract_only',
  secrets: { JWT_SECRET: 'j'.repeat(64), ASSET_SIGNING_SECRET: 's'.repeat(64), DATA_ENCRYPTION_KEY: 'a'.repeat(64),
    DATA_PSEUDONYM_KEY: 'b'.repeat(64), CAMPUS_ELIGIBILITY_HMAC_KEY: 'c'.repeat(64), CAMPUS_MFA_ENCRYPTION_KEY: 'd'.repeat(64) } }
const digest = text => createHash('sha256').update(text).digest('hex')

function parseRealProductionConfig(env) {
  const backend = path.resolve(__dirname, '../backend')
  const loader = require.resolve('tsx/cjs', { paths: [backend] })
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'school-teacher-config-'))
  // This imports the real config and its pure dependencies, not an extracted
  // replica of its CORS check. Refuse a future DB/transport import explicitly.
  const program = `
    const Module = require('node:module'), load = Module._load;
    Module._load = function(id, parent, isMain) {
      if (/^(?:node:)?(?:http|https|net|tls|dgram)$/.test(id) || /(?:^|\\/)(?:database|pg|@prisma\\/client)(?:$|\\/)/.test(id))
        throw new Error('CONFIG_TEST_FORBIDS_DATABASE_OR_TRANSPORT');
      return load.apply(this, arguments);
    };
    try {
      const { config } = require(process.env.CONFIG_CONTRACT_SOURCE);
      process.stdout.write(JSON.stringify({ok:true,corsOrigin:config.corsOrigin,nodeEnv:config.nodeEnv,
        cookieSecure:config.cookieSecure,trustProxyHops:config.trustProxyHops,backgroundWorkersEnabled:config.backgroundWorkersEnabled}));
    } catch (error) {
      process.stdout.write(JSON.stringify({ok:false,corsContract:error.message==='CORS_ORIGIN must be one exact HTTP(S) origin',
        messageHash:require('node:crypto').createHash('sha256').update(String(error)).digest('hex')}));
    }
  `
  try {
    const result = spawnSync(process.execPath, ['--require', loader, '-e', program], { cwd: scratch,
      env: { ...env, CONFIG_CONTRACT_SOURCE: path.join(backend, 'src/config/index.ts') }, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, 'Pure config subprocess failed; diagnostic digest ' + digest(String(result.stderr)))
    return JSON.parse(result.stdout)
  } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
}

for (const [product, origin] of [['SCHOOL', 'https://school.eduk12.top'], ['TEACHER', 'https://teacher.eduk12.top']]) {
  test(product + ' harness environment passes the real production config contract', () => {
    const env = backendEnvironment(fixture, '/tmp/synthetic-config', 3187, 'redis://127.0.0.1:1/0', product,
      { PATH: process.env.PATH, HOME: process.env.HOME, UNRELATED_CREDENTIAL: 'must-not-propagate' })
    assert.equal(env.UNRELATED_CREDENTIAL, undefined)
    assert.equal(env.DATABASE_URL, fixture.runtimeUrl)
    assert.deepEqual(parseRealProductionConfig(env), { ok: true, corsOrigin: origin, nodeEnv: 'production',
      cookieSecure: true, trustProxyHops: 1, backgroundWorkersEnabled: false })
  })
}

test('the original comma-joined CORS value is rejected by real production configuration', () => {
  const env = backendEnvironment(fixture, '/tmp/synthetic-config', 3187, 'redis://127.0.0.1:1/0', 'SCHOOL')
  env.CORS_ORIGIN = 'https://school.eduk12.top,https://teacher.eduk12.top'
  const parsed = parseRealProductionConfig(env)
  assert.equal(parsed.ok, false); assert.equal(parsed.corsContract, true)
})

test('backend environment rejects unknown product origins', () => {
  assert.throws(() => backendEnvironment(fixture, '/tmp/synthetic-config', 3187, 'redis://127.0.0.1:1/0', 'OTHER'))
})

const identity = { head: 'f'.repeat(40), tree: 'e'.repeat(40) }, runId = '40000000000'
const component = kind => ({ schemaVersion: 1, kind, sha: 'a541e986c85310b655f290df4a8090de75fb4c6e', runId: '39795298845',
  contentDigest: 'a'.repeat(64), lockDigest: 'b'.repeat(64) })
const receipt = () => ({ status: 'VERIFIED_OFFICIAL_BUILDS', currentHead: identity.head, currentRun: runId,
  sourceHead: component('frontend').sha, sourceRun: '39795298845', components: { frontend: component('frontend'), backend: component('backend') } })

test('official reuse keeps producer identity distinct from the current harness', () => {
  const reuse = validateBuildReuse(receipt(), identity, runId)
  for (const kind of ['frontend', 'backend']) {
    const manifest = component(kind)
    assert.deepEqual(validateBuildManifest(manifest, kind, identity, runId, reuse), manifest)
    assert.notEqual(manifest.sha, identity.head); assert.notEqual(manifest.runId, runId)
  }
})

test('reuse receipt rejects another consumer or unreviewed producer', () => {
  for (const [key, value] of [['currentHead', '0'.repeat(40)], ['currentRun', '1'], ['sourceHead', '0'.repeat(40)],
    ['sourceRun', '1'], ['status', 'PENDING']]) {
    const reuse = receipt(); reuse[key] = value
    assert.throws(() => validateBuildReuse(reuse, identity, runId))
  }
})

test('reuse manifest bytes and current-run mode are fail-closed', () => {
  const reuse = validateBuildReuse(receipt(), identity, runId)
  assert.throws(() => validateBuildManifest({ ...component('frontend'), contentDigest: 'c'.repeat(64) }, 'frontend', identity, runId, reuse))
  assert.throws(() => validateBuildManifest(component('frontend'), 'frontend', identity, runId, null))
  const current = { ...component('frontend'), sha: identity.head, runId }
  assert.deepEqual(validateBuildManifest(current, 'frontend', identity, runId, null), current)
})

test('startup diagnostics return only fixed codes, never raw log content', () => {
  const marker = 'synthetic-do-not-publish-password'
  const codes = classifyStartupLog('CORS_ORIGIN must be one exact HTTP(S) origin\n' + marker + "\ncode: 'MODULE_NOT_FOUND'")
  assert.deepEqual(codes, ['CONFIG_CORS_ORIGIN_INVALID', 'MODULE_NOT_FOUND'])
  assert.equal(JSON.stringify(codes).includes(marker), false)
  assert.deepEqual(classifyStartupLog(marker), [])
})
