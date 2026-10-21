/** Disposable CI prerequisites only. No sessions, publications, answers or reports are fabricated.
 * Execute with Node 24 against the extracted candidate backend. Never upload this private fixture.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes, randomUUID } = require('node:crypto')
let phase = 'isolated-preflight'
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(process.env.TRAINING_WORKSPACE_ISOLATED, '1')
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
  const root = path.resolve(process.env.RUNNER_TEMP, 'training-workspace-integrated-private')
  const output = path.resolve(process.env.TRAINING_WORKSPACE_FIXTURE_FILE || '')
  assert.equal(output, path.join(root, 'fixture.json'))
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  assert.equal(fs.realpathSync(root), root); assert.equal(fs.statSync(root).mode & 0o077, 0)
  assert(!fs.existsSync(output), 'Never replace an uncertain fixture')
  process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL
  const db = new URL(process.env.DATABASE_URL)
  assert(['localhost', '127.0.0.1'].includes(db.hostname))
  assert.equal(db.pathname, '/workspace_browser', 'Only the disposable CI service database is permitted')
  const backend = path.resolve(process.env.TRAINING_WORKSPACE_BACKEND_ROOT || path.join(__dirname, '..'))
  phase = 'load-candidate-database-module'
  const { prisma } = require(path.join(backend, 'dist/config/database.js'))
  phase = 'load-candidate-password-module'
  const { hashPassword } = require(path.join(backend, 'dist/utils/password.js'))
  const runId = randomUUID().slice(0, 8)
  const actor = key => ({ username: 'ws_ci_' + key + '_' + runId, password: randomBytes(20).toString('base64url') + 'Aa7!' })
  const author = actor('author'), stranger = actor('stranger');
  const teacher = actor('teacher'), student = actor('student'), administrator = actor('administrator')
  // Match survey_login_shape_check before any write; this subset also satisfies admin bootstrap (4..64).
  for (const account of [teacher, author, student, stranger, administrator]) {
    assert.match(account.username, /^[a-z0-9_.-]{4,32}$/, 'Synthetic account must satisfy database login constraints')
    assert.equal(account.username, account.username.trim().toLowerCase())
  }
  try {
    phase = 'fresh-database-and-synthetic-accounts'
    assert.equal(await prisma.user.count(), 0, 'Fresh disposable database required')
    for (const [account, role, accountDomain] of [[author, 'TEACHER', 'TRAINING'], [stranger, 'STUDENT', 'TRAINING'], [teacher, 'TEACHER', 'TRAINING'], [student, 'STUDENT', 'TRAINING']]) {
      phase = 'create-synthetic-' + role.toLowerCase() + '-' + accountDomain.toLowerCase()
      const user = await prisma.user.create({ data: { username: account.username, passwordHash: await hashPassword(account.password), role, accountDomain, teacherApproved: true } })
      account.id = user.id
    }
    // Only synthetic account authority is seeded; approvals/releases/grants must use real product actions.
    phase = 'real-administrator-enrollment-bootstrap'
    const handoff = path.join(root, 'administrator-enrollment.json')
    const cli = require('node:child_process').spawnSync(process.execPath, [path.join(backend, 'dist/scripts/admin-security-bootstrap.js')], {
      input: JSON.stringify({action:'CREATE_SYSTEM_ADMIN',username:administrator.username,password:administrator.password,reason:'Disposable Training workspace CI account only'}),
      encoding:'utf8', env:{...process.env,ADMIN_SECURITY_BOOTSTRAP_ENABLED:'true',ADMIN_SECURITY_HANDOFF_FILE:handoff},
    })
    assert.equal(cli.status,0,'Synthetic administrator bootstrap failed (private output withheld)')
    const admin = {id:JSON.parse(cli.stdout.trim().split('\n').at(-1)).userId}
    administrator.id = admin.id
    administrator.enrollmentToken = JSON.parse(fs.readFileSync(handoff,'utf8')).enrollmentToken
    assert(administrator.enrollmentToken, 'Real one-use enrollment handoff required')
    phase = 'create-empty-synthetic-courses'
    const course = await prisma.course.create({ data: { creatorId: teacher.id, title: 'Synthetic scale course', courseCode: 'SCALE' + runId, courseType: 'TRAINING_COURSE', status: 'PUBLISHED' } })
    await prisma.courseStudent.create({ data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' } })
    const foreignCourse = await prisma.course.create({ data: { creatorId: author.id, title: 'Other synthetic course', courseCode: 'OTHER' + runId, courseType: 'TRAINING_COURSE', status: 'PUBLISHED' } })
    const fixture = { schemaVersion: 1, isolated: true, sourceCommit: process.env.GITHUB_SHA, ciRunId: process.env.GITHUB_RUN_ID, createdAt: new Date().toISOString(), runId,
      trainingUrl: 'https://training.eduk12.top', teacher, author, student, stranger, administrator,
      courseId: course.id, foreignCourseId: foreignCourse.id }
    phase = 'restricted-runtime-role-policy'
    const pg = require(path.join(backend, 'node_modules/pg'))
    const runtimeName = 'scale_runtime_' + randomBytes(8).toString('hex')
    const runtimePassword = randomBytes(32).toString('base64url')
    const client = new pg.Client({ connectionString: db.href })
    await client.connect()
    try {
      await client.query(`CREATE ROLE ${pg.escapeIdentifier(runtimeName)} LOGIN PASSWORD ${pg.escapeLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`)
      await client.query(`GRANT CONNECT ON DATABASE workspace_browser TO ${pg.escapeIdentifier(runtimeName)}`)
      await client.query(`GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(runtimeName)}`)
      const parameters = { target_database: 'workspace_browser', migration_owner: 'ptool', runtime_role: runtimeName,
        table_policy: fs.readFileSync(path.join(__dirname, 'runtime-table-policy.json'), 'utf8') }
      const sql = fs.readFileSync(path.join(__dirname, 'runtime-role-defaults.sql'), 'utf8')
        .replace(/:'(target_database|migration_owner|runtime_role|table_policy)'/g, (_match, key) => pg.escapeLiteral(parameters[key]))
      assert(!/:'[a-z_]+'/.test(sql)); await client.query(sql)
    } finally { await client.end() }
    const runtime = new URL(db.href); runtime.username = runtimeName; runtime.password = runtimePassword
    runtime.searchParams.set('connection_limit', '4'); runtime.searchParams.set('pool_timeout', '30')
    console.log('::add-mask::' + runtimePassword); console.log('::add-mask::' + runtime.href)
    assert(process.env.GITHUB_ENV && path.resolve(process.env.GITHUB_ENV).startsWith(path.resolve(process.env.RUNNER_TEMP) + path.sep))
    process.env.DATABASE_URL = runtime.href; process.env.DATABASE_URL_RUNTIME = runtime.href
    phase = 'restricted-runtime-role-verification'
    const { verifyConfiguredRuntime } = await import(require('node:url').pathToFileURL(path.join(backend,'scripts/runtime-role-contract.mjs')).href)
    assert.equal((await verifyConfiguredRuntime({ current: true })).restrictedRuntimeRole, true)
    fs.appendFileSync(process.env.GITHUB_ENV, `DATABASE_URL=${runtime.href}\nDATABASE_URL_RUNTIME=${runtime.href}\n`)
    fs.writeFileSync(output, JSON.stringify(fixture), { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ fixtureReady: true, runId, scope: 'synthetic accounts, real administrator enrollment ticket and empty courses only' }))
  } finally { await prisma.$disconnect() }
}
// Do not serialize Error.message, Prisma.meta, subprocess output or configuration.
// These diagnostics retain only code identity and script locations, never values.
function safeFixtureDiagnostic(error) {
  const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,70}Error$|^Error$/.test(error.name) ? error.name : 'UnknownError'
  const rawCode = String(error?.code || '')
  const code = /^(?:ERR_[A-Z_]{1,50}|MODULE_NOT_FOUND|P[0-9]{4}|E(?:ACCES|PERM|NOENT|PIPE|CONNREFUSED|TIMEDOUT)|[0-9]{2}[A-Z0-9]{3})$/.test(rawCode) ? rawCode : 'UNCLASSIFIED'
  const frames = String(error?.stack || '').split('\n').slice(1).flatMap(line => {
    const match = line.match(/(?:\/|^)([A-Za-z0-9_.-]+\.(?:[cm]?js|ts)):(\d+):(\d+)\)?$/)
    return match ? [{ file: match[1], line: Number(match[2]), column: Number(match[3]) }] : []
  }).slice(0, 6)
  return { schemaVersion: 1, phase, errorName: name, errorCode: code, frames, privateDetailsWithheld: true }
}
main().catch(error => { console.error('GOVERNANCE_FIXTURE_DIAGNOSTIC ' + JSON.stringify(safeFixtureDiagnostic(error))); process.exitCode = 1 })
