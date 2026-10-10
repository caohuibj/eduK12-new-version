import { Router } from 'express'
import { z, ZodError } from 'zod'
import { authenticateSchool } from '../../middleware/auth'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { CampusActivityError } from './activity.service'
import {
  studentPeerConsent,guardianPeerConsent,allocateCampusPeers,
  myCampusPeerTargets,myPeerConsentState,guardianPeerRequests,campusPeerDisclosure,
} from './peer.service'

const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const uuid=z.string().uuid()
const path=z.object({organizationId:uuid,courseId:uuid})
const limiter=createRedisRateLimiter({name:'campus-peer-consent',limit:20,windowSeconds:900,
  key:req=>req.user?.userId??'anonymous'})
const wrap=(handler:(req:any,res:any)=>Promise<any>)=>asyncHandler(async(req,res)=>{
  try{return await handler(req,res)}
  catch(error){
    if(error instanceof CampusActivityError)return res.status(error.statusCode).json({
      code:error.code,message:'同伴互评尚未取得当前授权或有效同意',data:null,
    })
    if(error instanceof ZodError)return res.status(400).json({
      code:'CAMPUS_PEER_INPUT_INVALID',message:'同伴互评请求信息无效',data:null,
    })
    throw error
  }
})
router.get('/peer-consent/policy',authenticateSchool,wrap(async(_req,res)=>
  success(res,campusPeerDisclosure())
))
router.get('/organizations/:organizationId/activities/:courseId/peer-consent',
  authenticateSchool,wrap(async(req,res)=>
    success(res,await myPeerConsentState(req.user!,...path.parse(req.params)))))
router.post('/organizations/:organizationId/activities/:courseId/peer-consent',
  authenticateSchool,limiter,wrap(async(req,res)=>{
    const body=z.object({action:z.enum(['ASSENT','WITHDRAW'])}).strict().parse(req.body)
    return success(res,await studentPeerConsent({actor:req.user!,...path.parse(req.params),...body}))
  }))
router.get('/guardian/peer-consent-requests',authenticateSchool,wrap(async(req,res)=>
  success(res,await guardianPeerRequests(req.user!))
))
router.post('/organizations/:organizationId/activities/:courseId/guardian-peer-consent',
  authenticateSchool,limiter,wrap(async(req,res)=>{
    const body=z.object({relationshipId:uuid,action:z.enum(['CONSENT','WITHDRAW'])})
      .strict().parse(req.body)
    return success(res,await guardianPeerConsent({actor:req.user!,...path.parse(req.params),...body}))
  }))
router.post('/organizations/:organizationId/activities/:courseId/peer-allocations',
  authenticateSchool,requireRecentSchoolMfa,wrap(async(req,res)=>{
    const body=z.object({classUnitId:uuid,peersPerRespondent:z.number().int().min(1).max(3)})
      .strict().parse(req.body)
    return success(res,await allocateCampusPeers({actor:req.user!,...path.parse(req.params),...body}))
  }))
router.get('/organizations/:organizationId/activities/:courseId/peer-targets',
  authenticateSchool,wrap(async(req,res)=>
    success(res,await myCampusPeerTargets({actor:req.user!,...path.parse(req.params)}))
  ))
export default router
