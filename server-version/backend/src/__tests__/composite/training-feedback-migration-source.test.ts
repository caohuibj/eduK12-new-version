import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const migration = readFileSync('prisma/migrations/20261019060000_training_feedback_release/migration.sql', 'utf8')
/** Source guardrails only; this suite does not establish PostgreSQL execution,
 * trigger behavior, concurrent admission safety or restored-database evidence. */
describe('Training feedback additive migration source guardrails', () => {
  it('adds nullable configuration without backfilling old publications or attempts', () => {
    expect(migration).toContain('ADD COLUMN training_feedback_policy JSONB')
    expect(migration).toContain('ADD COLUMN training_feedback_snapshot JSONB')
    expect(migration).not.toMatch(/UPDATE\s+composite_assessments\s+SET|UPDATE\s+composite_assessment_attempts\s+SET/i)
    expect(migration).not.toMatch(/ALTER\s+COLUMN|DROP\s|DISABLE\s+TRIGGER|CREATE\s+OR\s+REPLACE/i)
  })
  it('retains publication immutability even when status was reset after publishing', () => {
    expect(migration).toContain("OLD.published_at IS NOT NULL OR OLD.status::text<>'DRAFT'")
    expect(migration).toContain('Published Training feedback policy is immutable')
  })
  it('prevents multi-step published identity reset while permitting archive', () => {
    expect(migration).toContain('OLD.training_feedback_policy IS NOT NULL AND OLD.published_at IS NOT NULL')
    expect(migration).toContain("OLD.published_at IS DISTINCT FROM NEW.published_at OR NEW.status::text='DRAFT'")
    expect(migration).toContain('Published Training feedback publication identity cannot be reset')
    expect(migration).not.toContain("NEW.status::text='ARCHIVED'")
  })
  it('requires paired hashes and immutable historical-null attempt snapshots', () => {
    expect(migration).toContain('(training_feedback_policy IS NULL)=(training_feedback_policy_hash IS NULL)')
    expect(migration).toContain('(training_feedback_snapshot IS NULL)=(training_feedback_snapshot_hash IS NULL)')
    expect(migration).toContain('Training feedback attempt snapshot is immutable, including historical null')
    expect(migration).toContain('OLD.id,OLD.composite_assessment_id,OLD.user_id,OLD.access_token_id,OLD.delivery_course_id,OLD.attempt_epoch')
  })
  it('checks new-attempt publication configuration and null-safe COURSE scope', () => {
    expect(migration).toContain('FROM composite_assessments WHERE id=NEW.composite_assessment_id FOR SHARE')
    expect(migration).toContain('(p.training_feedback_policy IS NULL) IS DISTINCT FROM (NEW.training_feedback_snapshot IS NULL)')
    expect(migration).toContain("p.questionnaire_type::text IS DISTINCT FROM 'COURSE'")
    expect(migration).toContain("NEW.training_feedback_snapshot->>'roundId' IS DISTINCT FROM token_round")
  })
})
