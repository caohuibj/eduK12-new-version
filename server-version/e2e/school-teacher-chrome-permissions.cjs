/* One explicitly approved tightening on this candidate's temporary hosted CI.
 * Installed dpkg MD5 records establish package consistency, NOT cryptographic
 * publisher authentication. No install, chown, added privilege, sandbox change,
 * recursive chmod or symlink traversal. The strict preflight is still required.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { parseChromePackage, trustedExecutable, CHROME_BINARY, CHROME_SANDBOX } = require('./school-teacher-chrome.cjs')
const ROOT = '/opt/google/chrome', PARENTS = ['/opt', '/opt/google']
const hash = (kind, data) => createHash(kind).update(data).digest('hex')
const check = (condition, code, target) => { if (!condition) throw Object.assign(new Error(code), { safeCode: code, target }) }
const inChrome = file => file === ROOT || file.startsWith(ROOT + '/')
const safePath = file => typeof file === 'string' && file.startsWith('/') && file.length < 512 &&
  /^[A-Za-z0-9_./+ -]+$/.test(file) && path.posix.normalize(file) === file && !file.endsWith('/')
const sameStat = (a, b) => ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size'].every(k => a[k] === b[k])
const snapshot = s => Object.fromEntries(['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size'].map(k => [k, s[k]]))
function trustedPath(io, file, executable = false) {
  const s = io.lstatSync(file)
  check(!s.isSymbolicLink() && io.realpathSync(file) === file && s.uid === 0 && (s.mode & 0o022) === 0,
    'SYSTEM_RECORD_OR_TOOL_UNTRUSTED')
  check(executable ? trustedExecutable(s) : s.isDirectory(), 'SYSTEM_RECORD_OR_TOOL_TYPE_INVALID')
}
function metadata(io, file) {
  const s = io.lstatSync(file)
  check(s.isFile() && !s.isSymbolicLink() && s.uid === 0 && s.nlink === 1 && (s.mode & 0o022) === 0 &&
    s.size > 0 && s.size <= 1024 * 1024 && io.realpathSync(file) === file, 'PACKAGE_RECORD_UNTRUSTED')
  return io.readFileSync(file, 'utf8')
}
function inspectInstallation(io, query) {
  for (const d of ['/', '/usr', '/usr/bin', '/var', '/var/lib', '/var/lib/dpkg', '/var/lib/dpkg/info']) trustedPath(io, d)
  for (const p of ['/usr/bin/dpkg-query', '/usr/bin/sudo', '/usr/bin/chmod']) trustedPath(io, p, true)
  const pkg = parseChromePackage(query('/usr/bin/dpkg-query', ['-W', '-f=${binary:Package}\t${Status}\t${Architecture}\t${Version}\n', 'google-chrome-stable']))
  check(pkg, 'PACKAGE_IDENTITY_INVALID')
  const md5Path = query('/usr/bin/dpkg-query', ['--control-path', 'google-chrome-stable', 'md5sums']).trim()
  check(['/var/lib/dpkg/info/google-chrome-stable.md5sums', '/var/lib/dpkg/info/google-chrome-stable:amd64.md5sums'].includes(md5Path), 'PACKAGE_RECORD_PATH_INVALID')
  const listText = metadata(io, md5Path.replace(/\.md5sums$/, '.list')), md5Text = metadata(io, md5Path)
  const listed = new Set(), hashes = new Map()
  for (let file of listText.trimEnd().split('\n')) {
    if (file === '/.') file = '/'
    check(file === '/' || safePath(file), 'PACKAGE_LIST_INVALID')
    check(!listed.has(file), 'PACKAGE_LIST_DUPLICATE'); listed.add(file)
  }
  for (const line of md5Text.trimEnd().split('\n')) {
    const match = /^([a-f0-9]{32})  ([A-Za-z0-9_./+ -]+)$/.exec(line)
    check(match && !match[2].startsWith('/'), 'PACKAGE_HASH_RECORD_INVALID')
    const file = '/' + match[2]
    check(safePath(file) && !hashes.has(file), 'PACKAGE_HASH_RECORD_INVALID')
    hashes.set(file, match[1])
  }
  check(listed.has(ROOT) && listed.has(CHROME_BINARY) && listed.has(CHROME_SANDBOX) &&
    listed.has(ROOT + '/google-chrome'), 'PACKAGE_RUNTIME_INCOMPLETE')
  // These package links are outside the mutation scope. Read their literal
  // targets only; the official runner removes the cron link after installation:
  // https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/scripts/build/install-google-chrome.sh#L36-L38
  for (const [file, target] of [['/usr/bin/google-chrome-stable', ROOT + '/google-chrome'],
    ['/etc/cron.daily/google-chrome', ROOT + '/cron/google-chrome']]) {
    if (!listed.has(file)) continue
    let s
    try { s = io.lstatSync(file) } catch (error) {
      if (file === '/etc/cron.daily/google-chrome' && error.code === 'ENOENT') continue
      throw error
    }
    check(s.uid === 0 && s.isSymbolicLink() && io.readlinkSync(file) === target, 'OUTSIDE_PACKAGE_LINK_UNEXPECTED')
  }
  // Other installed package paths are checked read-only, never admitted to
  // the chmod list. Only the documented removed cron path may be absent.
  for (const file of listed) {
    if (inChrome(file) || PARENTS.includes(file) || ['/usr/bin/google-chrome-stable', '/etc/cron.daily/google-chrome'].includes(file)) continue
    const s = io.lstatSync(file)
    check(s.uid === 0 && !s.isSymbolicLink() && io.realpathSync(file) === file && (s.isDirectory() || s.isFile()), 'OUTSIDE_PACKAGE_PATH_UNEXPECTED', file)
    if (s.isFile()) {
      check(hashes.has(file) && s.size > 0 && s.size <= 512 * 1024 * 1024, 'OUTSIDE_PACKAGE_FILE_RECORD_INVALID', file)
      check(hash('md5', io.readFileSync(file)) === hashes.get(file), 'OUTSIDE_PACKAGE_BYTES_MISMATCH', file)
    }
  }
  const entries = [], actual = new Set()
  function inspect(file, parentOnly = false) {
    check(parentOnly ? PARENTS.includes(file) : inChrome(file) && listed.has(file), 'UNLISTED_RUNTIME_PATH')
    const s = io.lstatSync(file)
    check(!s.isSymbolicLink() && io.realpathSync(file) === file && s.uid === 0 &&
      (s.isDirectory() || s.isFile()), 'RUNTIME_PATH_UNTRUSTED')
    check(Number.isSafeInteger(s.mode) && s.mode >= 0, 'INVALID_RUNTIME_MODE')
    if (parentOnly) check(s.isDirectory(), 'PARENT_NOT_DIRECTORY')
    const item = { path: file, kind: s.isDirectory() ? 'directory' : 'file', stat: snapshot(s) }
    if (s.isFile()) {
      check(s.nlink === 1 && s.size > 0 && s.size <= 512 * 1024 * 1024 && hashes.has(file), 'RUNTIME_FILE_RECORD_INVALID')
      const bytes = io.readFileSync(file)
      check(Buffer.isBuffer(bytes) && bytes.length === s.size && hash('md5', bytes) === hashes.get(file), 'PACKAGE_BYTES_MISMATCH', file)
      check(sameStat(snapshot(s), snapshot(io.lstatSync(file))), 'RUNTIME_CHANGED_DURING_READ')
      item.sha256 = hash('sha256', bytes)
    }
    entries.push(item); actual.add(file)
    check(entries.length <= 2048, 'RUNTIME_INVENTORY_TOO_LARGE')
    if (!parentOnly && s.isDirectory()) for (const name of io.readdirSync(file).sort()) {
      check(typeof name === 'string' && name !== '.' && name !== '..' && !name.includes('/') && safePath(file + '/' + name), 'RUNTIME_NAME_INVALID')
      inspect(file + '/' + name)
    }
  }
  for (const p of PARENTS) inspect(p, true)
  inspect(ROOT)
  check([...listed].filter(inChrome).every(p => actual.has(p)) && [...hashes.keys()].filter(inChrome).every(p => actual.has(p)), 'MISSING_PACKAGE_RUNTIME_PATH')
  return { package: pkg, entries, recordsDigest: hash('sha256', listText + '\0' + md5Text), md5Path }
}
function tightenChromePermissions({ repo = path.resolve(__dirname, '../..'), env = process.env, deps = {} } = {}) {
  const io = deps.fs || fs, run = deps.spawnSync || spawnSync, facts = deps.process || process
  const report = { schemaVersion: 1, scope: 'approved-temporary-runner-chrome-permissions', acceptance: false,
    browserLaunched: false, status: 'FAILED', permissionChangeAttempted: false, completedChanges: 0, changes: [] }
  let stage = 'CI_CONTEXT'
  const query = (program, args) => {
    const r = run(program, args, { cwd: repo, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } })
    check(r && !r.error && !r.signal && r.status === 0 && typeof r.stdout === 'string', 'SYSTEM_QUERY_FAILED')
    return r.stdout
  }
  try {
    check(env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted' &&
      env.RUNNER_OS === 'Linux' && env.RUNNER_ARCH === 'X64' && env.ImageOS === 'ubuntu24' &&
      env.GITHUB_REPOSITORY === 'caohuibj/eduK12-new-version' && env.GITHUB_EVENT_NAME === 'pull_request' &&
      env.GITHUB_REF === 'refs/pull/338/merge' && env.GITHUB_HEAD_REF === 'work/school-teacher-review-20261022' &&
      env.SCHOOL_TEACHER_CHROME_TIGHTEN === 'confirmed-temporary-runner', 'UNAPPROVED_CI_CONTEXT')
    check(facts.platform === 'linux' && facts.arch === 'x64' && Number.isSafeInteger(facts.getuid?.()) &&
      facts.getuid() > 0 && facts.geteuid?.() === facts.getuid(), 'NONROOT_RUNNER_REQUIRED')
    check(!['CHROME_DEVEL_SANDBOX', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NODE_OPTIONS', 'NODE_PATH'].some(k => env[k]), 'EXECUTION_OVERRIDE_PRESENT')
    check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || ''), 'CI_IDENTITY_INVALID')
    check(typeof env.GITHUB_WORKSPACE === 'string' && path.isAbsolute(env.GITHUB_WORKSPACE) &&
      io.realpathSync(repo) === io.realpathSync(env.GITHUB_WORKSPACE), 'CI_WORKSPACE_MISMATCH')
    trustedPath(io, '/'); trustedPath(io, '/usr'); trustedPath(io, '/usr/bin'); trustedPath(io, '/usr/bin/git', true)
    check(query('/usr/bin/git', ['rev-parse', 'HEAD']).trim() === env.GITHUB_SHA &&
      query('/usr/bin/git', ['diff', '--name-only', 'HEAD', '--', 'server-version/e2e', '.github']).trim() === '', 'CI_CHECKOUT_MISMATCH')
    report.source = { head: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID }
    stage = 'PACKAGE_CONSISTENCY'
    const before = inspectInstallation(io, query)
    report.package = before.package; report.packageConsistency = 'LOCAL_DPKG_MD5_BYTES_MATCH'
    report.consistencyScope = 'Installed package records, not cryptographic publisher authentication'
    report.recordsDigest = before.recordsDigest; report.checkedEntries = before.entries.length
    const ordered = before.entries.slice().sort((a, b) => Number(a.kind === 'file') - Number(b.kind === 'file') || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
    stage = 'REMOVE_GROUP_OTHER_WRITE'
    check(JSON.stringify(parseChromePackage(query('/usr/bin/dpkg-query', ['-W', '-f=${binary:Package}\t${Status}\t${Architecture}\t${Version}\n', 'google-chrome-stable']))) === JSON.stringify(before.package) &&
      hash('sha256', metadata(io, before.md5Path.replace(/\.md5sums$/, '.list')) + '\0' + metadata(io, before.md5Path)) === before.recordsDigest, 'PACKAGE_CHANGED_BEFORE_TIGHTEN')
    for (const entry of ordered) {
      check(sameStat(entry.stat, snapshot(io.lstatSync(entry.path))) && io.realpathSync(entry.path) === entry.path, 'RUNTIME_CHANGED_BEFORE_TIGHTEN')
      if ((entry.stat.mode & 0o022) === 0) continue
      report.permissionChangeAttempted = true
      const r = run('/usr/bin/sudo', ['-n', '/usr/bin/chmod', 'go-w', '--', entry.path], { cwd: repo,
        encoding: 'utf8', timeout: 10000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' } })
      check(r && !r.error && !r.signal && r.status === 0, 'TIGHTEN_COMMAND_FAILED')
      const expected = { ...entry.stat, mode: entry.stat.mode & ~0o022 }, current = snapshot(io.lstatSync(entry.path))
      check(sameStat(expected, current) && io.realpathSync(entry.path) === entry.path, 'TIGHTEN_POSTCONDITION_FAILED')
      report.completedChanges++
      report.changes.push({ path: entry.path, uid: entry.stat.uid, gid: entry.stat.gid,
        beforeMode: entry.stat.mode & 0o7777, afterMode: current.mode & 0o7777 })
    }
    stage = 'FINAL_CONSISTENCY'
    const after = inspectInstallation(io, query)
    check(JSON.stringify(before.package) === JSON.stringify(after.package) && before.recordsDigest === after.recordsDigest &&
      before.entries.length === after.entries.length, 'PACKAGE_CHANGED_AFTER_TIGHTEN')
    for (const old of before.entries) {
      const fresh = after.entries.find(e => e.path === old.path)
      check(fresh && old.kind === fresh.kind && old.sha256 === fresh.sha256 &&
        sameStat({ ...old.stat, mode: old.stat.mode & ~0o022 }, fresh.stat), 'RUNTIME_CHANGED_AFTER_TIGHTEN')
    }
    report.status = 'PERMISSIONS_TIGHTENED'; report.code = 'CHROME_PERMISSIONS_VERIFIED'
  } catch (error) {
    report.stage = stage; report.code = error.safeCode || 'READ_OR_SYSTEM_OPERATION_FAILED'
    if (typeof error.target === 'string' && safePath(error.target)) report.target = error.target
    report.outcome = report.permissionChangeAttempted ? 'PARTIAL_OR_UNCERTAIN_STOPPED' : 'NO_PERMISSION_CHANGE'
    report.errorDigest = hash('sha256', String(error))
  }
  return report
}
if (require.main === module) {
  let report
  if (process.argv.length !== 3 || process.argv[2] !== 'tighten') report = { status: 'FAILED', code: 'INVALID_COMMAND', acceptance: false }
  else report = tightenChromePermissions()
  try {
    const root = fs.realpathSync(path.resolve(__dirname, '../..')), dir = path.join(root, 'school-teacher-evidence')
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    check(fs.lstatSync(dir).isDirectory() && fs.realpathSync(dir) === dir, 'EVIDENCE_DIRECTORY_INVALID')
    const fd = fs.openSync(path.join(dir, 'chrome-permissions.json'), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n') } finally { fs.closeSync(fd) }
  } catch { report = { status: 'FAILED', code: 'EVIDENCE_WRITE_FAILED', acceptance: false } }
  process.stdout.write(JSON.stringify(report) + '\n')
  process.exitCode = report.status === 'PERMISSIONS_TIGHTENED' ? 0 : 1
}
module.exports = { tightenChromePermissions, inspectInstallation }
