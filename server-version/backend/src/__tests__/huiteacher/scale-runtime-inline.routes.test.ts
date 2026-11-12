import express from 'express'
import type {Server} from 'node:http'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {UserRole} from '../../types'

const m=vi.hoisted(()=>({
  query:vi.fn(),principal:vi.fn(),scope:vi.fn(),start:vi.fn(),parent:vi.fn(),getAttempt:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../modules/organization/principal',async original=>({...await original<object>(),loadCurrentPrincipal:m.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>false}))
vi.mock('../../modules/admin-permissions/security',()=>({needsAdminKey:()=>false,validAdminProof:()=>false,ADMIN_STEP_UP_SECONDS:300}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.scope}))
vi.mock('../../modules/assessment-run/startExecution',()=>({startAssessmentRunExecution:m.start}))
vi.mock('../../modules/composite/composite.service',()=>({getAttemptState:m.parent}))
vi.mock('../../modules/assessment-relational/runtime-consent',()=>({relationalRuntimeConsentAuthority:{assertCompositeFinal:vi.fn(),assertCognitiveFinal:vi.fn()}}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{getAttempt:m.getAttempt,submitFinalScale:vi.fn(),submitFinalFormSection:vi.fn()}}))
vi.mock('../../modules/composite/composite-image.controller',()=>({compositeImageController:{authenticatedScaleImage:vi.fn()}}))
vi.mock('../../modules/composite/composite-video.controller',()=>({compositeVideoController:{authenticatedScaleVideo:vi.fn()}}))

import teacherScaleRouter from '../../modules/huiteacher/scaleRuntime.routes'
import {generateToken} from '../../utils/jwt'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor=id(1),execution=id(10),attempt=id(3),organization=id(4)
const proof={
  executionId:execution,organizationId:organization,runId:id(11),attemptId:attempt,
  assignmentId:null,resourceKey:'teacher-scale:'+id(8)+':INDIVIDUAL',resourceVersion:'1.0.0',
}
const currentUnit={id:attempt,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:null}

let server:Server,principal:Record<string,unknown>
beforeEach(async()=>{
  vi.clearAllMocks()
  principal={userId:actor,username:'scale-teacher',role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD',tokenVersion:1,isActive:true,isFrozen:false,mustChangePassword:false,expiresAt:null,teacherApproved:true}
  m.principal.mockImplementation(async()=>principal)
  m.query.mockResolvedValue([proof])
  m.scope.mockResolvedValue({productAdmin:true})
  m.start.mockResolvedValue({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:attempt,replayed:false})
  m.parent.mockResolvedValue(currentUnit)
  m.getAttempt.mockImplementation(async(req,res)=>{
    const state=await m.parent(req.params.attemptId,{userId:req.user.userId},undefined,'current-unit')
    res.json({code:0,data:state})
  })
  const app=express();app.use(express.json());app.use('/api/huiteacher',teacherScaleRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
})
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})

async function request(path:string,body?:unknown){
  const token=generateToken({userId:actor,username:'scale-teacher',role:principal.role as UserRole,accountDomain:'SCHOOL',tokenVersion:1,sessionProduct:'HUITEACHER'})
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/huiteacher`+path,{
    method:body===undefined?'GET':'POST',
    headers:{cookie:'huiteacher_session='+token,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const text=await response.text()
  return {status:response.status,value:response.headers.get('content-type')?.includes('json')?JSON.parse(text):{text}}
}

describe('Teacher Scale START inline currentUnit reuses GET authority',()=>{
  it('attaches currentUnit after the GET-equivalent attempt check',async()=>{
    const started=await request('/run-executions/'+execution+'/start-scale',{delivery:'inline'})
    expect(started.status).toBe(200)
    expect(started.value.data).toEqual({
      state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:attempt,replayed:false,currentUnit,
    })
    expect(m.start).toHaveBeenCalledWith({executionId:execution,actorUserId:actor})
    expect(m.scope).toHaveBeenCalledWith({actorUserId:actor,organizationId:organization,product:'HUITEACHER'})
    expect(m.parent).toHaveBeenCalledWith(attempt,{userId:actor},undefined,'current-unit')
    const read=await request('/composite-attempts/'+attempt)
    expect(read.status).toBe(200)
    expect(read.value.data).toEqual(currentUnit)
  })

  it('omits currentUnit when scale authority is revoked after START commits',async()=>{
    let seen=0
    m.query.mockImplementation(async()=>{
      seen+=1
      if(seen>1)return []
      return [proof]
    })
    const started=await request('/run-executions/'+execution+'/start-scale',{delivery:'inline'})
    expect(started.status).toBe(200)
    expect(started.value.data).toEqual({
      state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:attempt,replayed:false,
    })
    expect(started.value.data).not.toHaveProperty('currentUnit')
    expect(m.start).toHaveBeenCalledTimes(1)
    expect(m.parent).not.toHaveBeenCalled()
    const denied=await request('/composite-attempts/'+attempt)
    expect(denied.status).toBe(404)
  })
})
