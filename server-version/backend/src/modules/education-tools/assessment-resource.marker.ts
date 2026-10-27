import {z} from 'zod'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {EducationAssessmentSourceError,readEducationAssessmentDeliveryIdentity} from './assessment-resource.repository'
import {assertEducationAssessmentDistributionCurrent} from './assessment-resource.distribution'
const id=z.string().guid()
export const educationMarkerBindingSchema=z.object({schemaVersion:z.literal(1),product:z.enum(['SCHOOL','TEACHER']),organizationId:id,resourceId:id,
 sourceCompositeId:id,sourceItemId:id,runtimeCompositeId:id,runtimeItemId:id,ownerId:id}).strict()
export type EducationMarkerBinding=z.infer<typeof educationMarkerBindingSchema>
/** Discovery only, never authorization. Root's NOWAIT fence prevents an
 * education transaction holding Org/source locks from waiting on account writes.
 * Existing Training validators subsequently reread the exact original proofs. */
export async function prelockEducationStandardSourceActors(tx:Prisma.TransactionClient,ownerId:string,items:Array<{standardCombinationSource?:unknown}>){
 const actors=new Set<string>([ownerId]),grantIds=new Set<string>()
 for(const item of items){
  const marker=item.standardCombinationSource as {reference?:{ownerId?:string;authority?:{issuerId?:string;authorityGrantId?:string}}}|null
  if(marker?.reference?.ownerId)actors.add(marker.reference.ownerId)
  if(marker?.reference?.authority?.issuerId)actors.add(marker.reference.authority.issuerId)
  if(marker?.reference?.authority?.authorityGrantId)grantIds.add(marker.reference.authority.authorityGrantId)
 }
 if(grantIds.size){
  const subjects=await tx.$queryRaw<Array<{subject_id:string}>>(Prisma.sql`SELECT DISTINCT ancestor.subject_id
   FROM content_capability_grants leaf JOIN content_capability_grants ancestor ON ancestor.id=ANY(leaf.ancestry)
   WHERE leaf.id IN (${Prisma.join([...grantIds].sort())}) AND cardinality(leaf.ancestry) BETWEEN 1 AND 2`)
  for(const subject of subjects)actors.add(subject.subject_id)
 }
 const {lockEducationAssessmentUsers}=await import('./assessment-resource.locks')
 await lockEducationAssessmentUsers(tx,[...actors].sort())
}
/** A persisted education binding authenticates the target container; upstream
 * Training/private markers remain original provenance, never target permission. */
export async function readEducationMarkerSource(tx:Prisma.TransactionClient,raw:unknown,context:{compositeId:string;itemId:string;ownerId:string},purpose:'NEW_USE'|'HISTORY'='HISTORY'){
 const b=educationMarkerBindingSchema.parse(raw)
 function fail():never{throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_MARKER_IDENTITY')}
 if(b.runtimeCompositeId!==context.compositeId||b.runtimeItemId!==context.itemId||b.ownerId!==context.ownerId)fail()
 const identity=await readEducationAssessmentDeliveryIdentity(tx,{resourceKey:`education-assessment:${b.product}:${b.organizationId}:${b.resourceId}`,version:'1.0.0',purpose})
 if(identity.origin.sourceCompositeId!==b.sourceCompositeId||identity.runtime.id!==b.runtimeCompositeId||identity.runtime.createdBy!==b.ownerId)fail()
 const target=identity.runtime.items.find(item=>item.id===b.runtimeItemId)
 const targetUnit=(identity.runtime.trainingContentSnapshot as {units:Array<{itemId:string;source:Record<string,unknown>;measurement:unknown}>}).units.find(unit=>unit.itemId===b.runtimeItemId)
 if(!target||!targetUnit||canonicalHash(targetUnit.source.educationBinding)!==canonicalHash(b))fail()
 await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${b.sourceCompositeId} FOR SHARE`)
 const source=await tx.compositeAssessment.findUnique({where:{id:b.sourceCompositeId},include:{questionnaireCourses:true,items:{include:{scale:true}}}})
 if(!source||canonicalHash(source.trainingContentSnapshot)!==identity.origin.sourceSnapshotHash)fail()
 const item=source.items.find(item=>item.id===b.sourceItemId)
 const unit=(source.trainingContentSnapshot as {units:Array<{itemId:string;source:unknown;measurement:unknown}>}|null)?.units.find(unit=>unit.itemId===b.sourceItemId)
 const {educationBinding:_,...originalSource}=targetUnit.source
 if(!item||!unit||item.scaleId!==target.scaleId||canonicalHash(unit.source)!==canonicalHash(originalSource)||canonicalHash(unit.measurement)!==canonicalHash(targetUnit.measurement))fail()
 if(purpose==='NEW_USE')await assertEducationAssessmentDistributionCurrent(tx,identity.origin)
 return {binding:b,source,item,unit,identity}
}
