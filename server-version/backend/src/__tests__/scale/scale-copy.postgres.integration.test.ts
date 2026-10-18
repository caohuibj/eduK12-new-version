import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'

const url = integrationDatabaseUrl('INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let copy: typeof import('../../modules/scale/scale-copy.service')['copyScaleToDraft']
let publish: typeof import('../../controllers/scaleImageController')['scaleImageController']['publish']
let controller: typeof import('../../controllers/scaleController')['scaleController']
const users: string[] = []
const assets: string[] = []
const response = () => { const r: any = { statusCode: 200 }; r.status = (s: number) => { r.statusCode=s; return r }; r.json=(b: any)=>{r.body=b;return r}; return r }
const request = (id: string, userId: string, body: any = {}) => ({ params:{id},user:{userId,role:'TEACHER'},body }) as any
const gate = () => { let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return{promise,resolve} }
async function fixture(patch: any = {}) {
  const user=await db.user.create({data:{username:'copy-'+randomUUID(),passwordHash:'synthetic-only',role:'TEACHER'}});users.push(user.id)
  const definition=scaleDefinitionFor(2,'C')
  const scale=await db.scale.create({data:{code:randomUUID(),name:'Source',creatorId:user.id,status:'PUBLISHED',definition:definition as any,definitionHash:hashScaleDefinition(definition),itemCount:2,dimensionCount:0,...patch}})
  return{user,scale,definition}
}
suite('Scale copied draft immutable provenance and publication',()=>{
 beforeAll(async()=>{process.env.DATABASE_URL=url!;db=(await import('../../config/database')).prisma;copy=(await import('../../modules/scale/scale-copy.service')).copyScaleToDraft;publish=(await import('../../controllers/scaleImageController')).scaleImageController.publish;controller=(await import('../../controllers/scaleController')).scaleController})
 afterAll(async()=>{if(!db)return;const ids=(await db.scale.findMany({where:{creatorId:{in:users}},select:{id:true}})).map(x=>x.id);await db.assetReference.deleteMany({where:{entityType:'ScaleCopyDraft',entityId:{in:ids}}});await db.scale.deleteMany({where:{id:{in:ids}}});await db.assetReference.deleteMany({where:{assetId:{in:assets}}});await db.storedAsset.deleteMany({where:{id:{in:assets}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect()})
 it('copies exact definition and frozen identity without delivery, results or grants',async()=>{
  const {scale,user}=await fixture();const draft=await copy(scale.id,user.id)
  expect(draft.id).not.toBe(scale.id);expect(draft.code).not.toBe(scale.code);expect(draft.status).toBe('DRAFT');expect(draft.visibility).toBe('HIDDEN');expect(draft.definition).toEqual(scale.definition);expect(draft.definitionHash).toBe(scale.definitionHash)
  expect(draft.copySource).toMatchObject({schemaVersion:1,parentId:scale.id,parentDefinitionHash:scale.definitionHash,parentCreatorId:user.id})
  expect(await db.courseScale.count({where:{scaleId:draft.id}})).toBe(0);expect(await db.assessment.count({where:{scaleId:draft.id}})).toBe(0)
  const res=response();await publish(request(draft.id,user.id),res);expect(res.statusCode).toBe(200);expect(res.body.data.status).toBe('PUBLISHED');expect(await db.scale.findUnique({where:{id:scale.id}})).toEqual(scale)
 })
 it('denies non-author, STANDARD, draft and non-self-authored/restricted licenses',async()=>{
  const {scale,user,definition}=await fixture();await expect(copy(scale.id,randomUUID())).rejects.toMatchObject({status:403})
  for(const patch of [{instrumentClass:'STANDARD'},{status:'DRAFT'},{definition:{...definition,license:{status:'authorized',redistribution:'allowed'}}},{definition:{...definition,license:{status:'self_authored',redistribution:'restricted'}}}]){
   await db.scale.update({where:{id:scale.id},data:{status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:definition as any,...patch} as any});await expect(copy(scale.id,user.id)).rejects.toMatchObject({status:403})
  }
 })
 it('rejects request-supplied provenance; edits retain the server-created source',async()=>{
  const {scale,user,definition}=await fixture();const invalid=response();await controller.copy(request(scale.id,user.id,{copySource:{parentId:'fake'}}),invalid);expect(invalid.body.code).not.toBe(0)
  const draft=await copy(scale.id,user.id);definition.items[0].content='Edited';const edited=response();await controller.updateDefinition(request(draft.id,user.id,{definition,copySource:null,expectedUpdatedAt:draft.updatedAt.toISOString()}),edited);expect(edited.body.code).toBe(0);expect(edited.body.data.copySource).toEqual(draft.copySource)
 })
 it('CAS rejects stale metadata, definition and publication instead of overwriting a second editor',async()=>{
  const {scale,user,definition}=await fixture();const draft=await copy(scale.id,user.id)
  await db.scale.update({where:{id:draft.id},data:{name:'Second editor',updatedAt:new Date(draft.updatedAt.getTime()+1000)}})
  for(const [fn,body] of [[controller.update,{name:'Stale'}],[controller.updateDefinition,{definition}],[publish,{}]] as const){const r=response();await fn(request(draft.id,user.id,{...body,expectedUpdatedAt:draft.updatedAt.toISOString()}),r);expect(r.statusCode).toBe(409)}
  expect((await db.scale.findUniqueOrThrow({where:{id:draft.id}})).name).toBe('Second editor')
 })
 it('source deletion serialized before publication fails the new draft only',async()=>{
  const {scale,user}=await fixture();const draft=await copy(scale.id,user.id);const locked=gate(),release=gate()
  const deletion=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM scales WHERE id=${scale.id} FOR UPDATE`;locked.resolve();await release.promise;await tx.scale.delete({where:{id:scale.id}})})
  await locked.promise;const r=response();const publishing=publish(request(draft.id,user.id),r);await new Promise(r=>setTimeout(r,50));release.resolve();await deletion;await publishing
  expect(r.statusCode).toBe(409);expect(r.body.message).toContain('不存在');expect((await db.scale.findUniqueOrThrow({where:{id:draft.id}})).status).toBe('DRAFT')
 })
 it('checks source license digest even when version-axis definition hash excludes license',async()=>{
  const {scale,user,definition}=await fixture();definition.versionAxes={schemaVersion:1,subjectKey:'test',locale:'zh-CN',localizationVersion:'1'}
  await db.scale.update({where:{id:scale.id},data:{definition:definition as any,definitionHash:hashScaleDefinition(definition)}});const draft=await copy(scale.id,user.id)
  definition.license.note='Changed right evidence';await db.scale.update({where:{id:scale.id},data:{definition:definition as any}})
  const r=response();await publish(request(draft.id,user.id),r);expect(r.statusCode).toBe(409)
 })
 it('does not impose copy licensing on native drafts or retroactively change published copies',async()=>{
  const {scale,user,definition}=await fixture();const draft=await copy(scale.id,user.id);const r=response();await publish(request(draft.id,user.id),r);expect(r.body.code).toBe(0)
  await db.scale.delete({where:{id:scale.id}});expect((await db.scale.findUniqueOrThrow({where:{id:draft.id}})).status).toBe('PUBLISHED')
  definition.license={status:'unknown',redistribution:'unknown'};const native=await db.scale.create({data:{code:randomUUID(),name:'Native',creatorId:user.id,definition:definition as any,definitionHash:hashScaleDefinition(definition)}})
  const n=response();await publish(request(native.id,user.id),n);expect(n.body.code).toBe(0)
 })
 it('retains copied media, rolls back failed replacement, releases draft pins only after publish/delete',async()=>{
  const {scale,user,definition}=await fixture();const asset=await db.storedAsset.create({data:{objectKey:'copy-test/'+randomUUID(),provider:'local',mimeType:'image/png',sizeBytes:1,sha256:'a'.repeat(64),originalName:'synthetic.png',accessScope:'PRIVATE'}});assets.push(asset.id)
  definition.items[0].images=[{asset:{assetId:asset.id,mimeType:'image/png',contentHash:asset.sha256},altText:'Synthetic',order:0}]
  await db.scale.update({where:{id:scale.id},data:{definition:definition as any,definitionHash:hashScaleDefinition(definition)}})
  const draft=await copy(scale.id,user.id);expect(await db.assetReference.count({where:{entityType:'ScaleCopyDraft',entityId:draft.id,assetId:asset.id}})).toBe(1)
  const bad=structuredClone(definition);bad.items[0].images![0].asset.contentHash='b'.repeat(64);const rejected=response();await controller.updateDefinition(request(draft.id,user.id,{definition:bad}),rejected);expect(rejected.body.code).not.toBe(0);expect((await db.scale.findUniqueOrThrow({where:{id:draft.id}})).definition).toEqual(definition)
  expect(await db.assetReference.count({where:{entityType:'ScaleCopyDraft',entityId:draft.id}})).toBe(1)
  const published=response();await publish(request(draft.id,user.id),published);expect(published.body.code).toBe(0)
  expect(await db.assetReference.count({where:{entityType:'ScaleCopyDraft',entityId:draft.id}})).toBe(0)
  expect(await db.assetReference.count({where:{entityType:'AssessmentPublishedDefinition',entityId:`SCALE:${draft.id}:${draft.definitionHash}`,assetId:asset.id}})).toBe(1)
  const removed=await copy(scale.id,user.id);const r=response();await controller.delete(request(removed.id,user.id),r);expect(r.body.code).toBe(0);expect(await db.assetReference.count({where:{entityType:'ScaleCopyDraft',entityId:removed.id}})).toBe(0)
  expect(await db.assetReference.count({where:{entityType:'AssessmentPublishedDefinition',assetId:asset.id}})).toBe(1)
 })
 it('source deletion before copy yields no orphan draft',async()=>{
  const {scale,user}=await fixture();const locked=gate(),release=gate();const deletion=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM scales WHERE id=${scale.id} FOR UPDATE`;locked.resolve();await release.promise;await tx.scale.delete({where:{id:scale.id}})})
  await locked.promise;const pending=copy(scale.id,user.id);const rejection=expect(pending).rejects.toMatchObject({status:404});await new Promise(r=>setTimeout(r,50));release.resolve();await deletion;await rejection;expect(await db.scale.count({where:{creatorId:user.id}})).toBe(0)
 })
 it('concurrent publishers freeze one version and later edits cannot change it',async()=>{
  const {scale,user,definition}=await fixture();const draft=await copy(scale.id,user.id);const a=response(),b=response();await Promise.all([publish(request(draft.id,user.id),a),publish(request(draft.id,user.id),b)]);expect([a.statusCode,b.statusCode].sort()).toEqual([200,409]);const frozen=await db.scale.findUniqueOrThrow({where:{id:draft.id}})
  definition.items[0].content='Too late';const r=response();await controller.updateDefinition(request(draft.id,user.id,{definition}),r);expect(r.statusCode).toBe(409);expect(await db.scale.findUniqueOrThrow({where:{id:draft.id}})).toEqual(frozen)
 })

})
