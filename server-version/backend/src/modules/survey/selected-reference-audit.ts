import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {readSurveyStandardUse} from '../assessment-authorization/survey-standard-use'
import {selectedConfigurationPointer} from '../assessment-authorization/standard-configuration-binding'
import {selectedReferenceChanges,type SelectedReferenceAudit} from '../assessment-authorization/selected-reference-audit'
import {SurveyGovernanceError} from './governance.service'
const fail=(message:string):never=>{throw new SurveyGovernanceError(409,message)}

/** Historical identity headers only. Removal of an old revoked source must
 * remain possible; current import/publication/admission policies stay separate.
 * The caller already owns and locks this project in the same transaction. */
export async function surveyWaveReferenceChanges(tx:Prisma.TransactionClient,ownerId:string,projectId:string,previous:readonly string[],next:readonly string[]){
 const ids=z.array(z.string().guid()).max(30),before=ids.parse(previous),after=ids.parse(next)
 if(new Set(before).size!==before.length||new Set(after).size!==after.length)return fail('原研究波次工具引用重复，请先核对草稿')
 if(before.length===after.length&&before.every(id=>after.includes(id)))return null
 const all=[...new Set([...before,...after])]
 const rows=await tx.$queryRaw<Array<{draftId:string;catalogGrantId:string|null;id:string|null;createdBy:string;userId:string;snapshot:Parameters<typeof readSurveyStandardUse>[0]['snapshot'];snapshotDigest:string}>>(Prisma.sql`
  SELECT d.id AS "draftId",d.catalog_grant_id AS "catalogGrantId",g.id,g.created_by AS "createdBy",g.user_id AS "userId",
   jsonb_build_object('ref',g.snapshot->'ref','provenance',jsonb_build_object(
    'cognitiveProfile',g.snapshot#>'{provenance,cognitiveProfile}','selectedBinding',g.snapshot#>'{provenance,selectedBinding}','configurationName',g.snapshot#>'{provenance,configurationName}',
    'configurationSupersedes',g.snapshot#>'{provenance,configurationSupersedes}',
    'surveyStandardReleaseId',g.snapshot#>'{provenance,surveyStandardReleaseId}','code',g.snapshot#>'{provenance,code}',
    'standardInstrumentVersion',g.snapshot#>'{provenance,standardInstrumentVersion}','triplet',g.snapshot#>'{provenance,triplet}',
    'sourceMeasurementRelease',g.snapshot#>'{provenance,sourceMeasurementRelease}')) AS snapshot,
   g.snapshot_digest AS "snapshotDigest"
  FROM survey_instrument_drafts d LEFT JOIN survey_tool_grants g ON g.id=d.catalog_grant_id AND g.user_id=${ownerId}
  WHERE d.project_id=${projectId} AND d.id=ANY(${all}::text[]) ORDER BY d.id`)
 if(rows.length!==all.length||rows.some(row=>row.catalogGrantId&&!row.id))return fail('原研究工具来源身份缺失或不属于当前研究者')
 const selected=new Map<string,SelectedReferenceAudit>()
 for(const row of rows){
  if(!row.catalogGrantId||!row.id)continue
  const sealed=readSurveyStandardUse({...row,id:row.id})
  if(!sealed)continue
  const c=sealed.binding.configuration
  if(!z.string().regex(/^[a-f0-9]{64}$/).safeParse(row.snapshotDigest).success)return fail('原研究固定配置身份不完整')
  selected.set(row.draftId,{slotId:row.draftId,kind:c.kind,sourceId:c.kind==='STANDARD_COMBINATION'?c.combinationId:c.configId,sourceHash:c.kind==='STANDARD_COMBINATION'?c.combinationHash:row.snapshot.ref.sourceVersion,
   referenceHash:row.snapshotDigest,selectedBinding:selectedConfigurationPointer(sealed)})
 }
 const project=(values:string[])=>values.flatMap(id=>selected.has(id)?[selected.get(id)!]:[])
 return selectedReferenceChanges(project(before),project(after))
}
