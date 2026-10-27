import {createElement,type ReactNode} from 'react'
import {EducationAssessmentFeedback,type EducationAssessmentCompletion} from './EducationAssessmentFeedback'
import type {EducationReportApi} from './EducationScalePersonalReport'
export type EducationAssessmentFeedbackRenderer=(completion:EducationAssessmentCompletion)=>ReactNode
/** Shared application transport adapter. Attempt IDs are display lifecycle keys,
 * never report authority; the server re-authorizes the exact execution. */
export function createEducationAssessmentFeedback({api,entry}:{api:EducationReportApi;entry:'SCHOOL'|'TEACHER'}):EducationAssessmentFeedbackRenderer{
 return completion=>createElement(EducationAssessmentFeedback,{key:completion.executionId+':'+(completion.attemptId??'completed'),api,entry,...completion})
}
