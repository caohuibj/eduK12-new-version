import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,surveyMeasurementReleaseInput,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {createSurveyReinterpretation} from '../../modules/survey/reinterpretation.service'
import {prepareRelease} from '../../modules/measurement-content/release'
import {selectSurveyFixtureRecord,surveyFixtureSql} from '../survey/survey-source-select.fixture'
const mocks=vi.hoisted(()=>({authority:vi.fn(),get:vi.fn(),owner:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:mocks.owner}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
const uuid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const projectId=uuid(1),waveId=uuid(2),publicationId=uuid(3),attemptId=uuid(4),finalId=uuid(5),measurementId=uuid(6),reportId=uuid(7)
const instant='2026-10-17T00:00:00.000Z',cutOff='2026-10-17T00:20:00.000Z'
type Selection={select?:Record<string,unknown>;where?:Record<string,unknown>;take?:number;include?:unknown}
function matches(value:unknown,where:unknown):boolean{
  if(where===null||typeof where!=='object'||where instanceof Date)return value===where
  const record=value as Record<string,unknown>|null
  return Object.entries(where as Record<string,unknown>).every(([key,test])=>{
    if(key==='AND')return (Array.isArray(test)?test:[test]).every(condition=>matches(value,condition))
    if(key==='OR')return (test as unknown[]).some(condition=>matches(value,condition))
    if(key==='is')return matches(value,test)
    if(key==='not')return !matches(value,test)
    if(key==='in')return (test as unknown[]).includes(value)
    if(key==='lt')return value!==null&&(value as Date)<(test as Date)
    if(key==='gte')return value!==null&&(value as Date)>=(test as Date)
    if(key==='gt')return (value as string)>(test as string)
    return matches(record?.[key],test)
  })
}
function fixture(executed=false){
 const units=[
  compileFrozenResearchUnit({id:uuid(20),instrumentKey:'screen',kind:'FORM',title:'Screen',revision:1,definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[{itemKey:'age',prompt:'Synthetic gate',type:'NUMBER',required:true,options:[],rows:[]}]}]}}),
  compileFrozenResearchUnit({id:uuid(21),instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:1,definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'yes',label:'Yes',score:3},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'one',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}}),
 ]
 const measurement={...prepareRelease(surveyMeasurementReleaseInput(units[1],'owner',projectId)),releaseId:measurementId,status:'PUBLISHED' as const}
 if(measurement.layer!=='MEASUREMENT')throw new Error('measurement required')
 units[1].measurementRelease={releaseId:measurementId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash}
 const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],experiment:{experimentKey:'experiment',linkedPolicy:'KEEP_LINKED',groups:[{groupKey:'a',weight:1,materialTitle:'A',materialBody:'A'},{groupKey:'b',weight:1,materialTitle:'B',materialBody:'B'}]},blocks:[
  {blockKey:'screen_block',kind:'INSTRUMENT',instrumentKey:'screen'},
  {blockKey:'scale_block',kind:'INSTRUMENT',instrumentKey:'scale',when:{op:'GT',field:{source:'ANSWER',instrumentKey:'screen',itemKey:'age'},value:5}},
 ]},units,'LINKED_WAVES')
 const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units,flow}
 const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'experiment',groupKey:'a',algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:instant}
 const publication={id:publicationId,projectId,version:1,compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
 const binding={schemaVersion:1,projectId,waveId,attemptId,publicationId,definitionDigest:publication.definitionDigest,populationContext:{},units:[{instrumentKey:'scale',measurement:units[1].measurementRelease,references:[]}]}
 const bindingCipher=encryptUnifiedRuntimePayload(binding),bindingHash=canonicalHash(binding)
 const wave={id:waveId,projectId,ordinal:1,status:'OPEN',publicationId}
 const attempt={id:attemptId,projectId,waveId,status:'COMPLETED',startedAt:new Date(instant),excludedAt:null,participantId:'participant',sampleReview:null,
  flowAssignmentCipher:encryptUnifiedRuntimePayload(assignment),participant:{status:'ACTIVE',researchCode:'R-CHAIN'}}
 const result=computeSurveyFinal(snapshot,{screen:{age:executed?10:1},...(executed?{scale:{one:'yes'}}:{})},assignment,
  ['assigned_material','screen_block',...(executed?['scale_block']:[])])
 const final={id:finalId,projectId,waveId,publicationId,definitionDigest:publication.definitionDigest,completedAt:new Date('2026-10-17T00:10:00.000Z'),resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),attempt,wave}
 const report={...prepareRelease({layer:'REPORT',family:'SCALE',key:'report-chain',version:'1',scope:measurement.scope,assetRefs:[],sourceReleaseId:null,provenance:{},content:{projectionVersion:1,measurements:[{releaseId:measurementId,contentHash:measurement.contentHash}],metricKeys:['total'],audience:'researcher',language:'zh-CN',generatorVersion:'DECLARATIVE_REPORT_V1',template:{title:'Private report',blocks:[{type:'TEXT',text:'Unconditional private prose'},{type:'METRIC',metricKey:'total',display:'RAW'}],limitations:[]}}}),releaseId:reportId,status:'PUBLISHED'}
 let artifact:any
 const tx={
  $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[];values?:unknown[]})=>{
   const sql=surveyFixtureSql(parts)
   if(sql.includes('INSERT INTO survey_interpretation_artifacts')){
    const [id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash]=(parts as {values:unknown[]}).values
    artifact={id,final_id,created_by,request_hash,source_final_hash,artifact_cipher,artifact_hash,created_at:new Date()};return [artifact]
   }
   if(sql.includes('FROM survey_interpretation_artifacts'))return artifact?[artifact]:[]
   if(sql.includes('FROM "survey_projects"'))return [{collectionMode:'LINKED_WAVES',sourceRevision:5,sourceCutOff:new Date(cutOff)}]
   if(sql.includes('"finalCipherBytes"'))return [{finalCipherBytes:0n,frozenBytes:0n,bindingBytes:0n}]
   if(sql.includes('content_binding_cipher AS cipher'))return [{id:attemptId,cipher:bindingCipher,hash:bindingHash}]
   if(sql.includes('flow_assignment_cipher'))return [{bytes:0n}]
   throw new Error('Unexpected SQL '+sql)
  }),
  surveyProject:{findUnique:vi.fn(async()=>({revision:5}))},
  surveyWave:{count:vi.fn(async(args:Selection)=>matches(wave,args.where)?1:0),findMany:vi.fn(async(args:Selection)=>matches(wave,args.where)?[selectSurveyFixtureRecord(wave,args.select)]:[])},
  surveyWaveFinal:{count:vi.fn(async(args:Selection)=>matches(final,args.where)?1:0),findFirst:vi.fn(async(args:Selection)=>matches(final,args.where)?selectSurveyFixtureRecord(final,args.select):null),
   findMany:vi.fn(async(args:Selection)=>matches(final,args.where)?[selectSurveyFixtureRecord(final,args.select)]:[])},
  surveyPublication:{findMany:vi.fn(async(args:Selection)=>matches(publication,args.where)?[structuredClone(publication)]:[])},
  surveyWaveAttempt:{count:vi.fn(async(args:Selection)=>matches(attempt,args.where)?1:0),findMany:vi.fn(async(args:Selection)=>matches(attempt,args.where)?[selectSurveyFixtureRecord(attempt,args.select)]:[])},
 }
 vi.mocked(prisma.$transaction).mockImplementation((async(fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)) as never)
 mocks.get.mockImplementation(async(_tx,id)=>id===measurementId?measurement:id===reportId?report:null)
 return {result,final,tx,binding}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64));mocks.authority.mockResolvedValue({version:1});mocks.owner.mockResolvedValue({id:projectId})})
afterEach(()=>vi.unstubAllEnvs())
describe('real skipped Flow FINAL through reader and reinterpretation',()=>{
 it.each([false,true])('uses verified executed=%s despite source score placeholders',async executed=>{
  const f=fixture(executed),original=JSON.stringify(f.result)
  expect(f.result.units[1].notExecuted===true).toBe(!executed)
  const source=await loadSurveySource({actorUserId:'owner',projectId,waveIds:[waveId],finalId,maxFinals:1,selectRaw:false,includeInterpretation:true,includeAttendance:false})
  expect(source.scores).toHaveLength(1)
  expect(source.scores[0]).toMatchObject({value:executed?3:null,missingReason:executed?null:'NOT_SHOWN'})
  expect(source.interpretations?.[0].unitExecution).toContainEqual({instrumentKey:'scale',notExecuted:!executed})
  const artifact=await createSurveyReinterpretation('owner',{requestId:uuid(8),projectId,waveId,finalId,grantId:uuid(9),instrumentKey:'scale',reportReleaseId:reportId,references:[]})
  expect(artifact.artifact.interpretation.units[0].report.status).toBe(executed?'READY':'UNAVAILABLE')
  if(executed)expect(artifact.artifact.report?.blocks).toContainEqual(expect.objectContaining({type:'METRIC',value:3}))
  else expect(artifact.artifact.report).toBeNull()
  expect(JSON.stringify(f.result)).toBe(original)
  expect(mocks.authority).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({capability:'data.reinterpret',scope:expect.objectContaining({resourceKeys:[finalId]})}))
 })
})
