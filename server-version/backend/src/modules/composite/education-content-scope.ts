import {Prisma} from '@prisma/client'
import type {StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError,prepareRelease} from '../measurement-content/release'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {TrainingContentSnapshot} from './training-content-binding'

/** This is a frozen content scope check, never participant or manager authority.
 * Only education-scoped private or explicitly bound platform releases enter this adapter. Training consumers
 * keep their existing path without an extra database lookup.
 */
export async function assertEducationRuntimeContentScope(tx:Prisma.TransactionClient,input:{
 compositeId:string;ownerId:string;unit:TrainingContentSnapshot['units'][number];release:StoredRelease
}){
 const {release}=input,scope=release.scope
 function fail():never{const error=new ContentReleaseError('CONTENT_EDUCATION_SCOPE_DENIED');Object.assign(error,{statusCode:409});throw error}
 if(scope.kind!=='PLATFORM'&&(scope.kind!=='PRIVATE'||!['SCHOOL','TEACHER'].includes(scope.product)||scope.resourceId!==input.compositeId||scope.ownerId!==input.ownerId))fail()
 const [identity]=await tx.$queryRaw<Array<{id:string;product:string;organization_id:string}>>(Prisma.sql`
  SELECT id,product,organization_id FROM education_assessment_deliveries WHERE runtime_composite_id=${input.compositeId}`)
 if(!identity||scope.kind!=='PLATFORM'&&identity.product!==scope.product)fail()
 // Lazy import avoids making the legacy snapshot schema depend on its reader.
 const {readEducationAssessmentDeliveryIdentity}=await import('../education-tools/assessment-resource.repository')
 const source=await readEducationAssessmentDeliveryIdentity(tx,{
  resourceKey:`education-assessment:${identity.product}:${identity.organization_id}:${identity.id}`,version:'1.0.0',purpose:'HISTORY'})
 if(source.runtime.id!==input.compositeId||source.runtime.createdBy!==input.ownerId||scope.kind!=='PLATFORM'&&source.origin.product!==scope.product)fail()
 const unit=source.origin.units.find(value=>value.itemId===input.unit.itemId)
 if(!unit||unit.family!==input.unit.family||unit.measurement.releaseId!==input.unit.measurement.releaseId
  ||unit.measurement.contentHash!==input.unit.measurement.contentHash||unit.measurement.measurementHash!==input.unit.measurement.measurementHash)fail()
 const pointer=release.layer==='REPORT'?unit.report:release.layer==='REFERENCE'?unit.references.find(ref=>ref.releaseId===release.releaseId):null
 if(!pointer||pointer.releaseId!==release.releaseId||pointer.contentHash!==release.contentHash)fail()
 const current=source.releases.get(release.releaseId)
 const value=(row:StoredRelease)=>({layer:row.layer,family:row.family,key:row.key,version:row.version,scope:row.scope,assetRefs:row.assetRefs,sourceReleaseId:row.sourceReleaseId,provenance:row.provenance,content:row.content})
 if(!current||current.contentHash!==release.contentHash||current.status!==release.status
  ||prepareRelease(value(release)).contentHash!==release.contentHash||canonicalHash(value(current))!==canonicalHash(value(release)))fail()
 return source
}
