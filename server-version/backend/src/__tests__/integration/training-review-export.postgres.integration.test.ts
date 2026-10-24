import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Explicit opt-in only. Never reuse DATABASE_URL or run migrations against an existing DB.
const selected = process.env.TRAINING_REVIEW_SYNTHETIC_DATABASE_URL
const suite = selected ? describe : describe.skip
const schema = `review_fixture_${randomUUID().replaceAll('-', '')}`
let admin: Client, writer: Client
let db: typeof import('../../config/database').prisma
let service: typeof import('../../modules/assignment-review/selection')
let initialized = false
const previousUrl = process.env.DATABASE_URL
const lockKey = 'assignment-submission:a:s'

suite('isolated PostgreSQL review concurrency and export MVCC premise', () => {
  beforeAll(async () => {
    const url = new URL(selected!)
    if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1'
      || url.pathname !== '/eduk12_review_synthetic' || !url.port || url.username !== 'synthetic') {
      throw new Error('Explicit disposable loopback eduk12_review_synthetic database required')
    }
    admin = new Client({ connectionString: selected }); writer = new Client({ connectionString: selected })
    await admin.connect(); await writer.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`); initialized = true
    await admin.query(`SET search_path TO "${schema}"`)
    await writer.query(`SET search_path TO "${schema}"`)
    await admin.query(`CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED','GRADED');
      CREATE TABLE courses(id text PRIMARY KEY, creator_id text NOT NULL);
      CREATE TABLE assignments(id text PRIMARY KEY, course_id text NOT NULL REFERENCES courses(id));
      CREATE TABLE submissions(id text PRIMARY KEY, assignment_id text NOT NULL REFERENCES assignments(id),
        student_id text NOT NULL, revision integer NOT NULL DEFAULT 0, status "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
        comment text, reviewed_at timestamp(3), submitted_at timestamp(3), content text);
      CREATE TABLE export_rows(id text PRIMARY KEY, submitted_at timestamptz NOT NULL, content text NOT NULL);
      INSERT INTO courses VALUES ('c','owner'); INSERT INTO assignments VALUES ('a','c');`)
    url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '6')
    process.env.DATABASE_URL = url.toString()
    db = (await import('../../config/database')).prisma
    const actual = await db.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`
    if (actual[0]?.database !== 'eduk12_review_synthetic' || actual[0]?.schema !== schema) {
      throw new Error('Application Prisma client must use the exact fresh synthetic schema')
    }
    service = await import('../../modules/assignment-review/selection')
  }, 15000)

  beforeEach(async () => {
    await admin.query("TRUNCATE submissions, export_rows; UPDATE courses SET creator_id='owner'; INSERT INTO submissions(id,assignment_id,student_id) VALUES ('r','a','s')")
  })
  afterAll(async () => {
    await db?.$disconnect()
    if (initialized) { await writer.query('ROLLBACK'); await admin.query(`DROP SCHEMA "${schema}" CASCADE`) }
    await writer?.end(); await admin?.end()
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl
  })

  async function waitForBlockedGrade() {
    const end = Date.now() + 3000
    while (Date.now() < end) {
      const result = await admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")
      if (result.rowCount) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('Expected actual advisory-lock contention was not observed')
  }

  it('student lock blocks real grader; committed new revision is skipped', async () => {
    await writer.query('BEGIN'); await writer.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
    const grade = service.gradeReviewChunk('a', [{ id: 'r', revision: 0 }], 'old grade', 'owner', false)
    try {
      await waitForBlockedGrade()
      await writer.query("UPDATE submissions SET revision=1,content='new student answer' WHERE id='r'")
    } finally { await writer.query('COMMIT') }
    expect(await grade).toEqual({ count: 0 })
    expect((await admin.query("SELECT revision,status,content,comment FROM submissions WHERE id='r'")).rows[0])
      .toEqual({ revision: 1, status: 'SUBMITTED', content: 'new student answer', comment: null })
  })

  it('two real graders share one revision; retry cannot replace the winning comment', async () => {
    const results = await Promise.all(['first','second'].map(comment => service.gradeReviewChunk('a', [{id:'r', revision:0}], comment, 'owner', false)))
    expect(results.map(result => result.count).sort()).toEqual([0,1])
    const before = (await admin.query("SELECT revision,status,comment FROM submissions WHERE id='r'")).rows[0]
    expect(before.revision).toBe(1); expect(before.status).toBe('GRADED')
    expect(await service.gradeReviewChunk('a', [{id:'r', revision:0}], 'retry overwrite', 'owner', false)).toEqual({count:0})
    expect((await admin.query("SELECT revision,status,comment FROM submissions WHERE id='r'")).rows[0]).toEqual(before)
    // Existing submit uses this revision predicate under the same lock.
    await writer.query('BEGIN'); await writer.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
    const staleSubmit = await writer.query("UPDATE submissions SET content='stale',revision=revision+1 WHERE id='r' AND revision=0")
    await writer.query('COMMIT'); expect(staleSubmit.rowCount).toBe(0)
  })

  it('ownership change after pre-read is enforced by real update predicate', async () => {
    await writer.query('BEGIN'); await writer.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
    const grade = service.gradeReviewChunk('a', [{id:'r',revision:0}], 'forbidden', 'owner', false)
    try { await waitForBlockedGrade(); await writer.query("UPDATE courses SET creator_id='other' WHERE id='c'") }
    finally { await writer.query('COMMIT') }
    expect(await grade).toEqual({count:0})
  })

  it('5000 frozen IDs/revisions exclude later arrivals and remain bounded to 100-row chunks', async () => {
    await admin.query("DELETE FROM submissions; INSERT INTO submissions(id,assignment_id,student_id) SELECT 'r'||n,'a','s'||n FROM generate_series(1,5000) n")
    const rows = await db.submission.findMany({where:{assignmentId:'a'},select:{id:true,revision:true},orderBy:{id:'asc'},take:5000})
    const frozen = service.freezeSelection('owner','a',rows)
    expect(frozen.chunks).toHaveLength(50)
    await admin.query("INSERT INTO submissions(id,assignment_id,student_id) VALUES ('later','a','later')")
    let count = 0
    for (const token of frozen.chunks) {
      const chunk = service.readSelection(token,'owner','a'); expect(chunk.items.length).toBeLessThanOrEqual(100)
      count += (await service.gradeReviewChunk('a',chunk.items,'snapshot grade','owner',false)).count
    }
    expect(count).toBe(5000)
    expect((await admin.query("SELECT status,revision FROM submissions WHERE id='later'")).rows[0]).toEqual({status:'SUBMITTED',revision:0})
  }, 20000)

  it('real RepeatableRead keyset pages retain one version during timestamp/content update, insert and delete', async () => {
    // SQL-level MVCC premise only: actual controller query shape is covered separately.
    await admin.query("INSERT INTO export_rows SELECT lpad(n::text,4,'0'), '2026-10-01'::timestamptz + (n/3)*interval '1 second', 'old-'||n FROM generate_series(1,501) n")
    await writer.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    try {
      const expected = (await writer.query('SELECT * FROM export_rows ORDER BY submitted_at DESC,id DESC')).rows
      const page = (await writer.query('SELECT * FROM export_rows ORDER BY submitted_at DESC,id DESC LIMIT 250')).rows
      await admin.query("UPDATE export_rows SET submitted_at='2030-01-01',content='new' WHERE id IN ('0001','0501'); DELETE FROM export_rows WHERE id='0002'; INSERT INTO export_rows VALUES ('later','2031-01-01','later')")
      const actual = [...page]
      while (page.length) {
        const last = page[page.length-1]
        const next = (await writer.query('SELECT * FROM export_rows WHERE submitted_at < $1 OR (submitted_at=$1 AND id<$2) ORDER BY submitted_at DESC,id DESC LIMIT 250',[last.submitted_at,last.id])).rows
        page.splice(0,page.length,...next); actual.push(...next)
      }
      expect(actual).toEqual(expected); expect(new Set(actual.map(row=>row.id)).size).toBe(501)
    } finally { await writer.query('ROLLBACK') }
    expect((await admin.query("SELECT content FROM export_rows WHERE id='0001'")).rows[0].content).toBe('new')
  })
})
