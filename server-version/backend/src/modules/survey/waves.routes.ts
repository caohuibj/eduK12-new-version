import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import * as service from './waves.service'
import * as publish from './waves.publish'

export const surveyWavesRouter=Router()
surveyWavesRouter.use(authenticateSurvey)
const id=z.string().uuid()
const wave=z.object({
  title:z.string().trim().min(1).max(160),
  consentText:z.string().max(20000),
  generalText:z.string().max(4000).optional(),
  instrumentIds:z.array(id).max(30).refine(a=>new Set(a).size===a.length),
  opensAt:z.string().datetime().nullable().optional(),
  closesAt:z.string().datetime().nullable().optional(),
  finishUntil:z.string().datetime().nullable().optional(),
  quotaStarts:z.number().int().min(1).nullable().optional(),
  allowNewParticipants:z.boolean().optional(),
}).strict()
const create=wave.extend({requestId:id})
const update=wave.extend({revision:z.number().int().nonnegative()})
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'研究波次参数格式不合法',-1,400)
    if(e instanceof service.SurveyWaveError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
surveyWavesRouter.get('/:pid/waves',handle(req=>
  service.listWaves(req.user!.userId,id.parse(req.params.pid),Math.min(1000,Math.max(1,Number(req.query.page)||1)))))
surveyWavesRouter.post('/:pid/waves',handle(req=>
  service.createWave(req.user!.userId,id.parse(req.params.pid),create.parse(req.body))))
surveyWavesRouter.get('/:pid/waves/:wid',handle(req=>
  service.getWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid))))
surveyWavesRouter.patch('/:pid/waves/:wid',handle(req=>
  service.updateWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),update.parse(req.body))))
surveyWavesRouter.post('/:pid/waves/:wid/preflight',handle(req=>
  service.preflightWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid))))

const revision=z.object({revision:z.number().int().nonnegative()}).strict()
surveyWavesRouter.post('/:pid/waves/:wid/prepare',handle(req=>
  publish.prepareWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),
    revision.parse(req.body).revision)))
surveyWavesRouter.post('/:pid/waves/:wid/open',handle(req=>
  publish.openWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),
    revision.parse(req.body).revision)))
for(const [endpoint,transition] of [
  ['pause','PAUSE'],['resume','RESUME'],['close','CLOSE'],['hard-stop','HARD_STOP'],
] as const){
  surveyWavesRouter.post('/:pid/waves/:wid/'+endpoint,handle(req=>
    publish.transitionWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),
      revision.parse(req.body).revision,transition)))
}
