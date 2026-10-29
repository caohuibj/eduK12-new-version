import {describe,expect,it} from 'vitest'
import {educationCompositionOriginSchema,educationCompositionKey,educationCompositionResourceKeySchema,
 matchesEducationCompositionRespondent,privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {assertPrivateAdministrationSelection} from '../../modules/education-tools/private-tool.run-contract'
import {issueVerifiedEducationStart,bindVerifiedEducationAttempt,readVerifiedEducationStart} from '../../modules/assessment-run/education-start-context'

const id='00000000-0000-4000-8000-000000000001'
const origin=(variantKey:string,entry='SCHOOL')=>({schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry,
 organizationId:id,ownerUserId:id,toolId:id,versionId:id,contentHash:'a'.repeat(64),variantKey})
describe('School ordinary questionnaires preserve exact observer identity',()=>{
 it('keeps School parent/homeroom modes distinct and Teacher SELF unchanged',()=>{
  for(const mode of ['SELF','PARENT_REPORT','TEACHER_REPORT']){
   const raw=origin('STUDENT:'+mode),parsed=educationCompositionOriginSchema.parse(raw)
   expect(educationCompositionResourceKeySchema.parse(educationCompositionKey(parsed))).toContain(':STUDENT:'+mode+':')
   expect(privateCompositionDefinitionSchema.safeParse({schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:mode},instruction:'',blocks:[]}).success).toBe(true)
   expect(educationCompositionOriginSchema.safeParse({...raw,entry:'TEACHER'}).success).toBe(false)
  }
  expect(educationCompositionResourceKeySchema.safeParse('education-composition:TEACHER:'+id+':TEACHER:PARENT_REPORT:1.0.0').success).toBe(false)
  expect(educationCompositionOriginSchema.safeParse(origin('TEACHER:SELF','TEACHER')).success).toBe(true)
  expect(privateCompositionDefinitionSchema.safeParse({schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'PARENT_REPORT'},instruction:'',blocks:[]}).success).toBe(false)
 })
 it('refuses SELF relabeling, reversed actors, same-person observers and unrelated teachers',()=>{
  const o=educationCompositionOriginSchema.parse(origin('STUDENT:PARENT_REPORT'))
  const pair={subjectUserId:'student',respondentUserId:'parent',subjectRole:'STUDENT',respondentRole:'PARENT',relationshipKind:'PARENT_CHILD',perspective:'OBSERVER_REPORT'}
  expect(matchesEducationCompositionRespondent(o,pair)).toBe(true)
  for(const delta of [{respondentRole:'STUDENT'},{subjectRole:'PARENT'},{relationshipKind:'SELF'},{perspective:'SELF_REPORT'},
   {respondentUserId:'student'},{subjectUserId:'parent'}])expect(matchesEducationCompositionRespondent(o,{...pair,...delta})).toBe(false)
  const t=educationCompositionOriginSchema.parse(origin('STUDENT:TEACHER_REPORT'))
  expect(matchesEducationCompositionRespondent(t,{...pair,respondentUserId:'teacher',respondentRole:'TEACHER',relationshipKind:'CLASS_TEACHER_STUDENT'})).toBe(true)
  expect(matchesEducationCompositionRespondent(t,{...pair,respondentUserId:'teacher',respondentRole:'TEACHER'})).toBe(false)
 })
 it('matches selectors and explicit teacher targets to the frozen mode, without accepting package instructions',()=>{
  const subjectSelector={kind:'MEMBERSHIP_IDS' as const,membershipIds:[id]},parent={subjectSelector,respondentSelector:{kind:'RELATED_PARENT' as const}}
  expect(()=>assertPrivateAdministrationSelection('PARENT_REPORT',parent)).not.toThrow()
  expect(()=>assertPrivateAdministrationSelection('SELF',parent)).toThrow('SELECTOR_COMBINATION_INVALID')
  expect(()=>assertPrivateAdministrationSelection('PARENT_REPORT',{subjectSelector,respondentSelector:subjectSelector})).toThrow('SELECTOR_COMBINATION_INVALID')
  expect(()=>assertPrivateAdministrationSelection('TEACHER_REPORT',{subjectSelector,respondentSelector:subjectSelector})).toThrow('TARGET_REQUIRED_OR_UNEXPECTED')
  expect(()=>assertPrivateAdministrationSelection('TEACHER_REPORT',{subjectSelector,respondentSelector:subjectSelector,targetPolicy:{mode:'HOMEROOM_TEACHER'}})).not.toThrow()
  const raw={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'PARENT_REPORT'},instruction:'',blocks:[]}
  for(const kind of ['COGNITIVE','SJT','COMPOSITION','BUNDLE','PACKAGE_REFERENCE'])
   expect(privateCompositionDefinitionSchema.safeParse({...raw,blocks:[{blockId:id,instruction:'',source:{provider:'PRIVATE_VERSION',kind,versionId:id,contentHash:'a'.repeat(64)}}]}).success).toBe(false)
 })
 it('binds the actual student and parent to the transaction proof and refuses a swapped student or ordinary product hint',()=>{
  const tx={},composition={origin:educationCompositionOriginSchema.parse(origin('STUDENT:PARENT_REPORT')),manifestHash:'b'.repeat(64),unitReports:[]}
  const facts={tx,product:'SCHOOL' as const,compositeId:'runtime',assignmentRef:'assignment',subjectUserId:'student',respondentUserId:'parent',composition}
  const proof=issueVerifiedEducationStart(facts),parent={id:'attempt',compositeAssessmentId:'runtime',assignmentRef:'assignment',userId:'parent',subjectUserId:'student',respondentUserId:'parent'}
  expect(readVerifiedEducationStart(proof,facts)).toBe('SCHOOL')
  expect(()=>bindVerifiedEducationAttempt(proof,tx,parent)).not.toThrow()
  expect(()=>bindVerifiedEducationAttempt(proof,tx,{...parent,subjectUserId:'other-student'})).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
  expect(()=>readVerifiedEducationStart({...proof},facts)).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
  expect(()=>issueVerifiedEducationStart({...facts,composition:undefined})).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
  expect(()=>issueVerifiedEducationStart({...facts,product:'TEACHER'})).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
 })
})
