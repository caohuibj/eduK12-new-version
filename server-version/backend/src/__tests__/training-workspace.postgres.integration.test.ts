import example from '../modules/situational/authoring/examples/teacher-demonstration.json'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
vi.mock('../modules/cognitive/assignment.service',()=>({listPublishedConfigs:async()=>[]}))
vi.mock('../modules/situational/situational-release.service',()=>({listSituationalResourceSummaries:async()=>[]}))
vi.mock('../modules/bundle-product/service',()=>({bundleProductService:{catalog:async()=>[]}}))
const suite=process.env.WORKSPACE_LIBRARY_INTEGRATION==='1'?describe:describe.skip
let db:typeof import('../config/database')['prisma'], router:any
const users:string[]=[],assets:string[]=[],scales:string[]=[]
let owner:string,other:string,viewer:string,assetId:string,hidden:string,privateCourse:string
async function call(path:string,userId:string,query:any={},body:any={},params:any={}) {
  const handler=router.stack.find((layer:any)=>layer.route?.path===path).route.stack[0].handle
  const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(value:any){this.body=value;return this}}
  let failure:any
  await handler({user:{userId,role:'TEACHER'},query,body,params},res,(cause:any)=>{failure=cause})
  if(failure)throw failure
  return res
}
suite('Training library real metadata and permission boundaries',()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!)
    if(url.hostname!=='127.0.0.1'||url.port!=='5549'||url.pathname!=='/eduk12_mac_work_20261021')throw new Error('Explicit local fixture database required')
    db=(await import('../config/database')).prisma
    const config=(await import('../config')).config
    expect(config.materialGrantsEnabled).toBe(true)
    router=(await import('../routes/trainingWorkspace')).default
    for(let n=0;n<3;n++){const row=await db.user.create({data:{username:'workspace-fixture-'+randomUUID(),passwordHash:'synthetic-only',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}});users.push(row.id)}
    ;[owner,other,viewer]=users
    for(const [name,scope] of [['Needle own','PRIVATE'],['Foreign hidden','PRIVATE'],['Course private','COURSE']] as const){const asset=await db.storedAsset.create({data:{objectKey:'workspace-fixture/'+randomUUID(),sha256:'0'.repeat(64),mimeType:'image/png',sizeBytes:1,originalName:name,ownerId:name==='Needle own'?owner:other,accessScope:scope,scopeId:scope==='COURSE'?randomUUID():null}});assets.push(asset.id)}
    ;[assetId,hidden,privateCourse]=assets
    await db.materialGrant.create({data:{teacherId:viewer,resourceType:'MEDIA_ASSET',resourceId:assetId,grantedBy:owner}})
    // A stale/invalid grant must not make course-private data appear.
    await db.materialGrant.create({data:{teacherId:viewer,resourceType:'MEDIA_ASSET',resourceId:privateCourse,grantedBy:owner}})
  },30000)
  afterAll(async()=>{if(!db)return;await db.materialGrant.deleteMany({where:{teacherId:{in:users}}});await db.assetReference.deleteMany({where:{assetId:{in:assets}}});await db.storedAsset.deleteMany({where:{id:{in:assets}}});await db.questionnaire.deleteMany({where:{creatorId:{in:users}}});await db.scale.deleteMany({where:{id:{in:scales}}});const drafts=await db.sjtAuthorDraft.findMany({where:{ownerId:{in:users}},select:{id:true}});await db.sjtAuthorAudit.deleteMany({where:{draftId:{in:drafts.map(row=>row.id)}}});await db.sjtAuthorDraft.deleteMany({where:{ownerId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect()})
  it('lists only owned and exact granted media, with search before pagination and accurate count',async()=>{
    const owned=await call('/media',owner,{keyword:'Needle',pageSize:1})
    expect(owned.body.data.total).toBe(1);expect(owned.body.data.list[0]).toMatchObject({id:assetId,source:'owned'})
    const granted=await call('/media',viewer,{source:'granted'})
    expect(granted.body.data.total).toBe(1);expect(granted.body.data.list[0]).toMatchObject({id:assetId,source:'granted'})
    expect((await call('/media',viewer,{keyword:'Foreign'})).body.data.total).toBe(0)
    expect((await call('/media',viewer,{keyword:'Course private'})).body.data.total).toBe(0)
    expect((await call('/media',viewer,{keyword:"' OR true --"})).body.data.total).toBe(0)
  })
  it('renames metadata while preserving the object and existing references; rejects grantees',async()=>{
    const before=await db.storedAsset.findUniqueOrThrow({where:{id:assetId}})
    await db.assetReference.create({data:{assetId,entityType:'WorkspaceFixture',entityId:randomUUID(),field:'content'}})
    await expect(call('/media/:id/name',viewer,{}, {name:'Unauthorized'}, {id:assetId})).rejects.toMatchObject({statusCode:403})
    await call('/media/:id/name',owner,{}, {name:'Renamed Needle'}, {id:assetId})
    const after=await db.storedAsset.findUniqueOrThrow({where:{id:assetId}})
    expect(after).toMatchObject({id:before.id,objectKey:before.objectKey,sha256:before.sha256,originalName:'Renamed Needle'})
    expect(await db.assetReference.count({where:{assetId}})).toBe(1)
  })
  it('allows granted media to be read and attached, then blocks new use after revocation',async()=>{
    const {canReadPrivateAsset,validateAssetReferencesForCourse}=await import('../services/assetStorage')
    const asset=await db.storedAsset.findUniqueOrThrow({where:{id:assetId}})
    expect(await canReadPrivateAsset(asset,{userId:viewer,role:'TEACHER'})).toBe(true)
    const args:any={values:{media:[{assetId,url:`/api/assets/${assetId}/file`}]},ownerId:viewer,role:'TEACHER',courseId:randomUUID()}
    expect(await validateAssetReferencesForCourse(args)).toHaveLength(1)
    expect(await canReadPrivateAsset(await db.storedAsset.findUniqueOrThrow({where:{id:hidden}}),{userId:viewer,role:'TEACHER'})).toBe(false)
    await db.materialGrant.deleteMany({where:{teacherId:viewer,resourceId:assetId}})
    expect(await canReadPrivateAsset(asset,{userId:viewer,role:'TEACHER'})).toBe(false)
    await expect(validateAssetReferencesForCourse(args)).rejects.toThrow()
  })
  it('searches and paginates owned/granted tools without loading foreign drafts or scoring JSON',async()=>{
    for(const [creatorId,name,status] of [[owner,'Needle tool A','DRAFT'],[owner,'Needle tool B','PUBLISHED'],[other,'Foreign tool','DRAFT']] as const){const row=await db.scale.create({data:{creatorId,name,status,code:randomUUID(),definition:{private:'must not leak'}}});scales.push(row.id)}
    await db.materialGrant.create({data:{teacherId:viewer,resourceType:'SCALE',resourceId:scales[1],grantedBy:owner}})
    const own=await call('/tools',owner,{keyword:'Needle',pageSize:1})
    expect(own.body.data.total).toBe(2);expect(own.body.data.list).toHaveLength(1);expect(own.body.data.list[0]).not.toHaveProperty('definition')
    const granted=await call('/tools',viewer,{source:'granted',kind:'scale'})
    expect(granted.body.data.total).toBe(1);expect(granted.body.data.list[0]).toMatchObject({id:scales[1],source:'granted'})
  })
  it('creates an independent SJT revision draft while preserving the published source and author boundary',async()=>{
    const source=await db.sjtAuthorDraft.create({data:{ownerId:owner,status:'PUBLISHED',contentDigest:'0'.repeat(64),template:{...example,instrumentKey:'workspace-fixture-'+randomUUID()}}})
    const {forkSjtDraftVersion}=await import('../modules/situational/authoring/service')
    await expect(forkSjtDraftVersion({userId:viewer,admin:false},source.id)).rejects.toMatchObject({statusCode:403})
    const next=await forkSjtDraftVersion({userId:owner,admin:false},source.id)
    expect(next.id).not.toBe(source.id);expect(next.status).toBe('DRAFT')
    expect(next.template).toMatchObject({instrumentVersion:'1.0.1',title:example.title})
    expect(await db.sjtAuthorDraft.findUnique({where:{id:source.id}})).toEqual(source)
    expect(await db.sjtAuthorRelease.count({where:{sourceDraftId:next.id}})).toBe(0)
  },15000)

  it('reuses an exactly granted published form into an independent draft, preserving sections without private data',async()=>{
    const source=await db.questionnaire.create({data:{creatorId:owner,type:'GENERAL',status:'PUBLISHED',code:randomUUID(),name:'Granted pure form',formSections:{create:[{title:'第一部分',description:'说明一',position:0}]}}})
    const section=await db.questionnaireFormSection.findFirstOrThrow({where:{questionnaireId:source.id}})
    await db.questionnaireFormItem.create({data:{questionnaireId:source.id,sectionId:section.id,sectionPosition:0,type:'text_input',label:'请填写反馈',position:0}})
    const {generalQuestionnaireController}=await import('../controllers/generalQuestionnaireController')
    const invoke=async()=>{const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(body:any){this.body=body;return this}};await generalQuestionnaireController.duplicate({user:{userId:viewer,role:'TEACHER'},params:{id:source.id}} as any,res);return res}
    expect((await invoke()).statusCode).toBe(403)
    await db.materialGrant.create({data:{teacherId:viewer,resourceType:'FORM_TEMPLATE',resourceId:source.id,grantedBy:owner}})
    expect((await call('/tools',viewer,{kind:'form',source:'granted'})).body.data.list).toEqual(expect.arrayContaining([expect.objectContaining({id:source.id})]))
    const res=await invoke();expect(res.statusCode).toBe(200)
    const copied=await db.questionnaire.findUniqueOrThrow({where:{id:res.body.data.id},include:{formSections:true,formItems:true,_count:{select:{assessments:true,accessTokens:true}}}})
    expect(copied.id).not.toBe(source.id);expect(copied.creatorId).toBe(viewer);expect(copied.status).toBe('DRAFT')
    expect(copied.formSections[0]).toMatchObject({title:section.title,description:section.description,position:0})
    expect(copied.formSections[0].id).not.toBe(section.id);expect(copied.formItems[0]).toMatchObject({label:'请填写反馈',sectionId:copied.formSections[0].id})
    expect(copied._count).toEqual({assessments:0,accessTokens:0})
    expect(await db.questionnaire.findUnique({where:{id:source.id}})).toEqual(source)
    await db.materialGrant.deleteMany({where:{teacherId:viewer,resourceId:source.id}})
    expect((await invoke()).statusCode).toBe(403)
  },15000)

})
