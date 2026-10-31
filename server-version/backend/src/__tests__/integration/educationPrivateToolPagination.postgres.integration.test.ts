import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {createPrivateTool,freezePrivateTool,listPrivateTools,listPrivateToolVersions,updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
const definition={schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'Synthetic question',required:false,options:[],rows:[]}]}]}
async function actor(organizationId?:string):Promise<PrivateToolContext>{
 const user=await db.user.create({data:{id:randomUUID(),username:'page_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const org=organizationId??randomUUID()
 if(!organizationId){
  await db.organization.create({data:{id:org,name:'Synthetic pagination school',productDomain:'SCHOOL',createdByUserId:user.id}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await db.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:user.id}})
 }
 const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,persona:'COUNSELOR',grantedByUserId:user.id}})
 await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:user.id}})
 await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
 return {principal:{userId:user.id,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org}
}
const where=(c:PrivateToolContext)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})
async function seedDraft(tx:Prisma.TransactionClient,c:PrivateToolContext,index:number){
 const id=randomUUID(),title='Synthetic '+index
 await tx.$executeRaw(Prisma.sql`INSERT INTO education_private_tools(id,entry,organization_id,owner_user_id,kind,title,definition,content_hash,created_at)
  VALUES(${id},${c.entry},${c.organizationId},${c.principal.userId},'FORM',${title},${JSON.stringify(definition)}::jsonb,${privateToolContentHash('FORM',title,definition)},
   TIMESTAMPTZ '2026-01-01 00:00:00.000001+00'+${Math.floor(index/2)}*INTERVAL '1 microsecond')`)
 return id
}
async function oneFrozen(c:PrivateToolContext){
 const draft=await createPrivateTool(c,{kind:'FORM',title:'Synthetic frozen'})
 const saved=await updatePrivateTool(c,draft.id,{expectedRevision:1,title:'Synthetic frozen',definition})
 const version=await freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 return {draft,version}
}
suite('Education private tools newest-first scoped pagination / isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('pages all drafts exactly once with timestamp ties, sub-millisecond precision and a new insertion',async()=>{
  const c=await actor()
  await db.$transaction(async tx=>{for(let i=0;i<65;i++)await seedDraft(tx,c,i)})
  const expected=await db.educationPrivateTool.findMany({where:where(c),orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true}})
  const first=await listPrivateTools(c)
  expect(first.list.map(row=>row.id)).toEqual(expected.slice(0,50).map(row=>row.id))
  expect(first.nextCursor).toBe(first.list[49].id)
  const newest=await createPrivateTool(c,{kind:'FORM',title:'Newest'})
  // A later insertion is seen on refresh, not spliced into the remaining page.
  const second=await listPrivateTools(c,first.nextCursor!)
  const ids=[...first.list,...second.list].map(row=>row.id)
  expect(ids).toEqual(expected.map(row=>row.id))
  expect(new Set(ids).size).toBe(65)
  expect(second.nextCursor).toBeNull()
  expect((await listPrivateTools(c)).list[0].id).toBe(newest.id)
 })
 it('pages frozen versions newest-first without duplicates or skipped microsecond rows',async()=>{
  const c=await actor()
  const id=await db.$transaction(async tx=>{
   const toolId=await seedDraft(tx,c,0)
   for(let i=0;i<65;i++){
    if(i)await tx.educationPrivateTool.update({where:{id:toolId},data:{revision:{increment:1}}})
    // The ordinary snapshot guard still verifies exact source revision/content.
    await tx.$executeRaw(Prisma.sql`INSERT INTO education_private_tool_versions(id,tool_id,entry,organization_id,owner_user_id,kind,source_revision,title,definition,content_hash,created_at)
     SELECT ${randomUUID()},id,entry,organization_id,owner_user_id,kind,revision,title,definition,content_hash,
      TIMESTAMPTZ '2026-01-01 00:00:00.000001+00'+${Math.floor(i/2)}*INTERVAL '1 microsecond'
     FROM education_private_tools WHERE id=${toolId}`)
   }
   return toolId
  },{timeout:10000})
  const expected=await db.educationPrivateToolVersion.findMany({where:{toolId:id,...where(c)},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true}})
  const first=await listPrivateToolVersions(c,id)
  expect(first.list.map(row=>row.id)).toEqual(expected.slice(0,50).map(row=>row.id))
  const saved=await updatePrivateTool(c,id,{expectedRevision:65,title:'Newest version',definition})
  const newest=await freezePrivateTool(c,id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  const second=await listPrivateToolVersions(c,id,first.nextCursor!)
  const ids=[...first.list,...second.list].map(row=>row.id)
  expect(ids).toEqual(expected.map(row=>row.id))
  expect(new Set(ids).size).toBe(65)
  expect(second.nextCursor).toBeNull()
  expect((await listPrivateToolVersions(c,id)).list[0].id).toBe(newest.id)
 })
 it('rejects missing or foreign cursor anchors without exposing author/entry/school/tool records',async()=>{
  const c=await actor(),other=await actor(c.organizationId),foreign=await actor()
  const own=await oneFrozen(c),otherTool=await oneFrozen(c)
  const sources=[await oneFrozen(other),await oneFrozen(foreign),await oneFrozen({...c,entry:'TEACHER'})]
  for(const cursor of [randomUUID(),...sources.map(x=>x.draft.id)]){
   await expect(listPrivateTools(c,cursor)).rejects.toMatchObject({code:'PRIVATE_TOOL_CURSOR_INVALID',statusCode:400})
  }
  for(const cursor of [randomUUID(),otherTool.version.id,...sources.map(x=>x.version.id)]){
   await expect(listPrivateToolVersions(c,own.draft.id,cursor)).rejects.toMatchObject({code:'PRIVATE_TOOL_CURSOR_INVALID',statusCode:400})
  }
 })
})
