import {readEducationMarkerSource,type EducationMarkerBinding} from '../education-tools/assessment-resource.marker'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertStandardCombinationDerivedRelease} from '../measurement-content/standard-combination-content'
import type {StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {decodeTrainingStandardItemSource,type TrainingStandardItemSource} from './training-standard-combination'
type Unit={itemId:string;family:string;source:{id:string;educationBinding?:EducationMarkerBinding;standardCombination?:TrainingStandardItemSource};measurement:{releaseId:string;contentHash:string;measurementHash:string}}
function fail():never{throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_CONTENT_IDENTITY_MISMATCH')}
/** Immutable provenance only, after the caller's real container/data ACL. This
 * never evaluates a current use grant or changes historical report policy. */
export async function readTrainingStandardContentIdentity(tx:Prisma.TransactionClient,unit:Unit,context:{compositeId:string;ownerId:string}){
 const exact=unit.source.educationBinding?await readEducationMarkerSource(tx,unit.source.educationBinding,{...context,itemId:unit.itemId}):null
 const original=exact?{compositeId:exact.source.id,ownerId:exact.source.createdBy!,itemId:exact.item.id,scaleId:unit.source.id}:{...context,itemId:unit.itemId,scaleId:unit.source.id}
 const stored=decodeTrainingStandardItemSource(unit.source.standardCombination,original)
 const r=stored.reference,source=await readCurrentStandardCombination(tx,r.combination,'HISTORY')
 if(unit.family!=='SCALE'||canonicalHash(unit.measurement)!==canonicalHash(r.measurement)
  ||source.measurement.releaseId!==r.measurement.releaseId||source.measurement.contentHash!==r.measurement.contentHash
  ||source.measurement.content.measurementHash!==r.measurement.measurementHash)fail()
 for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const){
  const part=source.row.snapshot.parts[axis],expected=r.combination.axes[axis]
  if(part.hash!==expected.axisHash||part.version!==expected.version||part.sourceVersion!==expected.sourceVersion)fail()
 }
 return source
}
export async function validateTrainingStandardDerivedContent(tx:Prisma.TransactionClient,unit:Unit,release:StoredRelease,context:{compositeId:string;ownerId:string}){
 const source=await readTrainingStandardContentIdentity(tx,unit,context)
 return assertStandardCombinationDerivedRelease(source.row,source.measurement,release)
}
