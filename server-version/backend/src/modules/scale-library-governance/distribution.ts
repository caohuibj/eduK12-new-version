import {hashScaleDefinition} from '../scale/scale-definition'
import {assertLibraryMediaReady} from './media'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {libraryActor,libraryCapabilities,assertLibraryAuthority} from './authority'
import {loadEntry,event} from './service'
import {distributionInput,transitionInput,fail,type LibraryProduct} from './contracts'
import {libraryCatalogSnapshot,libraryCompatibility} from './catalog-adapter'
import {assertScaleLibraryCollectionAllowed} from './collection-guard'
import {type LibraryUseRow,useView} from './usage'
async function target(tx:Prisma.TransactionClient,userId:string,product:LibraryProduct){
  const user=await libraryActor(tx,userId)
  if(product==='TRAINING'){
    if(!['TRAINING','LEGACY'].includes(user.account_domain)||user.role!=='TEACHER'||!user.teacher_approved)fail('目标不是有效的 Training 教师',403)
  }else{
    if(user.account_domain!=='SURVEY')fail('目标不是 Survey 账号',403)
    const qualified=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT user_id AS id FROM survey_researcher_grants WHERE user_id=${userId} AND status IN ('ACTIVE','PENDING_MFA') FOR SHARE`)
    if(!qualified.length)fail('研究者资格不可用',403)
  }
}
export async function grantUse(actorId:string,entryId:string,raw:unknown){
  const input=distributionInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const [header]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`)
    if(!header)fail('条目不存在',404)
    const authority=await assertLibraryAuthority(tx,actorId,header.release_id,'material.distribute',input.product,input.grantId)
    if(input.expectedGrantVersion!==undefined&&authority.version!==input.expectedGrantVersion)fail('平台授权已变化')
    await target(tx,input.userId,input.product)
    await assertScaleLibraryCollectionAllowed(tx,[header.release_id])
    const {entry,submission}=await loadEntry(tx,entryId)
    if(entry.status!=='ACTIVE')fail('该版本不再接受新使用')
    if(!submission.snapshot.mediaManifest)fail('申请缺少固定附件清单')
    await assertLibraryMediaReady(tx,entryId,submission.snapshot.mediaManifest)
    if(!libraryCompatibility(submission.snapshot).supportedEntrypoints.includes(input.product))fail('SCALE_LIBRARY_ENTRYPOINT_NOT_SUPPORTED',400)
    const [prior]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=${input.requestId} FOR SHARE`)
    if(prior){if(prior.entry_id!==entryId||prior.user_id!==input.userId||prior.product!==input.product||prior.issuer_id!==actorId||prior.authority_grant_id!==authority.grantId)fail('请求编号已用于其他授权');return useView(prior)}
    const release=await getContentRelease(tx,entry.release_id,true)
    if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED')fail('该版本不可用于新投放')
    let materialId:string|null=null,surveyId:string|null=null
    if(input.product==='TRAINING'){
      // One immutable runtime reference per approved entry, independent of the
      // author's private Scale lifecycle. No new scorer or editable tool is made.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'library-wrapper:'+entryId}))`)
      let wrapper=await tx.scale.findUnique({where:{libraryEntryId:entryId}})
      if(!wrapper){const definition=submission.snapshot.compiledDefinition
        wrapper=await tx.scale.create({data:{id:randomUUID(),code:'library:'+entryId,name:submission.snapshot.title,
          description:'平台共用库精确版本，只读使用',status:'PUBLISHED',visibility:'COURSE',creatorId:submission.author_id,
          instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:release.content.instrumentVersion,
          definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),
          itemCount:definition.items.length,dimensionCount:definition.scoring.scores.length,
          measurementReleaseId:release.releaseId,libraryEntryId:entryId}})
      }
      // Existing independently issued grants are not silently taken over/revoked.
      const priorMaterial=await tx.materialGrant.findUnique({where:{teacherId_resourceType_resourceId:{teacherId:input.userId,resourceType:'SCALE',resourceId:wrapper.id}}})
      if(priorMaterial)fail('该用户已有独立量表授权，请先明确处理原授权，不能覆盖')
      const grant=await tx.materialGrant.create({data:{teacherId:input.userId,resourceType:'SCALE',resourceId:wrapper.id,grantedBy:actorId}})
      materialId=grant.id
    }else{
      const snapshot=libraryCatalogSnapshot(entryId,release,submission.snapshot)
      surveyId=randomUUID()
      await tx.$executeRaw(Prisma.sql`INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by)
        VALUES(${surveyId},${input.userId},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${canonicalHash(snapshot)},${actorId})`)
    }
    const [row]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`INSERT INTO scale_library_use_grants
      (id,entry_id,user_id,product,issuer_id,authority_grant_id,material_grant_id,survey_tool_grant_id)
      VALUES(${input.requestId},${entryId},${input.userId},${input.product},${actorId},${authority.grantId},${materialId},${surveyId}) RETURNING *`)
    await event(tx,actorId,'USE_GRANTED','分配精确版本，仅使用，不含编辑、改编或再授权',submission.id,entryId,{grantId:row.id,userId:input.userId,product:input.product,authorityGrantId:authority.grantId})
    return useView(row)
  })
}
export async function listUses(actorId:string,entryId:string){
  return prisma.$transaction(async tx=>{
    const caps=await libraryCapabilities(tx,actorId)
    const {entry}=await loadEntry(tx,entryId)
    const products=caps.distributionGrants.filter(g=>g.releaseIds.includes(entry.release_id)).map(g=>g.product)
    const rows=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE entry_id=${entryId}
      AND (${caps.systemAdmin} OR product=ANY(${products}::text[]) OR user_id=${actorId}) ORDER BY created_at DESC,id LIMIT 100`)
    return {list:rows.map(useView)}
  })
}
export async function revokeUse(actorId:string,id:string,raw:unknown){
  const input=transitionInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const actor=await libraryActor(tx,actorId)
    const [header]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`SELECT * FROM scale_library_use_grants WHERE id=${id}`)
    if(!header)fail('授权不存在',404)
    if(header.issuer_id!==actorId&&!actor.systemAdmin)fail('只能撤销本人分发的授权',403)
    const [row]=await tx.$queryRaw<LibraryUseRow[]>(Prisma.sql`UPDATE scale_library_use_grants SET status='REVOKED',version=version+1,reason=${input.reason},revoked_at=clock_timestamp()
      WHERE id=${id} AND status='ACTIVE' AND version=${input.expectedVersion} RETURNING *`)
    if(!row)fail('授权已撤销或版本已变化')
    if(row.material_grant_id)await tx.materialGrant.deleteMany({where:{id:row.material_grant_id,grantedBy:row.issuer_id}})
    if(row.survey_tool_grant_id)await tx.$executeRaw(Prisma.sql`UPDATE survey_tool_grants SET status='REVOKED',revoked_at=clock_timestamp() WHERE id=${row.survey_tool_grant_id} AND status='ACTIVE'`)
    await event(tx,actorId,'USE_REVOKED',input.reason,null,row.entry_id,{grantId:id,policy:'FUTURE_IMPORT_AND_PUBLICATION_ONLY'})
    return useView(row)
  })
}
/** Minimal picker, not the user administration API. Exact distributor scope is
 * checked before any candidate identity leaves the database. */
export async function recipients(actorId:string,entryId:string,input:{product:LibraryProduct;page:number;keyword:string;grantId?:string}){
 return prisma.$transaction(async tx=>{
  const [entry]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`)
  if(!entry)fail('条目不存在',404)
  const caps=await libraryCapabilities(tx,actorId)
  const grant=input.grantId??caps.distributionGrants.find(g=>g.product===input.product&&g.releaseIds.includes(entry.release_id))?.grantId
  await assertLibraryAuthority(tx,actorId,entry.release_id,'material.distribute',input.product,grant)
  const {submission}=await loadEntry(tx,entryId)
  if(!libraryCompatibility(submission.snapshot).supportedEntrypoints.includes(input.product))fail('SCALE_LIBRARY_ENTRYPOINT_NOT_SUPPORTED',400)
  const pattern='%'+input.keyword.replace(/[\\%_]/g,'\\$&')+'%'
  const list=await tx.$queryRaw<Array<{id:string;username:string;name:string|null}>>(Prisma.sql`SELECT u.id,u.username,u.nickname AS name FROM users u
    WHERE u.is_active AND NOT u.is_frozen AND NOT u.must_change_password AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
      AND (u.username ILIKE ${pattern} OR u.nickname ILIKE ${pattern}) AND
      (${input.product}='TRAINING' AND u.account_domain IN ('TRAINING','LEGACY') AND u.role='TEACHER' AND u.teacher_approved
       OR ${input.product}='SURVEY' AND u.account_domain='SURVEY' AND EXISTS(SELECT 1 FROM survey_researcher_grants g WHERE g.user_id=u.id AND g.status IN ('ACTIVE','PENDING_MFA')))
    ORDER BY u.username,u.id LIMIT 26 OFFSET ${(input.page-1)*25}`)
  return {list:list.slice(0,25),page:input.page,hasMore:list.length>25}
 })
}
