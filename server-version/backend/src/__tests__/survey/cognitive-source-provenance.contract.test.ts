import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'
import type {Request} from 'express'
import {prisma} from '../../config/database'
import {verifyToken} from '../../utils/jwt'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {adaptCatalogCognitive} from '../../modules/survey/catalog.sources'
import {compileCatalogUnit} from '../../modules/survey/catalog.service'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {SURVEY_GONOGO_CONFIG,parseFrozenSurveyCognitive} from '../../modules/survey/cognitive.definition'
import {compileSurveyFlow,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {verifySurveyFinalPublication,type FrozenUnitResult} from '../../modules/survey/final.compute'
import {cognitiveMeasurementColumns} from '../../modules/survey/analytics.cognitive'
import {loadSurveySource,type SurveySourceProjection} from '../../modules/survey/analytics.source'
import {exportLong,exportWide,type ResearchExportCodebookRow} from '../../modules/survey/analytics.export-format'
import {createSurveyExport,downloadSurveyExport} from '../../modules/survey/analytics.export.service'
import * as cognitiveRegistry from '../../modules/cognitive/v2/registry'

// Keep the actual catalog adapter, frozen FINAL/child decoding, source fences,
// score projection, serializers, export ticket encryption and download intact.
vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
vi.mock('../../utils/authCookies',()=>({getSurveySessionToken:vi.fn(()=> 'synthetic-survey-session')}))
vi.mock('../../utils/jwt',()=>({verifyToken:vi.fn()}))

const projectId='11111111-1111-4111-8111-111111111111'
const waveId='22222222-2222-4222-8222-222222222222'
const publicationId='33333333-3333-4333-8333-333333333333'
const instant='2026-10-17T00:00:00.000Z'
const req={user:{userId:'owner',tokenVersion:7}} as Request
const cohortCases=[
  {name:'zero FINAL',shown:[] as boolean[]},
  {name:'one completed imported cognitive FINAL',shown:[true]},
  {name:'one NOT_SHOWN cognitive FINAL',shown:[false]},
  {name:'completed then NOT_SHOWN in research-code sort order',shown:[true,false]},
  {name:'NOT_SHOWN then completed in research-code sort order',shown:[false,true]},
]

function fixture(shown:boolean[]){
  const catalog=adaptCatalogCognitive({kind:'COGNITIVE',sourceId:'synthetic-native-gonogo',sourceVersion:'1.1.0'},
    {name:'Imported Go/No-Go',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',
      config:SURVEY_GONOGO_CONFIG,status:'PUBLISHED',accessPolicy:'OPEN'})
  const unit=compileCatalogUnit({id:'cognitive-draft',instrumentKey:'tool',kind:'COGNITIVE',title:catalog.title,
    revision:3,definition:catalog.displayDefinition},catalog)
  const form=compileFrozenResearchUnit({id:'form-draft',instrumentKey:'form',kind:'FORM',title:'Common form',revision:1,
    definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[{itemKey:'question',prompt:'Question',
      type:'SINGLE',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]}]}})
  const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:[
    {blockKey:'form',kind:'INSTRUMENT',instrumentKey:'form'},
    {blockKey:'tool',kind:'INSTRUMENT',instrumentKey:'tool'},
  ],experiment:{mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'cognitive-source-study',linkedPolicy:'RERANDOMIZE',groups:[
    {groupKey:'shown',variantLabel:'With task',weight:1,instrumentKeys:['form','tool'],materialTitle:'',materialBody:''},
    {groupKey:'hidden',variantLabel:'Without task',weight:3,instrumentKeys:['form'],materialTitle:'',materialBody:''},
  ]}},[form,unit],'LINKED_WAVES')
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,
    collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'synthetic-consent',
    runtimeStatus:'SURVEY_FINAL_V1',units:[form,unit],flow}
  const definitionDigest=canonicalHash(snapshot)
  const publication={id:publicationId,projectId,version:2,compiledSnapshot:snapshot,definitionDigest}
  const wave={id:waveId,projectId,ordinal:1,status:'OPEN',revision:1,publicationId}
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),session=frozen.sessionSnapshot
  const columns=cognitiveMeasurementColumns(unit)
  const metricValues:Record<string,number>={commissionRate:0.125,dPrime:1.75,goMedianRtMs:351.25,hitRate:0.875,
    omissionRate:0.125,commissionErrors:3,goTrialCount:90,nogoTrialCount:30}
  const records=shown.map((isShown,index)=>{
    const suffix=String(index+1).padStart(12,'0')
    const attemptId='55555555-5555-4555-8555-'+suffix,resultId='66666666-6666-4666-8666-'+suffix
    const stored={schemaVersion:1,sessionId:'synthetic-session-'+index,projectId,waveId,attemptId,publicationId,
      slotKey:'tool',epoch:1,measurementDigest:frozen.measurementDigest,configHash:session.configHash,
      protocolSignature:session.protocolSignature,testType:session.testType,configVersion:session.configVersion,
      engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,timingPolicy:frozen.timingPolicy,
      metrics:metricValues,quality:{state:'limited',flags:{interrupted:true},reasons:['Synthetic interruption']},
      audit:{trialCount:120},administrationProvenance:{device:'desktop',input:'keyboard'},restartCount:0,
      rawHash:'a'.repeat(64)}
    const reference={slotKey:'tool',epoch:1,resultId,resultHash:canonicalHash(stored),measurementDigest:frozen.measurementDigest}
    const cognitive:FrozenUnitResult={instrumentKey:'tool',kind:'COGNITIVE',sourceDigest:unit.sourceDigest,
      scoringDigest:unit.scoringDigest,rawAnswers:{},missing:[],childReference:reference,
      privateScoring:{metrics:columns.map(metric=>({key:metric.scoreKey,value:metricValues[metric.scoreKey],unit:metric.unit,status:'OK'}))}}
    const groupKey=isShown?'shown':'hidden'
    const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'cognitive-source-study',
      groupKey,algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:instant,variant:surveyVariantProvenance(flow,groupKey)}
    const result=verifySurveyFinalPublication(snapshot,definitionDigest)!.compute(
      {form:{question:'yes'},...(isShown?{tool:{}}:{})},assignment,isShown?['form','tool']:['form'],'FINAL',undefined,
      isShown?new Map([['tool',cognitive]]):new Map())
    const child={id:resultId,sessionId:stored.sessionId,projectId,waveId,attemptId,publicationId,slotKey:'tool',epoch:1,
      measurementDigest:reference.measurementDigest,resultHash:reference.resultHash,resultCipher:encryptUnifiedRuntimePayload(stored),
      rawHash:stored.rawHash,completedAt:new Date(instant),trialCount:120}
    const final={id:'44444444-4444-4444-8444-'+suffix,publicationId,definitionDigest,completedAt:new Date(instant),
      resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),wave,
      attempt:{id:attemptId,projectId,waveId,startedAt:new Date(instant),flowAssignmentCipher:encryptUnifiedRuntimePayload(assignment),
        participant:{researchCode:'R-'+suffix,status:'ACTIVE'}}}
    return {isShown,result,child,final}
  })
  const tickets:Record<string,unknown>[]=[]
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[];values:unknown[]})=>{
      const query=surveyFixtureSql(parts)
      if(query.includes('FROM "survey_projects"'))return [{id:projectId,revision:1,collectionMode:'LINKED_WAVES',
        sourceRevision:1,sourceCutOff:new Date('2026-10-17T00:01:00.000Z')}]
      if(query.includes('FROM survey_cognitive_results'))return records.filter(r=>r.isShown).map(({child})=>({
        id:child.id,projectId,waveId,attemptId:child.attemptId,publicationId,bytes:Buffer.byteLength(child.resultCipher)}))
      return query.includes('finalCipherBytes')?[{finalCipherBytes:0n,frozenBytes:0n}]:[{bytes:0n}]
    }),
    surveyWave:{count:vi.fn(async()=>1),findMany:vi.fn(async()=>[wave])},
    surveyWaveFinal:{count:vi.fn(async()=>records.length),findMany:vi.fn(async(args:{select?:unknown})=>
      (args.select&&!(args.select as Record<string,unknown>).resultsCipher?records:[...records].reverse())
        .map(({final})=>selectSurveyFixtureRecord(final,args.select)))},
    surveyPublication:{findMany:vi.fn(async()=>[publication])},
    surveyWaveAttempt:{findMany:vi.fn(async()=>[]),count:vi.fn(async()=>0)},
    surveyCognitiveResult:{findMany:vi.fn(async()=>records.filter(r=>r.isShown).map(r=>r.child).reverse())},
    surveyExportTicket:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>{tickets.push(data);return data}),
      findFirst:vi.fn(async({where}:{where:{id:string}})=>tickets.find(t=>t.id===where.id)??null)},
    surveyEvent:{create:vi.fn(async()=>({}))},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(value:typeof tx)=>unknown)=>fn(tx)) as never)
  return {unit,columns,metricValues,records,tx,tickets}
}

beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
  vi.stubEnv('ASSET_SIGNING_SECRET','cognitive-provenance-synthetic-secret-32-characters')
  vi.mocked(verifyToken).mockReturnValue({userId:'owner',tokenVersion:7,accountDomain:'SURVEY',
    mfaVerifiedAt:Math.floor(Date.now()/1000)} as never)
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('Imported cognitive source provenance survives real FINAL projection and score exports',()=>{
  it.each(cohortCases)('$name retains frozen provenance and unchanged stored metrics without rescoring',async({shown})=>{
    const f=fixture(shown),before=JSON.stringify(f.records)
    const registry=vi.spyOn(cognitiveRegistry,'getCognitiveV2TaskDefinition').mockImplementation(()=>{throw new Error('rescore forbidden')})
    const source=await loadSurveySource({actorUserId:'owner',projectId,waveIds:[waveId],includeWideSchema:true,
      includeAttendance:false,selectRaw:false})
    expect(source.completeAttempts).toBe(shown.length)
    expect(source.scores).toHaveLength(f.columns.length*shown.length)
    expect(source.scoreColumns).toHaveLength(f.columns.length)
    for(const column of source.scoreColumns)expect(column.measurement.sourceProvenance).toEqual(f.unit.sourceProvenance)
    for(const row of source.scores){
      const record=f.records.find(r=>r.final.attempt.id===row.attemptId)!
      expect.soft(row.measurement.sourceProvenance).toEqual(f.unit.sourceProvenance)
      expect(row.measurement.provenance).toEqual(f.columns.find(c=>c.scoreKey===row.measurement.scoreKey)!.provenance)
      expect(row.sourceFinalHash).toBe(record.final.resultsHash)
      if(record.isShown){
        expect(row).toMatchObject({value:f.metricValues[row.measurement.scoreKey],missingReason:null,status:'OK',
          sourceResultHash:record.child.resultHash,epoch:1,completionStatus:'COMPLETE',
          quality:{status:'limited',flags:{interrupted:true},reasons:['Synthetic interruption']}})
      }else{
        expect(row).toMatchObject({value:null,missingReason:'NOT_SHOWN',completionStatus:'COMPLETE'})
        expect(row.sourceResultHash).toBeUndefined()
      }
    }
    // Catalog metadata is descriptive: enrichment must not alter CSV values,
    // scientific measurement identity, column IDs or source/data digests.
    const stripMetadata=(measurement:SurveySourceProjection['scores'][number]['measurement'])=>{
      const {sourceProvenance:_source,sourceAnswerMapping:_mapping,...identity}=measurement
      return identity
    }
    for(const serialize of [exportLong,exportWide]){
      const actual=serialize(projectId,source.scores,[],source.scoreColumns)
      const without=serialize(projectId,source.scores.map(row=>({...row,measurement:stripMetadata(row.measurement)})),[],
        source.scoreColumns.map(column=>({...column,measurement:stripMetadata(column.measurement)})))
      expect(actual.csv).toBe(without.csv)
      expect(actual.manifest.dataHash).toBe(without.manifest.dataHash)
      expect(actual.manifest.projectSourceHash).toBe(without.manifest.projectSourceHash)
      expect(actual.codebook.map(c=>c.column)).toEqual(without.codebook.map(c=>c.column))
    }
    expect(JSON.stringify(f.records)).toBe(before)
    expect(registry).not.toHaveBeenCalled()
    const childReads=f.tx.surveyCognitiveResult.findMany.mock.calls as unknown as Array<[{select:Record<string,unknown>}]>
    expect(childReads).toHaveLength(shown.includes(true)?1:0)
    for(const [args] of childReads){expect(args.select).not.toHaveProperty('rawCipher');expect(args.select).not.toHaveProperty('session')}
  })

  describe.each(['SCORE_LONG','SCORE_WIDE'] as const)('%s codebook and ticket manifest agree',format=>{
    it.each(cohortCases)('$name',async({shown})=>{
      const f=fixture(shown),before=JSON.stringify(f.records)
      const registry=vi.spyOn(cognitiveRegistry,'getCognitiveV2TaskDefinition').mockImplementation(()=>{throw new Error('rescore forbidden')})
      const created=await createSurveyExport(req,{projectId,format})
      const artifact=await downloadSurveyExport(req,{projectId,exportId:created.id})
      const codebook=artifact.codebook as ResearchExportCodebookRow[]
      const manifest=artifact.manifest as {selectedVersions:Array<{instrumentKey:string;sourceProvenance:unknown}>;
        measurementVersions:Array<{instrumentKey:string;measurementDigest:string;configHash:string}>}
      const selected=manifest.selectedVersions.find(v=>v.instrumentKey==='tool')!
      expect(selected.sourceProvenance).toEqual(f.unit.sourceProvenance)
      expect(codebook).toHaveLength(f.columns.length)
      for(const column of codebook){
        expect.soft(column.sourceProvenance).toEqual(selected.sourceProvenance)
        expect(column.provenance).toEqual(f.columns.find(c=>c.scoreKey===column.scoreKey)!.provenance)
        expect(column.variantConfiguration?.groups.map(g=>g.variantKey)).toEqual(['shown','hidden'])
        // Cognitive imports currently have no typed answer mapping; never invent one.
        expect(column.sourceAnswerMapping).toBeUndefined()
      }
      expect(manifest.measurementVersions).toHaveLength(1)
      expect(manifest.measurementVersions[0]).toMatchObject({instrumentKey:'tool',
        measurementDigest:codebook[0].provenance!.measurementDigest,configHash:codebook[0].provenance!.configHash})
      expect(artifact.manifest).toEqual(created.manifest)
      expect(JSON.stringify(f.records)).toBe(before)
      expect(registry).not.toHaveBeenCalled()
      expect(f.tickets).toHaveLength(1)
    })
  })
})
