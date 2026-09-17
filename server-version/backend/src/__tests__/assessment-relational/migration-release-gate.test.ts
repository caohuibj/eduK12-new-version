import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = (name: string) => readFileSync(join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'), 'utf8')

describe('RA-01 migration release gate', () => {
  it('keeps assignment persistence additive and pending consent nullable', () => {
    const sql = migration('20260917020000_relational_assignment_persistence')
    expect(sql).toContain('ALTER COLUMN "accepted_at" DROP NOT NULL')
    expect(sql).toContain('CREATE TABLE "relational_assessment_assignments"')
    expect(sql).toContain('ON DELETE RESTRICT')
    expect(sql).not.toMatch(/UPDATE\s+"assessment_attempt_consents"/i)
    expect(sql).not.toMatch(/ALTER TABLE\s+"assessments"/i)
    expect(sql).not.toMatch(/ALTER TABLE\s+"composite_assessment_attempts"/i)
  })

  it('persists relational analysis outside attempt/final tables', () => {
    const sql = migration('20260917030000_relational_analysis_snapshots')
    expect(sql).toContain('CREATE TABLE "relational_analysis_snapshots"')
    expect(sql).toContain('"respondent_count" >= 3')
    expect(sql).toContain('"input_result_hashes_json" JSONB NOT NULL')
    expect(sql).not.toMatch(/ALTER TABLE\s+"assessments"/i)
    expect(sql).not.toMatch(/ALTER TABLE\s+"assessment_unit_snapshots"/i)
    expect(sql).not.toMatch(/ALTER TABLE\s+"composite_assessment_attempts"/i)
  })
})
