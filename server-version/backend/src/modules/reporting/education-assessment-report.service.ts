import { assertEducationAssessmentExecutionSource } from '../assessment-run/educationAssessmentExecution'
import { createEducationAssessmentReportReader } from './education-assessment-personal-report.service'
import { reportingFail } from './types'

/** Reuse the existing FROZEN execution-source fence. It verifies the exact
 * organization workflow, assignment, parent, C/P/R and original approval proof,
 * while retaining legal history after new-distribution/issuer retirement.
 * Current actor/product/REPORT_READ authority is checked independently by the
 * shared reader before and after materialization. No new-use authority is used. */
export const readEducationRespondentAssessmentReport=createEducationAssessmentReportReader({
  readSource:(tx,{executionId,compositeId})=>assertEducationAssessmentExecutionSource(tx,{executionId,compositeId,purpose:'FROZEN'}),
  assertSourceAuthority:async(_tx,{product,organizationId,source})=>{
    if(source.origin.product!==product||source.origin.organizationId!==organizationId)
      reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)
    // The FROZEN fence above already verifies the original immutable proof.
    // Never apply current issuer/new START checks to accepted report history.
  },
})
