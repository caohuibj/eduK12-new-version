import { Router,type Request,type Response,type NextFunction } from 'express'
import { z } from 'zod'
import { success,error } from '../../utils/response'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { SurveyWaveError } from './waves.service'
import { SurveyFinalValidationError } from './final.compute'
import { ResearchIdentityError } from './identity.service'
import { SurveyAssignmentError } from './flow.assignment'
import { administrationProvenanceV1Schema } from '../cognitive/administration-provenance'
import { startSurveyCognitive,readSurveyCognitive,interruptSurveyCognitive,restartSurveyCognitive,
  submitSurveyCognitiveFinal,SurveyCognitiveError } from './cognitive.service'
export const surveyCognitiveRouter=Router({mergeParams:true})
const id=z.string().guid(),slot=z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const proof=z.object({accessCredential:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  researchCode:z.string().regex(/^R-[A-Z0-9]{8,32}$/).optional()}).strict()
const start=proof.extend({priorAnswers:z.record(z.string(), z.record(z.string(), z.unknown())),
  administrationProvenance:administrationProvenanceV1Schema}).strict()
const epoch=proof.extend({attemptEpoch:z.number().int().min(1).max(2)}).strict()
const final=epoch.extend({submissionId:z.string().min(16).max(200),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),
  contextSnapshotHash:z.null().optional(),trials:z.array(z.unknown()).min(1).max(1000),
  administrationProvenance:administrationProvenanceV1Schema}).strict()
const identity=(req:Request,body:{accessCredential:string;researchCode?:string})=>({
  publicId:id.parse(req.params.publicId),attemptId:id.parse(req.params.attemptId),
  accessCredential:body.accessCredential,researchCode:body.researchCode,
})
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await action(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'认知输入不合法',-1,400)
    if(e instanceof SurveyCognitiveError||e instanceof InstrumentFinalSubmitError||e instanceof SurveyWaveError||e instanceof ResearchIdentityError)
      return error(res,e.message,-1,e.statusCode)
    if(e instanceof SurveyFinalValidationError)return error(res,e.path+'：'+e.message,-1,400)
    if(e instanceof SurveyAssignmentError)return error(res,e.message,-1,409)
    next(e)
  }
}
surveyCognitiveRouter.post('/:slotKey/start',handle(req=>{
  const body=start.parse(req.body)
  return startSurveyCognitive(identity(req,body),slot.parse(req.params.slotKey),body)
}))
surveyCognitiveRouter.post('/:slotKey/:sessionId/read',handle(req=>
  readSurveyCognitive(identity(req,proof.parse(req.body)),slot.parse(req.params.slotKey),id.parse(req.params.sessionId))))
surveyCognitiveRouter.post('/:slotKey/:sessionId/interrupt',handle(req=>{
  const body=epoch.parse(req.body)
  return interruptSurveyCognitive(identity(req,body),slot.parse(req.params.slotKey),id.parse(req.params.sessionId),body.attemptEpoch)
}))
surveyCognitiveRouter.post('/:slotKey/:sessionId/restart',handle(req=>{
  const body=epoch.parse(req.body)
  return restartSurveyCognitive(identity(req,body),slot.parse(req.params.slotKey),id.parse(req.params.sessionId),body.attemptEpoch)
}))
surveyCognitiveRouter.post('/:slotKey/:sessionId/final',handle(req=>{
  const body=final.parse(req.body)
  return submitSurveyCognitiveFinal(identity(req,body),slot.parse(req.params.slotKey),id.parse(req.params.sessionId),body)
}))
