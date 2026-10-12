import type {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {RunResourceRef,RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {resolvePublishedTeacherForm,teacherFormResourceRef,
  TEACHER_FORM_RUNTIME_KIND} from './formRunResource'

// The student->teacher resource is NOT a teacher SELF Form. The underlying
// published Form V2 and its encrypted canonical runtime remain the same.
export const STUDENT_FORM_PREFIX='huiteacher-student-form:' as const
export const STUDENT_FORM_PRIVACY_FLOOR=10 as const
export const studentFormResourceRef=(id:string,digest:string):RunResourceRef=>({
  family:'FORM',key:STUDENT_FORM_PREFIX+id,version:digest,
})
export const studentFormResourceId=(ref:RunResourceRef):string|null=>{
  if(ref.family!=='FORM'||!ref.key.startsWith(STUDENT_FORM_PREFIX))return null
  const id=ref.key.slice(STUDENT_FORM_PREFIX.length)
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)?id:null
}
const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
const complete={mode:'COMPLETION_ONLY' as const,metricKeys:[],longitudinalMetricKeys:[]}
const aggregate={mode:'CLASS_AGGREGATE' as const,metricKeys:[],longitudinalMetricKeys:[]}
const schoolAggregate={mode:'ORGANIZATION_AGGREGATE' as const,metricKeys:[],longitudinalMetricKeys:[]}
const disclosure:ResultDisclosureContractV1={
  schemaVersion:1,policyKey:'HUITEACHER_STUDENT_FEEDBACK_PROTECTED_V1',
  minimumRespondents:STUDENT_FORM_PRIVACY_FLOOR,
  audiences:{RESPONDENT:complete,SUBJECT:aggregate,TEACHER:none,PARENT:none,
    PROFESSIONAL:none,ORGANIZATION:schoolAggregate,RESEARCH:none},
}
export class StudentFormResourceError extends Error{
  constructor(public readonly code:string,public readonly statusCode=403){
    super(code);this.name='StudentFormResourceError'
  }
}
const deny=(code:string):never=>{throw new StudentFormResourceError(code)}

export async function resolveStudentFormResourcePolicy(ref:RunResourceRef)
  :Promise<RunResourcePolicy>{
  const formId=studentFormResourceId(ref)
  if(!formId)deny('STUDENT_FORM_IDENTITY_INVALID')
  const form=await resolvePublishedTeacherForm(teacherFormResourceRef(formId!,ref.version))
  return {
    family:'FORM',key:ref.key,version:ref.version,
    scientificMaturity:'PILOT',
    applicabilityHash:canonicalHash({product:'HUITEACHER',kind:'STUDENT_FEEDBACK_FORM_V2',
      organizationId:form.organizationId,formId:form.id,
      definitionDigest:form.definitionDigest,revision:form.revision}),
    subjectRoles:['TEACHER'],respondentRoles:['STUDENT'],
    relationshipKinds:['CLASS_TEACHER_STUDENT'],perspectives:['OBSERVER_REPORT'],
    analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:'HUITEACHER_STUDENT_FEEDBACK_PROTECTED_V1',
    minimumRespondents:STUDENT_FORM_PRIVACY_FLOOR,
    resultDisclosure:disclosure,initiationModes:['ORG_ASSIGN'],
    allowedTargetModes:['SELECTED_CLASS_TEACHERS'],
    runtimeLaunchTarget:{kind:TEACHER_FORM_RUNTIME_KIND,ref:form.id},
  }
}

/** The only acceptable provenance for this product-specific Form track:
 * one configured draft/OPEN Teacher event, exact staff appointment,
 * exact verified PERSON target and immutable released Form V2 digest.
 * Generic School or Survey Run identifiers never satisfy this join.
 */
export async function assertStudentFormRunUse(db:Prisma.TransactionClient,input:{
  organizationId:string;runId:string;ref:RunResourceRef
}):Promise<void>{
  const formId=studentFormResourceId(input.ref)
  if(!formId)deny('STUDENT_FORM_IDENTITY_INVALID')
  const form=await resolvePublishedTeacherForm(teacherFormResourceRef(formId!,input.ref.version),db)
  if(form.organizationId!==input.organizationId)deny('STUDENT_FORM_ORGANIZATION_INVALID')
  const authorized=await db.$queryRaw<Array<{id:string}>>`
    SELECT cfg."id" FROM "huiteacher_student_eval_configs" cfg
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=cfg."organization_id"
      AND link."event_id"=cfg."event_id"
    JOIN "huiteacher_evaluation_events" event
      ON event."id"=cfg."event_id" AND event."organization_id"=cfg."organization_id"
      AND event."kind"='ASSESSMENT' AND event."status" IN ('DRAFT','OPEN')
    JOIN "huiteacher_evaluation_targets" target
      ON target."id"=event."target_id" AND target."organization_id"=event."organization_id"
      AND target."kind"='PERSON' AND target."status"='ACTIVE'
    JOIN "organization_staff_class_assignments" staff
      ON staff."id"=cfg."staff_assignment_id"
      AND staff."organization_id"=cfg."organization_id"
      AND staff."class_unit_id"=cfg."class_unit_id"
      AND staff."staff_role" IN ('TEACHING','HOMEROOM')
      AND staff."valid_from"<=statement_timestamp()
      AND (staff."valid_until" IS NULL OR staff."valid_until">statement_timestamp())
    JOIN "organization_memberships" member
      ON member."id"=staff."membership_id" AND member."organization_id"=staff."organization_id"
      AND member."user_id"=target."subject_user_id"
      AND member."valid_from"<=statement_timestamp()
      AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
    JOIN "organization_persona_grants" persona
      ON persona."organization_id"=member."organization_id"
      AND persona."membership_id"=member."id"
      AND persona."persona"='TEACHER' AND persona."revoked_at" IS NULL
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=cfg."organization_id"
      AND entitlement."product"='HUITEACHER' AND entitlement."status"='ACTIVE'
    JOIN "organizations" org ON org."id"=cfg."organization_id"
      AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
    WHERE cfg."organization_id"=${input.organizationId}
      AND link."run_id"=${input.runId}
      AND cfg."form_id"=${formId}
      AND cfg."definition_digest"=${input.ref.version}
    FOR SHARE OF cfg,event,staff,entitlement
  `
  if(authorized.length!==1)deny('STUDENT_FORM_UNAUTHORIZED_RUN')
}
