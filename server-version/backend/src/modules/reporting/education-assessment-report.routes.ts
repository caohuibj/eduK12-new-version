import { Router } from 'express'
import { z } from 'zod'
import { authenticateSchool, authenticateHuiteacher } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { readCampusStudentStatus } from '../campus/admission.service'
import { readEducationRespondentAssessmentReport } from './education-assessment-report.service'
import type { EducationAssessmentReportReader } from './education-assessment-personal-report.service'

/** Root mounts the independently composed reader under each authenticated
 * education base. There is no Training route, client source, or session ID. */
export function createEducationAssessmentReportRouter(product:'SCHOOL'|'TEACHER',readReport:EducationAssessmentReportReader){
  const router=Router()
  router.use(product==='SCHOOL'?authenticateSchool:authenticateHuiteacher)
  router.get('/assessment-reports/executions/:executionId',asyncHandler(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store, max-age=0')
    res.setHeader('Referrer-Policy','no-referrer')
    if(!req.user||(product==='SCHOOL'&&(req.user.role!=='STUDENT'||(await readCampusStudentStatus(req.user)).status!=='APPROVED'))
      ||(product==='TEACHER'&&(req.user.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(req.user.role)||req.user.teacherApproved!==true)))return res.status(404).end()
    const executionId=z.string().guid().safeParse(req.params.executionId)
    if(!executionId.success||Object.keys(req.query).length)return res.status(404).end()
    const report=await readReport({actorUserId:req.user.userId,executionId:executionId.data,product})
    if(!report)return res.status(404).end()
    return success(res,report)
  }))
  return router
}

export const educationSchoolAssessmentReportRouter=createEducationAssessmentReportRouter('SCHOOL',readEducationRespondentAssessmentReport)
export const educationTeacherAssessmentReportRouter=createEducationAssessmentReportRouter('TEACHER',readEducationRespondentAssessmentReport)
