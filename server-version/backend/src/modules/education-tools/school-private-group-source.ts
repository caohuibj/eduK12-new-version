import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {RelationalApplicabilityV1} from '../assessment-relational/types'
import {validateResultDisclosureContract,type ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {SELF_GROUP_POLICY_KEY,assertSelfGroupOwnSummaryCeiling,assertSelfGroupV2Entry,buildSelfGroupCohortAnalysisPolicy} from '../assessment-policy/self-group-contract'
import {privateToolFail} from './private-tool.contracts'
import type {PrivateToolContext} from './private-tool.contracts'
import {schoolPrivateGroupSelectionSchema,type SchoolPrivateGroupSelection,type SchoolPrivateGroupSourceCeiling} from './school-private-group-selection'

export const schoolPrivateGroupDisclosureSchema=z.unknown().transform((value,ctx)=>{
 try{const contract=validateResultDisclosureContract(value)
  if(contract.policyKey!==SELF_GROUP_POLICY_KEY)throw new Error('SELF_GROUP_V2_CONTRACT_REQUIRED')
  return contract
 }catch{ctx.addIssue({code:'custom',message:'群体叶指标披露合同无效'});return z.NEVER}
})

/** Only an author-owned original may create a new private aggregate contract.
 * The caller already verifies current professional authorship, exact ownership
 * and version/hash. A source-use grant or own numeric report is not this right. */
const originalScaleGroupMetadata=z.object({license:z.object({status:z.string(),redistribution:z.string()}),
 scoring:z.object({scores:z.array(z.object({key:z.string(),label:z.string().optional()}))})})
export function schoolPrivateScaleGroupChoice(version:{id:string;entry:string;title:string;contentHash:string},definition:z.infer<typeof originalScaleGroupMetadata>){
 if(version.entry!=='SCHOOL'||definition.license.status!=='self_authored'||definition.license.redistribution!=='allowed')return null
 const metrics=definition.scoring.scores.map(score=>({key:score.key,label:score.label||score.key}))
 if(!metrics.length)return null
 const metricKeys=metrics.map(metric=>metric.key)
 return {versionId:version.id,contentHash:version.contentHash,title:version.title,minimumRespondents:10,metrics,
  audiences:{PROFESSIONAL:[...metricKeys],TEACHER:[...metricKeys],ORGANIZATION:[...metricKeys]}}
}

/** One bounded metadata query for the already authorized page/reference set;
 * no questions, report prose or participant data are selected. */
export async function readSchoolPrivateGroupChoices(tx:Prisma.TransactionClient,c:PrivateToolContext,ids:string[]){
 const choices=new Map<string,NonNullable<ReturnType<typeof schoolPrivateScaleGroupChoice>>>()
 if(c.entry!=='SCHOOL'||!ids.length)return choices
 if(ids.length>50)privateToolFail('SCHOOL_PRIVATE_GROUP_SELECTION_INVALID',409)
 const rows=await tx.$queryRaw<Array<{id:string;entry:string;title:string;contentHash:string;metadata:unknown}>>(Prisma.sql`
  SELECT v.id,v.entry,v.title,v.content_hash AS "contentHash",jsonb_build_object('license',v.definition->'license',
   'scoring',jsonb_build_object('scores',(SELECT jsonb_agg(jsonb_build_object('key',score->>'key','label',score->>'label'))
     FROM jsonb_array_elements(v.definition#>'{scoring,scores}') score))) AS metadata
  FROM education_private_tool_versions v WHERE v.id=ANY(${ids}::text[]) AND v.kind='SCALE'
   AND v.entry='SCHOOL' AND v.organization_id=${c.organizationId} AND v.owner_user_id=${c.principal.userId}`)
 for(const row of rows){const parsed=originalScaleGroupMetadata.safeParse(row.metadata)
  if(parsed.success){const choice=schoolPrivateScaleGroupChoice(row,parsed.data);if(choice)choices.set(row.id,choice)}}
 return choices
}

export function schoolPrivateGroupDisclosure(input:{approved:ResultDisclosureContractV1;
 minimumRespondents:number;audiences:SchoolPrivateGroupSourceCeiling['audiences']}):ResultDisclosureContractV1{
 const approved=validateResultDisclosureContract(input.approved)
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 if(!['SUBJECT','PARENT','RESEARCH'].every(audience=>approved.audiences[audience as 'SUBJECT'|'PARENT'|'RESEARCH'].mode==='NONE'))
  privateToolFail('SCHOOL_PRIVATE_GROUP_SOURCE_UNSUPPORTED',409)
 const aggregate=(keys:string[])=>keys.length?{mode:'AGGREGATE_ONLY' as const,metricKeys:[...keys],longitudinalMetricKeys:[]}:none
 const proposed=validateResultDisclosureContract({schemaVersion:1,policyKey:SELF_GROUP_POLICY_KEY,
  minimumRespondents:input.minimumRespondents,audiences:{...approved.audiences,
   PROFESSIONAL:aggregate(input.audiences.PROFESSIONAL),TEACHER:aggregate(input.audiences.TEACHER),ORGANIZATION:aggregate(input.audiences.ORGANIZATION)}})
 assertSelfGroupOwnSummaryCeiling({approved,proposed})
 return proposed
}

export function schoolPrivateGroupParentAudiences(selection:SchoolPrivateGroupSelection){
 const union=(audience:'PROFESSIONAL'|'TEACHER'|'ORGANIZATION')=>[...new Set(selection.leaves.flatMap(leaf=>leaf.audiences[audience]))].sort()
 return {PROFESSIONAL:union('PROFESSIONAL'),TEACHER:union('TEACHER'),ORGANIZATION:union('ORGANIZATION')}
}

export function schoolPrivateGroupOwnContract(respondent:ResultDisclosureContractV1['audiences']['RESPONDENT']):ResultDisclosureContractV1{
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 return {schemaVersion:1,policyKey:'EDUCATION_PRIVATE_COMPOSITION_V1',minimumRespondents:null,audiences:{RESPONDENT:respondent,
  SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
}

/** Validate the frozen projection against the real immutable questionnaire's
 * explicit selection, not a mode string supplied by an execution caller.
 * The DB seal still proves original content/children/manifest/owner identity. */
export function assertSchoolCompositionGroupIdentity(policy:RunResourcePolicy,raw:unknown){
 const binding=policy.educationComposition,contract=policy.resultDisclosure
 if(!binding||binding.origin.entry!=='SCHOOL'||binding.origin.variantKey!=='STUDENT:SELF'||!contract)
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 const selected=schoolPrivateGroupSelectionSchema.parse(raw)
 const cohort=buildSelfGroupCohortAnalysisPolicy(contract)
 assertSelfGroupV2Entry({applicability:{schemaVersion:1,resourceKind:policy.family,resourceKey:policy.key,resourceVersion:policy.version,
  analysisMode:policy.analysisMode,subjectRoles:[...policy.subjectRoles],respondentRoles:[...policy.respondentRoles],relationshipKinds:[...policy.relationshipKinds],
  perspectives:[...policy.perspectives],minimumRespondents:policy.minimumRespondents,visibilityPolicyKey:policy.visibilityPolicyKey} as RelationalApplicabilityV1,
  resultDisclosure:contract,cohortAnalysisPolicy:cohort})
 if(selected.minimumRespondents!==contract.minimumRespondents)privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 for(const leaf of selected.leaves){const unit=binding.unitReports.find(unit=>unit.blockId===leaf.blockId)
  if(!unit||unit.versionId!==leaf.versionId||unit.contentHash!==leaf.contentHash)privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')}
 for(const unit of binding.unitReports){const leaf=selected.leaves.find(leaf=>leaf.blockId===unit.blockId)
  const expected=leaf?schoolPrivateGroupDisclosure({approved:schoolPrivateGroupOwnContract(unit.respondent),
   minimumRespondents:selected.minimumRespondents,audiences:leaf.audiences}):undefined
  if(canonicalHash(expected??null)!==canonicalHash(unit.groupDisclosure??null))privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 }
 const own=schoolPrivateGroupOwnContract({mode:binding.unitReports.some(unit=>unit.respondent.mode==='INDIVIDUAL_SUMMARY')?'INDIVIDUAL_SUMMARY':'COMPLETION_ONLY',
  metricKeys:[],longitudinalMetricKeys:[]})
 const expected=schoolPrivateGroupDisclosure({approved:own,minimumRespondents:selected.minimumRespondents,audiences:schoolPrivateGroupParentAudiences(selected)})
 if(canonicalHash(expected)!==canonicalHash(contract))privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
}
