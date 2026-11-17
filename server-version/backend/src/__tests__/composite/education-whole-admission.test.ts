import { describe, expect, it } from 'vitest'
import { acceptsAsyncCompositeReport, acceptsEducationWholeMaterialization } from '../../config/assessmentReports'
import { wholeQuestionnaireSubmitSchema } from '../../modules/composite/whole-questionnaire.service'

const education = {
  runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', assignmentRef: 'assignment',
  compositeAssessment: { productKind: 'ORGANIZATION_RESOURCE', reportPackageKey: null, analysisProtocolKey: null },
}

describe('education whole admission', () => {
  it('admits a frozen organization run and keeps training questionnaires on the old gate', () => {
    const env = { ...process.env, ASSESSMENT_REPORT_ASYNC_ENABLED: 'true', ASSESSMENT_WHOLE_SUBMIT_ENABLED: 'true' }
    expect(acceptsEducationWholeMaterialization(education, env)).toBe(true)
    expect(acceptsAsyncCompositeReport(education, env)).toBe(false)
    expect(acceptsEducationWholeMaterialization({ ...education, assignmentRef: null }, env)).toBe(false)
    expect(acceptsEducationWholeMaterialization(education, { ...env, ASSESSMENT_WHOLE_SUBMIT_ENABLED: 'false' })).toBe(false)
  })

  it('accepts a form-only envelope and rejects an empty one', () => {
    const base = { submissionId: 's'.repeat(16), attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextSnapshotHash: null }
    expect(wholeQuestionnaireSubmitSchema.safeParse({ ...base, units: [], formAnswers: [{ sectionId: 'section', definitionHash: 'd'.repeat(16), answers: [] }] }).success).toBe(true)
    expect(wholeQuestionnaireSubmitSchema.safeParse({ ...base, units: [] }).success).toBe(false)
  })
})
