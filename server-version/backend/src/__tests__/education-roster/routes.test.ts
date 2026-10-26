import express from 'express'
import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({principal:vi.fn(),scope:vi.fn(),governor:vi.fn(),preview:vi.fn(),apply:vi.fn(),directory:vi.fn(),list:vi.fn(),issue:vi.fn(),bind:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({})}}))
vi.mock('../../modules/organization/principal',async original=>({...await original<Record<string,unknown>>(),loadCurrentPrincipal:m.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',async original=>({...await original<Record<string,unknown>>(),schoolAccountNeedsMfa:async()=>true}))
vi.mock('../../modules/organization/educationProductAccess',async original=>({...await original<Record<string,unknown>>(),resolveEducationProductMemberScope:m.scope}))
vi.mock('../../modules/campus/personnel.binding',async original=>({...await original<Record<string,unknown>>(),assertPersonnelGovernor:m.governor}))
vi.mock('../../modules/campus/personnel.service',async original=>({...await original<Record<string,unknown>>(),previewPersonnel:m.preview,importPersonnel:m.apply,listPersonnel:m.list,issuePersonnelCredential:m.issue,bindExistingPersonnel:m.bind}))
vi.mock('../../modules/campus/personnel.directory',async original=>({...await original<Record<string,unknown>>(),listPersonnelDirectory:m.directory}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}))
import {educationPersonnelRouter} from '../../modules/campus/personnel.routes'
import {educationRosterFileRouter} from '../../modules/education-roster/files.routes'
import {CampusAdmissionError} from '../../modules/campus/admission.error'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
const org=randomUUID(),user=randomUUID(),csrf='synthetic-'+ 'a'.repeat(32),body={kind:'STAFF',rows:[{line:2,number:'T001',name:'合成教师'}]}
const principal={userId:user,username:'fixture',accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD',tokenVersion:0,mustChangePassword:false,isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true}
let server:Server,base:string
const headers=(age=0,product:'HUITEACHER'|'HUISCHOOL'='HUITEACHER')=>({'Content-Type':'application/json',Origin:'http://teacher.localhost:5196','X-CSRF-Token':csrf,Cookie:`huiteacher_csrf=${csrf}; huiteacher_session=${generateToken({userId:user,username:'fixture',accountDomain:'SCHOOL',role:'TEACHER',tokenVersion:0,...(product==='HUITEACHER'?{sessionProduct:'HUITEACHER' as const}:{}),mfaVerifiedAt:Math.floor(Date.now()/1000)-age})}`})
const request=(path:string,method='GET',data?:unknown,h=headers())=>fetch(base+path,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})})
describe('Teacher adapter keeps real cookie audience, MFA, CSRF and both current authorities',()=>{
 beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/huiteacher',huiteacherOriginGuard,educationPersonnelRouter('TEACHER'),educationRosterFileRouter('TEACHER'));app.use((error:any,_req:any,res:any,_next:any)=>res.status(500).json({message:error.message}));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}/api/huiteacher/organizations/${org}`})
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))})
 beforeEach(()=>{Object.values(m).forEach(fn=>fn.mockReset());m.principal.mockResolvedValue(principal);m.scope.mockResolvedValue({productAdmin:true});m.governor.mockResolvedValue({canGovern:true});for(const fn of [m.preview,m.apply,m.directory,m.list,m.issue,m.bind])fn.mockResolvedValue({ok:true})})
 it('rejects School JWTs even when copied into the Teacher cookie',async()=>{expect((await request('/personnel/directory','GET',undefined,headers(0,'HUISCHOOL'))).status).toBe(401);expect(m.governor).not.toHaveBeenCalled()})
 it('requires a real Teacher session cookie rather than a School session cookie',async()=>{const h=headers();h.Cookie=h.Cookie.replace('huiteacher_session=','huischool_session=');expect((await request('/personnel/directory','GET',undefined,h)).status).toBe(401)})
 it('does not equate Teacher product admin with School personnel governance',async()=>{
  m.governor.mockRejectedValue(new CampusAdmissionError('CAMPUS_GOVERNANCE_REQUIRED',403))
  expect((await request('/roster-files/capabilities')).status).toBe(200)
  expect(await (await request('/roster-files/capabilities')).json()).toMatchObject({data:{structure:true,personnel:false}})
  expect((await request('/personnel/directory')).status).toBe(403);expect(m.directory).not.toHaveBeenCalled()
 })
 it.each(['/personnel/directory','/personnel/preview','/personnel/import','/personnel/'+randomUUID()+'/credential','/personnel/'+randomUUID()+'/bind-existing'])('blocks stale MFA before any personnel access: %s',async path=>{
  expect((await request(path,path.endsWith('directory')?'GET':'POST',path.endsWith('directory')?undefined:body,headers(301))).status).toBe(403)
  expect(m.governor).not.toHaveBeenCalled();for(const fn of [m.preview,m.apply,m.directory,m.issue,m.bind])expect(fn).not.toHaveBeenCalled()
 })
 it('rechecks Teacher product grants on every operation',async()=>{m.scope.mockResolvedValue({productAdmin:false});expect((await request('/personnel/preview','POST',body)).status).toBe(403);expect(m.governor).not.toHaveBeenCalled();expect(m.preview).not.toHaveBeenCalled()})
 it('rejects revoked or denied School authority before a valid mutation',async()=>{m.governor.mockRejectedValue(new CampusAdmissionError('CAMPUS_GOVERNANCE_REQUIRED',403));expect((await request('/personnel/preview','POST',body)).status).toBe(403);expect(m.preview).not.toHaveBeenCalled()})
 it('requires the Teacher origin and CSRF token',async()=>{
  expect((await request('/personnel/preview','POST',body,{...headers(),Origin:'http://school.localhost:5197'})).status).toBe(403)
  expect((await request('/personnel/preview','POST',body,{...headers(),'X-CSRF-Token':''})).status).toBe(403);expect(m.governor).not.toHaveBeenCalled()
 })
 it('admits the original strict controller only after both current authorizations',async()=>{
  const response=await request('/personnel/preview','POST',body)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(m.governor).toHaveBeenCalledOnce();expect(m.preview).toHaveBeenCalledOnce()
  expect((await request('/personnel/preview','POST',{...body,rows:[{...body.rows[0],password:'blocked'}]})).status).toBe(400);expect(m.preview).toHaveBeenCalledOnce()
 })
 it('protects file reads/templates with current Teacher authority and recent MFA',async()=>{
  expect((await request('/roster-files/template?kind=STAFF','GET',undefined,headers(301))).status).toBe(403)
  expect((await request('/roster-files/read','POST',{content:'not base64'})).status).toBe(400)
  const template=await request('/roster-files/template?kind=STUDENT');expect(template.status).toBe(200);expect(template.headers.get('cache-control')).toBe('no-store');const content=Buffer.from(await template.arrayBuffer()).toString('base64')
  const read=await request('/roster-files/read','POST',{content});expect(read.status).toBe(200);expect(await read.json()).toMatchObject({data:{sheets:[{rows:expect.arrayContaining([expect.objectContaining({cells:expect.arrayContaining(['0001'])})])}]}})
  expect(m.apply).not.toHaveBeenCalled()
 })
})
