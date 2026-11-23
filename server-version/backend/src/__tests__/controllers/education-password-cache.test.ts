import {createServer,type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import express from 'express'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({principal:vi.fn(),find:vi.fn(),update:vi.fn(),compare:vi.fn(),hash:vi.fn(),account:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.principal,user:{findUnique:mocks.find,updateMany:mocks.update},campusAccount:{findUnique:mocks.account}}}))
vi.mock('../../utils/password',async original=>({...await original<typeof import('../../utils/password')>(),comparePassword:mocks.compare,hashPassword:mocks.hash}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:vi.fn(async()=>false),revokeCurrentSession:vi.fn(async()=>true)}))
vi.mock('../../middleware/passwordChangeAdmission',()=>({passwordChangeRateLimit:(_req:unknown,_res:unknown,next:()=>void)=>next(),withPasswordChangeAdmission:(handler:unknown)=>handler}))
vi.mock('../../middleware/loginRateLimit',()=>({loginRateLimit:(_req:unknown,_res:unknown,next:()=>void)=>next(),withLoginAccountFailureThrottle:(handler:unknown)=>handler,withLoginAccountLookup:(fn:()=>unknown)=>fn(),withLoginPasswordVerification:(fn:()=>unknown)=>fn(),clearLoginFailures:vi.fn(async()=>{}),recordLoginFailure:vi.fn(async()=>({accountIpAllowed:true,accountGlobalAllowed:true}))}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:vi.fn(async()=>false),beginSchoolMfaChallenge:vi.fn(),getPendingChallenge:vi.fn(),startSchoolMfaEnrollment:vi.fn(),finishSchoolMfa:vi.fn(),verifySchoolTotpStepUp:vi.fn()}))
import {authController} from '../../controllers/authController'
import teacherAuth from '../../modules/huiteacher/auth.routes'
import schoolAuth from '../../modules/campus/auth.routes'
import {authenticateHuiteacher,authenticateSchool,invalidatePrincipalCache,loadPrincipal} from '../../middleware/auth'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'
import {HUITEACHER_AUTH_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME} from '../../utils/authCookies'

let server:Server,base:string
let state:{id:string;username:string;accountDomain:'SCHOOL'|'TRAINING';role:UserRole;platformRole:'STANDARD';isActive:boolean;isFrozen:boolean;expiresAt:null;teacherApproved:boolean;tokenVersion:number;mustChangePassword:boolean;passwordHash:string;needsMfa:boolean;entryGrants:never[]}
const row=()=>({...state,userId:state.id})
beforeAll(async()=>{const app=express();app.use(express.json());app.use('/teacher/auth',teacherAuth);app.use('/school/auth',schoolAuth);app.post('/legacy/login',authController.login);app.get('/teacher/probe',authenticateHuiteacher,(_req,res)=>res.json({ok:true}));app.get('/school/probe',authenticateSchool,(_req,res)=>res.json({ok:true}));server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as AddressInfo).port})
afterAll(async()=>{server?.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))})
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AUTH_PRINCIPAL_CACHE_TTL_MS','15000');invalidatePrincipalCache();state={id:'ordinary-education-user',username:'ordinary',accountDomain:'SCHOOL',role:UserRole.TEACHER,platformRole:'STANDARD',isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true,tokenVersion:3,mustChangePassword:false,passwordHash:'previous',needsMfa:false,entryGrants:[]};mocks.principal.mockImplementation(async()=>[row()]);mocks.find.mockImplementation(async()=>({...state}));mocks.account.mockImplementation(async()=>({userId:state.id,loginName:'ordinary',user:{...state}}));mocks.compare.mockResolvedValue(true);mocks.hash.mockResolvedValue('new-hash');mocks.update.mockImplementation(async({where,data})=>{if(where.id!==state.id||where.tokenVersion!==state.tokenVersion)return{count:0};state={...state,passwordHash:data.passwordHash,tokenVersion:state.tokenVersion+1,mustChangePassword:data.mustChangePassword};return{count:1}})})
afterEach(()=>{invalidatePrincipalCache();vi.unstubAllEnvs()})
function session(product:'teacher'|'school',version=state.tokenVersion){const token=generateToken({userId:state.id,username:state.username,role:state.role,accountDomain:'SCHOOL',tokenVersion:version,...(product==='teacher'?{sessionProduct:'HUITEACHER' as const}:{})});return(product==='teacher'?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME)+'='+encodeURIComponent(token)}
const call=(path:string,cookie:string,body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',Connection:'close'},...(body?{body:JSON.stringify(body)}:{})})
describe('education password rotation with ordinary principal caching enabled',()=>{
 it.each(['teacher','school'] as const)('%s rotation immediately rejects both products pre-issued sessions',async product=>{const teacher=session('teacher'),school=session('school');expect((await call('/teacher/probe',teacher)).status).toBe(200);expect((await call('/school/probe',school)).status).toBe(200);expect(mocks.principal).toHaveBeenCalledOnce();const changed=await call('/'+product+'/auth/change-password',product==='teacher'?teacher:school,{oldPassword:'OldPass1',newPassword:'NewPass2'});expect(changed.status).toBe(200);expect(state.tokenVersion).toBe(4);expect((await call('/teacher/probe',teacher)).status).toBe(401);expect((await call('/school/probe',school)).status).toBe(401);expect((await call('/teacher/probe',session('teacher'))).status).toBe(200);expect((await call('/school/probe',session('school'))).status).toBe(200)})
 it.each(['teacher','school'] as const)('%s rejects wrong current passwords without revoking existing sessions',async product=>{const cookie=session(product);expect((await call('/'+product+'/probe',cookie)).status).toBe(200);mocks.compare.mockResolvedValue(false);const rejected=await call('/'+product+'/auth/change-password',cookie,{oldPassword:'WrongPass1',newPassword:'NewPass2'});expect(rejected.status).toBe(401);expect(mocks.update).not.toHaveBeenCalled();expect(state.tokenVersion).toBe(3);expect((await call('/'+product+'/probe',cookie)).status).toBe(200)})
 it.each(['teacher','school'] as const)('%s preserves concurrent credential changes on CAS conflict',async product=>{const cookie=session(product);mocks.update.mockResolvedValue({count:0});const conflict=await call('/'+product+'/auth/change-password',cookie,{oldPassword:'OldPass1',newPassword:'NewPass2'});expect(conflict.status).toBe(409);expect(state.passwordHash).toBe('previous');expect(state.tokenVersion).toBe(3);expect((await call('/'+product+'/probe',cookie)).status).toBe(200);expect(mocks.principal).toHaveBeenCalledOnce()})
 it('does not let an in-flight pre-invalidation query refill the principal cache',async()=>{const old=row();let resolve!:(rows:unknown[])=>void;mocks.principal.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const pending=loadPrincipal(state.id);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));state={...state,tokenVersion:4};invalidatePrincipalCache(state.id);resolve([old]);await pending;expect((await loadPrincipal(state.id))?.tokenVersion).toBe(4);expect(mocks.principal).toHaveBeenCalledTimes(2);await loadPrincipal(state.id);expect(mocks.principal).toHaveBeenCalledTimes(2)})
})

// These are the three production writers of the shared principal cache. An
// invalidation may occur while either the account or principal query is pending.
describe('login snapshot generation across all cache writers',()=>{
 const path=(product:string)=>product==='legacy'?'/legacy/login':'/'+product+'/auth/login'
 it.each(['teacher','school','legacy'])('%s keeps same-generation login priming and avoids a redundant principal lookup',async product=>{
  if(product==='legacy')state={...state,accountDomain:'TRAINING'}
  const login=await call(path(product),'',{username:'ordinary',password:'OldPass1'})
  expect(login.status).toBe(200)
  expect((await loadPrincipal(state.id))?.tokenVersion).toBe(3)
  expect(mocks.principal).toHaveBeenCalledTimes(product==='legacy'?1:0)
 })
 it.each(['teacher','school','legacy'])('%s cannot prime a pre-invalidation login snapshot after credential rotation',async product=>{
  if(product==='legacy')state={...state,accountDomain:'TRAINING'}
  const snapshot=row(),account={userId:state.id,loginName:'ordinary',user:{...state}}
  let entered=false,release!:()=>void
  const barrier=new Promise<void>(resolve=>{release=resolve})
  if(product==='legacy')mocks.principal.mockImplementationOnce(async()=>{entered=true;await barrier;return[snapshot]})
  else mocks.account.mockImplementationOnce(async()=>{entered=true;await barrier;return account})
  const pending=call(path(product),'',{username:'ordinary',password:'OldPass1'})
  try{
   await vi.waitFor(()=>expect(entered).toBe(true))
   state={...state,tokenVersion:4}
   invalidatePrincipalCache(state.id)
   release()
   expect((await pending).status).toBe(200)
   expect((await loadPrincipal(state.id))?.tokenVersion).toBe(4)
   expect(mocks.principal).toHaveBeenCalledTimes(product==='legacy'?2:1)
  }finally{release();await pending}
 })
})
