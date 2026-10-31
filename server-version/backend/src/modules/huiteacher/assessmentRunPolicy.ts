import type { RunResourcePolicy, RunTrackNarrowingRequest } from '../assessment-run/resourceAuthority'
import { assertRunTrackNarrowing } from '../assessment-run/resourceAuthority'
import {SELF_GROUP_POLICY_KEY,SELF_GROUP_POLICY_VERSION} from '../assessment-policy/self-group-contract'

export class TeacherAssessmentPolicyError extends Error {
  readonly statusCode = 403
  constructor(readonly code: string) { super(code); this.name = 'TeacherAssessmentPolicyError' }
}
const deny = (): never => { throw new TeacherAssessmentPolicyError('HUITEACHER_SELF_ASSESSMENT_POLICY_REQUIRED') }

/** Validate the new personal-task families after exact released-source resolution.
 * This is not a source/material grant, a publication decision or a report permit.
 * Legacy Form/group and Scale approval contracts keep their separate adapters.
 */
export function assertTeacherPersonalAssessmentPolicy(policy: RunResourcePolicy, requested: RunTrackNarrowingRequest): void {
  if (!['COGNITIVE', 'SITUATIONAL', 'BUNDLE'].includes(policy.family)) deny()
  if (policy.runtimeLaunchTarget?.kind !== 'COMPOSITE' || !policy.runtimeLaunchTarget.ref.trim()) deny()
  const group=policy.key.startsWith('education-assessment:TEACHER:')&&policy.version===SELF_GROUP_POLICY_VERSION
    &&policy.analysisMode==='COHORT_AGGREGATE'&&policy.resultDisclosure?.policyKey===SELF_GROUP_POLICY_KEY
  if (requested.subjectRoles.length !== 1 || requested.subjectRoles[0] !== 'TEACHER'
    || requested.respondentRoles.length !== 1 || requested.respondentRoles[0] !== 'TEACHER'
    || requested.relationshipKinds.length !== 1 || requested.relationshipKinds[0] !== 'SELF'
    || requested.perspectives.length !== 1 || requested.perspectives[0] !== 'SELF_REPORT'
    || (group?requested.analysisMode!=='COHORT_AGGREGATE'||!Number.isInteger(requested.minimumRespondents)||(requested.minimumRespondents??0)<3
      :requested.analysisMode !== 'INDIVIDUAL_ONLY' || requested.minimumRespondents !== null)
    || requested.targetPolicy && requested.targetPolicy.mode !== 'SELF') deny()
  // Even an authorized delivery administrator cannot widen the content ceiling.
  assertRunTrackNarrowing(policy, requested)
}
