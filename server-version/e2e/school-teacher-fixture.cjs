/* Actions-only synthetic identity fixture. This never creates a private tool,
 * frozen education version, activity/run, execution, answer, FINAL or report. Those must
 * come from authenticated product requests in school-teacher-browser.cjs.
 *
 * Prepared CI prerequisites (not a workflow): migrations + current backend and
 * frontend production builds, PostgreSQL service postgres:16.15-bookworm with
 * POSTGRES_USER=ptool / POSTGRES_DB=school_teacher_browser_ci_test, local Redis.
 * NODE_ENV=test CI=true GITHUB_ACTIONS=true SCHOOL_TEACHER_ISOLATED_DB=1
 * DATABASE_URL=<isolated owner URL> SCHOOL_TEACHER_TEST_DATABASE_URL=<same URL>
 * CI_POSTGRES_SERVICE_ID=<Actions postgres service.id>
 * SCHOOL_TEACHER_PRIVATE_DIR=$RUNNER_TEMP/school-teacher-private
 * node server-version/e2e/school-teacher-fixture.cjs seed
 * node server-version/e2e/school-teacher-browser.cjs
 *
 * Never upload the private directory, fixture, auth cookies, MFA secrets or raw
 * backend logs. Dispose of the CI service volumes after the job, not a live DB.
 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, randomBytes, createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const backend = path.resolve(__dirname, '../backend')
const repo = path.resolve(__dirname, '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
const quote = value => '"' + value.replaceAll('"', '""') + '"'
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"

// Only fixed source-controlled tokens may cross the runner's private-output boundary.
const seedDiagnosticContract = Object.freeze({"stages": ["bootstrap", "guard", "source-identity", "private-directory", "role-load-modules", "role-runtime-client", "role-import-contracts", "role-connect", "role-create", "role-grants", "role-policy", "runtime-contract", "release-schema", "load-modules", "password-hash", "school-users", "school-organization", "school-memberships", "school-entitlement", "school-grants", "school-units", "roster", "registration-open", "activation-codes", "student-register", "registration-close", "class-approve", "student-lookup", "teacher-users", "teacher-organization", "teacher-memberships", "teacher-entitlement", "teacher-personas", "teacher-grants", "teacher-psychology", "compile-definitions", "approved-source", "write-fixture", "cleanup"], "errorNames": ["Error", "AssertionError", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientInitializationError", "PrismaClientValidationError", "PrismaClientRustPanicError", "CampusAdmissionError", "OrganizationDomainError", "SurveyDraftError", "error", "UNKNOWN"], "codes": ["UNKNOWN", "ERR_ASSERTION", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "ENOENT", "EEXIST", "EACCES", "EPERM", "ECONNREFUSED", "ETIMEDOUT", "P1000", "P1001", "P1002", "P1003", "P1010", "P1012", "P2000", "P2002", "P2003", "P2004", "P2010", "P2021", "P2022", "P2025", "P2028", "23502", "23503", "23505", "23514", "42501", "42P01", "42703", "P0001", "INVALID_ELIGIBILITY", "INVALID_LOGIN", "CAMPUS_KEY_NOT_CONFIGURED", "CLASS_ADMISSION_NOT_FOUND", "CAMPUS_ACCOUNT_REQUIRED", "CAMPUS_GOVERNANCE_REQUIRED", "PSYCHOLOGY_STAFF_REQUIRED", "CAMPUS_CLASS_READ_REQUIRED", "CAMPUS_RECOVERY_AUTH_REQUIRED", "ROSTER_SIZE_OR_DUPLICATES", "ROSTER_FROZEN", "ROSTER_HAS_REGISTRATIONS", "ROSTER_ELIGIBILITY_CONFLICT", "WINDOW_INVALID", "WINDOW_NOT_OPEN", "CODE_BATCH_INVALID", "CODE_WINDOW_CLOSED", "CAMPUS_REGISTRATION_INVALID", "CAMPUS_REGISTRATION_UNAVAILABLE", "CAMPUS_STUDENT_REQUIRED", "CAMPUS_ALREADY_ENROLLED", "APPROVAL_PRECONDITION_FAILED", "CLASS_NOT_READY", "APPROVAL_MEMBERSHIP_MISMATCH", "CAMPUS_EXISTING_CLASS_MISMATCH", "INCIDENT_AFTER_APPROVAL_REQUIRES_QUARANTINE", "INCIDENT_NOT_FOUND", "OFFLINE_VERIFICATION_REQUIRED", "REISSUE_WINDOW_INVALID", "REISSUE_SOURCE_NOT_VERIFIED", "REISSUE_REQUIRES_OPEN_INCIDENT", "REISSUE_ACTIVE_ELIGIBILITY_EXISTS", "UNIT_NAME_REQUIRED", "GRADE_PARENT_FORBIDDEN", "CLASS_GRADE_REQUIRED", "ORG_NOT_FOUND", "ORGANIZATION_SUSPENDED", "UNIT_PARENT_NOT_FOUND", "CLASS_PARENT_MUST_BE_GRADE", "UNIT_NOT_FOUND", "UNIT_REFERENCED", "EXACT_RUNTIME_PROVISION_SCOPE_MISMATCH", "RUNTIME_TABLE_POLICY_INVALID", "UNCLASSIFIED_RUNTIME_TABLE", "INHERITED_RUNTIME_PRIVILEGE_FORBIDDEN", "UNCLASSIFIED_RUNTIME_SEQUENCE", "RUNTIME_ROLE_NOT_RESTRICTED", "RUNTIME_PRIVILEGES_INCOMPLETE", "DATABASE_URL_RUNTIME_REQUIRED", "RUNTIME_DATABASE_MISMATCH", "RUNTIME_ROLE_MODE_REQUIRED", "RELEASE_MIGRATIONS_REQUIRED", "RELEASE_MIGRATION_IDENTITY_MISMATCH"]})
let seedStage = 'bootstrap'
function safeSeedFailure(error, stage = seedStage) {
  const errorName = seedDiagnosticContract.errorNames.includes(error?.name) ? error.name : 'UNKNOWN'
  // Exact known domain/SQL token equality is safe; never publish a free-form message.
  const code = seedDiagnosticContract.codes.includes(error?.message) ? error.message
    : seedDiagnosticContract.codes.includes(error?.code) ? error.code : 'UNKNOWN'
  return { schemaVersion: 1, status: 'FAILED', stage: seedDiagnosticContract.stages.includes(stage) ? stage : 'bootstrap', errorName, code }
}

function guard() {
  for (const key of ['CI', 'GITHUB_ACTIONS']) assert.equal(process.env[key], 'true', key + ' must identify Actions')
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(process.env.SCHOOL_TEACHER_ISOLATED_DB, '1')
  assert.equal(process.env.DATABASE_URL, process.env.SCHOOL_TEACHER_TEST_DATABASE_URL)
  const url = new URL(process.env.DATABASE_URL)
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only the current runner PostgreSQL service')
  assert.equal(url.pathname, '/school_teacher_browser_ci_test')
  assert.equal(url.username, 'ptool')
  assert.ok(process.env.RUNNER_TEMP && process.env.SCHOOL_TEACHER_PRIVATE_DIR)
  const root = path.resolve(process.env.SCHOOL_TEACHER_PRIVATE_DIR)
  const runner = fs.realpathSync(process.env.RUNNER_TEMP)
  assert.ok(root.startsWith(runner + path.sep), 'Secrets must stay inside RUNNER_TEMP')
  // Refuse symlink escapes before writing any secret. The parent must exist.
  assert.ok(fs.realpathSync(path.dirname(root)).startsWith(runner + path.sep) || fs.realpathSync(path.dirname(root)) === runner)
  if (fs.existsSync(root)) assert.equal(fs.realpathSync(root), root)
  assert.match(process.env.CI_POSTGRES_SERVICE_ID || '', /^[a-f0-9]{64}$/)
  const result = spawnSync('docker', ['inspect', process.env.CI_POSTGRES_SERVICE_ID], { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, 'The selected disposable Actions PostgreSQL service must exist')
  const service = JSON.parse(result.stdout)[0]
  assert.equal(service.Id, process.env.CI_POSTGRES_SERVICE_ID)
  assert.equal(service.Config.Image, 'postgres:16.15-bookworm')
  assert.equal(service.State.Running, true)
  assert.ok(service.Config.Env.includes('POSTGRES_DB=school_teacher_browser_ci_test'))
  assert.ok(service.Config.Env.includes('POSTGRES_USER=ptool'))
  assert.ok(service.Mounts.every(m => m.Type === 'volume' && /^[a-f0-9]{64}$/.test(m.Name)), 'No persistent or host database volume')
  assert.ok(service.NetworkSettings.Ports['5432/tcp'].some(b => b.HostPort === (url.port || '5432')))
  assert.equal(fs.existsSync(path.join(backend, '.env')), false, 'Do not import a developer/production .env')
  return root
}

function sourceIdentity() {
  const git = args => {
    const out = spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 10000 })
    assert.equal(out.status, 0); return out.stdout.trim()
  }
  const head = git(['rev-parse', 'HEAD'])
  assert.equal(head, process.env.GITHUB_SHA, 'Use the exact checked-out Actions candidate')
  assert.equal(git(['diff', '--name-only', 'HEAD', '--', 'server-version', '.github']), '', 'Do not test uncommitted source')
  return { head, tree: git(['rev-parse', 'HEAD^{tree}']) }
}

async function restrictedRole(ownerUrl, suffix) {
  seedStage = 'role-load-modules'
  const { Client } = require('../backend/node_modules/pg')
  const { PrismaClient } = require('../backend/node_modules/@prisma/client')
  const parsed = new URL(ownerUrl); parsed.searchParams.delete('schema')
  const db = new Client({ connectionString: parsed.href })
  seedStage = 'role-connect'
  await db.connect()
  const role = 'school_teacher_runtime_' + suffix, password = randomBytes(24).toString('hex')
  try {
    const identity = (await db.query('SELECT current_user AS owner,current_database() AS database')).rows[0]
    seedStage = 'role-create'
    await db.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
    seedStage = 'role-grants'
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await db.query(`GRANT CONNECT ON DATABASE ${quote(identity.database)} TO ${quote(role)}`)
    await db.query(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`)
    await db.query(`ALTER ROLE ${quote(role)} SET timezone='UTC'`)
    const values = { target_database: identity.database, migration_owner: identity.owner, runtime_role: role,
      table_policy: fs.readFileSync(path.join(backend, 'scripts/runtime-table-policy.json'), 'utf8') }
    seedStage = 'role-policy'
    await db.query(fs.readFileSync(path.join(backend, 'scripts/runtime-role-defaults.sql'), 'utf8')
      .replace(/:'(target_database|migration_owner|runtime_role|table_policy)'/g, (_, key) => literal(values[key])))
    const runtimeUrl = new URL(ownerUrl); runtimeUrl.username = role; runtimeUrl.password = password
    seedStage = 'role-runtime-client'
    const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl.href } } })
    try {
      seedStage = 'role-import-contracts'
      const { verifyRuntimePrivileges } = await import(pathToFileURL(path.join(backend, 'scripts/runtime-role-contract.mjs')).href)
      const { verifyReleaseSchema } = await import(pathToFileURL(path.join(backend, 'scripts/release-schema-contract.mjs')).href)
      seedStage = 'runtime-contract'
      assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole, true)
      seedStage = 'release-schema'
      await verifyReleaseSchema(runtime)
    } finally { await runtime.$disconnect() }
    return runtimeUrl.href
  } finally { await db.end() }
}

function definitions(product) {
  const { compileResearchScale } = require('../backend/dist/modules/survey/builder.compiler')
  const scale = compileResearchScale(product + ' 合成支持体验', {
    schemaVersion: 1, presentationMode: 'ONE_BY_ONE', respondentType: 'participant_self_report', aggregation: 'mean',
    responseOptions: [{ optionKey: 'a', label: '合成量表选项甲', score: 1 }, { optionKey: 'b', label: '合成量表选项乙', score: 2 }],
    dimensions: [{ dimensionKey: 'support', label: '支持体验', direction: 'descriptive' }],
    items: [{ itemKey: 'support_item', prompt: '合成量表：本次获得支持的体验', required: true, reverse: false, dimensionKeys: ['support'] }],
  })
  scale.report.audienceContract = { schemaVersion: 1, respondent: product === 'SCHOOL' ? 'STUDENT_SELF' : 'ADULT_SELF',
    audience: product === 'SCHOOL' ? 'student' : 'teacher', locale: 'zh-CN', qcReview: { reviewer: 'Synthetic CI author',
      reviewedAt: '2026-10-22T00:00:00.000Z', basis: 'Descriptive synthetic feedback only; no diagnosis or normative inference.' } }
  scale.report.rawScoreFeedback = { schemaVersion: 1, rules: [{ scoreKey: 'support', ranges: [{ key: 'all', min: 0, max: 3,
    includeMax: true, text: '合成固定版本反馈：本次体验只用于自我反思，不是诊断。' }] }] }
  const options = [{ optionKey: 'a', label: '合成选项甲' }, { optionKey: 'b', label: '合成选项乙' }]
  const question = (itemKey, type, prompt, extra = {}) => ({ itemKey, type, prompt, required: true, allowRefusal: false, options: [], rows: [], ...extra })
  const form = { schemaVersion: 2, pages: [{ pageKey: 'typed', title: '合成第一分节', questions: [
    question('choice', 'SINGLE', '合成单选条件题', { options }),
    question('conditional', 'SHORT_TEXT', '合成条件拒答题', { allowRefusal: true, displayIf: { itemKey: 'choice', operator: 'EQUALS', optionKey: 'a' } }),
    question('multiple', 'MULTIPLE', '合成多选题', { options }),
    question('matrix', 'MATRIX', '合成矩阵题', { allowRefusal: true, options, rows: [{ rowKey: 'r1', label: '合成矩阵第一行' }, { rowKey: 'r2', label: '合成矩阵第二行' }] }),
  ] }, { pageKey: 'final', title: '合成第二分节', questions: [question('note', 'SHORT_TEXT', '合成分节确认题')] }] }
  return { scale, form }
}

async function seed() {
  seedStage = 'guard'
  const root = guard()
  seedStage = 'source-identity'
  const identity = sourceIdentity()
  seedStage = 'private-directory'
  fs.mkdirSync(root, { mode: 0o700 })
  fs.writeFileSync(path.join(root, 'seed-started'), 'One attempt only; dispose the isolated service before retrying.\n', { flag: 'wx', mode: 0o600 })
  const suffix = randomBytes(6).toString('hex')
  const secrets = Object.fromEntries(['JWT_SECRET', 'ASSET_SIGNING_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY',
    'CAMPUS_ELIGIBILITY_HMAC_KEY', 'CAMPUS_MFA_ENCRYPTION_KEY'].map(key => [key, randomBytes(32).toString('hex')]))
  Object.assign(process.env, secrets, { BACKGROUND_WORKERS_ENABLED: 'false', HUITEACHER_WORKSPACE_ENABLED: 'true' })
  const runtimeUrl = await restrictedRole(process.env.DATABASE_URL, suffix)
  seedStage = 'load-modules'
  const { prisma: db } = require('../backend/dist/config/database')
  const { hashPassword } = require('../backend/dist/utils/password')
  const { createOrganizationUnit } = require('../backend/dist/modules/organization/structure')
  const admission = require('../backend/dist/modules/campus/admission.service')
  seedStage = 'password-hash'
  const password = 'Synthetic!' + randomBytes(12).toString('hex'), passwordHash = await hashPassword(password)
  const principal = u => ({ userId: u.id, username: u.username, role: u.role, platformRole: 'STANDARD', tokenVersion: 0,
    mustChangePassword: false, accountDomain: 'SCHOOL' })
  async function user(label, role = 'TEACHER') {
    const username = 'st_' + label + '_' + suffix
    const u = await db.user.create({ data: { username, passwordHash, role, accountDomain: 'SCHOOL', teacherApproved: role === 'TEACHER', mustChangePassword: false } })
    await db.campusAccount.create({ data: { userId: u.id, loginName: username, normalizedLogin: username } })
    return u
  }
  async function member(org, u, orgRole = 'MEMBER') {
    return db.organizationMembership.create({ data: { id: randomUUID(), organizationId: org.id, userId: u.id, orgRole } })
  }
  async function grant(org, m, actor, product, admin, psych) {
    if (admin) await db.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: m.id, product, role: 'PRODUCT_ADMIN', grantedByUserId: actor.id } })
    if (psych) {
      await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: m.id, persona: 'COUNSELOR', grantedByUserId: actor.id } })
      await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: org.id, membershipId: m.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: actor.id } })
    }
  }
  try {
    seedStage = 'school-users'
    const schoolAdmin = await user('school_admin', 'ADMIN'), schoolAuthor = await user('psych')
    seedStage = 'school-organization'
    const school = await db.organization.create({ data: { id: randomUUID(), name: '合成 School ' + suffix, productDomain: 'SCHOOL', createdByUserId: schoolAdmin.id } })
    seedStage = 'school-memberships'
    const adminMember = await member(school, schoolAdmin, 'ORG_ADMIN'), psychMember = await member(school, schoolAuthor)
    seedStage = 'school-entitlement'
    await db.educationProductEntitlement.create({ data: { organizationId: school.id, product: 'HUISCHOOL', status: 'ACTIVE', grantedByUserId: schoolAdmin.id } })
    seedStage = 'school-grants'
    await grant(school, adminMember, schoolAdmin, 'HUISCHOOL', true, false)
    await grant(school, psychMember, schoolAdmin, 'HUISCHOOL', false, true)
    seedStage = 'school-units'
    const grade = await createOrganizationUnit({ organizationId: school.id, unitKind: 'GRADE', name: '五年级' })
    const cls = await createOrganizationUnit({ organizationId: school.id, unitKind: 'CLASS', name: '合成验收班', parentUnitId: grade.id })
    const scope = { actor: principal(schoolAdmin), organizationId: school.id, classUnitId: cls.id }
    const studentNumber = 'S' + suffix, loginName = 'st_student_' + suffix
    seedStage = 'roster'
    const roster = await admission.replaceCampusRoster({ ...scope, studentNumbers: [studentNumber] })
    seedStage = 'registration-open'
    await admission.setCampusRegistrationWindow({ ...scope, action: 'OPEN', closesAt: new Date(Date.now() + 30 * 60000) })
    seedStage = 'activation-codes'
    const codes = await admission.issueCampusActivationCodes({ ...scope, count: 1, ttlMinutes: 25 })
    seedStage = 'student-register'
    const registered = await admission.registerCampusStudent({ organizationId: school.id, classUnitId: cls.id, studentNumber,
      activationCode: codes.codes[0], username: loginName, password })
    seedStage = 'registration-close'
    await admission.setCampusRegistrationWindow({ ...scope, action: 'CLOSE' })
    seedStage = 'class-approve'
    await admission.approveCampusClass({ ...scope, actor: principal(schoolAuthor), expectedRosterVersion: roster.rosterVersion })
    seedStage = 'student-lookup'
    const student = await db.user.findUniqueOrThrow({ where: { id: registered.userId } })
    assert.equal(student.role, 'STUDENT')
    const studentMember = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: school.id, userId: student.id, validUntil: null } })
    seedStage = 'teacher-users'
    const teacherAuthor = await user('teacher_author'), teacherParticipant = await user('teacher_member'), teacherPsych = await user('teacher_psych')
    seedStage = 'teacher-organization'
    const teacher = await db.organization.create({ data: { id: randomUUID(), name: '合成 Teacher ' + suffix, productDomain: 'SCHOOL', createdByUserId: teacherAuthor.id } })
    seedStage = 'teacher-memberships'
    const teacherAdmin = await member(teacher, teacherAuthor, 'ORG_ADMIN'), teacherMember = await member(teacher, teacherParticipant)
    seedStage = 'teacher-entitlement'
    await db.educationProductEntitlement.create({ data: { organizationId: teacher.id, product: 'HUITEACHER', status: 'ACTIVE', grantedByUserId: teacherAuthor.id } })
    seedStage = 'teacher-personas'
    for (const m of [teacherAdmin, teacherMember]) await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: teacher.id,
      membershipId: m.id, persona: 'TEACHER', grantedByUserId: teacherAuthor.id } })
    seedStage = 'teacher-grants'
    await grant(teacher, teacherAdmin, teacherAuthor, 'HUITEACHER', true, true)
    seedStage = 'teacher-psychology'
    const teacherPsychMember = await member(teacher, teacherPsych)
    await grant(teacher, teacherPsychMember, teacherAuthor, 'HUITEACHER', false, true)
    const login = (u, name = u.username) => ({ id: u.id, username: name, password, role: u.role })
    seedStage = 'compile-definitions'
    const fixture = { schemaVersion: 1, identity, suffix, runtimeUrl, secrets, products: {
      SCHOOL: { organizationId: school.id, classUnitId: cls.id, participantMembershipId: studentMember.id,
        author: login(schoolAuthor), participant: login(student, loginName), definitions: definitions('SCHOOL') },
      TEACHER: { organizationId: teacher.id, participantMembershipId: teacherMember.id,
        author: login(teacherAuthor), psychAuthor: login(teacherPsych), participant: login(teacherParticipant), definitions: definitions('TEACHER') },
    } }
    const plan=JSON.parse(process.env.PLAN||'{}')
    if(plan.candidate==='education-self'){
      assert.equal(plan.browserMode,'SELF_COMPOSITION');assert.equal(plan.head,identity.head);assert.equal(plan.sourceTree,identity.tree)
      fixture.browserMode='SELF_COMPOSITION'
      seedStage='approved-source'
      await require('./education-self-questionnaire.cjs').prepareApprovedSource({db,passwordHash,suffix,products:fixture.products})
    }
    seedStage = 'write-fixture'
    fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(fixture), { flag: 'wx', mode: 0o600 })
    console.log('Synthetic School/Teacher identities ready; official restricted runtime-role and release-schema checks passed. No business tasks or answers seeded.')
  } finally {
    await db.$disconnect()
    await require('../backend/dist/services/cacheService').cacheService.close()
  }
}

function readFixture() {
  const root = guard(), file = path.join(root, 'fixture.json')
  assert.equal(fs.statSync(file).mode & 0o077, 0, 'Fixture secrets must not be group/world readable')
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(value.identity, sourceIdentity())
  return { root, value }
}
module.exports = { guard, readFixture, sourceIdentity, backend, repo, sha, restrictedRole, seedDiagnosticContract, safeSeedFailure }
if (require.main === module) {
  assert.equal(process.argv[2], 'seed', 'Only the explicit seed command is supported')
  seed().catch(error => { console.error('SCHOOL_TEACHER_SEED_DIAGNOSTIC ' + JSON.stringify(safeSeedFailure(error))); console.error('School/Teacher synthetic fixture failed. Do not upload private logs or retry against the same database.'); process.exitCode = 1 })
}
