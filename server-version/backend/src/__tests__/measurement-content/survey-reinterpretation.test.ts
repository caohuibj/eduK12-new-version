import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({source:vi.fn(),auth:vi.fn(),authority:vi.fn(),get:vi.fn(),transaction:vi.fn(),project:vi.fn(),final:vi.fn(),query:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:mocks.source}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:mocks.auth}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:(x:unknown)=>JSON.stringify(x),decryptUnifiedRuntimePayload:(x:string)=>JSON.parse(x)}))
import {createSurveyReinterpretation,readSurveyReinterpretation} from '../../modules/survey/reinterpretation.service'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const ids={project:'00000000-0000-4000-8000-000000000001',wave:'00000000-0000-4000-8000-000000000002',final:'00000000-0000-4000-8000-000000000003',request:'00000000-0000-4000-8000-000000000004',grant:'00000000-0000-4000-8000-000000000005',reference:'00000000-0000-4000-8000-000000000006',report:'00000000-0000-4000-8000-000000000007'}
const hash='a'.repeat(64),scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:ids.project}
const entry={scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{description:'local'},source:{citation:'synthetic'},statistics:{mean:2},limitations:[]}
const measurement=()=>({releaseId:'m',contentHash:hash,status:'PUBLISHED',scope,layer:'MEASUREMENT',family:'SCALE',content:{instrumentVersion:'1',scoringVersion:'1',measurementHash:hash,metrics:[{metricKey:'total',unit:'points'}]}})
const reference=()=>({releaseId:ids.reference,contentHash:hash,status:'PUBLISHED',scope,layer:'REFERENCE',family:'SCALE',version:'2',content:{measurement:{releaseId:'m',contentHash:hash},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const report=()=>({releaseId:ids.report,contentHash:hash,status:'PUBLISHED',scope,layer:'REPORT',family:'SCALE',content:{generatorVersion:'DECLARATIVE_REPORT_V1',measurements:[{releaseId:'m',contentHash:hash}],metricKeys:['total'],template:{schemaVersion:1,title:'New wording',blocks:[{type:'METRIC',metricKey:'total',display:'RAW'}],limitations:[]}}})
const binding=()=>({schemaVersion:1,projectId:ids.project,waveId:ids.wave,attemptId:'attempt',publicationId:'pub',definitionDigest:hash,populationContext:{},units:[{instrumentKey:'scale',measurement:{releaseId:'m',contentHash:hash,measurementHash:hash},references:[]}]})
const source=()=>({projectId:ids.project,sourceRevision:5,completeAttempts:1,sourceVersions:[{waveId:ids.wave,instrumentKey:'scale',scoringDigest:'scoring',measurementRelease:binding().units[0].measurement}],interpretations:[{attemptId:'attempt',sourceFinalHash:hash,binding:binding(),interpretation:null}],scores:[{projectId:ids.project,waveId:ids.wave,attemptId:'attempt',sourceFinalHash:hash,sourceVerified:true,measurement:{instrumentKey:'scale',scoreKey:'total',scoringDigest:'scoring'},value:5,status:'calculated',missingReason:null,quality:{status:'interpretable'}}]})
const input=()=>({requestId:ids.request,projectId:ids.project,waveId:ids.wave,finalId:ids.final,grantId:ids.grant,instrumentKey:'scale',reportReleaseId:ids.report,references:[{releaseId:ids.reference,entryKey:referenceEntryKey(entry as never),priority:0}]})
let stored:any
beforeEach(()=>{
 vi.clearAllMocks();stored=undefined;mocks.source.mockResolvedValue(source());mocks.auth.mockResolvedValue({id:ids.project});mocks.authority.mockResolvedValue({grantId:ids.grant,version:1});mocks.project.mockResolvedValue({revision:5});mocks.final.mockResolvedValue({resultsHash:hash})
 mocks.transaction.mockImplementation(async fn=>fn({surveyProject:{findUnique:mocks.project},surveyWaveFinal:{findFirst:mocks.final},$queryRaw:mocks.query}))
 mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():id===ids.reference?reference():report())
 mocks.query.mockImplementation(async query=>{
  if(query.strings.join('').includes('INSERT INTO survey_interpretation_artifacts')){
   const [id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash]=query.values
   stored={id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash,created_at:new Date()};return [stored]
  }return stored?[stored]:[]
 })
})
describe('explicit reinterpretation uses actual scoped saved FINAL facts',()=>{
 it('requires exact data capability, preserves old FINAL, and stores an independent immutable artifact',async()=>{
  const old=source(),before=JSON.stringify(old);mocks.source.mockResolvedValue(old)
  const result=await createSurveyReinterpretation('owner',input())
  expect(result.artifact.interpretation.units[0].references[0]).toMatchObject({status:'AVAILABLE',values:{meanDifference:3}})
  expect(result.artifact.report?.blocks).toContainEqual(expect.objectContaining({type:'METRIC',value:5}))
  expect(result.artifactId).toBe(ids.request);expect(JSON.stringify(old)).toBe(before)
  expect(mocks.authority).toHaveBeenCalledTimes(2);expect(mocks.authority).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({capability:'data.reinterpret',scope:expect.objectContaining({resourceKind:'data',scopeId:ids.project,resourceKeys:[ids.final]})}))
  expect(mocks.get).toHaveBeenCalledTimes(3)
  expect(mocks.source).toHaveBeenCalledWith(expect.objectContaining({finalId:ids.final,maxFinals:1,selectRaw:false}))
 })
 it('denies capability before loading samples and rechecks it after source work',async()=>{
  mocks.authority.mockRejectedValueOnce(new Error('denied'));await expect(createSurveyReinterpretation('owner',input())).rejects.toThrow('denied');expect(mocks.source).not.toHaveBeenCalled()
  mocks.authority.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('revoked'));await expect(createSurveyReinterpretation('owner',input())).rejects.toThrow('revoked');expect(mocks.query).not.toHaveBeenCalled()
 })
 it('returns the same artifact on retry without lifecycle reselection or template regeneration',async()=>{
  const first=await createSurveyReinterpretation('owner',input());mocks.get.mockRejectedValue(new Error('should not read release again'))
  expect(await createSurveyReinterpretation('owner',input())).toEqual(first)
  await expect(createSurveyReinterpretation('owner',{...input(),references:[]})).rejects.toMatchObject({statusCode:409})
 })
 it('reads a historical artifact under current data access without reinterpreting revoked releases',async()=>{
  const first=await createSurveyReinterpretation('owner',input());mocks.get.mockClear();mocks.get.mockRejectedValue(new Error('no selector'))
  expect(await readSurveyReinterpretation('owner',{projectId:ids.project,waveId:ids.wave,finalId:ids.final,artifactId:ids.request})).toEqual(first)
  expect(mocks.get).not.toHaveBeenCalled();mocks.final.mockResolvedValue(null)
  await expect(readSurveyReinterpretation('owner',{projectId:ids.project,waveId:ids.wave,finalId:ids.final,artifactId:ids.request})).rejects.toMatchObject({statusCode:409})
 })
 it('rejects source revision, excluded FINAL and a foreign actual measurement identity',async()=>{
  mocks.project.mockResolvedValue({revision:6});await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409})
  mocks.project.mockResolvedValue({revision:5});mocks.final.mockResolvedValue(null);await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409})
  const s=source();s.sourceVersions[0].measurementRelease={...s.sourceVersions[0].measurementRelease,releaseId:'foreign'};mocks.source.mockResolvedValue(s)
  await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409});expect(stored).toBeUndefined()
 })
 it('rejects a wrong project, revoked measurement and incompatible selected report',async()=>{
  for(const m of [{...measurement(),scope:{...scope,resourceId:'foreign'}},{...measurement(),status:'REVOKED'}]){
   mocks.get.mockImplementation(async(_tx,id)=>id==='m'?m:reference());await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409})}
  mocks.get.mockImplementation(async(_tx,id)=>id==='m'?measurement():id===ids.reference?reference():{...report(),content:{...report().content,measurements:[{releaseId:'wrong',contentHash:hash}]}})
  await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409});expect(stored).toBeUndefined()
 })
 it('keeps quality unavailable and does not promote missing facts into a valid interpretation',async()=>{
  const s=source();s.scores[0].quality.status='invalid';mocks.source.mockResolvedValue(s)
  const result=await createSurveyReinterpretation('owner',input())
  expect(result.artifact.interpretation.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'QUALITY_UNAVAILABLE'})
  expect(result.artifact.report?.blocks).toContainEqual(expect.objectContaining({value:null,status:'INVALID'}))
 })
 it('rejects body-provided scores, population, actor and duplicate reference choices',async()=>{
  for(const extra of [{scores:[5]},{populationContext:{age:12}},{actorId:'owner'}])await expect(createSurveyReinterpretation('owner',{...input(),...extra})).rejects.toThrow()
  await expect(createSurveyReinterpretation('owner',{...input(),references:[...input().references,...input().references]})).rejects.toMatchObject({statusCode:409})
 })
 it('rejects digest mismatch and foreign facts instead of assigning a new release identity',async()=>{
  for(const delta of [{sourceFinalHash:'b'.repeat(64)},{projectId:'foreign'},{measurement:{...source().scores[0].measurement,scoringDigest:'wrong'}}]){
   const s=source();Object.assign(s.scores[0],delta);mocks.source.mockResolvedValue(s)
   await expect(createSurveyReinterpretation('owner',input())).rejects.toMatchObject({statusCode:409})}
 })
})
