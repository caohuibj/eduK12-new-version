import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({issue:vi.fn(),revoke:vi.fn(),read:vi.fn(),authenticate:vi.fn((_req:any,_res:any,next:any)=>next()),
 system:vi.fn((_req:any,_res:any,next:any)=>next()),recent:vi.fn((_req:any,_res:any,next:any)=>next()),limit:vi.fn((_req:any,_res:any,next:any)=>next())}))
vi.mock('../../modules/measurement-content/admin-authority.service',()=>({issueAdminContentRoot:mocks.issue,revokeAdminContentGrant:mocks.revoke,readAdminContentGrant:mocks.read}))
vi.mock('../../middleware/auth',()=>({authenticate:mocks.authenticate}))
vi.mock('../../modules/admin-permissions/guards',()=>({requireSystemAdmin:mocks.system,requireRecentAdminKey:mocks.recent}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=>mocks.limit}))
vi.mock('../../modules/admin-permissions/security',()=>({adminWebAuthnConfig:()=>({origin:'https://admin.example.test'}),beginAdminRegistration:vi.fn(),finishAdminRegistration:vi.fn(),beginAdminLogin:vi.fn(),finishAdminAuthentication:vi.fn()}))
import {adminPermissionsRouter} from '../../modules/admin-permissions/routes'
import {AdminPermissionError} from '../../modules/admin-permissions/service'
const grantId='00000000-0000-4000-8000-000000000001'
const principal={userId:'authenticated-system',tokenVersion:7,adminSessionId:'existing-session',adminVerifiedAt:123}
async function invoke(path='/content-grants',origin='https://admin.example.test'){
 const req:any={method:'POST',body:{requestId:grantId},params:{id:grantId},user:principal,get:(key:string)=>key==='Origin'?origin:undefined}
 const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res)
 const stack=(adminPermissionsRouter as any).stack
 let stopped=false
 for(const layer of stack.filter((layer:any)=>!layer.route)){
  let next=false;await layer.handle(req,res,()=>{next=true});if(!next){stopped=true;break}
 }
 if(!stopped)for(const layer of stack.find((layer:any)=>layer.route?.path===path).route.stack){
  let next=false;await layer.handle(req,res,(error?:Error)=>{if(error)res.status(500);else next=true});if(!next)break
 }
 return {req,res,status:res.status.mock.calls[0]?.[0]??200}
}
beforeEach(()=>{vi.clearAllMocks();mocks.issue.mockResolvedValue({grantId,version:1});mocks.revoke.mockResolvedValue({grantId,version:2})})
describe('system content grant routes reuse real management router boundaries',()=>{
 it('runs authenticate/origin/system/limiter/recent key before issuance with trusted claims',async()=>{
  expect((await invoke()).status).toBe(200)
  expect(mocks.authenticate).toHaveBeenCalledTimes(1);expect(mocks.system).toHaveBeenCalledTimes(1)
  expect(mocks.limit).toHaveBeenCalledTimes(1);expect(mocks.recent).toHaveBeenCalledTimes(1)
  expect(mocks.recent.mock.invocationCallOrder[0]).toBeLessThan(mocks.issue.mock.invocationCallOrder[0])
  expect(mocks.issue).toHaveBeenCalledWith(principal.userId,principal,{requestId:grantId})
 })
 it('blocks untrusted origin and recent-key denial without entering the mutation',async()=>{
  expect((await invoke('/content-grants','https://other.example.test')).status).toBe(403)
  expect(mocks.issue).not.toHaveBeenCalled()
  mocks.recent.mockImplementationOnce((_req,res)=>res.status(403).json({message:'recent key required'}))
  expect((await invoke()).status).toBe(403);expect(mocks.issue).not.toHaveBeenCalled()
 })
 it('uses the same middleware and authenticated session for system revocation',async()=>{
  expect((await invoke('/content-grants/:id/revoke')).status).toBe(200)
  expect(mocks.revoke).toHaveBeenCalledWith(principal.userId,principal,grantId,{requestId:grantId})
  expect(mocks.recent).toHaveBeenCalledTimes(1)
 })
 it('preserves current-auth and CAS error status returned by the transactional service',async()=>{
  mocks.issue.mockRejectedValueOnce(new AdminPermissionError(403,'expired'))
  expect((await invoke()).status).toBe(403)
  mocks.revoke.mockRejectedValueOnce(new AdminPermissionError(409,'stale'))
  expect((await invoke('/content-grants/:id/revoke')).status).toBe(409)
 })
})

it('protects exact metadata read with existing system and recent-key boundaries',async()=>{
 mocks.read.mockResolvedValue({grantId,version:1})
 expect((await invoke('/content-grants/:id')).status).toBe(200)
 expect(mocks.read).toHaveBeenCalledWith(principal.userId,principal,grantId)
 expect(mocks.system).toHaveBeenCalled();expect(mocks.recent).toHaveBeenCalled()
 mocks.system.mockImplementationOnce((_req,res)=>res.status(403).json({message:'system required'}))
 expect((await invoke('/content-grants/:id')).status).toBe(403);expect(mocks.read).toHaveBeenCalledTimes(1)
})
