import {Router} from 'express'
import {z,ZodError} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {authenticateHuiteacher} from '../../middleware/auth'
import {success} from '../../utils/response'
import {requireTeacherProductAdmin,requireRecentTeacherMfa} from './authority'
import {HuiteacherImprovementError,createHuiteacherImprovement,
  listHuiteacherImprovements,transitionHuiteacherImprovement} from './improvement.service'

const router=Router()
const id=z.string().uuid()
const targetParams=z.object({organizationId:id,targetId:id}).strict()
const actionParams=targetParams.extend({actionId:id}).strict()
const cursor=z.object({cursor:id.optional()}).strict()
const create=z.object({goal:z.string().trim().min(2).max(400),
  plan:z.string().trim().min(5).max(4000),
  sourceEventId:id.nullable().optional(),
  dueAt:z.string().datetime().nullable().optional(),
}).strict()
const transition=z.object({expectedVersion:z.number().int().min(1),
  action:z.enum(['START','COMPLETE','CANCEL']),
  evidence:z.string().trim().max(6000).optional(),
}).strict()
const limiter=createRedisRateLimiter({
  name:'huiteacher-improvement-v1',limit:40,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(work:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await work(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_ACTION_INPUT_INVALID',message:'目标、行动或证据格式无效',data:null,
    })
    if(e instanceof HuiteacherImprovementError)return res.status(e.statusCode).json({
      code:e.code,message:'改进行动权限、状态或加密完整性检查未通过',data:null,
    })
    throw e
  }
})
router.use((_,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  if(process.env.HUITEACHER_IMPROVEMENT_ENABLED!=='true')
    return res.status(404).json({
      code:'HUITEACHER_IMPROVEMENT_DISABLED',message:'改进行动功能暂未开放',data:null,
    })
  next()
})
router.use(authenticateHuiteacher)
const base='/organizations/:organizationId/evaluation-targets/:targetId/improvement-actions'
router.get(base,wrap(req=>listHuiteacherImprovements({
  ...targetParams.parse(req.params),...cursor.parse(req.query),
  actorUserId:req.user!.userId,
})))
router.post(base+'/private',limiter,wrap(req=>{
  const body=create.parse(req.body)
  return createHuiteacherImprovement({
    ...targetParams.parse(req.params),actorUserId:req.user!.userId,
    audience:'PRIVATE_PERSONAL',...body,
    dueAt:body.dueAt?new Date(body.dueAt):null,
  })
}))
router.post(base+'/school',requireTeacherProductAdmin,requireRecentTeacherMfa,
  limiter,wrap(req=>{
    const body=create.parse(req.body)
    return createHuiteacherImprovement({
      ...targetParams.parse(req.params),actorUserId:req.user!.userId,
      audience:'SCHOOL_SHARED',...body,
      dueAt:body.dueAt?new Date(body.dueAt):null,
    })
  }))
const update=(audience:'PRIVATE_PERSONAL'|'SCHOOL_SHARED')=>
  wrap(req=>transitionHuiteacherImprovement({
    ...actionParams.parse(req.params),
    actorUserId:req.user!.userId,expectedAudience:audience,
    ...transition.parse(req.body),
  }))
router.post(base+'/private/:actionId/transition',limiter,update('PRIVATE_PERSONAL'))
router.post(base+'/school/:actionId/transition',
  requireTeacherProductAdmin,requireRecentTeacherMfa,limiter,update('SCHOOL_SHARED'))
export default router
