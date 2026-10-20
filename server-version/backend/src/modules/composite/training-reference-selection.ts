import {validateTrainingReportPointer} from './training-report-selection'
import {assertTrainingPrivateReferenceCourseUse} from './training-private-reference-use'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {resolveFormalReferenceRelease} from '../measurement-content/formal-reference-resolver'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import type {VerifiedReferenceForSelection} from '../measurement-content/reference-policy'
import type {TrainingContentSnapshot} from './training-content-binding'
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(240)
export const trainingReferenceKindSchema=z.enum(['normative_distribution','criterion_threshold','descriptive_sample','theoretical_range'])
export const trainingReferencePolicySchema=z.object({policyVersion:z.literal('EXACT_POPULATION_PRIORITY_V1'),measurementReleaseId:uuid,
 choices:z.array(z.object({releaseId:uuid,contentHash:hash,entryKey:hash,metricKey:text,referenceKind:trainingReferenceKindSchema,priority:z.number().int().safe()}).strict()).max(100)}).strict()
export const trainingReferenceSelectionSchema=z.object({schemaVersion:z.literal(1),units:z.array(z.object({itemId:uuid,
 choices:z.array(z.object({releaseId:uuid,entryKey:hash,priority:z.number().int().safe()}).strict()).max(100)}).strict()).max(1000)}).strict().superRefine((value,ctx)=>{
 if(new Set(value.units.map(unit=>unit.itemId)).size!==value.units.length||value.units.reduce((n,u)=>n+u.choices.length,0)>1000)
  ctx.addIssue({code:'custom',message:'Duplicate items or reference choice bound exceeded'})
 for(const unit of value.units)if(new Set(unit.choices.map(c=>JSON.stringify([c.releaseId,c.entryKey]))).size!==unit.choices.length)
  ctx.addIssue({code:'custom',message:'Duplicate reference choice'})
})
class TrainingReferenceSelectionError extends ContentReleaseError {readonly statusCode=409}
export function trainingReferenceFail(code='SELECTION_INVALID'):never{throw new TrainingReferenceSelectionError('CONTENT_TRAINING_REFERENCE_'+code)}
type Unit=TrainingContentSnapshot['units'][number]
/** Content use only: private references never cross owner/course boundaries.
 * Platform references require a persisted independent formal publication, not a
 * PLATFORM label, a review capability, or access to its original sample data. */
export async function validateTrainingReferenceRelease(tx:Prisma.TransactionClient,input:{unit:Unit;ownerId:string;compositeId:string;
 releaseId:string;contentHash?:string;purpose:'NEW_BINDING'|'REINTERPRETATION'|'HISTORY';admission?:boolean;releases:Map<string,StoredRelease>}):Promise<VerifiedReferenceForSelection>{
 let release=input.releases.get(input.releaseId)
 if(!release){release=(await getContentRelease(tx,input.releaseId,true))??undefined;if(release)input.releases.set(release.releaseId,release)}
 if(!release||release.layer!=='REFERENCE'||release.family!==input.unit.family||input.contentHash!==undefined&&release.contentHash!==input.contentHash
  ||release.content.measurement.releaseId!==input.unit.measurement.releaseId||release.content.measurement.contentHash!==input.unit.measurement.contentHash
  ||input.purpose==='NEW_BINDING'&&release.status!=='PUBLISHED'||input.purpose==='REINTERPRETATION'&&release.status==='REVOKED')trainingReferenceFail('UNAVAILABLE')
 const entries=release.content.entries.map(entry=>{const definition=entry.definition as unknown as AssessmentReferenceEntry;
  if(entry.metricKey!==definition.scoreKey||entry.referenceKind!==definition.referenceKind)trainingReferenceFail('ENTRY_INVALID');return definition})
 if(new Set(entries.map(referenceEntryKey)).size!==entries.length)trainingReferenceFail('ENTRY_INVALID')
 const scope=release.scope
 if(scope.kind==='PLATFORM')return resolveFormalReferenceRelease(tx,{releaseId:release.releaseId,contentHash:release.contentHash,
  measurementReleaseId:input.unit.measurement.releaseId,purpose:input.purpose},release)
 if(scope.kind!=='PRIVATE'||scope.product!=='TRAINING'||scope.ownerId!==input.ownerId)trainingReferenceFail('SCOPE_DENIED')
 if(scope.resourceId!==input.compositeId)await assertTrainingPrivateReferenceCourseUse(tx,{release,ownerId:input.ownerId,
  compositeId:input.compositeId,currentAdmission:input.purpose!=='HISTORY'||input.admission===true,draftSelection:input.purpose==='NEW_BINDING',recordAdmissionExpiry:input.admission===true})
 return {releaseId:release.releaseId,contentHash:release.contentHash,status:release.status,measurementReleaseId:input.unit.measurement.releaseId,
  entries}
}
/** Explicit draft selection only. Hashes, metric and kind are projected from
 * verified releases; the client never supplies an authoritative fingerprint. */
export async function attachTrainingReferenceSelection(tx:Prisma.TransactionClient,input:{snapshot:TrainingContentSnapshot;releases:Map<string,StoredRelease>;ownerId:string;selection:unknown}){
 if(input.selection==null)return {snapshot:input.snapshot,snapshotHash:canonicalHash(input.snapshot)}
 const selection=trainingReferenceSelectionSchema.parse(input.selection),byItem=new Map(input.snapshot.units.map(unit=>[unit.itemId,unit]))
 const policies=new Map<string,z.infer<typeof trainingReferencePolicySchema>>()
 for(const selected of selection.units){
  const unit=byItem.get(selected.itemId);if(!unit)trainingReferenceFail()
  const measurement=input.releases.get(unit.measurement.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT')trainingReferenceFail()
  const policy:z.infer<typeof trainingReferencePolicySchema>={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:unit.measurement.releaseId,choices:[]}
  for(const choice of selected.choices){
   const verified=await validateTrainingReferenceRelease(tx,{unit,ownerId:input.ownerId,compositeId:input.snapshot.compositeId,...choice,purpose:'NEW_BINDING',releases:input.releases})
   const entries=verified.entries.filter(entry=>referenceEntryKey(entry)===choice.entryKey)
   if(entries.length!==1||!measurement.content.metrics.some(m=>m.metricKey===entries[0].scoreKey))trainingReferenceFail('ENTRY_INVALID')
   policy.choices.push({...choice,contentHash:verified.contentHash,metricKey:entries[0].scoreKey,referenceKind:entries[0].referenceKind})
  }
  policies.set(unit.itemId,policy)
 }
 const snapshot={...input.snapshot,units:input.snapshot.units.map(unit=>({...unit,...(policies.has(unit.itemId)?{referencePolicy:policies.get(unit.itemId)!}:{})}))}
 return {snapshot,snapshotHash:canonicalHash(snapshot)}
}
/** Bounded, aggregate-only choices for an already authorized exact composite.
 * No candidate source manifest, original source owner, sample IDs or grants. */
export async function listTrainingReferenceChoices(tx:Prisma.TransactionClient,input:{snapshot:TrainingContentSnapshot;releases:Map<string,StoredRelease>;ownerId:string}){
 const ids=[...new Set(input.snapshot.units.map(u=>u.measurement.releaseId))]
 if(!ids.length)return {schemaVersion:1 as const,units:[]}
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases
  WHERE layer='REFERENCE' AND status='PUBLISHED' AND content->'measurement'->>'releaseId' IN (${Prisma.join(ids)})
   AND ((scope->>'kind'='PRIVATE' AND scope->>'product'='TRAINING' AND scope->>'ownerId'=${input.ownerId}
    AND (scope->>'resourceId'=${input.snapshot.compositeId} OR EXISTS (
     SELECT 1 FROM training_reference_requests p JOIN questionnaire_course_deliveries d ON d.course_id=p.course_id
     WHERE p.operation='PUBLISH' AND p.release_id=measurement_content_releases.id AND p.actor_id=${input.ownerId}
      AND p.composite_id=scope->>'resourceId' AND p.candidate_id=provenance->>'candidateId' AND p.review_id=provenance->>'reviewId'
      AND d.composite_id=${input.snapshot.compositeId})))
    OR scope->>'kind'='PLATFORM') ORDER BY published_at DESC,id LIMIT 1001 FOR SHARE`)
 if(rows.length>1000)trainingReferenceFail('LIST_BOUND_EXCEEDED')
 const reportRows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases
  WHERE layer='REPORT' AND status='PUBLISHED' AND scope->>'kind'='PRIVATE' AND scope->>'product'='TRAINING'
   AND scope->>'ownerId'=${input.ownerId} AND scope->>'resourceId'=${input.snapshot.compositeId}
  ORDER BY published_at DESC,id LIMIT 1001 FOR SHARE`)
 if(reportRows.length>1000)trainingReferenceFail('LIST_BOUND_EXCEEDED')
 const units:Array<{itemId:string;family:Unit['family'];measurementReleaseId:string;reports:Array<{releaseId:string;version:string;title:string|null;audience:string}>;choices:Array<{releaseId:string;entryKey:string;version:string;metricKey:string;referenceKind:string;scope:'PRIVATE'|'PLATFORM';population:AssessmentReferenceEntry['population'];limitations:string[]}>}>=[]
 for(const unit of input.snapshot.units){
  const choices:typeof units[number]['choices']=[]
  for(const row of rows){
   let release=input.releases.get(row.id)
   if(!release){release=(await getContentRelease(tx,row.id,true))??undefined;if(release)input.releases.set(row.id,release)}
   if(!release||release.layer!=='REFERENCE'||release.content.measurement.releaseId!==unit.measurement.releaseId)continue
   let verified:VerifiedReferenceForSelection
   try{verified=await validateTrainingReferenceRelease(tx,{unit,ownerId:input.ownerId,compositeId:input.snapshot.compositeId,releaseId:row.id,purpose:'NEW_BINDING',releases:input.releases})}
   catch(error){if(error instanceof ContentReleaseError&&error.message!=='CONTENT_TRAINING_REFERENCE_SCOPE_BUSY_RETRY')continue;throw error}
   for(const entry of verified.entries)choices.push({releaseId:release.releaseId,entryKey:referenceEntryKey(entry),version:release.version,
    metricKey:entry.scoreKey,referenceKind:entry.referenceKind,scope:release.scope.kind as 'PRIVATE'|'PLATFORM',population:entry.population,limitations:entry.limitations??[]})
  }
  const reports:typeof units[number]['reports']=[]
  for(const row of reportRows){
   try{
    await validateTrainingReportPointer(tx,{unit,compositeId:input.snapshot.compositeId,ownerId:input.ownerId,reportReleaseId:row.id,publication:true,releases:input.releases})
    const report=input.releases.get(row.id)!
    if(report.layer==='REPORT')reports.push({releaseId:report.releaseId,version:report.version,title:report.content.template.title??null,audience:report.content.audience})
   }catch(error){if(error instanceof ContentReleaseError)continue;throw error}
  }
  units.push({itemId:unit.itemId,family:unit.family,measurementReleaseId:unit.measurement.releaseId,choices,reports})
 }
 return {schemaVersion:1 as const,units}
}
