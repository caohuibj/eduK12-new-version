import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({parent:{} as any,read:vi.fn(),section:vi.fn(),child:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{compositeAssessmentAttempt:{findUnique:m.read}}}))
vi.mock('../../modules/composite/training-variant-child-scope',async original=>({
 ...await original<Record<string,unknown>>(),
 loadTrainingChildParent:async()=>m.parent,assertTrainingFormFinalPrincipal:()=>{},
 assertTrainingSectionSelected:async()=>m.parent,lockTrainingFlowFinalAdmission:vi.fn(),
}))
vi.mock('../../modules/assessment-runtime/form-admission.service',async original=>({...await original<Record<string,unknown>>(),ensureCompositeSectionAttempt:m.child}))
vi.mock('../../modules/assessment-run/educationPrivateFormExecution',()=>({assertPrivateFormSectionOwnership:m.section}))
import {submitUnifiedCompositeFormSectionFinal} from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
const id='00000000-0000-4000-8000-000000000001',sectionId='00000000-0000-4000-8000-000000000002'
const input={attemptId:id,sectionId,userId:'actor',attemptEpoch:1,submissionId:'00000000-0000-4000-8000-000000000003',definitionHash:'a'.repeat(64),answers:[]}
beforeEach(()=>{vi.clearAllMocks();m.parent={id,userId:'actor',compositeAssessment:{}}})
describe('Private Form FINAL dispatch does not treat missing product projection as legacy',()=>{
 it('reads the actual kind and rejects unknown organization section before creating a child',async()=>{
  m.read.mockResolvedValue({compositeAssessment:{productKind:'ORGANIZATION_RESOURCE'}})
  const error=Object.assign(new Error('Unknown section'),{code:'PRIVATE_FORM_SECTION_NOT_FOUND',statusCode:404})
  m.section.mockRejectedValue(error)
  await expect(submitUnifiedCompositeFormSectionFinal(input)).rejects.toBe(error)
  expect(m.read).toHaveBeenCalledWith({where:{id},select:{compositeAssessment:{select:{productKind:true}}}})
  expect(m.section).toHaveBeenCalledWith(id,sectionId);expect(m.child).not.toHaveBeenCalled()
 })
 it('fails closed if the missing projection cannot be resolved from a real parent',async()=>{
  m.read.mockResolvedValue(null)
  await expect(submitUnifiedCompositeFormSectionFinal(input)).rejects.toMatchObject({code:'STALE_ATTEMPT',statusCode:404})
  expect(m.section).not.toHaveBeenCalled();expect(m.child).not.toHaveBeenCalled()
 })
 it('keeps the known ordinary Questionnaire child path without an education-source query',async()=>{
  m.parent.compositeAssessment.productKind='QUESTIONNAIRE'
  const reached=new Error('ordinary child path');m.child.mockRejectedValue(reached)
  await expect(submitUnifiedCompositeFormSectionFinal(input)).rejects.toBe(reached)
  expect(m.read).not.toHaveBeenCalled();expect(m.section).not.toHaveBeenCalled();expect(m.child).toHaveBeenCalledOnce()
 })
})
