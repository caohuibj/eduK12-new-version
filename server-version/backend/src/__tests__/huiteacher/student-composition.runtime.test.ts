import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import express from 'express'
import type {Server} from 'node:http'
const m=vi.hoisted(()=>{
 process.env.DATA_ENCRYPTION_KEY='b'.repeat(64)
 return {query:vi.fn(),principal:vi.fn(),identity:vi.fn(),collection:vi.fn(),parent:vi.fn(),consent:vi.fn(),final:vi.fn()}
})
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../modules/organization/principal',async original=>({...await original<object>(),loadCurrentPrincipal:m.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>false}))
vi.mock('../../modules/admin-permissions/security',()=>({needsAdminKey:()=>false,validAdminProof:()=>false,ADMIN_STEP_UP_SECONDS:300}))
vi.mock('../../modules/assessment-run/educationCompositionExecution',()=>({readFrozenCompositionIdentity:m.identity,assertCompositionCollection:m.collection}))
vi.mock('../../modules/assessment-relational/runtime-consent',()=>({relationalRuntimeConsentAuthority:{assertCompositeFinal:m.consent}}))
vi.mock('../../modules/composite/composite.service',()=>({getAttemptState:m.parent}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{submitFinalScale:m.final,submitFinalFormSection:m.final,embeddedSituationalAsset:m.final}}))
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {generateToken} from '../../utils/jwt'
import type {UserRole} from '../../types'
import {studentCompositionRef} from '../../modules/huiteacher/studentCompositionResource'
import {studentCompositionRunPolicy} from '../../modules/huiteacher/studentComposition.policy'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'

// Actual HTTP authentication/current principal and SQL builder; persisted source,
// query rows and FINAL controllers are synthetic. PostgreSQL is owned by R.
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const student=id(1),teacher=id(2),attempt=id(3),item=id(4)
const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,
 organizationId:id(5),ownerUserId:id(6),toolId:id(7),versionId:id(8),contentHash:'a'.repeat(64),variantKey:'TEACHER:STUDENT_REPORT' as const}
const binding={origin,manifestHash:'b'.repeat(64),unitReports:[]},policy=studentCompositionRunPolicy({origin,binding,compositeId:id(9)})
const ref=studentCompositionRef(origin.versionId)
const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'scale:'+item,unitType:'SCALE',required:true,
 sourceDefinitionIdentity:{key:'fixed',version:'1',hash:'d'.repeat(64)},sourceBinding:{compositeItemId:item}}]})
const row={executionId:id(10),organizationId:origin.organizationId,runId:id(11),eventId:id(12),eventTitle:'Verified campaign',teacherName:'Verified target',family:'BUNDLE',
 status:'STARTED',runStatus:'PUBLISHED',runtimeBindingRef:attempt,resourceKey:ref.key,resourceVersion:ref.version,policy,policyHash:canonicalHash(policy),
 assignmentId:id(13),episodeId:id(14),bindingKind:'COMPOSITE',consentRequired:false,consentPurpose:null,consentVisibility:null,cursorCreatedAt:'2026-10-29T00:00:00.000001Z',
 attemptEpoch:1,frozenSlotSet:encryptFrozenActiveSlotSet(slots),frozenSlotSetHash:slots.snapshotHash}
const source={readIdentity:vi.fn(),assertUse:vi.fn()}
let server:Server,principal:Record<string,unknown>
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','true')
 principal={userId:student,username:'synthetic-student',accountDomain:'SCHOOL',role:'STUDENT',platformRole:'STANDARD',tokenVersion:1,isActive:true,isFrozen:false,mustChangePassword:false,expiresAt:null,teacherApproved:true}
 m.principal.mockImplementation(async()=>principal)
 m.identity.mockResolvedValue({origin,binding,compositeId:id(9),title:'Fixed classroom questionnaire',units:[{itemId:item,scaleId:id(15)}]})
 m.collection.mockResolvedValue(undefined);m.consent.mockResolvedValue(undefined)
 m.query.mockImplementation(async(query:{sql:string})=>query.sql.includes('SELECT slot.id')?[{id:item}]:[row])
 m.parent.mockResolvedValue({id:attempt,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:null})
 m.final.mockImplementation(async(req,res)=>res.json({code:0,data:{completed:true,receipt:req.query.response}}))
 const app=express();app.use(express.json());app.use('/api/huiteacher/student-assessments',createTeacherAssessmentRuntimeRouter(source,undefined,'STUDENT_EVALUATION'))
 app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(source))
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
 server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
})
afterEach(async()=>{vi.unstubAllEnvs();server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
async function request(path:string,product='HUITEACHER',method='GET'){
 const token=generateToken({userId:student,username:'synthetic-student',role:principal.role as UserRole,tokenVersion:1,accountDomain:'SCHOOL',...(product==='HUITEACHER'?{sessionProduct:'HUITEACHER' as const}:{})})
 const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/huiteacher`+path,{method,
  headers:{cookie:'huiteacher_session='+token,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({submissionId:'fixed-synthetic-final'})}:{})})
 return {status:response.status,data:await response.json() as any}
}
describe('Student composition runtime is separately mounted with exact persisted identity',()=>{
 it('checks product, current Student role and feature activation before any task/material read',async()=>{
  expect((await request('/student-assessments/my-assessment-tasks','SCHOOL')).status).toBe(401)
  expect((await request('/my-assessment-tasks')).status).toBe(404)
  principal.role='TEACHER';expect((await request('/student-assessments/my-assessment-tasks')).status).toBe(404)
  principal.role='STUDENT';vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','false')
  expect((await request('/student-assessments/my-assessment-tasks')).status).toBe(404)
  expect(m.query).not.toHaveBeenCalled();expect(m.parent).not.toHaveBeenCalled()
 })
 it('binds actual Student account, exact config/hash, rated Teacher, current population and canonical parent',async()=>{
  const response=await request('/student-assessments/my-assessment-tasks')
  expect(response.status).toBe(200);expect(response.data.data.list[0]).toMatchObject({teacherName:'Verified target',title:'Fixed classroom questionnaire',mode:'COMPOSITION'})
  expect(response.data.data.list[0]).not.toHaveProperty('policy')
  const sql=m.query.mock.calls[0][0].sql
  for(const predicate of ["actual_teacher.role='STUDENT'",'cfg.composition_version_id IS NOT NULL','cfg.composition_content_hash',"student_target.kind='PERSON'",
   "a.relationship_kind='CLASS_TEACHER_STUDENT'","a.perspective='OBSERVER_REPORT'","a.analysis_mode='COHORT_AGGREGATE'",'parent.assignment_ref=a.id','parent.episode_id=a.episode_id','organization_access_denies'])
   expect(sql).toContain(predicate)
  expect(source.readIdentity).not.toHaveBeenCalled();expect(m.collection).toHaveBeenCalledWith(expect.anything(),expect.anything(),'BOUND_COLLECTION')
 })
 it('forces Scale receipt-only FINAL; subject, consent and foreign SELF versions cannot use student routes',async()=>{
  const path='/student-assessments/assessment-composite-attempts/'+attempt
  expect((await request(path+'/items/'+item+'/scale/submit?response=full','HUITEACHER','POST')).status).toBe(200)
  expect(m.final.mock.calls[0][0].query.response).toBe('receipt')
  for(const child of ['/cognitive/'+id(90),'/situational/'+id(91)])
   expect((await request(path+'/items/'+item+child)).status).toBe(404)
  m.consent.mockRejectedValueOnce({code:'RELATIONAL_CONSENT_REQUIRED',statusCode:403})
  expect((await request(path)).status).toBe(403)
  m.identity.mockResolvedValueOnce({origin:{...origin,variantKey:'TEACHER:SELF'},compositeId:id(9),units:[]})
  expect((await request(path)).status).toBe(404)
  principal.role='TEACHER';expect((await request(path)).status).toBe(404)
  expect(m.final).toHaveBeenCalledTimes(1)
 })
})
