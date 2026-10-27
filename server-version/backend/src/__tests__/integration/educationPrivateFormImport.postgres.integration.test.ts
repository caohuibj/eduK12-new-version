import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createPrivateTool,updatePrivateTool,readPrivateTool,freezePrivateTool,readPrivateToolVersion} from '../../modules/education-tools/private-tool.service'
import {importPrivateForm} from '../../modules/education-tools/private-tool.form-import.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
const original={pageKey:'original_group',title:'已有分组',description:'保留说明',questions:[{itemKey:'original_question',type:'SHORT_TEXT',prompt:'已有题目，不得改写',required:false,allowRefusal:true,options:[],rows:[],maxLength:123}]}
async function actor(organizationId?:string){
 const user=await db.user.create({data:{id:randomUUID(),username:'form_import_'+randomUUID(),passwordHash:'synthetic',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
 const org=organizationId??randomUUID()
 if(!organizationId){await db.organization.create({data:{id:org,name:'Synthetic form import school',productDomain:'SCHOOL',createdByUserId:user.id}});await db.educationProductEntitlement.create({data:{organizationId:org,product:'HUISCHOOL',grantedByUserId:user.id}})}
 const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,validFrom:new Date(Date.now()-60000)}})
 await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:user.id}})
 const capability=await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:user.id}})
 const context:PrivateToolContext={principal:{userId:user.id,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId:org}
 const created=await createPrivateTool(context,{kind:'FORM',title:'Synthetic import form'})
 await updatePrivateTool(context,created.id,{expectedRevision:created.revision,title:created.title,definition:{schemaVersion:2,pages:[original]}})
 return {context,org,user,capability,tool:await readPrivateTool(context,created.id)}
}
const body=(tool:{revision:number;contentHash:string},extra:Record<string,unknown>={})=>({format:'TEXT',content:'追加观察\n甲\n乙\n\n补充记录',batchId:randomUUID(),expectedRevision:tool.revision,expectedContentHash:tool.contentHash,...extra})
const confirmation=(request:ReturnType<typeof body>,preview:any)=>({...request,digest:preview.digest,previewToken:preview.previewToken,previewExpiresAt:preview.previewExpiresAt})
suite('School form bulk import / explicitly isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('keeps preview read-only and serializes concurrent CSV confirmations to a single append',async()=>{
  const a=await actor(),request=body(a.tool,{format:'CSV',content:'type,prompt,required,options,rows,min,max\nSINGLE,"含逗号,和换行\n的题目",true,甲||乙,,,\nMULTIPLE,多选,false,甲||乙,,,\nMATRIX,矩阵,true,甲||乙,第一行||第二行,,\nNUMBER,数值,true,,,0,10'})
  const before=await db.educationPrivateTool.findUniqueOrThrow({where:{id:a.tool.id}}),preview=await importPrivateForm(a.context,a.tool.id,request) as any
  expect(preview).toMatchObject({ok:true,count:4,totalQuestions:5,totalFields:6})
  expect(await db.educationPrivateTool.findUniqueOrThrow({where:{id:a.tool.id}})).toEqual(before)
  const command=confirmation(request,preview),outcomes=await Promise.allSettled([importPrivateForm(a.context,a.tool.id,command,true),importPrivateForm(a.context,a.tool.id,command,true)])
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1)
  expect((outcomes.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.code).toBe('PRIVATE_TOOL_REVISION_CONFLICT')
  const saved=await readPrivateTool(a.context,a.tool.id),definition=saved.definition as any
  expect(saved.revision).toBe(a.tool.revision+1);expect(definition.pages[0]).toEqual(original);expect(definition.pages[1].questions).toHaveLength(4)
  await expect(importPrivateForm(a.context,a.tool.id,command,true)).rejects.toThrow('REVISION_CONFLICT')
 })
 it('appends TEXT to an explicit group without changing an existing fixed snapshot',async()=>{
  const a=await actor(),frozen=await freezePrivateTool(a.context,a.tool.id,{expectedRevision:a.tool.revision,expectedContentHash:a.tool.contentHash})
  const request=body(a.tool,{targetPageKey:'original_group'}),preview=await importPrivateForm(a.context,a.tool.id,request) as any
  expect(preview.ok).toBe(true)
  const result=await importPrivateForm(a.context,a.tool.id,confirmation(request,preview),true) as any
  expect(result.definition.pages).toHaveLength(1);expect(result.definition.pages[0].questions).toHaveLength(3);expect(result.definition.pages[0].questions[0]).toEqual(original.questions[0])
  const version=await readPrivateToolVersion(a.context,a.tool.id,frozen.id)
  expect(version.contentHash).toBe(frozen.contentHash);expect((version.definition as any).pages).toEqual([original])
  expect(await db.educationPrivateToolVersion.count({where:{toolId:a.tool.id}})).toBe(1)
 })
 it('rejects capability revocation between preview and confirmation without changing the draft',async()=>{
  const a=await actor(),request=body(a.tool),preview=await importPrivateForm(a.context,a.tool.id,request) as any
  await db.organizationCapabilityGrant.update({where:{id:a.capability.id},data:{revokedAt:new Date(),revokedByUserId:a.user.id}})
  await expect(importPrivateForm(a.context,a.tool.id,confirmation(request,preview),true)).rejects.toThrow('AUTHOR_REQUIRED')
  expect((await db.educationPrivateTool.findUniqueOrThrow({where:{id:a.tool.id}})).revision).toBe(a.tool.revision)
 })
 it('rejects another author, another school and a changed saved draft after preview',async()=>{
  const a=await actor(),other=await actor(a.org),foreign=await actor(),request=body(a.tool),preview=await importPrivateForm(a.context,a.tool.id,request) as any
  for(const context of [other.context,foreign.context])await expect(importPrivateForm(context,a.tool.id,request)).rejects.toThrow('NOT_FOUND')
  await updatePrivateTool(a.context,a.tool.id,{expectedRevision:a.tool.revision,title:'Changed by author',definition:a.tool.definition})
  await expect(importPrivateForm(a.context,a.tool.id,confirmation(request,preview),true)).rejects.toThrow('REVISION_CONFLICT')
  expect((await readPrivateTool(a.context,a.tool.id)).definition).toEqual(a.tool.definition)
 })
})
