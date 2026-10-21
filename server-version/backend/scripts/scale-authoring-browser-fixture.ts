/** Disposable CI prerequisites only. No sessions, publications, answers or reports are fabricated.
 * Execute with Node 24 against the extracted candidate backend. Never upload this private fixture.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes, randomUUID, createCipheriv } = require('node:crypto')
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(process.env.SCALE_AUTHORING_ISOLATED, '1')
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/)
  const root = path.resolve(process.env.RUNNER_TEMP, 'scale-authoring-private')
  const output = path.resolve(process.env.SCALE_AUTHORING_FIXTURE_FILE || '')
  assert.equal(output, path.join(root, 'fixture.json'))
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  assert.equal(fs.realpathSync(root), root); assert.equal(fs.statSync(root).mode & 0o077, 0)
  assert(!fs.existsSync(output), 'Never replace an uncertain fixture')
  process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL
  const db = new URL(process.env.DATABASE_URL)
  assert(['localhost', '127.0.0.1'].includes(db.hostname))
  assert.equal(db.pathname, '/ptool', 'Only the disposable CI service database is permitted')
  const backend = path.resolve(process.env.SCALE_AUTHORING_BACKEND_ROOT || path.join(__dirname, '..'))
  const { prisma } = require(path.join(backend, 'dist/config/database.js'))
  const { hashPassword } = require(path.join(backend, 'dist/utils/password.js'))
  assert.match(process.env.SURVEY_MFA_ENCRYPTION_KEY || '', /^[a-f0-9]{64}$/i)
  const runId = randomUUID().slice(0, 8)
  const actor = key => ({ username: 'scale_ci_' + key + '_' + runId, password: randomBytes(20).toString('base64url') + 'Aa7!' })
  const teacher = actor('teacher'), student = actor('student'), researcher = actor('researcher')
  const totp = randomBytes(20), iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.SURVEY_MFA_ENCRYPTION_KEY, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(totp), cipher.final()])
  const secretCipher = [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64url')).join('.')
  try {
    assert.equal(await prisma.user.count(), 0, 'Fresh disposable database required')
    for (const [account, role, accountDomain] of [[teacher, 'TEACHER', 'TRAINING'], [student, 'STUDENT', 'TRAINING'], [researcher, 'STUDENT', 'SURVEY']]) {
      const user = await prisma.user.create({ data: { username: account.username, passwordHash: await hashPassword(account.password), role, accountDomain, teacherApproved: true } })
      account.id = user.id
    }
    await prisma.surveyAccount.create({ data: { userId: researcher.id, loginName: researcher.username, normalizedLogin: researcher.username } })
    // A synthetic administrator issues the researcher entitlement; it has no browser session.
    const admin = await prisma.user.create({ data: { username: 'scale_ci_grant_' + runId, passwordHash: await hashPassword(randomBytes(32).toString('hex')), role: 'ADMIN', accountDomain: 'LEGACY', platformRole: 'SYSTEM_ADMIN' } })
    await prisma.surveyResearcherGrant.create({ data: { userId: researcher.id, grantedBy: admin.id, status: 'ACTIVE' } })
    await prisma.surveyMfaCredential.create({ data: { userId: researcher.id, enabled: true, secretCipher, enabledAt: new Date() } })
    const project = await prisma.surveyProject.create({ data: { id: randomUUID(), ownerUserId: researcher.id, title: 'Synthetic scale authoring ' + runId, description: 'Disposable software acceptance only', collectionMode: 'SINGLE_UNLINKED' } })
    const course = await prisma.course.create({ data: { creatorId: teacher.id, title: 'Synthetic scale course', courseCode: 'SCALE' + runId, courseType: 'TRAINING_COURSE', status: 'PUBLISHED' } })
    await prisma.courseStudent.create({ data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' } })
    const fixture = { schemaVersion: 1, isolated: true, sourceCommit: process.env.GITHUB_SHA, createdAt: new Date().toISOString(), runId,
      trainingUrl: 'https://training.eduk12.top:3189', surveyUrl: 'https://survey.eduk12.top:3189', teacher, student,
      researcher: { ...researcher, totpSecretBase64: totp.toString('base64') }, project: { id: project.id, title: project.title }, courseId: course.id }
    const pg = require(path.join(backend, 'node_modules/pg'))
    const runtimeName = 'scale_runtime_' + randomBytes(8).toString('hex')
    const runtimePassword = randomBytes(32).toString('base64url')
    const client = new pg.Client({ connectionString: db.href })
    await client.connect()
    try {
      await client.query(`CREATE ROLE ${pg.escapeIdentifier(runtimeName)} LOGIN PASSWORD ${pg.escapeLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`)
      await client.query(`GRANT CONNECT ON DATABASE ptool TO ${pg.escapeIdentifier(runtimeName)}`)
      await client.query(`GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(runtimeName)}`)
      const parameters = { target_database: 'ptool', migration_owner: 'ptool', runtime_role: runtimeName,
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
    const { verifyConfiguredRuntime } = await import('./runtime-role-contract.mjs')
    assert.equal((await verifyConfiguredRuntime({ current: true })).restrictedRuntimeRole, true)
    fs.appendFileSync(process.env.GITHUB_ENV, `DATABASE_URL=${runtime.href}\nDATABASE_URL_RUNTIME=${runtime.href}\n`)
    fs.writeFileSync(output, JSON.stringify(fixture), { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ fixtureReady: true, runId, scope: 'synthetic accounts, enrolled MFA, empty project and course only' }))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error('Synthetic scale prerequisite failed:', error.name); process.exitCode = 1 })
