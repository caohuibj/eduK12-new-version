import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260917020000_relational_assignment_persistence',
  'migration.sql',
)

describe('relational assessment persistence migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('relaxes pending consent without rewriting historical consent rows', () => {
    expect(sql).toContain('ALTER COLUMN "accepted_at" DROP NOT NULL')
    expect(sql).not.toMatch(/UPDATE\s+"assessment_attempt_consents"/i)
  })

  it('adds assignment persistence without altering legacy attempt tables', () => {
    expect(sql).toContain('CREATE TABLE "relational_assessment_assignments"')
    expect(sql).toContain('"relationship_snapshot_hash" TEXT NOT NULL')
    expect(sql).toContain('"visibility_policy_key" TEXT NOT NULL')
    expect(sql).toContain("'RELATIONAL_EXPERIENCE'")
    expect(sql).not.toMatch(/ALTER TABLE\s+"assessments"/i)
    expect(sql).not.toMatch(/ALTER TABLE\s+"composite_assessment_attempts"/i)
  })

  it('keeps relationship history restrict-linked and queryable by both actors', () => {
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE')
    expect(sql).toContain('"relational_assignment_respondent_status_idx"')
    expect(sql).toContain('"relational_assignment_subject_status_idx"')
    expect(sql).toContain('"relational_assignment_episode_respondent_resource_key"')
  })
})
