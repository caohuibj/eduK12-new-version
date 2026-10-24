import {validateTrainingReferenceRelease} from '../composite/training-reference-selection'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash,CANONICAL_JSON_SHA256_V1} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {selectFrozenReferencePolicy,type FrozenReferencePolicy,type VerifiedReferenceForSelection} from '../measurement-content/reference-policy'
import {interpretContentBinding,type FinalInterpretation,type FinalInterpretationUnit} from '../measurement-content/final-interpretation'
import {renderDeclaredReport,DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import {trainingMeasurementSourceScopeMatchesForConsumer} from '../composite/training-content-binding'
import {trainingReportDisclosureAllowed,type TrainingMetricDisclosure} from '../composite/training-metric-disclosure'
import type {AssessmentReferenceEntry,ReferenceContext} from '../assessment-reference/reference'
import {authorizeTrainingReinterpretation,recheckTrainingReinterpretationAuthority,trainingInterpretationSource,readTrainingInterpretationFacts,readTrainingInterpretationDisclosure,
 interpretationFail,trainingReinterpretationContextSchema,type TrainingReinterpretationContext,type TrainingInterpretationParent} from './reinterpretation-source'
const uuid=z.string().guid(),digest=z.string().regex(/^[a-f0-9]{64}$/)
export const trainingReinterpretationBodySchema=z.object({requestId:uuid,itemId:uuid,reason:z.string().trim().min(3).max(1000),
 previousArtifactId:uuid.optional(),reportReleaseId:uuid.optional(),references:z.array(z.object({releaseId:uuid,entryKey:digest,priority:z.number().int().safe()}).strict()).max(100),
}).strict().refine(value=>Boolean(value.reportReleaseId)||value.references.length>0,'Explicit report or reference selection is required')
type Request=z.infer<typeof trainingReinterpretationBodySchema>
export interface TrainingInterpretationArtifact {
 schemaVersion:1;semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION';actorId:string;reason:string;courseId:string;compositeId:string;attemptId:string;attemptEpoch:number;itemId:string;
 sourceAggregateHash:string;sourceBindingHash:string;sourceReceiptHash:string;sourceResultHash:string|null;sourceContextHash:string|null;
 previous:{kind:'FINAL_RECEIPT';hash:string}|{kind:'INTERPRETATION';artifactId:string;hash:string};
 binding:{populationContext:ReferenceContext;units:FinalInterpretationUnit[]};referencePolicy:FrozenReferencePolicy;
 versions:{measurement:{releaseId:string;contentHash:string;version:string;measurementHash:string;scoringVersion:string};
 references:Array<{releaseId:string;contentHash:string;version:string}>;report:{releaseId:string;contentHash:string;version:string}|null};
 interpretation:FinalInterpretation;report:ReturnType<typeof renderDeclaredReport>|null;generatorVersion:typeof DECLARATIVE_REPORT_GENERATOR
}
type Row={id:string;course_id:string;composite_id:string;attempt_id:string;attempt_epoch:number;item_id:string;created_by:string;request_hash:string;
 source_aggregate_hash:string;source_binding_hash:string;source_receipt_hash:string;previous_artifact_id:string|null;artifact_cipher:string;artifact_hash:string;created_at:Date}
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
async function existing(tx:Prisma.TransactionClient,id:string){
 const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM training_interpretation_artifacts WHERE id=${id} FOR SHARE`)
 return rows[0]
}
function decoded(row:Row,parent:TrainingInterpretationParent,c:TrainingReinterpretationContext){
 const artifact=decryptUnifiedRuntimePayload<TrainingInterpretationArtifact>(row.artifact_cipher)
 if(canonicalHash(artifact)!==row.artifact_hash||artifact.schemaVersion!==1||artifact.semantics!=='EXPLICIT_IMMUTABLE_INTERPRETATION'
  ||artifact.generatorVersion!==DECLARATIVE_REPORT_GENERATOR||row.course_id!==c.courseId||row.composite_id!==c.compositeId||row.attempt_id!==c.attemptId
  ||row.attempt_epoch!==parent.attemptEpoch||row.source_aggregate_hash!==parent.aggregateInputHash||row.source_binding_hash!==parent.trainingContentBindingHash
  ||row.source_receipt_hash!==parent.trainingContentInterpretationHash||artifact.courseId!==row.course_id||artifact.compositeId!==row.composite_id
  ||artifact.attemptId!==row.attempt_id||artifact.attemptEpoch!==row.attempt_epoch||artifact.itemId!==row.item_id||artifact.actorId!==row.created_by
  ||artifact.sourceAggregateHash!==row.source_aggregate_hash||artifact.sourceBindingHash!==row.source_binding_hash||artifact.sourceReceiptHash!==row.source_receipt_hash
  ||(artifact.previous.kind==='INTERPRETATION'?artifact.previous.artifactId:null)!==row.previous_artifact_id
  ||artifact.interpretation.contentBindingHash!==canonicalHash(artifact.binding)||artifact.binding.units.length!==1
  ||artifact.binding.units[0].instrumentKey!==row.item_id||artifact.interpretation.units.length!==1||artifact.interpretation.units[0].instrumentKey!==row.item_id)interpretationFail('ARTIFACT_INTEGRITY')
 const source=trainingInterpretationSource(parent,row.item_id)
 if(artifact.sourceResultHash!==(source.source?.resultHash??null)||artifact.sourceContextHash!==parent.contextSnapshotHash
  ||canonicalHash(artifact.binding.populationContext)!==canonicalHash(source.populationContext)
  ||canonicalHash(artifact.binding.units[0].measurement)!==canonicalHash(source.unit.measurement))interpretationFail('ARTIFACT_INTEGRITY')
 return {artifactId:row.id,createdAt:row.created_at.toISOString(),artifactHash:row.artifact_hash,hashScheme:CANONICAL_JSON_SHA256_V1,artifact}
}
const releaseReader=(tx:Prisma.TransactionClient)=>{
 const cache=new Map<string,StoredRelease>()
 return {cache,read:async(id:string)=>{
  let release=cache.get(id)
  if(!release){release=(await getContentRelease(tx,id,true))??undefined;if(release)cache.set(id,release)}
  if(!release)interpretationFail('RELEASE_MISSING')
  return release
 }}
}
function privateScope(release:StoredRelease,c:TrainingReinterpretationContext){
 if(release.scope.kind!=='PRIVATE'||release.scope.product!=='TRAINING'||release.scope.ownerId!==c.actorId||release.scope.resourceId!==c.compositeId)interpretationFail('RELEASE_SCOPE')
}
/** Lifecycle notices are current and separate from immutable export bytes. Saved
 * interpretations are retained, but withdrawn rules are never presented as current.
 * Read does not select references, score, or render again. */
async function currentNotices(read:(id:string)=>Promise<StoredRelease>,artifact:TrainingInterpretationArtifact){
 const pointers=[{layer:'MEASUREMENT',...artifact.versions.measurement},...artifact.versions.references.map(r=>({layer:'REFERENCE',...r})),
  ...(artifact.versions.report?[{layer:'REPORT',...artifact.versions.report}]:[])]
 const notices:Array<{layer:string;releaseId:string;status:string}>=[]
 for(const pointer of pointers){const release=await read(pointer.releaseId)
  if(release.layer!==pointer.layer||release.contentHash!==pointer.contentHash||release.version!==pointer.version)interpretationFail('RELEASE_IDENTITY')
  if(release.status!=='PUBLISHED')notices.push({layer:release.layer,releaseId:release.releaseId,status:release.status})
 }
 return notices
}
async function response(tx:Prisma.TransactionClient,c:TrainingReinterpretationContext,parent:TrainingInterpretationParent,row:Row,reader=releaseReader(tx)){
 const result=decoded(row,parent,c),lifecycleNotices=await currentNotices(reader.read,result.artifact)
 const source=trainingInterpretationSource(parent,result.artifact.itemId),measurement=await reader.read(source.unit.measurement.releaseId)
 if(measurement.layer!=='MEASUREMENT')interpretationFail('RELEASE_IDENTITY')
 const disclosure=await readTrainingInterpretationDisclosure(tx,parent,source,measurement.content.metrics.map(metric=>metric.metricKey))
 const report=result.artifact.versions.report?await reader.read(result.artifact.versions.report.releaseId):null
 if(report&&report.layer!=='REPORT')interpretationFail('RELEASE_IDENTITY')
 assertDisclosure(disclosure,result.artifact.referencePolicy,report?.layer==='REPORT'?report:null)
 await recheckTrainingReinterpretationAuthority(tx,c)
 return {...result,lifecycleNotices,currentUseStatus:lifecycleNotices.some(n=>n.status==='REVOKED')?'REVOKED' as const:'AVAILABLE' as const}
}
function assertDisclosure(disclosure:TrainingMetricDisclosure|null,policy:FrozenReferencePolicy,report:Extract<StoredRelease,{layer:'REPORT'}>|null){
 // No accepted execution has no personal values to disclose. Its NOT_EXECUTED
 // receipt remains readable; never fabricate a policy or new execution for it.
 if(!disclosure)return
 if(policy.choices.some(choice=>!disclosure.referenceMetricKeys.has(choice.metricKey))
  ||report&&!trainingReportDisclosureAllowed(disclosure,report.content))interpretationFail('DISCLOSURE_DENIED')
}
/** Explicitly authored interpretation over one exact FINAL unit. The caller never
 * supplies actor, metrics, quality or demographic context. Request UUID locks bind
 * body + actor + current scope; a lost response can retry without reinterpreting. */
export async function createTrainingReinterpretation(context:TrainingReinterpretationContext,raw:unknown){
 const c=trainingReinterpretationContextSchema.parse(context),input=trainingReinterpretationBodySchema.parse(raw)
 const requestHash=canonicalHash({context:c,input})
 return prisma.$transaction(async tx=>{
  const parent=await authorizeTrainingReinterpretation(tx,c)
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`training-interpretation:${input.requestId}`}))`)
  const prior=await existing(tx,input.requestId)
  if(prior){if(prior.request_hash!==requestHash||prior.created_by!==c.actorId)interpretationFail('REQUEST_CONFLICT');return response(tx,c,parent,prior)}
  const source=trainingInterpretationSource(parent,input.itemId),reader=releaseReader(tx),measurement=await reader.read(source.unit.measurement.releaseId)
  if(measurement.layer!=='MEASUREMENT'||measurement.family!==source.unit.family||measurement.contentHash!==source.unit.measurement.contentHash
   ||measurement.content.measurementHash!==source.unit.measurement.measurementHash||!await trainingMeasurementSourceScopeMatchesForConsumer(tx,measurement,source.unit.source)
   ||measurement.status==='REVOKED')return interpretationFail('MEASUREMENT_UNAVAILABLE')
  let previous:TrainingInterpretationArtifact['previous']={kind:'FINAL_RECEIPT',hash:parent.trainingContentInterpretationHash!}
  if(input.previousArtifactId){
   if(input.previousArtifactId===input.requestId)interpretationFail('PREVIOUS_IDENTITY')
   const row=await existing(tx,input.previousArtifactId)
   if(!row||row.item_id!==input.itemId)interpretationFail('PREVIOUS_IDENTITY')
   const old=decoded(row,parent,c)
   previous={kind:'INTERPRETATION',artifactId:old.artifactId,hash:old.artifactHash}
  }
  const policy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}
  const references=new Map<string,VerifiedReferenceForSelection>(),referenceVersions:TrainingInterpretationArtifact['versions']['references']=[],seen=new Set<string>()
  for(const choice of input.references){
   const key=JSON.stringify([choice.releaseId,choice.entryKey]);if(seen.has(key))interpretationFail('DUPLICATE_REFERENCE');seen.add(key)
   const release=await reader.read(choice.releaseId)
   if(release.scope.kind!=='PLATFORM')privateScope(release,c)
   await validateTrainingReferenceRelease(tx,{unit:source.unit,ownerId:c.actorId,compositeId:c.compositeId,releaseId:choice.releaseId,purpose:'REINTERPRETATION',releases:reader.cache})
   if(release.layer!=='REFERENCE'||release.status!=='PUBLISHED'||release.family!==measurement.family||release.content.measurement.releaseId!==measurement.releaseId
    ||release.content.measurement.contentHash!==measurement.contentHash)return interpretationFail('REFERENCE_UNAVAILABLE')
   const entries=release.content.entries.filter(e=>referenceEntryKey(e.definition as unknown as AssessmentReferenceEntry)===choice.entryKey)
   if(entries.length!==1||!measurement.content.metrics.some(m=>m.metricKey===entries[0].metricKey))interpretationFail('REFERENCE_IDENTITY')
   policy.choices.push({...choice,contentHash:release.contentHash,metricKey:entries[0].metricKey,referenceKind:entries[0].referenceKind})
   if(!references.has(release.releaseId))referenceVersions.push({releaseId:release.releaseId,contentHash:release.contentHash,version:release.version})
   references.set(release.releaseId,{releaseId:release.releaseId,contentHash:release.contentHash,status:release.status,
    measurementReleaseId:measurement.releaseId,entries:release.content.entries.map(e=>e.definition as unknown as AssessmentReferenceEntry)})
  }
  const unit:FinalInterpretationUnit={instrumentKey:input.itemId,measurement:source.unit.measurement,
   references:selectFrozenReferencePolicy(policy,[...references.values()],source.populationContext)}
  let template:Extract<StoredRelease,{layer:'REPORT'}>|undefined
  if(input.reportReleaseId){
   const release=await reader.read(input.reportReleaseId);privateScope(release,c)
   if(release.layer!=='REPORT'||release.status!=='PUBLISHED'||release.family!==measurement.family||release.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR
    ||!['teacher','researcher'].includes(release.content.audience)||release.assetRefs.length||release.content.measurements.length!==1
    ||canonicalHash(release.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash})
    ||release.content.metricKeys.some(key=>!measurement.content.metrics.some(m=>m.metricKey===key)))return interpretationFail('REPORT_UNAVAILABLE')
   template=release;unit.report={releaseId:release.releaseId,contentHash:release.contentHash}
  }
  const facts=await readTrainingInterpretationFacts(tx,parent,source)
  if(facts.core&&(facts.core.instrumentVersion!==(measurement.family==='COGNITIVE'?measurement.content.runnerVersion:measurement.content.instrumentVersion)||facts.core.scorerVersion!==measurement.content.scoringVersion
   ||facts.core.metrics.some(metric=>!measurement.content.metrics.some(m=>m.metricKey===metric.key))))interpretationFail('FACT_IDENTITY')
  assertDisclosure(facts.disclosure,policy,template??null)
  const binding={populationContext:source.populationContext,units:[unit]}
  const interpretation=await interpretContentBinding({binding,contentBindingHash:canonicalHash(binding),readFacts:()=>facts,
   readRelease:async(id,hash)=>{const release=await reader.read(id);if(release.contentHash!==hash)interpretationFail('RELEASE_IDENTITY');return release}})
  const personal=interpretation.units[0]
  const report=template&&personal.report.status==='READY'?renderDeclaredReport(template.content.template,
   facts.metrics.filter(metric=>template!.content.metricKeys.includes(metric.key)).map(metric=>({metricKey:metric.key,value:metric.value,
    unit:measurement.content.metrics.find(m=>m.metricKey===metric.key)!.unit,
    status:facts.quality==='interpretable'&&metric.status==='OK'?'INTERPRETABLE':facts.quality==='invalid'?'INVALID':'UNAVAILABLE'})),
   personal.references.map(reference=>({metricKey:reference.metricKey,referenceKind:reference.referenceKind,status:reference.status==='AVAILABLE'?'AVAILABLE':'UNAVAILABLE',bandKey:reference.values?.bandKey??null}))):null
  const artifact:TrainingInterpretationArtifact={schemaVersion:1,semantics:'EXPLICIT_IMMUTABLE_INTERPRETATION',actorId:c.actorId,reason:input.reason,
   courseId:c.courseId,compositeId:c.compositeId,attemptId:c.attemptId,attemptEpoch:parent.attemptEpoch,itemId:input.itemId,
   sourceAggregateHash:parent.aggregateInputHash!,sourceBindingHash:parent.trainingContentBindingHash!,sourceReceiptHash:parent.trainingContentInterpretationHash!,
   sourceResultHash:source.source?.resultHash??null,sourceContextHash:parent.contextSnapshotHash,previous,binding,referencePolicy:policy,
   versions:{measurement:{...source.unit.measurement,version:measurement.version,scoringVersion:measurement.content.scoringVersion},references:referenceVersions,
    report:template?{releaseId:template.releaseId,contentHash:template.contentHash,version:template.version}:null},interpretation,report,generatorVersion:DECLARATIVE_REPORT_GENERATOR}
  const cipher=encryptUnifiedRuntimePayload(artifact),artifactHash=canonicalHash(artifact)
  if(Buffer.byteLength(cipher)>2*1024*1024)interpretationFail('ARTIFACT_SIZE')
  await recheckTrainingReinterpretationAuthority(tx,c)
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`INSERT INTO training_interpretation_artifacts
   (id,course_id,composite_id,attempt_id,attempt_epoch,item_id,created_by,request_hash,source_aggregate_hash,source_binding_hash,source_receipt_hash,previous_artifact_id,artifact_cipher,artifact_hash)
   VALUES (${input.requestId},${c.courseId},${c.compositeId},${c.attemptId},${parent.attemptEpoch},${input.itemId},${c.actorId},${requestHash},
    ${parent.aggregateInputHash},${parent.trainingContentBindingHash},${parent.trainingContentInterpretationHash},${input.previousArtifactId??null},${cipher},${artifactHash}) RETURNING *`)
  if(rows.length!==1)interpretationFail('WRITE_FAILED')
  return response(tx,c,parent,rows[0],reader)
 },options)
}
export async function readTrainingReinterpretation(context:TrainingReinterpretationContext,artifactId:string){
 const c=trainingReinterpretationContextSchema.parse(context);uuid.parse(artifactId)
 return prisma.$transaction(async tx=>{
  const parent=await authorizeTrainingReinterpretation(tx,c),row=await existing(tx,artifactId)
  if(!row)interpretationFail('ARTIFACT_NOT_FOUND')
  return response(tx,c,parent,row)
 },options)
}
/** Separate 7B export only. Default raw exports never call this module. The
 * stable export document is hashed without mutable lifecycle notices; callers
 * must display those notices separately and never overwrite the saved artifact. */
export async function exportTrainingReinterpretation(context:TrainingReinterpretationContext,artifactId:string){
 const result=await readTrainingReinterpretation(context,artifactId)
 const document={schemaVersion:1 as const,schema:'TRAINING_INTERPRETATION_EXPORT_V1' as const,hashScheme:CANONICAL_JSON_SHA256_V1,
  artifactId:result.artifactId,artifactHash:result.artifactHash,createdAt:result.createdAt,artifact:result.artifact}
 return {document,exportHash:canonicalHash(document),lifecycleNotices:result.lifecycleNotices,currentUseStatus:result.currentUseStatus}
}
