import {Prisma} from '@prisma/client'
import {privateFormRuntimeDefinition,privateFormRuntimeItem} from '../../modules/education-tools/private-tool.form-runtime-adapter'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {csrfProtection} from '../../middleware/csrf'
import campusRouter from '../../modules/campus/composite.routes'
import {authenticateHuiteacher,authenticateSchool} from '../../middleware/auth'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {setupPrivateScaleExecutionFixture} from './educationPrivateScaleExecutionFixture'
import {completeEducationLibraryScaleExecution} from './educationLibraryReportFixture'
import {educationTeacherScaleReportRouter} from '../../modules/reporting/education-scale-report.routes'
import {randomUUID} from 'node:crypto'
import {readFile,rm} from 'node:fs/promises'
import {promises as fileSystem} from 'node:fs'
import {UPLOAD_STAGING_ROOT} from '../../utils/uploadTemp'
import {resolve} from 'node:path'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupPrivateFormExecutionFixture,privateExecutionFormDefinition} from './educationPrivateFormExecutionFixture'
import {storeAsset,getLocalAssetPath} from '../../services/assetStorage'
import {privateToolMediaScope,registerPrivateToolImage,registerOwnedPrivateToolMaterial} from '../../modules/education-tools/private-tool.media'
import * as tools from '../../modules/education-tools/private-tool.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState} from '../../modules/composite/composite.service'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import teacherRouter from '../../modules/huiteacher/privateFormRuntime.routes'
import type {AssessmentMaterial} from '../../modules/assessment-media/material'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
const localFiles:string[]=[]
async function cookie(userId:string,product:'HUITEACHER'|'HUISCHOOL'='HUITEACHER',cookieProduct=product){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}})
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',sessionProduct:product,mfaVerifiedAt:Math.floor(Date.now()/1000)})
 const csrf='synthetic-material-csrf'
 return {cookie:`${cookieProduct==='HUITEACHER'?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${product==='HUITEACHER'?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf}
}
suite('Education private materials real frozen Teacher consumer authorization',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/campus',campusRouter);app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'));app.use('/api/huiteacher/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'));app.use('/api/huiteacher',teacherRouter);app.use('/api/huiteacher',educationTeacherScaleReportRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server)await new Promise<void>(done=>server.close(()=>done()));for(const path of localFiles)await rm(path,{force:true});await db?.$disconnect()})
 it.each(['TEACHER','SCHOOL'] as const)('%s delivers all three types from the actual frozen DTO and rejects foreign actors, attempts, realm and later-version assets',async product=>{
  const sessionProduct=product==='TEACHER'?'HUITEACHER' as const:'HUISCHOOL' as const,wrongProduct=product==='TEACHER'?'HUISCHOOL' as const:'HUITEACHER' as const
  // The DB sealing projection must equal the one education compiler exactly.
  const plain=privateExecutionFormDefinition().pages[0].questions[0]
  const image={asset:{assetId:randomUUID(),contentHash:'a'.repeat(64),mimeType:'image/png' as const},altText:'Exact alt text',rightsStatus:'self_authored' as const,rightsNote:'Exact rights note'}
  for(const question of [plain,{...plain,image},{...plain,image:{...image,caption:''}},{...plain,image:{...image,caption:'Original caption'},materials:[{asset:{assetId:randomUUID(),contentHash:'b'.repeat(64),mimeType:'application/pdf' as const},name:'Existing PDF',rightsStatus:'authorized' as const,rightsNote:'Existing rights'}]}]){
   const [row]=await db.$queryRaw<Array<{projection:unknown}>>(Prisma.sql`SELECT education_private_form_runtime_question(${JSON.stringify(question)}::jsonb) AS projection`)
   expect(row.projection).toEqual(privateFormRuntimeDefinition(question))
  }
  const fixtures=[
   {mimeType:'image/png' as const,name:'pixel.png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNQKXYGAAGZANtCzzESAAAAAElFTkSuQmCC','base64')},
   {mimeType:'video/mp4' as const,name:'clip.mp4',buffer:await readFile(resolve(process.cwd(),'../test-videos/test-720p.mp4'))},
   {mimeType:'application/pdf' as const,name:'note.pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Count 0/Kids []>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF')},
  ]
  const materials:AssessmentMaterial[]=[]
  let originToolId=''
  const f=await setupPrivateFormExecutionFixture(db,product,'SELF',1,async(context,toolId)=>{
   const definition=privateExecutionFormDefinition()
   const origin=await tools.createPrivateTool(context,{kind:'FORM',title:'Original owner library'})
   originToolId=origin.id
   for(const fixture of fixtures){
    const stored=await storeAsset({...fixture,originalName:fixture.name,ownerId:context.principal.userId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(context,origin.id),provider:'local'})
    localFiles.push(getLocalAssetPath(stored.objectKey))
    const asset={assetId:stored.id,contentHash:stored.sha256,mimeType:fixture.mimeType}
    await registerPrivateToolImage(context,origin.id,asset)
    await registerOwnedPrivateToolMaterial(context,toolId,asset)
    materials.push({asset,name:fixture.name,rightsStatus:'self_authored',rightsNote:'Synthetic owned test fixture'})
   }
   // The legacy image is deliberately not a materials item until the compiler projection.
   definition.pages[0].questions[0].image={asset:materials[0].asset as any,altText:'pixel.png',rightsStatus:'self_authored',rightsNote:'Synthetic owned test fixture'}
   definition.pages[0].questions[0].materials=materials.slice(1)
   await tools.updatePrivateTool(context,origin.id,{expectedRevision:origin.revision,title:origin.title,definition})
   return definition
  })
  // A caller cannot erase or forge the media projection and seal a new runtime.
  // All expected content still comes from the immutable source version, not input.
  const version=await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:f.source.version.id}})
  const original=await db.compositeAssessment.findUniqueOrThrow({where:{creationKey:f.track.resourceKey}})
  for(const mutation of ['omit','hash','caption','rights'] as const){
   await expect(db.$transaction(async tx=>{
    const candidate=await tx.compositeAssessment.create({data:{code:'internal-form-build-'+randomUUID(),name:version.title,createdBy:version.ownerUserId,
     productKind:'ORGANIZATION_RESOURCE',status:'DRAFT',publicEnabled:false,copyable:false}})
    let position=0
    for(const [pageIndex,page] of (version.definition as unknown as ReturnType<typeof privateExecutionFormDefinition>).pages.entries()){
     const section=await tx.compositeFormSection.create({data:{compositeAssessmentId:candidate.id,title:page.title,description:page.description??null,position:pageIndex}})
     for(const [index,question] of page.questions.entries()){
      const item=privateFormRuntimeItem(question,randomUUID(),position++,index),definition=structuredClone(item.formDefinition) as any
      if(pageIndex===0&&index===0){
       if(mutation==='omit')delete definition.materials
       if(mutation==='hash')definition.materials[0].asset.contentHash='0'.repeat(64)
       if(mutation==='caption')definition.materials[0].caption='Forged caption'
       if(mutation==='rights')definition.materials[0].rightsNote='Forged rights'
      }
      await tx.compositeAssessmentItem.create({data:{id:item.id,compositeAssessmentId:candidate.id,type:'FORM',position:item.position,required:item.required,
       formType:item.formType,formLabel:item.formLabel,formSectionId:section.id,formSectionPosition:index,
       formOptions:item.formOptions as Prisma.InputJsonValue,formPolicy:item.formPolicy as Prisma.InputJsonValue,formDefinition:definition}})
     }
    }
    const snapshot={schemaVersion:1,compositeId:candidate.id,units:[]}
    await tx.compositeAssessment.update({where:{id:candidate.id},data:{code:original.code,creationKey:original.creationKey,creationHash:original.creationHash,
     trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
   })).rejects.toThrow('PRIVATE_FORM_ITEM_SOURCE_MISMATCH')
  }
  await tools.updatePrivateTool(f.context,originToolId,{expectedRevision:2,title:'Original owner library cleared',definition:privateExecutionFormDefinition()})
  const authorBase=`${base}/api/${product==='TEACHER'?'huiteacher':'campus'}/organizations/${f.organizationId}/private-tools/${f.source.draft.id}`,authorHeaders=await cookie(f.managerUserId,sessionProduct)
  // Explicit local-only infrastructure substitute, never a production threshold override.
  // The real 6 GiB admission probe is separately known to reject this small runner.
  expect(fixtures.reduce((total,item)=>total+item.buffer.length,0)).toBeLessThan(1024*1024)
  const realStatfs=fileSystem.statfs.bind(fileSystem)
  const capacityProbe=process.env.EDUCATION_MATERIAL_CAPACITY_PROBE_STUB==='true'
   ?vi.spyOn(fileSystem,'statfs').mockImplementation((async(path,options)=>{
     const actual=await realStatfs(path,options as any)
     if(String(path)!==UPLOAD_STAGING_ROOT)return actual
     if(options?.bigint!==true)throw Error('Unexpected staging capacity probe mode')
     return {...actual,bavail:BigInt(8*1024**3)/BigInt(actual.bsize)}
    }) as typeof fileSystem.statfs):undefined
  try{
  for(const fixture of fixtures){
   const body=new FormData();body.append('material',new Blob([fixture.buffer],{type:fixture.mimeType}),fixture.name)
   const invalidCsrf=await fetch(authorBase+'/materials',{method:'POST',headers:{cookie:authorHeaders.cookie},body});expect(invalidCsrf.status).toBe(403)
   const uploaded=await fetch(authorBase+'/materials',{method:'POST',headers:authorHeaders,body})
   expect(uploaded.status).toBe(200);const result=await uploaded.json()
   const stored=await db.storedAsset.findUniqueOrThrow({where:{id:result.data.assetId}});localFiles.push(getLocalAssetPath(stored.objectKey))
   expect(stored).toMatchObject({ownerId:f.managerUserId,scopeId:privateToolMediaScope(f.context,f.source.draft.id)})
   const catalog=await fetch(authorBase+'/materials?kind=all&page=1',{headers:authorHeaders})
   expect(catalog.status).toBe(200);expect(JSON.stringify(await catalog.json())).toContain(result.data.assetId)
   const content=await fetch(authorBase+'/assets/'+result.data.assetId+'/content',{headers:authorHeaders})
   expect(content.status).toBe(200);expect(Buffer.from(await content.arrayBuffer())).toEqual(fixture.buffer)
   expect((await fetch(authorBase+'/materials',{headers:await cookie(f.participantUserId,sessionProduct)})).status).toBe(403)
  }
  }finally{capacityProbe?.mockRestore()}
  const started=await startAssessmentRunExecution({executionId:f.executionId,actorUserId:f.participantUserId})
  if(started.state!=='STARTED'||started.runtimeBindingKind!=='COMPOSITE')throw Error('Expected actual started private FORM')
  const attemptId=started.runtimeBindingRef,state=await getAttemptState(attemptId,{userId:f.participantUserId})
  const sectionId=state.currentItem.formSectionId
  expect(state.currentItem.answers[0].formDefinition.materials.map((item:any)=>item.asset)).toEqual(materials.map(item=>item.asset))
  expect(state.currentItem.answers[0].formDefinition.materials[0]).not.toHaveProperty('rightsNote')
  const headers=await cookie(f.participantUserId,sessionProduct),path=(assetId:string,attempt=attemptId,section=sectionId)=>`${base}/api/${product==='TEACHER'?'huiteacher/private-form-composite-attempts':'campus/composite-attempts'}/${attempt}/form-sections/${section}/assets/${assetId}/content`
  for(const [index,material] of materials.entries()){
   const response=await fetch(path(material.asset.assetId),{headers})
   expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain(material.asset.mimeType)
   expect(Buffer.from(await response.arrayBuffer())).toEqual(fixtures[index].buffer)
   expect((await fetch(path(material.asset.assetId),{headers:await cookie(f.managerUserId,sessionProduct)})).status).toBe(404)
   expect((await fetch(path(material.asset.assetId),{headers:await cookie(f.participantUserId,wrongProduct,sessionProduct)})).status).toBe(401)
   expect((await fetch(path(material.asset.assetId,randomUUID()),{headers})).status).toBe(404)
   expect((await fetch(path(material.asset.assetId,attemptId,randomUUID()),{headers})).status).toBe(400)
  }
  const later=await storeAsset({buffer:fixtures[2].buffer,originalName:'later.pdf',mimeType:'application/pdf',ownerId:f.managerUserId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(f.context,f.source.draft.id),provider:'local'})
  localFiles.push(getLocalAssetPath(later.objectKey));const laterAsset={assetId:later.id,contentHash:later.sha256,mimeType:'application/pdf' as const}
  await registerPrivateToolImage(f.context,f.source.draft.id,laterAsset)
  const definition=privateExecutionFormDefinition();definition.pages[0].questions[0].materials=[{asset:laterAsset,name:'Later',rightsStatus:'self_authored',rightsNote:'Later fixture'}]
  const saved=await tools.updatePrivateTool(f.context,f.source.draft.id,{expectedRevision:f.source.draft.revision,title:'Later',definition})
  await tools.freezePrivateTool(f.context,f.source.draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  expect((await fetch(path(later.id),{headers})).status).toBe(400)
  expect((await fetch(path(materials[0].asset.assetId),{headers})).status).toBe(200)
 })
 it('selects report materials only after actual FINAL and current report permission, never the stimulus library',async()=>{
  const materials:AssessmentMaterial[]=[]
  const payloads=[Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNQKXYGAAGZANtCzzESAAAAAElFTkSuQmCC','base64'),await readFile(resolve(process.cwd(),'../test-videos/test-720p.mp4')),Buffer.from('%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Count 0/Kids []>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF')]
  const mimeTypes=['image/png','video/mp4','application/pdf'] as const
  const f=await setupPrivateScaleExecutionFixture(db,'TEACHER','SELF',1,async(context,toolId,definition)=>{
   for(const [index,mimeType] of mimeTypes.entries()){
    const stored=await storeAsset({buffer:payloads[index],originalName:'report-'+index,mimeType,ownerId:context.principal.userId,
     accessScope:'PRIVATE',scopeId:privateToolMediaScope(context,toolId),provider:'local'})
    localFiles.push(getLocalAssetPath(stored.objectKey));const asset={assetId:stored.id,contentHash:stored.sha256,mimeType}
    await registerPrivateToolImage(context,toolId,asset)
    materials.push({asset,name:'Report '+index,rightsStatus:'self_authored',rightsNote:'Synthetic report fixture'})
   }
   definition.report.rawScoreFeedback!.rules[0].ranges[0].materials=materials
  })
  await completeEducationLibraryScaleExecution({db,actorUserId:f.participantUserId,executionId:f.executionId,answers:f.answers})
  const endpoint=`${base}/api/huiteacher/library-scale/executions/${f.executionId}/report`,headers=await cookie(f.participantUserId)
  const report=await fetch(endpoint,{headers});expect(report.status).toBe(200)
  const json=await report.json();for(const material of materials)expect(JSON.stringify(json)).toContain(material.asset.assetId)
  expect(JSON.stringify(json)).not.toContain(f.stimulus.assetId)
  for(const [index,material] of materials.entries()){
   const response=await fetch(endpoint+'/images/'+material.asset.assetId,{headers});expect(response.status).toBe(200)
   expect(Buffer.from(await response.arrayBuffer())).toEqual(payloads[index])
   expect((await fetch(endpoint+'/images/'+material.asset.assetId,{headers:await cookie(f.managerUserId)})).status).toBe(404)
  }
  expect((await fetch(endpoint+'/images/'+f.stimulus.assetId,{headers})).status).toBe(404)
  const next=structuredClone(f.privateDefinition);delete next.report.rawScoreFeedback!.rules[0].ranges[0].materials
  const saved=await tools.updatePrivateTool(f.privateContext,f.privateDraft.id,{expectedRevision:f.privateDraft.revision,title:'Newer report',definition:next})
  await tools.freezePrivateTool(f.privateContext,f.privateDraft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  expect((await fetch(endpoint+'/images/'+materials[2].asset.assetId,{headers})).status).toBe(200)
 })
})
