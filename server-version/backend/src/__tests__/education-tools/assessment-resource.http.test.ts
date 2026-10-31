import express from 'express'
import type {Server} from 'node:http'
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({directory:vi.fn(),teacherAdd:vi.fn(),repoAdd:vi.fn(),editor:vi.fn(),manager:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateHuiteacher:auth,authenticateSchool:auth}))
function auth(req:any,res:any,next:any){if(req.headers['x-fixture-auth']==='denied')return res.status(401).end();req.user={userId:'authenticated-actor',accountDomain:'SCHOOL'};next()}
vi.mock('../../modules/huiteacher/authority',()=>({requireTeacherProductAdmin:(req:any,res:any,next:any)=>req.headers['x-fixture-admin']==='denied'?res.status(403).end():next(),requireRecentTeacherMfa:(_req:any,_res:any,next:any)=>next()}))
vi.mock('../../modules/education-tools/assessment-resource.catalog',()=>({listEducationAssessmentResources:m.directory}))
vi.mock('../../modules/huiteacher/run.service',()=>({HuiteacherRunError:class extends Error{},addTeacherRunTrack:m.teacherAdd,addTeacherPrivateRunTrack:vi.fn(),addTeacherPrivateFormRunTrack:vi.fn(),previewTeacherRun:vi.fn(),publishTeacherRun:vi.fn(),progressTeacherRun:vi.fn(),closeTeacherRun:vi.fn(),cancelTeacherRun:vi.fn(),listTeacherAvailableScales:vi.fn()}))
vi.mock('../../modules/campus/activity.runs',()=>({assertCampusActivityRunEditor:m.editor,assertCampusActivityRunPublisher:vi.fn(),createCampusActivityRunDraft:vi.fn(),bindCampusActivityRun:vi.fn()}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({assertCurrentRunManagerBoundary:m.manager,assertCurrentRunPublisherBoundary:vi.fn(),assertRunExecutionParent:vi.fn()}))
vi.mock('../../modules/assessment-run/repository',async original=>({...await original<typeof import('../../modules/assessment-run/repository')>(),addAssessmentRunTrackDraft:m.repoAdd}))
vi.mock('../../utils/logger',()=>({logger:{error:vi.fn(),info:vi.fn(),warn:vi.fn(),debug:vi.fn()}}))
import teacherRouter from '../../modules/huiteacher/run.routes'
import schoolRouter from '../../modules/campus/activity.run.routes'
import {errorHandler} from '../../middleware/errorHandler'
import {createEducationAssessmentResourceAdapter} from '../../../../frontend/src/api/educationAssessmentResourceClient'
import {assessmentDirectory,assessmentResource,assessmentScope} from '../../../../frontend/src/test/educationAssessmentResources.fixture'
import {educationAssessmentTrackInput} from '../../../../frontend/src/api/educationAssessmentResources'
let server:Server,url:string
beforeAll(async()=>{
 const app=express();app.use(express.json());app.use('/api/huiteacher',teacherRouter);app.use('/api/campus',schoolRouter);app.use(errorHandler)
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('listener missing');url=`http://127.0.0.1:${address.port}`
})
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))})
beforeEach(()=>{
 vi.clearAllMocks();m.directory.mockImplementation(async input=>assessmentDirectory({...assessmentScope,product:input.product,organizationId:input.organizationId,workflowId:input.workflowId,runId:input.runId,expectedVersion:input.expectedVersion}))
 m.teacherAdd.mockResolvedValue({id:'teacher-track'});m.repoAdd.mockResolvedValue({id:'school-track'});m.editor.mockResolvedValue({activity:{status:'DRAFT'}});m.manager.mockResolvedValue(undefined)
})
const path=(product:'TEACHER'|'SCHOOL')=>product==='TEACHER'?`/api/huiteacher/organizations/${assessmentScope.organizationId}/evaluation-events/${assessmentScope.workflowId}/run`:`/api/campus/organizations/${assessmentScope.organizationId}/activities/${assessmentScope.workflowId}/runs/${assessmentScope.runId}`
const query=(product:'TEACHER'|'SCHOOL')=>new URLSearchParams({...(product==='TEACHER'?{runId:assessmentScope.runId}:{}),expectedVersion:'3'})

describe('synthetic real HTTP education catalog and track contracts (auth/services mocked, no PG claim)',()=>{
 it.each(['TEACHER','SCHOOL'] as const)('connects the real frontend factory through %s HTTP routes and forwards the version to the write service',async product=>{
  const scope={...assessmentScope,product},api=async<T>(resource:string,method='GET',data?:unknown):Promise<T>=>{
   const response=await fetch(url+(product==='TEACHER'?'/api/huiteacher':'/api/campus')+resource,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})
   const body=await response.json();if(!response.ok||body.code!==0)throw Error(body.message);return body.data as T
  }
  const adapter=createEducationAssessmentResourceAdapter(api,product)
  expect((await adapter.list(scope)).scope).toMatchObject({product,runId:scope.runId,expectedVersion:3})
  expect(m.directory).toHaveBeenCalledWith(expect.objectContaining({product,organizationId:scope.organizationId,workflowId:scope.workflowId,runId:scope.runId,expectedVersion:3,actor:{userId:'authenticated-actor',accountDomain:'SCHOOL'}}))
  const input=educationAssessmentTrackInput(scope,assessmentResource(scope))
  await adapter.addTrack(scope,input)
  const add=product==='TEACHER'?m.teacherAdd:m.repoAdd
  expect(add).toHaveBeenCalledWith(expect.objectContaining({...input,actorUserId:'authenticated-actor',organizationId:scope.organizationId,...(product==='TEACHER'?{eventId:scope.workflowId}:{runId:scope.runId})}))
  expect(JSON.stringify(m.directory.mock.calls)).not.toContain(scope.actorKey)
 })
 it.each(['TEACHER','SCHOOL'] as const)('strictly rejects missing/fractional version, malformed cursor and client actor flags for %s',async product=>{
  const target=url+path(product)+'/assessment-resources'
  for(const bad of [new URLSearchParams(),new URLSearchParams({...Object.fromEntries(query(product)),expectedVersion:'1.5'}),new URLSearchParams({...Object.fromEntries(query(product)),cursor:'foreign/session'}),new URLSearchParams({...Object.fromEntries(query(product)),actorKey:'forged'})])expect((await fetch(target+'?'+bad)).status).toBe(400)
  expect(m.directory).not.toHaveBeenCalled()
 })
 it.each(['TEACHER','SCHOOL'] as const)('requires expectedVersion for new %s namespace while preserving old Scale requests',async product=>{
  const scope={...assessmentScope,product},input=educationAssessmentTrackInput(scope,assessmentResource(scope)),target=url+path(product)+'/tracks'
  const post=(data:unknown)=>fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  for(const invalid of [{...input,expectedVersion:undefined},{...input,expectedVersion:'3'},{...input,expectedVersion:0},{...input,expectedRunId:undefined},{...input,approved:true}])expect((await post(invalid)).status).toBe(400)
  const old={...input,expectedVersion:undefined,resource:{family:'SCALE',key:'teacher-scale:legacy',version:'1.0.0'}}
  expect((await post(old)).status).toBe(200)
 })
 it('rejects a School run substituted in the POST body before reaching the repository',async()=>{
  const scope={...assessmentScope,product:'SCHOOL' as const},input=educationAssessmentTrackInput(scope,assessmentResource(scope))
  const response=await fetch(url+path('SCHOOL')+'/tracks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,expectedRunId:'99999999-9999-4999-8999-999999999999'})})
  expect(response.status).toBe(409);expect(m.repoAdd).not.toHaveBeenCalled()
 })
 it('keeps Teacher authentication and product-admin gates before directory lookup',async()=>{
  const target=url+path('TEACHER')+'/assessment-resources?'+query('TEACHER')
  expect((await fetch(target,{headers:{'x-fixture-auth':'denied'}})).status).toBe(401)
  expect((await fetch(target,{headers:{'x-fixture-admin':'denied'}})).status).toBe(403)
  expect(m.directory).not.toHaveBeenCalled()
 })
 it('keeps School current activity-editor permission before directory lookup',async()=>{
  m.editor.mockRejectedValueOnce(Object.assign(Error('activity-denied'),{statusCode:403}))
  expect((await fetch(url+path('SCHOOL')+'/assessment-resources?'+query('SCHOOL'))).status).toBe(403)
  expect(m.directory).not.toHaveBeenCalled()
 })
 it.each(['TEACHER','SCHOOL'] as const)('preserves %s stale-version refusal and infrastructure errors instead of an empty success',async product=>{
  const target=url+path(product)+'/assessment-resources?'+query(product)
  m.directory.mockRejectedValueOnce(Object.assign(Error('RUN_VERSION_CONFLICT'),{statusCode:409,code:'RUN_VERSION_CONFLICT'}))
  expect((await fetch(target)).status).toBe(409)
  m.directory.mockRejectedValueOnce(Error('PRIVATE_DB_FAILURE'))
  const response=await fetch(target);expect(response.status).toBe(500)
  const body=await response.json();expect(JSON.stringify(body)).not.toContain('PRIVATE_DB_FAILURE');expect(body.data?.list).toBeUndefined()
 })
})
