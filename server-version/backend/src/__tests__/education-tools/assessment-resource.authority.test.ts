import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({workflow:vi.fn(),manager:vi.fn(),member:vi.fn(),source:vi.fn(),distribution:vi.fn()}))
vi.mock('../../modules/assessment-run/educationLibraryContext',()=>({readEducationRunLibraryContext:m.workflow}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({assertCurrentRunManagerBoundary:m.manager}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.member}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({readEducationAssessmentDeliveryIdentity:m.source,
 EducationAssessmentSourceError:class extends Error{constructor(readonly code:string){super(code)}}}))
vi.mock('../../modules/education-tools/assessment-resource.distribution',()=>({assertEducationAssessmentDistributionCurrent:m.distribution}))
import {assertEducationAssessmentRunUse} from '../../modules/education-tools/assessment-resource.authority'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const proof=(n:number)=>({kind:'PRODUCT_ADMIN',actorId:id(n),membershipId:id(n+10),grantId:id(n+20)})
const db={$queryRaw:vi.fn(async()=>[{id:'matched-original-grant'}])}
const input={actorUserId:'current-admin',organizationId:'org',runId:'run',resource:{family:'COGNITIVE',key:'exact-resource',version:'1.0.0'}}
beforeEach(()=>{vi.clearAllMocks();m.distribution.mockReset().mockResolvedValue(undefined);m.workflow.mockResolvedValue({product:'TEACHER',teacherEventId:'event',schoolCourseId:null});m.manager.mockResolvedValue(undefined)
 m.source.mockResolvedValue({origin:{product:'TEACHER',organizationId:'org',family:'COGNITIVE'},authority:[proof(1),proof(2),proof(3)],identityOnly:true})
 db.$queryRaw.mockResolvedValue([{id:'matched-original-grant'}]);m.member.mockImplementation(async(scope)=>({productAdmin:true,membershipId:id(Number(scope.actorUserId.slice(-12))+10)}))})
describe('exact education delivery use authority',()=>{
 it('reuses the persisted workflow and checks all original authorities, not current admin as replacement',async()=>{
  await expect(assertEducationAssessmentRunUse(db as never,input)).resolves.toMatchObject({identityOnly:true})
  expect(m.workflow).toHaveBeenCalledTimes(2);expect(m.manager).toHaveBeenCalledWith(input,db)
  expect(m.member.mock.calls.map(([scope])=>scope.actorUserId)).toEqual([id(1),id(2),id(3)])
 })
 it.each(['product','organizationId','family'])('refuses substituted %s without issuer lookup',async field=>{
  m.source.mockResolvedValue({origin:{product:'TEACHER',organizationId:'org',family:'COGNITIVE',[field]:'different'},authority:{}})
  await expect(assertEducationAssessmentRunUse(db as never,input)).rejects.toThrow('WORKFLOW_MISMATCH');expect(m.member).not.toHaveBeenCalled()
 })
 it('refuses when the actual product workflow changes while acquiring its organization lock',async()=>{
  m.workflow.mockReset().mockResolvedValueOnce({product:'TEACHER',teacherEventId:'event',schoolCourseId:null}).mockResolvedValueOnce({product:'SCHOOL',teacherEventId:null,schoolCourseId:'activity'})
  await expect(assertEducationAssessmentRunUse(db as never,input)).rejects.toThrow('WORKFLOW_CHANGED');expect(m.source).not.toHaveBeenCalled()
 })
 it('rejects a revoked original reviewer even if the requesting manager remains qualified',async()=>{
  m.member.mockImplementation(async(scope)=>scope.actorUserId===id(2)?null:{productAdmin:true,membershipId:id(Number(scope.actorUserId.slice(-12))+10)})
  await expect(assertEducationAssessmentRunUse(db as never,input)).rejects.toThrow('ORIGINAL_ISSUER_REVOKED')
 })
 it('accepts a currently authorized professional through the existing capability resolver',async()=>{
  m.source.mockResolvedValue({origin:{product:'TEACHER',organizationId:'org',family:'COGNITIVE'},authority:[1,2,3].map(n=>({kind:'PSYCHOLOGY_STAFF',actorId:id(n),membershipId:id(n+10),personaGrantId:id(n+20),capabilityGrantId:id(n+30)})),identityOnly:true})
  m.member.mockImplementation(async(scope)=>scope.requiredCapability==='PSYCHOLOGY_STAFF'?{productAdmin:false,membershipId:id(Number(scope.actorUserId.slice(-12))+10)}:null)
  await expect(assertEducationAssessmentRunUse(db as never,input)).resolves.toMatchObject({identityOnly:true})
  expect(m.member.mock.calls.filter(([scope])=>scope.requiredCapability==='PSYCHOLOGY_STAFF')).toHaveLength(3)
 })
})

it('does not accept a later valid administrator role when the original grant row is gone',async()=>{
 db.$queryRaw.mockReset().mockResolvedValue([])
 await expect(assertEducationAssessmentRunUse(db as never,input)).rejects.toThrow('ORIGINAL_ISSUER_REVOKED')
 expect(m.member).toHaveBeenCalled()
})

it('rejects withdrawn exact distribution authority before returning new-use permission',async()=>{
 m.distribution.mockRejectedValue(new Error('CONTENT_AUTHORITY_DENIED'))
 await expect(assertEducationAssessmentRunUse(db as never,input)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
 expect(m.distribution).toHaveBeenCalledWith(db,(await m.source.mock.results[0].value).origin)
})
