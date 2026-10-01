import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { authenticate, requireTeacher } from '../../middleware/auth'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { success, error } from '../../utils/response'
import * as service from './service'

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
anonymousStudyRouter.get('/:studyId/statistics',wrap(async(req,res)=>success(res,await service.waveStatistics(req.user!.userId,id.parse(req.params.studyId)))))
anonymousStudyRouter.get('/:studyId/waves/:waveId/export.csv',wrap(async(req,res)=>{
  const csv=await service.exportWaveCsv(req.user!.userId,req.user!.role,id.parse(req.params.studyId),id.parse(req.params.waveId))
  res.setHeader('Content-Disposition',`attachment; filename="wave-${req.params.waveId}.csv"`)
  res.type('text/csv').send(csv)
}))
export const publicAnonymousStudyRouter=Router()
publicAnonymousStudyRouter.use(noStore,rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:'draft-7',legacyHeaders:false,
  validate:{keyGeneratorIpFallback:false},keyGenerator:req=>hashRecoveryToken(credential(req) || req.ip || 'unknown')}))
publicAnonymousStudyRouter.post('/waves/:waveId/info',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200)}).strict().parse(req.body)
  return success(res,await service.publicWaveInfo(id.parse(req.params.waveId),body.token))
}))
publicAnonymousStudyRouter.post('/waves/:waveId/join',wrap(async(req,res)=>{
  const body=z.object({token:z.string().min(20).max(200),consent:z.literal(true)}).strict().parse(req.body)
  return success(res,await service.joinStudy(id.parse(req.params.waveId),body.token,body.consent))
}))
publicAnonymousStudyRouter.get('/:studyId',wrap(async(req,res)=>success(res,await service.participantHome(id.parse(req.params.studyId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/start',wrap(async(req,res)=>success(res,await service.startStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/waves/:waveId/recover',wrap(async(req,res)=>success(res,await service.recoverStudyWave(id.parse(req.params.studyId),id.parse(req.params.waveId),credential(req)))))
publicAnonymousStudyRouter.post('/:studyId/revoke',wrap(async(req,res)=>success(res,await service.revokeStudyIdentity(id.parse(req.params.studyId),credential(req)))))
