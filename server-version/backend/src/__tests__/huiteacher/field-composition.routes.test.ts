import express from 'express'
import type {Server} from 'node:http'
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import type {UserRole} from '../../types'
const m=vi.hoisted(()=>({principal:vi.fn(),current:vi.fn(),read:vi.fn(),start:vi.fn(),parent:vi.fn(),final:vi.fn(),media:vi.fn(),admin:vi.fn(),evidence:vi.fn()}))
vi.mock('../../modules/organization/principal',async original=>({...await original<object>(),loadCurrentPrincipal:m.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>false}))
vi.mock('../../modules/admin-permissions/security',()=>({needsAdminKey:()=>false,validAdminProof:()=>false,ADMIN_STEP_UP_SECONDS:300}))
vi.mock('../../modules/huiteacher/fieldComposition.authority',async original=>({...await original<typeof import('../../modules/huiteacher/fieldComposition.authority')>(),currentFieldComposition:m.current}))
vi.mock('../../modules/huiteacher/fieldComposition.service',()=>({readInvitedFieldComposition:m.read,startInvitedFieldComposition:m.start}))
vi.mock('../../modules/huiteacher/fieldForm.service',async()=>{const {FieldCompositionError}=await import('../../modules/huiteacher/fieldComposition.authority');return {HuiteacherFieldFormError:FieldCompositionError,readSubmittedHuiteacherFieldFormEvidence:m.evidence,readInvitedHuiteacherFieldForm:m.read,readManagerHuiteacherFieldForm:m.read,bindHuiteacherFieldForm:m.start}})
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.admin}))
vi.mock('../../modules/composite/composite.service',()=>({getAttemptState:m.parent}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{submitFinalScale:m.final,submitFinalFormSection:m.final}}))
vi.mock('../../modules/composite/composite-image.controller',()=>({compositeImageController:{authenticatedFormImage:m.media,authenticatedScaleImage:m.media}}))
vi.mock('../../modules/composite/composite-video.controller',()=>({compositeVideoController:{authenticatedFormVideo:m.media,authenticatedScaleVideo:m.media}}))
import router from '../../modules/huiteacher/fieldComposition.routes'
import evidenceRouter from '../../modules/huiteacher/fieldForm.routes'
import {FieldCompositionError} from '../../modules/huiteacher/fieldComposition.authority'
import {generateToken} from '../../utils/jwt'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,actor=id(1),invitation=id(2),attempt=id(3),unit=id(4)
let server:Server,principal:Record<string,unknown>
beforeEach(async()=>{
 vi.clearAllMocks();principal={userId:actor,username:'expert',role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:1,isActive:true,isFrozen:false,mustChangePassword:false,expiresAt:null,teacherApproved:true}
 m.principal.mockImplementation(async()=>principal);m.current.mockResolvedValue({scope:{}});m.admin.mockResolvedValue({productAdmin:true})
 m.read.mockResolvedValue({title:'Fixed expert',assessmentRef:{},attemptId:null});m.start.mockResolvedValue({attemptId:attempt})
 m.parent.mockResolvedValue({id:attempt,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:null,answers:[{secret:'not delivered'}]})
 m.final.mockImplementation(async(req,res)=>res.json({code:0,data:{receipt:req.query.response}}));m.media.mockImplementation(async(_req,res)=>res.status(200).end('owned media'))
 m.evidence.mockResolvedValue({units:[{kind:'FORM',items:[{prompt:'Evidence',value:'Explicit expert text'}]}]})
 const app=express();app.use(express.json());app.use('/api/huiteacher/field-assessments',router);app.use('/api/huiteacher',evidenceRouter)
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
 server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
})
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
async function request(path:string,options:{body?:unknown;product?:'HUITEACHER'|'SCHOOL';mfaAge?:number}={}){
 const token=generateToken({userId:actor,username:'expert',role:principal.role as UserRole,accountDomain:'SCHOOL',tokenVersion:1,
  ...(options.product==='SCHOOL'?{}:{sessionProduct:'HUITEACHER' as const}),...(options.mfaAge===undefined?{}:{mfaVerifiedAt:Math.floor(Date.now()/1000)-options.mfaAge})})
 const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/huiteacher`+path,{method:options.body===undefined?'GET':'POST',headers:{cookie:'huiteacher_session='+token,'content-type':'application/json'},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})})
 const value=await response.text();return {status:response.status,text:value,...(response.headers.get('content-type')?.includes('json')?{value:JSON.parse(value)}:{})}
}
describe('Expert field routes retain their own invitation and evidence authority',()=>{
 it('requires the actual Teacher product session/account and never substitutes student/SELF task authority',async()=>{
  expect((await request('/field-assessments/invitations/'+invitation,{product:'SCHOOL'})).status).toBe(401)
  principal.role='STUDENT';expect((await request('/field-assessments/invitations/'+invitation)).status).toBe(404)
  expect(m.read).not.toHaveBeenCalled();principal.role='TEACHER'
  expect((await request('/field-assessments/invitations/'+invitation)).status).toBe(200)
  expect(m.read).toHaveBeenCalledWith({invitationId:invitation,actorUserId:actor})
  expect((await request('/field-assessments/invitations/'+invitation+'/start',{body:{subjectUserId:id(99),respondentUserId:actor}})).status).toBe(400)
  expect(m.start).not.toHaveBeenCalled()
  expect((await request('/field-assessments/invitations/'+invitation+'/start',{body:{}})).status).toBe(200)
  expect(m.start).toHaveBeenCalledWith({invitationId:invitation,actorUserId:actor})
 })
 it('checks exact field parent/current grant before state, stored material and FINAL and returns explicit revocation errors',async()=>{
  const path='/field-assessments/assessment-composite-attempts/'+attempt
  m.current.mockRejectedValue(new FieldCompositionError('HUITEACHER_FIELD_QUESTIONNAIRE_UNAVAILABLE',403))
  for(const suffix of ['', '/items/'+unit+'/scale/assets/'+id(5)+'/content','/form-sections/'+unit+'/assets/'+id(5)+'/content'])expect((await request(path+suffix)).status).toBe(403)
  expect((await request(path+'/items/'+unit+'/scale/submit',{body:{}})).status).toBe(403)
  expect(m.parent).not.toHaveBeenCalled();expect(m.media).not.toHaveBeenCalled();expect(m.final).not.toHaveBeenCalled()
  m.current.mockResolvedValue({scope:{}});expect((await request(path)).status).toBe(200)
  expect(m.current).toHaveBeenLastCalledWith(expect.anything(),{attemptId:attempt,actorUserId:actor})
  expect((await request('/field-assessments/assessment-composite-attempts/not-a-uuid')).status).toBe(400)
 })
 it('uses native Scale/Form finals, forces receipt-only Scale response and mounts no personal report, cognitive or SJT execution',async()=>{
  const path='/field-assessments/assessment-composite-attempts/'+attempt
  expect((await request(path+'/items/'+unit+'/scale/submit?response=full',{body:{submissionId:id(9)}})).value.data.receipt).toBe('receipt')
  expect((await request(path+'/form-sections/'+unit+'/submit',{body:{submissionId:id(9)}})).status).toBe(200)
  for(const suffix of ['/report','/restart','/items/'+unit+'/cognitive','/items/'+unit+'/situational','/answers'])expect((await request(path+suffix,{body:{}})).status).toBe(404)
  expect(m.final).toHaveBeenCalledTimes(2)
 })
 it('requires current product administrator and recent MFA for formal evidence and preserves expert purpose text without a teacher/self-report fallback',async()=>{
  const path='/organizations/'+id(10)+'/evaluation-events/'+id(11)+'/field-notes/'+id(12)+'/form-evidence'
  expect((await request(path)).status).toBe(403);expect((await request(path,{mfaAge:301})).status).toBe(403)
  m.admin.mockResolvedValueOnce(null);expect((await request(path,{mfaAge:0})).status).toBe(403)
  expect(m.evidence).not.toHaveBeenCalled();const result=await request(path,{mfaAge:0})
  expect(result.status).toBe(200);expect(result.text).toContain('Explicit expert text')
  expect(m.evidence).toHaveBeenCalledWith({organizationId:id(10),eventId:id(11),recordId:id(12),actorUserId:actor})
 })
})
