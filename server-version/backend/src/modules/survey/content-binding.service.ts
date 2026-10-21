import { assertSurveyScaleCollectionAllowed } from './scale-collection-guard'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {selectFrozenReferencePolicy,type VerifiedReferenceForSelection} from '../measurement-content/reference-policy'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import type {ResearchFrozenPublication} from './publication.service'
import {assignedSurveySnapshot,type SurveyFlowAssignment} from './flow.assignment'
import {SurveyWaveError} from './waves.service'
const text=z.string().min(1).max(240),hash=z.string().regex(/^[a-f0-9]{64}$/)
const pointer=z.object({releaseId:text,contentHash:hash}).strict()
const slot={metricKey:text,referenceKind:z.enum(['normative_distribution','criterion_threshold','descriptive_sample','theoretical_range'])}
export const surveyAttemptContentBindingSchema=z.object({schemaVersion:z.literal(1),projectId:text,waveId:text,attemptId:text,
  publicationId:text,definitionDigest:hash,populationContext:z.object({}).strict(),
  units:z.array(z.object({instrumentKey:text,measurement:pointer.extend({measurementHash:hash}).strict(),
    references:z.array(z.discriminatedUnion('status',[
      z.object({...slot,status:z.literal('SELECTED'),releaseId:text,contentHash:hash,entryKey:hash}).strict(),
      z.object({...slot,status:z.literal('UNAVAILABLE'),reason:z.enum(['REVOKED','RETIRED','MISSING_CONTEXT','NO_MATCH','AMBIGUOUS'])}).strict(),
    ])).max(1000),report:pointer.optional(),reportAvailability:z.enum(['AVAILABLE','REVOKED']).optional()}).strict()
      .refine(unit=>Boolean(unit.report)===Boolean(unit.reportAvailability))).max(30),
}).strict()
export type SurveyAttemptContentBinding=z.infer<typeof surveyAttemptContentBindingSchema>
function fail():never{throw new SurveyWaveError(409,'研究作答的冻结内容绑定缺失、变更或已不可用')}
type Scope={projectId:string;waveId:string;attemptId:string;publicationId:string}
type Row={content_binding_cipher:string|null;content_binding_hash:string|null;flow_assignment_cipher:string|null;
  owner_id:string;definition_digest:string;compiled_snapshot:ResearchFrozenPublication}

/** Pure immutable receipt validation; null is explicit pre-binding legacy data.
 * selectedSnapshot must already be the server-verified assigned publication.
 */
export function decodeSurveyAttemptContentBinding(input:Scope&{definitionDigest:string;selectedSnapshot:ResearchFrozenPublication;
  contentBindingCipher:string|null;contentBindingHash:string|null}):SurveyAttemptContentBinding|null{
  if(input.contentBindingCipher===null&&input.contentBindingHash===null)return null
  if(!input.contentBindingCipher||!input.contentBindingHash)fail()
  const binding=surveyAttemptContentBindingSchema.parse(decryptUnifiedRuntimePayload(input.contentBindingCipher!))
  if(canonicalHash(binding)!==input.contentBindingHash||binding.projectId!==input.projectId||binding.waveId!==input.waveId
    ||binding.attemptId!==input.attemptId||binding.publicationId!==input.publicationId||binding.definitionDigest!==input.definitionDigest)fail()
  const expected=input.selectedSnapshot.units.filter(unit=>unit.measurementRelease)
  if(binding.units.length!==expected.length||new Set(binding.units.map(unit=>unit.instrumentKey)).size!==binding.units.length)fail()
  for(const unit of binding.units){
    const frozen=expected.find(item=>item.instrumentKey===unit.instrumentKey)
    if(!frozen||canonicalHash(frozen.measurementRelease)!==canonicalHash(unit.measurement))fail()
    if(canonicalHash(frozen.contentSelection?.reportRelease??null)!==canonicalHash(unit.report??null))fail()
    const choices=frozen.contentSelection?.referencePolicy.choices??[]
    const slots=new Set(choices.map(choice=>JSON.stringify([choice.metricKey,choice.referenceKind])))
    if(unit.references.length!==slots.size||new Set(unit.references.map(ref=>JSON.stringify([ref.metricKey,ref.referenceKind]))).size!==slots.size)fail()
    for(const ref of unit.references){
      if(!slots.has(JSON.stringify([ref.metricKey,ref.referenceKind])))fail()
      if(ref.status==='SELECTED'&&!choices.some(choice=>choice.metricKey===ref.metricKey&&choice.referenceKind===ref.referenceKind
        &&choice.releaseId===ref.releaseId&&choice.contentHash===ref.contentHash&&choice.entryKey===ref.entryKey))fail()
    }
  }
  return binding
}

/** Called only after current admission credential/owner checks, under existing Project/Wave/credential locks (new Attempt rows are transaction-owned). New attempts bind once; legacy recovery is never backfilled.
 * Raw SQL isolates these additive fields until the private Prisma client is generated.
 * No payload or private template is returned to participant DTOs.
 */
export async function bindSurveyAttemptContent(tx:Prisma.TransactionClient,input:Scope&{newAttempt:boolean}):Promise<void>{
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT attempt.content_binding_cipher,attempt.content_binding_hash,
    attempt.flow_assignment_cipher,project.owner_user_id AS owner_id,publication.definition_digest,publication.compiled_snapshot
    FROM survey_wave_attempts attempt JOIN survey_projects project ON project.id=attempt.project_id
    JOIN survey_waves wave ON wave.id=attempt.wave_id AND wave.project_id=attempt.project_id
    JOIN survey_publications publication ON publication.id=wave.publication_id AND publication.project_id=project.id
    WHERE attempt.id=${input.attemptId} AND attempt.project_id=${input.projectId} AND attempt.wave_id=${input.waveId}
      AND publication.id=${input.publicationId} FOR SHARE OF project,wave,publication`)
  if(rows.length!==1)fail()
  const row=rows[0],snapshot=row.compiled_snapshot
  if(snapshot.projectId!==input.projectId||snapshot.waveId!==input.waveId||snapshot.runtimeStatus!=='SURVEY_FINAL_V1'
    ||canonicalHash(snapshot)!==row.definition_digest)fail()
  if(Boolean(row.content_binding_cipher)!==Boolean(row.content_binding_hash))fail()
  if(!input.newAttempt&&!row.content_binding_cipher)return // Legacy recovery never invents an assignment/content binding.
  const assignment=row.flow_assignment_cipher?decryptUnifiedRuntimePayload<SurveyFlowAssignment>(row.flow_assignment_cipher):null
  const selected=assignedSurveySnapshot(snapshot,assignment)
  if(input.newAttempt) await assertSurveyScaleCollectionAllowed(tx,selected)
  const cache=new Map<string,StoredRelease>()
  const read=async(id:string)=>{
    if(cache.has(id))return cache.get(id)!
    const release=await getContentRelease(tx,id,true)
    if(!release||release.scope.kind!=='PRIVATE'||release.scope.product!=='SURVEY'||release.scope.resourceId!==input.projectId
      ||release.scope.ownerId!==row.owner_id)fail()
    cache.set(id,release!);return release!
  }
  if(row.content_binding_cipher){
    const binding=decodeSurveyAttemptContentBinding({...input,definitionDigest:row.definition_digest,selectedSnapshot:selected,
      contentBindingCipher:row.content_binding_cipher,contentBindingHash:row.content_binding_hash})!
    for(const unit of binding.units){
      for(const item of [unit.measurement,...unit.references.filter(ref=>ref.status==='SELECTED'),...(unit.report?[unit.report]:[])]){
        const release=await read(item.releaseId)
        // Recovery preserves exact choices. Current withdrawal/read policy is a separate lifecycle gate; never reselect here.
        if(release.contentHash!==item.contentHash)fail()
      }
    }
    return
  }
  if(!input.newAttempt)return // Explicit old data behavior: no inferred/new binding on recovery.
  const units:SurveyAttemptContentBinding['units']=[]
  for(const unit of selected.units){
    if(!unit.measurementRelease){if(unit.contentSelection)fail();continue}
    const exact=unit.measurementRelease,measurement=await read(exact.releaseId)
    if(measurement.layer!=='MEASUREMENT'||measurement.family!==unit.kind||measurement.status==='REVOKED'
      ||measurement.contentHash!==exact.contentHash||measurement.content.measurementHash!==exact.measurementHash)fail()
    const content=unit.contentSelection
    const references:VerifiedReferenceForSelection[]=[]
    if(content){
      if(content.referencePolicy.measurementReleaseId!==exact.releaseId)fail()
      for(const id of new Set(content.referencePolicy.choices.map(choice=>choice.releaseId))){
        const reference=await read(id)
        if(reference.layer!=='REFERENCE'||reference.family!==unit.kind||reference.content.measurement.releaseId!==exact.releaseId
          ||reference.content.measurement.contentHash!==exact.contentHash)fail()
        references.push({releaseId:reference.releaseId,contentHash:reference.contentHash,status:reference.status,
          measurementReleaseId:exact.releaseId,entries:reference.content.entries.map(entry=>entry.definition as unknown as AssessmentReferenceEntry)})
      }
    }
    const record:SurveyAttemptContentBinding['units'][number]={instrumentKey:unit.instrumentKey,measurement:exact,
      references:content?selectFrozenReferencePolicy(content.referencePolicy,references,{}):[]}
    if(content?.reportRelease){
      const report=await read(content.reportRelease.releaseId)
      if(report.layer!=='REPORT'||report.family!==unit.kind||report.contentHash!==content.reportRelease.contentHash
        ||report.content.measurements.length!==1||canonicalHash(report.content.measurements[0])!==canonicalHash({releaseId:exact.releaseId,contentHash:exact.contentHash}))fail()
      record.report=content.reportRelease
      record.reportAvailability=report.status==='REVOKED'?'REVOKED':'AVAILABLE'
    }
    units.push(record)
  }
  if(new Set(units.map(unit=>unit.instrumentKey)).size!==units.length)fail()
  if(!units.length)return // Legacy/FORM-only publications carry no fabricated content identity.
  const binding=surveyAttemptContentBindingSchema.parse({schemaVersion:1,projectId:input.projectId,waveId:input.waveId,attemptId:input.attemptId,
    publicationId:input.publicationId,definitionDigest:row.definition_digest,populationContext:{},units})
  const changed=await tx.$executeRaw(Prisma.sql`UPDATE survey_wave_attempts SET content_binding_cipher=${encryptUnifiedRuntimePayload(binding)},
    content_binding_hash=${canonicalHash(binding)} WHERE id=${input.attemptId} AND project_id=${input.projectId} AND wave_id=${input.waveId}
      AND content_binding_cipher IS NULL AND content_binding_hash IS NULL`)
  if(changed!==1)fail()
}
