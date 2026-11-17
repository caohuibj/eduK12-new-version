import { describe, expect, it } from 'vitest'
import { acceptsAsyncCompositeReport, acceptsEducationWholeMaterialization, isEducationWholeAttempt } from '../../config/assessmentReports'
import { educationWholeBlocksPriorSnapshots } from '../../modules/assessment-runtime/report-outbox.service'
import { wholeLocalExecutionMode } from '../../modules/composite/whole-local-eligibility'
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
    expect(isEducationWholeAttempt(education)).toBe(true)
    expect(acceptsEducationWholeMaterialization(education, { ...env, ASSESSMENT_REPORT_ASYNC_ENABLED: 'false', ASSESSMENT_WHOLE_SUBMIT_ENABLED: 'false' })).toBe(false)
    expect(isEducationWholeAttempt(education)).toBe(true)
  })

  it('keeps a partially submitted form on the stepped path and requires admission to be open', () => {
    const open = { shapeEligible: true, admissionOpen: true }
    expect(wholeLocalExecutionMode({ ...open, units: [{ type: 'FORM_SECTION', completed: true }] })).toBe('STEPPED')
    expect(wholeLocalExecutionMode({ ...open, units: [{ type: 'SCALE', completed: true }, { type: 'FORM_SECTION', completed: false }] })).toBe('STEPPED')
    expect(wholeLocalExecutionMode({ ...open, units: [{ type: 'FORM', completed: true }] })).toBe('WHOLE_LOCAL')
    expect(wholeLocalExecutionMode({ shapeEligible: true, admissionOpen: false, units: [{ type: 'SCALE', completed: false }] })).toBe('STEPPED')
    expect(wholeLocalExecutionMode({ ...open, units: [{ type: 'FORM_SECTION', completed: false }] })).toBe('WHOLE_LOCAL')
  })

  it('rejects an education whole receipt after any stepped unit snapshot', () => {
    expect(educationWholeBlocksPriorSnapshots([{ unitType: 'FORM_SECTION' }])).toBe(true)
    expect(educationWholeBlocksPriorSnapshots([{ unitType: 'SCALE' }])).toBe(true)
    expect(educationWholeBlocksPriorSnapshots([])).toBe(false)
  })

  it('accepts a form-only envelope and rejects an empty one', () => {
    const base = { submissionId: 's'.repeat(16), attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextSnapshotHash: null }
    expect(wholeQuestionnaireSubmitSchema.safeParse({ ...base, units: [], formAnswers: [{ sectionId: 'section', definitionHash: 'd'.repeat(16), answers: [] }] }).success).toBe(true)
    expect(wholeQuestionnaireSubmitSchema.safeParse({ ...base, units: [] }).success).toBe(false)
  })
})
