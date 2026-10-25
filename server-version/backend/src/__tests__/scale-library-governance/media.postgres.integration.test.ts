import {grantLibraryUseFixture} from '../fixtures/library-distribution'
import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review,prepareMediaManifest,readSubmission,withdraw} from '../../modules/scale-library-governance/service'
import {grantUse} from '../../modules/scale-library-governance/distribution'
import {assertSurveyMediaOwned,retainSurveyMedia} from '../../modules/survey/media.references'
import {softDeleteStoredAsset} from '../../services/assetStorage'
import {approveLibraryMedia} from '../../modules/scale-library-governance/media'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,author:string,reader:string,project:string
const metadata={title:'Synthetic media scale',author:'Synthetic author',copyright:'Author authorizes these fixed media solely for the approved scale',applicability:'Synthetic',scoringDescription:'Mean',reportDescription:'Descriptive'}
async function fixture(){
 const asset=await db.storedAsset.create({data:{objectKey:'assets/library-synthetic-'+randomUUID(),provider:'local',mimeType:'image/png',sizeBytes:42,sha256:'a'.repeat(64),ownerId:author,accessScope:'PRIVATE',scopeId:project}})
 const image={asset:{assetId:asset.id,contentHash:asset.sha256,mimeType:'image/png'},altText:'Synthetic feedback',order:0}
 const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'item',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}],rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'range',min:1,max:2,includeMax:true,text:'Synthetic',images:[image]}]}]}}
 const compiled=compileResearchScale(metadata.title,definition)
 const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:randomUUID(),version:'v1',instrumentVersion:'1',definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',scope:{kind:'PRIVATE',ownerId:author,product:'SURVEY',resourceId:project},provenance:{authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),author))
 const {mediaManifest}=await prepareMediaManifest(author,'SURVEY',{releaseId:release.releaseId,dependencyReleaseIds:[]})
 return {asset,image,definition,compiled,release,mediaManifest}
}
async function application(){const f=await fixture();const submission=await submit(author,'SURVEY',{requestId:randomUUID(),releaseId:f.release.releaseId,metadata,mediaConsent:{manifestHash:f.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}});return {...f,submission}}
suite('library media atomic publication / isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'mediaadmin'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  for(const who of ['author','reader']){const user=await db.user.create({data:{username:'media'+who+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
   const login='media'+randomUUID().replaceAll('-','').slice(0,20);await db.surveyAccount.create({data:{userId:user.id,loginName:login,normalizedLogin:login}})
   await db.surveyResearcherGrant.create({data:{userId:user.id,status:'ACTIVE',grantedBy:admin}})
   await db.surveyMfaCredential.create({data:{userId:user.id,enabled:true,secretCipher:'synthetic'}})
   if(who==='author')author=user.id;else reader=user.id}
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:author,title:'Synthetic media project',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('requires explicit exact-manifest consent and pins the actual review identity',async()=>{
  const f=await fixture()
  await expect(submit(author,'SURVEY',{requestId:randomUUID(),releaseId:f.release.releaseId,metadata})).rejects.toThrow('CONSENT')
  const submission=await submit(author,'SURVEY',{requestId:randomUUID(),releaseId:f.release.releaseId,metadata,mediaConsent:{manifestHash:f.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}})
  await expect(db.storedAsset.update({where:{id:f.asset.id},data:{sha256:'b'.repeat(64)}})).rejects.toThrow()
  expect(await softDeleteStoredAsset({assetId:f.asset.id,authorize:async()=>true,db})).toBe('referenced')
  expect((await readSubmission(admin,submission.id)).mediaManifest?.items[0].assetId).toBe(f.asset.id)
 })
 it('rolls back entry and media together on any approval failure, then can approve normally',async()=>{
  const f=await application(),entryId=randomUUID()
  await expect(db.$transaction(async tx=>{
   await tx.$executeRaw(Prisma.sql`INSERT INTO scale_library_entries(id,submission_id,release_id) VALUES(${entryId},${f.submission.id},${f.release.releaseId})`)
   await approveLibraryMedia(tx,entryId,f.submission.id,f.mediaManifest)
   throw new Error('synthetic failure after all media inserted')
  })).rejects.toThrow('synthetic failure')
  expect(await db.$queryRaw(Prisma.sql`SELECT id FROM scale_library_entries WHERE id=${entryId}`)).toEqual([])
  expect(await db.$queryRaw(Prisma.sql`SELECT id FROM scale_library_media WHERE entry_id=${entryId}`)).toEqual([])
  expect(await db.assetReference.count({where:{entityType:'ScaleLibraryMedia',entityId:entryId}})).toBe(0)
  const result=await review(admin,f.submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic approval'})
  const rows=await db.$queryRaw<Array<{asset_id:string;state:string}>>(Prisma.sql`SELECT asset_id,state FROM scale_library_media WHERE entry_id=${result.entryId}`)
  expect(rows).toEqual([{asset_id:f.asset.id,state:'READY'}])
  expect((await db.storedAsset.findUniqueOrThrow({where:{id:f.asset.id}})).accessScope).toBe('PRIVATE')
  await expect(db.storedAsset.delete({where:{id:f.asset.id}})).rejects.toThrow()
 })
 it('bridges exact authorized cross-owner report media and preserves the frozen original ID',async()=>{
  const f=await application(),approved=await review(admin,f.submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic approval'})
  await grantLibraryUseFixture(db,admin,approved.entryId!,{requestId:randomUUID(),userId:reader,product:'SURVEY'})
  const [grant]=await db.$queryRaw<Array<{snapshot:{displayDefinition:unknown;compiledDefinition:unknown;provenance:Record<string,unknown>}}>>(Prisma.sql`SELECT t.snapshot FROM survey_tool_grants t JOIN scale_library_use_grants g ON g.survey_tool_grant_id=t.id WHERE g.entry_id=${approved.entryId} AND g.user_id=${reader}`)
  const unit={kind:'SCALE' as const,definition:grant.snapshot.displayDefinition,compiledDefinition:grant.snapshot.compiledDefinition,sourceProvenance:grant.snapshot.provenance}
  const publicationId=randomUUID()
  await db.$transaction(async tx=>{
   expect(await assertSurveyMediaOwned(tx,reader,'reader-project',[unit])).toEqual([f.image.asset])
   await retainSurveyMedia(tx,reader,'reader-project',publicationId,[unit])
  })
  expect(await db.assetReference.count({where:{entityType:'SurveyResearchPublication',entityId:publicationId,assetId:f.asset.id}})).toBe(1)
  await expect(db.$transaction(tx=>assertSurveyMediaOwned(tx,reader,'reader-project',[{...unit,definition:{}}]))).rejects.toThrow()
  await expect(db.storedAsset.update({where:{id:f.asset.id},data:{accessScope:'PUBLIC'}})).rejects.toThrow()
 })
 it('returned and withdrawn submissions never create platform media rows',async()=>{
  for(const decision of ['RETURN','WITHDRAW'] as const){const f=await application()
   if(decision==='RETURN')await review(admin,f.submission.id,{expectedVersion:1,decision:'RETURN',reason:'Synthetic return'})
   else await withdraw(author,f.submission.id,{expectedVersion:1,reason:'Synthetic withdrawal'})
   expect(await db.$queryRaw(Prisma.sql`SELECT m.id FROM scale_library_media m JOIN scale_library_entries e ON e.id=m.entry_id WHERE e.submission_id=${f.submission.id}`)).toEqual([])
   await expect(readSubmission(reader,f.submission.id)).rejects.toThrow()
  }
 })
})
