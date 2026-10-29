import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
const m=vi.hoisted(()=>{process.env.DATA_ENCRYPTION_KEY='b'.repeat(64);return {principal:vi.fn(),feedback:vi.fn(),image:vi.fn()}})
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn()}}))
vi.mock('../../modules/organization/principal',async original=>({...await original<object>(),loadCurrentPrincipal:m.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>false}))
vi.mock('../../modules/admin-permissions/security',()=>({needsAdminKey:()=>false,validAdminProof:()=>false,ADMIN_STEP_UP_SECONDS:300}))
vi.mock('../../modules/reporting/education-ordinary-feedback.service',()=>({readTeacherOrdinaryFeedback:m.feedback}))
vi.mock('../../modules/assessment-media/assessment-image-delivery',async original=>({...await original<object>(),serveAssessmentImageContent:m.image}))
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'

// Real HTTP/auth/router/asset projection; current report rights and asset storage
// are fixtures. Real per-block rights/scoring are covered by the earlier PG journey.
const actor='00000000-0000-4000-8000-000000000001',execution='00000000-0000-4000-8000-000000000002'
const asset={assetId:'synthetic-approved-report-image',contentHash:'a'.repeat(64),mimeType:'image/png'}
const path='/run-executions/'+execution+'/feedback/images/',cookie=()=> 'huiteacher_session='+generateToken({
 userId:actor,username:'synthetic',role:UserRole.TEACHER,tokenVersion:1,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER'})
let server:Server|undefined
async function request(suffix:string,credential=cookie()){
 if(!server){
  const app=express();app.use(createTeacherAssessmentRuntimeRouter({readIdentity:vi.fn(),assertUse:vi.fn()}))
  app.use((error:{statusCode?:number;code?:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode??500).json({code:error.code??'UNKNOWN'}))
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
 }
 return fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+path+suffix,{headers:{cookie:credential}})
}
beforeEach(()=>{
 vi.clearAllMocks()
 m.principal.mockResolvedValue({userId:actor,username:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD',tokenVersion:1,
  mustChangePassword:false,isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true})
 m.feedback.mockResolvedValue({units:[{blockId:'visible',kind:'SCALE',state:'READY',nativeScaleUnits:[{type:'SCALE',rawScoreFeedback:[{
  images:[{asset,altText:'Synthetic permitted image',order:0}],
 }]}]},{blockId:'hidden',kind:'SCALE',state:'WITHHELD'},{blockId:'form',kind:'FORM',state:'COMPLETION_ONLY'}]})
 m.image.mockImplementation(async({res}:{res:express.Response})=>res.type('image/png').send(Buffer.from('synthetic-image')))
})
afterEach(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined}})
describe('ordinary execution feedback image HTTP projection',()=>{
 it('uses fresh execution report authority and only the projected asset identity',async()=>{
  const response=await request(asset.assetId)
  expect(response.status).toBe(200);expect(await response.text()).toBe('synthetic-image')
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect(m.feedback).toHaveBeenCalledExactlyOnceWith({executionId:execution,actorUserId:actor})
  expect(m.image).toHaveBeenCalledWith({reference:asset,res:expect.anything()})
 })
 it('does not read image storage for absent NONE-block assets or revoked report rights',async()=>{
  expect((await request('synthetic-hidden-report-image')).status).toBe(404);expect(m.image).not.toHaveBeenCalled()
  m.feedback.mockRejectedValueOnce({statusCode:403,code:'CONTENT_AUTHORITY_DENIED'})
  expect((await request(asset.assetId)).status).toBe(403);expect(m.image).not.toHaveBeenCalled()
 })
 it('authenticates the descendant route and rejects extra parameters before report materialization',async()=>{
  expect((await request(asset.assetId,'')).status).toBe(401)
  expect(m.feedback).not.toHaveBeenCalled();expect(m.image).not.toHaveBeenCalled()
  expect((await request(asset.assetId+'?source=arbitrary')).status).toBe(404)
  expect(m.feedback).not.toHaveBeenCalled();expect(m.image).not.toHaveBeenCalled()
 })
})
