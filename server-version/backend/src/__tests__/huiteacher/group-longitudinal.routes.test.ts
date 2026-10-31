import {afterAll,expect,it,vi} from 'vitest'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
const m=vi.hoisted(()=>({catalog:vi.fn(),generate:vi.fn(),read:vi.fn(),mfa:vi.fn(),deny:false}))
vi.mock('../../middleware/auth',()=>({authenticateHuiteacher:(req:any,_res:any,next:any)=>{req.user={userId:'actor'};next()}}))
vi.mock('../../modules/huiteacher/authority',()=>({requireTeacherProductAdmin:(_req:any,res:any,next:any)=>m.deny?res.status(403).end():next(),requireRecentTeacherMfa:(_req:any,_res:any,next:any)=>{m.mfa();next()}}))
vi.mock('../../modules/huiteacher/groupLongitudinalReport.service',()=>({teacherGroupLongitudinalCatalog:m.catalog,generateTeacherGroupLongitudinal:m.generate,readTeacherGroupLongitudinal:m.read}))
import router from '../../modules/huiteacher/groupLongitudinalReport.routes'
let server:Server
const org='10000000-0000-4000-8000-000000000001',event='10000000-0000-4000-8000-000000000002',artifact='10000000-0000-4000-8000-000000000003'
afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}})
it('retains the existing admin/MFA route boundary, precise read cursor and strict explicit generation contract over HTTP',async()=>{
 const app=express();app.use(express.json());app.use(router)
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/organizations/'+org+'/evaluation-events/'+event+'/group-longitudinal-reports'
 m.catalog.mockResolvedValue({status:'CONFIGURED'});m.generate.mockResolvedValue({artifactId:artifact});m.read.mockResolvedValue({artifactId:artifact})
 const at='2026-10-31T00:00:00.123456Z'
 const index=await fetch(base+'?beforeGeneratedAt='+encodeURIComponent(at)+'&beforeArtifactId='+artifact)
 expect(index.status).toBe(200);expect(index.headers.get('cache-control')).toBe('no-store');expect(m.catalog).toHaveBeenLastCalledWith({organizationId:org,eventId:event,actorUserId:'actor',configure:false,before:{generatedAt:at,artifactId:artifact}})
 expect((await fetch(base+'?beforeGeneratedAt='+encodeURIComponent(at))).status).toBe(400)
 expect((await fetch(base+'/'+artifact)).status).toBe(200);expect(m.mfa).not.toHaveBeenCalled()
 const body={planId:artifact,sourceKey:'frozen-A',throughWaveId:event,specId:artifact,selection:{kind:'ALL'}}
 expect((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status).toBe(200)
 expect(m.generate).toHaveBeenCalledExactlyOnceWith({organizationId:org,eventId:event,actorUserId:'actor',...body});expect(m.mfa).toHaveBeenCalledTimes(1)
 expect((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,allowPartialSourceMetrics:true})})).status).toBe(400)
 m.deny=true;expect((await fetch(base)).status).toBe(403);expect(m.catalog).toHaveBeenCalledTimes(1)
})
