import {scaleSourceClassificationTags,catalogTagFacets,matchesCatalogDiscovery,type CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
import {toolReference} from './tool-reference'
import {copyTripletContent} from './standard-triplet.content'
import {randomUUID} from 'node:crypto'
import {Prisma,type PrismaClient} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {listScaleInstrumentSources} from '../scale/onboarding/instrument-registry'
import {resolveScaleReference} from '../assessment-reference/reference'
import {hashScaleDefinition} from '../scale/scale-definition'
import {getContentReleaseBatch,publishContentRelease} from '../measurement-content/repository'
import {describeStandardCombination,standardCombinationMeasurementInput} from '../measurement-content/standard-combination'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {renderDeclaredReport,type ReportReferenceFact} from '../measurement-content/report-renderer'
import {computeSurveyFinal} from './final.compute'
import {tripletSnapshot,registeredParts,sourceParts,composeTriplet,type Part,type Triplet,type Axis} from './standard-triplet.model'
import type {ResearchFrozenPublication} from './publication.service'
import {validAdminProof,ADMIN_STEP_UP_SECONDS,type AdminSessionProof} from '../admin-permissions/proof'
import {AdminPermissionError} from '../admin-permissions/service'
type Db=PrismaClient|Prisma.TransactionClient
export type StandardRelease={id:string;tool_key:string;combination_hash:string;snapshot:Triplet;reference:unknown;state:'APPROVED'|'TRIAL_RUNNING'|'TRIAL_FAILED'|'ONLINE'|'WITHDRAWN';version:number;approved_by:string;approved_at:Date;latest_trial:string|null;lease_until:Date|null;blockers:string[];measurement_release:{releaseId:string;contentHash:string}|null}
const fail=(status:number,message:string):never=>{throw new AdminPermissionError(status,message)}
export async function assertStandardSystem(db:Db,actor:string,proof?:AdminSessionProof){
 const [user]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${actor} AND platform_role='SYSTEM_ADMIN' AND account_domain IN ('LEGACY','TRAINING') AND is_active AND NOT is_frozen AND NOT must_change_password AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`
 if(!user)fail(403,'只有独立系统管理员可以批准工具上线')
 if(proof){
  if(!validAdminProof(proof,ADMIN_STEP_UP_SECONDS))fail(403,'批准或试运行需要近期管理员双因素验证')
  const [current]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${actor} AND token_version=${proof.tokenVersion} FOR SHARE`
  if(!current)fail(403,'管理员会话已撤销，请重新登录')
 }
}
export async function standardReleaseRow(db:Db,id:string,lock=false){
 const rows=await db.$queryRaw<StandardRelease[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE id=${id} ${lock?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
 if(!rows[0])fail(404,'审批版本不存在')
 return rows[0]
}
const stateView=(r:StandardRelease)=>({id:r.id,state:r.state,version:r.version,approvedBy:r.approved_by,approvedAt:r.approved_at,latestTrial:r.latest_trial,blockers:r.blockers,combinationHash:r.combination_hash,versions:Object.fromEntries(Object.entries(r.snapshot.parts).map(([axis,p])=>[axis,{version:p.version,hash:p.hash}]))})
async function partsFor(db:Db,key:string){
 const rows=await db.$queryRaw<Array<{axis:Axis;version:string;content_hash:string;payload:unknown;source_version:string;reference:Part['reference']}>>`SELECT * FROM survey_standard_versions WHERE tool_key=${key} ORDER BY created_at DESC LIMIT 300`
 return [...new Map([...registeredParts(key),...rows.map(r=>({axis:r.axis,version:r.version,hash:r.content_hash,payload:r.payload,sourceVersion:r.source_version,reference:r.reference}))].map(p=>[p.axis+':'+p.hash,p])).values()]
}
export type Selection={toolKey:string;CONTENT:string;PARAMETERS:string;REPORT:string}
export async function previewStandardTriplet(db:Db,actor:string,selection:Selection){
 await assertStandardSystem(db,actor)
 const available=await partsFor(db,selection.toolKey),parts={} as Record<Axis,Part>
 for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const){const found=available.find(p=>p.axis===axis&&p.hash===selection[axis]);if(!found)fail(409,axis+' 所选版本不存在或已变化');parts[axis]=found!}
 const triplet=composeTriplet(selection.toolKey,parts)
 const scale=await db.scale.findUnique({where:{code:selection.toolKey},select:{id:true,creatorId:true,name:true,description:true,tags:true,createdAt:true}})
 const applications=scale?await db.$queryRaw<unknown[]>`SELECT to_jsonb(s) AS record FROM scale_library_submissions s WHERE source_id=${scale.id} ORDER BY created_at`:[]
 const publications=scale?await db.$queryRaw<unknown[]>`SELECT to_jsonb(a) AS record FROM scale_publication_audits a WHERE scale_id=${scale.id}`:[]
 const rights=await db.instrumentAuthorization.findMany({where:{instrumentKey:selection.toolKey},orderBy:{version:'asc'}})
 triplet.reference=toolReference('SCALE',selection.toolKey,{...triplet.reference.metadata,originalScaleRecord:scale,rightsRecords:rights},applications,publications)
 return triplet
}
export async function standardTripletCatalog(actor:string,page=1,filters:CatalogDiscoveryFilters={}){
 await assertStandardSystem(prisma,actor)
 const all=listScaleInstrumentSources().slice().sort((a,b)=>`${a.identity.instrumentKey}:${a.identity.instrumentVersion}`.localeCompare(`${b.identity.instrumentKey}:${b.identity.instrumentVersion}`))
 const tagFacets=catalogTagFacets(all.map(source=>scaleSourceClassificationTags(source)))
 const sources=all.filter(source=>matchesCatalogDiscovery([source.catalog.identity.canonicalName,source.identity.instrumentKey,source.identity.instrumentVersion,source.catalog.identity.instrumentFamily??'',source.catalog.construct.constructDefinition],scaleSourceClassificationTags(source),filters))
 const selected=sources.slice((page-1)*25,page*25)
 const keys=selected.map(s=>s.identity.instrumentKey)
 const states=keys.length?await prisma.$queryRaw<StandardRelease[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE tool_key IN (${Prisma.join(keys)}) ORDER BY created_at DESC`):[]
 return {page,hasMore:page*25<sources.length,tagFacets,list:selected.map(s=>{
  const parts=sourceParts(s.identity.instrumentKey,s.identity.instrumentVersion),p=Object.fromEntries(parts.map(p=>[p.axis,p])) as Record<Axis,Part>
  let candidate:Triplet|undefined,blockers:string[]=[]
  try{if(parts.length===3)candidate=composeTriplet(s.identity.instrumentKey,p);else blockers=['尚缺完整的内容、参数与报告版本，当前只有目录资料']}catch(e){blockers=[e instanceof Error?e.message:'版本结构不完整']}
  return {toolKey:s.identity.instrumentKey,instrumentVersion:s.identity.instrumentVersion,title:s.catalog.identity.canonicalName,versions:parts.map(p=>({axis:p.axis,version:p.version,hash:p.hash})),combinationHash:candidate?.combinationHash??null,blockers:[...blockers,...(candidate?.blockers??[])],releases:states.filter(r=>r.tool_key===s.identity.instrumentKey).map(stateView),tags:s.catalog.construct.constructOverlapTags,classificationTags:scaleSourceClassificationTags(s)}
 })}
}
export async function standardTripletDetail(actor:string,key:string,version:string){
 await assertStandardSystem(prisma,actor)
 const available=await partsFor(prisma,key),defaults=sourceParts(key,version),selection=Object.fromEntries(defaults.map(p=>[p.axis,p.hash])) as Omit<Selection,'toolKey'>
 const history=await prisma.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE tool_key=${key} ORDER BY created_at DESC LIMIT 50`
 const trials=history.length?await prisma.$queryRaw(Prisma.sql`SELECT release_id AS "releaseId",run_id AS "runId",case_index AS "caseIndex",record_hash AS "recordHash",created_at AS "createdAt",scores,report FROM survey_standard_trials WHERE release_id IN (${Prisma.join(history.map(r=>r.id))}) ORDER BY created_at DESC LIMIT 150`):[]
 const measurements=await getContentReleaseBatch(prisma,history.flatMap(r=>r.measurement_release?[r.measurement_release.releaseId]:[]))
 const versionMappings=history.map(r=>describeStandardCombination(r,r.measurement_release?measurements.get(r.measurement_release.releaseId)??null:null))
 return {available,selection:{toolKey:key,...selection},history:history.map(r=>({...stateView(r),reference:r.reference})),versionMappings,trials,reference:defaults.length===3?(await previewStandardTriplet(prisma,actor,{toolKey:key,...selection})).reference:defaults[0]?.reference??null}
}
async function audit(db:Prisma.TransactionClient,actor:string,action:string,metadata:object){await db.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,action,metadata:metadata as Prisma.InputJsonValue}})}
export async function approveStandardTriplet(actor:string,input:Selection&{requestId:string;expectedCombinationHash:string;reason:string},proof?:AdminSessionProof){
 const triplet=await previewStandardTriplet(prisma,actor,input)
 if(triplet.combinationHash!==input.expectedCombinationHash)fail(409,'审核预览已变化，请重新核对三份版本')
 if(triplet.blockers.length)fail(409,triplet.blockers.join('；'))
 const id=await prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor,proof)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-standard:'+triplet.combinationHash}))`
  const prior=await tx.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE id=${input.requestId} OR combination_hash=${triplet.combinationHash} FOR UPDATE`
  if(prior.length){if(prior.some(r=>r.id===input.requestId&&r.combination_hash!==triplet.combinationHash))fail(409,'请求编号已用于另一份版本组合');return prior[0].id}
  for(const p of Object.values(triplet.parts).sort((a,b)=>a.axis.localeCompare(b.axis))){
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-axis:'+triplet.toolKey+':'+p.axis+':'+p.version}))`
   const rows=await tx.$queryRaw<Array<{content_hash:string}>>`SELECT content_hash FROM survey_standard_versions WHERE tool_key=${triplet.toolKey} AND axis=${p.axis} AND version=${p.version} FOR SHARE`
   if(rows[0]&&rows[0].content_hash!==p.hash)fail(409,p.axis+' 同一版本号已有不同内容，请使用新版本')
   await tx.$executeRaw`INSERT INTO survey_standard_versions(id,tool_key,axis,version,content_hash,payload,source_version,reference,created_by) VALUES(${randomUUID()},${triplet.toolKey},${p.axis},${p.version},${p.hash},${JSON.stringify(p.payload)}::jsonb,${p.sourceVersion},${JSON.stringify(p.reference)}::jsonb,${actor}) ON CONFLICT DO NOTHING`
  }
  triplet.reference.approvals.push({actorId:actor,decision:'APPROVED',reason:input.reason,requestId:input.requestId,at:new Date().toISOString(),versions:input.expectedCombinationHash})
  await tx.$executeRaw`INSERT INTO survey_standard_releases(id,tool_key,combination_hash,snapshot,reference,state,approved_by) VALUES(${input.requestId},${triplet.toolKey},${triplet.combinationHash},${JSON.stringify(triplet)}::jsonb,${JSON.stringify(triplet.reference)}::jsonb,'APPROVED',${actor})`
  await audit(tx,actor,'STANDARD_TRIPLET_APPROVED',{releaseId:input.requestId,combinationHash:triplet.combinationHash,reason:input.reason,scope:'SURVEY_ONLY',researcherGrantsCreated:0})
  return input.requestId
 },{timeout:15000})
 const row=await standardReleaseRow(prisma,id)
 if(row.state==='APPROVED')return runStandardTrial(actor,id,row.version,proof)
 return stateView(row)
}
export function computeStandardTrial(triplet:Triplet,releaseId:string){
 const snapshot=tripletSnapshot(triplet,releaseId),display=snapshot.displayDefinition as ReturnType<typeof import('./catalog-scale.presentation')['canonicalScalePresentation']>['display']
 const unit={draftId:releaseId,instrumentKey:'trial-scale',kind:'SCALE' as const,title:triplet.title,draftRevision:1,sourceDigest:snapshot.definitionDigest,scoringDigest:snapshot.scoringDigest,compiledDefinition:snapshot.compiledDefinition,displayDefinition:snapshot.displayDefinition,sourceAnswerMapping:snapshot.answerMapping}
 const publication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'isolated-trial',waveId:'isolated-trial',collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:canonicalHash('SYNTHETIC_TRIAL'),runtimeStatus:'SURVEY_FINAL_V1',units:[unit]} as ResearchFrozenPublication
 return [0,.5,1].map((fraction,caseIndex)=>{
  const answers=Object.fromEntries(display.items.map(item=>[item.itemKey,item.responseOptions[Math.floor((item.responseOptions.length-1)*fraction)].optionKey]))
  const timings=Object.fromEntries(display.items.map(item=>[item.itemKey,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))
  const calculated=computeSurveyFinal(publication,{'trial-scale':answers},null,undefined,'FINAL',{'trial-scale':timings}),score=calculated.units[0].privateScoring as ReturnType<typeof import('../scale/scale-scoring')['scoreScale']>
  if(!score?.scores.length||score.scores.some(s=>s.status!=='calculated'||typeof s.value!=='number'||!Number.isFinite(s.value)))throw new Error('试运行未产生完整有效分数')
  const references:ReportReferenceFact[]=score.scores.flatMap(s=>resolveScaleReference({policy:triplet.definition.referencePolicy,references:triplet.references,instrumentKey:triplet.toolKey,instrumentVersion:triplet.instrumentVersion,scoringVersion:triplet.definition.scoring.scoringVersion,score:s,measurementHash:hashScaleDefinition(triplet.definition)}).map(r=>({metricKey:s.key,referenceKind:r.referenceKind,status:r.status==='available'?'AVAILABLE' as const:'UNAVAILABLE' as const,bandKey:r.criterionBand?.key??null})))
  const report=triplet.template?renderDeclaredReport(triplet.template,score.scores.map(s=>({metricKey:s.key,value:s.value,unit:'points',status:'INTERPRETABLE' as const})),references):null
  if(triplet.template&&(!report?.blocks.length||!report.blocks.some(b=>(b as {type:string}).type==='METRIC')))throw new Error('试运行未产生有效报告')
  const value={caseIndex,answers,scores:calculated,report}
  return {...value,recordHash:canonicalHash(value)}
 })
}
export async function runStandardTrial(actor:string,id:string,expectedVersion:number,proof?:AdminSessionProof){
 const runId=randomUUID()
 const row=await prisma.$transaction(async tx=>{
  await assertStandardSystem(tx,actor,proof);const r=await standardReleaseRow(tx,id,true)
  if(r.version!==expectedVersion)fail(409,'审批或试运行版本已变化，请刷新')
  if(r.state==='ONLINE'||r.state==='WITHDRAWN')fail(409,'该状态不能重复试运行')
  if(r.state==='TRIAL_RUNNING'&&r.lease_until&&r.lease_until>new Date())fail(409,'该版本仍在试运行，请稍后刷新')
  await tx.$executeRaw`UPDATE survey_standard_releases SET state='TRIAL_RUNNING',version=version+1,latest_trial=${runId},lease_until=clock_timestamp()+interval '60 seconds',blockers='[]',updated_at=clock_timestamp() WHERE id=${id}`
  await audit(tx,actor,'STANDARD_TRIAL_STARTED',{releaseId:id,runId})
  return r
 })
 try{
  const results=computeStandardTrial(row.snapshot,id)
  await prisma.$transaction(async tx=>{
   const trialMeasurement=await publishContentRelease(tx,scaleMeasurementRelease({localId:'trial:'+id,version:row.snapshot.parts.CONTENT.hash,instrumentVersion:row.snapshot.instrumentVersion,definition:row.snapshot.definition,instrumentClass:'STANDARD',scope:{kind:'PRIVATE',ownerId:row.approved_by,product:'SURVEY',resourceId:'standard-trial:'+runId},provenance:{syntheticTrial:true,runId}}),actor)
   if(trialMeasurement.layer!=='MEASUREMENT')throw new Error('试运行测量记录类型错误')
   await copyTripletContent(tx,row.snapshot,trialMeasurement,actor)
  },{timeout:15000})
  await prisma.$transaction(async tx=>{await assertStandardSystem(tx,actor,proof);for(const c of results)await tx.$executeRaw`INSERT INTO survey_standard_trials(id,release_id,run_id,case_index,answers,scores,report,record_hash) VALUES(${randomUUID()},${id},${runId},${c.caseIndex},${JSON.stringify(c.answers)}::jsonb,${JSON.stringify(c.scores)}::jsonb,${JSON.stringify(c.report)}::jsonb,${c.recordHash})`})
  // Separate committed readback, not merely INSERT success in a transaction later rolled back.
  const readback=await prisma.$queryRaw<Array<{case_index:number;answers:unknown;scores:unknown;report:unknown;record_hash:string}>>`SELECT * FROM survey_standard_trials WHERE release_id=${id} AND run_id=${runId} ORDER BY case_index`
  if(readback.length!==results.length||readback.some((c,i)=>c.case_index!==i||c.record_hash!==results[i].recordHash||canonicalHash({caseIndex:c.case_index,answers:c.answers,scores:c.scores,report:c.report})!==c.record_hash))throw new Error('数据库回读与试运行结果不一致')
  await prisma.$transaction(async tx=>{
   await assertStandardSystem(tx,actor,proof);const current=await standardReleaseRow(tx,id,true)
   if(current.state!=='TRIAL_RUNNING'||current.latest_trial!==runId)fail(409,'试运行已被另一轮操作替换')
   const measurement=await publishContentRelease(tx,standardCombinationMeasurementInput(row),actor)
   if(measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED')throw new Error('内容发布版本当前不能用于新增使用')
   await tx.$executeRaw`UPDATE survey_standard_releases SET state='ONLINE',version=version+1,lease_until=NULL,measurement_release=${JSON.stringify({releaseId:measurement.releaseId,contentHash:measurement.contentHash})}::jsonb,blockers='[]',updated_at=clock_timestamp() WHERE id=${id}`
   await audit(tx,actor,'STANDARD_TRIAL_PASSED_ONLINE',{releaseId:id,runId,caseCount:results.length,databaseReadback:true,scope:'SURVEY_ONLY',researcherGrantsCreated:0})
  },{timeout:15000})
 }catch(e){
  const message=e instanceof Error?e.message:'试运行失败'
  await prisma.$transaction(async tx=>{
   const current=await standardReleaseRow(tx,id,true)
   if(current.state==='TRIAL_RUNNING'&&current.latest_trial===runId){await tx.$executeRaw`UPDATE survey_standard_releases SET state='TRIAL_FAILED',version=version+1,lease_until=NULL,blockers=${JSON.stringify([message])}::jsonb,updated_at=clock_timestamp() WHERE id=${id}`;await audit(tx,actor,'STANDARD_TRIAL_FAILED',{releaseId:id,runId,message})}
  })
 }
 return stateView(await standardReleaseRow(prisma,id))
}
export async function withdrawStandardTriplet(actor:string,id:string,version:number,reason:string,proof?:AdminSessionProof){
 return prisma.$transaction(async tx=>{await assertStandardSystem(tx,actor,proof);const row=await standardReleaseRow(tx,id,true);if(row.version!==version||row.state!=='ONLINE')fail(409,'上线状态已变化');await tx.$executeRaw`UPDATE survey_standard_releases SET state='WITHDRAWN',version=version+1,updated_at=clock_timestamp() WHERE id=${id}`;await audit(tx,actor,'STANDARD_TRIPLET_WITHDRAWN',{releaseId:id,reason,preserveHistory:true});return {withdrawn:true}})
}
