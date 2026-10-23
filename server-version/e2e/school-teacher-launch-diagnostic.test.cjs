/* Pure allowlist/dispatch tests: no Playwright, services, DB or browser starts.
 * node --test server-version/e2e/school-teacher-launch-diagnostic.test.cjs
 */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { classifyBrowserLaunchError, browserLaunchEnvironment, browserCliMode, validateLaunchDiagnosticContext } = require('./school-teacher-browser.cjs')

test('sandbox and namespace markers are classified without publishing raw error text', () => {
  const secret = 'synthetic-secret-do-not-publish'
  const result = classifyBrowserLaunchError(new Error('No usable sandbox!\nFailed to move to new namespace: errno = Operation not permitted\n' + secret))
  assert.equal(result.patterns.sandboxUnavailable, true); assert.equal(result.patterns.namespaceDenied, true)
  assert.deepEqual(result.codes, ['SANDBOX_UNAVAILABLE', 'NAMESPACE_DENIED'])
  assert.equal(JSON.stringify(result).includes(secret), false); assert.match(result.errorHash, /^[a-f0-9]{64}$/)
})

test('unknown launch errors retain only a digest and do not become a pass', () => {
  const result = classifyBrowserLaunchError(new Error('synthetic-password=private-value'))
  assert.deepEqual(result.codes, ['UNKNOWN_LAUNCH_FAILURE'])
  assert.ok(Object.values(result.patterns).every(value => value === false))
  assert.equal(result.spawnErrno, null); assert.equal(result.exitCode, null); assert.equal(result.signal, null)
  assert.equal(JSON.stringify(result).includes('private-value'), false)
})

test('AppArmor configuration or advice is not mislabeled as an observed denial', () => {
  assert.equal(classifyBrowserLaunchError('AppArmor restrictions may apply; consult documentation').patterns.appArmorDenied, false)
  assert.equal(classifyBrowserLaunchError('apparmor="DENIED" operation="userns_create"').patterns.appArmorDenied, true)
  assert.equal(classifyBrowserLaunchError('AppArmor denied user namespace creation').patterns.appArmorDenied, true)
})

test('spawn errno, process exit and signal use fixed value allowlists only', () => {
  const result = classifyBrowserLaunchError('spawn /private/path EACCES\nprocess did exit: exitCode=127, signal=SIGABRT\ncredential=never-emit')
  assert.equal(result.spawnErrno, 'EACCES'); assert.equal(result.exitCode, 127); assert.equal(result.signal, 'SIGABRT')
  assert.equal(JSON.stringify(result).includes('/private/path'), false)
  const unknown = classifyBrowserLaunchError('spawn unknown ESECRET\nprocess did exit: exitCode=not-a-number, signal=PRIVATE_SECRET')
  assert.equal(unknown.spawnErrno, null); assert.equal(unknown.exitCode, null); assert.equal(unknown.signal, null)
})

test('missing executable and dependencies remain distinguishable failure markers', () => {
  assert.equal(classifyBrowserLaunchError("Executable doesn't exist at /private/path").patterns.executableMissing, true)
  assert.equal(classifyBrowserLaunchError('error while loading shared libraries: private-lib: cannot open shared object file').patterns.sharedLibraryMissing, true)
  assert.equal(classifyBrowserLaunchError('Host system is missing dependencies to run browsers').patterns.hostDependenciesMissing, true)
  assert.equal(classifyBrowserLaunchError('Target page, context or browser has been closed').patterns.processClosed, true)
})

test('environment evidence includes only selected OS and numeric namespace facts', () => {
  const files = { '/etc/os-release': 'ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="synthetic-secret"\nHOME_URL="https://private.invalid"',
    '/sys/module/apparmor/parameters/enabled': 'Y', '/proc/sys/kernel/apparmor_restrict_unprivileged_userns': '1',
    '/proc/sys/kernel/unprivileged_userns_clone': '1', '/proc/sys/user/max_user_namespaces': '61942' }
  const result = browserLaunchEnvironment(file => files[file], { platform: 'linux', arch: 'x64', version: 'v24.21.0', geteuid: () => 1001 })
  assert.deepEqual(result, { platform: 'linux', architecture: 'x64', nodeVersion: 'v24.21.0', effectiveUid: 1001,
    osId: 'ubuntu', osVersion: '24.04', appArmorEnabled: true, restrictUnprivilegedUserNamespaces: 1,
    unprivilegedUserNamespacesEnabled: 1, maxUserNamespaces: 61942 })
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false)
})

test('unavailable or malformed read-only environment facts are unknown, not invented', () => {
  const result = browserLaunchEnvironment(() => { throw new Error('private-path-denied') }, { platform: 'unrecognized', arch: 'other', version: 'private-version' })
  for (const key of ['effectiveUid', 'osId', 'osVersion', 'appArmorEnabled', 'restrictUnprivilegedUserNamespaces', 'unprivilegedUserNamespacesEnabled', 'maxUserNamespaces', 'nodeVersion']) assert.equal(result[key], null)
  assert.equal(JSON.stringify(result).includes('private'), false)
  const malformed = browserLaunchEnvironment(() => 'not-a-number-or-approved-OS-field', { platform: 'linux', arch: 'x64', version: 'v24.21.0' })
  assert.equal(malformed.maxUserNamespaces, null)
})

test('diagnostic CLI is exact and unknown flags never fall through to the journey', () => {
  assert.equal(browserCliMode([]), 'journey')
  assert.equal(browserCliMode(['--launch-diagnostic']), 'launch-diagnostic')
  for (const args of [['launch-probe'], ['--unknown'], ['--launch-diagnostic', 'extra']]) assert.throws(() => browserCliMode(args))
})

test('standalone diagnostic context rejects missing deletion state and wrong Actions scope', () => {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'caohuibj/eduK12-new-version',
    GITHUB_REF: 'refs/heads/ci/school-teacher-browser-20261022', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '40000000000' }
  assert.doesNotThrow(() => validateLaunchDiagnosticContext(env, { deleted: false }))
  for (const event of [{}, { deleted: true }, { deleted: 'false' }]) assert.throws(() => validateLaunchDiagnosticContext(env, event))
  for (const [key, value] of [['CI', 'false'], ['GITHUB_ACTIONS', 'false'], ['GITHUB_REPOSITORY', 'other/repo'],
    ['GITHUB_REF', 'refs/heads/main'], ['GITHUB_EVENT_NAME', 'pull_request'], ['GITHUB_RUN_ID', 'not-a-run']]) {
    assert.throws(() => validateLaunchDiagnosticContext({ ...env, [key]: value }, { deleted: false }))
  }
})
