import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({mfa:false,forced:false,setCookie:vi.fn(),find:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{campusAccount:{findUnique:state.find}}}))
vi.mock('../../utils/password',()=>({comparePassword:async()=>true,hashPassword:vi.fn(),isValidPassword:()=>true,PASSWORD_MAX_LENGTH:72}))
vi.mock('../../utils/jwt',()=>({generateToken:()=> 'synthetic-token'}))
vi.mock('../../utils/authCookies',()=>({issueSchoolCsrfToken:vi.fn(),setSchoolSessionCookie:state.setCookie,clearSchoolSessionCookie:vi.fn(),getSchoolSessionToken:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateSchool:vi.fn()}))
vi.mock('../../utils/sessionRevocation',()=>({revokeCurrentSession:vi.fn()}))
vi.mock('../../middleware/mfaAttemptRateLimit',()=>({createMfaAttemptRateLimiter:()=>vi.fn()}))
vi.mock('../../middleware/passwordChangeAdmission',()=>({passwordChangeRateLimit:vi.fn(),withPasswordChangeAdmission:(x:unknown)=>x}))
vi.mock('../../middleware/loginRateLimit',()=>({loginRateLimit:vi.fn(),withLoginAccountFailureThrottle:(x:unknown)=>x,recordLoginFailure:vi.fn(),clearLoginFailures:vi.fn(),withLoginPasswordVerification:(fn:()=>unknown)=>fn()}))
vi.mock('../../services/boundedAdmissionGate',()=>({isBoundedAdmissionBusyError:()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>state.mfa,beginSchoolMfaChallenge:async()=>({mfaRequired:true,enrolled:true}),getPendingChallenge:vi.fn(),startSchoolMfaEnrollment:vi.fn(),finishSchoolMfa:vi.fn(),verifySchoolTotpStepUp:vi.fn()}))
import router from '../../modules/campus/auth.routes'
const currentUser=()=>({id:'u',username:'internal',role:'STUDENT',accountDomain:'SCHOOL',mustChangePassword:state.forced,isActive:true,isFrozen:false,expiresAt:null,passwordHash:'not-a-response-field',tokenVersion:9})
const call=async(path:string,method:string)=>{
 const route=(router as any).stack.find((x:any)=>x.route?.path===path&&x.route.methods[method]).route
 let body:any
 const res:any={setHeader:vi.fn(),status(){return res},json(x:unknown){body=x;return res}}
 const req:any={body:{username:'student.one',password:'Synthetic123'},user:{userId:'u',role:'STUDENT',mustChangePassword:state.forced}}
 await route.stack.at(-1).handle(req,res)
 return body
}
beforeEach(()=>{vi.clearAllMocks();state.mfa=false;state.forced=false;state.find.mockImplementation(async()=>({userId:'u',loginName:'student.one',user:currentUser()}))})
describe('School login projection matches me without private fields',()=>{
 it.each([false,true])('returns the same public identity with forced=%s',async forced=>{
  state.forced=forced
  const login=await call('/login','post'),me=await call('/me','get')
  expect(login.data.user).toEqual(me.data)
  expect(login.data.user).toEqual({id:'u',username:'student.one',role:'STUDENT',accountDomain:'SCHOOL',mustChangePassword:forced})
  expect(state.setCookie).toHaveBeenCalledTimes(1)
 })
 it('keeps an MFA challenge separate from an authenticated identity',async()=>{
  state.mfa=true
  expect((await call('/login','post')).data).toEqual({mfaRequired:true,enrolled:true})
  expect(state.setCookie).not.toHaveBeenCalled()
 })
})
