import {randomUUID} from 'node:crypto'
import {rm} from 'node:fs/promises'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {storeAsset,getLocalAssetPath} from '../../services/assetStorage'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {submit,review,prepareMediaManifest} from '../../modules/scale-library-governance/service'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import {revokeUse} from '../../modules/scale-library-governance/distribution'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {authenticateHuiteacher,authenticateSchool} from '../../middleware/auth'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME} from '../../utils/authCookies'
import * as tools from '../../modules/education-tools/private-tool.service'
import * as bodies from '../../modules/education-tools/library-source.scale'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Original library / exact display, draft header and original shared stimulus HTTP',()=>{
 let server:Server,base:string,localObjectKey:string|undefined
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=','base64')
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const app=express();app.use(express.json())
  for(const entry of ['TEACHER','SCHOOL'] as const)app.use(`/api/${entry==='TEACHER'?'huiteacher':'campus'}/organizations/:organizationId/private-tools`,entry==='TEACHER'?authenticateHuiteacher:authenticateSchool,educationPrivateToolRouter(entry))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}if(localObjectKey)await rm(getLocalAssetPath(localObjectKey),{force:true});vi.restoreAllMocks();await db.$disconnect()})
 async function request(organizationId:string,userId:string,path:string,school=false){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(!school?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(`${base}/api/${school?'campus':'huiteacher'}/organizations/${organizationId}/private-tools${path}`,{headers:{cookie:`${school?SCHOOL_AUTH_COOKIE_NAME:HUITEACHER_AUTH_COOKIE_NAME}=${token}`}})
  const value=response.status===200&&response.headers.get('content-type')?.startsWith('image/')?Buffer.from(await response.arrayBuffer()):response.headers.get('content-type')?.includes('json')?await response.json():null
  return {status:response.status,headers:response.headers,value,data:value?.data}
 }
 it('reads one original display/asset, saves only exact identity and reopens scoped headers, then denies withdrawn/foreign reads without copying source ownership',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  const asset=await storeAsset({buffer:bytes,originalName:'synthetic-library-stimulus.png',mimeType:'image/png',ownerId:f.authorUserId,accessScope:'PRIVATE',scopeId:'synthetic-library-stimulus',provider:'local'});localObjectKey=asset.objectKey
  const definition=structuredClone(f.definition);definition.items[0].images=[{asset:{assetId:asset.id,contentHash:asset.sha256,mimeType:'image/png'},altText:'Original approved stimulus',order:0}]
  const scale=await db.scale.create({data:{code:'library_media_'+randomUUID(),name:'Original library image',creatorId:f.authorUserId,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,definitionHash:hashScaleDefinition(definition)}})
  const measurement=await publishRegisteredScaleFixture(db,scale.id)
  const manifest=await prepareMediaManifest(f.authorUserId,'TRAINING',{releaseId:measurement.releaseId,dependencyReleaseIds:[]})
  const application=await submit(f.authorUserId,'TRAINING',{requestId:randomUUID(),releaseId:measurement.releaseId,
   metadata:{title:scale.name,author:'Synthetic author',copyright:'Self authored',applicability:'Synthetic isolated SELF',scoringDescription:'Descriptive',reportDescription:'Native fixed report'},
   educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]},mediaConsent:{manifestHash:manifest.mediaManifest.manifestHash,shareWithAuthorizedUsers:true}})
  const approved=await review(f.libraryAdminUserId,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Synthetic original image approval'})
  const entryId=approved.entryId!,grant=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,f.libraryAdminUserId,entryId,{requestId:randomUUID(),product:'TEACHER',organizationId:f.organizationId,scopeKind:'ORGANIZATION',userId:null}))
  const [snapshot]=await db.$queryRaw<Array<{hash:string}>>`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${entryId}`
  const path='/library-sources/'+entryId,query='?contentHash='+snapshot.hash,context={entry:'TEACHER' as const,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const spy=vi.spyOn(bodies,'readEducationLibrarySources')
  const catalog=await request(f.organizationId,f.managerUserId,'/library-sources')
  expect(catalog.status,JSON.stringify(catalog.value)).toBe(200)
  expect(catalog.data.list.find((row:any)=>row.sourceId===entryId)).toMatchObject({contentHash:snapshot.hash,allowedActions:['REFERENCE_FIXED_VERSION'],versions:{report:definition.report.reportVersion}})
  expect(JSON.stringify(catalog.value)).not.toMatch(/assetId|Q1|scoringDescription|rawScoreFeedback|definition/)
  const preview=await request(f.organizationId,f.managerUserId,path+query);expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data.definition.items[0]).toMatchObject({itemCode:'Q1',images:[{asset:{assetId:asset.id}}]})
  expect(['scoring','referencePolicy','report'].filter(key=>key in preview.data.definition)).toEqual([])
  expect(preview.data.definition.responseSets.flatMap((set:any)=>set.options).every((option:any)=>!('score'in option))).toBe(true)
  const image=await request(f.organizationId,f.managerUserId,`${path}/assets/${asset.id}/content${query}`)
  expect(image.status,JSON.stringify(image.value)).toBe(200);expect(image.value.equals(bytes)).toBe(true);expect(image.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect((await request(f.organizationId,f.managerUserId,`${path}/assets/${randomUUID()}/content${query}`)).status).toBe(404)
  expect((await request(f.organizationId,f.managerUserId,path+'?contentHash='+'0'.repeat(64))).status).toBe(404)
  expect((await request(f.organizationId,f.participantUserId,path+query)).status).toBe(403)
  expect((await request(f.organizationId,f.managerUserId,'/'+entryId)).status).toBe(404)
  const draft=await tools.createPrivateTool(context,{kind:'COMPOSITION',title:'Only original library identity'})
  await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:entryId,contentHash:snapshot.hash}}]}})
  const reopened=await request(f.organizationId,f.managerUserId,'/'+draft.id)
  expect(reopened.data.references).toMatchObject([{id:entryId,contentHash:snapshot.hash,sourceProvider:'LIBRARY_SCALE'}])
  expect(JSON.stringify(reopened.data)).not.toMatch(/Original approved stimulus|assetId|rawScoreFeedback/)
  await revokeUse(f.libraryAdminUserId,grant.grant.id,{expectedVersion:1,reason:'Synthetic preview U withdrawal'})
  expect((await request(f.organizationId,f.managerUserId,path+query)).status).toBe(403)
  expect((await request(f.organizationId,f.managerUserId,`${path}/assets/${asset.id}/content${query}`)).status).toBe(403)
  const withdrawn=await request(f.organizationId,f.managerUserId,'/'+draft.id)
  expect(withdrawn.data.references).toEqual([]);expect(withdrawn.data.definition.blocks[0].source.versionId).toBe(entryId)
  expect((await db.storedAsset.findUniqueOrThrow({where:{id:asset.id}}))).toMatchObject({ownerId:f.authorUserId,accessScope:'PRIVATE',scopeId:asset.scopeId})
  expect(spy).not.toHaveBeenCalled();spy.mockRestore()
 },60000)
})
