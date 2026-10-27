import type {RequestHandler} from 'express'
import {prisma} from '../../config/database'
import {assertPersonnelGovernor} from '../campus/personnel.binding'
import {CampusAdmissionError} from '../campus/admission.error'
/** Teacher access is additional to, never a replacement for, School governance.
 * Every personnel service also rechecks this unchanged policy in its transaction. */
export const requireSchoolPersonnelGovernor:RequestHandler=async(req,res,next)=>{
 try{await prisma.$transaction(tx=>assertPersonnelGovernor(tx,req.user!,req.params.organizationId));next()}
 catch(error){
  if(error instanceof CampusAdmissionError)return res.status(error.statusCode).json({code:error.code,message:'需要当前学校的 School 人员管理授权。Teacher 管理权限不能替代此授权。',data:null})
  next(error)
 }
}
