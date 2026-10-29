import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as tools from '../../modules/education-tools/private-tool.service'
import {revokeEducationProductAdmin} from '../../modules/organization/educationProductGovernance'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const definition={schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic page',questions:[
 {itemKey:'q',type:'SHORT_TEXT',prompt:'Synthetic question',required:false,options:[],rows:[]},
]}]}
async function writerAndAuthors(){
 const system=await db.user.create({data:{id:randomUUID(),username:'lock_system_'+randomUUID(),passwordHash:'synthetic',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
 const writer=await db.user.create({data:{id:randomUUID(),username:'lock_writer_'+randomUUID(),passwordHash:'synthetic',accountDomain:'TRAINING',role:'ADMIN',platformRole:'STANDARD'}})
 await db.adminEntryGrant.create({data:{id:randomUUID(),userId:writer.id,entry:'HUITEACHER',grantedBy:system.id}})
 const org=await db.organization.create({data:{id:randomUUID(),name:'Synthetic shared authoring lock school',productDomain:'SCHOOL',createdByUserId:writer.id}})
 await db.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',grantedByUserId:writer.id}})
 const authors=[]
 for(let index=0;index<2;index++){
  const user=await db.user.create({data:{id:randomUUID(),username:'lock_author_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:user.id,validFrom:new Date(Date.now()-60000)}})
  const grant=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:writer.id}})
  const context:PrivateToolContext={entry:'TEACHER',organizationId:org.id,principal:{userId:user.id,accountDomain:'SCHOOL'}}
  const leaf=await tools.createPrivateTool(context,{kind:'FORM',title:'Synthetic leaf '+index})
  const savedLeaf=await tools.updatePrivateTool(context,leaf.id,{expectedRevision:1,title:leaf.title,definition})
  const fixed=await tools.freezePrivateTool(context,leaf.id,{expectedRevision:savedLeaf.revision,expectedContentHash:savedLeaf.contentHash})
  const questionnaire=await tools.createPrivateTool(context,{kind:'COMPOSITION',title:'Synthetic questionnaire '+index})
  const content={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:fixed.id,contentHash:fixed.contentHash}}]}
  const saved=await tools.updatePrivateTool(context,questionnaire.id,{expectedRevision:1,title:questionnaire.title,definition:content})
  authors.push({context,grant,questionnaire,saved,content,command:{expectedRevision:saved.revision,expectedContentHash:saved.contentHash}})
 }
 return {writer,org,authors}
}
async function waitForBlockedBy(pid:number){
 for(let attempt=0;attempt<100;attempt++){
  const rows=await db.$queryRaw<Array<{pid:number}>>`SELECT pid FROM pg_stat_activity WHERE ${pid}=ANY(pg_blocking_pids(pid))`
  if(rows[0])return rows[0].pid
  await new Promise(resolve=>setTimeout(resolve,20))
 }
 throw new Error('Expected database row-lock wait was not observed')
}
suite('COMPOSITION organization sharing against the actual product-admin revocation writer',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('lets a different author freeze while one draft waits, blocks real governance until that freeze commits, then rejects revoked author writes',async()=>{
  const {writer,org,authors:[a,b]}=await writerAndAuthors()
  let first:Promise<Awaited<ReturnType<typeof tools.freezePrivateTool>>>|undefined
  let second:Promise<Awaited<ReturnType<typeof tools.freezePrivateTool>>>|undefined
  let revoke:Promise<Awaited<ReturnType<typeof revokeEducationProductAdmin>>>|undefined
  try{
   await db.$transaction(async blocker=>{
    const [holder]=await blocker.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
    await blocker.$queryRaw`SELECT id FROM education_private_tools WHERE id=${a.questionnaire.id} FOR UPDATE`
    first=tools.freezePrivateTool(a.context,a.questionnaire.id,a.command)
    // First author has already acquired its organization lock and current
    // authority, and waits only on this exact draft row held by the probe.
    const firstPid=await waitForBlockedBy(holder.pid)
    let finished=false
    second=tools.freezePrivateTool(b.context,b.questionnaire.id,b.command)
    void second.then(()=>{finished=true},()=>{finished=true})
    for(let attempt=0;attempt<100&&!finished;attempt++)await new Promise(resolve=>setTimeout(resolve,20))
    expect(finished,'different authors must not wait on a shared school exclusion lock').toBe(true)
    const fixed=await second
    expect(fixed).toMatchObject({kind:'COMPOSITION',created:true,runtime:{status:'DRAFT'}})
    // This is the real governance service, including entry authority, school
    // FOR UPDATE, last-admin check, grant mutation and audit/outbox write.
    revoke=revokeEducationProductAdmin({actorUserId:writer.id,organizationId:org.id,grantId:b.grant.id})
    const writerPid=await waitForBlockedBy(firstPid)
    expect(writerPid).not.toBe(firstPid)
    expect((await db.educationProductRoleGrant.findUniqueOrThrow({where:{id:b.grant.id}})).revokedAt).toBeNull()
   },{timeout:10000})
   expect(await first).toMatchObject({kind:'COMPOSITION',created:true,runtime:{status:'DRAFT'}})
   expect(await revoke).toMatchObject({revoked:true,grantId:b.grant.id})
   expect((await db.educationProductRoleGrant.findUniqueOrThrow({where:{id:b.grant.id}})).revokedByUserId).toBe(writer.id)
   await expect(tools.freezePrivateTool(b.context,b.questionnaire.id,b.command)).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
   await expect(tools.updatePrivateTool(b.context,b.questionnaire.id,{expectedRevision:2,title:b.questionnaire.title,definition:b.content})).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
   expect(await db.educationPrivateToolVersion.count({where:{toolId:{in:[a.questionnaire.id,b.questionnaire.id]},kind:'COMPOSITION'}})).toBe(2)
  }finally{
   await Promise.allSettled([first,second,revoke].filter((promise):promise is NonNullable<typeof promise>=>Boolean(promise)))
  }
 },20_000)
})
