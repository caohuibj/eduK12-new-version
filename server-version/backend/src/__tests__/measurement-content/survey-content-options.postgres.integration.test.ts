import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {createDraft,updateDraft,reviseDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave} from '../../modules/survey/waves.publish'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {listSurveyContentOptions} from '../../modules/survey/content-options.service'
import {publishContentRelease,transitionContentRelease} from '../../modules/measurement-content/repository'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {AssessmentReferenceEntry} from '../../modules/assessment-reference/reference'
import type {ScaleDraft} from '../../modules/survey/builder.definition'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient,owner:string,other:string,project:string,instrument:string
let measurement:Awaited<ReturnType<typeof publishSurveyMeasurementDraft>>
const key=()=>randomUUID().replaceAll('-','')
const definition:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[1,2,3].map(score=>({optionKey:'o'+score,label:String(score),score})),
 dimensions:[{dimensionKey:'motivation',label:'动机',direction:'descriptive'}],
 totalScore:{key:'total',label:'自编总分',itemKeys:['itemone'],aggregation:'sum'},
 rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'total',ranges:[
  {key:'lower',min:1,max:2,includeMax:false,text:'作者低分区间反馈'},
  {key:'upper',min:2,max:3,includeMax:true,text:'作者高分区间反馈'}]}]},
 items:[{itemKey:'itemone',prompt:'我喜欢学习',required:true,reverse:false,dimensionKeys:['motivation']},
  {itemKey:'attention',prompt:'请选择第二项',required:true,reverse:false,dimensionKeys:[],purpose:'ATTENTION_CHECK',attentionTarget:'o2'},
  {itemKey:'social',prompt:'我从不撒谎',required:true,reverse:false,dimensionKeys:[],purpose:'SOCIAL_DESIRABILITY'}]}
const flags={publication:process.env.SURVEY_PUBLICATION_ENABLED,workspace:process.env.SURVEY_WORKSPACE_ENABLED}
const restore=(name:string,value:string|undefined)=>{if(value===undefined)delete process.env[name];else process.env[name]=value}
const scope=()=>({kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project})
const pointer=()=>({releaseId:measurement.releaseId,contentHash:measurement.contentHash})
const entry=()=>({instrumentVersion:'1',scoringVersion:'1',scoreKey:'total',referenceKind:'descriptive_sample',
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
   // The real realm SQL constraint permits 4–32 lowercase login characters.
   const login='selection'+key().slice(0,20);await db.surveyAccount.create({data:{userId:user.id,loginName:login,normalizedLogin:login}})
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
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'REFERENCE',key:'reference:'+key(),version:'1',scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{projectionVersion:1,measurement:pointer(),entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry()}],evidence:{fixture:true}}},owner))
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
  const reference=await db.$transaction(tx=>publishContentRelease(tx,{family:'SCALE',layer:'REFERENCE',key:'freeze-reference:'+key(),version:'1',scope:scope(),assetRefs:[],sourceReleaseId:null,provenance:{fixture:true},content:{projectionVersion:1,measurement:pointer(),entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry()}],evidence:{fixture:true}}},owner))
  const participantFeedback={policyVersion:'SURVEY_RAW_METRICS_V1' as const,mode:'DESCRIPTIVE' as const,metricKeys:['total'],release:'AFTER_FINAL' as const}
  await prepareWave(owner,project,w.id,w.revision,[{instrumentId:instrument,reportReleaseId:selected.releaseId,references:[{releaseId:reference.releaseId,entryKey:referenceEntryKey(entry() as AssessmentReferenceEntry),priority:1}]}],[{instrumentId:instrument,feedback:participantFeedback}])
  const frozen=await getWave(owner,project,w.id)
  expect(frozen).toMatchObject({frozenContentSelections:[{draftId:instrument,measurementRelease:pointer(),contentSelection:{reportRelease:{releaseId:selected.releaseId,contentHash:selected.contentHash},referencePolicy:{choices:[{releaseId:reference.releaseId,contentHash:reference.contentHash,priority:1}]}}}]})
  expect(frozen.frozenParticipantFeedback).toEqual([expect.objectContaining({draftId:instrument,participantFeedback})])
  const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:frozen.publicationId!}})
  expect(canonicalHash(publication.compiledSnapshot)).toBe(publication.definitionDigest)
  const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
  const unit=snapshot.units.find(candidate=>candidate.draftId===instrument)!
  const compiled=unit.compiledDefinition as ScaleDefinitionV2
  const display=unit.displayDefinition as ScaleDraft
  expect(measurement.metricKeys).toEqual(expect.arrayContaining(['motivation','total']))
  expect(display.totalScore).toEqual(definition.totalScore)
  expect(display.rawScoreFeedback).toEqual(definition.rawScoreFeedback)
  expect(compiled.report.rawScoreFeedback).toEqual(definition.rawScoreFeedback)
  expect(unit.participantFeedback).toEqual(participantFeedback)
  expect(unit.scoringDigest).toBe(canonicalHash(compiled.scoring))
  expect(unit.sourceDigest).toBe(canonicalHash({kind:'SCALE',definition:display}))
  expect(compiled.scoring.scores).toEqual(expect.arrayContaining([
   expect.objectContaining({key:'total',source:{type:'items',items:[{itemCode:'itemone',weight:1}],aggregation:'sum'}}),
  ]))
  expect(compiled.scoring.itemRules.map(rule=>rule.itemCode)).toEqual(['itemone'])
  for(const score of compiled.scoring.scores){
   expect(score.source.type).toBe('items')
   if(score.source.type==='items')expect(score.source.items.map(item=>item.itemCode)).toEqual(['itemone'])
  }
  expect(display.items.filter(item=>item.purpose)).toEqual(definition.items.filter(item=>item.purpose))
  expect(unit.contentSelection).toMatchObject({
   reportRelease:{releaseId:selected.releaseId,contentHash:selected.contentHash},
   referencePolicy:{choices:[{releaseId:reference.releaseId,contentHash:reference.contentHash,priority:1}]},
  })
  // Published content requires an explicit next revision. Editing that new
  // draft must not overwrite the already-frozen exact publication.
  const edited=structuredClone(definition)
  edited.rawScoreFeedback!.rules[0].ranges[0].text='仅供后续版本的新反馈'
  edited.items[1].attentionTarget='o3'
  edited.totalScore!.aggregation='mean'
  const publishedDraft=await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:instrument}})
  await expect(updateDraft(owner,project,instrument,{revision:publishedDraft.revision,title:'后续草稿版本',definition:edited})).rejects.toMatchObject({statusCode:409})
  const revised=await reviseDraft(owner,project,instrument,publishedDraft.revision)
  await updateDraft(owner,project,instrument,{revision:revised.revision,title:'后续草稿版本',definition:edited})
  const afterEdit=await db.surveyPublication.findUniqueOrThrow({where:{id:publication.id}})
  expect(afterEdit.compiledSnapshot).toEqual(publication.compiledSnapshot)
  expect(afterEdit.definitionDigest).toBe(publication.definitionDigest)
  expect(canonicalHash(afterEdit.compiledSnapshot)).toBe(afterEdit.definitionDigest)
  const frozenAfterEdit=await getWave(owner,project,w.id)
  expect(frozenAfterEdit.frozenContentSelections).toEqual(frozen.frozenContentSelections)
  expect(frozenAfterEdit.frozenParticipantFeedback).toEqual(frozen.frozenParticipantFeedback)
  const saved=await state();await getWave(owner,project,w.id)
  await expect(listSurveyContentOptions(owner,project,w.id,{instrumentId:instrument,layer:'REPORT'})).rejects.toThrow()
  expect(await state()).toEqual(saved)
 })
})
