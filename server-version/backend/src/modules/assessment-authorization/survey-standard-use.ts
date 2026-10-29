import {Prisma} from '@prisma/client'
import {z} from 'zod'
import type {CatalogSourceSnapshot} from '../survey/catalog.sources'
import {SurveyGovernanceError} from '../survey/governance.service'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readSelectedConfigurationBinding,type SelectedConfigurationBinding} from './selected-configuration'

export const surveyStandardUseInput=z.object({requestId:z.string().guid(),configurationName:z.string().trim().min(1).max(120)}).strict()
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
 const {selectedBinding:_,configurationName:__,configurationRequestIntentHash:___,...provenance}=row.snapshot.provenance
 return {...row.snapshot,provenance}
}
/** Only new typed sourced drafts pay this bounded authority read. No latest,
 * source compilation, current R lookup or history/report permission coupling. */
export async function assertSurveyStandardUseAuthority(tx:Prisma.TransactionClient,rows:readonly SurveyUseRow[]){
 const wanted=rows.flatMap(row=>{const selected=readSurveyStandardUse(row);if(!selected)return []
  const a=selected.binding.authorization.authority[0];return [{useId:row.id,issuerId:row.createdBy,entryId:a.id,entryRevision:a.revision}]})
 if(!wanted.length)return
 if(wanted.length>128)fail('一次研究固定配置超过当前批量上限')
 try{await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=ANY(${[...new Set(wanted.map(w=>w.issuerId))]}::text[]) ORDER BY id FOR SHARE NOWAIT`)}
 catch(error){const e=error as {code?:string;meta?:{code?:string}};if(e.code==='55P03'||e.meta?.code==='55P03')return fail('原研究管理员状态正在变化，请稍后重试');throw error}
 const values=wanted.map(w=>Prisma.sql`(${w.useId},${w.issuerId},${w.entryId},${w.entryRevision}::int)`)
 const valid=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT w.use_id AS id
  FROM (VALUES ${Prisma.join(values)}) w(use_id,issuer_id,entry_id,entry_revision)
  JOIN users u ON u.id=w.issuer_id AND u.platform_role='STANDARD' AND u.account_domain IN ('TRAINING','LEGACY')
   AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
  JOIN admin_entry_grants e ON e.id=w.entry_id AND e.user_id=w.issuer_id AND e.entry='SURVEY' AND e.version=w.entry_revision AND e.revoked_at IS NULL
  ORDER BY e.id,w.use_id FOR SHARE OF u,e`)
 if(valid.length!==wanted.length)fail('原研究入口管理资格已变化，请管理员重新配置；原已发布数据保留')
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
