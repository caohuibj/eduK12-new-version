import { beforeEach,describe,expect,it,vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileResearchCognitive,initialCognitiveDefinition,cognitiveDraftSchema,parseFrozenSurveyCognitive,
  surveyCognitiveReferenceSchema,surveyCognitiveTaskDefinition,SURVEY_GONOGO_CONFIG } from '../../modules/survey/cognitive.definition'
import { prepareSurveyCognitivePriorAnswers } from '../../modules/survey/cognitive.service'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { assertSurveyCognitiveLockedAnswers,loadSurveyCognitiveResults,verifySurveyCognitiveReferences } from '../../modules/survey/cognitive.results'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
const seed='survey-fixed-sequence-test'
const trials=()=>gonogoSequence(seed,120,0.25).map((trialType,index)=>createTrialEnvelope({
  trialIndex:index,phase:'test',startedAtPerfMs:index*1300,endedAtPerfMs:index*1300+800,
  payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?320:null,interrupted:false},
}))
beforeEach(()=>{process.env.DATA_ENCRYPTION_KEY='1'.repeat(64)})
describe('Survey cognitive fixed pilot and shared scoring contracts',()=>{
  it('freezes exact software-frame identity without shortening the 120-trial protocol',()=>{
    const a=compileResearchCognitive(initialCognitiveDefinition()),b=compileResearchCognitive(initialCognitiveDefinition())
    expect(a).toEqual(b)
    expect(a.sessionSnapshot.config).toEqual(SURVEY_GONOGO_CONFIG)
    expect(a.sessionSnapshot).toMatchObject({testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',referenceBindings:[]})
    expect(a).toMatchObject({timingPolicy:'software-frame-v1',devicePolicy:'DESKTOP_KEYBOARD',restartLimit:1,maturity:'PILOT',referenceMode:'none',partialRetentionDays:30})
    expect(parseFrozenSurveyCognitive(a)).toEqual(a)
    expect(cognitiveDraftSchema.safeParse({...initialCognitiveDefinition(),config:{totalTrials:8}}).success).toBe(false)
    const changed=structuredClone(a);(changed.sessionSnapshot.config as any).totalTrials=8
    expect(()=>parseFrozenSurveyCognitive(changed)).toThrow()
    expect(()=>parseFrozenSurveyCognitive({...a,timingPolicy:'legacy'})).toThrow()
  })
  it('freezes a strict descriptive whitelist and defaults General without metric disclosure',()=>{
    const base=initialCognitiveDefinition()
    expect(base.feedback).toEqual({policyVersion:'SURVEY_DESCRIPTIVE_V1',mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'})
    expect(cognitiveDraftSchema.safeParse({...base,feedback:{mode:'DESCRIPTIVE',metricKeys:['dPrime'],release:'AFTER_FINAL'}}).success).toBe(false)
    expect(cognitiveDraftSchema.safeParse({...base,feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate','hitRate'],release:'AFTER_FINAL'}}).success).toBe(false)
    expect(cognitiveDraftSchema.safeParse({...base,feedback:{mode:'GENERAL',metricKeys:['hitRate'],release:'AFTER_FINAL'}}).success).toBe(false)
    const permitted=compileResearchCognitive({...base,feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate','goMedianRtMs'],release:'AFTER_COLLECTION'}})
    expect(permitted.measurementDigest).toBe(compileResearchCognitive(base).measurementDigest)
  })
  it('uses existing authoritative scorer and preserves valid no-go null RT and quality distinctions',()=>{
    const definition=surveyCognitiveTaskDefinition(),session=compileResearchCognitive(initialCognitiveDefinition()).sessionSnapshot
    const score=(values:unknown[])=>runAuthoritativeScorer({definition,session,trials:values,randomSeed:seed})
    expect(score(trials()).metrics).toMatchObject({hitRate:1,goMedianRtMs:320,omissionRate:0,commissionRate:0,goTrialCount:90,nogoTrialCount:30})
    expect(score(trials()).audit.trialCount).toBe(120)
    const interrupted=trials();(interrupted[0].payload as any).interrupted=true
    expect(score(interrupted).quality).toMatchObject({state:'limited',flags:{interrupted:true}})
    expect(()=>score(trials().slice(1))).toThrow()
    const duplicate=trials();duplicate[1]=duplicate[0]
    expect(()=>score(duplicate)).toThrow()
    const forged=trials();(forged[0].payload as any).trialType=forged[0].payload.trialType==='go'?'nogo':'go'
    expect(()=>score(forged)).toThrow()
  })
  it('requires exact bounded parent result-reference identities',()=>{
    const reference={slotKey:'gonogo',epoch:1,resultId:randomUUID(),resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}
    expect(surveyCognitiveReferenceSchema.parse(reference)).toEqual(reference)
    expect(surveyCognitiveReferenceSchema.safeParse({...reference,epoch:3}).success).toBe(false)
    expect(surveyCognitiveReferenceSchema.safeParse({...reference,metrics:{hitRate:1}}).success).toBe(false)
  })
  it('locks canonical original prefix answers and rejects changed or removed values',async()=>{
    const locked={screen:{choice:'eligible'}},tx={surveyCognitiveSession:{findMany:vi.fn().mockResolvedValue([
      {lockedAnswersHash:canonicalHash(locked),lockedAnswersCipher:encryptUnifiedRuntimePayload(locked)},
    ])}}
    await expect(assertSurveyCognitiveLockedAnswers(tx as any,'attempt',{...locked,later:{x:1}})).resolves.toBeUndefined()
    await expect(assertSurveyCognitiveLockedAnswers(tx as any,'attempt',{screen:{choice:'other'}})).rejects.toThrow('前置答案')
    await expect(assertSurveyCognitiveLockedAnswers(tx as any,'attempt',{})).rejects.toThrow('前置答案')
  })
  it('verifies only current completed epoch and publication-bound slot, rejecting duplicate refs',async()=>{
    const unit=compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'go',title:'Go',kind:'COGNITIVE',revision:1,definition:initialCognitiveDefinition()})
    const snapshot={units:[unit]} as ResearchFrozenPublication
    const reference={slotKey:'go',epoch:1,resultId:randomUUID(),resultHash:'a'.repeat(64),measurementDigest:(unit.compiledDefinition as any).measurementDigest}
    const find=vi.fn().mockResolvedValue([{slotKey:'go',status:'COMPLETED',epoch:1,result:{id:reference.resultId,...reference}}])
    const tx={surveyCognitiveSession:{findMany:find}},input={projectId:'p',waveId:'w',attemptId:'a',publicationId:'pub',snapshot,references:[reference]}
    await expect(verifySurveyCognitiveReferences(tx as any,input)).resolves.toEqual([reference])
    expect(find.mock.calls[0][0].where).toMatchObject({projectId:'p',waveId:'w',attemptId:'a',publicationId:'pub',slotKey:{in:['go']}})
    expect(JSON.stringify(find.mock.calls[0][0].select)).not.toMatch(/rawCipher|resultCipher/)
    find.mockResolvedValueOnce([{slotKey:'go',status:'COMPLETED',epoch:2,result:{id:reference.resultId,...reference}}])
    await expect(verifySurveyCognitiveReferences(tx as any,input)).rejects.toThrow()
    await expect(verifySurveyCognitiveReferences(tx as any,{...input,references:[reference,reference]})).rejects.toThrow('重复')
  })
  it('admits the published 900000-byte prefix budget and rejects larger or deeply nested input',()=>{
    const prefix={first:{q:'a'.repeat(449950)},second:{q:'b'.repeat(449950)}}
    const prepared=prepareSurveyCognitivePriorAnswers(prefix)
    expect(prepared.canonical.bytes).toBeGreaterThan(512*1024)
    expect(prepared.canonical.bytes).toBeLessThanOrEqual(900000)
    expect(()=>prepareSurveyCognitivePriorAnswers({...prefix,third:{q:'c'.repeat(1000)}})).toThrow('过大')
    expect(()=>prepareSurveyCognitivePriorAnswers({first:{q:{a:{b:{c:'deep'}}}}})).toThrow('安全预算')
  })
  it('applies ciphertext byte budget before fetching/decrypting raw results',async()=>{
    const ref={slotKey:'go',epoch:1,resultId:randomUUID(),resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}
    const find=vi.fn(),tx={$queryRaw:vi.fn().mockResolvedValue([{id:ref.resultId,bytes:3*1024*1024}]),surveyCognitiveResult:{findMany:find}}
    await expect(loadSurveyCognitiveResults(tx as any,{projectId:'p',waveId:'w',attemptId:'a',publicationId:'pub',references:[ref],includeRaw:true})).rejects.toThrow('预算')
    expect(find).not.toHaveBeenCalled()
  })
  it('applies metrics-only ciphertext budget before fetching/decrypting stored results',async()=>{
    const ref={slotKey:'go',epoch:1,resultId:randomUUID(),resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}
    const find=vi.fn(),tx={$queryRaw:vi.fn().mockResolvedValue([{id:ref.resultId,bytes:256*1024+1}]),surveyCognitiveResult:{findMany:find}}
    await expect(loadSurveyCognitiveResults(tx as any,{projectId:'p',waveId:'w',attemptId:'a',publicationId:'pub',references:[ref]})).rejects.toMatchObject({statusCode:413})
    expect(find).not.toHaveBeenCalled()
  })
})
