import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'
import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest'
beforeAll(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterAll(()=>vi.unstubAllEnvs())
import {rawLongExport,rawWideExport} from '../../modules/survey/analytics.raw-export'
import {exportLong,exportWide} from '../../modules/survey/analytics.export-format'
import {cognitiveTrialLongExport} from '../../modules/survey/analytics.cognitive-export'
import {describeWave,describeWaveGroups,describePairedScores} from '../../modules/survey/analytics.descriptive'
import {pairedDescriptive,summarizeWaveScores,type FrozenScoreObservation} from '../../modules/survey/analytics.cohorts'
import {variantAuditColumns,variantAuditValues,type SurveyVariantConfiguration} from '../../modules/survey/analytics.variant'
import type {SurveySourceProjection} from '../../modules/survey/analytics.source'
import type {CognitiveTrialObservation} from '../../modules/survey/analytics.cognitive'
vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
const config:SurveyVariantConfiguration={waveId:'wave',allocationConfigId:'flow-digest',experimentKey:'exp',
  mode:'QUESTIONNAIRE_VARIANTS',linkedPolicy:'RERANDOMIZE',groups:[
    {schemaVersion:1,variantKey:'a',variantLabel:'问卷 A',variantDigest:'a-digest',allocationConfigId:'flow-digest',weight:1,totalWeight:4,probability:0.25,instrumentKeys:['scale']},
    {schemaVersion:1,variantKey:'b',variantLabel:'问卷 B',variantDigest:'b-digest',allocationConfigId:'flow-digest',weight:3,totalWeight:4,probability:0.75,instrumentKeys:['scale']},
  ]}
const {instrumentKeys:_,...variant}=config.groups[0]
const audit={variant,assignmentAlgorithm:'CRYPTO_RANDOM_INT_V1' as const,assignmentDigest:'assignment-digest',assignedAt:'2026-10-17T00:00:00.000Z'}
const sourceMapping={type:'SCALE_TYPED_V1' as const,items:{i_0:'Native.Item.01'},options:{o_0:0,o_1:'001'}}
const measurement={instrumentKey:'scale',scoreKey:'Native.Total',scoringDigest:'score',responseSignature:'source',respondentType:'participant_self_report',unit:null,
  variantConfiguration:config,sourceProvenance:{definitionDigest:'original'},sourceAnswerMapping:sourceMapping}
const score:FrozenScoreObservation={...audit,projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'private-id',researchCode:'R-1',
  sourceFinalHash:'final-hash',sourceVerified:true,measurement,value:4,missingReason:null,completedAt:'2026-10-17T00:10:00.000Z'}
const fixture=():SurveySourceProjection=>({projectId:'project',collectionMode:'LINKED_WAVES',completeAttempts:1,sourceRevision:1,cutOff:'2026-10-17T00:20:00.000Z',
  variantConfigurations:[config],scores:[score],scoreColumns:[{projectId:'project',waveId:'wave',waveOrdinal:1,measurement}],attendance:[],
  raw:[{...audit,projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'private-id',researchCode:'R-1',sourceFinalHash:'final-hash',sourceVerified:true,
    instrumentKey:'scale',kind:'SCALE',responseType:'LIKERT',itemKey:'i_0',columnKey:'column',publicationVersion:1,value:'o_1',missingReason:null,
    completedAt:score.completedAt,flowDigest:'flow-digest',experimentGroup:'a',sourceItemKey:'Native.Item.01',sourceOptionValue:'001'}],
  codebook:[{columnKey:'column',waveId:'wave',waveOrdinal:1,instrumentKey:'scale',itemKey:'i_0',kind:'SCALE',responseType:'LIKERT',title:'Scale',prompt:'Question',
    options:[{code:'o_1',label:'One'}],definitionDigest:'source',scoringDigest:'score',publicationVersion:1,instrumentRevision:1,flowDigest:'flow-digest',variantConfiguration:config,
    sourceAnswerMapping:sourceMapping,sourceProvenance:{definitionDigest:'original'}}]})
const expectAudit=(csv:string)=>{
  for(const header of variantAuditColumns)expect(csv.split('\r\n')[0]).toContain(header)
  for(const value of variantAuditValues(audit))expect(csv).toContain('"'+value+'"')
  expect(csv).not.toContain('private-id')
}
describe('frozen questionnaire variant analytics and exports',()=>{
  it('preserves exact variant assignment and native typed answer mapping in raw long and wide',()=>{
    const source=fixture(),long=rawLongExport('project',source),wide=rawWideExport('project',source)
    expectAudit(long.csv);expectAudit(wide.csv)
    expect(long.csv).toContain('"Native.Item.01","001","string"')
    expect(wide.csv).toContain('"001","string"')
    expect(long.codebook[0].sourceAnswerMapping).toEqual(sourceMapping)
    expect(long.manifest.variantConfigurations?.[0].groups).toHaveLength(2)
  })
  it('exports assignment metadata with score long/wide and retains zero-FINAL arm config',()=>{
    const source=fixture()
    for(const format of [exportLong,exportWide]){
      const artifact=format('project',source.scores,[],source.scoreColumns)
      expectAudit(artifact.csv)
      expect(artifact.codebook[0].scoreKey).toBe('Native.Total')
      expect(artifact.codebook[0].sourceAnswerMapping).toEqual(sourceMapping)
      expect(artifact.manifest.variantConfigurations?.[0].groups[1].variantKey).toBe('b')
      const empty=format('project',[],[],source.scoreColumns)
      expect(empty.manifest.rowCount).toBe(0)
      expect(empty.codebook[0].variantConfiguration?.groups).toHaveLength(2)
    }
  })
  it('retains variant audit in cognitive trial export without inventing RT',()=>{
    const row:CognitiveTrialObservation={...score,publicationId:'publication',publicationVersion:1,instrumentKey:'cognitive',sourceResultHash:'child',epoch:1,
      measurementDigest:'measurement',configHash:'config',protocolSignature:'protocol',engineVersion:'engine',scoringVersion:'scorer',configVersion:'v1',timingPolicy:'software',
      randomSeed:'seed',randomizationVersion:'v1',restartCount:0,childCompletedAt:score.completedAt,phase:'test',trialIndex:0,condition:null,stimulusCode:'nogo',responded:false,
      response:null,rtMs:null,rtMissingReason:'NO_GO_WITHHELD',startedAtPerfMs:0,endedAtPerfMs:800,durationMs:800,timeout:true,premature:false,interrupted:false,qualityEvents:[],
      qualityStatus:'valid',qualityFlags:{},qualityReasons:[],administrationProvenance:{}}
    const output=cognitiveTrialLongExport('project',{...fixture(),cognitiveTrials:[row]},'wave')
    expectAudit(output.csv);expect(output.csv).toContain('NO_GO_WITHHELD')
    expect(output.manifest.variantConfigurations?.[0].groups).toHaveLength(2)
  })
  it('rejects pooled descriptive, item, group and paired analyses including zero-FINAL configs',()=>{
    for(const source of [fixture(),{...fixture(),scores:[],raw:[],completeAttempts:0}]){
      expect(()=>describeWave(source,'wave')).toThrow(/子版本/)
      expect(()=>describeWaveGroups(source,{waveId:'wave',groupInstrumentKey:'scale',groupItemKey:'i_0',scoreInstrumentKey:'scale',scoreKey:'Native.Total'})).toThrow(/子版本/)
      expect(()=>describePairedScores(source,{baselineWaveId:'wave',followupWaveId:'next',instrumentKey:'scale',scoreKey:'Native.Total'})).toThrow(/子版本/)
    }
    expect(()=>pairedDescriptive({projectId:'project',baselineWaveId:'wave',followupWaveId:'next',instrumentKey:'scale',scoreKey:'Native.Total',observations:[score]})).toThrow(/子版本/)
    expect(()=>summarizeWaveScores('project','wave',[score])).toThrow(/子版本/)
  })
  it('refuses conflicting assignments within one wide participant-wave row',()=>{
    const source=fixture(),conflicting={...score,assignmentDigest:'different',measurement:{...measurement,scoreKey:'another'}}
    expect(()=>exportWide('project',[score,conflicting],[],source.scoreColumns)).toThrow(/Conflicting variant/)
    source.raw.push({...source.raw[0],columnKey:'another',assignmentDigest:'different'})
    expect(()=>rawWideExport('project',source)).toThrow(/Conflicting variant/)
  })
})

import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
function persistedFixture(){
  const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'form',kind:'FORM',title:'Form',revision:1,
    definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[{itemKey:'question',prompt:'Question',type:'SINGLE',required:true,
      options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]}]}})
  const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:'form'}],
    experiment:{mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'experiment',linkedPolicy:'RERANDOMIZE',groups:[
      {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['form'],materialTitle:'',materialBody:''},
      {groupKey:'b',variantLabel:'B',weight:3,instrumentKeys:['form'],materialTitle:'',materialBody:''},
    ]}},[unit],'SINGLE_UNLINKED')
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',collectionMode:'SINGLE_UNLINKED',
    consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[unit],flow}
  const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'experiment',groupKey:'a',
    algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:'2026-10-17T00:00:00.000Z',variant:surveyVariantProvenance(flow,'a')}
  const result=computeSurveyFinal(snapshot,{form:{question:'yes'}},assignment,['form'])
  const publication={id:'publication',projectId:'project',version:1,compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:'wave',projectId:'project',ordinal:1,status:'OPEN',revision:1,publicationId:'publication'}
  const final={id:'final',publicationId:'publication',definitionDigest:publication.definitionDigest,completedAt:new Date('2026-10-17T00:10:00.000Z'),
    resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),wave,
    attempt:{id:'attempt',projectId:'project',waveId:'wave',startedAt:new Date(assignment.assignedAt),flowAssignmentCipher:encryptUnifiedRuntimePayload(assignment),participant:null}}
  const state={hasFinal:true}
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[]})=>{
      const query=surveyFixtureSql(parts)
      return query.includes('FROM "survey_projects"')?[{collectionMode:'SINGLE_UNLINKED',sourceRevision:1,sourceCutOff:new Date('2026-10-17T00:20:00.000Z')}]:query.includes('finalCipherBytes')?[{finalCipherBytes:0n,frozenBytes:0n}]:[{bytes:0n}]
    }),
    surveyWave:{count:vi.fn(async()=>1),findMany:vi.fn(async()=>[wave])},
    surveyWaveFinal:{count:vi.fn(async()=>state.hasFinal?1:0),findMany:vi.fn(async(args:{select?:unknown})=>!state.hasFinal?[]:
      [selectSurveyFixtureRecord(final,args.select)])},
    surveyPublication:{findMany:vi.fn(async()=>[publication])},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(t:typeof tx)=>unknown)=>fn(tx)) as never)
  return {state,result,assignment,final,refresh:()=>{final.resultsHash=canonicalHash(result);final.resultsCipher=encryptUnifiedRuntimePayload(result)}}
}
const load=()=>loadSurveySource({actorUserId:'owner',projectId:'project',waveIds:['wave'],includeWideSchema:true,includeAttendance:false})
describe('variant provenance verified from persisted encrypted FINAL and assignment',()=>{
  it('projects the same durable assignment and frozen zero-FINAL arms',async()=>{
    const f=persistedFixture(),source=await load()
    expect(source.raw[0].variant).toEqual(f.assignment.variant)
    expect(source.raw[0].assignmentDigest).toBe(canonicalHash(f.assignment))
    expect(source.raw[0].assignedAt).toBe(f.assignment.assignedAt)
    expect(source.codebook[0].variantConfiguration?.groups).toHaveLength(2)
    f.state.hasFinal=false
    const empty=await load()
    expect(empty.raw).toHaveLength(0)
    expect(empty.variantConfigurations?.[0].groups.map(g=>g.variantKey)).toEqual(['a','b'])
  })
  it.each(['variant','algorithm','assignedAt'] as const)('rejects rewritten trace %s even when the FINAL hash is recomputed',async field=>{
    const f=persistedFixture()
    if(field==='variant')f.result.executionTrace!.variant!.variantDigest='forged'
    else if(field==='algorithm')f.result.executionTrace!.algorithm='LINKED_INHERIT_V1'
    else f.result.executionTrace!.assignedAt='2026-10-16T00:00:00.000Z'
    f.refresh()
    await expect(load()).rejects.toThrow(/子版本/)
  })
})
