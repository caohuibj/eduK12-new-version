import type {Response} from 'express'
import {serveAssessmentMaterial} from '../assessment-media/material-delivery'
import type {AssessmentMaterial} from '../assessment-media/material'
import {SurveyMediaError} from './media.references'
export async function serveSurveyMaterial(reference:AssessmentMaterial['asset'],res:Response){
  try{return await serveAssessmentMaterial(reference,res)}catch(cause){
    if((cause as {statusCode?:number}).statusCode===404)throw new SurveyMediaError(404,(cause as Error).message)
    throw cause
  }
}
