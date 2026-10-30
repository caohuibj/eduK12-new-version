import {surveyTrackingSelectionSchema} from './personal-tracking'
import {listSurveyContentOptions,surveyContentOptionsQuerySchema} from './content-options.service'
import {SurveyBuilderError} from './builder.service'
import {ContentReleaseError} from '../measurement-content/release'
import {surveyParticipantFeedbackSelectionsSchema} from './participant-feedback'
import {surveyContentSelectionsSchema} from './content-selection'
import {SurveyGovernanceError} from './governance.service'
import {CatalogSourceError} from './catalog.sources'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import * as service from './waves.service'
import * as publish from './waves.publish'
import { SurveyDraftError } from './builder.definition'
import { SurveyFlowError } from './flow.definition'
import { groupQuotaPolicySchema,surveyCheckpointPolicySchema } from './operations.definition'
import { groupIpDraftPolicySchema,GroupIpPolicyError } from './group-ip-policy'

export const surveyWavesRouter=Router()
surveyWavesRouter.use('/:pid/waves',authenticateSurvey)
const id=z.string().guid()
const wave=z.object({
  title:z.string().trim().min(1).max(160),
  consentText:z.string().max(20000),
  linkageNoticeConfirmed:z.boolean().optional(),
  generalText:z.string().max(4000).optional(),
  instrumentIds:z.array(id).max(30).refine(a=>new Set(a).size===a.length),
  opensAt:z.string().datetime().nullable().optional(),
  closesAt:z.string().datetime().nullable().optional(),
  finishUntil:z.string().datetime().nullable().optional(),
  quotaStarts:z.number().int().min(1).nullable().optional(),
  allowNewParticipants:z.boolean().optional(),
  flowDefinition:z.unknown().nullable().optional(),
  quotaPolicy:groupQuotaPolicySchema.nullable().optional(),
  checkpointPolicy:surveyCheckpointPolicySchema.nullable().optional(),
  groupIpPolicy:groupIpDraftPolicySchema.nullable().optional(),
}).strict()
const create=wave.extend({requestId:id})
const update=wave.extend({revision:z.number().int().nonnegative()})
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'研究波次参数格式不合法',-1,400)
    if(e instanceof SurveyDraftError)return res.status(400).json({code:'SURVEY_DRAFT_INVALID',
      message:e.issues.slice(0,5).map(i=>i.path+'：'+i.message).join('；')||'研究工具包含待修正字段',
      data:{issues:e.issues}})
    if(e instanceof ContentReleaseError)return error(res,'内容版本校验失败，请刷新后重试',-1,409)
    if(e instanceof SurveyBuilderError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyGovernanceError||e instanceof CatalogSourceError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof GroupIpPolicyError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof service.SurveyWaveError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyFlowError)return error(res,e.issues.slice(0,5).map(i=>i.path+'：'+i.message).join('；'),-1,400)
    next(e)
  }
}
surveyWavesRouter.get('/:pid/waves',handle(req=>
  service.listWaves(req.user!.userId,id.parse(req.params.pid),Math.min(1000,Math.max(1,Number(req.query.page)||1)))))
surveyWavesRouter.post('/:pid/waves',handle(req=>
  service.createWave(req.user!.userId,id.parse(req.params.pid),create.parse(req.body))))
surveyWavesRouter.get('/:pid/waves/:wid/content-options',handle(req=>
  listSurveyContentOptions(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),surveyContentOptionsQuerySchema.parse(req.query))))
surveyWavesRouter.get('/:pid/waves/:wid',handle(req=>
  service.getWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid))))
surveyWavesRouter.patch('/:pid/waves/:wid',handle(req=>
  service.updateWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),update.parse(req.body))))
surveyWavesRouter.post('/:pid/waves/:wid/next',handle(req=>
  service.createNextWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),z.object({requestId:id}).strict().parse(req.body).requestId)))
surveyWavesRouter.post('/:pid/waves/:wid/preflight',handle(req=>
  service.preflightWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid))))

const revision=z.object({revision:z.number().int().nonnegative()}).strict()
for(const [name,action] of [['rotate','ROTATE'],['revoke','REVOKE']] as const){
  surveyWavesRouter.post('/:pid/waves/:wid/entry-token/'+name,handle(req=>
    publish.updateWaveEntryToken({
      actorUserId:req.user!.userId,
      projectId:id.parse(req.params.pid),waveId:id.parse(req.params.wid),
      revision:revision.parse(req.body).revision,action,
    })))
}
surveyWavesRouter.post('/:pid/waves/:wid/prepare',handle(req=>{
  const input=revision.extend({contentSelections:surveyContentSelectionsSchema.optional(),participantFeedback:surveyParticipantFeedbackSelectionsSchema.optional(),tracking:surveyTrackingSelectionSchema.optional()}).parse(req.body)
  return publish.prepareWave(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.wid),input.revision,input.contentSelections,input.participantFeedback,input.tracking)
}))
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
