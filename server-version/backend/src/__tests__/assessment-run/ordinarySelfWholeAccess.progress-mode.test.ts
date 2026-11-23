import { describe, expect, it } from 'vitest'
import { ordinarySelfWholeAccessQuery } from '../../modules/assessment-run/ordinarySelfWholeAccess'

const sqlText = (q: any): string => (Array.isArray(q?.strings) ? q.strings.join('?') : String(q?.sql ?? q))

describe('ordinarySelfWholeAccessQuery progress fast path', () => {
  it('omits TOAST training_content_binding jsonb_array_elements on read-only progress polls while keeping full mode intact', () => {
    const progressSql = sqlText(ordinarySelfWholeAccessQuery('SCHOOL', 'user-1', { attemptId: 'attempt-1', mode: 'progress' }))
    expect(progressSql).toContain('assessment_run_executions')
    expect(progressSql).toContain('relational_assessment_assignments')
    expect(progressSql).toContain('p.training_content_binding_hash IS NOT NULL')
    expect(progressSql).not.toContain('jsonb_array_elements')
    expect(progressSql).not.toContain('scale_library_emergency_stops')

    const fullSql = sqlText(ordinarySelfWholeAccessQuery('TEACHER', 'user-1', { attemptId: 'attempt-1' }))
    expect(fullSql).toContain('jsonb_array_elements')
    expect(fullSql).toContain('scale_library_emergency_stops')
  })
})
