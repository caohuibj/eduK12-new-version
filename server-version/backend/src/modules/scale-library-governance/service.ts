import {approveToolEntryPolicies,type ToolEntryProduct,type ToolPolicy} from '../assessment-governance/tool-entry-policy'
import {assertSurveyLibraryManager} from '../survey/admin-role'
import {compileEducationApplicability,readFrozenEducationApplicability} from './education-applicability'
import {buildLibraryMediaManifest,assertLibraryMediaConsent,retainLibrarySubmissionMedia,approveLibraryMedia} from './media'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {libraryCompatibility} from './catalog-adapter'
import {libraryActor,libraryCapabilities,assertLibraryAuthority} from './authority'
import {submissionSource,validateLibraryDependencies,type LibrarySnapshot} from './source'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
import {submissionInput,transitionInput,reviewInput,entryStatusInput,fail,legacyLibraryProduct,type LibrarySourceProduct,type LegacyLibraryProduct} from './contracts'
type Tx=Prisma.TransactionClient
export type SubmissionRow={id:string;release_id:string;product:LibrarySourceProduct;source_id:string;author_id:string;metadata:Prisma.JsonValue;
  dependency_release_ids:string[];snapshot:LibrarySnapshot;snapshot_hash:string;status:string;version:number;reason:string|null;created_at:Date;updated_at:Date}
export type EntryRow={entry_policies?:Array<ToolPolicy&{product:ToolEntryProduct}>;release_version?:string;content_hash?:string;id:string;submission_id:string;release_id:string;status:string;version:number;reason:string|null;created_at:Date;updated_at:Date}
export function sourceMetadataDefaults(snapshot:LibrarySnapshot){
 const d=snapshot.compiledDefinition
 return {title:snapshot.title,author:[d.source.citation??d.source.title,d.source.url].filter(Boolean).join('；').slice(0,500),
  copyright:d.license.note??'',applicability:`作答对象：${d.respondentType}`,
  scoringDescription:d.scoring.scores.map(score=>`${score.label} (${score.key})：${score.source.type==='items'?score.source.aggregation:'由已发布分数计算'}`).join('；').slice(0,4000),
  reportDescription:[d.report.disclaimer,...d.report.limitations].filter(Boolean).join('\n').slice(0,4000)}
}
export const submissionView=(row:SubmissionRow)=>({id:row.id,releaseId:row.release_id,sourceProduct:row.product,product:row.product,sourceId:row.source_id,
  ...libraryCompatibility(row.snapshot,{approved:row.status==='APPROVED',dependencyReleaseIds:row.dependency_release_ids}),educationApplicability:row.snapshot.educationApplicability??null,educationApplicabilityHash:readFrozenEducationApplicability(row.snapshot)?.contractHash??null,mediaManifest:row.snapshot.mediaManifest,metadata:row.metadata,snapshotOrigin:row.snapshot.snapshotOrigin,definitionHash:row.snapshot.definitionHash,dependencyReleaseIds:row.dependency_release_ids,status:row.status,version:row.version,reason:row.reason,createdAt:row.created_at})
// Catalog discovery is not media authorization. Exact manifests remain on
// owner/reviewer submission detail and the separately authorized media endpoints.
export const entryView=(row:EntryRow,submission:SubmissionRow)=>({...submissionView(submission),mediaManifest:undefined,id:row.id,submissionId:row.submission_id,
  entryPolicies:row.entry_policies??[],admittedEntrypoints:(row.entry_policies??[]).filter(p=>p.decision==='APPROVED'&&!p.paused).map(p=>p.product),status:row.status,version:row.version,releaseVersion:row.release_version,contentHash:row.content_hash,reason:row.reason,createdAt:row.created_at})
export async function event(tx:Tx,actorId:string,action:string,reason:string,submissionId:string|null,entryId:string|null,details:unknown={}){
  await tx.$executeRaw(Prisma.sql`INSERT INTO scale_library_events(id,actor_id,action,reason,submission_id,entry_id,details)
    VALUES(${randomUUID()},${actorId},${action},${reason},${submissionId},${entryId},${JSON.stringify(details)}::jsonb)`)
}
export async function loadEntry(tx:Tx,id:string,write=false){
  const rows=await tx.$queryRaw<EntryRow[]>(Prisma.sql`SELECT e.*,r.version AS release_version,r.content_hash,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('product',p.product,'decision',p.decision,'paused',p.paused,'reason',p.reason,'version',p.version) ORDER BY p.product),'[]'::jsonb) FROM survey_tool_policies p WHERE p.resource_key='release:'||e.release_id AND p.fingerprint=r.content_hash) AS entry_policies FROM scale_library_entries e JOIN measurement_content_releases r ON r.id=e.release_id WHERE e.id=${id} ${write?Prisma.sql`FOR UPDATE OF e`:Prisma.sql`FOR SHARE OF e,r`}`)
  if(!rows[0])fail('共用库条目不存在',404)
  const [submission]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions WHERE id=${rows[0].submission_id} FOR SHARE`)
  if(!submission||canonicalHash(submission.snapshot)!==submission.snapshot_hash)fail('共用库快照校验失败')
  return {entry:rows[0],submission}
}
export const readCapabilities=(actorId:string)=>prisma.$transaction(tx=>libraryCapabilities(tx,actorId))
export async function readSources(actorId:string,product:LegacyLibraryProduct,sourceId:string){
  legacyLibraryProduct.parse(product)
  return prisma.$transaction(async tx=>{
    await libraryActor(tx,actorId)
    const rows=await tx.$queryRaw<Array<{id:string;version:string;content_hash:string;published_at:Date;provenance:Record<string,unknown>}>>(Prisma.sql`
      SELECT id,version,content_hash,published_at,provenance FROM measurement_content_releases WHERE family='SCALE' AND layer='MEASUREMENT'
      AND scope->>'kind'='PRIVATE' AND scope->>'ownerId'=${actorId} AND scope->>'product'=${product}
      AND content_key LIKE ${'%:'+sourceId} ORDER BY published_at DESC,id LIMIT 100`)
    const releases=[]
    let title=''
    for(const row of rows){
      try{const source=await submissionSource(tx,actorId,product,row.id);title=title||source.snapshot.title
        const mediaManifest=await buildLibraryMediaManifest(tx,actorId,source.snapshot,source.release)
        releases.push({releaseId:row.id,version:row.version,contentHash:row.content_hash,publishedAt:row.published_at,title:source.snapshot.title,mediaManifest,...libraryCompatibility(source.snapshot),eligible:true,unavailableReason:null,defaults:sourceMetadataDefaults(source.snapshot)})
      }catch(e){if(!(e instanceof Error&&'statusCode'in e))throw e
        releases.push({releaseId:row.id,version:row.version,contentHash:row.content_hash,publishedAt:row.published_at,title:(row.provenance.authoringSnapshot as {title?:string})?.title??'',eligible:false,unavailableReason:e.message})}
    }
    return {sourceId,product,releases,defaults:{title,author:'',copyright:'',applicability:'',scoringDescription:'',reportDescription:''}}
  })
}
export async function submit(actorId:string,product:LegacyLibraryProduct,raw:unknown){
  legacyLibraryProduct.parse(product)
  return prisma.$transaction(tx=>submitInTransaction(tx,actorId,product,raw))
}
/** Shared submission core; current source authority belongs in this same transaction. */
export async function submitInTransaction(tx:Tx,actorId:string,product:LibrarySourceProduct,raw:unknown){
  const input=submissionInput.parse(raw)
  await libraryActor(tx,actorId)
  const source=await submissionSource(tx,actorId,product,input.releaseId)
  const dependencies=await validateLibraryDependencies(tx,actorId,source.release,input.dependencyReleaseIds)
  const manifest=await buildLibraryMediaManifest(tx,actorId,source.snapshot,source.release,dependencies)
  assertLibraryMediaConsent(manifest,input.mediaConsent)
  source.snapshot.mediaManifest=manifest
  if(input.educationApplicability){
    const declared=compileEducationApplicability(input.educationApplicability)
    source.snapshot.educationApplicability=declared.declaration
    source.snapshot.educationApplicabilityHash=declared.contractHash
    source.snapshot.educationApplicabilityCompilerVersion=declared.compilerVersion
  }
  await assertScaleLibraryCollectionAllowed(tx,[input.releaseId],product==='TRAINING'?[source.sourceId]:[])
  const [prior]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions WHERE id=${input.requestId} FOR SHARE`)
  if(prior){if(prior.author_id!==actorId||prior.product!==product||prior.source_id!==source.sourceId||prior.release_id!==input.releaseId||canonicalHash(prior.metadata)!==canonicalHash(input.metadata)||canonicalHash(prior.dependency_release_ids)!==canonicalHash(input.dependencyReleaseIds)||canonicalHash(prior.snapshot.educationApplicability??null)!==canonicalHash(input.educationApplicability??null))fail('请求编号已用于其他申请')
    return submissionView(prior)}
  const [row]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`INSERT INTO scale_library_submissions
    (id,release_id,product,source_id,author_id,metadata,dependency_release_ids,snapshot,snapshot_hash)
    VALUES(${input.requestId},${input.releaseId},${product},${source.sourceId},${actorId},${JSON.stringify(input.metadata)}::jsonb,
      ${input.dependencyReleaseIds}::text[],${JSON.stringify(source.snapshot)}::jsonb,${canonicalHash(source.snapshot)}) RETURNING *`)
  await retainLibrarySubmissionMedia(tx,row.id,manifest)
  await event(tx,actorId,'SUBMITTED','作者申请进入平台共用库',row.id,null,{releaseId:input.releaseId})
  return submissionView(row)
}
export async function listSubmissions(actorId:string,sourceId?:string){
  return prisma.$transaction(async tx=>{
    const capabilities=await libraryCapabilities(tx,actorId)
    const reviewIds=capabilities.reviewGrants.flatMap(g=>g.releaseIds)
    const rows=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions
      WHERE (author_id=${actorId} OR ${capabilities.systemAdmin} OR release_id=ANY(${reviewIds}::text[]))
      AND (${sourceId??null}::text IS NULL OR source_id=${sourceId??null}) ORDER BY created_at DESC,id LIMIT 100`)
    return {list:rows.map(submissionView)}
  })
}
export async function withdraw(actorId:string,id:string,raw:unknown){
  const input=transitionInput.parse(raw)
  return prisma.$transaction(async tx=>{
    await libraryActor(tx,actorId)
    const rows=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`UPDATE scale_library_submissions SET status='WITHDRAWN',reason=${input.reason},version=version+1,updated_at=clock_timestamp()
      WHERE id=${id} AND author_id=${actorId} AND status='SUBMITTED' AND version=${input.expectedVersion} RETURNING *`)
    if(!rows[0])fail('申请已处理或不属于你')
    await event(tx,actorId,'SUBMISSION_WITHDRAWN',input.reason,id,null)
    return submissionView(rows[0])
  })
}
export async function review(actorId:string,id:string,raw:unknown){
  const input=reviewInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const [header]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions WHERE id=${id}`)
    if(!header)fail('申请不存在',404)
    await assertLibraryAuthority(tx,actorId,header.release_id,'catalog.manage','TRAINING',input.grantId)
    await assertScaleLibraryCollectionAllowed(tx,[header.release_id],header.product==='TRAINING'?[header.source_id]:[])
    const [row]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions WHERE id=${id} FOR UPDATE`)
    if(row.status!=='SUBMITTED'||row.version!==input.expectedVersion)fail('申请状态或版本已变化')
    const release=await getContentRelease(tx,row.release_id,true)
    if(!release||release.status!=='PUBLISHED'||canonicalHash(row.snapshot)!==row.snapshot_hash)fail('申请版本不再可审批')
    if(input.decision==='APPROVE'){
      readFrozenEducationApplicability(row.snapshot)
      await validateLibraryDependencies(tx,row.author_id,release,row.dependency_release_ids)
    }
    const status=input.decision==='APPROVE'?'APPROVED':'RETURNED'
    const [updated]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`UPDATE scale_library_submissions SET status=${status},reason=${input.reason},version=version+1,updated_at=clock_timestamp() WHERE id=${id} RETURNING *`)
    let entryId:null|string=null
    if(input.decision==='APPROVE'){entryId=randomUUID();await tx.$executeRaw(Prisma.sql`INSERT INTO scale_library_entries(id,submission_id,release_id) VALUES(${entryId},${id},${row.release_id})`)
      if(!row.snapshot.mediaManifest)fail('申请缺少固定附件清单，请重新提交')
      await approveLibraryMedia(tx,entryId,id,row.snapshot.mediaManifest)
      if(input.allowedProducts!==undefined||row.product==='TRAINING'||row.product==='SURVEY'){
        const products=await approveToolEntryPolicies(tx,{resourceKey:'release:'+row.release_id,fingerprint:release.contentHash},input.allowedProducts,actorId,input.reason)
        const supported=libraryCompatibility(row.snapshot).supportedEntrypoints
        if(products.some(product=>!supported.includes(product)))fail('选择的入口尚无受支持的工具适配器',400)
      }
    }
    await event(tx,actorId,status,input.reason,id,entryId,{grantId:input.grantId??null,releaseId:row.release_id,allowedProducts:input.allowedProducts??[]})
    return {...submissionView(updated),entryId}
  })
}
export async function changeEntryProducts(actorId:string,id:string,raw:unknown){
 const input=transitionInput.extend({allowedProducts:legacyLibraryProduct.array().min(1).max(2).refine(v=>new Set(v).size===v.length)}).strict().parse(raw)
 return prisma.$transaction(async tx=>{
  const [header]=await tx.$queryRaw<Array<{release_id:string}>>`SELECT release_id FROM scale_library_entries WHERE id=${id}`
  if(!header)fail('共用库条目不存在',404)
  await assertLibraryAuthority(tx,actorId,header.release_id,'catalog.manage','TRAINING')
  const {entry,submission}=await loadEntry(tx,id,true)
  if(entry.version!==input.expectedVersion||entry.status!=='ACTIVE')fail('条目状态或版本已变化')
  const supported=libraryCompatibility(submission.snapshot).supportedEntrypoints
  if(input.allowedProducts.some(product=>!supported.includes(product)))fail('选择的入口尚无受支持的工具适配器',400)
  const products=await approveToolEntryPolicies(tx,{resourceKey:'release:'+entry.release_id,fingerprint:entry.content_hash!},input.allowedProducts,actorId,input.reason)
  await tx.$executeRaw`UPDATE scale_library_entries SET version=version+1,updated_at=clock_timestamp() WHERE id=${id}`
  await event(tx,actorId,'ENTRY_PRODUCTS_CHANGED',input.reason,submission.id,id,{allowedProducts:products,collectionEffect:'STOP_NEW_ADMISSION_ONLY'})
  const updated=await loadEntry(tx,id)
  return entryView(updated.entry,updated.submission)
 })
}
export async function listEntries(actorId:string,entryId?:string,pagination?:{offset:number;limit:number},product?:LegacyLibraryProduct){
  const limit=pagination?.limit??100,offset=pagination?.offset??0
  if(!Number.isInteger(limit)||limit<0||limit>100||!Number.isSafeInteger(offset)||offset<0)fail('目录分页参数无效',400)
  return prisma.$transaction(async tx=>{
    const capabilities=await libraryCapabilities(tx,actorId)
    const ids=[...capabilities.reviewGrants.flatMap(g=>g.releaseIds),...capabilities.distributionGrants.filter(g=>!product||g.product===product).flatMap(g=>g.releaseIds)]
    // Filter authoritative visibility before OFFSET/LIMIT, not after a page.
    const entries=await tx.$queryRaw<EntryRow[]>(Prisma.sql`SELECT e.* FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id
      JOIN measurement_content_releases r ON r.id=e.release_id
      WHERE (${entryId??null}::text IS NULL OR e.id=${entryId??null}) AND (${capabilities.systemAdmin}
      OR EXISTS(SELECT 1 FROM survey_tool_policies p WHERE p.resource_key='release:'||e.release_id AND p.fingerprint=r.content_hash
        AND p.decision='APPROVED' AND (${product??null}::text IS NULL OR p.product=${product??null})
        AND (p.product=ANY(${capabilities.entryAdminProducts}::text[]) OR e.release_id=ANY(${ids}::text[])))
      OR EXISTS(SELECT 1 FROM scale_library_use_grants g JOIN survey_tool_policies p ON p.resource_key='release:'||e.release_id
        AND p.fingerprint=r.content_hash AND p.product=g.product AND p.decision='APPROVED' AND NOT p.paused
        WHERE g.entry_id=e.id AND g.user_id=${actorId} AND g.status='ACTIVE' AND e.status='ACTIVE'
          AND (${product??null}::text IS NULL OR g.product=${product??null})))
      ORDER BY e.created_at DESC,e.id LIMIT ${limit+1} OFFSET ${offset}`)
    const list=[]
    for(const e of entries.slice(0,limit)){const {entry,submission}=await loadEntry(tx,e.id);list.push(entryView(entry,submission))}
    return {list,hasMore:entries.length>limit}
  })
}
export async function stopCollection(tx:Tx,actorId:string,targetKind:'RELEASE'|'TRAINING_SCALE'|'SURVEY_INSTRUMENT',targetId:string,reason:string,grantId?:string){
  if(!(await libraryActor(tx,actorId)).systemAdmin)fail('共享工具紧急停用仅限系统管理员',403)
  if(targetKind==='RELEASE')await assertLibraryAuthority(tx,actorId,targetId,'catalog.manage','TRAINING',grantId)
  else if(!(await libraryActor(tx,actorId)).systemAdmin)fail('旧量表紧急停用需要系统管理员',403)
  const exists=targetKind==='RELEASE'
    ?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM measurement_content_releases WHERE id=${targetId} AND family='SCALE' AND layer='MEASUREMENT'`)
    :targetKind==='TRAINING_SCALE'?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM scales WHERE id=${targetId}`)
    :await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_instrument_drafts WHERE id=${targetId} AND kind='SCALE'`)
  if(!exists.length)fail('紧急停用对象不存在',404)
  if(targetKind==='RELEASE')await tx.$executeRaw(Prisma.sql`UPDATE measurement_content_releases SET status=status WHERE id=${targetId}`)
  else if(targetKind==='TRAINING_SCALE')await tx.$executeRaw(Prisma.sql`UPDATE scales SET id=id WHERE id=${targetId}`)
  else await tx.$executeRaw(Prisma.sql`UPDATE survey_instrument_drafts SET id=id WHERE id=${targetId}`)
  const changed=await tx.$executeRaw(Prisma.sql`INSERT INTO scale_library_emergency_stops(target_kind,target_id,actor_id,reason)
    VALUES(${targetKind},${targetId},${actorId},${reason}) ON CONFLICT DO NOTHING`)
  if(changed)await event(tx,actorId,'EMERGENCY_DISABLED',reason,null,null,{targetKind,targetId,grantId:grantId??null})
  return {stopped:true,changed:changed===1,targetKind,targetId}
}
export async function changeEntryStatus(actorId:string,id:string,raw:unknown){
  const input=entryStatusInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const [header]=await tx.$queryRaw<EntryRow[]>(Prisma.sql`SELECT * FROM scale_library_entries WHERE id=${id}`)
    if(!header)fail('条目不存在',404)
    if(!(await libraryActor(tx,actorId)).systemAdmin)fail('共享工具全局下架或紧急停用仅限系统管理员',403)
    await assertLibraryAuthority(tx,actorId,header.release_id,'catalog.manage','TRAINING',input.grantId)
    if(input.status==='EMERGENCY_DISABLED')await stopCollection(tx,actorId,'RELEASE',header.release_id,input.reason,input.grantId)
    const {entry,submission}=await loadEntry(tx,id,true)
    if(entry.version!==input.expectedVersion||entry.status==='EMERGENCY_DISABLED'||entry.status==='WITHDRAWN'&&input.status==='WITHDRAWN')fail('条目状态或版本已变化')
    const [updated]=await tx.$queryRaw<EntryRow[]>(Prisma.sql`UPDATE scale_library_entries SET status=${input.status},version=version+1,reason=${input.reason},updated_at=clock_timestamp() WHERE id=${id} RETURNING *`)
    await event(tx,actorId,input.status,input.reason,submission.id,id,{policy:input.status==='WITHDRAWN'?'FUTURE_USE_ONLY':'STOP_NEW_COLLECTION_KEEP_FINAL'})
    return entryView({...updated,release_version:entry.release_version,content_hash:entry.content_hash},submission)
  })
}

/** Owner/reviewer-only exact content. Never public catalog or answer data. */
export async function readSubmission(actorId:string,id:string,grantId?:string,surveyManagement=false){
 return prisma.$transaction(async tx=>{
  const actor=await libraryActor(tx,actorId)
  const [row]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions WHERE id=${id} FOR SHARE`)
  if(!row)fail('申请不存在',404)
  if(surveyManagement)await assertSurveyLibraryManager(tx,actorId)
  if(!surveyManagement&&row.author_id!==actorId&&!actor.systemAdmin){
   const caps=await libraryCapabilities(tx,actorId)
   const grant=grantId??caps.reviewGrants.find(g=>g.releaseIds.includes(row.release_id))?.grantId
   await assertLibraryAuthority(tx,actorId,row.release_id,'catalog.manage','TRAINING',grant)
  }
  const release=await getContentRelease(tx,row.release_id,true)
  if(!release||canonicalHash(row.snapshot)!==row.snapshot_hash)fail('申请快照校验失败')
  const dependencies=[]
  for(const id of row.dependency_release_ids){const d=await getContentRelease(tx,id,true);if(!d)fail('依赖版本不存在');dependencies.push({releaseId:d.releaseId,layer:d.layer,version:d.version,contentHash:d.contentHash,content:d.content})}
  return {...submissionView(row),snapshot:row.snapshot,release:{releaseId:release.releaseId,version:release.version,contentHash:release.contentHash},dependencies}
 })
}

export async function prepareMediaManifest(actorId:string,product:LegacyLibraryProduct,input:{releaseId:string;dependencyReleaseIds:string[]}){
 legacyLibraryProduct.parse(product)
 return prisma.$transaction(async tx=>{
  await libraryActor(tx,actorId)
  const source=await submissionSource(tx,actorId,product,input.releaseId)
  const dependencies=await validateLibraryDependencies(tx,actorId,source.release,input.dependencyReleaseIds)
  return {mediaManifest:await buildLibraryMediaManifest(tx,actorId,source.snapshot,source.release,dependencies)}
 })
}
