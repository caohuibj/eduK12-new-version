import {lockEducationDistributionSubjects} from './assessment-resource.locks'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {materialListSchema} from '../assessment-media/material'
import {educationDistributionSchema,type EducationAssessmentOrigin} from './assessment-resource.contract'
import {educationManagementFail as fail} from './assessment-resource.issuer'
import type {StoredRelease} from '../measurement-content/repository'

export const educationDistributionSelectionSchema=z.array(z.object({resourceId:z.string().guid(),grantId:z.string().guid()}).strict()).min(1).max(1000)
type Selection=z.infer<typeof educationDistributionSelectionSchema>
/** Reading a source, owning a runtime, or being product admin grants no right to
 * distribute. Only an explicit grant in the TARGET product/organization does.
 * Pinned proofs never discover replacement grants after revocation. */
export async function assertEducationAssessmentDistribution(tx:Prisma.TransactionClient,input:{
 product:'SCHOOL'|'TEACHER';organizationId:string;actorId:string;resourceIds:string[];selection:Selection;
 pinned?:z.infer<typeof educationDistributionSchema>;
}){
 const expected=[...new Set(input.resourceIds)].sort(),selection=educationDistributionSelectionSchema.parse(input.selection)
 if(new Set(selection.map(s=>s.resourceId)).size!==selection.length||selection.length!==expected.length
  ||selection.some(s=>!expected.includes(s.resourceId)))fail('EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION',403)
 if(input.pinned&&(input.pinned.actorId!==input.actorId||input.pinned.grants.length!==expected.length))fail('EDUCATION_ASSESSMENT_DISTRIBUTION_CHANGED',403)
 await lockEducationDistributionSubjects(tx,selection.map(value=>value.grantId))
 const grants=[]
 for(const selected of [...selection].sort((a,b)=>a.grantId.localeCompare(b.grantId)||a.resourceId.localeCompare(b.resourceId))){
  const authority=await assertContentAuthority(tx,{actorId:input.actorId,grantId:selected.grantId,capability:'material.distribute',
   scope:{product:input.product,scopeKind:'ORGANIZATION',scopeId:input.organizationId,resourceKind:'material',resourceKeys:[selected.resourceId]}})
  const pinned=input.pinned?.grants.find(grant=>grant.resourceId===selected.resourceId)
  if(input.pinned&&(!pinned||pinned.grantId!==authority.grantId||pinned.version!==authority.version))fail('EDUCATION_ASSESSMENT_DISTRIBUTION_CHANGED',403)
  grants.push({resourceId:selected.resourceId,...authority})
 }
 return educationDistributionSchema.parse({actorId:input.actorId,grants:grants.sort((a,b)=>a.resourceId.localeCompare(b.resourceId))})
}
/** Root's NEW_USE/START integration must call this within its transaction after
 * validating the identity. Historical FINAL reads deliberately do not call it. */
export function assertEducationAssessmentDistributionCurrent(tx:Prisma.TransactionClient,origin:Pick<EducationAssessmentOrigin,'product'|'organizationId'|'distribution'>&{
 sourceCompositeId?:string;units?:EducationAssessmentOrigin['units'];
}){
 const pinned=educationDistributionSchema.parse(origin.distribution)
 const required=[...(origin.sourceCompositeId?[origin.sourceCompositeId]:[]),...(origin.units??[]).flatMap(unit=>[
  unit.measurement.releaseId,...unit.references.map(reference=>reference.releaseId),...(unit.report?[unit.report.releaseId]:[])])]
 if(required.some(resourceId=>!pinned.grants.some(grant=>grant.resourceId===resourceId)))fail('EDUCATION_ASSESSMENT_DISTRIBUTION_SELECTION',403)
 return assertEducationAssessmentDistribution(tx,{...origin,actorId:pinned.actorId,resourceIds:pinned.grants.map(g=>g.resourceId),
  selection:pinned.grants.map(({resourceId,grantId})=>({resourceId,grantId})),pinned})
}
export function educationAssessmentAssets(composite:{items:Array<{formDefinition:unknown}>},releases:Iterable<StoredRelease>){
 const assets=new Map<string,{assetId:string;sha256:string;mediaType:string}>()
 const add=(asset:{assetId:string;sha256:string;mediaType:string})=>{
  const prior=assets.get(asset.assetId)
  if(prior&&(prior.sha256!==asset.sha256||prior.mediaType!==asset.mediaType))fail('EDUCATION_ASSESSMENT_ASSET_IDENTITY')
  assets.set(asset.assetId,asset)
 }
 for(const release of releases)for(const asset of release.assetRefs)add(asset)
 for(const item of composite.items){
  const definition=item.formDefinition as {materials?:unknown;image?:{asset:{assetId:string;contentHash:string;mimeType:string};rightsStatus:string;rightsNote:string}}|null
  for(const material of materialListSchema.optional().parse(definition?.materials)??[]){
   if(material.rightsStatus==='unknown'||!material.rightsNote.trim())fail('EDUCATION_ASSESSMENT_MATERIAL_RIGHTS_REQUIRED',403)
   add({assetId:material.asset.assetId,sha256:material.asset.contentHash,mediaType:material.asset.mimeType})
  }
  if(definition?.image){
   if(definition.image.rightsStatus==='unknown'||!definition.image.rightsNote?.trim())fail('EDUCATION_ASSESSMENT_MATERIAL_RIGHTS_REQUIRED',403)
   add({assetId:definition.image.asset.assetId,sha256:definition.image.asset.contentHash,mediaType:definition.image.asset.mimeType})
  }
 }
 if(assets.size>128)fail('EDUCATION_ASSESSMENT_ASSET_LIMIT')
 return [...assets.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId))
}
export async function assertEducationAssessmentAssets(tx:Prisma.TransactionClient,assets:ReturnType<typeof educationAssessmentAssets>){
 for(const asset of assets){
  const [row]=await tx.$queryRaw<Array<{sha256:string;mime_type:string;size_bytes:number}>>(Prisma.sql`
   SELECT sha256,mime_type,size_bytes FROM stored_assets WHERE id=${asset.assetId} AND deleted_at IS NULL FOR SHARE`)
  if(!row||row.sha256!==asset.sha256||row.mime_type!==asset.mediaType||row.size_bytes<=0)fail('EDUCATION_ASSESSMENT_ASSET_UNAVAILABLE',403)
 }
}
