import {buildTrainingFlowUnits} from '../composite/training-flow-definition'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {getContentReleaseBatch} from '../measurement-content/repository'
import {draftEducationAssessmentEntry,educationDeliveryAuthoritySchema,educationAssessmentOriginSchema,educationAssessmentResourceKey} from './assessment-resource.contract'

type Tx=Prisma.TransactionClient
export class EducationAssessmentSourceError extends Error {
 readonly statusCode=409
 constructor(readonly code:string){super(code);this.name='EducationAssessmentSourceError'}
}
function fail(code:string):never{throw new EducationAssessmentSourceError(code)}
type Row={id:string;product:string;organization_id:string;family:string;source_composite_id:string;runtime_composite_id:string;
 entry:Record<string,unknown>;entry_hash:string;status:string;created_by_user_id:string;reviewed_by_user_id:string|null;reviewed_at:Date|null;
 published_by_user_id:string|null;published_at:Date|null;created_authority:unknown;reviewed_authority:unknown;published_authority:unknown}

/** Identity reader only. A verified immutable source is NOT actor, organization,
 * distribution, collection or report authorization. Those current checks belong
 * to the consuming workflow and must run in its transaction before any action.
 */
export async function readEducationAssessmentDeliveryIdentity(tx:Tx,input:{
 resourceKey:string;version:string;purpose:'NEW_USE'|'HISTORY'
}){
 const match=/^education-assessment:(SCHOOL|TEACHER):([a-f0-9-]{36}):([a-f0-9-]{36})$/.exec(input.resourceKey)
 if(!match||input.version!=='1.0.0')fail('EDUCATION_ASSESSMENT_RESOURCE_IDENTITY')
 const [row]=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM education_assessment_deliveries
  WHERE id=${match![3]} AND product=${match![1]} AND organization_id=${match![2]} FOR SHARE`)
 if(!row||!['PUBLISHED',...(input.purpose==='HISTORY'?['RETIRED']:[])].includes(row.status)
  ||!row.reviewed_by_user_id||row.reviewed_by_user_id===row.created_by_user_id||!row.reviewed_at
  ||!row.published_by_user_id||!row.published_at||canonicalHash(row.entry)!==row.entry_hash)
  fail('EDUCATION_ASSESSMENT_RESOURCE_NOT_AVAILABLE')
 const authority=[row.created_authority,row.reviewed_authority,row.published_authority].map(proof=>educationDeliveryAuthoritySchema.parse(proof))
 if(authority.some((proof,index)=>proof.actorId!==[row.created_by_user_id,row.reviewed_by_user_id,row.published_by_user_id][index]))fail('EDUCATION_ASSESSMENT_AUTHORITY_IDENTITY')
 const origin=educationAssessmentOriginSchema.parse(row.entry.educationOrigin)
 if(educationAssessmentResourceKey(origin)!==input.resourceKey||origin.resourceId!==row.id||origin.family!==row.family
  ||origin.product!==row.product||origin.organizationId!==row.organization_id||origin.sourceCompositeId!==row.source_composite_id
  ||origin.runtimeCompositeId!==row.runtime_composite_id)fail('EDUCATION_ASSESSMENT_RESOURCE_IDENTITY')
 const draft=draftEducationAssessmentEntry({origin,title:row.entry.title as string,disclosure:row.entry.resultDisclosure})
 const entry={...draft,releaseStatus:'PUBLISHED' as const}
 if(canonicalHash(entry)!==row.entry_hash)fail('EDUCATION_ASSESSMENT_POLICY_IDENTITY')
 const runtime=await tx.compositeAssessment.findUnique({where:{id:row.runtime_composite_id},include:{items:{include:{cognitiveAssignment:true,scale:true}},formSections:{include:{items:true}}}})
 if(!runtime||runtime.productKind!=='ORGANIZATION_RESOURCE'||runtime.status!=='PUBLISHED'||runtime.publicEnabled||runtime.copyable
  ||runtime.createdBy!==row.created_by_user_id||origin.distribution.actorId!==row.created_by_user_id
  ||runtime.courseId!==null||runtime.trainingContentSnapshotHash!==origin.runtimeSnapshotHash
  ||canonicalHash(runtime.trainingContentSnapshot)!==origin.runtimeSnapshotHash)fail('EDUCATION_ASSESSMENT_RUNTIME_IDENTITY')
 const definition=buildTrainingFlowUnits(runtime)
 if(!runtime.items.length||!definition.length||runtime.formSections.some(section=>!section.items.length)
  ||canonicalHash(definition)!==origin.runtimeDefinitionHash)fail('EDUCATION_ASSESSMENT_RUNTIME_DEFINITION')
 const snapshot=trainingContentSnapshotSchema.parse(runtime.trainingContentSnapshot)
 if(snapshot.compositeId!==runtime.id||snapshot.units.length!==origin.units.length
  ||runtime.items.filter(item=>item.type!=='FORM').length!==origin.units.length)fail('EDUCATION_ASSESSMENT_RUNTIME_IDENTITY')
 const releases=await getContentReleaseBatch(tx,[...new Set(origin.units.flatMap(unit=>[
  unit.measurement.releaseId,...unit.references.map(ref=>ref.releaseId),...(unit.report?[unit.report.releaseId]:[])]))],true)
 for(const unit of origin.units){
  const actual=snapshot.units.find(value=>value.itemId===unit.itemId)
  const slot=runtime.items.find(value=>value.id===unit.itemId)
  if(!actual||!slot||actual.family!==unit.family||slot.type!==(unit.family==='SJT'?'SITUATIONAL':unit.family)
   ||canonicalHash(actual.measurement)!==canonicalHash(unit.measurement)
   ||canonicalHash(actual.report??null)!==canonicalHash(unit.report))fail('EDUCATION_ASSESSMENT_UNIT_IDENTITY')
  const selectedReferences=[...new Map((actual.referencePolicy?.choices??[]).map(ref=>[ref.releaseId,{releaseId:ref.releaseId,contentHash:ref.contentHash}])).values()].sort((a,b)=>a.releaseId.localeCompare(b.releaseId))
  if(actual.referencePolicy&&actual.referencePolicy.measurementReleaseId!==unit.measurement.releaseId
    ||canonicalHash(selectedReferences)!==canonicalHash([...unit.references].sort((a,b)=>a.releaseId.localeCompare(b.releaseId))))
    fail('EDUCATION_ASSESSMENT_REFERENCE_IDENTITY')
  if(unit.family==='COGNITIVE'&&(actual.source.kind!=='COGNITIVE_CONFIG'||actual.source.assignmentId!==slot.cognitiveAssignmentId
    ||actual.source.id!==slot.cognitiveAssignment?.configId||actual.source.ownerId!==slot.cognitiveAssignment?.createdBy)
    ||unit.family==='SCALE'&&(actual.source.kind!=='SCALE'||actual.source.id!==slot.scaleId||actual.source.ownerId!==slot.scale?.creatorId)
    ||unit.family==='SJT'&&(actual.source.instrumentKey!==slot.situationalInstrumentKey||actual.source.instrumentVersion!==slot.situationalInstrumentVersion))
    fail('EDUCATION_ASSESSMENT_UNIT_IDENTITY')
  const measurement=releases.get(unit.measurement.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!==unit.family
   ||measurement.contentHash!==unit.measurement.contentHash||measurement.content.measurementHash!==unit.measurement.measurementHash)
    fail('EDUCATION_ASSESSMENT_CONTENT_IDENTITY')
  for(const [layer,pointer] of [['MEASUREMENT',unit.measurement],...unit.references.map(ref=>['REFERENCE',ref] as const),...(unit.report?[['REPORT',unit.report] as const]:[])] as const){
   const release=releases.get(pointer.releaseId)
   if(!release||release.layer!==layer||release.family!==unit.family||release.contentHash!==pointer.contentHash
    ||input.purpose==='NEW_USE'&&release.status!=='PUBLISHED')fail('EDUCATION_ASSESSMENT_CONTENT_IDENTITY')
   if(release.layer==='REFERENCE'&&(release.content.measurement.releaseId!==measurement.releaseId
     ||release.content.measurement.contentHash!==measurement.contentHash))fail('EDUCATION_ASSESSMENT_REFERENCE_IDENTITY')
   if(release.layer==='REPORT'&&(release.scope.kind!=='PLATFORM'&&(release.scope.product!==origin.product||release.scope.resourceId!==origin.runtimeCompositeId||release.scope.ownerId!==runtime.createdBy)
     ||release.content.measurements.length!==1
     ||release.content.measurements[0].releaseId!==measurement.releaseId||release.content.measurements[0].contentHash!==measurement.contentHash
     ||release.content.audience!==(origin.product==='TEACHER'?'teacher':'student')))
     fail('EDUCATION_ASSESSMENT_REPORT_IDENTITY')
  }
 }
 return {origin,entry,releases,runtime,authority,identityOnly:true as const}
}
