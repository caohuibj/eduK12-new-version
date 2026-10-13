import express,{type Router} from 'express'
import type {Server} from 'node:http'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'

const state=vi.hoisted(()=>({
  query:vi.fn(),verify:vi.fn(),goals:vi.fn(),privacy:vi.fn(),
  principal:{userId:'00000000-0000-4000-8000-000000000001',username:'teacher',
    accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD',tokenVersion:0,
    mustChangePassword:false,isActive:true,isFrozen:false,expiresAt:null,
    teacherApproved:true},
  needsMfa:false,
}))
vi.mock('../config/database',()=>({prisma:{$queryRaw:state.query}}))
vi.mock('../utils/jwt',()=>({verifyToken:state.verify}))
vi.mock('../middleware/redisRateLimit',()=>({
  createRedisRateLimiter:()=> (_req:unknown,_res:unknown,next:()=>void)=>next(),
}))
vi.mock('../modules/huiteacher/personalScale.service',()=>({
  TeacherPersonalAssessmentError:class extends Error{},
  listPersonalTeacherScales:vi.fn(),listOwnPersonalTeacherScales:vi.fn(),
  startPersonalTeacherScale:vi.fn(),readOwnPersonalTeacherScale:vi.fn(),
  submitOwnPersonalTeacherScale:vi.fn(),readOwnPersonalTeacherScaleReport:vi.fn(),
}))
vi.mock('../modules/huiteacher/observer.service',()=>({
  HuiteacherObserverError:class extends Error{},inviteHuiteacherObserver:vi.fn(),
  revokeHuiteacherObserver:vi.fn(),acceptHuiteacherObserver:vi.fn(),
  listHuiteacherObserverGrants:vi.fn(),myHuiteacherFieldAssignments:vi.fn(),
  createHuiteacherObservation:vi.fn(),updateHuiteacherObservation:vi.fn(),
  submitHuiteacherObservation:vi.fn(),readOwnHuiteacherObservations:vi.fn(),
  readFormalHuiteacherObservations:vi.fn(),
}))
vi.mock('../modules/huiteacher/consensus.service',()=>({
  HuiteacherConsensusError:class extends Error{},createHuiteacherFieldConsensus:vi.fn(),
  listHuiteacherFieldConsensuses:vi.fn(),readHuiteacherFieldConsensus:vi.fn(),
  updateHuiteacherFieldConsensus:vi.fn(),approveHuiteacherFieldConsensus:vi.fn(),
  submitHuiteacherFieldConsensus:vi.fn(),myHuiteacherConsensusReviews:vi.fn(),
}))
vi.mock('../modules/huiteacher/fieldForm.service',()=>({
  HuiteacherFieldFormError:class extends Error{},bindHuiteacherFieldForm:vi.fn(),
  readInvitedHuiteacherFieldForm:vi.fn(),readManagerHuiteacherFieldForm:vi.fn(),
  readSubmittedHuiteacherFieldFormEvidence:vi.fn(),
}))
vi.mock('../modules/huiteacher/fieldFeedback.service',()=>({
  HuiteacherFeedbackError:class extends Error{},releaseHuiteacherFieldFeedback:vi.fn(),
  readOwnHuiteacherFieldFeedback:vi.fn(),
}))
vi.mock('../modules/huiteacher/studentEvaluation.service',()=>({
  HuiteacherStudentEvaluationError:class extends Error{},
  configureHuiteacherStudentEvaluation:vi.fn(),readHuiteacherStudentEvaluation:vi.fn(),
  previewHuiteacherStudentEvaluation:vi.fn(),listHuiteacherStudentEvaluationCandidates:vi.fn(),
  createHuiteacherStudentEvaluationRun:vi.fn(),previewHuiteacherStudentEvaluationRun:vi.fn(),
  publishHuiteacherStudentEvaluationRun:vi.fn(),
}))
vi.mock('../modules/huiteacher/studentReport.service',()=>({
  StudentFeedbackReportError:class extends Error{},listMyHuiteacherStudentFeedback:vi.fn(),
  readHuiteacherStudentFeedbackReport:vi.fn(),
}))
vi.mock('../modules/huiteacher/groupReport.service',()=>({
  HuiteacherGroupReportError:class extends Error{},
}))
vi.mock('../modules/huiteacher/improvement.service',()=>({
  HuiteacherImprovementError:class extends Error{},createHuiteacherImprovement:vi.fn(),
  listHuiteacherImprovements:vi.fn(),listMyHuiteacherImprovementTargets:state.goals,
  transitionHuiteacherImprovement:vi.fn(),listHuiteacherReassessmentCandidates:vi.fn(),
  attachHuiteacherReassessment:vi.fn(),
}))
vi.mock('../modules/report-privacy/preferences.service',()=>({
  ReportPrivacyError:class extends Error{},readReportPrivacyPreferences:state.privacy,
  saveReportPrivacyPreferences:vi.fn(),readReportPrivacyPolicyState:vi.fn(),
}))
import personal from '../modules/huiteacher/personalScale.routes'
import observer from '../modules/huiteacher/observer.routes'
import consensus from '../modules/huiteacher/consensus.routes'
import fieldForm from '../modules/huiteacher/fieldForm.routes'
import feedback from '../modules/huiteacher/fieldFeedback.routes'
import student from '../modules/huiteacher/studentEvaluation.routes'
import improvement from '../modules/huiteacher/improvement.routes'
import {teacherReportPrivacyRoutes,campusReportPrivacyRoutes} from '../modules/report-privacy/routes'

const routers:Array<{name:string;router:Router}>=[
  {name:'personal',router:personal},{name:'observer',router:observer},
  {name:'consensus',router:consensus},{name:'fieldForm',router:fieldForm},
  {name:'feedback',router:feedback},{name:'student',router:student},
  {name:'improvement',router:improvement},{name:'privacy',router:teacherReportPrivacyRoutes},
]
// Exercise every registered method in isolation: removing a catch-all guard
// must never leave a less commonly used write path anonymously reachable.
const anonymousCases=routers.flatMap(({name,router})=>router.stack
  .filter((layer:any)=>layer.route)
  .flatMap((layer:any)=>Object.keys(layer.route.methods).map(method=>({
    name,method:method.toUpperCase(),path:String(layer.route.path)
      .replace(/:[A-Za-z]+/g,'00000000-0000-4000-8000-000000000002'),
  }))))
let server:Server,origin:string
const headers={cookie:'huiteacher_session=fixture'}
const privacyPath='/organizations/00000000-0000-4000-8000-000000000002/report-privacy/preferences?scenario=TEACHER_ADULT_FORM_GROUP'

beforeAll(async()=>{
  const app=express()
  app.use(express.json())
  // Same order as the application; later modules must not repeat auth checks.
  for(const {name,router} of routers){
    app.use('/api/huiteacher',router)
    app.use('/isolated/'+name,router)
  }
  app.use('/api/campus',campusReportPrivacyRoutes)
  app.use('/api/huiteacher',(_req,res)=>res.status(404).json({code:'NOT_FOUND'}))
  server=app.listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server.once('listening',resolve))
  const address=server.address()
  if(!address||typeof address==='string')throw new Error('fixture listener missing')
  origin='http://127.0.0.1:'+address.port
})
afterAll(async()=>{
  server.closeAllConnections()
  await new Promise<void>(resolve=>server.close(()=>resolve()))
})
beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','true')
  vi.stubEnv('HUITEACHER_IMPROVEMENT_ENABLED','true')
  vi.stubEnv('REPORT_PRIVACY_PREFERENCES_V1_ENABLED','true')
  state.principal.isFrozen=false
  state.needsMfa=false
  state.verify.mockReturnValue({userId:state.principal.userId,accountDomain:'SCHOOL',
    sessionProduct:'HUITEACHER',tokenVersion:0})
  state.query.mockImplementation((parts:TemplateStringsArray)=>Promise.resolve(
    parts.join('').includes('AS "userId"')?[{...state.principal}]:[{required:state.needsMfa}],
  ))
  state.goals.mockResolvedValue({list:[]})
  state.privacy.mockResolvedValue({list:[]})
})
afterEach(()=>vi.unstubAllEnvs())

describe('Huiteacher matched route authentication and feature isolation',()=>{
  it.each(anonymousCases)('protects $method $name $path without upstream guards',async({name,method,path})=>{
    const res=await fetch(origin+'/isolated/'+name+path,{method})
    expect(res.status).toBe(401)
    expect(state.query).not.toHaveBeenCalled()
    expect(state.goals).not.toHaveBeenCalled()
    expect(state.privacy).not.toHaveBeenCalled()
  })
  it('authenticates a later privacy route with two DB checks instead of stacked module checks',async()=>{
    const res=await fetch(origin+'/api/huiteacher'+privacyPath,{headers})
    expect(res.status).toBe(200)
    expect(state.query).toHaveBeenCalledTimes(2)
    expect(state.privacy).toHaveBeenCalledOnce()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
  it('does not let disabled student feedback or improvement block unrelated privacy routes',async()=>{
    vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','false')
    vi.stubEnv('HUITEACHER_IMPROVEMENT_ENABLED','false')
    const res=await fetch(origin+'/api/huiteacher'+privacyPath,{headers})
    expect(res.status).toBe(200)
    expect(state.query).toHaveBeenCalledTimes(2)
    expect(state.privacy).toHaveBeenCalledOnce()
    for(const path of ['/my-student-feedback','/my-improvement-targets']){
      const disabled=await fetch(origin+'/api/huiteacher'+path,{headers})
      expect(disabled.status).toBe(404)
    }
    expect(state.query).toHaveBeenCalledTimes(2)
  })
  it('keeps an unrelated route and verb out of authentication and feature checks',async()=>{
    vi.stubEnv('REPORT_PRIVACY_PREFERENCES_V1_ENABLED','false')
    expect((await fetch(origin+'/api/huiteacher/unknown',{headers})).status).toBe(404)
    expect((await fetch(origin+'/api/huiteacher/my-improvement-targets',{headers,method:'DELETE'})).status).toBe(404)
    expect(state.query).not.toHaveBeenCalled()
  })
  it('reloads current account state on the next request instead of caching it across requests',async()=>{
    const path=origin+'/api/huiteacher/my-improvement-targets'
    expect((await fetch(path,{headers})).status).toBe(200)
    expect(state.query).toHaveBeenCalledTimes(2)
    state.principal.isFrozen=true
    expect((await fetch(path,{headers})).status).toBe(401)
    expect(state.query).toHaveBeenCalledTimes(3)
    expect(state.goals).toHaveBeenCalledOnce()
  })
  it('retains mandatory MFA, product sessions, and sensitive step-up checks',async()=>{
    state.needsMfa=true
    expect((await fetch(origin+'/api/huiteacher/my-improvement-targets',{headers})).status).toBe(401)
    state.needsMfa=false
    state.verify.mockReturnValue({userId:state.principal.userId,accountDomain:'SCHOOL',
      sessionProduct:'HUISCHOOL',tokenVersion:0})
    expect((await fetch(origin+'/api/huiteacher/my-improvement-targets',{headers})).status).toBe(401)
    state.verify.mockReturnValue({userId:state.principal.userId,accountDomain:'SCHOOL',
      sessionProduct:'HUITEACHER',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000)-600})
    const stepUp=await fetch(origin+'/api/huiteacher/consensuses/00000000-0000-4000-8000-000000000002',{headers})
    expect(stepUp.status).toBe(403)
    expect(state.goals).not.toHaveBeenCalled()
  })
  it('preserves HUISCHOOL session isolation in the shared privacy route factory',async()=>{
    const schoolHeaders={cookie:'huischool_session=fixture'}
    const path=origin+'/api/campus'+privacyPath.replace('TEACHER_ADULT_FORM_GROUP','SCHOOL_GENERAL_EDUCATION_GROUP')
    expect((await fetch(path,{headers:schoolHeaders})).status).toBe(401)
    state.verify.mockReturnValue({userId:state.principal.userId,accountDomain:'SCHOOL',
      sessionProduct:'HUISCHOOL',tokenVersion:0})
    expect((await fetch(path,{headers:schoolHeaders})).status).toBe(200)
    expect(state.privacy).toHaveBeenCalledOnce()
  })
})
