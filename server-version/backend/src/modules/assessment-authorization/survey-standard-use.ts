import {isSurveyCognitiveProfileRef,parseSurveyCognitiveProfileRef} from '../survey/cognitive-profile.source'
import {Prisma} from '@prisma/client'
import {SURVEY_WAVE_HANDOFF_ACTION} from '../admin-permissions/offboarding'
import {currentEntryEvidenceJoin} from '../admin-permissions/current-entry-evidence'
import {z} from 'zod'
import type {CatalogSourceSnapshot} from '../survey/catalog.sources'
import {SurveyGovernanceError} from '../survey/governance.service'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readSelectedConfigurationBinding,type SelectedConfigurationBinding} from './selected-configuration'
import {selectedConfigurationPointerSchema} from './standard-configuration-binding'

export const surveyStandardReplacementSchema=z.object({grantId:z.string().guid(),expectedVersion:z.literal(1),reason:z.string().trim().min(1).max(500)}).strict()
export const surveyStandardUseInput=z.object({requestId:z.string().guid(),configurationName:z.string().trim().min(1).max(120),replaces:surveyStandardReplacementSchema.optional()}).strict()
const supersedesSchema=z.object({selectedBinding:selectedConfigurationPointerSchema,reason:surveyStandardReplacementSchema.shape.reason}).strict()
export function readSurveyStandardSupersedes(raw:unknown){return raw==null?null:supersedesSchema.parse(raw)}
const fail=(message:string):never=>{throw new SurveyGovernanceError(409,message)}
export type SurveyUseRow={id:string;createdBy:string;userId:string;snapshot:Pick<CatalogSourceSnapshot,'ref'|'provenance'>}
/** Historical projection only; caller retains its ordinary data ACL. Null old
 * evidence remains legacy. Provided malformed evidence never becomes legacy. */
export function readSurveyStandardUse(row:SurveyUseRow):SelectedConfigurationBinding|null{
 const raw=row.snapshot.provenance.selectedBinding
 if(raw===undefined||raw===null)return null
 let selected:SelectedConfigurationBinding|null
 try{selected=readSelectedConfigurationBinding(raw,{product:'SURVEY',recipientId:row.userId,organizationId:null,authorizationId:row.id,authorizationRevision:1})}
 catch{return fail('研究固定配置证据不完整')}
 if(!selected)return fail('研究固定配置证据不完整')
 const {configuration:c,authorization:a}=selected.binding,p=row.snapshot.provenance
 const supersedes=readSurveyStandardSupersedes(p.configurationSupersedes)
 if(supersedes&&(supersedes.selectedBinding.authorizationId===row.id||supersedes.selectedBinding.authorizationRevision!==1))return fail('研究前一授权修订身份不完整')
 if(isSurveyCognitiveProfileRef(row.snapshot.ref)){
  const ref=parseSurveyCognitiveProfileRef(row.snapshot.ref),profile=p.cognitiveProfile as {artifactHash?:string;configuration?:unknown}|undefined
  if(a.kind!=='COGNITIVE_PROFILE_USE'||a.issuerId!==row.createdBy||a.authority.length!==1||a.authority[0].kind!=='ENTRY_ADMIN'
   ||c.kind!=='COGNITIVE_PROFILE'||c.configId!==ref.configId||c.profile!==ref.profile||profile?.artifactHash!==ref.artifactHash
   ||!profile?.configuration||canonicalHash(profile.configuration)!==canonicalHash(c)||canonicalHash(p.sourceMeasurementRelease)!==canonicalHash(c.measurement)
   ||typeof p.configurationName!=='string'||!p.configurationName.trim()||p.configurationName.length>120)fail('研究精确 profile 与原授权来源不一致')
  return selected
 }
 if(a.kind!=='SURVEY_TOOL_USE'||a.issuerId!==row.createdBy||a.authority.length!==1||a.authority[0].kind!=='ENTRY_ADMIN'
  ||c.kind!=='STANDARD_COMBINATION'||row.snapshot.ref.kind!=='SCALE'||row.snapshot.ref.sourceId!=='survey-standard:'+c.combinationId
  ||row.snapshot.ref.sourceVersion!==c.combinationHash||p.surveyStandardReleaseId!==c.combinationId||p.code!==c.toolKey
  ||p.standardInstrumentVersion!==c.instrumentVersion||canonicalHash(p.triplet)!==canonicalHash(Object.fromEntries(Object.entries(c.axes).map(([key,value])=>[key,value.hash])))
  ||canonicalHash(p.sourceMeasurementRelease)!==canonicalHash(c.measurement)
  ||typeof p.configurationName!=='string'||!p.configurationName.trim()||p.configurationName.length>120)
   return fail('研究固定配置与原授权来源不一致')
 return selected
}
/** Grant metadata is outside the source adapter identity. Validate the exact
 * use first, then compare the COMPLETE original source without those three
 * grant-owned fields; all source/score/presentation/provenance checks remain. */
export function surveyStandardSourceForRecheck<T extends SurveyUseRow&{snapshot:CatalogSourceSnapshot}>(row:T){
 if(!readSurveyStandardUse(row))return row.snapshot
 const {selectedBinding:_,configurationName:__,configurationRequestIntentHash:___,configurationSupersedes:____,...provenance}=row.snapshot.provenance
 return {...row.snapshot,provenance}
}
/** Only new typed sourced drafts pay this bounded authority read. No latest,
 * source compilation, current R lookup or history/report permission coupling. */
export async function assertSurveyStandardUseAuthority(tx:Prisma.TransactionClient,rows:readonly SurveyUseRow[],
 collection?:{waveId:string;publicationId:string}){
 const wanted=rows.flatMap(row=>{const selected=readSurveyStandardUse(row);if(!selected)return []
  const a=selected.binding.authorization.authority[0];return [{useId:row.id,issuerId:row.createdBy,entryId:a.id,entryRevision:a.revision}]})
 if(!wanted.length)return
 if(wanted.length>128)fail('一次研究固定配置超过当前批量上限')
 try{await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=ANY(${[...new Set(wanted.map(w=>w.issuerId))]}::text[]) ORDER BY id FOR SHARE NOWAIT`)}
 catch(error){const e=error as {code?:string;meta?:{code?:string}};if(e.code==='55P03'||e.meta?.code==='55P03')return fail('原研究管理员状态正在变化，请稍后重试');throw error}
 const values=wanted.map(w=>Prisma.sql`(${w.useId},${w.issuerId},${w.entryId},${w.entryRevision}::int)`)
 const valid=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT w.use_id AS id
  FROM (VALUES ${Prisma.join(values)}) w(use_id,issuer_id,entry_id,entry_revision)
  ${currentEntryEvidenceJoin({issuerId:Prisma.sql`w.issuer_id`,entryId:Prisma.sql`w.entry_id`,entryRevision:Prisma.sql`w.entry_revision`,entry:'SURVEY'})}
  WHERE (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
  ORDER BY e.id,w.use_id FOR SHARE OF u,e`)
 if(valid.length===wanted.length)return
 if(collection){
  const validated=new Set(valid.map(row=>row.id))
  const missing=wanted.filter(row=>!validated.has(row.useId))
  const previous=missing.map(row=>Prisma.sql`(${row.useId},${row.issuerId})`)
  try{
   const covered=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    WITH recorded AS MATERIALIZED (
     SELECT a.target_user_id,CASE WHEN a.action=${SURVEY_WAVE_HANDOFF_ACTION} THEN a.reason::jsonb END AS link
     FROM admin_authorization_audits a
     WHERE a.action=${SURVEY_WAVE_HANDOFF_ACTION} AND a.entry='SURVEY'
       AND a.target_user_id=ANY(${missing.map(row=>row.issuerId)}::text[])
       AND starts_with(a.id,${'survey-handoff:'+collection.waveId+':'})
    )
    SELECT w.use_id AS id FROM (VALUES ${Prisma.join(previous)}) w(use_id,issuer_id)
    JOIN recorded h ON h.target_user_id=w.issuer_id AND h.link->>'useId'=w.use_id AND h.link->>'publicationId'=${collection.publicationId}
    JOIN survey_tool_grants original ON original.id=w.use_id AND original.status='ACTIVE'
    JOIN survey_tool_grants candidate ON candidate.id=h.link->>'replacementId'
      AND candidate.status='ACTIVE' AND candidate.user_id=original.user_id AND candidate.created_by=h.link->>'successorId'
      AND candidate.snapshot->'ref'=original.snapshot->'ref'
      AND candidate.snapshot#>'{provenance,selectedBinding,binding,configuration}'=original.snapshot#>'{provenance,selectedBinding,binding,configuration}'
    JOIN users issuer ON issuer.id=candidate.created_by AND issuer.platform_role='STANDARD' AND issuer.account_domain IN ('TRAINING','LEGACY')
      AND issuer.is_active AND NOT issuer.is_frozen AND NOT issuer.must_change_password
      AND (issuer.expires_at IS NULL OR issuer.expires_at>clock_timestamp())
    JOIN admin_entry_grants e ON e.id=h.link->>'successorEntryId' AND e.version::text=h.link->>'successorVersion'
      AND e.user_id=issuer.id AND e.entry='SURVEY' AND e.revoked_at IS NULL
      AND candidate.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,id}'=e.id
      AND candidate.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,revision}'=e.version::text
    ORDER BY e.id,candidate.id FOR SHARE OF issuer,e,candidate NOWAIT`)
   if(new Set(covered.map(row=>row.id)).size===missing.length)return
  }catch(error){const e=error as {code?:string;meta?:{code?:string}};if(e.code==='55P03'||e.meta?.code==='55P03')return fail('接任研究管理员状态正在变化，请稍后重试');throw error}
 }
 fail('原研究入口管理资格已变化，请管理员重新配置；原已发布数据保留')
}

/** New admission only. Verify the original frozen binding against its exact
 * immutable grant; existing attempts and reports never call this function. */
export async function readFrozenSurveyStandardUses(tx:Prisma.TransactionClient,projectId:string,units:readonly {sourceProvenance?:Record<string,unknown>}[]){
 const typed=units.flatMap(unit=>{const p=unit.sourceProvenance
  if(p?.selectedBinding===undefined||p.selectedBinding===null)return []
  if(typeof p.sourceGrantId!=='string'||!p.source)fail('研究冻结配置缺少原使用授权')
  return [{id:p.sourceGrantId as string,snapshot:{ref:p.source as CatalogSourceSnapshot['ref'],provenance:p}}]})
 const ids=[...new Set(typed.map(row=>row.id))]
 if(!ids.length)return {ids:new Set<string>(),rows:[] as SurveyUseRow[]}
 if(ids.length>128)fail('一次研究固定配置超过当前批量上限')
 const rows=await tx.$queryRaw<Array<{id:string;createdBy:string;userId:string;selected:unknown;ref:unknown}>>(Prisma.sql`
  SELECT g.id,g.created_by AS "createdBy",g.user_id AS "userId",g.snapshot#>'{provenance,selectedBinding}' AS selected,g.snapshot->'ref' AS ref
  FROM survey_tool_grants g JOIN survey_projects p ON p.id=${projectId} AND p.owner_user_id=g.user_id
  WHERE g.id=ANY(${ids}::text[]) AND g.status='ACTIVE' ORDER BY g.id FOR SHARE OF g,p`)
 if(rows.length!==ids.length)fail('原研究固定配置授权已撤销或不属于当前项目')
 const evidence=typed.map(value=>{const row=rows.find(r=>r.id===value.id)!
  if(canonicalHash(row.selected)!==canonicalHash(value.snapshot.provenance.selectedBinding)||canonicalHash(row.ref)!==canonicalHash(value.snapshot.ref))fail('研究冻结配置与原使用授权不一致')
  return {id:row.id,createdBy:row.createdBy,userId:row.userId,snapshot:value.snapshot}})
 return {ids:new Set(ids),rows:[...new Map(evidence.map(row=>[row.id,row])).values()]}
}
