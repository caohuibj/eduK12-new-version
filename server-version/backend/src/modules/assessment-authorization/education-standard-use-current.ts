import {Prisma} from '@prisma/client'
import {EDUCATION_STANDARD_USE_ACTION,readEducationStandardUseBinding,type EducationConfigurationScope} from './education-standard-use'
import type {PrivateToolContext} from '../education-tools/private-tool.contracts'
import {EducationAssessmentSourceError} from '../education-tools/assessment-resource.repository'
import {lockEducationAssessmentUsers} from '../education-tools/assessment-resource.locks'

export type EducationUseHeader={id:string;subject_id:string;issuer_id:string;resource_keys:string[]}
export type EducationStandardCurrentEvidence={binding:ReturnType<typeof readEducationStandardUseBinding>;
 authority:{validFrom:Date;expiresAt:Date;issuerExpiresAt:Date|null;readAt:Date}|null}
type Audit={id:string;actor_id:string;metadata:unknown}

/** Two bounded reads of identity and current original authority, never source
 * bodies, compilation, latest profile/report, or professional suitability.
 * The caller reads its existing post-lock clock AFTER this helper and verifies
 * both ordinary use and authority windows against that same clock. */
export async function readEducationStandardCurrentEvidence(tx:Prisma.TransactionClient,c:PrivateToolContext,uses:readonly EducationUseHeader[],lock:boolean,suppliedAudits?:readonly Audit[]){
 const result=new Map<string,EducationStandardCurrentEvidence>()
 if(!uses.length)return result
 let audits:readonly Audit[]
 if(suppliedAudits)audits=suppliedAudits
 else{
 try{
  // Account lifecycle may already hold User UPDATE -> Organization UPDATE.
  // A composition can hold Organization; do not wait in the inverse order.
  // This SHARE is retained, so the later authority join cannot acquire a stale
  // issuer after a successful nonblocking prelock.
  audits=await tx.$queryRaw(Prisma.sql`SELECT e.id,e.actor_id,e.metadata FROM assessment_management_events e
   JOIN users u ON u.id=e.actor_id WHERE e.id=ANY(${uses.map(use=>use.id)}::text[])
    AND e.action=${EDUCATION_STANDARD_USE_ACTION} ORDER BY u.id,e.id LIMIT 129 ${lock?Prisma.sql`FOR SHARE OF u NOWAIT`:Prisma.empty}`)
 }catch(error){
  const e=error as {code?:string;meta?:{code?:string}}
  if(e.code==='55P03'||e.meta?.code==='55P03')throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_AUTHORITY_BUSY')
  throw error
 }
 }
 if(!audits.length)return result // No new evidence; preserve explicit legacy behavior.
 if(audits.length>128)throw new EducationAssessmentSourceError('EDUCATION_CONFIGURATION_USE_BATCH_LIMIT')
 const byId=new Map(uses.map(use=>[use.id,use])),scope:EducationConfigurationScope={product:c.entry,organizationId:c.organizationId}
 const wanted=audits.map(audit=>{
  const use=byId.get(audit.id)
  if(!use||use.resource_keys.length!==1||audit.actor_id!==use.issuer_id||use.subject_id!==c.principal.userId)
   throw new EducationAssessmentSourceError('EDUCATION_CONFIGURATION_USE_IDENTITY')
  const binding=readEducationStandardUseBinding(audit.metadata,{id:use.id,issuerId:use.issuer_id,recipientId:use.subject_id,scope,resourceKey:use.resource_keys[0]})
  const a=binding.binding.authorization,config=binding.binding.configuration
  if(config.kind!=='STANDARD_COMBINATION')throw new EducationAssessmentSourceError('EDUCATION_CONFIGURATION_KIND')
  result.set(use.id,{binding,authority:null})
  return {useId:use.id,issuerId:use.issuer_id,entryId:a.authority[0].id,entryRevision:a.authority[0].revision,
   rootId:a.authority[1].id,rootRevision:a.authority[1].revision,measurementId:config.measurement.releaseId,combinationId:config.combinationId,combinationHash:config.combinationHash}
 })
 if(lock&&suppliedAudits)await lockEducationAssessmentUsers(tx,wanted.map(value=>value.issuerId))
 const tuples=wanted.map(w=>Prisma.sql`(${w.useId},${w.issuerId},${w.entryId},${w.entryRevision}::int,${w.rootId},${w.rootRevision}::int,${w.measurementId},${w.combinationId},${w.combinationHash})`)
 const facts=await tx.$queryRaw<Array<{useId:string;validFrom:Date;expiresAt:Date;issuerExpiresAt:Date|null;readAt:Date}>>(Prisma.sql`
  SELECT w.use_id AS "useId",root.valid_from AS "validFrom",root.expires_at AS "expiresAt",u.expires_at AS "issuerExpiresAt",clock_timestamp() AS "readAt"
  FROM (VALUES ${Prisma.join(tuples)}) w(use_id,issuer_id,entry_id,entry_revision,root_id,root_revision,measurement_id,combination_id,combination_hash)
  JOIN content_capability_grants root ON root.id=w.root_id AND root.subject_id=w.issuer_id AND root.version=w.root_revision
   AND root.product=${c.entry} AND root.scope_kind='ORGANIZATION' AND root.scope_id=${c.organizationId} AND root.resource_kind='material'
   AND root.resource_keys@>ARRAY[w.measurement_id]::text[] AND root.capabilities=ARRAY['material.distribute']::text[]
   AND root.parent_grant_id IS NULL AND root.ancestry=ARRAY[root.id]::text[] AND root.revoked_at IS NULL
   AND root.delegable_capabilities=ARRAY[]::text[] AND root.remaining_delegation_depth=0
  JOIN users u ON u.id=w.issuer_id AND u.account_domain IN ('TRAINING','LEGACY') AND u.platform_role='STANDARD'
   AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
  JOIN admin_entry_grants e ON e.id=w.entry_id AND e.user_id=w.issuer_id AND e.version=w.entry_revision
   AND e.entry=${c.entry==='SCHOOL'?'HUISCHOOL':'HUITEACHER'} AND e.revoked_at IS NULL
  JOIN survey_tool_policies p ON p.product=${c.entry} AND p.resource_key='standard-release:'||w.combination_id
   AND p.fingerprint=w.combination_hash AND p.decision='APPROVED' AND NOT p.paused
  ORDER BY root.id,e.id,w.use_id ${lock?Prisma.sql`FOR SHARE OF root,u,e,p`:Prisma.empty}`)
 for(const fact of facts){const item=result.get(fact.useId);if(item)item.authority=fact}
 return result
}

export function educationStandardEvidenceCurrent(evidence:EducationStandardCurrentEvidence,now:Date){
 const authority=evidence.authority
 return Boolean(authority&&authority.validFrom<=now&&authority.expiresAt>now
  &&(authority.issuerExpiresAt===null||authority.issuerExpiresAt>now))
}
