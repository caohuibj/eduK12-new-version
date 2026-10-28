import {randomUUID} from 'node:crypto'
import {rm} from 'node:fs/promises'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {storeAsset,getLocalAssetPath} from '../../services/assetStorage'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {submitOwnedSurveyTool,approveGovernedTool} from '../../modules/survey/governed-tool.service'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {authenticateHuiteacher,authenticateSchool} from '../../middleware/auth'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Education public Form exact leaf/metadata/shared image HTTP',()=>{
 let server:Server,base:string,system:string,author:string,participant:string,organizationId:string,formId:string,formHash:string,owner:string,projectId:string,asset:any,grantId:string
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=','base64')
 const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-public-preview-session'})
 async function request(path:string,body?:unknown,userId=author,school=false,method:'POST'|'PUT'='POST'){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-public-preview-csrf'
  const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(!school?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(`${base}/api/${school?'campus':'huiteacher'}/organizations/${organizationId}/private-tools${path}`,{method:body===undefined?'GET':method,headers:{'content-type':'application/json',
   cookie:`${school?SCHOOL_AUTH_COOKIE_NAME:HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${school?SCHOOL_CSRF_COOKIE_NAME:HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer())
  return {status:response.status,value,data:value.data,headers:response.headers}
 }
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  system=(await db.user.create({data:{username:'preview-sys-'+randomUUID(),passwordHash:'synthetic',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})).id
  author=(await db.user.create({data:{username:'preview-author-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})).id
  participant=(await db.user.create({data:{username:'preview-participant-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER'}})).id
  organizationId=(await db.organization.create({data:{id:randomUUID(),name:'Synthetic public preview school',productDomain:'SCHOOL',createdByUserId:author}})).id
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:author}})
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId,userId:participant}})
  await db.educationProductEntitlement.createMany({data:['HUISCHOOL','HUITEACHER'].map(product=>({organizationId,product:product as 'HUISCHOOL'|'HUITEACHER',grantedByUserId:system}))})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:system}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system}})
  owner=(await db.user.create({data:{username:'preview-original-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SURVEY'}})).id
  const login='r'+randomUUID().replaceAll('-','').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:system}});await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
  projectId=(await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner,title:'Original shared Form image',collectionMode:'SINGLE_UNLINKED'}})).id
  asset=await storeAsset({buffer:bytes,originalName:'synthetic.png',mimeType:'image/png',ownerId:owner,accessScope:'PRIVATE',scopeId:projectId,provider:'local'})
  const draft=await createDraft(owner,projectId,{requestId:randomUUID(),instrumentKey:'original',kind:'FORM',title:'Original shared image Form'})
  const saved=await updateDraft(owner,projectId,draft.id,{revision:draft.revision,title:draft.title,definition:{schemaVersion:2,pages:[{pageKey:'one',title:'Original page',questions:[{itemKey:'choice',type:'SINGLE',prompt:'Original fixed question',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[],image:{asset:{assetId:asset.id,contentHash:asset.sha256,mimeType:'image/png'},altText:'Original fixed image',rightsStatus:'self_authored',rightsNote:'Synthetic original image fixture'}}]}]}})
  const source=await submitOwnedSurveyTool(owner,projectId,draft.id,{requestId:randomUUID(),revision:saved.revision,version:'shared-image-1',statement:'Original author shares this exact Form and its image',reference:{educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]},language:'zh-CN'}})
  expect((await approveGovernedTool(system,source.id,{expectedVersion:source.version,hash:source.hash,decision:'APPROVE',reason:'Synthetic original approval',allowedProducts:['SURVEY']},proof())).state).toBe('ONLINE')
  formId=source.id;formHash=source.hash
  grantId=(await issueAdminContentRoot(system,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Exact synthetic Form use',grant:{subjectId:author,scope:{product:'TEACHER',scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'FORM',id:formId,hash:formHash})]},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})).grantId
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'));app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}if(asset)await rm(getLocalAssetPath(asset.objectKey),{force:true});vi.unstubAllEnvs();await db.$disconnect()})
 it('keeps exact public origin on save/reopen, loads only its leaf and shared image, and fences withdrawn or foreign reads',async()=>{
  const list=await request('/public-sources?kind=FORM');expect(list.status,JSON.stringify(list.value)).toBe(200)
  expect(list.data.list).toMatchObject([{sourceId:formId,contentHash:formHash,allowedActions:['REFERENCE_FIXED_VERSION']}])
  expect(JSON.stringify(list.value)).not.toMatch(/Original fixed question|Original fixed image|assetId|definition/)
  const path=`/public-sources/form/${formId}`,query='?contentHash='+formHash
  const preview=await request(path+query);expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data).toMatchObject({id:formId,kind:'FORM',contentHash:formHash,canEditOriginal:false,previewOnly:true})
  expect(preview.data.definition.pages[0].questions[0].image.asset.assetId).toBe(asset.id)
  const image=await request(`${path}/assets/${asset.id}/content${query}`)
  expect(image.status,JSON.stringify(image.value)).toBe(200);expect(image.value.equals(bytes)).toBe(true);expect(image.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect((await request(`${path}/assets/${randomUUID()}/content${query}`)).status).toBe(404)
  expect((await request(path+'?contentHash='+'0'.repeat(64))).status).toBe(403)
  expect((await request(path+query,undefined,participant)).status).toBe(403)
  expect((await request(path+query,undefined,author,true)).status).toBe(403)
  const created=await request('',{kind:'COMPOSITION',title:'Public Form reference only'});expect(created.status,JSON.stringify(created.value)).toBe(200)
  const definition={...created.data.definition,blocks:[{blockId:randomUUID(),instruction:'Shared transition',source:{provider:'PUBLIC_FORM',kind:'FORM',versionId:formId,contentHash:formHash}}]}
  // PUT uses the existing actual router and scoped CAS; no public body copy.
  const updated=await request('/'+created.data.id,{expectedRevision:1,title:'Public Form reference only',definition},author,false,'PUT')
  expect(updated.status,JSON.stringify(updated.value)).toBe(200);const saved=updated.data
  const opened=await request('/'+created.data.id);expect(opened.data.references).toMatchObject([{id:formId,sourceProvider:'PUBLIC_FORM',kind:'FORM',title:'Original shared image Form'}])
  expect(opened.data.references[0]).not.toHaveProperty('definition')
  const fixed=await request('/'+created.data.id+'/freeze',{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  expect(fixed.status,JSON.stringify(fixed.value)).toBe(200)
  expect(await db.educationPrivateToolVersion.count({where:{organizationId,kind:'FORM'}})).toBe(0)
  expect(await db.storedAsset.findUnique({where:{id:asset.id},select:{ownerId:true,scopeId:true,accessScope:true}})).toEqual({ownerId:owner,scopeId:projectId,accessScope:'PRIVATE'})
  await revokeAdminContentGrant(system,proof(),grantId,{expectedVersion:1,reason:'Synthetic preview withdrawal'})
  expect((await request(path+query)).status).toBe(403);expect((await request(`${path}/assets/${asset.id}/content${query}`)).status).toBe(403)
  const retained=await request('/'+created.data.id)
  expect(retained.data.definition).toEqual(definition);expect(retained.data.references).toEqual([])
 })
})
