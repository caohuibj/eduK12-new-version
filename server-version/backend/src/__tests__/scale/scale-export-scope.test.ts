import { describe, expect, it } from 'vitest'
import { scaleExportScope } from '../../services/scaleExportScope'
describe('scale export delivery ownership', () => {
  it('keeps internal callers on the historical standalone scope unless a server actor is supplied', () => {
    expect(scaleExportScope('scale-1')).toEqual({ scaleId: 'scale-1', compositeAttemptId: null })
  })
  it('only adds owned ordinary collection results and leaves organization/relational results behind their own gates', () => {
    expect(scaleExportScope('scale-1', { userId: 'owner' })).toEqual({
      scaleId: 'scale-1', OR: [
        { compositeAttemptId: null },
        { compositeAttempt: { is: { assignmentRef: null, compositeAssessment: { is: { createdBy: 'owner', productKind: 'QUESTIONNAIRE', reportPackageKey: null } } } } },
      ],
    })
  })
})
