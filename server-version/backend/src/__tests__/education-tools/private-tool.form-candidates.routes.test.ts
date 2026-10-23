import express from 'express'
import type {Server} from 'node:http'
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({scale:vi.fn(),form:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.service',()=>({listPrivateScaleRuntimeCandidates:m.scale,listPrivateFormRuntimeCandidates:m.form}))
vi.mock('../../modules/education-tools/private-tool.media.routes',async()=>{const {Router}=await import('express');return {educationPrivateToolMediaRouter:()=>Router()}})
vi.mock('../../modules/education-tools/private-tool.sharing.routes',async()=>{const {Router}=await import('express');return {privateToolSharingRouter:()=>Router()}})
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import type {AuthenticatedPrincipal} from '../../types'
let server:Server,base:string
const org='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',cursor='00000000-0000-4000-8000-000000000003'
beforeAll(async()=>{
 const app=express();app.use((req,_res,next)=>{req.user={userId:actor,accountDomain:'SCHOOL'} as AuthenticatedPrincipal;next()})
 for(const entry of ['SCHOOL','TEACHER'] as const)app.use(`/${entry}/organizations/:organizationId/private-tools`,educationPrivateToolRouter(entry))
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 const address=server.address();if(!address||typeof address==='string')throw Error('missing listener');base=`http://127.0.0.1:${address.port}`
})
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))})
beforeEach(()=>{vi.clearAllMocks();m.scale.mockResolvedValue({list:[],nextCursor:null});m.form.mockResolvedValue({list:[],nextCursor:null})})
describe('Product private FORM candidate HTTP dispatch',()=>{
 it('takes actual product/organization/actor from route context, with explicit FORM and unchanged SCALE default',async()=>{
  for(const entry of ['SCHOOL','TEACHER'] as const){
   const url=`${base}/${entry}/organizations/${org}/private-tools/runtime-candidates`
   expect((await fetch(url+'?kind=FORM&cursor='+cursor)).status).toBe(200)
   expect(m.form).toHaveBeenLastCalledWith({entry,organizationId:org,principal:{userId:actor,accountDomain:'SCHOOL'}},cursor)
   expect((await fetch(url)).status).toBe(200)
   expect(m.scale).toHaveBeenLastCalledWith({entry,organizationId:org,principal:{userId:actor,accountDomain:'SCHOOL'}},undefined)
  }
 })
 it('rejects unknown kinds and client scope injection before either service',async()=>{
  for(const query of ['kind=COGNITIVE','kind=FORM&entry=TEACHER','kind=FORM&organizationId='+org,'kind=FORM&cursor=bad']){
   const response=await fetch(`${base}/SCHOOL/organizations/${org}/private-tools/runtime-candidates?${query}`)
   expect(response.status).toBe(400);expect(await response.json()).toMatchObject({code:'PRIVATE_TOOL_INPUT_INVALID'})
  }
  expect(m.scale).not.toHaveBeenCalled();expect(m.form).not.toHaveBeenCalled()
 })
})
