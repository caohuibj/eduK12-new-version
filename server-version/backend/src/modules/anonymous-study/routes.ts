import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { authenticate, requireTeacher } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import * as service from './service'
import * as governance from './governance'

const id=z.string().guid(), title=z.string().trim().min(1).max(120)
const credential=(req:Request) => {
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('Authorization') || '')
  return match?.[1] ?? ''
}
import { BoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'
import { isAssessmentStartBusyError } from '../composite/start-transient'

const P2028_ROLLED_BACK=/Unable to start a transaction in the given time|expired transaction/i
const ROLLED_BACK_SQLSTATES=new Set(['40001','40P01','55P03'])

export const isTransientStudyDatabaseError=(error:unknown):boolean=>{
  const candidate=error as {code?:unknown;message?:unknown;meta?:{code?:unknown}}|null
  if(!candidate||typeof candidate!=='object')return false
  if(candidate.code==='P2024'||candidate.code==='P2034')return true
  if(candidate.code==='P2028'&&typeof candidate.message==='string'&&P2028_ROLLED_BACK.test(candidate.message))return true
  const sqlState=typeof candidate.meta?.code==='string'?candidate.meta.code:typeof candidate.code==='string'?candidate.code:null
  return Boolean(sqlState&&ROLLED_BACK_SQLSTATES.has(sqlState))
}

const wrap=(work:(req:Request,res:Response)=>Promise<unknown>) => async(req:Request,res:Response,next:NextFunction)=>{
  try {await work(req,res)} catch(e) {
    if(isAssessmentStartBusyError(e)){
      res.setHeader('Retry-After',String(e.retryAfterSeconds))
      return res.status(503).json({code:e.code,message:e.message,data:null})
    }
    if(e instanceof BoundedAdmissionBusyError){
      res.setHeader('Retry-After',String(e.retryAfterSeconds))
      return res.status(503).json({code:e.code,message:e.message,data:null})
    }
    if(e instanceof z.ZodError) return error(res,'请求参数无效',-1,400)
    const status=(e as {statusCode?:number}).statusCode
    if(status && status>=400 && status<500) return error(res,(e as Error).message,-1,status)
    next(e)
  }
}
const noStore=(_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next()}
export const anonymousStudyRouter=Router()
anonymousStudyRouter.use(noStore,authenticate,requireTeacher)
anonymousStudyRouter.get('/',wrap(async(req,res)=>success(res,await service.listStudies(req.user!.userId))))
anonymousStudyRouter.post('/',wrap(async(req,res)=>success(res,await service.createStudy(req.user!.userId,z.object({title}).strict().parse(req.body).title))))
anonymousStudyRouter.post('/:studyId/close',wrap(async(req,res)=>success(res,await service.closeStudy(req.user!.userId,id.parse(req.params.studyId)))))
anonymousStudyRouter.post('/:studyId/waves',wrap(async(req,res)=>success(res,await service.addWave(req.user!.userId,req.user!.role,id.parse(req.params.studyId),z.object({compositeId:id,tokenId:id,title}).strict().parse(req.body)))))
anonymousStudyRouter.post('/:studyId/waves/create-with-link',wrap(async(req,res)=>success(res,await service.createWaveWithLink(req.user!.userId,req.user!.role,id.parse(req.params.studyId),z.object({requestId:id,compositeId:id,title,expiresAt:z.string().datetime(),maxUses:z.number().int().min(0).max(2147483647)}).strict().parse(req.body)))))
anonymousStudyRouter.get('/:studyId/statistics',wrap(async(req,res)=>success(res,await service.waveStatistics(req.user!.userId,id.parse(req.params.studyId)))))
anonymousStudyRouter.get('/:studyId/waves/:waveId/export.csv',wrap(async(req,res)=>{
  const csv=await service.exportWaveCsv(req.user!.userId,req.user!.role,id.parse(req.params.studyId),id.parse(req.params.waveId))
  res.setHeader('Content-Disposition',`attachment; filename="wave-${req.params.waveId}.csv"`)
  res.setHeader('X-Export-Purpose','EDUCATION_RECORDS_NOT_RESEARCH_SAMPLE')
  res.type('text/csv').send(csv)
}))
export const publicAnonymousStudyRouter=Router()
publicAnonymousStudyRouter.use(noStore)
// NOTE (2026-11-12, user decision): the router-level 150 req / 15 min / IP budget
// was intentionally removed here. It capped one school NAT IP at ~75 students /
// 15 min (the real page calls info + join per student, 2 IP-keyed requests each),
// which blocked the "500 joins behind one NAT" goal. A replacement protection
// method is TBD by the user and is NOT part of this change. Per-endpoint limits
// (join 500, code recover/reset 30) and the join admission gate remain.
// Join bursts from one school NAT IP are legitimate class traffic: a single
// anonymous questionnaire will never exceed 500 total responses, so 500 joins
// per 15 minutes covers the maximum expected load even if every respondent
// shares one NAT IP. The per-IP guessing budget rises from 30 to 500; the
// remaining compensating controls are the long random wave token (required on
// every join), the scrypt verification cost, and the join admission gate.
// Code recover/reset keep the tighter 30 budget: they are single-student
// actions and a code-guessing surface.
// Join rate limit: 500 / 15min / IP. Only retryable STUDY_JOIN_BUSY 503
// responses are exempt: malformed input, denied codes and unrelated failures
// must still consume a finite guessing/abuse budget. The 503 exemption lets
// legitimate school-NAT retries survive queue admission without exhausting
// the join budget; all expensive join work remains bounded by the gate.
// express-rate-limit >=8.7.2 is required for correct window-boundary
// decrement accounting with skipFailedRequests + the default MemoryStore.
// requestWasSuccessful is used exclusively to select the 503 exemption.
export const anonymousJoinRateLimit = rateLimit({
  windowMs:15*60*1000,limit:500,standardHeaders:'draft-7',legacyHeaders:false,
  skipFailedRequests:true,
  requestWasSuccessful:(_req,res)=>!(res.statusCode===503 && res.locals.studyJoinRetryableBusy===true),
})
publicAnonymousStudyRouter.use(['/waves/:waveId/join'], anonymousJoinRateLimit)
publicAnonymousStudyRouter.use(['/:studyId/code/recover','/:studyId/code/reset'],
 rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}))
publicAnonymousStudyRouter.post('/waves/:waveId/info',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200)}).strict().parse(req.body)
  return success(res,await service.publicWaveInfo(id.parse(req.params.waveId),body.token))
}))
publicAnonymousStudyRouter.post('/waves/:waveId/join',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200),consent:z.literal(true),prefix:z.string().max(40).optional(),suffix:z.string().max(40).optional(),generatedCode:z.literal(true).optional()}).strict().parse(req.body)
  try {
    return success(res,await service.joinStudy(id.parse(req.params.waveId),body.token,body.consent,body))
  } catch(e) {
    if(e instanceof BoundedAdmissionBusyError || isTransientStudyDatabaseError(e)){
      res.locals.studyJoinRetryableBusy=true
      res.setHeader('Retry-After',String((e as {retryAfterSeconds?:number}).retryAfterSeconds || 1))
      return res.status(503).json({code:'STUDY_JOIN_BUSY',message:'匿名研究加入繁忙，请稍后重试',data:null})
    }
    throw e
  }
}))
publicAnonymousStudyRouter.get('/:studyId/participation-info',wrap(async(req,res)=>success(res,await service.publicParticipationInfo(id.parse(req.params.studyId)))))
publicAnonymousStudyRouter.post('/:studyId/changes',wrap(async(req,res)=>{
 const {attemptId}=z.object({attemptId:id}).strict().parse(req.body)
 const {readTrainingPersonalChanges}=await import('../composite/personal-tracking.service')
 return success(res,await readTrainingPersonalChanges(attemptId,{study:{studyId:id.parse(req.params.studyId),credential:credential(req)}}))
}))
publicAnonymousStudyRouter.post('/:studyId/code/recover',wrap(async(req,res)=>{
 const body=z.object({code:z.string().max(64)}).strict().parse(req.body)
 return success(res,await service.recoverParticipationCode(id.parse(req.params.studyId),body.code))
}))
publicAnonymousStudyRouter.post('/:studyId/code/reset',wrap(async(req,res)=>{
 const body=z.object({resetCode:z.string().max(64),suffix:z.string().max(40)}).strict().parse(req.body)
 return success(res,await service.completeParticipationReset(id.parse(req.params.studyId),body.resetCode,body.suffix))
}))
publicAnonymousStudyRouter.get('/:studyId',wrap(async(req,res)=>success(res,await service.participantHome(id.parse(req.params.studyId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/start',wrap(async(req,res)=>{
  const wantsWhole = req.query.delivery === 'whole' || (req.body as { delivery?: unknown } | undefined)?.delivery === 'whole'
  return success(res,await service.startStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req),{ wantsWholeDelivery: wantsWhole }))
}))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/recover',wrap(async(req,res)=>{
  const wantsWhole = req.query.delivery === 'whole' || (req.body as { delivery?: unknown } | undefined)?.delivery === 'whole'
  return success(res,await service.recoverStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req),{ wantsWholeDelivery: wantsWhole }))
}))
publicAnonymousStudyRouter.post('/:studyId/revoke',wrap(async(req,res)=>success(res,await service.revokeStudyIdentity(id.parse(req.params.studyId),credential(req)))))

anonymousStudyRouter.get('/:studyId/research-consent',wrap(async(req,res)=>success(res,await governance.ownerStudyConsent(req.user!.userId,id.parse(req.params.studyId)))))
anonymousStudyRouter.post('/:studyId/research-consent',wrap(async(req,res)=>success(res,await governance.publishStudyConsent(req.user!.userId,id.parse(req.params.studyId),z.object({requestId:id,expectedVersionId:id.nullable(),body:z.string().min(20).max(20000),scope:z.object({purpose:z.string().trim().min(2).max(1000),dataCategories:z.array(z.enum(['FORM','SCALE','COGNITIVE','SJT'])).min(1).max(4)}).strict()}).strict().parse(req.body)))))
anonymousStudyRouter.post('/:studyId/participants/:participantId/research-withdrawal/review',wrap(async(req,res)=>success(res,await governance.reviewStudyWithdrawal(req.user!.userId,id.parse(req.params.studyId),id.parse(req.params.participantId),z.object({requestId:id,expectedRevision:z.number().int().positive(),reason:z.string().min(2).max(1000)}).strict().parse(req.body)))))
publicAnonymousStudyRouter.get('/:studyId/research-consent',wrap(async(req,res)=>success(res,await governance.participantStudyConsent(id.parse(req.params.studyId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/research-consent/accept',wrap(async(req,res)=>success(res,await governance.acceptStudyConsent(id.parse(req.params.studyId),credential(req),z.object({requestId:id,versionId:id,bodyHash:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(req.body)))))
publicAnonymousStudyRouter.post('/:studyId/research-withdrawal',wrap(async(req,res)=>success(res,await governance.withdrawStudyResearch(id.parse(req.params.studyId),credential(req),z.object({requestId:id,expectedRevision:z.number().int().nonnegative()}).strict().parse(req.body)))))

anonymousStudyRouter.get('/:studyId/research-withdrawals',wrap(async(req,res)=>success(res,await governance.listStudyWithdrawals(req.user!.userId,id.parse(req.params.studyId),z.coerce.number().int().min(1).max(240).default(1).parse(req.query.page)))))

anonymousStudyRouter.get('/:studyId/participation',wrap(async(req,res)=>success(res,await service.readParticipationSettings(req.user!.userId,id.parse(req.params.studyId),z.coerce.number().int().min(1).max(50).default(1).parse(req.query.page)))))
anonymousStudyRouter.put('/:studyId/participation',wrap(async(req,res)=>{
 const body=z.object({revision:z.number().int().nonnegative(),mode:z.enum(['PERSONAL_LINK','MEMORABLE_CODE','SELF_CODE']),label:z.string().trim().min(1).max(40),instructions:z.string().max(500),shortCodes:z.array(z.string().max(40)).max(5000)}).strict().parse(req.body)
 return success(res,await service.configureParticipation(req.user!.userId,id.parse(req.params.studyId),body))
}))
// Training owner approval is the product boundary; Survey MFA/cookies are never
// accepted as a substitute. Global CSRF and Training authentication still apply.
anonymousStudyRouter.post('/:studyId/participation/reset',
 rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}),
 wrap(async(req,res)=>{
  const body=z.object({prefix:z.string().min(1).max(40),confirmed:z.literal(true)}).strict().parse(req.body)
  return success(res,await service.resetParticipationCode(req.user!.userId,id.parse(req.params.studyId),body.prefix))
 }))
