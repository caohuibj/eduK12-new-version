import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {hashScaleDefinition} from '../scale/scale-definition'
import {prepareTrainingContentSnapshot,trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {readLibraryScaleMeasurementSource} from './training-source'
import {readFrozenEducationApplicability,type EducationApplicabilityVariant} from './education-applicability'
import {isSupportedEducationLibraryVariant} from './education-supported-variants'
import {educationLibraryOriginSchema,educationLibraryResourceEntry,educationLibraryResourceKey,
  type EducationLibraryOrigin,type EducationLibraryResourceEntry} from './education-runtime-entry'
import {assertLibraryAuthority} from './authority'
import {loadEntry} from './service'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
import {readEducationLibraryUse,educationLibraryUseInput} from './education-use'
import {educationLibraryEntry,educationLibraryProduct,fail,type EducationLibraryProduct} from './contracts'

const sourceInput=z.object({product:educationLibraryProduct,resourceKey:z.string().min(1).max(240),
  resourceVersion:z.literal('1.0.0'),purpose:z.enum(['NEW_USE','EXISTING_EXECUTION','HISTORY'])}).strict()
type ResourceRow={id:string;resource_key:string;resource_version:string;scale_id:string;definition_hash:string;
  composite_id:string;entry:EducationLibraryResourceEntry;entry_hash:string;status:string}

/** Runtime allocation projection only. Never rewrite the approved declaration
 * or its contract hash; unsupported approved pairs may be adapted in the future. */
export function runnableEducationLibraryVariants(product:EducationLibraryProduct,variants:readonly EducationApplicabilityVariant[]){
  const runnable=variants.filter(variant=>isSupportedEducationLibraryVariant(product,variant.variantKey))
  if(!runnable.length)fail('EDUCATION_LIBRARY_VARIANT_UNSUPPORTED')
  return runnable
}

export async function assertEducationLibraryReadCommitted(tx:Prisma.TransactionClient){
  const [row]=await tx.$queryRaw<Array<{isolation:string}>>`SELECT current_setting('transaction_isolation') AS isolation`
  if(row?.isolation!=='read committed')fail('EDUCATION_LIBRARY_READ_COMMITTED_REQUIRED')
}
/** Acquire only after the selected issuer/authority chain is already held.
 * Account mutation takes user UPDATE before org UPDATE. Never add a new issuer
 * user SHARE after taking this organization lock. Target/member checks are
 * current query-time checks, not extra account locks.
 */
export async function lockEducationLibraryOrganization(tx:Prisma.TransactionClient,organizationId:string,product:EducationLibraryOrigin['product']){
  z.string().uuid().parse(organizationId);educationLibraryProduct.parse(product)
  const [org]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM organizations
    WHERE id=${organizationId} AND product_domain='SCHOOL' AND status='ACTIVE' FOR UPDATE`)
  if(!org)fail('EDUCATION_LIBRARY_ORGANIZATION_UNAVAILABLE',403)
  const rows=await tx.$queryRaw<Array<{organization_id:string}>>(Prisma.sql`SELECT organization_id FROM education_product_entitlements
    WHERE organization_id=${organizationId} AND product=${educationLibraryEntry[product]} AND status='ACTIVE' FOR SHARE`)
  if(!rows.length)fail('EDUCATION_LIBRARY_PRODUCT_UNAVAILABLE',403)
}

/** Exact immutable identity only. HISTORY does not require a new-use grant or
 * treat collection stop as deletion of an existing report. The caller supplies
 * the persisted execution ref and independently establishes current task/report
 * authority. A respondent never needs to own a publisher's library grant.
 */
export async function readEducationLibraryRegisteredSource(tx:Prisma.TransactionClient,raw:{product:EducationLibraryOrigin['product'];resourceKey:string;resourceVersion:string;purpose:'NEW_USE'|'EXISTING_EXECUTION'|'HISTORY'}){
  const input=sourceInput.parse(raw)
  const [row]=await tx.$queryRaw<ResourceRow[]>(Prisma.sql`SELECT * FROM registered_assessment_resources
    WHERE resource_key=${input.resourceKey} AND resource_version=${input.resourceVersion} FOR SHARE`)
  if(!row||row.status!=='PUBLISHED'||canonicalHash(row.entry)!==row.entry_hash)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const origin=educationLibraryOriginSchema.parse(row.entry.libraryOrigin)
  if(origin.product!==input.product||educationLibraryResourceKey(origin)!==input.resourceKey||origin.adapterVersion!==input.resourceVersion)
    fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const {entry,submission}=await loadEntry(tx,origin.entryId)
  const applicability=readFrozenEducationApplicability(submission.snapshot)
  const variant=applicability?.variants.find(v=>v.variantKey===origin.variantKey)
  if(!applicability||!variant||submission.status!=='APPROVED'||entry.release_id!==origin.releaseId||entry.content_hash!==origin.contentHash
    ||submission.snapshot_hash!==origin.approvedSnapshotHash||applicability.contractHash!==origin.applicabilityHash
    ||canonicalHash(submission.snapshot.compiledDefinition)!==origin.sourceDefinitionHash||submission.dependency_release_ids.length!==origin.dependencies.length)
    fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  for(const dependency of origin.dependencies){
    const release=await getContentRelease(tx,dependency.releaseId,true)
    if(!submission.dependency_release_ids.includes(dependency.releaseId)||!release||release.contentHash!==dependency.contentHash)
      fail('EDUCATION_LIBRARY_DEPENDENCY_IDENTITY_MISMATCH')
  }
  await tx.$queryRaw(Prisma.sql`SELECT id FROM scales WHERE id=${row.scale_id} FOR SHARE`)
  const scale=await tx.scale.findUnique({where:{id:row.scale_id}})
  if(!scale||scale.libraryEntryId!==entry.id||scale.definitionHash!==row.definition_hash)fail('EDUCATION_LIBRARY_WRAPPER_IDENTITY_MISMATCH')
  const source=await readLibraryScaleMeasurementSource(tx,scale,input.purpose==='NEW_USE'?'NEW_USE':'FROZEN_IDENTITY')
  if(source.release.releaseId!==origin.releaseId||source.release.contentHash!==origin.contentHash)fail('EDUCATION_LIBRARY_EXACT_VERSION_MISMATCH')
  if(input.purpose!=='HISTORY')await assertScaleLibraryCollectionAllowed(tx,[origin.releaseId])
  await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${row.composite_id} FOR SHARE`)
  const composite=await tx.compositeAssessment.findUnique({where:{id:row.composite_id},include:{items:true}})
  if(!composite||composite.productKind!=='ORGANIZATION_RESOURCE'||composite.publicEnabled||composite.status!=='PUBLISHED'
    ||composite.items.length!==1||composite.items[0].type!=='SCALE'||composite.items[0].scaleId!==scale.id
    ||!composite.trainingContentSnapshotHash||canonicalHash(composite.trainingContentSnapshot)!==composite.trainingContentSnapshotHash)
    fail('EDUCATION_LIBRARY_COMPOSITE_IDENTITY_MISMATCH')
  const snapshot=trainingContentSnapshotSchema.parse(composite.trainingContentSnapshot),unit=snapshot.units[0]
  if(snapshot.compositeId!==composite.id||snapshot.units.length!==1||unit.itemId!==composite.items[0].id||unit.family!=='SCALE'
    ||unit.source.kind!=='SCALE'||unit.source.id!==scale.id||unit.source.libraryEntryId!==entry.id||unit.source.ownerId!==scale.creatorId
    ||unit.measurement.releaseId!==origin.releaseId||unit.measurement.contentHash!==origin.contentHash
    ||unit.measurement.measurementHash!==source.release.content.measurementHash||unit.report!==undefined||unit.referencePolicy!==undefined)
    fail('EDUCATION_LIBRARY_COMPOSITE_IDENTITY_MISMATCH')
  const expected=educationLibraryResourceEntry({origin,variant,title:submission.snapshot.title,definition:source.definition,compositeId:composite.id})
  if(canonicalHash(expected)!==row.entry_hash)fail('EDUCATION_LIBRARY_REGISTERED_POLICY_MISMATCH')
  return {...origin,scaleId:scale.id,compositeId:composite.id,compositeItemId:composite.items[0].id,
    resultDisclosure:expected.resultDisclosure!,resourceEntry:expected,libraryStatus:entry.status,identityOnly:true as const}
}

/** Publication authority, never a report-reader token. Caller supplies its
 * server-owned context. Must be called BEFORE the caller takes any org lock;
 */
export async function assertEducationLibraryRegisteredUse(tx:Prisma.TransactionClient,input:{
  product:EducationLibraryOrigin['product'];organizationId:string;actorId:string;resourceKey:string;resourceVersion:'1.0.0';
}){
  await assertEducationLibraryReadCommitted(tx)
  const [header]=await tx.$queryRaw<Array<{origin:unknown}>>(Prisma.sql`SELECT entry->'libraryOrigin' AS origin FROM registered_assessment_resources
    WHERE resource_key=${input.resourceKey} AND resource_version=${input.resourceVersion}`)
  if(!header)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const origin=educationLibraryOriginSchema.parse(header.origin)
  if(origin.product!==input.product||educationLibraryResourceKey(origin)!==input.resourceKey)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const context=educationLibraryUseInput.parse({product:input.product,organizationId:input.organizationId,actorId:input.actorId,
    entryId:origin.entryId,releaseId:origin.releaseId,contentHash:origin.contentHash})
  // Preselect and lock one valid grant/issuer chain BEFORE org UPDATE. The
  // second read may not switch to a newly inserted issuer while holding org.
  const selected=await readEducationLibraryUse(tx,context)
  await lockEducationLibraryOrganization(tx,input.organizationId,input.product)
  const authority=await readEducationLibraryUse(tx,context,{onlyGrantId:selected.grantId})
  const source=await readEducationLibraryRegisteredSource(tx,{product:input.product,resourceKey:input.resourceKey,resourceVersion:input.resourceVersion,purpose:'NEW_USE'})
  return {source,authority}
}

/** INTERNAL ONLY until the actual runtime/media/report lane is connected.
 * Must run in the same transaction as the target-scoped grant INSERT.
 */
export async function prepareEducationLibraryResources(tx:Prisma.TransactionClient,input:{
  actorId:string;organizationId:string;entryId:string;product:EducationLibraryOrigin['product'];grantId?:string;expectedGrantVersion?:number;
}){
  await assertEducationLibraryReadCommitted(tx)
  const [header]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${input.entryId}`)
  if(!header)fail('共用库条目不存在',404)
  const authority=await assertLibraryAuthority(tx,input.actorId,header.release_id,'material.distribute',input.product,input.grantId)
  if(input.expectedGrantVersion!==undefined&&authority.version!==input.expectedGrantVersion)fail('平台授权已变化')
  await lockEducationLibraryOrganization(tx,input.organizationId,input.product)
  const {entry,submission}=await loadEntry(tx,input.entryId)
  const applicability=readFrozenEducationApplicability(submission.snapshot)
  if(!applicability)fail('EDUCATION_LIBRARY_APPLICABILITY_REQUIRED')
  if(submission.status!=='APPROVED'||entry.status!=='ACTIVE')fail('EDUCATION_LIBRARY_ENTRY_UNAVAILABLE')
  const runnableVariants=runnableEducationLibraryVariants(input.product,applicability.variants)
  const release=await getContentRelease(tx,entry.release_id,true)
  if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED')fail('EDUCATION_LIBRARY_RELEASE_UNAVAILABLE')
  const dependencies:EducationLibraryOrigin['dependencies']=[]
  for(const id of [...submission.dependency_release_ids].sort()){
    const dep=await getContentRelease(tx,id,true)
    if(!dep)fail('EDUCATION_LIBRARY_DEPENDENCY_IDENTITY_MISMATCH')
    dependencies.push({releaseId:id,contentHash:dep.contentHash})
  }
  if(dependencies.length)fail('EDUCATION_LIBRARY_DEPENDENCY_ADAPTER_NOT_READY')
  await assertScaleLibraryCollectionAllowed(tx,[release.releaseId])
  // Same global per-entry lock as Training; prevents cross-org duplicate wrappers.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'library-wrapper:'+entry.id}))`)
  let scale=await tx.scale.findUnique({where:{libraryEntryId:entry.id}})
  const definition=submission.snapshot.compiledDefinition
  if(!scale)scale=await tx.scale.create({data:{id:randomUUID(),code:'library:'+entry.id,name:submission.snapshot.title,
    description:'平台共用库精确版本，只读使用',status:'PUBLISHED',visibility:'COURSE',creatorId:submission.author_id,
    instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:release.content.instrumentVersion,definition:definition as unknown as Prisma.InputJsonValue,
    definitionHash:hashScaleDefinition(definition),itemCount:definition.items.length,dimensionCount:definition.scoring.scores.length,
    measurementReleaseId:release.releaseId,libraryEntryId:entry.id}})
  await readLibraryScaleMeasurementSource(tx,scale,'NEW_USE')
  const resources=[]
  for(const variant of runnableVariants){
    const origin:EducationLibraryOrigin={schemaVersion:1,adapterVersion:'1.0.0',entryId:entry.id,product:input.product,
      releaseId:release.releaseId,contentHash:release.contentHash,approvedSnapshotHash:submission.snapshot_hash,
      sourceDefinitionHash:canonicalHash(definition),applicabilityHash:applicability.contractHash,variantKey:variant.variantKey as EducationLibraryOrigin['variantKey'],dependencies}
    const key=educationLibraryResourceKey(origin)
    const [prior]=await tx.$queryRaw<ResourceRow[]>(Prisma.sql`SELECT * FROM registered_assessment_resources WHERE resource_key=${key} AND resource_version=${origin.adapterVersion} FOR SHARE`)
    if(prior){
      const verified=await readEducationLibraryRegisteredSource(tx,{product:input.product,resourceKey:key,resourceVersion:origin.adapterVersion,purpose:'NEW_USE'})
      if(canonicalHash(prior.entry.libraryOrigin)!==canonicalHash(origin))fail('EDUCATION_LIBRARY_REGISTERED_ORIGIN_CONFLICT')
      resources.push(verified);continue
    }
    const composite=await tx.compositeAssessment.create({data:{code:'org-library-resource-'+randomUUID(),name:submission.snapshot.title,
      instruction:scale.instruction,createdBy:input.actorId,productKind:'ORGANIZATION_RESOURCE',publicEnabled:false,
      items:{create:{type:'SCALE',position:0,required:true,scaleId:scale.id}}},include:{items:{include:{scale:true}}}})
    const content=await prepareTrainingContentSnapshot(tx,composite,new Map())
    await tx.compositeAssessment.update({where:{id:composite.id},data:{status:'PUBLISHED',publishedAt:new Date(),
      trainingContentSnapshot:content.snapshot as unknown as Prisma.InputJsonValue,trainingContentSnapshotHash:content.snapshotHash}})
    const resource=educationLibraryResourceEntry({origin,variant,title:submission.snapshot.title,definition,compositeId:composite.id})
    await tx.$executeRaw(Prisma.sql`INSERT INTO registered_assessment_resources
      (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,status,created_by_user_id,published_by_user_id,published_at)
      VALUES(${randomUUID()},${key},${origin.adapterVersion},${scale.id},${scale.definitionHash},${composite.id},${JSON.stringify(resource)}::jsonb,
        ${canonicalHash(resource)},'PUBLISHED',${input.actorId},${input.actorId},clock_timestamp())`)
    resources.push(await readEducationLibraryRegisteredSource(tx,{product:input.product,resourceKey:key,resourceVersion:origin.adapterVersion,purpose:'NEW_USE'}))
  }
  return {resources,authority,submissionId:submission.id}
}
