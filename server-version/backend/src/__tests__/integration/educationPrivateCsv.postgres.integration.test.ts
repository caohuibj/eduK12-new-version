import {randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {authenticateHuiteacher,authenticateSchool} from '../../middleware/auth'
import {csrfProtection} from '../../middleware/csrf'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,origin:string
type Entry='SCHOOL'|'TEACHER'
// Same real persisted identity/grant fixture as educationPrivateTools. No mocks
// of authentication, capability resolution, signing, parser or persistence.
async function actor(organizationId?:string){
 const user=await db.user.create({data:{id:randomUUID(),username:'private_csv_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const org=organizationId??randomUUID()
 if(!organizationId){
  await db.organization.create({data:{id:org,name:'Synthetic CSV school',productDomain:'SCHOOL',createdByUserId:user.id}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:user.id}})
 }
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:user.id}})
 const capability=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:user.id}})
 const teacherAdmin=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
 return {user,org,capability,teacherAdmin}
}
type Actor=Awaited<ReturnType<typeof actor>>
function headers(a:Actor,entry:Entry){
 const product=entry==='TEACHER'?'HUITEACHER':'HUISCHOOL'
 const token=generateToken({userId:a.user.id,username:a.user.username,role:a.user.role,tokenVersion:a.user.tokenVersion,
  accountDomain:'SCHOOL',sessionProduct:product,mfaVerifiedAt:Math.floor(Date.now()/1000)})
 const csrf='synthetic-csv-csrf'
 return {'content-type':'application/json',cookie:`${entry==='TEACHER'?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${entry==='TEACHER'?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf}
}
const root=(a:Actor,entry:Entry)=>`${origin}/api/${entry==='TEACHER'?'huiteacher':'campus'}/organizations/${a.org}/private-tools`
async function request(a:Actor,entry:Entry,path:string,body:unknown,method='POST'){
 const response=await fetch(root(a,entry)+path,{method,headers:headers(a,entry),body:JSON.stringify(body)})
 return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()}
}
const scale=()=>compileResearchScale('Synthetic CSV',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'q',prompt:'Original item',required:true,reverse:false,dimensionKeys:['total']}]})
async function draft(a:Actor,entry:Entry){
 const created=await request(a,entry,'',{kind:'SCALE',title:'Synthetic CSV'})
 expect(created.status).toBe(200)
 const id:string=created.body.data.id,definition=scale()
 const saved=await request(a,entry,'/'+id,{expectedRevision:created.body.data.revision,title:'Synthetic CSV',definition},'PUT')
 expect(saved.status).toBe(200)
 const input={content:`item_code,prompt,reverse,score_keys,response_set_key\nq2,Imported item,true,total,${definition.responseSets[0].key}`,
  expectedRevision:saved.body.data.revision,expectedContentHash:saved.body.data.contentHash}
 return {id,input}
}
async function state(id:string){
 return {draft:await db.educationPrivateTool.findUniqueOrThrow({where:{id}}),
  versions:await db.educationPrivateToolVersion.findMany({where:{toolId:id},orderBy:{id:'asc'}}),
  pins:await db.assetReference.findMany({where:{entityType:'EducationPrivateToolDraft',entityId:id},orderBy:{id:'asc'}})}
}
const command=(input:Awaited<ReturnType<typeof draft>>['input'],preview:any)=>({...input,digest:preview.digest,previewToken:preview.previewToken,previewExpiresAt:preview.previewExpiresAt})

suite('Education CSV real authenticated routes / isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use('/api/huiteacher/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'))
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode??500).json({message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done))
  origin='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(done=>server.close(()=>done()));await db?.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s preview is read-only; racing apply commits once and preserves exact frozen snapshot',async entry=>{
  const a=await actor(),d=await draft(a,entry)
  const frozen=await request(a,entry,`/${d.id}/freeze`,{expectedRevision:d.input.expectedRevision,expectedContentHash:d.input.expectedContentHash})
  expect(frozen.status).toBe(200)
  const before=await state(d.id)
  const pre=await request(a,entry,`/${d.id}/import/preview`,d.input)
  expect(pre.status).toBe(200);expect(pre.cache).toBe('no-store')
  expect(pre.body.data).toMatchObject({expectedRevision:d.input.expectedRevision,expectedContentHash:d.input.expectedContentHash,count:1,totalItems:2})
  expect(await state(d.id)).toEqual(before)
  const payload=command(d.input,pre.body.data)
  const outcomes=await Promise.all([request(a,entry,`/${d.id}/import/apply`,payload),request(a,entry,`/${d.id}/import/apply`,payload)])
  expect(outcomes.map(result=>result.status).sort()).toEqual([200,409])
  const rejected=outcomes.find(result=>result.status===409)!
  expect(rejected.body.code).toBe('PRIVATE_TOOL_REVISION_CONFLICT')
  const accepted=outcomes.find(result=>result.status===200)!
  expect(accepted.body.data).toMatchObject({id:d.id,ownerUserId:a.user.id,organizationId:a.org,entry,revision:d.input.expectedRevision+1,importedCount:1,canPublish:false})
  const after=await state(d.id)
  expect(after.draft.revision).toBe(before.draft.revision+1)
  expect(after.draft.contentHash).not.toBe(before.draft.contentHash)
  expect((after.draft.definition as any).items.map((item:any)=>item.itemCode)).toEqual(['q','q2'])
  expect((after.draft.definition as any).report).toEqual((before.draft.definition as any).report)
  expect(after.versions).toEqual(before.versions)
  expect(after.pins).toEqual(before.pins)
  expect((await request(a,entry,`/${d.id}/import/apply`,payload)).status).toBe(409)
  expect(await state(d.id)).toEqual(after)
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s rejects current capability revoked after preview without touching draft',async entry=>{
  const a=await actor(),d=await draft(a,entry)
  const pre=await request(a,entry,`/${d.id}/import/preview`,d.input);expect(pre.status).toBe(200)
  const before=await state(d.id)
  if(entry==='SCHOOL')await db.$executeRaw(Prisma.sql`UPDATE organization_capability_grants SET revoked_at=clock_timestamp() WHERE id=${a.capability.id}`)
  else await db.$executeRaw(Prisma.sql`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${a.user.id} WHERE id=${a.teacherAdmin.id}`)
  const denied=await request(a,entry,`/${d.id}/import/apply`,command(d.input,pre.body.data))
  expect(denied.status).toBe(403);expect(denied.body.code).toBe('PRIVATE_TOOL_AUTHOR_REQUIRED')
  expect((await request(a,entry,`/${d.id}/import/preview`,d.input)).status).toBe(403)
  expect(await state(d.id)).toEqual(before)
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s cannot replay valid proof through another author or product entry',async entry=>{
  const a=await actor(),other=await actor(a.org),d=await draft(a,entry)
  const pre=await request(a,entry,`/${d.id}/import/preview`,d.input);expect(pre.status).toBe(200)
  const payload=command(d.input,pre.body.data),before=await state(d.id)
  for(const [actorValue,entryValue] of [[other,entry],[a,entry==='SCHOOL'?'TEACHER':'SCHOOL']] as const){
   const denied=await request(actorValue,entryValue,`/${d.id}/import/apply`,payload)
   expect(denied.status).toBe(404);expect(denied.body.code).toBe('PRIVATE_TOOL_NOT_FOUND')
  }
  expect(await state(d.id)).toEqual(before)
 })
})
