import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration/integration-env'
import {publishContentRelease} from '../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../modules/measurement-content/scale'
import {compileResearchScale} from '../modules/survey/builder.compiler'
import {hashScaleDefinition} from '../modules/scale/scale-definition'
import {submit,review,changeEntryStatus} from '../modules/scale-library-governance/service'
import {grantUse,revokeUse} from '../modules/scale-library-governance/distribution'
import {copyScaleToDraft} from '../modules/scale/scale-copy.service'
import {config} from '../config'
vi.mock('../modules/cognitive/assignment.service',()=>({listPublishedConfigs:async()=>[]}))
vi.mock('../modules/situational/situational-release.service',()=>({listSituationalResourceSummaries:async()=>[]}))
vi.mock('../modules/bundle-product/service',()=>({bundleProductService:{catalog:async()=>[]}}))
import router from '../routes/trainingWorkspace'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,author:string,recipient:string,stranger:string,surveyAuthor:string,project:string
const prefix='workspace-governance-'+randomUUID()
const metadata={title:prefix,author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic only',scoringDescription:'Mean',reportDescription:'Descriptive only'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'item',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['total']}]}
async function catalog(userId:string,query:Record<string,unknown>={}){
 const layer=router.stack.find((item:any)=>item.route?.path==='/tools') as any
 const response:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(body:any){this.body=body;return this}}
 let failure:unknown
 await layer.route.stack[0].handle({user:{userId,role:'TEACHER'},query:{keyword:prefix,kind:'scale',...query}},response,(error:unknown)=>{failure=error})
 if(failure)throw failure
 expect(response.statusCode).toBe(200)
 return response.body.data
}
async function approved(version:string,product:'TRAINING'|'SURVEY'='TRAINING'){
 const owner=product==='TRAINING'?author:surveyAuthor,localId=randomUUID(),compiled=compileResearchScale(prefix,definition)
 const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId,version:'v'+version,instrumentVersion:version,definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:product==='SURVEY'?'ALL_AT_ONCE':'RUNNER_DEFAULT',scope:{kind:'PRIVATE',ownerId:owner,product,resourceId:product==='SURVEY'?project:localId},provenance:{authoringRelationship:'ORIGINAL',authoringSnapshot:{title:prefix,definition:product==='SURVEY'?definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',product}}}),owner))
 if(product==='TRAINING')await db.scale.create({data:{id:localId,code:randomUUID(),name:prefix,creatorId:owner,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:version,definition:compiled as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(compiled),measurementReleaseId:release.releaseId}})
 const submission=await submit(owner,product,{requestId:randomUUID(),releaseId:release.releaseId,metadata})
 const result=await review(admin,submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic catalog regression'})
 return {entryId:result.entryId!,sourceId:localId}
}
suite('Training workspace uses authoritative exact-version library permissions',()=>{
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:randomUUID(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  const teachers=await Promise.all([0,1,2].map(()=>db.user.create({data:{username:randomUUID(),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})))
  ;[author,recipient,stranger]=teachers.map(row=>row.id)
  surveyAuthor=(await db.user.create({data:{username:randomUUID(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})).id
  const login=randomUUID().replace(/-/g,'');await db.surveyAccount.create({data:{userId:surveyAuthor,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:surveyAuthor,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:surveyAuthor,enabled:true,secretCipher:'synthetic'}})
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:surveyAuthor,title:'Synthetic catalog project',collectionMode:'SINGLE_UNLINKED'}})
 },30000)
 afterAll(async()=>{await db?.$disconnect()})
 it('lists only the granted exact version, never confuses author provenance with ownership or adaptation rights',async()=>{
  const first=await approved('1'),second=await approved('2')
  await grantUse(admin,first.entryId,{requestId:randomUUID(),userId:recipient,product:'TRAINING'})
  await grantUse(admin,second.entryId,{requestId:randomUUID(),userId:stranger,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:first.entryId}})
  const before=await db.scale.findUniqueOrThrow({where:{id:wrapper.id}})
  const result=await catalog(recipient,{source:'granted',pageSize:1})
  expect(result.total).toBe(1);expect(result.list).toHaveLength(1)
  expect(result.list[0]).toMatchObject({id:wrapper.id,version:'1',source:'granted',ownerId:null,canUpdateVersion:false})
  for(const field of ['definition','copySource','courseScales','assessments','_count','creatorId'])expect(result.list[0]).not.toHaveProperty(field)
  expect((await catalog(recipient,{source:'owned'})).total).toBe(0)
  expect((await catalog(author)).list.map((row:any)=>row.id)).not.toContain(wrapper.id)
  await grantUse(admin,first.entryId,{requestId:randomUUID(),userId:author,product:'TRAINING'})
  expect((await catalog(author,{source:'granted'})).list).toEqual([expect.objectContaining({id:wrapper.id,ownerId:null,canUpdateVersion:false})])
  await expect(copyScaleToDraft(wrapper.id,author)).rejects.toMatchObject({status:403})
  await expect(copyScaleToDraft(wrapper.id,recipient)).rejects.toMatchObject({status:403})
  expect(await db.scale.findUniqueOrThrow({where:{id:wrapper.id}})).toEqual(before)
 },30000)
 it('excludes revoked and withdrawn grants, even when the material grant or author provenance remains',async()=>{
  const state=await approved('3')
  const use=await grantUse(admin,state.entryId,{requestId:randomUUID(),userId:recipient,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:state.entryId}})
  expect((await catalog(recipient)).list.map((row:any)=>row.id)).toContain(wrapper.id)
  await db.user.update({where:{id:admin},data:{isFrozen:true}})
  try{expect((await catalog(recipient)).list.map((row:any)=>row.id)).not.toContain(wrapper.id)}
  finally{await db.user.update({where:{id:admin},data:{isFrozen:false}})}
  await revokeUse(admin,use.id,{expectedVersion:1,reason:'Synthetic revocation'})
  expect((await catalog(recipient)).list.map((row:any)=>row.id)).not.toContain(wrapper.id)
  await grantUse(admin,state.entryId,{requestId:randomUUID(),userId:author,product:'TRAINING'})
  await changeEntryStatus(admin,state.entryId,{expectedVersion:1,status:'WITHDRAWN',reason:'Synthetic withdrawal'})
  expect((await catalog(author)).list.map((row:any)=>row.id)).not.toContain(wrapper.id)
 },30000)
 it('keeps approved Survey-authored versions visible to exact Training recipients independently of the legacy feature flag',async()=>{
  const state=await approved('4','SURVEY')
  await grantUse(admin,state.entryId,{requestId:randomUUID(),userId:recipient,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:state.entryId}})
  const previous=config.materialGrantsEnabled
  try{config.materialGrantsEnabled=false
   expect((await catalog(recipient)).list).toContainEqual(expect.objectContaining({id:wrapper.id,version:'4',source:'granted',canUpdateVersion:false}))
   expect((await catalog(stranger)).list.map((row:any)=>row.id)).not.toContain(wrapper.id)
  }finally{config.materialGrantsEnabled=previous}
 },30000)
 it('preserves own private drafts and genuine pre-library grants without granting new access to an approved private source',async()=>{
  const state=await approved('5')
  const draft=await db.scale.create({data:{code:randomUUID(),name:prefix,creatorId:author,status:'DRAFT',definition:{private:'never exposed'}}})
  expect((await catalog(author,{source:'owned'})).list).toContainEqual(expect.objectContaining({id:draft.id,source:'owned'}))
  const previous=config.materialGrantsEnabled
  try{config.materialGrantsEnabled=true
   await db.materialGrant.create({data:{teacherId:recipient,resourceType:'SCALE',resourceId:state.sourceId,grantedBy:admin}})
   expect((await catalog(recipient)).list.map((row:any)=>row.id)).not.toContain(state.sourceId)
   await db.materialGrant.update({where:{teacherId_resourceType_resourceId:{teacherId:recipient,resourceType:'SCALE',resourceId:state.sourceId}},data:{legacyScaleGrant:true}})
   expect((await catalog(recipient)).list).toContainEqual(expect.objectContaining({id:state.sourceId,source:'granted',canUpdateVersion:false}))
  }finally{config.materialGrantsEnabled=previous}
 },30000)
})
