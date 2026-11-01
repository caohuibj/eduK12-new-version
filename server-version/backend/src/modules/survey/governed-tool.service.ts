import {z} from 'zod'
import sourceTagLabels from '../scale/library/catalog-tag-labels.json'
import {catalogClassificationTags} from '../scale/library/catalog-discovery'
import {formDraftSchema} from '../assessment-core/form/definition'
import {readInstance as readNativeInstance} from '../bundle-product/instance'
import {freezeSurveyNativeSource,assertSurveyNativeAdmission} from '../bundle-product/survey-source'
import type {SurveyNativeSource} from '../bundle-product/survey-native'
import {catalogDiscoveryRecords,standardDiscoveryMetadataJoin,discoveryPageSql,jsonTagIds,sjtMetadataTagIds,discoveryJoin,governedDiscoveryIdentity} from './catalog-discovery'
import {catalogTagFacets,type CatalogClassificationTag,type CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
import {approveToolEntryPolicies,exactToolEntryProducts} from '../assessment-governance/tool-entry-policy'
import {ownGovernedMedia,retainGovernedMedia} from './governed-tool.media'
import {randomUUID} from 'node:crypto'
import {Prisma,type PrismaClient} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {AdminPermissionError} from '../admin-permissions/service'
import type {AdminSessionProof} from '../admin-permissions/proof'
import {assertStandardSystem} from './standard-triplet.service'
import {assertSurveyLibraryManager} from './admin-role'
import {assertSurveyToolPolicy,readToolPolicies} from './tool-policy'
import {getContentRelease,publishContentRelease} from '../measurement-content/repository'
import {reportTemplateSchema,type ReportTemplate} from '../measurement-content/report-template'
import {getCatalogSourceSnapshot,listCatalogSources,type CatalogSourceRef} from './catalog.sources'
import {readOnlineStandardSnapshot} from './standard-triplet.catalog'
import {authorizedProject} from './builder.service'
import {compileFrozenResearchUnit} from './publication.service'
import {isAssessmentOperationallyPaused} from '../assessment-governance/operational-hold'
import {artifactBlockers,artifactMetrics,artifactReference,clone,governedMeasurementInput,governedPolicyIdentity,governedSnapshot,packageFamily,packageReportSchema,snapshotUnit,type GovernedArtifact,type GovernedFamily,type GovernedParameter,type GovernedRow,type PackageReport} from './governed-tool.model'
import {computeGovernedTrial} from './governed-tool.trial'
import {governedSummaryColumns,summaryView,type GovernedSummaryRow} from './governed-tool.summary'
type Db=PrismaClient|Prisma.TransactionClient
export function governedFail(status:number,message:string):never{throw new AdminPermissionError(status,message)}
export async function governedRow(db:Db,id:string,lock=false){
 const [row]=await db.$queryRaw<GovernedRow[]>(Prisma.sql`SELECT * FROM survey_governed_tools WHERE id=${id} ${lock?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
 if(!row)governedFail(404,'工具版本不存在')
 if(canonicalHash(row.snapshot)!==row.snapshot_hash||row.family!==row.snapshot.family)governedFail(409,'冻结工具内容摘要不一致')
 return row
}
export function governedView(row:GovernedRow){return {id:row.id,family:row.family,title:row.title,toolKey:row.tool_key,toolVersion:row.tool_version,hash:row.snapshot_hash,state:row.state,version:row.version,submittedBy:row.submitted_by,submittedAt:row.submitted_at,approvedBy:row.approved_by,approvedAt:row.approved_at,approvalReason:row.approval_reason,reason:row.reason,blockers:row.blockers,
 versions:{content:row.snapshot.unit?.ref.sourceVersion??row.tool_version,parameters:row.snapshot.parameters?.version??null,report:row.snapshot.report?.version??row.snapshot.packageReport?.version??row.snapshot.nativeBundle?.definition.reportDefinition.version??null},metrics:artifactMetrics(row.snapshot),components:row.snapshot.components.map(c=>({slotKey:c.slotKey,title:c.title,kind:c.unit.ref.kind,source:c.source})),policyIdentity:governedPolicyIdentity(row)}}
async function audit(tx:Prisma.TransactionClient,actor:string,action:string,metadata:object){await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,action,metadata:metadata as Prisma.InputJsonValue}})}
export async function assertGovernedOnline(db:Db,id:string,hash?:string){
 const row=await governedRow(db,id)
 if(row.state!=='ONLINE'||hash&&hash!==row.snapshot_hash)governedFail(409,'该精确工具版本未上线或已停止新增使用')
 if(row.snapshot.unit){
  const u=snapshotUnit(row.snapshot.unit)
  const p=u.sourceProvenance??{},identity=row.family==='COGNITIVE'?{family:'COGNITIVE' as const,key:String(p.testType??'gonogo'),version:String(p.engineVersion??'1.0.0'),scoringVersion:String(p.scoringVersion??'1.0.0')}:row.family==='SJT'?{family:'SITUATIONAL' as const,key:String(p.instrumentKey??row.snapshot.unit.ref.sourceId.replace(/^registry:/,'')),version:row.snapshot.unit.ref.sourceVersion}:null
  if(identity&&isAssessmentOperationallyPaused(identity))governedFail(409,'工具已被全局紧急停用')
  if(row.family!=='FORM'){
   const pointer=row.measurement_release,release=pointer?await getContentRelease(db,pointer.releaseId,true):null
   if(!release||release.layer!=='MEASUREMENT'||release.status!=='PUBLISHED'||release.contentHash!==pointer!.contentHash)governedFail(409,'工具内容发布版本不可用于新增使用')
  }
 }
 return row
}
export async function readGovernedSource(db:Db,id:string,hash:string){return governedSnapshot(await assertGovernedOnline(db,id.replace(/^survey-tool:/,''),hash))}
export async function approvedComponent(db:Db,source:{type:'STANDARD'|'GOVERNED';id:string;hash:string}){
 if(source.type==='STANDARD')return readOnlineStandardSnapshot(db,'survey-standard:'+source.id,source.hash)
 const row=await assertGovernedOnline(db,source.id,source.hash)
 if(packageFamily(row.family))governedFail(409,'组合组件必须是固定单个工具，不能嵌套拆取另一个包')
 return governedSnapshot(row)
}
export async function assertGovernedDependencies(db:Db,a:GovernedArtifact){if(a.nativeBundle)await assertSurveyNativeAdmission(db as Prisma.TransactionClient,a.nativeBundle);for(const c of [...a.components].sort((x,y)=>x.source.id.localeCompare(y.source.id))){
 const current=await approvedComponent(db,c.source)
 if(canonicalHash(current)!==canonicalHash(c.unit))governedFail(409,'组合组件版本或状态已变化：'+c.slotKey)
}}
async function insertSubmission(tx:Prisma.TransactionClient,actor:string,id:string,a:GovernedArtifact){
 const blockers=artifactBlockers(a),hash=canonicalHash(a)
 const [prior]=await tx.$queryRaw<GovernedRow[]>`SELECT * FROM survey_governed_tools WHERE id=${id} FOR SHARE`
 if(prior){if(prior.snapshot_hash!==hash||prior.submitted_by!==actor)governedFail(409,'提交编号已用于其他精确内容');return governedView(prior)}
 const existing=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_governed_tools WHERE family=${a.family} AND tool_key=${a.toolKey} AND tool_version=${a.version} FOR SHARE`
 if(existing.length)governedFail(409,'该工具版本标签已存在，请为修订使用新版本标签')
 const [row]=await tx.$queryRaw<GovernedRow[]>`INSERT INTO survey_governed_tools(id,family,tool_key,tool_version,title,snapshot,snapshot_hash,reference,submitted_by,blockers) VALUES(${id},${a.family},${a.toolKey},${a.version},${a.title},${JSON.stringify(a)}::jsonb,${hash},${JSON.stringify(a.reference)}::jsonb,${actor},${JSON.stringify(blockers)}::jsonb) RETURNING *`
 if(!blockers.length)await retainGovernedMedia(tx,id,a.unit)
 await audit(tx,actor,'GOVERNED_TOOL_SUBMITTED',{id,family:a.family,hash,researcherGrantsCreated:0})
 return governedView(row)
}
async function selectedParameters(db:Db,id:string|undefined|null):Promise<GovernedParameter|null>{
 if(!id)return null
 const ref=await getContentRelease(db,id,true)
 if(!ref||ref.layer!=='REFERENCE'||ref.scope.kind!=='PLATFORM'||ref.status!=='PUBLISHED')governedFail(409,'只能选择已发布的公共精确参数版本')
 const measurement=await getContentRelease(db,ref.content.measurement.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED'||measurement.contentHash!==ref.content.measurement.contentHash)governedFail(409,'参数来源测量版本已变化或不可用')
 return {...clone(ref),sourceMeasurementHash:measurement.content.measurementHash} as GovernedParameter
}
export type SourceSubmission={requestId:string;source:CatalogSourceRef;version:string;title:string;parameterReleaseId?:string|null;report:{version:string;template:ReportTemplate;audience?:'student'|'researcher'}|null;reference:Record<string,unknown>}
export async function submitGovernedSource(actor:string,input:SourceSubmission,proof:AdminSessionProof){return prisma.$transaction(async tx=>{
 await assertStandardSystem(tx,actor,proof)
 if(input.source.sourceId.startsWith('survey-tool:')||input.source.sourceId.startsWith('survey-standard:'))governedFail(409,'已批准版本请作为组合组件使用；修订应从原来源提交新版本')
 const unit=await getCatalogSourceSnapshot({actorUserId:actor,ref:input.source},tx),a:GovernedArtifact={schemaVersion:1,family:unit.ref.kind,toolKey:unit.ref.kind+':'+unit.ref.sourceId,version:input.version,title:input.title,unit,parameters:await selectedParameters(tx,input.parameterReleaseId),report:input.report?{version:input.report.version,...(input.report.audience?{audience:input.report.audience}:{}),template:reportTemplateSchema.parse(input.report.template)}:null,components:[],packageReport:null,
 reference:artifactReference(unit.ref.kind,unit.ref.sourceId,{originalSource:unit.ref,originalProvenance:unit.provenance,annotations:clone(input.reference)})}
 return insertSubmission(tx,actor,input.requestId,a)
},{timeout:20000})}
export async function submitOwnedSurveyTool(actor:string,projectId:string,draftId:string,input:{requestId:string;revision:number;version:string;statement:string;reference:Record<string,unknown>}){return prisma.$transaction(async tx=>{
 await authorizedProject(tx,actor,projectId,false)
 const row=await tx.surveyInstrumentDraft.findFirst({where:{id:draftId,projectId}})
 if(!row||row.revision!==input.revision||row.status==='ARCHIVED')governedFail(409,'本人工具草稿版本已变化')
 if(row!.catalogGrantId)governedFail(403,'使用授权不包含再次提交他人原版工具的权利')
 const compiled=compileFrozenResearchUnit(row!),ref={kind:compiled.kind,sourceId:'survey-draft:'+row!.id,sourceVersion:String(row!.revision)},unit={ref,title:row!.title,displayDefinition:compiled.displayDefinition,compiledDefinition:compiled.compiledDefinition,definitionDigest:compiled.sourceDigest,scoringDigest:compiled.scoringDigest,adapterVersion:'survey-catalog-v1' as const,provenance:{submittedBy:actor,originalProjectId:projectId,originalDraftId:row!.id,originalRevision:row!.revision,instrumentClass:'CUSTOM_DESCRIPTIVE'}}
 ;(unit.provenance as Record<string,unknown>).governedMedia=await ownGovernedMedia(tx,actor,projectId,unit)
 const a:GovernedArtifact={schemaVersion:1,family:compiled.kind,toolKey:compiled.kind+':survey-draft:'+row!.id,version:input.version,title:row!.title,unit,parameters:null,report:null,components:[],packageReport:null,reference:artifactReference(compiled.kind,row!.id,{annotations:clone(input.reference),originalDraft:{id:row!.id,projectId,title:row!.title,revision:row!.revision,createdAt:row!.createdAt,createdBy:actor},submissionStatement:input.statement})}
 a.reference.applications.push({submittedBy:actor,projectId,draftId,revision:row!.revision,statement:input.statement})
 return insertSubmission(tx,actor,input.requestId,a)
})}
export async function previewSurveyNativeSource(actor:string,id:string){
 await assertStandardSystem(prisma,actor)
 const row=await prisma.compositeAssessment.findFirst({where:{id,createdBy:actor,status:'PUBLISHED',productKind:'ASSESSMENT_BUNDLE'},include:{bundleInstance:true}})
 if(!row?.bundleInstance)governedFail(404,'原生整包必须是本人已发布版本')
 const {frozen}=readNativeInstance(row.bundleInstance)
 if(frozen.declarativePackage?.schemaVersion!==2)governedFail(409,'此来源尚无理论画像适配')
 return {title:row.name,compositeId:row.id,definitionHash:row.bundleInstance.definitionHash,bindingsHash:row.bundleInstance.bindingsHash,slots:frozen.bundleSnapshot.slotBindings.map(s=>({slotKey:s.slotKey,kind:s.unitType})),context:frozen.contextDefinition?.fields.map(f=>({contextKey:f.contextKey,valueType:f.valueType}))??[]}
}
export async function submitGovernedPackage(actor:string,input:{requestId:string;family:'COMBINATION'|'BUNDLE';toolKey:string;version:string;title:string;components:Array<{slotKey:string;source:{type:'STANDARD'|'GOVERNED';id:string;hash:string}}> ;report:PackageReport|null;nativeBundle?:SurveyNativeSource;reference:Record<string,unknown>},proof:AdminSessionProof){return prisma.$transaction(async tx=>{
 await assertStandardSystem(tx,actor,proof)
 const components=[]
 for(const c of input.components){const unit=await approvedComponent(tx,c.source);components.push({...c,title:unit.title,unit})}
 const nativeBundle=input.nativeBundle?await freezeSurveyNativeSource(tx,actor,input.nativeBundle,components):undefined
 if(nativeBundle&&(input.family!=='BUNDLE'||input.report!==null))governedFail(400,'原生综合画像必须保留整包身份')
 const a:GovernedArtifact={...(nativeBundle?{nativeBundle}:{}),schemaVersion:1,family:input.family,toolKey:input.toolKey,version:input.version,title:input.title,unit:null,parameters:null,report:null,components,packageReport:input.report?packageReportSchema.parse(input.report):null,reference:artifactReference(input.family,input.toolKey,{annotations:clone(input.reference),components:components.map(c=>({slotKey:c.slotKey,source:c.source,reference:c.unit.provenance.toolReference??c.unit.provenance}))})}
 return insertSubmission(tx,actor,input.requestId,a)
},{timeout:20000})}
export async function governedSources(actor:string,kind:'SCALE'|'COGNITIVE'|'SJT'|'FORM',page:number,query=''){await assertStandardSystem(prisma,actor);return listCatalogSources({actorUserId:actor,kind,page,query,includeGoverned:false},prisma)}
export async function governedCatalog(actor:string,input:{family?:GovernedFamily;page:number;query?:string}&CatalogDiscoveryFilters,system=true){
 if(system)await assertStandardSystem(prisma,actor);else await prisma.$transaction(tx=>assertSurveyLibraryManager(tx,actor))
 const records=catalogDiscoveryRecords(),filters={...input,keyword:input.keyword||input.query}
 const [catalog]=await prisma.$queryRaw<Array<{list:Array<GovernedSummaryRow&{classification_tags:CatalogClassificationTag[]}>;facetTags:CatalogClassificationTag[]}>>(discoveryPageSql({source:Prisma.sql`SELECT discovery.ids,discovery.terms,${governedSummaryColumns},COALESCE(discovery.tags,'[]'::jsonb) AS classification_tags FROM survey_governed_tools t ${standardDiscoveryMetadataJoin(governedDiscoveryIdentity.key,governedDiscoveryIdentity.version,governedDiscoveryIdentity.kind)} ${discoveryJoin(records,{...governedDiscoveryIdentity,metadata:Prisma.sql`imported_discovery_source.metadata`,locale:Prisma.sql`imported_discovery_source.locale`},Prisma.sql`${jsonTagIds(Prisma.sql`t.reference#>'{metadata,tags}'`)} || CASE WHEN t.family='FORM' THEN COALESCE((SELECT jsonb_agg(tag->>'id') FROM jsonb_array_elements(${jsonTagIds(Prisma.sql`t.reference#>'{metadata,classificationTags}'`)}) tag WHERE jsonb_typeof(tag->'id')='string'),'[]'::jsonb) ELSE '[]'::jsonb END || CASE WHEN t.family='SJT' THEN ${sjtMetadataTagIds(Prisma.sql`t.snapshot#>'{unit,compiledDefinition}'`)} ELSE '[]'::jsonb END`)} WHERE (${input.family??null}::text IS NULL OR t.family=${input.family??null}) ${system?Prisma.empty:Prisma.sql`AND t.state IN ('ONLINE','WITHDRAWN')`}`,filters,text:[Prisma.sql`v.title`,Prisma.sql`v.tool_key`,Prisma.sql`v.snapshot_hash`],order:Prisma.sql`v.submitted_at DESC,v.id`,limit:26,offset:(input.page-1)*25,tagColumn:Prisma.sql`v.classification_tags`}))
 const rows=catalog.list
 const selected=rows.slice(0,25),policies=await readToolPolicies(prisma,selected.map(governedPolicyIdentity)),list=[]
 for(const r of selected){
  const policy=policies.get('governed-release:'+r.id+':'+r.snapshot_hash)!,contentReasons=r.blockers,approvalReasons=r.state==='ONLINE'?[]:[r.state==='TRIAL_FAILED'?'自动试运行未通过':r.state==='WITHDRAWN'?'已停止新增使用':'尚未通过系统批准及自动试运行',...r.blockers]
  const assignmentReasons=[...approvalReasons,...contentReasons,...(policy.decision==='APPROVED'?[]:['尚未批准 Survey 使用范围']),...(policy.paused?['Survey 新增使用已暂停：'+policy.reason]:[])]
  list.push({...summaryView(r),classificationTags:r.classification_tags??[],policy,states:{content:{ready:!contentReasons.length,reasons:contentReasons},assignment:{ready:!assignmentReasons.length,reasons:assignmentReasons},deployment:{ready:false,reasons:[...assignmentReasons,'投放时还需核对研究者的精确版本授权和冻结绑定']}}})
 }
 return {list,page:input.page,hasMore:rows.length>25,tagFacets:catalogTagFacets([catalog.facetTags])}
}
export async function governedDetail(actor:string,id:string){await assertStandardSystem(prisma,actor);const row=await governedRow(prisma,id);const trials=await prisma.$queryRaw<Array<{id:string;run_id:string;case_index:number;result_hash:string;created_at:Date;report:unknown}>>`SELECT id,run_id,case_index,result_hash,created_at,result->'report' AS report FROM survey_governed_trials WHERE tool_id=${id} ORDER BY created_at DESC LIMIT 60`;return {...governedView(row),snapshot:row.snapshot,reference:{...row.reference,applications:[...row.reference.applications,{submittedBy:row.submitted_by,submittedAt:row.submitted_at}],approvals:[...row.reference.approvals,...(row.approved_by?[{approvedBy:row.approved_by,approvedAt:row.approved_at,reason:row.approval_reason}]:[])]},trials}}
export async function governedComponentOptions(actor:string,page=1,query=''){
 await assertStandardSystem(prisma,actor)
 const pattern='%'+query.trim().replace(/[\\%_]/g,'\\$&')+'%'
 const selected=await prisma.$queryRaw<Array<{type:'GOVERNED'|'STANDARD';id:string;hash:string}>>(Prisma.sql`SELECT type,id,hash FROM (
  SELECT 0 AS rank,'GOVERNED' AS type,id,snapshot_hash AS hash,title AS sort_key FROM survey_governed_tools WHERE state='ONLINE' AND family NOT IN ('COMBINATION','BUNDLE') AND (${query}='' OR title ILIKE ${pattern} OR snapshot_hash ILIKE ${pattern})
  UNION ALL SELECT 1 AS rank,'STANDARD' AS type,id,combination_hash AS hash,tool_key AS sort_key FROM survey_standard_releases WHERE state='ONLINE' AND (${query}='' OR snapshot->>'title' ILIKE ${pattern} OR tool_key ILIKE ${pattern} OR combination_hash ILIKE ${pattern})
 ) options ORDER BY rank,sort_key,id LIMIT 26 OFFSET ${(page-1)*25}`)
 const list=[]
 for(const s of selected.slice(0,25)){
  if(s.type==='GOVERNED'){
   const r=await governedRow(prisma,s.id),unit=r.snapshot.unit!
   if(r.snapshot_hash!==s.hash||r.state!=='ONLINE')governedFail(409,'组件版本状态已变化，请刷新')
   list.push({source:s,title:r.title,kind:r.family,versions:{content:unit.ref.sourceVersion,parameters:r.snapshot.parameters?.version??null,report:r.snapshot.report?.version??null},metrics:artifactMetrics(r.snapshot),fields:r.family==='FORM'?(unit.displayDefinition as import('./builder.definition').FormDraft).pages.flatMap(p=>p.questions.map(q=>({itemKey:q.itemKey,label:q.prompt}))):[]})
  }else{
   const unit=await readOnlineStandardSnapshot(prisma,'survey-standard:'+s.id,s.hash),measurement=governedMeasurementInput(snapshotUnit(unit),{kind:'PLATFORM'},s.id,'1')
   const [axis]=await prisma.$queryRaw<Array<{content:string;parameters:string|null;report:string|null}>>`SELECT snapshot#>>'{parts,CONTENT,version}' AS content,CASE WHEN snapshot#>'{parts,PARAMETERS,payload}'='null'::jsonb THEN NULL ELSE snapshot#>>'{parts,PARAMETERS,version}' END AS parameters,CASE WHEN snapshot#>'{parts,REPORT,payload}'='null'::jsonb THEN NULL ELSE snapshot#>>'{parts,REPORT,version}' END AS report FROM survey_standard_releases WHERE id=${s.id} AND combination_hash=${s.hash}`
   list.push({source:s,title:unit.title,kind:'SCALE',versions:axis,metrics:measurement.layer==='MEASUREMENT'?measurement.content.metrics:[],fields:[]})
  }
 }
 return {list,page,hasMore:selected.length>25}
}
export async function approveGovernedTool(actor:string,id:string,input:{expectedVersion:number;hash:string;reason:string;decision:'APPROVE'|'RETURN';allowedProducts?:unknown},proof:AdminSessionProof){
 const row=await prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor,proof);const r=await governedRow(tx,id,true)
  if(r.version!==input.expectedVersion||r.snapshot_hash!==input.hash||r.state!=='SUBMITTED')governedFail(409,'审批内容或状态已变化，请刷新')
  if(input.decision==='APPROVE'){
   const products=exactToolEntryProducts(input.allowedProducts)
   if(products.some(product=>product!=='SURVEY'))governedFail(409,'此治理版本当前仅有 Survey 执行适配，不能将全局上线视为 Training 准入')
   const blockers=artifactBlockers(r.snapshot);if(blockers.length)governedFail(409,blockers.join('；'))
   await assertGovernedDependencies(tx,r.snapshot)
   await approveToolEntryPolicies(tx,governedPolicyIdentity(r),products,actor,input.reason)
  }
  await tx.$executeRaw`UPDATE survey_governed_tools SET state=${input.decision==='APPROVE'?'APPROVED':'RETURNED'},version=version+1,approved_by=${input.decision==='APPROVE'?actor:null},approved_at=${input.decision==='APPROVE'?new Date():null},approval_reason=${input.decision==='APPROVE'?input.reason:null},reason=${input.reason} WHERE id=${id}`
  await audit(tx,actor,'GOVERNED_TOOL_'+input.decision,{id,hash:r.snapshot_hash,reason:input.reason,allowedProducts:input.allowedProducts??[],researcherGrantsCreated:0})
  return governedRow(tx,id)
 },{timeout:20000})
 return row.state==='APPROVED'?runGovernedTrial(actor,id,row.version,proof):governedView(row)
}
export async function runGovernedTrial(actor:string,id:string,version:number,proof:AdminSessionProof){
 const runId=randomUUID(),r=await prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor,proof);const row=await governedRow(tx,id,true)
  if(row.version!==version||!['APPROVED','TRIAL_FAILED','TRIAL_RUNNING'].includes(row.state)||!row.approved_by)governedFail(409,'试运行状态或版本已变化')
  if(row.state==='TRIAL_RUNNING'&&row.lease_until&&row.lease_until>new Date())governedFail(409,'同一版本试运行仍在进行')
  await assertGovernedDependencies(tx,row.snapshot)
  await tx.$executeRaw`UPDATE survey_governed_tools SET state='TRIAL_RUNNING',version=version+1,latest_trial=${runId},lease_until=clock_timestamp()+interval '90 seconds',blockers='[]' WHERE id=${id}`
  return row
 })
 try{
  const cases=[0,1,2].map(i=>computeGovernedTrial(r.snapshot,id,i))
  await prisma.$transaction(async tx=>{await assertStandardSystem(tx,actor,proof);for(const c of cases)await tx.$executeRaw`INSERT INTO survey_governed_trials(id,tool_id,run_id,case_index,result,result_hash) VALUES(${randomUUID()},${id},${runId},${c.result.caseIndex},${JSON.stringify(c.result)}::jsonb,${c.hash})`})
  const read=await prisma.$queryRaw<Array<{case_index:number;result:unknown;result_hash:string}>>`SELECT case_index,result,result_hash FROM survey_governed_trials WHERE tool_id=${id} AND run_id=${runId} ORDER BY case_index`
  if(read.length!==3||read.some((c,i)=>c.case_index!==i||canonicalHash(c.result)!==c.result_hash||c.result_hash!==cases[i].hash))throw new Error('试运行数据库提交与回读记录不一致')
  await prisma.$transaction(async tx=>{
   await assertStandardSystem(tx,actor,proof);const current=await governedRow(tx,id,true)
   if(current.state!=='TRIAL_RUNNING'||current.latest_trial!==runId)governedFail(409,'试运行已被替换')
   await assertGovernedDependencies(tx,current.snapshot)
   let pointer:{releaseId:string;contentHash:string}|null=null
   if(r.snapshot.unit&&r.family!=='FORM'){
    const measurement=await publishContentRelease(tx,governedMeasurementInput(snapshotUnit(r.snapshot.unit),{kind:'PLATFORM',ownerId:r.approved_by!},'survey-governed:'+id,r.snapshot_hash),actor)
    if(measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED')throw new Error('内容版本无法发布')
    pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
   }
   await tx.$executeRaw`UPDATE survey_governed_tools SET state='ONLINE',version=version+1,lease_until=NULL,blockers='[]',measurement_release=${pointer?JSON.stringify(pointer):'null'}::jsonb WHERE id=${id}`
   await audit(tx,actor,'GOVERNED_TRIAL_PASSED_ONLINE',{id,runId,caseCount:3,databaseReadback:true,researcherGrantsCreated:0})
  },{timeout:20000})
 }catch(e){await prisma.$transaction(async tx=>{const current=await governedRow(tx,id,true);if(current.state==='TRIAL_RUNNING'&&current.latest_trial===runId){const blockers=[e instanceof Error?e.message:'自动试运行失败'];await tx.$executeRaw`UPDATE survey_governed_tools SET state='TRIAL_FAILED',version=version+1,lease_until=NULL,blockers=${JSON.stringify(blockers)}::jsonb WHERE id=${id}`;await audit(tx,actor,'GOVERNED_TRIAL_FAILED',{id,runId,blockers})}})}
 return governedView(await governedRow(prisma,id))
}
export async function withdrawGovernedTool(actor:string,id:string,version:number,reason:string,proof:AdminSessionProof){return prisma.$transaction(async tx=>{
 await assertStandardSystem(tx,actor,proof);const row=await governedRow(tx,id,true)
 if(row.version!==version||row.state!=='ONLINE')governedFail(409,'当前上线状态已变化')
 await tx.$executeRaw`UPDATE survey_governed_tools SET state='WITHDRAWN',version=version+1,reason=${reason} WHERE id=${id}`
 await audit(tx,actor,'GOVERNED_TOOL_WITHDRAWN',{id,reason,historyRetained:true});return governedView(await governedRow(tx,id))
})}
export async function assertGovernedEntryAllowed(db:Db,id:string,hash:string){const row=await assertGovernedOnline(db,id,hash);await assertGovernedDependencies(db,row.snapshot);await assertSurveyToolPolicy(db as Prisma.TransactionClient,governedPolicyIdentity(row),true);return row}

export async function governedSourcePreview(actor:string,ref:CatalogSourceRef){
 await assertStandardSystem(prisma,actor)
 const source=await getCatalogSourceSnapshot({actorUserId:actor,ref},prisma)
 if(ref.kind==='FORM')return {source,metrics:[],parameters:[]}
 const {prepareRelease}=await import('../measurement-content/release'),measurement=prepareRelease(governedMeasurementInput(snapshotUnit(source),{kind:'PLATFORM'},ref.sourceId,'preview'))
 if(measurement.layer!=='MEASUREMENT')governedFail(409,'来源没有可用测量层')
 const rows=await prisma.$queryRaw<Array<{id:string;version:string;key:string}>>`SELECT r.id,r.version,r.content_key AS key FROM measurement_content_releases r JOIN measurement_content_releases m ON m.id=r.content#>>'{measurement,releaseId}' WHERE r.layer='REFERENCE' AND r.family=${ref.kind} AND r.status='PUBLISHED' AND r.scope->>'kind'='PLATFORM' AND m.content->>'measurementHash'=${measurement.content.measurementHash} ORDER BY r.published_at DESC,r.id LIMIT 100`
 return {source,metrics:measurement.content.metrics,parameters:rows}
}

export type OriginalSjtSubmission={requestId:string;toolKey:string;version:string;title:string;definition:unknown;statement:string;parameterReleaseId?:string|null;report:SourceSubmission['report'];reference:Record<string,unknown>}
/** New authored material only. Never rewrites registry examples or their source rights. */
export function originalSjtArtifact(actor:string,input:OriginalSjtSubmission):GovernedArtifact{
 const definition=input.definition as {licenseStatus?:string;redistribution?:string;author?:string;sourceNote?:string}
 const compiled=compileFrozenResearchUnit({id:input.requestId,instrumentKey:input.toolKey,kind:'SJT',title:input.title,revision:1,definition})
 const unit={ref:{kind:'SJT' as const,sourceId:'original-sjt:'+input.toolKey,sourceVersion:input.version},title:input.title,displayDefinition:compiled.displayDefinition,compiledDefinition:compiled.compiledDefinition,definitionDigest:compiled.sourceDigest,scoringDigest:compiled.scoringDigest,adapterVersion:'survey-catalog-v1' as const,provenance:{instrumentKey:input.toolKey,originalAuthor:definition.author,originalSourceNote:definition.sourceNote,submittedBy:actor,licenseStatus:definition.licenseStatus,redistribution:definition.redistribution}}
 return {schemaVersion:1,family:'SJT',toolKey:'SJT:original:'+input.toolKey,version:input.version,title:input.title,unit,parameters:null,report:input.report,components:[],packageReport:null,reference:artifactReference('SJT',input.toolKey,{annotations:clone(input.reference),author:definition.author,sourceNote:definition.sourceNote,licenseStatus:definition.licenseStatus,redistribution:definition.redistribution,submissionStatement:input.statement,originalContent:true})}
}
export async function previewOriginalSjt(actor:string,input:OriginalSjtSubmission,proof:AdminSessionProof){await assertStandardSystem(prisma,actor,proof);const a=originalSjtArtifact(actor,input);const measurement=(await import('../measurement-content/release')).prepareRelease(governedMeasurementInput(snapshotUnit(a.unit!),{kind:'PLATFORM'},input.toolKey,input.version));const parameters=measurement.layer==='MEASUREMENT'?await prisma.$queryRaw<Array<{id:string;key:string;version:string}>>`SELECT r.id,r.content_key AS key,r.version FROM measurement_content_releases r JOIN measurement_content_releases m ON m.id=r.content#>>'{measurement,releaseId}' WHERE r.layer='REFERENCE' AND r.family='SJT' AND r.status='PUBLISHED' AND r.scope->>'kind'='PLATFORM' AND m.content->>'measurementHash'=${measurement.content.measurementHash} ORDER BY r.published_at DESC,r.id LIMIT 100`:[];return {blockers:artifactBlockers(a),metrics:artifactMetrics(a),parameters}}
export async function submitOriginalSjt(actor:string,input:OriginalSjtSubmission,proof:AdminSessionProof){return prisma.$transaction(async tx=>{await assertStandardSystem(tx,actor,proof);const a=originalSjtArtifact(actor,input);a.parameters=await selectedParameters(tx,input.parameterReleaseId);a.unit!.provenance.governedMedia=await ownGovernedMedia(tx,actor,input.requestId,a.unit!);return insertSubmission(tx,actor,input.requestId,a)})}

/** Save complete native Form content for system review; no business author,
 * organization, measurement release, use grant or trial is created. */
export const originalFormSubmission=z.object({
 requestId:z.string().uuid(),toolKey:z.string().regex(/^[a-z][a-z0-9_-]{0,100}$/),
 version:z.string().trim().min(1).max(120),title:z.string().trim().min(1).max(200),
 definition:formDraftSchema,statement:z.string().trim().min(1).max(2000),
 classificationTags:z.array(z.string().refine(id=>Object.prototype.hasOwnProperty.call(sourceTagLabels,id),'请选择已有分类标签')).max(50).default([]),
 reference:z.record(z.string(),z.unknown()).refine(value=>Buffer.byteLength(JSON.stringify(value),'utf8')<=65536,'Reference 超过保存预算'),
}).strict()
export function originalFormArtifact(actor:string,raw:unknown):GovernedArtifact{
 const input=originalFormSubmission.parse(raw)
 const compiled=compileFrozenResearchUnit({id:input.requestId,instrumentKey:input.toolKey,kind:'FORM',title:input.title,revision:1,definition:input.definition})
 const classificationTags=catalogClassificationTags({constructOverlapTags:input.classificationTags})
 const unit={ref:{kind:'FORM' as const,sourceId:'original-form:'+input.toolKey,sourceVersion:input.version},title:input.title,
  displayDefinition:compiled.displayDefinition,compiledDefinition:compiled.compiledDefinition,definitionDigest:compiled.sourceDigest,scoringDigest:null,
  adapterVersion:'survey-catalog-v1' as const,provenance:{instrumentKey:input.toolKey,submittedBy:actor,originalContent:true}}
 return {schemaVersion:1,family:'FORM',toolKey:'FORM:original:'+input.toolKey,version:input.version,title:input.title,unit,
  parameters:null,report:null,components:[],packageReport:null,
  reference:artifactReference('FORM',input.toolKey,{annotations:clone(input.reference),classificationTags,submissionStatement:input.statement,originalContent:true})}
}
export async function submitOriginalForm(actor:string,raw:unknown){return prisma.$transaction(async tx=>{
 await assertStandardSystem(tx,actor)
 const a=originalFormArtifact(actor,raw)
 return {...await insertSubmission(tx,actor,(raw as {requestId:string}).requestId,a),classificationTags:a.reference.metadata.classificationTags}
})}
