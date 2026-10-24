import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { success,error } from '../../utils/response'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { situationalLegacyFinalSubmitSchema } from '../situational/situational-final-submit.schema'
import { SurveyWaveError } from './waves.service'
import { ResearchIdentityError } from './identity.service'
import { SurveySituationalProtocolError } from './situational-native.contract'
import { startSurveySituational,readSurveySituational,submitSurveySituationalFinal,SurveySituationalError } from './situational-native.service'
export const surveySituationalRouter=Router({mergeParams:true})
const id=z.string().uuid(),slot=z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const proof=z.object({accessCredential:z.string().regex(/^[A-Za-z0-9_-]{43}$/),researchCode:z.string().regex(/^R-[A-Z0-9]{8,32}$/).optional()}).strict()
const final=proof.extend({submission:situationalLegacyFinalSubmitSchema}).strict()
const identity=(req:Request,body:z.infer<typeof proof>)=>({publicId:id.parse(req.params.publicId),
  attemptId:id.parse(req.params.attemptId),accessCredential:body.accessCredential,researchCode:body.researchCode})
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await action(req))}catch(e){
    if(e instanceof z.ZodError)return error(res,'情境化输入不合法',-1,400)
    if(e instanceof SurveySituationalProtocolError)return error(res,e.code,-1,409)
    if(e instanceof SurveySituationalError||e instanceof SurveyWaveError||e instanceof ResearchIdentityError||e instanceof InstrumentFinalSubmitError)
      return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
surveySituationalRouter.post('/:slotKey/start',handle(req=>{
  const body=proof.parse(req.body);return startSurveySituational(identity(req,body),slot.parse(req.params.slotKey))
}))
surveySituationalRouter.post('/:slotKey/:childId/read',handle(req=>{
  const body=proof.parse(req.body);return readSurveySituational(identity(req,body),slot.parse(req.params.slotKey),id.parse(req.params.childId))
}))
surveySituationalRouter.post('/:slotKey/:childId/final',handle(req=>{
  const body=final.parse(req.body);return submitSurveySituationalFinal(identity(req,body),slot.parse(req.params.slotKey),id.parse(req.params.childId),body.submission)
}))
