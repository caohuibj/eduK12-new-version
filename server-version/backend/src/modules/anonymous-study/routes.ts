import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { authenticate, requireTeacher } from '../../middleware/auth'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { success, error } from '../../utils/response'
import * as service from './service'
import * as governance from './governance'

const id=z.string().uuid(), title=z.string().trim().min(1).max(120)
const credential=(req:Request) => {
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('Authorization') || '')
  return match?.[1] ?? ''
}
const wrap=(work:(req:Request,res:Response)=>Promise<unknown>) => async(req:Request,res:Response,next:NextFunction)=>{
  try {await work(req,res)} catch(e) {
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
publicAnonymousStudyRouter.use(noStore,rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:'draft-7',legacyHeaders:false,
  validate:{keyGeneratorIpFallback:false},keyGenerator:req=>hashRecoveryToken(credential(req) || req.ip || 'unknown')}))
// Always retain an IP budget for code guesses, independently of attacker-supplied
// bearer headers. The shared scrypt admission gate separately bounds CPU work.
publicAnonymousStudyRouter.use(['/waves/:waveId/join','/:studyId/code/recover','/:studyId/code/reset'],
 rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}))
publicAnonymousStudyRouter.post('/waves/:waveId/info',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200)}).strict().parse(req.body)
  return success(res,await service.publicWaveInfo(id.parse(req.params.waveId),body.token))
}))
publicAnonymousStudyRouter.post('/waves/:waveId/join',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200),consent:z.literal(true),prefix:z.string().max(40).optional(),suffix:z.string().max(40).optional(),generatedCode:z.literal(true).optional()}).strict().parse(req.body)
  return success(res,await service.joinStudy(id.parse(req.params.waveId),body.token,body.consent,body))
}))
publicAnonymousStudyRouter.get('/:studyId/participation-info',wrap(async(req,res)=>success(res,await service.publicParticipationInfo(id.parse(req.params.studyId)))))
publicAnonymousStudyRouter.post('/:studyId/code/recover',wrap(async(req,res)=>{
 const body=z.object({code:z.string().max(64)}).strict().parse(req.body)
 return success(res,await service.recoverParticipationCode(id.parse(req.params.studyId),body.code))
}))
publicAnonymousStudyRouter.post('/:studyId/code/reset',wrap(async(req,res)=>{
 const body=z.object({resetCode:z.string().max(64),suffix:z.string().max(40)}).strict().parse(req.body)
 return success(res,await service.completeParticipationReset(id.parse(req.params.studyId),body.resetCode,body.suffix))
}))
publicAnonymousStudyRouter.get('/:studyId',wrap(async(req,res)=>success(res,await service.participantHome(id.parse(req.params.studyId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/start',wrap(async(req,res)=>success(res,await service.startStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/recover',wrap(async(req,res)=>success(res,await service.recoverStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req)))))
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
