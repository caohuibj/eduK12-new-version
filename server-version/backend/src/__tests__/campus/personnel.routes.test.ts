import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
const calls=vi.hoisted(()=>({preview:vi.fn(),apply:vi.fn(),list:vi.fn(),issue:vi.fn(),bind:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateSchool:(req:any,res:any,next:any)=>{if(!req.headers['x-fixture-user'])return res.status(401).json({code:'UNAUTHENTICATED'});req.user={userId:req.headers['x-fixture-user'],accountDomain:'SCHOOL'};next()}}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}))
vi.mock('../../modules/campus/personnel.service',async original=>({...await original<Record<string,unknown>>(),previewPersonnel:calls.preview,importPersonnel:calls.apply,listPersonnel:calls.list,issuePersonnelCredential:calls.issue,bindExistingPersonnel:calls.bind}))
import router from '../../modules/campus/personnel.routes'
import {schoolOriginGuard} from '../../modules/campus/originGuard'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
let server:Server,base:string
const org=randomUUID(),user=randomUUID(),csrf='synthetic-csrf-'+'a'.repeat(32)
const body={kind:'STAFF',rows:[{line:2,number:'T001',name:'合成教师'}]}
const headers=(age=0)=>({'Content-Type':'application/json',Origin:'http://school.localhost:5195','X-Fixture-User':user,'X-CSRF-Token':csrf,Cookie:`huischool_csrf=${csrf}; huischool_session=${generateToken({userId:user,username:'fixture_user',accountDomain:'SCHOOL',role:'TEACHER',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000)-age})}`})
describe('personnel router MFA / CSRF / origin and strict input (synthetic identity adapter)',()=>{
 beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/campus',schoolOriginGuard,router);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}/api/campus/organizations/${org}/personnel`})
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))})
 beforeEach(()=>{Object.values(calls).forEach(c=>c.mockReset().mockResolvedValue({ok:true}))})
 const post=(suffix:string,data:unknown,h:Record<string,string>=headers())=>fetch(base+suffix,{method:'POST',headers:h,body:JSON.stringify(data)})
 it('requires authentication even with matching CSRF',async()=>{const h=headers();delete (h as any)['X-Fixture-User'];expect((await post('/preview',body,h)).status).toBe(401);expect(calls.preview).not.toHaveBeenCalled()})
 it.each(['/preview','/import','/'+randomUUID()+'/credential','/'+randomUUID()+'/bind-existing'])('blocks stale MFA before the controller at %s',async path=>{expect((await post(path,body,headers(301))).status).toBe(403);Object.values(calls).forEach(c=>expect(c).not.toHaveBeenCalled())})
 it('requires recent MFA to read names and personnel numbers',async()=>{expect((await fetch(base,{headers:headers(301)})).status).toBe(403);expect(calls.list).not.toHaveBeenCalled()})
 it('rejects cross-product origin and missing School CSRF',async()=>{
  expect((await post('/preview',body,{...headers(),Origin:'http://teacher.localhost:5196'})).status).toBe(403)
  expect((await post('/preview',body,{...headers(),'X-CSRF-Token':''})).status).toBe(403)
  expect(calls.preview).not.toHaveBeenCalled()
 })
 it('does not admit injected permissions or credentials',async()=>{
  for(const data of [{...body,adminRole:true},{...body,rows:[{...body.rows[0],psychologyStaff:true}]},{...body,rows:[{...body.rows[0],password:'not allowed'}]}])expect((await post('/preview',data)).status).toBe(400)
  expect(calls.preview).not.toHaveBeenCalled()
 })
 it('accepts valid preview only after the three existing request guards',async()=>{const res=await post('/preview',body);expect(res.status).toBe(200);expect(calls.preview).toHaveBeenCalledOnce();expect(res.headers.get('cache-control')).toBe('no-store')})
})
