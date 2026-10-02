import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({config:{parentPortalEnabled:true},service:{links:vi.fn(),consentText:vi.fn(),claim:vi.fn(),approve:vi.fn(),readReport:vi.fn(),reportConsentPreview:vi.fn()}}))
vi.mock('../../config',()=>({config:state.config}))
vi.mock('../../modules/parent-portal/service',()=>({parentPortalService:state.service}))
// Existing authenticate middleware has its own DB/cookie tests; isolate router input boundaries here.
vi.mock('../../middleware/auth',()=>({authenticate:(req:any,res:any,next:any)=>{if(!req.headers['x-test-actor'])return res.status(401).json({code:401,data:null});req.user={userId:req.headers['x-test-actor'],role:'STUDENT'};next()}}))
vi.mock('../../middleware/redisRateLimit',()=>({createRedisRateLimiter:()=> (_req:any,_res:any,next:any)=>next()}))
import {parentLinksRouter,parentsRouter} from '../../modules/parent-portal/routes'
import {csrfProtection} from '../../middleware/csrf'
import {ParentPortalError} from '../../modules/parent-portal/contracts'
let server:Server,origin:string
async function request(path:string,body?:unknown,headers:Record<string,string>={}){
 return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-test-actor':'student-1','Cookie':'ptool_csrf=test-csrf','X-CSRF-Token':'test-csrf',...headers},body:body===undefined?undefined:JSON.stringify(body)})
}
describe('parent API routing and CSRF boundaries',()=>{
 beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/parent-links',parentLinksRouter);app.use('/api/parents',parentsRouter);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('missing test listener');origin='http://127.0.0.1:'+address.port})
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
 beforeEach(()=>{vi.clearAllMocks();state.config.parentPortalEnabled=true;state.service.links.mockResolvedValue({list:[]});state.service.claim.mockResolvedValue({id:'link-1',status:'PENDING'});state.service.approve.mockResolvedValue({id:'link-1',status:'ACTIVE'})})
 it('disabled entry returns 404/no-store before querying child data',async()=>{state.config.parentPortalEnabled=false;const res=await request('/api/parent-links');expect(res.status).toBe(404);expect(res.headers.get('cache-control')).toBe('no-store');expect(state.service.links).not.toHaveBeenCalled()})
 it('requires authenticated principal before list access',async()=>{const res=await request('/api/parent-links',undefined,{'x-test-actor':''});expect(res.status).toBe(401);expect(state.service.links).not.toHaveBeenCalled()})
 it('mutation without a matching CSRF token never reaches the parent service',async()=>{const res=await request('/api/parent-links/claims',{inviteCode:'a'.repeat(24)},{'X-CSRF-Token':'incorrect'});expect(res.status).toBe(403);expect(state.service.claim).not.toHaveBeenCalled()})
 it('rejects caller-supplied parent identity rather than trusting request data',async()=>{const res=await request('/api/parent-links/claims',{inviteCode:'a'.repeat(24),parentUserId:'other-parent'});expect(res.status).toBe(400);expect(state.service.claim).not.toHaveBeenCalled()})
 it('passes server principal and explicit consent version to confirmation',async()=>{const res=await request('/api/parent-links/link-1/approve',{consentVersion:'confirmed-version'});expect(res.status).toBe(200);expect(state.service.approve).toHaveBeenCalledWith({userId:'student-1',role:'STUDENT'},'link-1','confirmed-version')})
 it('source preview uses scoped relation and artifact, not a caller subject',async()=>{state.service.reportConsentPreview.mockResolvedValue({canConsent:true});const res=await request('/api/parent-links/link-1/reports/artifact-1/consent');expect(res.status).toBe(200);expect(state.service.reportConsentPreview).toHaveBeenCalledWith({userId:'student-1',role:'STUDENT'},'link-1','artifact-1')})
 it('denied report access stays a generic 404 without report fields',async()=>{state.service.readReport.mockRejectedValue(new ParentPortalError('PARENT_RESOURCE_NOT_FOUND',404));const res=await request('/api/parents/me/children/child-1/reports/artifact-1');expect(res.status).toBe(404);expect(await res.json()).toMatchObject({data:null});expect(res.headers.get('cache-control')).toBe('no-store')})
 it('raw SQL serialization conflict returns recoverable 409 without replay',async()=>{state.service.claim.mockRejectedValue({code:'P2010',meta:{code:'40001'}});const res=await request('/api/parent-links/claims',{inviteCode:'a'.repeat(24)});expect(res.status).toBe(409);expect(state.service.claim).toHaveBeenCalledTimes(1)})
 it('concurrent mutation conflict returns 409 and is not replayed',async()=>{state.service.claim.mockRejectedValue({code:'P2034'});const res=await request('/api/parent-links/claims',{inviteCode:'a'.repeat(24)});expect(res.status).toBe(409);expect(state.service.claim).toHaveBeenCalledTimes(1)})
})
