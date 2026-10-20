import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'

const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), execute: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  $queryRawUnsafe: db.query, $transaction: db.transaction, $executeRawUnsafe: db.execute,
} }))
import { courseCatalogPage } from '../../modules/training-catalog/course'
import { updateCatalogTags } from '../../modules/training-catalog/tags'

// Opt in only on an isolated test database. Temporary tables exercise the actual
// application SQL and historical nullable Scale shape, not full migration/Prisma proof.
const enabled = process.env.CATALOG_BOUNDARY_ISOLATED_TEST === '1' && Boolean(process.env.CATALOG_BOUNDARY_DATABASE_URL)
describe.runIf(enabled)('catalog boundary SQL on isolated PostgreSQL', () => {
  let client: Client
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.CATALOG_BOUNDARY_DATABASE_URL })
    await client.connect()
    await client.query('BEGIN')
    await client.query(`
      CREATE TEMP TABLE questionnaires (id text, name text, description text, tags text[] NOT NULL DEFAULT '{}', created_at timestamp(3), creator_id text, status text, type text, visibility text);
      CREATE TEMP TABLE course_questionnaires (questionnaire_id text, course_id text);
      CREATE TEMP TABLE composite_assessments (id text, name text, description text, tags text[] NOT NULL DEFAULT '{}', created_at timestamp(3), product_kind text, created_by text, status text, questionnaire_type text, course_id text);
      CREATE TEMP TABLE questionnaire_course_deliveries (composite_id text, course_id text);
      CREATE TEMP TABLE scales (id text PRIMARY KEY, name text, description text, tags text[], created_at timestamp(3), updated_at timestamp(3), creator_id text, status text, visibility text, definition text, revision integer);
      CREATE TEMP TABLE course_scales (scale_id text, course_id text);
      CREATE TEMP TABLE cognitive_assignments (id text, title text, instruction text, tags text[] NOT NULL DEFAULT '{}', created_at timestamp(3), created_by text, status text, course_id text, listed_standalone boolean);
      INSERT INTO scales VALUES
        ('before','before','',NULL,'2026-10-20 15:59:59.999','2026-10-01','teacher','PUBLISHED','COURSE','frozen',7),
        ('boundary','boundary','',NULL,'2026-10-20 16:00:00','2026-10-01','teacher','PUBLISHED','COURSE','frozen',7),
        ('within','within','',ARRAY['new'],'2026-10-21 01:00:00','2026-10-01','teacher','PUBLISHED','COURSE','frozen',7),
        ('end','end','',NULL,'2026-10-21 16:00:00','2026-10-01','teacher','PUBLISHED','COURSE','frozen',7),
        ('foreign','foreign','',NULL,'2026-10-21 01:00:00','2026-10-01','other','PUBLISHED','COURSE','frozen',7);
      INSERT INTO course_scales VALUES ('before','A'),('boundary','A'),('within','A'),('end','A'),('foreign','B');
    `)
    db.query.mockImplementation(async (sql: string, ...values: unknown[]) => (await client.query(sql, values)).rows)
    db.execute.mockImplementation(async (sql: string, ...values: unknown[]) => (await client.query(sql, values)).rowCount)
    db.transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries))
  })
  afterAll(async () => {
    if (client) { try { await client.query('ROLLBACK') } finally { await client.end() } }
  })
  it('matches offset/Z half-open boundaries, includes NULL tags without a filter, and fences atomic tag writes', async () => {
    const owner = { userId: 'teacher', role: 'TEACHER' }
    const offset = { from: '2026-10-21T00:00:00+08:00', to: '2026-10-22T00:00:00+08:00' }
    const utc = { from: '2026-10-20T16:00:00.000Z', to: '2026-10-21T16:00:00.000Z' }
    const actual = await courseCatalogPage('A', owner, offset)
    expect(actual).toEqual(await courseCatalogPage('A', owner, utc))
    expect(actual.total).toBe(2)
    expect(actual.list.map(row => row.id)).toEqual(['within', 'boundary'])
    expect(actual.list.find(row => row.id === 'boundary')!.tags).toEqual([])
    const tagged = await courseCatalogPage('A', owner, { ...offset, tags: 'new' })
    expect(tagged.total).toBe(1)
    expect(tagged.list.map(row => row.id)).toEqual(['within'])
    await expect(updateCatalogTags({ userId: 'other', role: 'TEACHER' }, 'boundary', { kind: 'SCALE', expectedTags: [], tags: ['forged'] })).rejects.toMatchObject({ statusCode: 409 })
    expect(await updateCatalogTags(owner, 'boundary', { kind: 'SCALE', expectedTags: [], tags: ['new'] })).toEqual({ tags: ['new'] })
    await expect(updateCatalogTags(owner, 'boundary', { kind: 'SCALE', expectedTags: [], tags: ['stale'] })).rejects.toMatchObject({ statusCode: 409 })
    expect((await courseCatalogPage('A', owner, { ...offset, tags: 'new' })).total).toBe(2)
    const saved = (await client.query("SELECT tags,status,definition,revision,updated_at > '2026-10-01'::timestamp AS updated FROM scales WHERE id='boundary'")).rows[0]
    expect(saved).toEqual({ tags: ['new'], status: 'PUBLISHED', definition: 'frozen', revision: 7, updated: true })
  })
})
