import {educationNativeBundleSchema} from '../bundle-product/education-identity'
import {educationPackageUseSchema} from './package-reference.contracts'
import {trainingFeedbackPolicySchema} from '../assessment-policy/training-feedback-policy'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {createRelationalProductRegistry,type RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {assertSelfGroupV2Entry,buildSelfGroupCohortAnalysisPolicy,SELF_GROUP_POLICY_VERSION} from '../assessment-policy/self-group-contract'

const id=z.string().guid(),digest=z.string().regex(/^[a-f0-9]{64}$/)
// Captured from server-side authority reads at each lifecycle transition.
// An actor acquiring a different later role/grant cannot repair a revoked proof.
export const educationDeliveryAuthoritySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('SYSTEM_ADMIN'),actorId:id}).strict(),
 z.object({kind:z.literal('PRODUCT_ADMIN'),actorId:id,membershipId:id,grantId:id}).strict(),
 z.object({kind:z.literal('PSYCHOLOGY_STAFF'),actorId:id,membershipId:id,personaGrantId:id,capabilityGrantId:id}).strict(),
])
export type EducationDeliveryAuthority=z.infer<typeof educationDeliveryAuthoritySchema>
export const educationDistributionSchema=z.object({actorId:id,grants:z.array(z.object({
 resourceId:id,grantId:id,version:z.number().int().positive(),
}).strict()).min(1).max(1000)}).strict().superRefine((value,ctx)=>{
 if(new Set(value.grants.map(grant=>grant.resourceId)).size!==value.grants.length)
  ctx.addIssue({code:'custom',message:'Each distributed source requires one exact original grant'})
})
const pointer=z.object({releaseId:id,contentHash:digest}).strict()
const unit=z.object({
  itemId:id,family:z.enum(['SCALE','COGNITIVE','SJT']),
  measurement:pointer.extend({measurementHash:digest}).strict(),
  // Explicit empty means no approved reference/report selection; never "latest".
  references:z.array(pointer).max(100),report:pointer.nullable(),
  groupDisclosure:z.unknown().optional(),
}).strict()
/** A server-frozen delivery identity, not an HTTP approval or a use grant.
 * Content/parameter/report releases remain independent existing C/P/R objects.
 */
export const educationAssessmentOriginSchema=z.object({
  schemaVersion:z.literal(1),adapterVersion:z.enum(['1.0.0','2.0.0']),resourceId:id,
  product:z.enum(['SCHOOL','TEACHER']),organizationId:id,
  family:z.enum(['COGNITIVE','SITUATIONAL','BUNDLE']),
  sourceCompositeId:id,runtimeCompositeId:id,sourceSnapshotHash:digest,runtimeSnapshotHash:digest,runtimeDefinitionHash:digest,
  distribution:educationDistributionSchema,
  nativeBundle:educationNativeBundleSchema.optional(),
  publicPackage:educationPackageUseSchema.optional(),
  // Absent historical policy remains absent: do not change frozen origin hashes.
  feedbackPolicy:trainingFeedbackPolicySchema.optional(),
  units:z.array(unit).max(1000),
}).strict().superRefine((origin,ctx)=>{
  const add=(message:string)=>ctx.addIssue({code:'custom',message})
  if(origin.sourceCompositeId===origin.runtimeCompositeId)add('Education delivery requires its own runtime identity')
  if(new Set(origin.units.map(value=>value.itemId)).size!==origin.units.length)add('Duplicate runtime unit')
  if(origin.family!=='BUNDLE'&&(origin.units.length!==1||origin.units[0].family!==(origin.family==='SITUATIONAL'?'SJT':'COGNITIVE')))
    add('Single-family delivery must bind exactly its own measurement')
  const identities=new Map<string,{hash:string;layer:string}>()
  for(const value of origin.units){
    if(new Set(value.references.map(ref=>ref.releaseId)).size!==value.references.length)add('Duplicate reference release')
    for(const [layer,ref] of [['MEASUREMENT',value.measurement],...value.references.map(ref=>['REFERENCE',ref] as const),...(value.report?[['REPORT',value.report] as const]:[])] as const){
      const previous=identities.get(ref.releaseId)
      if(previous&&(previous.hash!==ref.contentHash||previous.layer!==layer))add('One release cannot have conflicting hashes or layers')
      identities.set(ref.releaseId,{hash:ref.contentHash,layer})
    }
  }
  if(identities.size>1000)add('Release lookup bound exceeded')
})
export type EducationAssessmentOrigin=z.infer<typeof educationAssessmentOriginSchema>
export const educationAssessmentResourceKey=(origin:EducationAssessmentOrigin)=>
  `education-assessment:${origin.product}:${origin.organizationId}:${origin.resourceId}`

/** Only assembles a DRAFT. The publishing service must independently read every
 * release, verify its source/license/audience/scope and current editor/reviewer
 * authority, then persist an immutable reviewed version. This function cannot
 * make a released tool or let a client manufacture a publication proof.
 */
export function draftEducationAssessmentEntry(input:{origin:unknown;title:string;disclosure:unknown}):
  RelationalProductEntryV1&{educationOrigin:EducationAssessmentOrigin;educationOriginHash:string}{
  const origin=educationAssessmentOriginSchema.parse(input.origin)
  const title=z.string().trim().min(1).max(200).parse(input.title)
  const disclosure=validateResultDisclosureContract(input.disclosure)
  const group=origin.adapterVersion===SELF_GROUP_POLICY_VERSION
  if(origin.units.length===0&&!['NONE','COMPLETION_ONLY'].includes(disclosure.audiences.RESPONDENT.mode))throw new Error('Form-only delivery cannot invent measurement feedback')
  if(!group&&disclosure.minimumRespondents!==null)throw new Error('Personal delivery cannot imply group report authority')
  // New fixed source versions may explicitly allow a subset of existing own
  // numeric metrics. The shared contract validator enforces that subset and
  // rejects metrics in NONE/completion-only; historical entries stay unchanged.
  const role=origin.product==='TEACHER'?'TEACHER':'STUDENT'
  // Other audiences require their own separately reviewed workflows, not
  // a side effect of assigning a personal cognitive/SJT/composite task.
  if(!group&&Object.entries(disclosure.audiences).some(([audience,rule])=>
    audience!=='RESPONDENT'&&rule.mode!=='NONE'
    ||audience==='RESPONDENT'&&!['NONE','COMPLETION_ONLY','INDIVIDUAL_SUMMARY'].includes(rule.mode)))
    throw new Error('Personal delivery disclosure cannot widen other audiences')
  const entry:RelationalProductEntryV1={title,description:null,releaseStatus:'DRAFT',scienceMaturity:'PILOT',
    applicability:{schemaVersion:1,resourceKind:origin.family,resourceKey:educationAssessmentResourceKey(origin),
      resourceVersion:origin.adapterVersion,subjectRoles:[role],respondentRoles:[role],relationshipKinds:['SELF'],
      perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:disclosure.policyKey,minimumRespondents:null},
    initiationModes:['ORG_ASSIGN','CLASS_ASSIGN'],subjectReportMode:'NONE',resultDisclosure:disclosure,
    cohortAnalysisPolicy:group?buildSelfGroupCohortAnalysisPolicy(disclosure):null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:origin.runtimeCompositeId}}
  if(group){
    entry.applicability={...entry.applicability,analysisMode:'COHORT_AGGREGATE',minimumRespondents:disclosure.minimumRespondents}
    assertSelfGroupV2Entry(entry)
    if(!origin.units.length||disclosure.audiences.SUBJECT.mode!=='NONE')throw new Error('Native group requires real leaves and the original respondent-only ceiling')
    for(const value of origin.units){
      const leaf=validateResultDisclosureContract(value.groupDisclosure)
      assertSelfGroupV2Entry({...entry,applicability:{...entry.applicability,minimumRespondents:leaf.minimumRespondents},
        resultDisclosure:leaf,cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(leaf)})
      if(leaf.audiences.SUBJECT.mode!=='NONE')throw new Error('Native leaf cannot add subject result rights')
      for(const [audience,rule] of Object.entries(leaf.audiences)){
        const parent=disclosure.audiences[audience as keyof typeof disclosure.audiences]
        if(rule.metricKeys.some(key=>!parent.metricKeys.includes(key))
          ||rule.longitudinalMetricKeys.some(key=>!parent.longitudinalMetricKeys.includes(key))
          ||rule.mode==='INDIVIDUAL_SUMMARY'&&parent.mode!=='INDIVIDUAL_SUMMARY'
          ||rule.mode.includes('AGGREGATE')&&!parent.mode.includes('AGGREGATE'))throw new Error('Leaf metrics require the explicit parent ceiling')
      }
    }
  }else if(origin.units.some(value=>value.groupDisclosure!==undefined))throw new Error('Legacy personal origin cannot carry GROUP contracts')
  createRelationalProductRegistry([entry])
  return {...entry,educationOrigin:origin,educationOriginHash:canonicalHash(origin)}
}
