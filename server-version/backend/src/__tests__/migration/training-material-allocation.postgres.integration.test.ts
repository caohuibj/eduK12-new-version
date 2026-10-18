import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20261018160000_training_material_allocation/migration.sql'), 'utf8')
const tables = ['training_material_experiments', 'training_material_subject_bindings', 'training_material_quota_buckets', 'training_material_allocation_claims']
describe('C20 additive migration contract', () => {
  it('adds only the four registered durable tables without rewriting historical records', () => {
    const policy = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/runtime-table-policy.json'), 'utf8'))
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE ${table} (`)
      expect(policy.tables[table]).toBe('RUNTIME_RW')
    }
    expect(migration).not.toMatch(/(?:^|;)\s*(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE)\s/im)
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED')
  })
})
const url = process.env.TRAINING_MATERIAL_TEST_DATABASE_URL
const enabled = process.env.TRAINING_MATERIAL_ISOLATED_DB === '1' && !!url
// Explicit opt-in only. This suite never discovers or uses an application URL.
describe.skipIf(!enabled)('C20 migration on isolated PostgreSQL', () => {
  let db: Client
  const schema = `c20_material_${randomUUID().replaceAll('-', '')}`
  const digest = 'a'.repeat(64)
  const flow = { schemaVersion: 2, experiment: { experimentKey: 'exp', linkedPolicy: 'KEEP_LINKED', groups: [
    { groupKey: 'A', weight: 1, materialTitle: 'A title', materialBody: 'A body' },
    { groupKey: 'B', weight: 1, materialTitle: 'B title', materialBody: 'B body' },
  ] }, quotaPolicy: { schemaVersion: 1, groupLimits: { A: 2, B: 1 } } }
  beforeAll(async () => {
    const parsed = new URL(url!)
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) throw new Error('Isolated loopback PostgreSQL required')
    db = new Client({ connectionString: url })
    await db.connect()
    await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    await db.query(`CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT NOT NULL);
      CREATE TABLE courses(id TEXT PRIMARY KEY, creator_id TEXT NOT NULL REFERENCES users(id), course_type TEXT NOT NULL, is_library BOOLEAN NOT NULL);
      CREATE TABLE composite_assessments(id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id), created_by TEXT REFERENCES users(id), published_at TIMESTAMP(3), training_flow_digest TEXT, training_flow_frozen JSONB, status TEXT DEFAULT 'PUBLISHED');
      CREATE TABLE questionnaire_course_deliveries(composite_id TEXT REFERENCES composite_assessments(id), course_id TEXT REFERENCES courses(id), PRIMARY KEY(composite_id,course_id));
      CREATE TABLE composite_assessment_attempts(id TEXT PRIMARY KEY, composite_assessment_id TEXT REFERENCES composite_assessments(id), participant_key TEXT, user_id TEXT REFERENCES users(id), delivery_course_id TEXT REFERENCES courses(id));`)
    await db.query(migration)
    await db.query(`INSERT INTO users VALUES ('teacher','TEACHER'),('other','TEACHER'),('admin','ADMIN'),('subject','STUDENT');
      INSERT INTO courses VALUES ('course','teacher','TRAINING_COURSE',false),('wrong-course','other','TRAINING_COURSE',false),('library','teacher','TRAINING_COURSE',true),('legacy','teacher','LEGACY_COURSE',false)`)
    for (const [id, course, owner, value] of [['task', 'course', 'teacher', flow], ['wrong-task', 'wrong-course', 'other', flow], ['free-task', 'course', 'teacher', { ...flow, quotaPolicy: undefined }], ['admin-task','course','admin',flow]] as const) {
      await db.query(`INSERT INTO composite_assessments(id,course_id,created_by,published_at,training_flow_digest,training_flow_frozen) VALUES ($1,$2,$3,'2026-10-18 12:00:00',$4,$5)`, [id, null, owner, digest, value])
      await db.query(`INSERT INTO questionnaire_course_deliveries VALUES ($1,$2)`, [id,course])
    }
    await db.query(`INSERT INTO training_material_experiments VALUES ('experiment','teacher','course','exp',$1)`, [digest])
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await db.end()
  })
  async function rejected(sql: string, values: unknown[] = []) {
    await db.query('BEGIN')
    try {
      await expect((async () => { await db.query(sql, values); await db.query('SET CONSTRAINTS ALL IMMEDIATE') })()).rejects.toThrow()
    } finally { await db.query('ROLLBACK') }
  }
  const claim = (id: string, task = 'task', group = 'A', algorithm = 'CRYPTO_QUOTA_WEIGHTED_V1', inherited: string | null = null, participant = 'user:subject') => db.query(`INSERT INTO training_material_allocation_claims VALUES ($1,'experiment',$2,'2026-10-18T12:00:00.000Z',$3,$4,$5,$6,$7,$8,$3,DEFAULT)`, [id, task, digest, participant, group, algorithm, inherited, `attempt-${id}`])
  const attempt = (id: string, task = 'task', participant = 'user:subject') => db.query(`INSERT INTO composite_assessment_attempts VALUES ($1,$2,$3,'subject','course')`, [`attempt-${id}`,task,participant])
  it('admits the authorized admin without allowing other teachers, libraries or legacy courses', async () => {
    await db.query(`INSERT INTO training_material_experiments VALUES ('admin-exp','admin','course','exp',$1)`, [digest])
    for (const [owner, course] of [['other','course'],['teacher','library'],['teacher','legacy']]) {
      await rejected(`INSERT INTO training_material_experiments VALUES ('bad',$1,$2,'exp',$3)`, [owner, course, digest])
    }
  })
  it('starts quota buckets at zero with exact frozen caps and canonical publication identity', async () => {
    await db.query(`INSERT INTO training_material_quota_buckets VALUES ('bucket','task','2026-10-18T12:00:00.000Z',$1,'A',2,0)`, [digest])
    await rejected(`INSERT INTO training_material_quota_buckets VALUES ('bad','task','2026-10-18T12:00:00.000Z',$1,'B',2,0)`, [digest])
    await rejected(`INSERT INTO training_material_quota_buckets VALUES ('bad','task','2026-10-18T12:00:00Z',$1,'B',1,0)`, [digest])
    await rejected(`INSERT INTO training_material_quota_buckets VALUES ('bad','task','2026-10-18T12:00:00.000Z',$1,'B',1,1)`, [digest])
  })
  it('commits claim-before-attempt and binding-before-claim atomically with one quota reservation', async () => {
    await db.query('BEGIN')
    try {
      await db.query(`UPDATE training_material_quota_buckets SET assigned_count=assigned_count+1 WHERE id='bucket'`)
      await db.query(`INSERT INTO training_material_subject_bindings VALUES ('binding','experiment','user:subject','A','first')`)
      await claim('first')
      await attempt('first')
      await db.query('SET CONSTRAINTS training_material_claim_scope, training_material_binding_scope, training_material_claim_attempt_fk, training_material_binding_initial_claim_fk IMMEDIATE')
      await db.query('COMMIT')
    } catch (error) { await db.query('ROLLBACK'); throw error }
  })
  it('allows material assignment without quotas and exact inherited linkage', async () => {
    await db.query('BEGIN')
    await attempt('inherited','free-task')
    await claim('inherited','free-task','A','LINKED_INHERIT_V1','first')
    await db.query('COMMIT')
    await db.query('BEGIN')
    await attempt('random','free-task','anon:random')
    await claim('random','free-task','B','CRYPTO_RANDOM_INT_V1',null,'anon:random')
    await db.query('COMMIT')
  })
  it('rejects incomplete claims and cross-course, participant, group and publication substitutions', async () => {
    for (const mutate of [
      async () => claim('missing'),
      async () => { await attempt('wrong','wrong-task'); await claim('wrong','wrong-task') },
      async () => { await attempt('subject'); await claim('subject','task','A','CRYPTO_QUOTA_WEIGHTED_V1',null,'user:other') },
      async () => { await attempt('group'); await claim('group','task','Z') },
      async () => { await attempt('inherit','free-task'); await claim('inherit','free-task','B','LINKED_INHERIT_V1','first') },
      async () => { await attempt('algorithm'); await claim('algorithm','task','A','CRYPTO_RANDOM_INT_V1') },
    ]) {
      await db.query('BEGIN')
      try { await expect((async () => { await mutate(); await db.query('SET CONSTRAINTS ALL IMMEDIATE') })()).rejects.toThrow() }
      finally { await db.query('ROLLBACK') }
    }
  })
  it('keeps receipt identity, consumed capacity, course and initial subject immutable', async () => {
    for (const sql of [
      `UPDATE training_material_experiments SET owner_id='admin'`,
      `UPDATE training_material_subject_bindings SET group_key='B'`,
      `UPDATE training_material_allocation_claims SET material_digest='${'b'.repeat(64)}'`,
      `DELETE FROM training_material_allocation_claims`,
      `DELETE FROM training_material_subject_bindings`,
      `DELETE FROM training_material_quota_buckets`,
      `UPDATE training_material_quota_buckets SET max_assigned=3`,
      `UPDATE training_material_quota_buckets SET assigned_count=0`,
      `UPDATE training_material_quota_buckets SET assigned_count=3`,
      `UPDATE courses SET is_library=true WHERE id='course'`,
      `UPDATE composite_assessments SET created_by='other' WHERE id='task'`,
      `UPDATE composite_assessment_attempts SET participant_key='user:other' WHERE id='attempt-first'`,
    ]) await rejected(sql)
  })
  it('publication retention: rejects V2 republishing, clearing, digest, weights and material mutations', async () => {
    for (const sql of [
      `UPDATE composite_assessments SET published_at='2026-10-19' WHERE id='task'`,
      `UPDATE composite_assessments SET training_flow_digest='${'b'.repeat(64)}' WHERE id='task'`,
      `UPDATE composite_assessments SET training_flow_frozen=NULL,training_flow_digest=NULL WHERE id='task'`,
      `UPDATE composite_assessments SET training_flow_frozen=jsonb_set(training_flow_frozen,'{experiment,groups,0,weight}','2') WHERE id='task'`,
      `UPDATE composite_assessments SET training_flow_frozen=jsonb_set(training_flow_frozen,'{experiment,groups,0,materialTitle}','"changed"') WHERE id='task'`,
      `UPDATE composite_assessments SET training_flow_frozen=jsonb_set(training_flow_frozen,'{experiment,groups,0,materialBody}','"changed"') WHERE id='task'`,
    ]) await rejected(sql)
  })
  it('publication retention: allows archive without changing frozen V2 publication', async () => {
    await db.query(`UPDATE composite_assessments SET status='ARCHIVED' WHERE id='task'`)
    const row=(await db.query(`SELECT status,training_flow_frozen,training_flow_digest FROM composite_assessments WHERE id='task'`)).rows[0]
    expect(row.status).toBe('ARCHIVED')
    expect(row.training_flow_frozen).toEqual(flow)
    expect(row.training_flow_digest).toBe(digest)
  })
  it('publication retention: leaves historical V1 and null publications mutable', async () => {
    for (const [id,config] of [['old-v1',{schemaVersion:1,blocks:[]}],['old-null',null]]) {
      await db.query(`INSERT INTO composite_assessments(id,course_id,created_by,published_at,training_flow_digest,training_flow_frozen)
        VALUES ($1,NULL,'teacher','2026-10-18',$2,$3)`,[id,digest,config])
      await db.query(`UPDATE composite_assessments SET published_at='2026-10-19',training_flow_frozen=$1,training_flow_digest=$2 WHERE id=$3`,
        [{schemaVersion:1,blocks:[{key:'changed'}]},'b'.repeat(64),id])
      expect((await db.query(`SELECT training_flow_digest FROM composite_assessments WHERE id=$1`,[id])).rows[0].training_flow_digest).toBe('b'.repeat(64))
    }
  })
})
