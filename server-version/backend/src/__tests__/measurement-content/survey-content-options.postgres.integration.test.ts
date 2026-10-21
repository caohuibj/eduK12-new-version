import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave} from '../../modules/survey/waves.publish'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {listSurveyContentOptions} from '../../modules/survey/content-options.service'
import {publishContentRelease,transitionContentRelease} from '../../modules/measurement-content/repository'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {AssessmentReferenceEntry} from '../../modules/assessment-reference/reference'
import type {ScaleDraft} from '../../modules/survey/builder.definition'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient,owner:string,other:string,project:string,instrument:string
let measurement:Awaited<ReturnType<typeof publishSurveyMeasurementDraft>>
const key=()=>randomUUID().replaceAll('-','')
const definition:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[1,2,3].map(score=>({optionKey:'o'+score,label:String(score),score})),
 dimensions:[{dimensionKey:'motivation',label:'动机',direction:'descriptive'}],
 items:[{itemKey:'itemone',prompt:'我喜欢学习',required:true,reverse:false,dimensionKeys:['motivation']}]}
const flags={publication:process.env.SURVEY_PUBLICATION_ENABLED,workspace:process.env.SURVEY_WORKSPACE_ENABLED}
const restore=(name:string,value:string|undefined)=>{if(value===undefined)delete process.env[name];else process.env[name]=value}
const scope=()=>({kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project})
const pointer=()=>({releaseId:measurement.releaseId,contentHash:measurement.contentHash})
const entry=()=>({instrumentVersion:'1',scoringVersion:'1',scoreKey:measurement.metricKeys[0],referenceKind:'descriptive_sample',
 population:{description:'Synthetic research sample'},statistics:{mean:2},source:{citation:'Synthetic fixture'}})
async function report(overrides:Record<string,unknown>={}){
 return db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'REPORT',key:'selection:'+key(),version:'1',
  scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{projectionVersion:1,measurements:[pointer()],
   metricKeys:measurement.metricKeys,audience:'researcher',language:'zh-CN',generatorVersion:'1',
   template:{title:'私有报告',blocks:[{type:'TEXT',text:'Private template body'}]}},...overrides},owner))
}
async function wave(){return createWave(owner,project,{requestId:randomUUID(),title:'选择测试',instrumentIds:[instrument],
 consentText:'这是隔离数据库中的合成研究测试，参与完全自愿，您可以随时停止。',generalText:'感谢参与。'})}
async function state(){return {
 releases:await db.$queryRaw(Prisma.sql`SELECT id,status,content_hash FROM measurement_content_releases ORDER BY id`),
 draft:await db.surveyInstrumentDraft.findUnique({where:{id:instrument}}),
 waves:await db.surveyWave.findMany({where:{projectId:project},orderBy:{id:'asc'}}),
 events:await db.surveyEvent.count({where:{projectId:project}}),
 publications:await db.surveyPublication.count({where:{projectId:project}}),
}}
suite('Survey Wave private content options / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.SURVEY_WORKSPACE_ENABLED='true'
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const admin=await db.user.create({data:{username:'selectionadmin'+key(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
  for(let i=0;i<2;i++){
   const user=await db.user.create({data:{username:'selection'+key(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
   const login='selection'+key();await db.surveyAccount.create({data:{userId:user.id,loginName:login,normalizedLogin:login}})
   await db.surveyResearcherGrant.create({data:{userId:user.id,status:'ACTIVE',grantedBy:admin.id}})
   await db.surveyMfaCredential.create({data:{userId:user.id,enabled:true,secretCipher:'synthetic'}})
   if(i===0)owner=user.id;else other=user.id
  }
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'隔离选择测试',collectionMode:'SINGLE_UNLINKED'}})
  instrument=randomUUID();await createDraft(owner,project,{requestId:instrument,kind:'SCALE',instrumentKey:'selection'+key(),title:'研究量表'})
  await updateDraft(owner,project,instrument,{revision:0,title:'研究量表',definition})
  measurement=await publishSurveyMeasurementDraft(owner,project,instrument,1)
 })
 afterAll(async()=>{
  restore('SURVEY_PUBLICATION_ENABLED',flags.publication);restore('SURVEY_WORKSPACE_ENABLED',flags.workspace)
  await db?.$disconnect()
 })
 it('executes exact private/project/owner/measurement filters and never writes on GET',async()=>{
  const selected=await report(),w=await wave()
  await report({scope:{kind:'PLATFORM'}})
  await report({scope:{...scope(),kind:'SHARED'}})
  await report({scope:{...scope(),ownerId:other}})
  await report({scope:{...scope(),resourceId:randomUUID()}})
  await report({scope:{...scope(),product:'TRAINING'}})
  const retired=await report();await db.$transaction(tx=>transitionContentRelease(tx,{releaseId:retired.releaseId,expectedStatus:'PUBLISHED',status:'RETIRED',actorId:owner,reason:'Synthetic exclusion'}))
  // Valid release for a different exact measurement is excluded by the real JSONB query.
  const source=await db.$queryRaw<Array<{content:Record<string,unknown>}>>(Prisma.sql`SELECT content FROM measurement_content_releases WHERE id=${measurement.releaseId}`)
  const alternate=await db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'MEASUREMENT',key:'alternate:'+key(),version:'1',scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{...source[0].content,measurementHash:'e'.repeat(64)}},owner))
  await report({content:{projectionVersion:1,measurements:[{releaseId:alternate.releaseId,contentHash:alternate.contentHash}],metricKeys:measurement.metricKeys,audience:'researcher',language:'zh-CN',generatorVersion:'1',template:{title:'Wrong measurement'}}})
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'REFERENCE',key:'reference:'+key(),version:'1',scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{projectionVersion:1,measurement:pointer(),entries:[{metricKey:measurement.metricKeys[0],referenceKind:'descriptive_sample',definition:entry()}],evidence:{fixture:true}}},owner))
  const before=await state()
  const result=await listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REPORT'})
  expect(result.options.map(x=>x.releaseId)).toEqual([selected.releaseId])
  expect(JSON.stringify(result)).not.toContain('Private template body')
  const references=await listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REFERENCE'})
  expect(references.options).toMatchObject([{releaseId:reference.releaseId,entries:[{entryKey:referenceEntryKey(entry() as AssessmentReferenceEntry)}]}])
  expect(JSON.stringify(references)).not.toContain('statistics')
  await expect(listSurveyContentOptions(other,project,w.id,{instrumentId:instrument,layer:'REPORT'})).rejects.toThrow()
  expect(await state()).toEqual(before)
  await db.surveyResearcherGrant.update({where:{userId:owner},data:{status:'REVOKED'}})
  try{await expect(listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REPORT'})).rejects.toThrow()}
  finally{await db.surveyResearcherGrant.update({where:{userId:owner},data:{status:'ACTIVE'}})}
 })
 it('keeps prepare authoritative after a stale selection and freezes exact successful choices',async()=>{
  const stale=await report(),w=await wave()
  await listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REPORT'})
  await db.$transaction(tx=>transitionContentRelease(tx,{releaseId:stale.releaseId,expectedStatus:'PUBLISHED',status:'REVOKED',actorId:owner,reason:'Synthetic stale choice'}))
  const before=await state()
  await expect(prepareWave(owner,project,w.id,w.revision,[{instrumentId:instrument,reportReleaseId:stale.releaseId,references:[]}])).rejects.toThrow()
  expect(await state()).toEqual(before)
  const selected=await report()
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'REFERENCE',key:'freeze-reference:'+key(),version:'1',scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{projectionVersion:1,measurement:pointer(),entries:[{metricKey:measurement.metricKeys[0],referenceKind:'descriptive_sample',definition:entry()}],evidence:{fixture:true}}},owner))
  await prepareWave(owner,project,w.id,w.revision,[{instrumentId:instrument,reportReleaseId:selected.releaseId,references:[{releaseId:reference.releaseId,entryKey:referenceEntryKey(entry() as AssessmentReferenceEntry),priority:1}]}])
  const frozen=await getWave(owner,project,w.id)
  expect(frozen).toMatchObject({frozenContentSelections:[{draftId:instrument,measurementRelease:pointer(),contentSelection:{reportRelease:{releaseId:selected.releaseId,contentHash:selected.contentHash},referencePolicy:{choices:[{releaseId:reference.releaseId,contentHash:reference.contentHash,priority:1}]}}}]})
  const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:frozen.publicationId!}})
  expect(canonicalHash(publication.compiledSnapshot)).toBe(publication.definitionDigest)
  const saved=await state();await getWave(owner,project,w.id)
  await expect(listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REPORT'})).rejects.toThrow()
  expect(await state()).toEqual(saved)
 })
})
