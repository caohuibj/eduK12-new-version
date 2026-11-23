import { describe, expect, it } from 'vitest'
import { ordinarySelfWholeAccessQuery } from '../../modules/assessment-run/ordinarySelfWholeAccess'

const sqlText = (q: any): string => (Array.isArray(q?.strings) ? q.strings.join('?') : String(q?.sql ?? q))

describe('ordinarySelfWholeAccessQuery progress fast path', () => {
  it('omits TOAST training_content_binding join predicates on read-only progress polls while retaining emergency-stop and form-section guards', () => {
    const progressSql = sqlText(ordinarySelfWholeAccessQuery('SCHOOL', 'user-1', { attemptId: 'attempt-1', mode: 'progress' }))
    expect(progressSql).toContain('assessment_run_executions')
    expect(progressSql).toContain('relational_assessment_assignments')
    expect(progressSql).toContain('composite_form_sections')
    expect(progressSql).toContain('scale_library_emergency_stops')
    expect(progressSql).toContain('p.training_content_binding_hash IS NOT NULL')
    expect(progressSql).not.toContain("p.training_content_binding#>>'{educationComposition,manifestHash}'")

    const fullSql = sqlText(ordinarySelfWholeAccessQuery('TEACHER', 'user-1', { attemptId: 'attempt-1' }))
    expect(fullSql).toContain("p.training_content_binding#>>'{educationComposition,manifestHash}'")
    expect(fullSql).toContain('scale_library_emergency_stops')
  })
})
