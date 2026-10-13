import { Router } from 'express'
import { z,ZodError } from 'zod'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { requireTeacherProductAdmin,requireRecentTeacherMfa } from './authority'
import {
  HuiteacherConsensusError,createHuiteacherFieldConsensus,
  listHuiteacherFieldConsensuses,readHuiteacherFieldConsensus,
  updateHuiteacherFieldConsensus,approveHuiteacherFieldConsensus,
  submitHuiteacherFieldConsensus,myHuiteacherConsensusReviews,
} from './consensus.service'
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
const eventParams=z.object({organizationId:uuid,eventId:uuid}).strict()
const text=z.object({
  title:z.string().trim().min(2).max(200),
  content:z.string().trim().min(1).max(12000),
}).strict()
const create=text.extend({
  sourceRecordIds:z.array(uuid).min(2).max(30),
}).strict()
const update=text.extend({expectedRevision:z.number().int().min(1)}).strict()
const revision=z.object({expectedRevision:z.number().int().min(1)}).strict()
const approve=revision.extend({
  expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
const limiter=createRedisRateLimiter({
  name:'huiteacher-consensus-actions',limit:36,windowSeconds:900,
  key:req=>req.user?.userId||req.ip||'unknown',
})
const wrap=(fn:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await fn(req))}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'HUITEACHER_CONSENSUS_INPUT_INVALID',
      message:'协商结果、版本或引用格式无效',data:null,
    })
    if(e instanceof HuiteacherConsensusError)return res.status(e.statusCode).json({
      code:e.code,message:'协商评价来源、权限、签名或版本不满足要求',data:null,
    })
    throw e
  }
})
router.get('/my-consensus-reviews',authenticateHuiteacher,wrap(req=>
  myHuiteacherConsensusReviews(req.user!.userId)))
router.post('/consensuses/:consensusId/approve',authenticateHuiteacher,limiter,wrap(req=>
  approveHuiteacherFieldConsensus({
    actorUserId:req.user!.userId,
    consensusId:uuid.parse(req.params.consensusId),
    ...approve.parse(req.body),
  })))
router.get('/organizations/:organizationId/evaluation-events/:eventId/consensuses',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,wrap(req=>
    listHuiteacherFieldConsensuses({
      ...eventParams.parse(req.params),actorUserId:req.user!.userId,
    })))
router.post('/organizations/:organizationId/evaluation-events/:eventId/consensuses',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,limiter,wrap(req=>
    createHuiteacherFieldConsensus({
      ...eventParams.parse(req.params),actorUserId:req.user!.userId,
      ...create.parse(req.body),
    })))
router.get('/consensuses/:consensusId',authenticateHuiteacher,requireRecentTeacherMfa,wrap(req=>
  readHuiteacherFieldConsensus({
    consensusId:uuid.parse(req.params.consensusId),
    actorUserId:req.user!.userId,
  })))
router.put('/consensuses/:consensusId',authenticateHuiteacher,requireRecentTeacherMfa,limiter,wrap(req=>
  updateHuiteacherFieldConsensus({
    consensusId:uuid.parse(req.params.consensusId),
    actorUserId:req.user!.userId,...update.parse(req.body),
  })))
router.post('/consensuses/:consensusId/submit',authenticateHuiteacher,requireRecentTeacherMfa,
  limiter,wrap(req=>submitHuiteacherFieldConsensus({
    consensusId:uuid.parse(req.params.consensusId),
    actorUserId:req.user!.userId,...revision.parse(req.body),
  })))
export default router
