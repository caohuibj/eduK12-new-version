import {educationApplicabilitySchema} from '../scale-library-governance/education-applicability'
import {instrumentApplicabilityV1Schema} from '../scale/policy/schema'

/** STUDENT is an actor role, not a native Scale policy respondent type. A new
 * approved source must explicitly support students observing a teacher, with
 * its original native content and legal OBSERVER policy both in agreement.
 * A generic OBSERVER declaration alone never implies this administration.
 */
export function supportsStudentStandardSource(input:{nativeRespondentType:unknown;educationApplicability:unknown;applicability:unknown}){
 const declaration=educationApplicabilitySchema.safeParse(input.educationApplicability)
 const policy=instrumentApplicabilityV1Schema.safeParse(input.applicability)
 return ['student_report','observer_report'].includes(String(input.nativeRespondentType))
  &&declaration.success&&declaration.data.administrations.some(a=>a.population==='TEACHER'&&a.responseMode==='STUDENT_REPORT')
  &&policy.success&&policy.data.respondentTypes.includes('OBSERVER')
}
