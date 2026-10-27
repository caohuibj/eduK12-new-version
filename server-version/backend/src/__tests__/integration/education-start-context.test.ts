import {describe,it,expect} from 'vitest'
import {issueVerifiedEducationStart,readVerifiedEducationStart} from '../../modules/assessment-run/education-start-context'
describe('transaction-bound education START context',()=>{
 it('retains exact server-verified product and refuses copied or cross-transaction/assignment/actor/runtime hints',()=>{
  const facts={tx:{},product:'TEACHER' as const,compositeId:'runtime',assignmentRef:'assignment',respondentUserId:'teacher'}
  const proof=issueVerifiedEducationStart(facts)
  expect(readVerifiedEducationStart(proof,facts)).toBe('TEACHER')
  expect(Object.isFrozen(proof)).toBe(true)
  expect(()=>readVerifiedEducationStart(JSON.parse(JSON.stringify(proof)),facts)).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
  for(const delta of [{tx:{}},{compositeId:'other'},{assignmentRef:'other'},{respondentUserId:'student'}])expect(()=>readVerifiedEducationStart(proof,{...facts,...delta})).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
 })
 it('keeps SCHOOL distinct and snapshots issuer facts against later mutation',()=>{
  const facts={tx:{},product:'SCHOOL' as 'SCHOOL'|'TEACHER',compositeId:'runtime',assignmentRef:'assignment',respondentUserId:'student'},proof=issueVerifiedEducationStart(facts)
  facts.product='TEACHER';expect(readVerifiedEducationStart(proof,facts)).toBe('SCHOOL')
 })
})
import {bindVerifiedEducationAttempt,readVerifiedEducationAttempt} from '../../modules/assessment-run/education-start-context'
it('binds teacher permission to one actual same-transaction parent and rejects forged, observer and cross-parent use',()=>{
 const facts={tx:{},product:'TEACHER' as const,compositeId:'runtime',assignmentRef:'assignment',respondentUserId:'teacher'},proof=issueVerifiedEducationStart(facts)
 const parent={id:'parent',compositeAssessmentId:'runtime',assignmentRef:'assignment',userId:'teacher',subjectUserId:'teacher',respondentUserId:'teacher'}
 const bound=bindVerifiedEducationAttempt(proof,facts.tx,parent)
 expect(readVerifiedEducationAttempt(bound,facts.tx,'parent','teacher')).toBe('TEACHER')
 expect(readVerifiedEducationAttempt(undefined,facts.tx,'parent','teacher')).toBeUndefined()
 for(const [tx,id,user]of [[{},'parent','teacher'],[facts.tx,'other','teacher'],[facts.tx,'parent','student']]as const)expect(()=>readVerifiedEducationAttempt(bound,tx,id,user)).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
 expect(()=>readVerifiedEducationAttempt({...bound},facts.tx,'parent','teacher')).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
 expect(()=>bindVerifiedEducationAttempt(proof,facts.tx,{...parent,subjectUserId:'student'})).toThrow('EDUCATION_START_CONTEXT_MISMATCH')
})
it('actual embedded SJT boundary still rejects ordinary Training, School and copied teacher hints',async()=>{
 const {createEmbeddedSituationalAttempt}=await import('../../modules/situational/situational-runtime.service')
 const tx={situationalAttempt:{findFirst:async()=>null}},parent={id:'parent',compositeAssessmentId:'runtime',assignmentRef:'assignment',userId:'teacher',subjectUserId:'teacher',respondentUserId:'teacher'}
 const input={userId:'teacher',participantKey:'synthetic',compositeAttemptId:'parent',compositeItemId:'item',compositeSlotKey:'slot',instrumentKey:'synthetic',instrumentVersion:'1.0.0',attemptEpoch:1}
 const release={situationPackage:{key:'synthetic',instrumentVersion:'1.0.0',definition:{respondentType:'teacher_self_report'}},snapshot:{}} as any
 await expect(createEmbeddedSituationalAttempt(tx as any,input,release)).rejects.toMatchObject({code:'INSTRUMENT_NOT_AVAILABLE'})
 const school=bindVerifiedEducationAttempt(issueVerifiedEducationStart({tx,product:'SCHOOL',compositeId:'runtime',assignmentRef:'assignment',respondentUserId:'teacher'}),tx,parent)
 await expect(createEmbeddedSituationalAttempt(tx as any,input,release,school)).rejects.toMatchObject({code:'INSTRUMENT_NOT_AVAILABLE'})
 const teacher=bindVerifiedEducationAttempt(issueVerifiedEducationStart({tx,product:'TEACHER',compositeId:'runtime',assignmentRef:'assignment',respondentUserId:'teacher'}),tx,parent)
 await expect(createEmbeddedSituationalAttempt(tx as any,input,release,{...teacher})).rejects.toThrow('EDUCATION_START_CONTEXT_MISMATCH')
})
