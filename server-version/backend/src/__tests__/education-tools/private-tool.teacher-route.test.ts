import express from 'express'
import type {Server} from 'node:http'
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({privateAdd:vi.fn(),legacyAdd:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateHuiteacher:(req:any,_res:any,next:any)=>{req.user={userId:'server-actor'};next()}}))
vi.mock('../../modules/huiteacher/authority',()=>({requireTeacherProductAdmin:(req:any,res:any,next:any)=>req.headers['x-test-deny']?res.status(403).end():next(),requireRecentTeacherMfa:(_req:any,_res:any,next:any)=>next()}))
vi.mock('../../modules/huiteacher/run.service',()=>({HuiteacherRunError:class extends Error{},addTeacherPrivateRunTrack:m.privateAdd,addTeacherRunTrack:m.legacyAdd,
 previewTeacherRun:vi.fn(),publishTeacherRun:vi.fn(),progressTeacherRun:vi.fn(),closeTeacherRun:vi.fn(),cancelTeacherRun:vi.fn(),listTeacherAvailableScales:vi.fn()}))
import router from '../../modules/huiteacher/run.routes'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const body={expectedVersion:4,privateScale:{versionId:id(3),contentHash:'a'.repeat(64),administration:{population:'TEACHER',responseMode:'SELF'}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}}
let server:Server,url:string
beforeAll(async()=>{const app=express();app.use(express.json());app.use(router);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('missing listener');url=`http://127.0.0.1:${address.port}/organizations/${id(1)}/evaluation-events/${id(2)}/run/tracks`})
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))})
beforeEach(()=>{vi.clearAllMocks();m.privateAdd.mockResolvedValue({id:id(4)});m.legacyAdd.mockResolvedValue({id:id(5)})})
const post=(payload:unknown,deny=false)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(deny?{'x-test-deny':'1'}:{})},body:JSON.stringify(payload)})
describe('Actual Teacher product track route private branch',()=>{
 it('takes event identity only from path and actor only from authenticated middleware',async()=>{
  expect((await post(body)).status).toBe(200)
  expect(m.privateAdd).toHaveBeenCalledWith({organizationId:id(1),eventId:id(2),actorUserId:'server-actor'},body)
  expect(m.legacyAdd).not.toHaveBeenCalled()
 })
 it('retains Teacher product administrator gate before private owner use',async()=>{
  expect((await post(body,true)).status).toBe(403);expect(m.privateAdd).not.toHaveBeenCalled()
 })
 it('rejects client parent identity, dual resource and missing expected version',async()=>{
  for(const invalid of [{...body,parent:{kind:'TEACHER_EVENT',id:id(9)}},{...body,eventId:id(9)},{...body,resource:{family:'SCALE',key:'x',version:'1'}},{...body,expectedVersion:undefined}])expect((await post(invalid)).status).toBe(400)
  expect(m.privateAdd).not.toHaveBeenCalled();expect(m.legacyAdd).not.toHaveBeenCalled()
 })
 it('preserves the old resource request branch',async()=>{
  const legacy={resource:{family:'SCALE',key:'teacher-scale:original',version:'1.0.0'},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'original',minimumRespondents:null}}
  expect((await post(legacy)).status).toBe(200);expect(m.legacyAdd).toHaveBeenCalledWith({...legacy,organizationId:id(1),eventId:id(2),actorUserId:'server-actor'});expect(m.privateAdd).not.toHaveBeenCalled()
 })
})
