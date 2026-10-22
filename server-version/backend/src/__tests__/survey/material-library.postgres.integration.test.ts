import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma} from '../../config/database'
import {listSurveyMaterials,materialQuery,ownSurveyMaterial,renameSurveyMaterial} from '../../modules/survey/material-library.service'
import {assertSurveyMediaOwned} from '../../modules/survey/media.references'
const suite=process.env.SURVEY_MATERIAL_LIBRARY_ACCEPTANCE==='1'?describe:describe.skip
const ids:string[]=[],run='synthetic-media-'+randomUUID();let userId:string,pid:string
const create=async(mimeType:string,library=true,owner=userId)=>{
 const id=randomUUID();ids.push(id)
 return prisma.storedAsset.create({data:{id,objectKey:'synthetic/'+id,ownerId:owner,scopeId:'survey-library:'+owner,accessScope:'PRIVATE',originalName:run+'.'+(mimeType==='application/pdf'?'pdf':mimeType==='video/mp4'?'mp4':'png'),mimeType,sizeBytes:100,sha256:'a'.repeat(64),...(library?{references:{create:{entityType:'SurveyResearcherMedia',entityId:owner,field:'library'}}}:{})}})
}
suite('Survey private material library — isolated synthetic records',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);expect(url.hostname).toBe('127.0.0.1');expect(url.port).toBe('5557');expect(url.pathname).toBe('/survey_mac_manual_20261022')
  const [user]=await prisma.$queryRaw<Array<{id:string}>>`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_mfa_credentials m ON m.user_id=u.id WHERE u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen AND g.status='ACTIVE' AND m.enabled AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp()) LIMIT 1`
  if(!user)throw new Error('An existing local synthetic researcher is required; no account will be created')
  userId=user.id;pid=randomUUID();await prisma.surveyProject.create({data:{id:pid,ownerUserId:userId,title:run,collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{if(ids.length){await prisma.assetReference.deleteMany({where:{assetId:{in:ids}}});await prisma.storedAsset.deleteMany({where:{id:{in:ids}}})}if(pid)await prisma.surveyProject.delete({where:{id:pid}});await prisma.$disconnect()})
 it('lists only independently retained or project-scoped own files, with search, kind, source and paging',async()=>{
  await create('image/png');await create('video/mp4');await create('application/pdf');await create('image/png',false);await create('image/png',true,randomUUID())
  const scoped=await create('image/png',false);await prisma.storedAsset.update({where:{id:scoped.id},data:{scopeId:pid}})
  const query=materialQuery.parse({keyword:run});const result=await listSurveyMaterials(userId,query)
  expect(result.total).toBe(4);expect(result.list).toHaveLength(4);expect(result.list.every(row=>row.source==='owned')).toBe(true)
  expect((await listSurveyMaterials(userId,{...query,kind:'document'})).list.map(row=>row.mimeType)).toEqual(['application/pdf'])
  expect((await listSurveyMaterials(userId,{...query,source:'granted'})).total).toBe(0)
  expect((await listSurveyMaterials(userId,{...query,page:2})).list).toEqual([])
 })
 it('denies unrelated owner files, cross-owner reads, unqualified principals and deleted assets',async()=>{
  const own=await create('image/png'),unrelated=await create('image/png',false)
  await expect(prisma.$transaction(tx=>ownSurveyMaterial(tx,userId,unrelated.id))).rejects.toMatchObject({statusCode:404})
  await expect(prisma.$transaction(tx=>ownSurveyMaterial(tx,randomUUID(),own.id))).rejects.toMatchObject({statusCode:403})
  await expect(listSurveyMaterials(randomUUID(),materialQuery.parse({}))).rejects.toMatchObject({statusCode:403})
  await prisma.storedAsset.update({where:{id:own.id},data:{deletedAt:new Date()}})
  await expect(prisma.$transaction(tx=>ownSurveyMaterial(tx,userId,own.id))).rejects.toMatchObject({statusCode:404})
 })
 it('renames only accessible own metadata and allows private library images in authoring without weakening rights',async()=>{
  const own=await create('image/png');await renameSurveyMaterial(userId,own.id,run+' renamed')
  expect((await prisma.storedAsset.findUniqueOrThrow({where:{id:own.id}})).originalName).toBe(run+' renamed')
  const image={asset:{assetId:own.id,contentHash:own.sha256,mimeType:own.mimeType},altText:'合成图',rightsStatus:'self_authored' as const,rightsNote:'合成验证'}
  const unit={kind:'FORM' as const,definition:{schemaVersion:2 as const,pages:[{pageKey:'p',title:'p',questions:[{itemKey:'q',type:'SINGLE' as const,prompt:'q',required:true,options:[],rows:[],image}]}]}}
  expect(await prisma.$transaction(tx=>assertSurveyMediaOwned(tx,userId,pid,[unit]))).toHaveLength(1)
  image.rightsNote='';await expect(prisma.$transaction(tx=>assertSurveyMediaOwned(tx,userId,pid,[unit]))).rejects.toMatchObject({statusCode:403})
 })
})
