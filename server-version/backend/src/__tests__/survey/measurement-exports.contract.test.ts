import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {computeSurveyFinal,type SurveyComputedFinal,type FrozenUnitResult} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {rawLongExport} from '../../modules/survey/analytics.raw-export'
import {exportLong} from '../../modules/survey/analytics.export-format'
import {cognitiveMeasurementColumns,cognitiveTrialRows,pageCognitiveTrialRows,prepareCognitiveProjection,
  COGNITIVE_TRIAL_PAGE_ROWS,COGNITIVE_TRIAL_PAGE_BYTES,type CognitiveExportChild} from '../../modules/survey/analytics.cognitive'
import {cognitiveTrialLongExport} from '../../modules/survey/analytics.cognitive-export'
import {decodeSurveyExportCursor,encodeSurveyExportCursor,type SurveyExportCursor} from '../../modules/survey/analytics.export-cursor'
import {pairedDescriptive} from '../../modules/survey/analytics.cohorts'
import {initialCognitiveDefinition,parseFrozenSurveyCognitive} from '../../modules/survey/cognitive.definition'
import type {SjtDraftV2} from '../../modules/survey/builder.definition'
import * as sjtKernel from '../../modules/situational/situation-model-resolver'
import * as cognitiveRegistry from '../../modules/cognitive/v2/registry'
import * as cognitiveDefinition from '../../modules/survey/cognitive.definition'
import * as exportFormat from '../../modules/survey/analytics.export-format'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
const projectId='11111111-1111-4111-8111-111111111111',waveId='22222222-2222-4222-8222-222222222222'
const publicationId='33333333-3333-4333-8333-333333333333',finalId='44444444-4444-4444-8444-444444444444'
const attemptId='55555555-5555-4555-8555-555555555555',resultId='66666666-6666-4666-8666-666666666666'
const instant='2026-10-17T00:00:00.000Z'
const owner={actorUserId:'owner',projectId,waveIds:[waveId],includeAttendance:false}
const sjtDraft=():SjtDraftV2=>({schemaVersion:2,respondentType:'participant_self_report',title:'Grouped SJT',author:'Researcher',
  sourceNote:'Original study',licenseStatus:'self_authored',redistribution:'allowed',orderPolicy:'FIXED',
  scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},metrics:[{metricKey:'total',label:'Total',direction:'descriptive'}],
  scenes:[{sceneKey:'mother',title:'Shared mother scene',stimulus:'Read the shared scenario',questions:[
    {questionKey:'multi',prompt:'Choose actions',responseType:'MULTIPLE',required:true,allowRefusal:false,
      aggregationPolicy:'SUM',minSelections:1,maxSelections:2,options:[
        {optionKey:'a',label:'A',contributions:{total:1}},{optionKey:'b',label:'B',contributions:{total:2}}]},
    {questionKey:'single',prompt:'Choose one',responseType:'SINGLE',required:true,allowRefusal:true,options:[
      {optionKey:'a',label:'A',contributions:{total:1}},{optionKey:'b',label:'B',contributions:{total:2}},
      {optionKey:'unknown',label:'Unable to judge',contributions:{},nonanswerReason:'UNABLE_TO_JUDGE'}]},
  ]}]})
function fixture(kind:'SJT'|'COGNITIVE'='COGNITIVE',answers:Record<string,unknown>={multi:['b','a'],single:'b'}){
  const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'tool',kind,title:'Tool',revision:1,
    definition:kind==='SJT'?sjtDraft():initialCognitiveDefinition()})
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,
    collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',
    runtimeStatus:'SURVEY_FINAL_V1',units:[unit]}
  let child:CognitiveExportChild|undefined
  let result:SurveyComputedFinal
  if(kind==='SJT')result=computeSurveyFinal(snapshot,{tool:answers})
  else{
    const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),session=frozen.sessionSnapshot
    const stored={schemaVersion:1 as const,sessionId:'session',projectId,waveId,attemptId,publicationId,
      slotKey:'tool',epoch:1,measurementDigest:frozen.measurementDigest,configHash:session.configHash,
      protocolSignature:session.protocolSignature,testType:session.testType,configVersion:session.configVersion,
      engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,timingPolicy:frozen.timingPolicy,
      metrics:{commissionRate:0,dPrime:2,goMedianRtMs:350,hitRate:1,omissionRate:0,
        commissionErrors:0,goTrialCount:90,nogoTrialCount:30},
      quality:{state:'limited',flags:{interrupted:true},reasons:['Window lost focus']},audit:{trialCount:120},
      administrationProvenance:{device:'desktop',input:'keyboard'},restartCount:0,rawHash:''}
    const trials=Array.from({length:120},(_,trialIndex)=>({schemaVersion:1 as const,trialIndex,phase:'test' as const,
      startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+800,durationMs:800,
      flags:{timeout:trialIndex%4===0,premature:false},qualityEvents:[],
      payload:{trialType:trialIndex%4===0?'nogo' as const:'go' as const,responded:trialIndex%4!==0,
        rtMs:trialIndex%4===0?null:350,interrupted:false}}))
    const raw={schemaVersion:1 as const,attemptEpoch:1,trials}
    stored.rawHash=canonicalHash(raw)
    const reference={slotKey:'tool',epoch:1,resultId,resultHash:canonicalHash(stored),measurementDigest:frozen.measurementDigest}
    child={reference,sessionId:'session',completedAt:instant,result:stored,raw,randomSeed:'frozen-research-seed'}
    const metrics=cognitiveMeasurementColumns(unit).map(metric=>({key:metric.scoreKey,
      value:stored.metrics[metric.scoreKey as keyof typeof stored.metrics],unit:metric.unit,status:'OK'}))
    const parent:FrozenUnitResult={instrumentKey:'tool',kind:'COGNITIVE',sourceDigest:unit.sourceDigest,
      scoringDigest:unit.scoringDigest,rawAnswers:{},missing:[],privateScoring:{metrics},childReference:reference}
    result={schemaVersion:1,definitionDigest:canonicalHash(snapshot),units:[parent]}
  }
  const publication={id:publicationId,projectId,version:1,compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:waveId,projectId,ordinal:1,status:'OPEN',revision:1,publicationId}
  const final={id:finalId,publicationId,definitionDigest:publication.definitionDigest,completedAt:new Date(instant),
    resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),wave,
    attempt:{id:attemptId,projectId,waveId,startedAt:new Date(instant),flowAssignmentCipher:null,participant:null}}
  const state={hasFinal:true,sourceRevision:1,allow:true,sourceReads:0,changeOnSecond:false,rawTamper:false,malformedRaw:false}
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[];values:unknown[]})=>{
      const query=('strings' in parts?parts.strings:parts).join('')
      if(query.includes('FROM "survey_projects"')){
        state.sourceReads++;if(state.changeOnSecond&&state.sourceReads===2)state.sourceRevision++
        return state.allow?[{collectionMode:'SINGLE_UNLINKED',sourceRevision:state.sourceRevision,sourceCutOff:new Date('2026-10-17T00:01:00Z')}]:[]
      }
      if(query.includes('FROM survey_cognitive_results'))return [{id:resultId,projectId,waveId,attemptId,publicationId,bytes:20000}]
      return [{bytes:0n}]
    }),
    surveyWave:{count:vi.fn(async()=>1),findMany:vi.fn(async()=>[wave])},
    surveyWaveFinal:{count:vi.fn(async()=>state.hasFinal?1:0),findMany:vi.fn(async(args:{select?:unknown})=>!state.hasFinal?[]:
      args.select?[{id:finalId,publicationId,completedAt:final.completedAt}]:[final])},
    surveyPublication:{findMany:vi.fn(async()=>[publication])},
    surveyCognitiveResult:{findMany:vi.fn(async()=>child?[{id:resultId,sessionId:child.sessionId,projectId,waveId,attemptId,publicationId,
      slotKey:'tool',epoch:1,measurementDigest:child.reference.measurementDigest,resultHash:child.reference.resultHash,
      resultCipher:encryptUnifiedRuntimePayload(child.result),rawHash:canonicalHash(child.raw),completedAt:new Date(instant),trialCount:120,
      rawCipher:encryptUnifiedRuntimePayload(state.malformedRaw?{...child.raw,trials:[]}:state.rawTamper?{...child.raw,trials:child.raw!.trials.map((t,i)=>i===1
        ?{...t,payload:{...(t.payload as object),rtMs:351}}:t)}:child.raw),
      session:{randomSeedCipher:encryptUnifiedRuntimePayload(child.randomSeed)}}]:[])},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(t:typeof tx)=>unknown)=>fn(tx)) as never)
  const refresh=()=>{final.resultsHash=canonicalHash(result);final.resultsCipher=encryptUnifiedRuntimePayload(result)}
  return {unit,snapshot,result,child:child!,final,state,tx,refresh}
}
function batchFixture(count:number){
  const f=fixture()
  const records=Array.from({length:count},(_,index)=>{
    const suffix=String(index+1).padStart(12,'0')
    const attempt='55555555-5555-4555-8555-'+suffix,resultId='66666666-6666-4666-8666-'+suffix
    const stored={...structuredClone(f.child.result),attemptId:attempt,sessionId:'session-'+index}
    const reference={...f.child.reference,resultId,resultHash:canonicalHash(stored)}
    const parent=structuredClone(f.result);parent.units[0].childReference=reference
    return {final:{...f.final,id:'44444444-4444-4444-8444-'+suffix,
      attempt:{...f.final.attempt,id:attempt},resultsHash:canonicalHash(parent),resultsCipher:encryptUnifiedRuntimePayload(parent)},
      child:{id:resultId,sessionId:stored.sessionId,projectId,waveId,attemptId:attempt,publicationId,
        slotKey:'tool',epoch:1,measurementDigest:reference.measurementDigest,resultHash:reference.resultHash,
        resultCipher:encryptUnifiedRuntimePayload(stored),rawHash:canonicalHash(f.child.raw),completedAt:new Date(instant),trialCount:120}}
  })
  const originalQuery=f.tx.$queryRaw.getMockImplementation()!
  f.tx.$queryRaw.mockImplementation(async parts=>{
    const query=('strings' in parts?parts.strings:parts).join('')
    if(!query.includes('FROM survey_cognitive_results'))return originalQuery(parts)
    const values='strings' in parts?parts.values:[]
    return records.filter(({child})=>values.includes(child.id)).map(({child})=>({
      id:child.id,projectId,waveId,attemptId:child.attemptId,publicationId,bytes:200000,
    }))
  })
  f.tx.surveyWaveFinal.count.mockResolvedValue(count)
  f.tx.surveyWaveFinal.findMany.mockImplementation(async args=>args.select
    ?records.map(({final})=>({id:final.id,publicationId,completedAt:final.completedAt}))
    :records.map(({final})=>final))
  f.tx.surveyCognitiveResult.findMany.mockImplementation((async(args:{where:{OR:Array<{id:{in:string[]}}>}})=>{
    const ids=new Set(args.where.OR.flatMap(scope=>scope.id.in))
    return records.filter(({child})=>ids.has(child.id)).map(({child})=>child)
  }) as never)
  return {...f,records}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32));
  vi.stubEnv('ASSET_SIGNING_SECRET','measurement-export-secret-that-is-at-least-32-characters')})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('SJT v2 and authoritative cognitive measurement exports',()=>{
  it('batches nine cognitive parents as 8+1 without imposing a new one-MiB page cap',async()=>{
    const f=batchFixture(9)
    const parse=vi.spyOn(cognitiveDefinition,'parseFrozenSurveyCognitive')
    const code=vi.spyOn(cognitiveRegistry,'getCognitiveV2TaskDefinition').mockImplementation(()=>{throw new Error('rescore forbidden')})
    const source=await loadSurveySource({...owner,includeWideSchema:true,pageMode:true,stableIdCursor:true,selectRaw:false})
    expect(source.completeAttempts).toBe(9)
    expect(source.scores).toHaveLength(source.scoreColumns.length*9)
    expect(f.tx.surveyCognitiveResult.findMany).toHaveBeenCalledTimes(2)
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledTimes(4)
    const childReads=f.tx.surveyCognitiveResult.findMany.mock.calls as unknown as Array<[{where:{OR:unknown[]};select:Record<string,unknown>}]>
    expect(childReads.map(([args])=>args.where.OR.length)).toEqual([8,1])
    for(const [args] of childReads){expect(args.select.rawCipher).toBeUndefined();expect(args.select.session).toBeUndefined()}
    expect(f.state.sourceReads).toBe(2)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(code).not.toHaveBeenCalled()
  })
  it('rejects a corrupt later child batch and still rechecks source changes after all valid batches',async()=>{
    const corrupt=batchFixture(9)
    corrupt.records[8].child.resultCipher=encryptUnifiedRuntimePayload({...corrupt.child.result,attemptId:'wrong'})
    await expect(loadSurveySource({...owner,selectRaw:false})).rejects.toMatchObject({statusCode:409})
    expect(corrupt.tx.surveyCognitiveResult.findMany).toHaveBeenCalledTimes(2)
    const changed=batchFixture(9);changed.state.changeOnSecond=true
    await expect(loadSurveySource({...owner,selectRaw:false})).rejects.toMatchObject({statusCode:409})
    expect(changed.tx.surveyCognitiveResult.findMany).toHaveBeenCalledTimes(2)
    expect(changed.state.sourceReads).toBe(2)
  })
  it('owns its prepared definition while checking every parent projection and child hash again',()=>{
    const f=fixture(),projection=prepareCognitiveProjection(f.unit)
    const meta={projectId,waveId,waveOrdinal:1,attemptId,researchCode:null,publicationId,
      publicationVersion:1,sourceFinalHash:f.final.resultsHash,completedAt:instant}
    const original=projection.scoresFromChild(f.result.units[0],f.child,meta)
    const compiled=f.unit.compiledDefinition as ReturnType<typeof parseFrozenSurveyCognitive>
    compiled.sessionSnapshot.configHash='changed'
    expect(projection.scoresFromChild(f.result.units[0],f.child,meta)).toEqual(original)
    expect(()=>prepareCognitiveProjection(f.unit)).toThrow()
    f.child.result.metrics.hitRate=0
    expect(()=>projection.scoresFromChild(f.result.units[0],f.child,meta)).toThrow(/子结果/)
  })
  it('hashes one anonymous attempt once for all its trial rows and starts fresh for another export',async()=>{
    fixture()
    const source=await loadSurveySource({...owner,includeWideSchema:true,pageMode:true,stableIdCursor:true,maxFinals:1,
      selectRaw:false,selectScore:false,cognitiveTrials:{offset:0}})
    const code=vi.spyOn(exportFormat,'surveyAttemptCode')
    const first=cognitiveTrialLongExport(projectId,source,waveId)
    expect(first.manifest.rowCount).toBeGreaterThan(1)
    expect(code).toHaveBeenCalledTimes(1)
    expect(cognitiveTrialLongExport(projectId,source,waveId)).toEqual(first)
    expect(code).toHaveBeenCalledTimes(2)
  })
  it('exports grouped SJT raw option sets and stored scorer keys without scoring again',async()=>{
    fixture('SJT');const score=vi.spyOn(sjtKernel,'scoreSituationalModel').mockImplementation(()=>{throw new Error('rescore forbidden')})
    const source=await loadSurveySource({...owner,includeWideSchema:true}),raw=rawLongExport(projectId,source)
    expect(source.codebook.map(c=>[c.itemKey,c.motherSceneKey,c.sceneIndex,c.questionIndex]))
      .toEqual([['multi','mother',0,0],['single','mother',0,1]])
    expect(source.codebook[0].selectionRules).toMatchObject({minSelections:1,maxSelections:2,aggregationPolicy:'SUM',scoringMethod:'AUTHOR_KEY_SUM'})
    expect(source.raw[0]).toMatchObject({value:'["a","b"]',motherSceneKey:'mother',scorerOptionKey:expect.stringMatching(/^m[a-f0-9]{22}$/)})
    expect(raw.csv).toContain('"mother_scene_key","question_key","scorer_option_key","completion_status"')
    expect(source.scores[0]).toMatchObject({value:5,measurement:{unit:'score',provenance:{kind:'SJT',scoringMethod:'AUTHOR_KEY_SUM'}}})
    expect(score).not.toHaveBeenCalled()
  })
  it('preserves explicit SJT inability/refusal instead of an artificial score',async()=>{
    fixture('SJT',{multi:['a'],single:'unknown'})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.raw[1]).toMatchObject({value:'unknown',missingReason:'UNABLE_TO_JUDGE',scorerOptionKey:null})
    expect(source.scores[0].value).toBeNull()
    expect(exportLong(projectId,source.scores,[],source.scoreColumns).codebook[0].missingMeanings.UNABLE_TO_JUDGE).toBeTruthy()
  })
  it('rejects a stored SJT question mapping that no longer matches its original scene',async()=>{
    const f=fixture('SJT');(f.result.units[0].privateScoring as {questionResults:{motherSceneKey:string}[]}).questionResults[0].motherSceneKey='other';f.refresh()
    await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:409})
  })
  it('uses stored cognitive metric values with explicit ms, quality and frozen protocol provenance',async()=>{
    const f=fixture()
    const registry=vi.spyOn(cognitiveRegistry,'getCognitiveV2TaskDefinition').mockImplementation(()=>{throw new Error('live registry forbidden')})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    const rt=source.scores.find(s=>s.measurement.scoreKey==='goMedianRtMs')!
    expect(rt).toMatchObject({value:350,measurement:{unit:'ms',provenance:{kind:'COGNITIVE',timingPolicy:'software-frame-v1'}},
      quality:{status:'limited',flags:{interrupted:true}},sourceResultHash:f.child.reference.resultHash,completionStatus:'COMPLETE'})
    expect(source).toMatchObject({completeAttempts:1,fullCompletionAttempts:1,earlyCompletionAttempts:0,raw:[]})
    const exported=exportLong(projectId,source.scores,[],source.scoreColumns)
    expect(exported.csv).toContain('"unit","computation_status","quality_status"')
    expect(exported.csv).toContain('"ms"');expect(exported.csv).toContain('"protocol_signature"')
    expect(JSON.stringify(f.result)).not.toContain('startedAtPerfMs')
    expect(registry).not.toHaveBeenCalled()
  })
  it('does not count or read a completed child when its parent FINAL does not exist',async()=>{
    const f=fixture();f.state.hasFinal=false
    const source=await loadSurveySource({...owner,includeWideSchema:true,pageMode:true})
    expect(source).toMatchObject({completeAttempts:0,sourceFinalCount:0,scores:[],raw:[]})
    expect(f.tx.surveyCognitiveResult.findMany).not.toHaveBeenCalled()
  })
  it.each(['parent-metric','child-hash','raw-hash','malformed-raw','wrong-final','revocation'])(
    'fails closed for %s instead of exporting a smaller successful page',async(fault)=>{
      const f=fixture()
      if(fault==='parent-metric'){(f.result.units[0].privateScoring as {metrics:{value:number}[]}).metrics[0].value=99;f.refresh()}
      if(fault==='child-hash')f.child.result.metrics.hitRate=0.2
      if(fault==='raw-hash')f.state.rawTamper=true
      if(fault==='malformed-raw')f.state.malformedRaw=true
      if(fault==='revocation')f.state.changeOnSecond=true
      await expect(loadSurveySource({...owner,includeWideSchema:true,pageMode:true,stableIdCursor:true,maxFinals:1,
        cognitiveTrials:{offset:0,...(fault==='wrong-final'?{expectedFinalId:'other'}:{})}})).rejects.toMatchObject({statusCode:409})
    })
  it.each(['projectId','waveId','attemptId','publicationId','slotKey','epoch','measurementDigest'] as const)(
    'rejects a cryptographically self-consistent child with the wrong %s binding',async(field)=>{
      const f=fixture()
      Object.assign(f.child.result,{[field]:field==='epoch'?2:'wrong-scope'})
      f.child.reference.resultHash=canonicalHash(f.child.result);f.refresh()
      await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:409})
    })
  it('paginates trial rows inside the exact parent FINAL and preserves missing RT reasons',async()=>{
    fixture()
    const input={...owner,includeWideSchema:true,pageMode:true,stableIdCursor:true,maxFinals:1,
      selectRaw:false as const,selectScore:false as const}
    const first=await loadSurveySource({...input,cognitiveTrials:{offset:0,maxRows:40,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES}})
    expect(first.cognitiveTrials).toHaveLength(40);expect(first.cognitivePage?.nextOffset).toBe(40)
    const next=await loadSurveySource({...input,cognitiveTrials:{offset:40,expectedFinalId:finalId,
      expectedFinalHash:first.cognitivePage!.sourceFinalHash,maxRows:40,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES}})
    expect(next.cognitiveTrials?.[0].trialIndex).toBe(40)
    const artifact=cognitiveTrialLongExport(projectId,first,waveId)
    expect(artifact.manifest).toMatchObject({format:'COGNITIVE_TRIAL_LONG',rowCount:40})
    expect(artifact.csv).toContain('"NO_GO_WITHHELD"');expect(artifact.csv).toContain('"frozen-research-seed"')
    expect(artifact.csv).not.toContain(attemptId)
    expect(first.cognitiveTrials?.[0]).toMatchObject({rtMs:null,rtMissingReason:'NO_GO_WITHHELD',phase:'test'})
    expect(first.cognitiveTrials?.[1].response).toBe('RESPONDED')
  })
  it('enforces exact row and byte edges without losing or repeating a row',()=>{
    const f=fixture(),meta={projectId,waveId,waveOrdinal:1,attemptId,researchCode:null,publicationId,
      publicationVersion:1,sourceFinalHash:f.final.resultsHash,completedAt:instant}
    const row=[...cognitiveTrialRows(f.unit,f.child,meta)][0]
    const rows=Array.from({length:COGNITIVE_TRIAL_PAGE_ROWS+1},(_,trialIndex)=>({...row,trialIndex}))
    const page=pageCognitiveTrialRows(rows,0)
    expect(page.rows.length).toBeLessThanOrEqual(COGNITIVE_TRIAL_PAGE_ROWS)
    expect(page.nextOffset).toBe(page.rows.length)
    const oneSize=Buffer.byteLength(JSON.stringify(row),'utf8')*2+256
    expect(pageCognitiveTrialRows([row,row],0,{maxRows:2,maxBytes:oneSize}).rows).toHaveLength(1)
    expect(()=>pageCognitiveTrialRows([row],0,{maxRows:1,maxBytes:oneSize-1})).toThrow(/字节上限/)
    expect(()=>pageCognitiveTrialRows([],1)).toThrow(/越过/)
    expect(()=>pageCognitiveTrialRows(rows,0,{maxRows:COGNITIVE_TRIAL_PAGE_ROWS+1,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES})).toThrow(/边界/)
    const compact={...row,administrationProvenance:{},qualityReasons:[],qualityFlags:{}}
    const budget=Math.floor(COGNITIVE_TRIAL_PAGE_BYTES/(Buffer.byteLength(JSON.stringify(compact))*2+256))
    const exactly=Array.from({length:Math.min(budget,100)},()=>compact)
    expect(pageCognitiveTrialRows(exactly,0,{maxRows:exactly.length,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES}).nextOffset).toBeNull()
    expect(pageCognitiveTrialRows([...exactly,compact],0,{maxRows:exactly.length,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES}).nextOffset).toBe(exactly.length)
  })
  it('binds v5 within-FINAL offsets to format, scope, result hash, and expiry',()=>{
    const token:SurveyExportCursor={v:5,projectId,waveId,format:'COGNITIVE_TRIAL_LONG',phase:'FINALS',pageLimit:1,
      attendanceCount:0,after:{id:finalId,completedAt:instant},cutOff:instant,sourceRevision:1,page:1,issuedAt:Date.now(),
      completedFrom:null,completedBefore:null,freeTextIncluded:false,finalCount:2,
      trial:{finalId,finalHash:'a'.repeat(64),offset:40}}
    expect(decodeSurveyExportCursor(encodeSurveyExportCursor(token),projectId,token.format,waveId)).toEqual(token)
    for(const bad of [{...token,trial:{...token.trial!,offset:0}}, {...token,trial:{...token.trial!,finalHash:'wrong'}},
      {...token,pageLimit:2},{...token,phase:'ATTENDANCE' as const},{...token,v:4 as const},
      {...token,issuedAt:Date.now()-3600001},{...token,page:501}]){
      expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor(bad),projectId,token.format,waveId)).toThrow()
    }
    expect(()=>decodeSurveyExportCursor(encodeSurveyExportCursor(token),projectId,'SCORE_LONG',waveId)).toThrow()
  })
  it('does not combine identical metric names across different timing protocols',async()=>{
    fixture();const source=await loadSurveySource({...owner,includeWideSchema:true})
    const a={...source.scores[0],researchCode:'R'},b={...a,waveId:'second',waveOrdinal:2,
      measurement:{...a.measurement,provenance:{...a.measurement.provenance!,protocolSignature:'changed'}}}
    expect(pairedDescriptive({projectId,baselineWaveId:waveId,followupWaveId:'second',instrumentKey:'tool',
      scoreKey:a.measurement.scoreKey,observations:[a,b]})).toMatchObject({comparability:'NOT_COMPARABLE',meanPairedChange:null})
  })
})
