/* Pure injected objects only: never runs chmod, sudo, Git, dpkg or a browser. */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { tightenChromePermissions } = require('./school-teacher-chrome-permissions.cjs')
const ROOT = '/opt/google/chrome', REPO = '/synthetic/repo', HEAD = 'a'.repeat(40)
const MD5 = '/var/lib/dpkg/info/google-chrome-stable.md5sums', LIST = MD5.replace('.md5sums', '.list')
const md5 = b => createHash('md5').update(b).digest('hex')
function fixture() {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
    ImageOS: 'ubuntu24', GITHUB_REPOSITORY: 'caohuibj/eduK12-new-version', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/338/merge',
    GITHUB_HEAD_REF: 'work/school-teacher-review-20261022', SCHOOL_TEACHER_CHROME_TIGHTEN: 'confirmed-temporary-runner',
    GITHUB_SHA: HEAD, GITHUB_RUN_ID: '40000000001', GITHUB_WORKSPACE: REPO }
  const items = new Map(), calls = [], state = { sudoError: false, incorrectMode: false, afterChange: null }
  let ino = 1
  function add(file, kind, mode, contents = Buffer.from('synthetic:' + file)) {
    items.set(file, { kind, dev: 1, ino: ino++, uid: 0, gid: 0, mode: (kind === 'directory' ? 0o40000 : 0o100000) | mode,
      nlink: kind === 'directory' ? 2 : 1, contents, size: kind === 'directory' ? 4096 : contents.length })
  }
  for (const d of ['/', '/usr', '/usr/bin', '/var', '/var/lib', '/var/lib/dpkg', '/var/lib/dpkg/info']) add(d, 'directory', 0o755)
  for (const p of ['/usr/bin/git', '/usr/bin/dpkg-query', '/usr/bin/sudo', '/usr/bin/chmod']) add(p, 'file', p.endsWith('/sudo') ? 0o4755 : 0o755)
  for (const d of ['/opt', '/opt/google', ROOT, ROOT + '/locales']) add(d, 'directory', 0o777)
  for (const p of [ROOT + '/chrome', ROOT + '/chrome-sandbox', ROOT + '/google-chrome', ROOT + '/locales/zh-CN.pak'])
    add(p, 'file', p.endsWith('chrome-sandbox') ? 0o4777 : 0o777)
  add('/opt/unrelated-tool', 'file', 0o777)
  add('/usr/bin/google-chrome-stable', 'symlink', 0o777); items.get('/usr/bin/google-chrome-stable').redirect = ROOT + '/google-chrome'
  const tracked = [...items.keys()].filter(p => p === '/opt' || p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/'))
  add('/usr/share/doc/google-chrome-stable/copyright', 'file', 0o777)
  const outside = '/usr/share/doc/google-chrome-stable/copyright'
  const list = '/.\n/etc/cron.daily/google-chrome\n/usr/bin/google-chrome-stable\n' + outside + '\n' + tracked.join('\n') + '\n'
  const hashes = [...tracked, outside].filter(p => items.get(p).kind === 'file').map(p => md5(items.get(p).contents) + '  ' + p.slice(1)).join('\n') + '\n'
  add(LIST, 'file', 0o644, Buffer.from(list)); add(MD5, 'file', 0o644, Buffer.from(hashes))
  const fs = {
    lstatSync(file) {
      const row = items.get(file); if (!row) throw Object.assign(new Error('synthetic private exception'), { code: 'ENOENT' })
      return { ...row, isDirectory: () => row.kind === 'directory', isFile: () => row.kind === 'file', isSymbolicLink: () => row.kind === 'symlink' }
    },
    realpathSync(file) { const row = items.get(file); return row?.redirect || file },
    readlinkSync(file) { return items.get(file).redirect },
    readFileSync(file, encoding) { const b = items.get(file).contents; return encoding ? b.toString(encoding) : Buffer.from(b) },
    readdirSync(file) { return [...items.keys()].filter(p => p.startsWith(file + '/') && !p.slice(file.length + 1).includes('/')).map(p => p.slice(file.length + 1)) },
  }
  const process = { platform: 'linux', arch: 'x64', getuid: () => 1001, geteuid: () => 1001 }
  const spawnSync = (command, args, options) => {
    calls.push({ command, args, options })
    if (command === '/usr/bin/git') return { status: 0, stdout: args[0] === 'rev-parse' ? HEAD + '\n' : '' }
    if (command === '/usr/bin/dpkg-query') return { status: 0, stdout: args[0] === '-W'
      ? 'google-chrome-stable\tinstall ok installed\tamd64\t155.0.8059.39-1\n' : MD5 + '\n' }
    assert.equal(command, '/usr/bin/sudo'); assert.deepEqual(args.slice(0, 4), ['-n', '/usr/bin/chmod', 'go-w', '--'])
    assert.equal(args.length, 5)
    if (state.sudoError) return { status: 1, stderr: 'synthetic private exception' }
    const row = items.get(args[4]); row.mode = state.incorrectMode ? (row.mode & ~0o022) | 0o2000 : row.mode & ~0o022
    state.afterChange?.(args[4]); return { status: 0, stdout: '' }
  }
  return { items, env, calls, state, process, add, run: () => tightenChromePermissions({ repo: REPO, env, deps: { fs, spawnSync, process } }) }
}
const mutations = f => f.calls.filter(c => c.command === '/usr/bin/sudo')
test('PR382 explicit confirmation tightens only observed root opt and rejects every wider or mixed approval', () => {
  const setup = () => {
    const f = fixture(); f.env.GITHUB_REF = 'refs/pull/382/merge'; f.env.GITHUB_HEAD_REF = 'release/education-self-scale-form-20261028'
    f.env.SCHOOL_TEACHER_CHROME_TIGHTEN = 'confirmed-self-opt-only'
    for (const [p, row] of f.items) if (p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/')) row.mode &= ~0o022
    return f
  }
  const good = setup(), result = good.run(); assert.equal(result.status, 'PERMISSIONS_TIGHTENED')
  assert.deepEqual(result.selfScopeInspection, { opt: { uid: 0, gid: 0, permissionMode: 0o777 }, unexpectedWritableCount: 0, unexpectedWritable: [], truncated: false })
  assert.deepEqual(mutations(good).map(c => c.args), [['-n', '/usr/bin/chmod', 'go-w', '--', '/opt']])
  assert.equal(good.items.get('/opt').mode & 0o7777, 0o755)
  const already = setup(); already.items.get('/opt').mode &= ~0o022
  assert.equal(already.run().status, 'PERMISSIONS_TIGHTENED'); assert.equal(mutations(already).length, 0)
  for (const alter of [f => { f.env.SCHOOL_TEACHER_CHROME_TIGHTEN = 'confirmed-temporary-runner' },
    f => { f.env.GITHUB_REF = 'refs/pull/338/merge' }, f => { f.env.GITHUB_HEAD_REF = 'work/school-teacher-review-20261022' },
    f => { f.items.get(ROOT + '/chrome').mode |= 0o022 }, f => { f.items.get('/opt/google').mode |= 0o022 },
    f => { f.items.get('/opt').gid = 1001 }, f => { f.items.get('/opt').mode = 0o40775 }]) {
    const f = setup(); alter(f); assert.equal(f.run().status, 'FAILED'); assert.equal(mutations(f).length, 0)
  }
})
test('PR382 read-only diagnostics name only verified scope mismatches before any permission command', () => {
  const f = fixture(); f.env.GITHUB_REF = 'refs/pull/382/merge'; f.env.GITHUB_HEAD_REF = 'release/education-self-scale-form-20261028'
  f.env.SCHOOL_TEACHER_CHROME_TIGHTEN = 'confirmed-self-opt-only'
  for (const [p, row] of f.items) if (p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/')) row.mode &= ~0o022
  f.items.get(ROOT + '/chrome').mode |= 0o022
  const r = f.run(); assert.equal(r.code, 'SELF_UNOBSERVED_WRITABLE_RUNTIME_PATH'); assert.equal(r.permissionChangeAttempted, false); assert.equal(mutations(f).length, 0)
  assert.deepEqual(r.selfScopeInspection, { opt: { uid: 0, gid: 0, permissionMode: 0o777 }, unexpectedWritableCount: 1,
    unexpectedWritable: [{ path: ROOT + '/chrome', uid: 0, gid: 0, permissionMode: 0o777 }], truncated: false })
  assert.equal(JSON.stringify(r).includes('synthetic private exception'), false)
})
const packageScopeFixture = () => {
  const f = fixture(); f.env.GITHUB_REF = 'refs/pull/382/merge'; f.env.GITHUB_HEAD_REF = 'release/education-self-scale-form-20261028'
  f.env.SCHOOL_TEACHER_CHROME_TIGHTEN = 'confirmed-self-package-scope'
  // The observed runner helper has no setuid bit. Tightening must not add it.
  f.items.get(ROOT + '/chrome-sandbox').mode &= ~0o4000
  return f
}
test('PR382 current package approval removes only go write on verified entries and never adds sandbox privilege', () => {
  const f = packageScopeFixture(), before = new Map([...f.items].map(([p, row]) => [p, { ...row }]))
  const result = f.run(); assert.equal(result.status, 'PERMISSIONS_TIGHTENED')
  assert.equal(result.authorizationScope, 'PR382_VERIFIED_CHROME_PACKAGE_GO_WRITE'); assert.equal(result.environmentOnly, false)
  assert.equal(result.acceptance, false); assert.equal(result.browserLaunched, false); assert.equal(mutations(f).length, 8)
  for (const call of mutations(f)) {
    const p = call.args[4]; assert(p === '/opt' || p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/'))
    assert.equal(f.items.get(p).mode, before.get(p).mode & ~0o022)
    for (const key of ['uid', 'gid', 'ino', 'dev', 'nlink', 'size']) assert.equal(f.items.get(p)[key], before.get(p)[key])
    assert.deepEqual(f.items.get(p).contents, before.get(p).contents)
  }
  assert.equal(f.items.get(ROOT + '/chrome-sandbox').mode & 0o4000, 0)
  for (const p of ['/opt/unrelated-tool', '/usr/bin/google-chrome-stable', '/usr/share/doc/google-chrome-stable/copyright'])
    assert.equal(f.items.get(p).mode, before.get(p).mode)
  for (const alter of [f => { f.items.get(ROOT + '/chrome').contents[0] ^= 1 }, f => { f.items.get('/opt/google').gid = 1001 },
    f => { f.items.get(ROOT + '/chrome').kind = 'symlink' }, f => f.add(ROOT + '/untracked', 'file', 0o777)]) {
    const bad = packageScopeFixture(); alter(bad); assert.equal(bad.run().status, 'FAILED'); assert.equal(mutations(bad).length, 0)
  }
})
test('PR382 environment precheck uses its actual dedicated push context and rejects other events branches and identities', () => {
  const setup = () => {
    const f = packageScopeFixture(); f.env.GITHUB_EVENT_NAME = 'push'; delete f.env.GITHUB_HEAD_REF
    f.env.GITHUB_REF = 'refs/heads/ci/pr382-chrome-environment-20261029'; return f
  }
  const result = setup().run(); assert.equal(result.status, 'PERMISSIONS_TIGHTENED'); assert.equal(result.environmentOnly, true)
  for (const alter of [f => { f.env.GITHUB_REF = 'refs/heads/main' }, f => { f.env.GITHUB_REF = 'refs/heads/ci/pr382-chrome-readonly-20261029' },
    f => { f.env.GITHUB_EVENT_NAME = 'pull_request' }, f => { f.env.GITHUB_EVENT_NAME = 'workflow_dispatch' },
    f => { f.env.GITHUB_REPOSITORY = 'other/repo' }, f => { f.env.RUNNER_ENVIRONMENT = 'self-hosted' },
    f => { f.env.SCHOOL_TEACHER_CHROME_TIGHTEN = 'confirmed-self-opt-only' }, f => { f.env.LD_PRELOAD = 'synthetic secret' },
    f => { f.env.GITHUB_SHA = 'b'.repeat(40) }, f => { f.process.getuid = () => 0 }]) {
    const f = setup(); alter(f); assert.equal(f.run().status, 'FAILED'); assert.equal(mutations(f).length, 0)
  }
  const wrongEvent = packageScopeFixture(); wrongEvent.env.GITHUB_EVENT_NAME = 'push'
  assert.equal(wrongEvent.run().status, 'FAILED'); assert.equal(mutations(wrongEvent).length, 0)
})
test('PR382 workflow calls only the guarded existing helper immediately before unchanged strict Chrome preflight', () => {
  const workflow = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../.github/workflows/ci-school-teacher.yml'), 'utf8')
  const job = workflow.split('  browser-self:\n')[1].split('\n  security:')[0]
  const start = job.indexOf('    - name: tighten only the confirmed PR382 verified Chrome package write bits'), end = job.indexOf('    - name: inspect this runner Chrome, no automatic install or fallback')
  assert(start > job.indexOf('school-teacher-checks.mjs fonts') && end > start)
  const step = job.slice(start, end)
  for (const text of ["github.repository == 'caohuibj/eduK12-new-version'", "github.event_name == 'pull_request'", 'github.event.pull_request.number == 382',
    "github.event.pull_request.head.ref == 'release/education-self-scale-form-20261028'", 'github.event.pull_request.head.repo.full_name == github.repository',
    "fromJSON(inputs.plan).candidate == 'education-self'", 'SCHOOL_TEACHER_CHROME_TIGHTEN: confirmed-self-package-scope', 'school-teacher-chrome-permissions.cjs tighten']) assert(step.includes(text))
  assert(!/sudo|chmod|chown|sysctl|no-sandbox|continue-on-error/.test(step)); assert.equal(job.split('SCHOOL_TEACHER_CHROME_TIGHTEN').length - 1, 1)
  assert.equal(workflow.split('SCHOOL_TEACHER_CHROME_TIGHTEN: confirmed-self-package-scope').length - 1, 1)
  assert.equal(workflow.split('SCHOOL_TEACHER_CHROME_TIGHTEN: confirmed-temporary-runner').length - 1, 1)
})
test('only approved parents and verified Chrome package entries lose go write with all other bits preserved', () => {
  const f = fixture(), before = new Map([...f.items].map(([p, r]) => [p, { ...r }]))
  const r = f.run(); assert.equal(r.status, 'PERMISSIONS_TIGHTENED'); assert.equal(r.acceptance, false); assert.equal(r.browserLaunched, false)
  assert.match(r.consistencyScope, /not cryptographic/); assert.equal(mutations(f).length, 8)
  for (const call of mutations(f)) {
    const p = call.args[4]; assert.ok(p === '/opt' || p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/'))
    assert.equal(f.items.get(p).mode, before.get(p).mode & ~0o022)
    for (const key of ['uid', 'gid', 'ino', 'dev']) assert.equal(f.items.get(p)[key], before.get(p)[key])
  }
  assert.equal(f.items.get(ROOT + '/chrome-sandbox').mode & 0o4000, 0o4000)
  assert.equal(f.items.get('/opt/unrelated-tool').mode, before.get('/opt/unrelated-tool').mode)
  for (const p of ['/usr/bin/google-chrome-stable', '/usr/share/doc/google-chrome-stable/copyright'])
    assert.equal(f.items.get(p).mode, before.get(p).mode)
  const presentCron = fixture(); presentCron.add('/etc/cron.daily/google-chrome', 'symlink', 0o777)
  presentCron.items.get('/etc/cron.daily/google-chrome').redirect = ROOT + '/cron/google-chrome'
  assert.equal(presentCron.run().status, 'PERMISSIONS_TIGHTENED')
  assert.equal(mutations(presentCron).some(c => c.args[4] === '/etc/cron.daily/google-chrome'), false)
})
test('wrong CI approval repository PR identity root user or loader override stops before permission actions', () => {
  for (const change of [f => delete f.env.SCHOOL_TEACHER_CHROME_TIGHTEN, f => { f.env.GITHUB_REF = 'refs/pull/339/merge' },
    f => { f.env.GITHUB_REPOSITORY = 'other/repo' }, f => { f.env.RUNNER_ENVIRONMENT = 'self-hosted' },
    f => { f.env.GITHUB_SHA = 'b'.repeat(40) }, f => { f.env.LD_PRELOAD = 'synthetic secret' },
    f => { f.process.getuid = () => 0 }, f => { f.env.GITHUB_WORKSPACE = '/other' }]) {
    const f = fixture(); change(f); const r = f.run(); assert.equal(r.status, 'FAILED'); assert.equal(mutations(f).length, 0)
  }
})
test('changed bytes malformed or duplicate manifests and missing recorded runtime entries never mutate', () => {
  for (const change of [f => { f.items.get(ROOT + '/chrome').contents[0] ^= 1 },
    f => { f.items.get(MD5).contents = Buffer.from('bad\n') },
    f => { f.items.get(LIST).contents = Buffer.from(f.items.get(LIST).contents.toString() + ROOT + '\n') },
    f => { f.items.get(LIST).contents = Buffer.from(f.items.get(LIST).contents.toString() + '/opt/google/chrome/../escape\n') },
    f => { f.items.delete(ROOT + '/locales/zh-CN.pak') },
    f => { f.items.get('/usr/share/doc/google-chrome-stable/copyright').contents[0] ^= 1 },
    f => { f.items.delete('/usr/share/doc/google-chrome-stable/copyright') }]) {
    const f = fixture(); change(f); const r = f.run(); assert.equal(r.status, 'FAILED'); assert.equal(mutations(f).length, 0)
  }
})
test('symlinks nonroot files hardlinks special files and unexpected runtime additions stop without following paths', () => {
  for (const change of [f => { f.items.get(ROOT + '/chrome').kind = 'symlink' }, f => { f.items.get('/opt').kind = 'symlink' },
    f => { f.items.get(ROOT + '/chrome').uid = 1001 }, f => { f.items.get(ROOT + '/chrome').nlink = 2 },
    f => { f.items.get(ROOT + '/chrome').kind = 'fifo' }, f => f.add(ROOT + '/untracked', 'file', 0o777),
    f => { f.items.get('/usr/bin/google-chrome-stable').redirect = '/untrusted/target' },
    f => { f.items.get('/var/lib/dpkg/info').mode |= 0o022 }, f => { f.items.get('/usr/bin/chmod').mode |= 0o022 }]) {
    const f = fixture(); change(f); const r = f.run(); assert.equal(r.status, 'FAILED'); assert.equal(mutations(f).length, 0)
  }
})
test('a failed command or wrong post-mode stops and reports uncertain partial mutation without rollback', () => {
  for (const key of ['sudoError', 'incorrectMode']) {
    const f = fixture(); f.state[key] = true; const r = f.run()
    assert.equal(r.status, 'FAILED'); assert.equal(r.permissionChangeAttempted, true)
    assert.equal(r.outcome, 'PARTIAL_OR_UNCERTAIN_STOPPED'); assert.equal(mutations(f).length, 1)
    assert.equal(JSON.stringify(r).includes('synthetic private exception'), false)
  }
})
test('final rewalk catches added files and byte changes and already-tight entries perform no chmod', () => {
  for (const action of [f => f.add(ROOT + '/new-after-check', 'file', 0o777), f => { f.items.get(ROOT + '/chrome').contents[0] ^= 1 }]) {
    const f = fixture(); let once = false
    f.state.afterChange = () => { if (!once) { once = true; action(f) } }
    assert.equal(f.run().status, 'FAILED')
  }
  const f = fixture(); for (const [p, row] of f.items) if (p === '/opt' || p === '/opt/google' || p === ROOT || p.startsWith(ROOT + '/')) row.mode &= ~0o022
  assert.equal(f.run().status, 'PERMISSIONS_TIGHTENED'); assert.equal(mutations(f).length, 0)
})

// New exact regression only; earlier six tests are unchanged.
test('official stable manpage alias is read-only and requires exact relative target with verified package bytes', () => {
  const alias = '/usr/share/man/man1/google-chrome.1.gz', target = '/usr/share/man/man1/google-chrome-stable.1.gz'
  const setup = () => {
    const f = fixture(); f.add(alias, 'symlink', 0o777); f.items.get(alias).redirect = 'google-chrome-stable.1.gz'
    f.add(target, 'file', 0o777)
    const list = f.items.get(LIST), hashes = f.items.get(MD5)
    list.contents = Buffer.from(list.contents.toString() + alias + '\n' + target + '\n'); list.size = list.contents.length
    hashes.contents = Buffer.from(hashes.contents.toString() + md5(f.items.get(target).contents) + '  ' + target.slice(1) + '\n'); hashes.size = hashes.contents.length
    return f
  }
  const good = setup(), before = [good.items.get(alias).mode, good.items.get(target).mode]
  assert.equal(good.run().status, 'PERMISSIONS_TIGHTENED')
  assert.deepEqual([good.items.get(alias).mode, good.items.get(target).mode], before)
  assert.equal(mutations(good).some(c => [alias, target].includes(c.args[4])), false)
  for (const alter of [f => { f.items.get(alias).redirect = '/etc/alternatives/google-chrome' },
    f => { f.items.get(alias).uid = 1001 }, f => { f.items.get(target).uid = 1001 },
    f => { f.items.get(target).kind = 'symlink' }, f => { f.items.get(target).kind = 'directory' }, f => { f.items.get(target).contents[0] ^= 1 },
    f => { f.items.delete(target) }, f => { f.items.get(LIST).contents = Buffer.from(f.items.get(LIST).contents.toString().replace(target + '\n', '')) },
    f => { f.items.get(MD5).contents = Buffer.from(f.items.get(MD5).contents.toString().split('\n').filter(line => !line.endsWith(target.slice(1))).join('\n')) }]) {
    const bad = setup(); alter(bad); const report = bad.run()
    assert.equal(report.status, 'FAILED'); assert.equal(report.permissionChangeAttempted, false); assert.equal(mutations(bad).length, 0)
  }
  const unexpected = setup(); unexpected.items.get(alias).redirect = '/private/unexpected-target'
  const report = unexpected.run()
  assert.deepEqual(report.pathFacts, { uid: 0, gid: 0, permissionMode: 0o777, type: 'SYMLINK', expectedRelativeTargetMatches: false, targetListed: true, targetHashRecorded: true })
  assert.equal(JSON.stringify(report).includes('/private/unexpected-target'), false)
})
