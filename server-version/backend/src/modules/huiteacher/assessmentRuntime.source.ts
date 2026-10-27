import {assertEducationAssessmentDistributionCurrent} from '../education-tools/assessment-resource.distribution'
import {readEducationAssessmentDeliveryIdentity} from '../education-tools/assessment-resource.repository'
import {assertEducationDeliveryIssuerCurrent} from '../education-tools/assessment-resource.authority'
import type {TeacherAssessmentSourceAccess} from './assessmentRuntime.access'

type Identity=Awaited<ReturnType<typeof readEducationAssessmentDeliveryIdentity>>
/** The participant guard supplies actual Teacher event/run/SELF/current actor
 * authority. This adapter supplies immutable source identity and original
 * issuer proof for NEW_USE; a respondent never needs manager privileges.
 * Ordinary retirement/revocation does not retroactively revoke a frozen attempt.
 * Root's shared START/FINAL source fence remains the transactional authority. */
export const teacherAssessmentRuntimeSource:TeacherAssessmentSourceAccess<Identity>={
 readIdentity:readEducationAssessmentDeliveryIdentity,
 async assertUse(tx,{identity,purpose}){
  if(purpose!=='START')return
  await assertEducationAssessmentDistributionCurrent(tx,identity.origin)
  for(const proof of [...identity.authority].sort((a,b)=>a.actorId.localeCompare(b.actorId)))
   await assertEducationDeliveryIssuerCurrent(tx,{proof,organizationId:identity.origin.organizationId,product:'TEACHER'})
 },
}
