import {beforeEach,describe,it,expect,vi} from 'vitest'
import express from 'express'
const mocks=vi.hoisted(()=>({issue:vi.fn(),revoke:vi.fn(),read:vi.fn(),prepareStatic:vi.fn(),publishStatic:vi.fn(),authenticate:vi.fn((_req:any,_res:any,next:any)=>next()),
 system:vi.fn((_req:any,_res:any,next:any)=>next()),recent:vi.fn((_req:any,_res:any,next:any)=>next()),limit:vi.fn((_req:any,_res:any,next:any)=>next())}))
vi.mock('../../modules/situational/static-measurement-admin.service',()=>({prepareAdminStaticSjtMapping:mocks.prepareStatic,publishAdminStaticSjtMeasurement:mocks.publishStatic}))
vi.mock('../../modules/measurement-content/admin-authority.service',()=>({issueAdminContentRoot:mocks.issue,revokeAdminContentGrant:mocks.revoke,readAdminContentGrant:mocks.read}))
vi.mock('../../middleware/auth',()=>({authenticate:mocks.authenticate}))
vi.mock('../../modules/admin-permissions/guards',()=>({requireSystemAdmin:mocks.system,requireRecentAdminKey:mocks.recent}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=>mocks.limit}))
vi.mock('../../modules/admin-permissions/security',()=>({adminWebAuthnConfig:()=>({origin:'https://admin.example.test'}),adminAuthOrigin:()=> 'https://admin.example.test',beginAdminRegistration:vi.fn(),finishAdminRegistration:vi.fn(),beginAdminLogin:vi.fn(),finishAdminAuthentication:vi.fn()}))
import {adminPermissionsRouter} from '../../modules/admin-permissions/routes'
import {AdminPermissionError} from '../../modules/admin-permissions/service'
const grantId='00000000-0000-4000-8000-000000000001'
const principal={userId:'authenticated-system',tokenVersion:7,adminSessionId:'existing-session',adminVerifiedAt:123}
async function invoke(path='/content-grants',origin='https://admin.example.test'){
 // Let Express match mounted middleware. Manually executing every non-route
 // layer also ran both unrelated education mounts and counted three step-ups.
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=principal as any;next()})
 app.use('/api/admin/permissions',adminPermissionsRouter)
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 try{
  const method=path==='/content-grants/:id'?'GET':'POST'
  const response=await fetch('http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/admin/permissions'+path.replace(':id',grantId),
   {method,headers:{Origin:origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({requestId:grantId})}:{})})
  return {status:response.status,value:await response.json()}
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
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

it.each([['/static-sjt/prepare','prepareStatic'],['/static-sjt/publish','publishStatic']] as const)('protects %s with existing strong session, origin and exact body',async(path,name)=>{
 mocks[name].mockResolvedValue({mappingId:grantId})
 expect((await invoke(path)).status).toBe(200)
 expect(mocks[name]).toHaveBeenCalledWith(principal.userId,principal,{requestId:grantId})
 expect(mocks.recent.mock.invocationCallOrder[0]).toBeLessThan(mocks[name].mock.invocationCallOrder[0])
 expect((await invoke(path,'https://other.example.test')).status).toBe(403)
 expect(mocks[name]).toHaveBeenCalledTimes(1)
})
