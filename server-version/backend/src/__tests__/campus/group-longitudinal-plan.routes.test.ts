import express from 'express'
import {it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
const m=vi.hoisted(()=>({catalog:vi.fn(),generate:vi.fn(),read:vi.fn(),mfa:vi.fn((_q:any,_s:any,next:any)=>next()),budget:vi.fn((_q:any,_s:any,next:any)=>next())}))
vi.mock('../../modules/campus/group-longitudinal-plan.service',()=>({schoolPlanGroupCatalog:m.catalog,generateSchoolPlanGroup:m.generate,readSchoolPlanGroup:m.read}))
vi.mock('../../modules/campus/mfa.middleware',()=>({requireRecentSchoolMfa:m.mfa}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:(options:any)=>{if(options.name!=='campus-report-write')throw Error('School must share the existing write budget');return m.budget}}))
import {schoolPlanGroupRouter} from '../../modules/campus/group-longitudinal-plan.routes'
it('child handlers require the School auth context, catch synchronous validation and retain MFA/write budget',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers['x-synthetic-school'])req.user={userId:'manager',accountDomain:'SCHOOL'} as any;next()});app.use('/plans',schoolPlanGroupRouter)
 app.use((_error:any,_req:any,res:any,_next:any)=>res.status(500).json({unexpected:true}))
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+(server.address() as any).port+'/plans/',path=randomUUID()+'/'+randomUUID()
 try{
  expect((await fetch(base+path)).status).toBe(401);expect(m.catalog).not.toHaveBeenCalled()
  expect((await fetch(base+'invalid/invalid',{headers:{'x-synthetic-school':'1'}})).status).toBe(400)
  m.generate.mockResolvedValue({artifactId:'synthetic'})
  const body={planId:randomUUID(),sourceKey:'A',throughWaveId:randomUUID(),specId:randomUUID()}
  expect((await fetch(base+path,{method:'POST',headers:{'x-synthetic-school':'1','Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(200)
  expect(m.mfa).toHaveBeenCalledTimes(1);expect(m.budget).toHaveBeenCalledTimes(1);expect(m.generate).toHaveBeenCalledWith(expect.objectContaining(body))
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
