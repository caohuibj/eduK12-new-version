/* Disposable CI resources and read-only C20 observations. No answer, FINAL,
 * allocation claim, binding, quota, or report is fabricated by this fixture. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { Client } = require('../backend/node_modules/pg')
const { PrismaClient } = require('../backend/node_modules/@prisma/client')
const bcrypt = require('../backend/node_modules/bcryptjs')
const backend = path.resolve(__dirname, '../backend')
const materialTables = Object.freeze(['training_material_experiments', 'training_material_subject_bindings',
  'training_material_quota_buckets', 'training_material_allocation_claims'])
const quote = value => '"' + value.replaceAll('"', '""') + '"'
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const sha = value => createHash('sha256').update(value).digest('hex')
function guard() {
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(process.env.CI, 'true')
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  assert.equal(process.env.QUESTIONNAIRE_PRODUCT_ISOLATED_DB, '1')
  assert.ok(process.env.DATABASE_URL === process.env.QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL, 'Matching isolated database selection required')
  const url = new URL(process.env.DATABASE_URL)
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
  assert.equal(url.pathname, '/ptool')
  assert.ok(process.env.TRAINING_MATERIALS_PRIVATE_DIR)
  assert.match(process.env.CI_POSTGRES_SERVICE_ID || '', /^[a-f0-9]{64}$/)
  const inspected = spawnSync('docker', ['inspect', process.env.CI_POSTGRES_SERVICE_ID], { encoding: 'utf8', timeout: 10000 })
  assert.equal(inspected.status, 0, 'Current Actions PostgreSQL service must exist')
  const service = JSON.parse(inspected.stdout)[0]
  assert.equal(service.Id, process.env.CI_POSTGRES_SERVICE_ID)
  assert.equal(service.Config.Image, 'postgres:16.15-bookworm')
  assert.equal(service.State.Running, true)
  assert.ok(service.Config.Env.includes('POSTGRES_DB=ptool'))
  assert.ok(service.Config.Env.includes('POSTGRES_USER=ptool'))
  assert.ok(service.Mounts.every(mount => mount.Type === 'volume' && /^[a-f0-9]{64}$/.test(mount.Name)), 'Only disposable anonymous service volumes')
  const bindings = service.NetworkSettings.Ports['5432/tcp']
  assert.ok(bindings.some(binding => binding.HostPort === '5432'))
  assert.equal(url.port || '5432', '5432')
  const root = path.resolve(process.env.TRAINING_MATERIALS_PRIVATE_DIR)
  assert.ok(root.startsWith(path.resolve(process.env.RUNNER_TEMP) + path.sep))
  assert.ok(process.env.DATA_ENCRYPTION_KEY && process.env.DATA_PSEUDONYM_KEY)
  return root
}
function fixture() {
  return JSON.parse(fs.readFileSync(path.join(guard(), 'fixture.json'), 'utf8'))
}
async function withPg(url, fn) {
  // Prisma's schema query option is not a libpq connection option.
  const parsed = new URL(url); parsed.searchParams.delete('schema')
  const db = new Client({ connectionString: parsed.href })
  await db.connect()
  try { return await fn(db) } finally { await db.end() }
}
async function applyRuntimeRole(ownerUrl, role, password) {
  assert.match(role, /^c20_runtime_[a-f0-9]{16}$/)
  assert.match(password, /^[a-f0-9]{32}$/)
  return withPg(ownerUrl, async db => {
    const identity = (await db.query('SELECT current_user AS owner,current_database() AS database')).rows[0]
    await db.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`)
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await db.query(`GRANT CONNECT ON DATABASE ${quote(identity.database)} TO ${quote(role)}`)
    await db.query(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`)
    await db.query(`ALTER ROLE ${quote(role)} SET timezone='UTC'`)
    const values = { target_database: identity.database, migration_owner: identity.owner,
      runtime_role: role, table_policy: fs.readFileSync(path.join(backend, 'scripts/runtime-table-policy.json'), 'utf8') }
    const sql = fs.readFileSync(path.join(backend, 'scripts/runtime-role-defaults.sql'), 'utf8')
      .replace(/:'(target_database|migration_owner|runtime_role|table_policy)'/g, (_, key) => literal(values[key]))
    await db.query(sql)
    const runtimeUrl = new URL(ownerUrl); runtimeUrl.username = role; runtimeUrl.password = password
    const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl.href } } })
    try {
      const { verifyRuntimePrivileges } = await import(pathToFileURL(path.join(backend, 'scripts/runtime-role-contract.mjs')).href)
      const { verifyReleaseSchema } = await import(pathToFileURL(path.join(backend, 'scripts/release-schema-contract.mjs')).href)
      assert.equal((await verifyRuntimePrivileges(runtime)).restrictedRuntimeRole, true)
      await verifyReleaseSchema(runtime)
    } finally { await runtime.$disconnect() }
    return runtimeUrl.href
  })
}
async function bootstrap() {
  const root = guard(); fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  assert.equal(fs.existsSync(path.join(root, 'fixture.json')), false, 'fresh C20 fixture only')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const password = randomUUID().replaceAll('-', '')
  const role = 'c20_runtime_' + suffix
  const runtimeUrl = await applyRuntimeRole(process.env.DATABASE_URL, role, password)
  const db = new PrismaClient()
  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const users = {}
    for (const [name, role] of [['teacher', 'TEACHER'], ['first', 'STUDENT'], ['second', 'STUDENT'], ['filler', 'STUDENT']]) {
      const user = await db.user.create({ data: { username: `c20-${name}-${suffix}`, passwordHash, role,
        accountDomain: 'TRAINING', teacherApproved: true, mustChangePassword: false } })
      users[name] = { id: user.id, username: user.username, password, role }
    }
    const course = await db.course.create({ data: { title: 'C20 isolated material acceptance ' + suffix,
      creatorId: users.teacher.id, courseCode: 'C20-' + suffix, courseType: 'TRAINING_COURSE', status: 'PUBLISHED' } })
    await db.courseStudent.createMany({ data: ['first', 'second', 'filler'].map(name => ({ courseId: course.id,
      studentId: users[name].id, status: 'ACTIVE' })) })
    fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ users, courseId: course.id, courseTitle: course.title,
      suffix, role, password, runtimeUrl }), { flag: 'wx', mode: 0o600 })
    console.log('C20 fresh Training resources and official restricted runtime privileges verified')
  } finally { await db.$disconnect() }
}
function runtimeDb() {
  const f = fixture()
  assert.ok(process.env.DATABASE_URL === f.runtimeUrl, 'C20 API/observers use the restricted principal')
  return new PrismaClient()
}
async function observe(db, attemptId) {
  const row = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
  const { decryptUnifiedRuntimePayload } = require('../backend/dist/modules/assessment-runtime/security.js')
  const { canonicalHash } = require('../backend/dist/modules/assessment-runtime/canonical.js')
  const candidate = decryptUnifiedRuntimePayload(row.trainingFlowSnapshotEncrypted)
  assert.equal(candidate.schemaVersion, 2)
  assert.equal(canonicalHash(candidate), row.trainingFlowSnapshotHash)
  const assignment = candidate.materialAssignment
  const { assignmentHash, ...identity } = assignment
  assert.equal(canonicalHash(identity), assignmentHash)
  assert.equal(assignment.attemptId, row.id)
  assert.equal(assignment.attemptEpoch, row.attemptEpoch)
  assert.equal(assignment.participantKey, row.participantKey)
  const claim = await db.trainingMaterialAllocationClaim.findUniqueOrThrow({ where: { id: assignment.claimId } })
  for (const key of ['experimentId', 'compositeId', 'publicationKey', 'configDigest', 'participantKey', 'groupKey', 'materialDigest', 'algorithm']) {
    assert.equal(assignment[key], claim[key])
  }
  const facts = await db.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attemptId }, orderBy: { id: 'asc' } })
  const jobs = await db.compositeReportJob.findMany({ where: { attemptId }, orderBy: { id: 'asc' } })
  return { row, assignment, claim, facts, jobs }
}
async function ledger(db, compositeIds) {
  const where = { compositeId: { in: compositeIds } }
  return {
    claims: await db.trainingMaterialAllocationClaim.findMany({ where, orderBy: { id: 'asc' } }),
    buckets: await db.trainingMaterialQuotaBucket.findMany({ where, orderBy: { id: 'asc' } }),
    parents: await db.compositeAssessmentAttempt.findMany({ where: { compositeAssessmentId: { in: compositeIds } }, orderBy: { id: 'asc' } }),
    tokens: await db.compositeAssessmentAccessToken.findMany({ where: { compositeAssessmentId: { in: compositeIds } }, orderBy: { id: 'asc' } }),
  }
}
async function drainReport(db, attemptId) {
  const parent = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } })
  const expected = await db.compositeReportJob.findUniqueOrThrow({ where: { attemptId_attemptEpoch: { attemptId, attemptEpoch: parent.attemptEpoch } } })
  assert.equal(expected.status, 'PENDING')
  const { claimCompositeReportJob } = require('../backend/dist/modules/assessment-runtime/report-outbox.service.js')
  const { processCompositeReportJob } = require('../backend/dist/workers/compositeReportWorker.js')
  const { closeQueues } = require('../backend/dist/config/queue.js')
  const { prisma } = require('../backend/dist/config/database.js')
  let release, ready, rejectReady
  const wait = new Promise(resolve => { release = resolve })
  const locked = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject })
  const gate = new PrismaClient()
  const transaction = gate.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE id <> $1 FOR UPDATE', expected.id)
    ready(); await wait
  }, { maxWait: 10000, timeout: 120000 })
  transaction.catch(rejectReady)
  try {
    await locked
    const job = await claimCompositeReportJob()
    assert.equal(job?.id, expected.id, 'only the real HTTP-generated C20 outbox is processed')
    await processCompositeReportJob(job)
    const result = await db.compositeReportJob.findUniqueOrThrow({ where: { id: expected.id } })
    assert.equal(result.status, 'READY'); assert.equal(result.attemptCount, 1)
  } finally {
    release(); await transaction; await gate.$disconnect(); await closeQueues();
    await require('../backend/dist/services/cacheService.js').cacheService.close(); await prisma.$disconnect()
  }
}
async function databaseSnapshot(url) {
  return withPg(url, async db => {
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename)
    const rows = {}
    for (const table of tables) {
      // jsonb canonicalizes keys; logical recovery need not preserve physical column ordinals.
      rows[table] = (await db.query(`SELECT count(*)::text AS count,
        md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.${quote(table)} t`)).rows[0]
    }
    for (const table of materialTables) assert.ok(Number(rows[table]?.count) > 0, `${table} must be populated by real admissions`)
    const functions = (await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'training_material_%' ORDER BY p.proname")).rows
    const triggers = (await db.query("SELECT c.relname,t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname LIKE 'training_material_%' ORDER BY c.relname,t.tgname")).rows
    const constraints = (await db.query("SELECT c.relname,k.conname,k.contype,k.condeferrable,k.condeferred,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,k.conname", [materialTables])).rows
    // Standalone UNIQUE indexes do not appear in pg_constraint. In particular,
    // reservation ordinals must remain uniquely charged after logical restore.
    const indexes = (await db.query(`SELECT n.nspname AS table_schema,c.relname AS table_name,
      ni.nspname AS index_schema,i.relname AS index_name,am.amname AS method,
      x.indisunique AS is_unique,x.indisvalid AS is_valid,x.indisready AS is_ready,
      x.indnkeyatts AS key_count,x.indnatts AS attribute_count,
      ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY AS key(attnum,position)
        LEFT JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=key.attnum
        WHERE key.position<=x.indnkeyatts ORDER BY key.position) AS columns,
      pg_get_expr(x.indpred,x.indrelid) AS predicate,pg_get_expr(x.indexprs,x.indrelid) AS expressions,
      pg_get_indexdef(x.indexrelid) AS definition
      FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_namespace ni ON ni.oid=i.relnamespace
      JOIN pg_am am ON am.oid=i.relam
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,i.relname`, [materialTables])).rows
    const reservation = indexes.find(row => row.index_name === 'training_material_claim_reservation_key')
    assert.ok(reservation, 'Restored allocation reservation uniqueness index is required')
    for (const [key, value] of Object.entries({ table_schema: 'public', index_schema: 'public',
      table_name: 'training_material_allocation_claims', method: 'btree', is_unique: true,
      is_valid: true, is_ready: true, key_count: 5, attribute_count: 5, predicate: null, expressions: null }))
      assert.equal(reservation[key], value, 'Reservation index ' + key)
    assert.deepEqual(reservation.columns, ['composite_id', 'publication_key', 'config_digest', 'group_key', 'reservation_ordinal'])
    assert.equal(functions.length, 7); assert.equal(triggers.length, 11)
    assert.ok(constraints.some(row => row.conname === 'training_material_claim_attempt_fk' && row.condeferrable && row.condeferred))
    return { rows, functions, triggers, constraints, indexes }
  })
}
function sourceIdentity() {
  const read = argument => {
    const result = spawnSync('git', ['rev-parse', argument], { cwd: backend, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0)
    return result.stdout.trim()
  }
  const head = read('HEAD'), tree = read('HEAD^{tree}')
  assert.equal(head, process.env.GITHUB_SHA, 'Consumer checkout must match the exact Actions SHA')
  const prHead = process.env.TRAINING_MATERIALS_PR_HEAD || null
  if (prHead) assert.match(prHead, /^[a-f0-9]{40}$/)
  return { head, tree, prHead }
}
function inputDigests() {
  return Object.fromEntries(['scripts/runtime-role-defaults.sql', 'scripts/runtime-role-contract.mjs',
    'scripts/runtime-table-policy.json', 'scripts/release-schema-contract.mjs',
    'prisma/migrations/20261018160000_training_material_allocation/migration.sql']
    .map(file => [file, sha(fs.readFileSync(path.join(backend, file)))]))
}
module.exports = { sourceIdentity, inputDigests, guard, fixture, backend, materialTables, withPg, applyRuntimeRole, runtimeDb, observe, ledger, drainReport, databaseSnapshot, sha }
if (require.main === module) {
  assert.equal(process.argv[2], 'bootstrap')
  bootstrap().catch(() => { console.error('C20 fixture/bootstrap failed; private details withheld'); process.exitCode = 1 })
}
