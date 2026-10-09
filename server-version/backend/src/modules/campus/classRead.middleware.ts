import type { Request, Response, NextFunction } from 'express'
import { assertCampusClassRead, CampusAdmissionError } from './admission.service'

/** Exposes only institution structural names, not student IDs or eligibility. */
export async function requireCampusClassRead(req:Request,res:Response,next:NextFunction) {
  if(!req.user)return res.status(401).json({code:-1,message:'需要校园账号'})
  try{
    await assertCampusClassRead(req.user,req.params.organizationId)
    next()
  }catch(error){
    if(error instanceof CampusAdmissionError)
      return res.status(error.statusCode).json({code:error.code,message:'无权查看当前学校班级'})
    next(error)
  }
}
