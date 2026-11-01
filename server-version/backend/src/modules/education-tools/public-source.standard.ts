import {frozenScaleInstructionSchema} from '../assessment-runtime/frozen-scale-instruction'
import {frozenTripletInstruction} from '../survey/standard-triplet.model'
import type {TrainingContentSnapshot} from '../composite/training-content-binding'
import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {assertExactStandardCombinationFacts,type ExactStandardCombination} from '../measurement-content/standard-combination-source'
import {prepareRelease} from '../measurement-content/release'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {databaseContentSource,matchesStandardNativeScale} from '../scale/component-import/native-source'
import {privateToolFail} from './private-tool.contracts'
import {educationStandardSourceSchema,type PrivateCompositionDefinition} from './private-tool.composition-contracts'
import {supportsExpertSource,isNativeExpertObserver} from './expert-observation.contract'
import {supportsStudentStandardSource} from './student-observation.contract'

/** Content adapter only. The caller checks current author/U before this bounded
 * body read. No Training grant, single-tool Composite or approval is created. */
export async function readEducationStandardSources(tx:Prisma.TransactionClient,sources:readonly {versionId:string;contentHash:string}[],administration:PrivateCompositionDefinition['administration']){
 const ids=[...new Set(sources.map(source=>source.versionId))]
 if(!ids.length)return new Map<string,EducationStandardLeaf>()
 const rows=await tx.$queryRaw<ExactStandardCombination[]>(Prisma.sql`SELECT * FROM survey_standard_releases
  WHERE id IN (${Prisma.join(ids)}) AND state='ONLINE' ORDER BY id FOR SHARE`)
 const measurements=await getContentReleaseBatch(tx,rows.flatMap(row=>row.measurement_release?[row.measurement_release.releaseId]:[]),true)
 const scales=await tx.scale.findMany({where:{OR:[{code:{in:[...new Set(rows.filter(r=>!databaseContentSource(r.snapshot.parts.CONTENT)).map(row=>row.snapshot.toolKey))]}},{id:{in:rows.flatMap(r=>{const p=databaseContentSource(r.snapshot.parts.CONTENT);return p?[p.scaleId]:[]})}}]}})
 const result=new Map<string,EducationStandardLeaf>()
 for(const source of sources){
  const row=rows.find(row=>row.id===source.versionId&&row.combination_hash===source.contentHash)
  if(!row||!row.measurement_release)privateToolFail('PUBLIC_STANDARD_SOURCE_UNAVAILABLE',404)
  if(result.has(source.versionId))continue
  const measurement=measurements.get(row.measurement_release.releaseId)
  assertExactStandardCombinationFacts(row,measurement)
  frozenTripletInstruction(row.snapshot)
  if(!measurement||measurement.layer!=='MEASUREMENT')privateToolFail('PUBLIC_STANDARD_MEASUREMENT_INVALID')
  const scale=scales.find(scale=>matchesStandardNativeScale(scale,row.snapshot))
  if(!scale||scale.status!=='PUBLISHED'||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId)privateToolFail('PUBLIC_STANDARD_NATIVE_UNAVAILABLE')
  // Installed C and selected P/R are distinct identities. The existing native
  // freezer receives the approved definition, rather than installed/default P/R.
  const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:measurement.version,
   instrumentVersion:scale.instrumentVersion,definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:measurement.scope}))
  if(installed.contentHash!==measurement.contentHash)privateToolFail('PUBLIC_STANDARD_NATIVE_CONTENT_MISMATCH')
  const applicability=row.snapshot.parts.CONTENT.reference.metadata.applicability as {respondentTypes?:string[]}|undefined
  const respondent=administration.responseMode==='SELF'?'SELF':administration.responseMode==='PARENT_REPORT'?'PARENT':administration.responseMode==='TEACHER_REPORT'?'TEACHER':'OBSERVER'
  if(administration.responseMode==='STUDENT_REPORT'&&!supportsStudentStandardSource({nativeRespondentType:row.snapshot.definition.respondentType,
   educationApplicability:row.snapshot.parts.CONTENT.reference.metadata.educationApplicability,applicability}))privateToolFail('PUBLIC_STANDARD_STUDENT_DECLARATION_REQUIRED',400)
  if(administration.responseMode==='EXPERT_REPORT'&&(administration.targetKind!=='PERSON'||!isNativeExpertObserver(row.snapshot.definition.respondentType)
   ||!supportsExpertSource(row.snapshot.parts.CONTENT.reference.metadata.educationExpertApplicability,administration)))privateToolFail('PUBLIC_STANDARD_EXPERT_DECLARATION_REQUIRED',400)
  if(!applicability?.respondentTypes?.includes(respondent))privateToolFail('PUBLIC_STANDARD_VARIANT_UNSUPPORTED',400)
  const descriptor=educationStandardSourceSchema.parse({releaseId:row.id,combinationHash:row.combination_hash,toolKey:row.snapshot.toolKey,
   instrumentVersion:row.snapshot.instrumentVersion,nativeDefinitionHash:canonicalHash(row.snapshot.definition),
   parametersAxisHash:row.snapshot.parts.PARAMETERS.hash,reportAxisHash:row.snapshot.parts.REPORT.hash,
   respondentDisclosure:resolveAudienceDisclosure(row.snapshot.parts.CONTENT.reference.metadata.disclosure as Parameters<typeof resolveAudienceDisclosure>[0],'respondent'),
   reportAudience:row.snapshot.definition.report.audienceContract?.audience??'teacher'})
  result.set(row.id,{row,measurement,scale,descriptor})
 }
 return result
}
export type EducationStandardLeaf={row:ExactStandardCombination;measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>;
 scale:Scale;descriptor:import('./private-tool.composition-contracts').EducationStandardSource}

/** Actual verified education START only. The admission already holds source/M
 * locks and checked current U/status. Read just the original native inputs once;
 * reuse server-loaded Scale identities and sealed M/definition pointers. Never
 * reread installed C or a full M body, rebuild P/R, or accept a caller receipt. */
export async function readEducationStandardStartSources(tx:Prisma.TransactionClient,units:TrainingContentSnapshot['units'],scales:readonly Scale[]){
 const ids=[...new Set(units.map(unit=>unit.source.educationStandard?.releaseId).filter((id):id is string=>!!id))]
 const result=new Map<string,Pick<import('../survey/standard-triplet.model').Triplet,'toolKey'|'instrumentVersion'|'definition'|'references'>&{instruction:import('../assessment-runtime/frozen-scale-instruction').FrozenScaleInstruction|null;importedScaleId?:string}>()
 if(!ids.length)return result
 type Row={id:string;hash:string;toolKey:string;instrumentVersion:string;definition:import('../scale/scale-definition').ScaleDefinitionV2;
  references:import('../survey/standard-triplet.model').Triplet['references'];instruction:unknown;nativeScaleId:string|null;measurement:{releaseId:string;contentHash:string}}
 const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT id,combination_hash AS hash,snapshot->>'toolKey' AS "toolKey",snapshot->>'instrumentVersion' AS "instrumentVersion",
  snapshot->'definition' AS definition,snapshot->'references' AS references,snapshot#>'{parts,CONTENT,reference,metadata,instruction}' AS instruction,
  snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,scaleId}' AS "nativeScaleId",
  measurement_release AS measurement FROM survey_standard_releases WHERE id IN (${Prisma.join(ids)}) AND state='ONLINE' ORDER BY id`)
 for(const unit of units){
  const source=unit.source.educationStandard;if(!source)continue
  const row=rows.find(row=>row.id===source.releaseId),scale=scales.find(scale=>scale.id===unit.source.id)
  if(!row||row.hash!==source.combinationHash||row.toolKey!==source.toolKey||row.instrumentVersion!==source.instrumentVersion
   ||!row.measurement||row.measurement.releaseId!==unit.measurement.releaseId||row.measurement.contentHash!==unit.measurement.contentHash
   ||!scale||(row.nativeScaleId?scale.id!==row.nativeScaleId||scale.standardSourceKind!=='DB_IMPORTED'||scale.standardToolKey!==source.toolKey:scale.code!==source.toolKey||scale.standardSourceKind==='DB_IMPORTED')||scale.instrumentVersion!==source.instrumentVersion||scale.creatorId!==unit.source.ownerId
   ||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId)privateToolFail('PUBLIC_STANDARD_FROZEN_SOURCE_INVALID')
  if(result.has(row.id))continue
  const instructionValue=row.instruction as {text?:unknown;language?:unknown;version?:unknown}|null
  const instruction=instructionValue===null?null:frozenScaleInstructionSchema.parse({text:instructionValue.text,language:instructionValue.language,version:instructionValue.version,origin:'INSTRUMENT_SOURCE'})
  result.set(row.id,{toolKey:row.toolKey,instrumentVersion:row.instrumentVersion,definition:row.definition,references:row.references,instruction,...(row.nativeScaleId?{importedScaleId:row.nativeScaleId}:{})})
 }
 return result
}
