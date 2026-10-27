import {decodeTrainingStandardItemSource} from '../composite/training-standard-combination'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertStandardCombinationDerivedRelease} from '../measurement-content/standard-combination-content'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {buildTrainingFlowUnits} from '../composite/training-flow-definition'
import {trainingContentSnapshotSchema,type TrainingContentSnapshot} from '../composite/training-content-binding'
import {trainingReferenceSelectionSchema} from '../composite/training-reference-selection'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {resolveFormalReferenceRelease} from '../measurement-content/formal-reference-resolver'
import {DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import {validateReferenceSetDefinition,type AssessmentReferenceEntry} from '../assessment-reference/reference'
import {draftEducationAssessmentEntry,educationAssessmentOriginSchema,educationDeliveryAuthoritySchema,educationDistributionSchema} from './assessment-resource.contract'
import {readEducationAssessmentDeliveryIdentity} from './assessment-resource.repository'
import {educationManagementFail as fail,captureEducationAssessmentIssuer,lockEducationAssessmentOrganization,retainEducationAssessmentIssuers,type EducationAssessmentContext} from './assessment-resource.issuer'
import {educationDistributionSelectionSchema,assertEducationAssessmentDistribution,assertEducationAssessmentDistributionCurrent,educationAssessmentAssets,assertEducationAssessmentAssets} from './assessment-resource.distribution'
import {educationCompositeInclude,lockEducationAssessmentSourceIdentities,readEducationAssessmentSource} from './assessment-resource.source'

type Tx=Prisma.TransactionClient
const uuid=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const prepareEducationAssessmentSchema=z.object({resourceId:uuid,sourceCompositeId:uuid,title:z.string().trim().min(1).max(200),family:z.enum(['COGNITIVE','SITUATIONAL','BUNDLE']),licenses:educationDistributionSelectionSchema}).strict()
export const registerEducationAssessmentSchema=z.object({expectedPreparationHash:hash,disclosure:z.unknown(),references:trainingReferenceSelectionSchema,
 reports:z.array(z.object({itemId:uuid,releaseId:uuid}).strict()).max(1000),licenses:educationDistributionSelectionSchema}).strict()
export const transitionEducationAssessmentSchema=z.object({expectedEntryHash:hash,reason:z.string().trim().min(1).max(500)}).strict()
const preparationSchema=z.object({schemaVersion:z.literal(1),resourceId:uuid,product:z.enum(['SCHOOL','TEACHER']),organizationId:uuid,
 family:z.enum(['COGNITIVE','SITUATIONAL','BUNDLE']),sourceCompositeId:uuid,sourceSnapshotHash:hash,sourceDefinitionHash:hash,runtimeCompositeId:uuid,
 runtimeSnapshotHash:hash,runtimeDefinitionHash:hash,snapshot:trainingContentSnapshotSchema,title:z.string(),createdAuthority:educationDeliveryAuthoritySchema,distribution:educationDistributionSchema}).strict()
type Preparation=z.infer<typeof preparationSchema>
type Row={id:string;entry:Record<string,unknown>;entry_hash:string;status:string;created_by_user_id:string;created_authority:unknown;reviewed_by_user_id:string|null;reviewed_authority:unknown;published_authority:unknown}
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
const transaction=<T>(fn:(tx:Tx)=>Promise<T>)=>prisma.$transaction(fn,options)
const key=(c:Pick<EducationAssessmentContext,'product'|'organizationId'>,id:string)=>`education-assessment:${c.product}:${c.organizationId}:${id}`
async function event(tx:Tx,c:EducationAssessmentContext,resourceId:string,action:string,metadata:unknown,id:string=randomUUID()){
 await tx.assessmentManagementEvent.create({data:{id,actorId:c.principal.userId,resourceId,action,metadata:metadata as Prisma.InputJsonValue}})
}
async function findPreparation(tx:Tx,c:EducationAssessmentContext,id:string){
 const record=await tx.assessmentManagementEvent.findUnique({where:{id}})
 if(!record||record.action!=='EDUCATION_ASSESSMENT_PREPARED')fail('EDUCATION_ASSESSMENT_PREPARATION_NOT_FOUND',404)
 const preparation=preparationSchema.parse(record.metadata)
 if(preparation.resourceId!==id||preparation.product!==c.product||preparation.organizationId!==c.organizationId
  ||record.resourceId!==preparation.runtimeCompositeId||record.actorId!==preparation.createdAuthority.actorId)fail('EDUCATION_ASSESSMENT_PREPARATION_NOT_FOUND',404)
 return preparation
}
async function readRuntime(tx:Tx,c:EducationAssessmentContext,p:Preparation,lock=true){
 if(lock)await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${p.runtimeCompositeId} FOR UPDATE`)
 const runtime=await tx.compositeAssessment.findUnique({where:{id:p.runtimeCompositeId},include:educationCompositeInclude})
 if(!runtime||runtime.productKind!=='ORGANIZATION_RESOURCE'||runtime.creationKey!==key(c,p.resourceId)||runtime.creationHash!==canonicalHash(p)
  ||runtime.createdBy!==p.createdAuthority.actorId||runtime.courseId!==null||runtime.publicEnabled||runtime.copyable
  ||canonicalHash(buildTrainingFlowUnits(runtime))!==p.runtimeDefinitionHash)fail('EDUCATION_ASSESSMENT_PREPARATION_CHANGED')
 return runtime
}
async function boundary(tx:Tx,c:EducationAssessmentContext,sourceId:string,proofs:z.infer<typeof educationDeliveryAuthoritySchema>[]=[]){
 const identities=await lockEducationAssessmentSourceIdentities(tx,sourceId)
 await lockEducationAssessmentOrganization(tx,c)
 await retainEducationAssessmentIssuers(tx,c,proofs)
 const actor=await captureEducationAssessmentIssuer(tx,c)
 return {identities,actor}
}
function projection(p:Preparation){return {resourceId:p.resourceId,product:p.product,organizationId:p.organizationId,family:p.family,
 sourceCompositeId:p.sourceCompositeId,runtimeCompositeId:p.runtimeCompositeId,preparationHash:canonicalHash(p),title:p.title}}
/** Stage 1 has an editable runtime identity but no delivery metadata/publication.
 * Only immutable tool definitions/references are copied, never participant data. */
export async function prepareEducationAssessment(c:EducationAssessmentContext,raw:unknown){
 const input=prepareEducationAssessmentSchema.parse(raw)
 return transaction(async tx=>{
  const {identities,actor}=await boundary(tx,c,input.sourceCompositeId)
  const prior=await tx.assessmentManagementEvent.findUnique({where:{id:input.resourceId}})
  if(prior){
   const p=await findPreparation(tx,c,input.resourceId)
   if(p.createdAuthority.actorId!==c.principal.userId||p.sourceCompositeId!==input.sourceCompositeId||p.title!==input.title||p.family!==input.family
    ||canonicalHash(p.distribution.grants.map(({resourceId,grantId})=>({resourceId,grantId})))!==canonicalHash([...input.licenses].sort((a,b)=>a.resourceId.localeCompare(b.resourceId))))fail('EDUCATION_ASSESSMENT_REQUEST_CONFLICT')
   await retainEducationAssessmentIssuers(tx,c,[p.createdAuthority])
   await assertEducationAssessmentDistributionCurrent(tx,p)
   const runtime=await readRuntime(tx,c,p)
   return {...projection(p),created:false,units:p.snapshot.units.map(unit=>({itemId:unit.itemId,family:unit.family,measurement:unit.measurement})),canPublish:false}
  }
  const {source,content}=await readEducationAssessmentSource(tx,input.sourceCompositeId,identities,c.product)
  for(const unit of content.snapshot.units)if(unit.source.privateVersionId){
   const version=await tx.educationPrivateToolVersion.findUnique({where:{id:unit.source.privateVersionId}})
   if(!version||version.entry!==c.product||version.organizationId!==c.organizationId||version.ownerUserId!==c.principal.userId)fail('EDUCATION_ASSESSMENT_PRIVATE_OWNER_REQUIRED',403)
  }
  const assets=educationAssessmentAssets(source,content.releases.values())
  await assertEducationAssessmentAssets(tx,assets)
  const distribution=await assertEducationAssessmentDistribution(tx,{...c,actorId:c.principal.userId,selection:input.licenses,
   resourceIds:[source.id,...content.snapshot.units.map(unit=>unit.measurement.releaseId),...assets.map(asset=>asset.assetId)]})
  if(input.family!=='BUNDLE'&&(content.snapshot.units.length!==1||source.items.some(item=>item.type==='FORM')
   ||content.snapshot.units[0].family!==(input.family==='COGNITIVE'?'COGNITIVE':'SJT')))fail('EDUCATION_ASSESSMENT_FAMILY_MISMATCH')
  const runtimeId=randomUUID(),items=new Map(source.items.map(item=>[item.id,randomUUID()])),sections=new Map(source.formSections.map(section=>[section.id,randomUUID()]))
  const runtime=await tx.compositeAssessment.create({data:{id:runtimeId,code:'education-assessment-'+input.resourceId,name:input.title,
   instruction:source.instruction,createdBy:c.principal.userId,productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false,
   creationKey:key(c,input.resourceId),formSections:{create:source.formSections.map(section=>({id:sections.get(section.id)!,title:section.title,description:section.description,position:section.position,contextSection:section.contextSection}))},
   items:{create:source.items.map(item=>({id:items.get(item.id)!,type:item.type,position:item.position,required:item.required,scaleId:item.scaleId,
    cognitiveAssignmentId:item.cognitiveAssignmentId,situationalInstrumentKey:item.situationalInstrumentKey,situationalInstrumentVersion:item.situationalInstrumentVersion,
    formType:item.formType,formLabel:item.formLabel,formPlaceholder:item.formPlaceholder,formOptions:item.formOptions??Prisma.DbNull,formPolicy:item.formPolicy??Prisma.DbNull,
    formDefinition:item.formDefinition??Prisma.DbNull,contextKey:item.contextKey,formSectionId:item.formSectionId?sections.get(item.formSectionId)!:null,
    formSectionPosition:item.formSectionPosition,standardCombinationSource:item.standardCombinationSource??Prisma.DbNull}))}},include:educationCompositeInclude})
  const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:runtime.id,units:content.snapshot.units.map(unit=>({itemId:items.get(unit.itemId)!,family:unit.family,source:{...unit.source,...(unit.source.standardCombination||unit.source.privateVersionId?{educationBinding:{schemaVersion:1,product:c.product,organizationId:c.organizationId,resourceId:input.resourceId,sourceCompositeId:source.id,sourceItemId:unit.itemId,runtimeCompositeId:runtime.id,runtimeItemId:items.get(unit.itemId)!,ownerId:c.principal.userId}}:{})},measurement:unit.measurement}))})
  const p=preparationSchema.parse({schemaVersion:1,resourceId:input.resourceId,...{product:c.product,organizationId:c.organizationId},family:input.family,sourceCompositeId:source.id,
   sourceSnapshotHash:canonicalHash(source.trainingContentSnapshot),sourceDefinitionHash:canonicalHash(buildTrainingFlowUnits(source)),runtimeCompositeId:runtime.id,
   runtimeSnapshotHash:canonicalHash(snapshot),runtimeDefinitionHash:canonicalHash(buildTrainingFlowUnits(runtime)),snapshot,title:input.title,createdAuthority:actor,distribution})
  await content.recheckSourceLicenses()
  await retainEducationAssessmentIssuers(tx,c,[actor]);await captureEducationAssessmentIssuer(tx,c)
  await assertEducationAssessmentDistribution(tx,{...c,actorId:c.principal.userId,selection:input.licenses,
   resourceIds:distribution.grants.map(grant=>grant.resourceId),pinned:distribution})
  // Existing DB guard freezes the first non-null snapshot even in DRAFT. Keep
  // the preparation candidate in its hash-bound management event; write the
  // runtime C/P/R snapshot exactly once, at registration after P/R selection.
  await tx.compositeAssessment.update({where:{id:runtime.id},data:{creationHash:canonicalHash(p)}})
  await event(tx,c,runtime.id,'EDUCATION_ASSESSMENT_PREPARED',p,input.resourceId)
  return {...projection(p),created:true,units:snapshot.units.map(unit=>({itemId:unit.itemId,family:unit.family,measurement:unit.measurement})),canPublish:false}
 })
}
export async function readEducationAssessmentPreparation(c:EducationAssessmentContext,id:string){
 uuid.parse(id)
 return transaction(async tx=>{
  const p=await findPreparation(tx,c,id)
  await boundary(tx,c,p.sourceCompositeId,[p.createdAuthority])
  if(p.createdAuthority.actorId!==c.principal.userId)fail('EDUCATION_ASSESSMENT_PREPARATION_OWNER_REQUIRED',403)
  await assertEducationAssessmentDistributionCurrent(tx,p)
  const runtime=await readRuntime(tx,c,p)
  return {...projection(p),units:p.snapshot.units.map(unit=>({itemId:unit.itemId,family:unit.family,measurement:unit.measurement})),canPublish:false}
 })
}
async function selectedContent(tx:Tx,c:EducationAssessmentContext,p:Preparation,snapshot:TrainingContentSnapshot,input:z.infer<typeof registerEducationAssessmentSchema>){
 if(new Set(input.reports.map(item=>item.itemId)).size!==input.reports.length)fail('EDUCATION_ASSESSMENT_REPORT_DUPLICATE')
 const ids=[...new Set(snapshot.units.flatMap(unit=>[unit.measurement.releaseId,
  ...(input.references.units.find(selected=>selected.itemId===unit.itemId)?.choices.map(choice=>choice.releaseId)??[]),
  ...input.reports.filter(selected=>selected.itemId===unit.itemId).map(selected=>selected.releaseId)]))]
 const releases=await getContentReleaseBatch(tx,ids,true)
 if(releases.size!==ids.length||[...releases.values()].some(release=>release.status!=='PUBLISHED'))fail('EDUCATION_ASSESSMENT_CONTENT_UNAVAILABLE')
 if([...input.references.units,...input.reports].some(selected=>!snapshot.units.some(unit=>unit.itemId===selected.itemId)))fail('EDUCATION_ASSESSMENT_UNKNOWN_UNIT')
 const units=[]
 for(const unit of snapshot.units){
  const measurement=releases.get(unit.measurement.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!==unit.family||measurement.contentHash!==unit.measurement.contentHash)fail('EDUCATION_ASSESSMENT_MEASUREMENT_CHANGED')
  const choices=[]
  for(const selected of input.references.units.find(value=>value.itemId===unit.itemId)?.choices??[]){
   const reference=releases.get(selected.releaseId)
   if(!reference||reference.layer!=='REFERENCE'||reference.family!==unit.family||reference.content.measurement.releaseId!==measurement.releaseId
    ||reference.content.measurement.contentHash!==measurement.contentHash)fail('EDUCATION_ASSESSMENT_REFERENCE_MISMATCH')
   if(reference.scope.kind==='PLATFORM'&&unit.source.standardCombination){
    const marker=decodeTrainingStandardItemSource(unit.source.standardCombination)
    const exact=await readCurrentStandardCombination(tx,marker.reference.combination)
    if(exact.measurement.releaseId!==unit.measurement.releaseId||exact.measurement.contentHash!==unit.measurement.contentHash)fail('EDUCATION_ASSESSMENT_REFERENCE_MISMATCH')
    assertStandardCombinationDerivedRelease(exact.row,exact.measurement,reference)
   }else if(reference.scope.kind==='PLATFORM')await resolveFormalReferenceRelease(tx,{releaseId:reference.releaseId,contentHash:reference.contentHash,measurementReleaseId:measurement.releaseId,purpose:'NEW_BINDING'},reference)
   else if(reference.scope.product!==c.product||reference.scope.ownerId!==p.createdAuthority.actorId||reference.scope.resourceId!==p.runtimeCompositeId)fail('EDUCATION_ASSESSMENT_REFERENCE_SCOPE',403)
   const checked=validateReferenceSetDefinition({schemaVersion:1,instrumentType:unit.family==='COGNITIVE'?'cognitive':unit.family==='SCALE'?'scale':'sjt',
    instrumentKey:measurement.key,referenceVersion:reference.version,status:'ACTIVE',entries:reference.content.entries.map(entry=>entry.definition)})
   if(!checked.definition||checked.issues.some(issue=>issue.severity==='error'))fail('EDUCATION_ASSESSMENT_REFERENCE_DEFINITION')
   const entries=reference.content.entries.filter(entry=>referenceEntryKey(entry.definition as unknown as AssessmentReferenceEntry)===selected.entryKey)
   if(entries.length!==1||entries[0].metricKey!==(entries[0].definition as unknown as AssessmentReferenceEntry).scoreKey
    ||entries[0].referenceKind!==(entries[0].definition as unknown as AssessmentReferenceEntry).referenceKind||!measurement.content.metrics.some(metric=>metric.metricKey===entries[0].metricKey))fail('EDUCATION_ASSESSMENT_REFERENCE_ENTRY')
   const definition=entries[0].definition as unknown as AssessmentReferenceEntry
   if(definition.instrumentVersion!==measurement.content.instrumentVersion||definition.scoringVersion!==measurement.content.scoringVersion
    ||definition.governance&&definition.governance.measurementHash!==measurement.content.measurementHash)fail('EDUCATION_ASSESSMENT_REFERENCE_MEASUREMENT')
   choices.push({...selected,contentHash:reference.contentHash,metricKey:entries[0].metricKey,referenceKind:entries[0].referenceKind})
  }
  const selected=input.reports.find(value=>value.itemId===unit.itemId),report=selected?releases.get(selected.releaseId):null
  if(report){
   if(report.layer!=='REPORT'||report.family!==unit.family||report.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR||report.content.measurements.length!==1
    ||report.content.measurements[0].releaseId!==measurement.releaseId||report.content.measurements[0].contentHash!==measurement.contentHash
    ||report.content.audience!==(c.product==='TEACHER'?'teacher':'student')
    ||report.scope.kind!=='PLATFORM'&&(report.scope.product!==c.product||report.scope.ownerId!==p.createdAuthority.actorId||report.scope.resourceId!==p.runtimeCompositeId)
    ||report.content.metricKeys.some(metric=>!measurement.content.metrics.some(value=>value.metricKey===metric)))fail('EDUCATION_ASSESSMENT_REPORT_SCOPE',403)
  }
  units.push({...unit,...(choices.length?{referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1' as const,measurementReleaseId:measurement.releaseId,choices}}:{}),
   ...(report?{report:{releaseId:report.releaseId,contentHash:report.contentHash}}:{})})
 }
 return {snapshot:trainingContentSnapshotSchema.parse({...snapshot,units}),releases}
}
/** Stage 2 freezes the complete entry; metadata DRAFT is immutable thereafter.
 * The runtime stays DRAFT until the independent review and publication finish. */
export async function registerEducationAssessment(c:EducationAssessmentContext,id:string,raw:unknown){
 uuid.parse(id);const input=registerEducationAssessmentSchema.parse(raw)
 return transaction(async tx=>{
  const p=await findPreparation(tx,c,id),{identities,actor}=await boundary(tx,c,p.sourceCompositeId,[p.createdAuthority])
  if(p.createdAuthority.actorId!==c.principal.userId||canonicalHash(p)!==input.expectedPreparationHash)fail('EDUCATION_ASSESSMENT_PREPARATION_CHANGED')
  const existing=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM education_assessment_deliveries WHERE id=${id} FOR SHARE`)
  if(existing.length){
   const prior=await tx.assessmentManagementEvent.findFirst({where:{resourceId:id,actorId:c.principal.userId,action:'EDUCATION_ASSESSMENT_REGISTERED'}})
   if((prior?.metadata as {inputHash?:string}|undefined)?.inputHash!==canonicalHash(input))fail('EDUCATION_ASSESSMENT_ALREADY_FROZEN')
   const row=await header(tx,c,id),origin=educationAssessmentOriginSchema.parse(row.entry.educationOrigin)
   const entry=draftEducationAssessmentEntry({origin,title:p.title,disclosure:row.entry.resultDisclosure})
   return {resourceId:id,resourceKey:key(c,id),version:'1.0.0',status:row.status,entryHash:row.entry_hash,entry:{...entry,releaseStatus:row.entry.releaseStatus as 'DRAFT'|'PUBLISHED'}}
  }
  const {source,content}=await readEducationAssessmentSource(tx,p.sourceCompositeId,identities,c.product)
  if(canonicalHash(source.trainingContentSnapshot)!==p.sourceSnapshotHash||canonicalHash(buildTrainingFlowUnits(source))!==p.sourceDefinitionHash)fail('EDUCATION_ASSESSMENT_SOURCE_CHANGED')
  const runtime=await readRuntime(tx,c,p)
  if(runtime.status!=='DRAFT'||runtime.trainingContentSnapshotHash!==null||runtime.trainingContentSnapshot!==null
   ||canonicalHash(p.snapshot)!==p.runtimeSnapshotHash||p.snapshot.compositeId!==runtime.id)fail('EDUCATION_ASSESSMENT_PREPARATION_CHANGED')
  const selected=await selectedContent(tx,c,p,p.snapshot,input)
  const assets=educationAssessmentAssets(runtime,selected.releases.values())
  await assertEducationAssessmentAssets(tx,assets)
  const distribution=await assertEducationAssessmentDistribution(tx,{...c,actorId:c.principal.userId,selection:input.licenses,
   resourceIds:[source.id,...selected.releases.keys(),...assets.map(asset=>asset.assetId)]})
  for(const original of p.distribution.grants)if(!distribution.grants.some(grant=>grant.resourceId===original.resourceId&&grant.grantId===original.grantId&&grant.version===original.version))fail('EDUCATION_ASSESSMENT_DISTRIBUTION_CHANGED',403)
  const origin=educationAssessmentOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',resourceId:id,product:c.product,organizationId:c.organizationId,family:p.family,
   sourceCompositeId:source.id,runtimeCompositeId:runtime.id,sourceSnapshotHash:p.sourceSnapshotHash,runtimeSnapshotHash:canonicalHash(selected.snapshot),runtimeDefinitionHash:p.runtimeDefinitionHash,
   distribution,units:selected.snapshot.units.map(unit=>({itemId:unit.itemId,family:unit.family,measurement:unit.measurement,
    references:[...new Map((unit.referencePolicy?.choices??[]).map(choice=>[choice.releaseId,{releaseId:choice.releaseId,contentHash:choice.contentHash}])).values()],report:unit.report??null}))})
  const entry=(()=>{try{return draftEducationAssessmentEntry({origin,title:p.title,disclosure:input.disclosure})}
   catch(error){if(error instanceof z.ZodError)throw error;fail('EDUCATION_ASSESSMENT_DISCLOSURE_INVALID',400)}})()
  if(!origin.units.length&&entry.resultDisclosure?.audiences.RESPONDENT.mode==='INDIVIDUAL_SUMMARY')fail('EDUCATION_ASSESSMENT_FORM_COMPLETION_ONLY')
  const approvedMetrics=new Set([...selected.releases.values()].flatMap(release=>release.layer==='REPORT'?release.content.metricKeys:[]))
  if(entry.resultDisclosure?.audiences.RESPONDENT.metricKeys.some(metric=>!approvedMetrics.has(metric)))fail('EDUCATION_ASSESSMENT_DISCLOSURE_REPORT_REQUIRED',403)
  await content.recheckSourceLicenses();await retainEducationAssessmentIssuers(tx,c,[p.createdAuthority,actor]);await captureEducationAssessmentIssuer(tx,c)
  await assertEducationAssessmentDistributionCurrent(tx,origin)
  await tx.compositeAssessment.update({where:{id:runtime.id},data:{trainingContentSnapshot:selected.snapshot,trainingContentSnapshotHash:origin.runtimeSnapshotHash}})
  await tx.$executeRaw(Prisma.sql`INSERT INTO education_assessment_deliveries
   (id,product,organization_id,family,source_composite_id,runtime_composite_id,entry,entry_hash,created_by_user_id,created_authority)
   VALUES(${id},${c.product},${c.organizationId},${p.family},${source.id},${runtime.id},${JSON.stringify(entry)}::jsonb,${canonicalHash(entry)},${c.principal.userId},${JSON.stringify(actor)}::jsonb)`)
  await event(tx,c,id,'EDUCATION_ASSESSMENT_REGISTERED',{entryHash:canonicalHash(entry),inputHash:canonicalHash(input)})
  return {resourceId:id,resourceKey:key(c,id),version:'1.0.0',status:'DRAFT',entryHash:canonicalHash(entry),entry}
 })
}
async function header(tx:Tx,c:EducationAssessmentContext,id:string,lock=false){
 const [row]=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM education_assessment_deliveries WHERE id=${id}
  AND product=${c.product} AND organization_id=${c.organizationId} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`)
 if(!row)fail('EDUCATION_ASSESSMENT_NOT_FOUND',404)
 if(canonicalHash(row.entry)!==row.entry_hash)fail('EDUCATION_ASSESSMENT_ENTRY_CHANGED')
 return row
}
export async function transitionEducationAssessment(c:EducationAssessmentContext,id:string,action:'REVIEW'|'PUBLISH'|'RETIRE',raw:unknown){
 uuid.parse(id);const input=transitionEducationAssessmentSchema.parse(raw)
 return transaction(async tx=>{
  const before=await header(tx,c,id),origin=educationAssessmentOriginSchema.parse(before.entry.educationOrigin)
  const proofs=[before.created_authority,...(before.reviewed_authority?[before.reviewed_authority]:[]),...(before.published_authority?[before.published_authority]:[])].map(value=>educationDeliveryAuthoritySchema.parse(value))
  const {identities,actor}=await boundary(tx,c,origin.sourceCompositeId,action==='RETIRE'?[]:proofs)
  const row=await header(tx,c,id,true)
  const targetStatus=({REVIEW:'REVIEWED',PUBLISH:'PUBLISHED',RETIRE:'RETIRED'} as const)[action]
  if(row.status===targetStatus){
   const prior=await tx.assessmentManagementEvent.findFirst({where:{resourceId:id,actorId:c.principal.userId,action:'EDUCATION_ASSESSMENT_'+action}})
   if((prior?.metadata as {inputHash?:string}|undefined)?.inputHash===canonicalHash(input))
    return {resourceId:id,resourceKey:key(c,id),version:'1.0.0',status:row.status,entryHash:row.entry_hash}
  }
  if(row.entry_hash!==input.expectedEntryHash||row.status!==({REVIEW:'DRAFT',PUBLISH:'REVIEWED',RETIRE:'PUBLISHED'} as const)[action])fail('EDUCATION_ASSESSMENT_STATE_CONFLICT')
  if(action==='REVIEW'&&row.created_by_user_id===c.principal.userId)fail('EDUCATION_ASSESSMENT_INDEPENDENT_REVIEW_REQUIRED',403)
  const runtime=await tx.compositeAssessment.findUnique({where:{id:origin.runtimeCompositeId},include:educationCompositeInclude})
  if(!runtime||canonicalHash(runtime.trainingContentSnapshot)!==origin.runtimeSnapshotHash||runtime.trainingContentSnapshotHash!==origin.runtimeSnapshotHash
   ||canonicalHash(buildTrainingFlowUnits(runtime))!==origin.runtimeDefinitionHash)fail('EDUCATION_ASSESSMENT_RUNTIME_CHANGED')
  if(action!=='RETIRE'){
   const p=await findPreparation(tx,c,id)
   await readRuntime(tx,c,p)
   const {source,content}=await readEducationAssessmentSource(tx,origin.sourceCompositeId,identities,c.product)
   if(canonicalHash(source.trainingContentSnapshot)!==origin.sourceSnapshotHash||canonicalHash(buildTrainingFlowUnits(source))!==p.sourceDefinitionHash)fail('EDUCATION_ASSESSMENT_SOURCE_CHANGED')
   const snapshot=trainingContentSnapshotSchema.parse(runtime.trainingContentSnapshot)
   const selection={expectedPreparationHash:canonicalHash(p),disclosure:row.entry.resultDisclosure,
    references:{schemaVersion:1 as const,units:snapshot.units.map(unit=>({itemId:unit.itemId,choices:unit.referencePolicy?.choices.map(({releaseId,entryKey,priority})=>({releaseId,entryKey,priority}))??[]}))},
    reports:snapshot.units.flatMap(unit=>unit.report?[{itemId:unit.itemId,releaseId:unit.report.releaseId}]:[]),licenses:origin.distribution.grants}
   const checked=await selectedContent(tx,c,p,snapshot,selection)
   if(canonicalHash(checked.snapshot)!==origin.runtimeSnapshotHash)fail('EDUCATION_ASSESSMENT_RUNTIME_CHANGED')
   await assertEducationAssessmentAssets(tx,educationAssessmentAssets(runtime,checked.releases.values()))
   await assertEducationAssessmentDistributionCurrent(tx,origin)
   await content.recheckSourceLicenses();await retainEducationAssessmentIssuers(tx,c,proofs)
  }
  await retainEducationAssessmentIssuers(tx,c,[actor]);await captureEducationAssessmentIssuer(tx,c)
  if(action!=='RETIRE')await assertEducationAssessmentDistributionCurrent(tx,origin)
  const status=({REVIEW:'REVIEWED',PUBLISH:'PUBLISHED',RETIRE:'RETIRED'} as const)[action]
  const entry=action==='PUBLISH'?{...row.entry,releaseStatus:'PUBLISHED'}:row.entry
  if(action==='PUBLISH')await tx.compositeAssessment.update({where:{id:runtime.id},data:{status:'PUBLISHED',publishedAt:new Date()}})
  await tx.$executeRaw(Prisma.sql`UPDATE education_assessment_deliveries SET status=${status},entry=${JSON.stringify(entry)}::jsonb,entry_hash=${canonicalHash(entry)},
   ${action==='REVIEW'?Prisma.sql`reviewed_by_user_id=${c.principal.userId},reviewed_at=clock_timestamp(),reviewed_authority=${JSON.stringify(actor)}::jsonb`:
    action==='PUBLISH'?Prisma.sql`published_by_user_id=${c.principal.userId},published_at=clock_timestamp(),published_authority=${JSON.stringify(actor)}::jsonb`:
    Prisma.sql`retired_by_user_id=${c.principal.userId},retired_at=clock_timestamp()`} WHERE id=${id}`)
  if(action==='PUBLISH')await readEducationAssessmentDeliveryIdentity(tx,{resourceKey:key(c,id),version:'1.0.0',purpose:'NEW_USE'})
  await event(tx,c,id,'EDUCATION_ASSESSMENT_'+action,{reason:input.reason,fromStatus:row.status,toStatus:status,entryHash:canonicalHash(entry),authority:actor,inputHash:canonicalHash(input)})
  return {resourceId:id,resourceKey:key(c,id),version:'1.0.0',status,entryHash:canonicalHash(entry)}
 })
}
export async function listEducationAssessmentRegistrations(c:EducationAssessmentContext,cursor?:string){
 if(cursor)uuid.parse(cursor)
 return transaction(async tx=>{
  await lockEducationAssessmentOrganization(tx,c);await captureEducationAssessmentIssuer(tx,c)
  const rows=await tx.$queryRaw<Array<{id:string;family:string;status:string;entry_hash:string;title:string}>>(Prisma.sql`
   SELECT id,family,status,entry_hash,entry->>'title' AS title FROM education_assessment_deliveries
    WHERE product=${c.product} AND organization_id=${c.organizationId} ${cursor?Prisma.sql`AND id>${cursor}`:Prisma.empty} ORDER BY id LIMIT 51`)
  return {list:rows.slice(0,50).map(row=>({resourceId:row.id,family:row.family,title:row.title,status:row.status,entryHash:row.entry_hash})),nextCursor:rows.length>50?rows[49].id:null}
 })
}
export async function readEducationAssessmentRegistration(c:EducationAssessmentContext,id:string){
 uuid.parse(id)
 return transaction(async tx=>{
  await lockEducationAssessmentOrganization(tx,c);await captureEducationAssessmentIssuer(tx,c)
  const row=await header(tx,c,id)
  return {resourceId:id,status:row.status,entryHash:row.entry_hash,entry:row.entry,createdBy:row.created_by_user_id,reviewedBy:row.reviewed_by_user_id}
 })
}
/** Management picker metadata only. Exact source payload, copyright, lifecycle
 * and the complete grant set are revalidated at prepare/register, not inferred
 * from this navigation projection. No arbitrary Training library is enumerated. */
export async function listEducationAssessmentSourceCandidates(c:EducationAssessmentContext){
 return transaction(async tx=>{
  await lockEducationAssessmentOrganization(tx,c);await captureEducationAssessmentIssuer(tx,c)
  const candidates=await tx.$queryRaw<Array<{id:string;name:string;grant_id:string;resource_keys:string[]}>>(Prisma.sql`
   SELECT composite.id,composite.name,grant_row.id AS grant_id,grant_row.resource_keys
   FROM content_capability_grants grant_row JOIN composite_assessments composite ON composite.id=ANY(grant_row.resource_keys)
   WHERE grant_row.subject_id=${c.principal.userId} AND grant_row.product=${c.product} AND grant_row.scope_kind='ORGANIZATION'
    AND grant_row.scope_id=${c.organizationId} AND grant_row.resource_kind='material' AND 'material.distribute'=ANY(grant_row.capabilities)
    AND grant_row.revoked_at IS NULL AND grant_row.valid_from<=(clock_timestamp() AT TIME ZONE 'UTC') AND grant_row.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
    AND composite.status='PUBLISHED' ORDER BY composite.id,grant_row.id LIMIT 51`)
  if(candidates.length>50)fail('EDUCATION_ASSESSMENT_CANDIDATE_BOUND')
  const list=[]
  for(const candidate of candidates){
   const distribution=await assertEducationAssessmentDistribution(tx,{...c,actorId:c.principal.userId,resourceIds:[candidate.id],selection:[{resourceId:candidate.id,grantId:candidate.grant_id}]})
   list.push({sourceCompositeId:candidate.id,title:candidate.name,grantId:distribution.grants[0].grantId,
    grantedResourceIds:candidate.resource_keys,canPublish:false})
  }
  return {list}
 })
}
export async function listEducationAssessmentContentChoices(c:EducationAssessmentContext,id:string){
 uuid.parse(id)
 return transaction(async tx=>{
  const p=await findPreparation(tx,c,id)
  await boundary(tx,c,p.sourceCompositeId,[p.createdAuthority])
  if(p.createdAuthority.actorId!==c.principal.userId)fail('EDUCATION_ASSESSMENT_PREPARATION_OWNER_REQUIRED',403)
  await readRuntime(tx,c,p)
  await assertEducationAssessmentDistributionCurrent(tx,p)
  if(!p.snapshot.units.length)return {units:[],emptySelectionAllowed:true}
  const measurementIds=[...new Set(p.snapshot.units.map(unit=>unit.measurement.releaseId))]
  const rows=await tx.$queryRaw<Array<{id:string;grant_id:string}>>(Prisma.sql`
   SELECT release.id,grant_row.id AS grant_id FROM measurement_content_releases release
    JOIN content_capability_grants grant_row ON release.id=ANY(grant_row.resource_keys)
   WHERE release.status='PUBLISHED' AND release.layer IN ('REFERENCE','REPORT')
    AND (release.scope->>'kind'='PLATFORM' OR (release.scope->>'product'=${c.product}
      AND release.scope->>'ownerId'=${p.createdAuthority.actorId} AND release.scope->>'resourceId'=${p.runtimeCompositeId}))
    AND (release.content->'measurement'->>'releaseId' IN (${Prisma.join(measurementIds)})
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(release.content->'measurements','[]'::jsonb)) m WHERE m->>'releaseId' IN (${Prisma.join(measurementIds)})))
    AND grant_row.subject_id=${c.principal.userId} AND grant_row.product=${c.product} AND grant_row.scope_kind='ORGANIZATION'
    AND grant_row.scope_id=${c.organizationId} AND grant_row.resource_kind='material' AND 'material.distribute'=ANY(grant_row.capabilities)
    AND grant_row.revoked_at IS NULL AND grant_row.valid_from<=(clock_timestamp() AT TIME ZONE 'UTC') AND grant_row.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
   ORDER BY release.id,grant_row.id LIMIT 51`)
  if(rows.length>50)fail('EDUCATION_ASSESSMENT_CANDIDATE_BOUND')
  const releases=await getContentReleaseBatch(tx,rows.map(row=>row.id),true),units=[]
  for(const unit of p.snapshot.units){
   const references=[],reports=[]
   for(const row of rows){
    const release=releases.get(row.id)
    if(!release||release.family!==unit.family)continue
    const matches=release.layer==='REFERENCE'?release.content.measurement.releaseId===unit.measurement.releaseId:
     release.layer==='REPORT'&&release.content.measurements.some(measurement=>measurement.releaseId===unit.measurement.releaseId)
    if(!matches)continue
    await assertEducationAssessmentDistribution(tx,{...c,actorId:c.principal.userId,resourceIds:[row.id],selection:[{resourceId:row.id,grantId:row.grant_id}]})
    const selection={...{expectedPreparationHash:canonicalHash(p),disclosure:null,licenses:p.distribution.grants},
     references:{schemaVersion:1 as const,units:release.layer==='REFERENCE'?[{itemId:unit.itemId,choices:release.content.entries.map(entry=>({releaseId:release.releaseId,entryKey:referenceEntryKey(entry.definition as unknown as AssessmentReferenceEntry),priority:0}))}]:[]},
     reports:release.layer==='REPORT'?[{itemId:unit.itemId,releaseId:release.releaseId}]:[]}
    await selectedContent(tx,c,p,p.snapshot,selection)
    if(release.layer==='REFERENCE')references.push({releaseId:release.releaseId,contentHash:release.contentHash,grantId:row.grant_id,
     choices:release.content.entries.map(entry=>({entryKey:referenceEntryKey(entry.definition as unknown as AssessmentReferenceEntry),metricKey:entry.metricKey,referenceKind:entry.referenceKind}))})
    if(release.layer==='REPORT')reports.push({releaseId:release.releaseId,contentHash:release.contentHash,grantId:row.grant_id,audience:release.content.audience,title:release.content.template.title??null,metricKeys:release.content.metricKeys})
   }
   units.push({itemId:unit.itemId,family:unit.family,measurement:unit.measurement,references,reports})
  }
  return {units,emptySelectionAllowed:true}
 })
}
