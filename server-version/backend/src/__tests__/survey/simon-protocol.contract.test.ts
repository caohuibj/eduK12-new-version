import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { cognitiveDraftSchema, compileResearchCognitive, initialCognitiveDefinition, parseFrozenSurveyCognitive, surveyCognitiveTaskDefinition } from '../../modules/survey/cognitive.definition'
import { SURVEY_SIMON_TEMPLATE, matchSurveyCognitiveProtocol, surveyCognitiveResultProtocol } from '../../modules/survey/cognitive.protocols'
import { SIMON_CONFIG } from '../../modules/cognitive/tasks/simon/schema'
import { adaptCatalogCognitive } from '../../modules/survey/catalog.sources'
import { compileFrozenResearchUnit } from '../../modules/survey/publication.service'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { cognitiveTrialRows } from '../../modules/survey/analytics.cognitive'
import fixture from '../../modules/cognitive/tasks/simon/fixtures/1.0.0-1.0.0.json'
import type { CognitiveExportChild, CognitiveSourceMeta } from '../../modules/survey/analytics.cognitive'

const draft=()=>({...initialCognitiveDefinition(),templateKey:SURVEY_SIMON_TEMPLATE})
const row={testType:'simon',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',config:SIMON_CONFIG,name:'Simon',status:'PUBLISHED',accessPolicy:'OPEN'}
describe('Survey explicit Simon protocol',()=>{
 it('binds one exact config without broadening Go/No-Go or allowing arbitrary task parameters',()=>{
  const frozen=compileResearchCognitive(draft())
  expect(frozen.sessionSnapshot).toMatchObject({testType:'simon',configVersion:'1.0.0',referenceBindings:[]})
  expect(frozen).toMatchObject({maturity:'PILOT',referenceMode:'none',devicePolicy:'DESKTOP_KEYBOARD',timingPolicy:'simon-software-frame-v1'})
  expect(parseFrozenSurveyCognitive(frozen)).toEqual(frozen)
  expect(matchSurveyCognitiveProtocol(row)?.formalTrials).toBe(100)
  for(const changed of [{...row,scoringVersion:'2.0.0'},{...row,config:{...SIMON_CONFIG,totalTrials:120}},{...row,testType:'unknown'}])expect(matchSurveyCognitiveProtocol(changed)).toBeUndefined()
  expect(()=>surveyCognitiveResultProtocol({...row,timingPolicy:'software-frame-v1'})).toThrow()
  expect(compileResearchCognitive(initialCognitiveDefinition()).sessionSnapshot.config).toMatchObject({totalTrials:120})
  expect(cognitiveDraftSchema.safeParse({...draft(),config:SIMON_CONFIG}).success).toBe(false)
 })
 it('only grants an explicitly published OPEN exact source and separates feedback whitelists',()=>{
  const ref={kind:'COGNITIVE' as const,sourceId:'synthetic',sourceVersion:'1.0.0'}
  expect(adaptCatalogCognitive(ref,row).displayDefinition).toMatchObject({templateKey:SURVEY_SIMON_TEMPLATE})
  expect(()=>adaptCatalogCognitive(ref,{...row,status:'DRAFT'})).toThrow()
  expect(()=>adaptCatalogCognitive(ref,{...row,accessPolicy:'RESTRICTED'})).toThrow()
  expect(cognitiveDraftSchema.safeParse({...draft(),feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate']}}).success).toBe(false)
  expect(cognitiveDraftSchema.safeParse({...initialCognitiveDefinition(),feedback:{mode:'DESCRIPTIVE',metricKeys:['simonEffectMeanMs']}}).success).toBe(false)
  expect(cognitiveDraftSchema.safeParse({...draft(),feedback:{mode:'DESCRIPTIVE',metricKeys:['accuracy','simonEffectMeanMs']}}).success).toBe(true)
 })
 it('scores through the frozen native protocol and exports required/actual sides without inferring condition from a wrong key',()=>{
  const unit=compileFrozenResearchUnit({id:'synthetic',instrumentKey:'simon',title:'Simon',kind:'COGNITIVE',revision:1,definition:draft()})
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
  const trials=structuredClone(fixture.cases[0].input.trials.map(t=>t.envelope!))
  const scored=runAuthoritativeScorer({definition:surveyCognitiveTaskDefinition(SURVEY_SIMON_TEMPLATE),session:frozen.sessionSnapshot,trials,randomSeed:'golden'})
  expect(scored.metrics.simonEffectMeanMs).toBe(100)
  expect(scored).not.toHaveProperty('score')
  const meta={projectId:'p',waveId:'w',waveOrdinal:1,attemptId:'a',researchCode:null,completedAt:new Date().toISOString(),sourceFinalHash:'f',publicationId:'pub',publicationVersion:1} as CognitiveSourceMeta
  const result={...meta,schemaVersion:1,sessionId:'s',slotKey:'simon',epoch:1,measurementDigest:frozen.measurementDigest,configHash:frozen.sessionSnapshot.configHash,
   protocolSignature:frozen.sessionSnapshot.protocolSignature,testType:'simon',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',timingPolicy:frozen.timingPolicy,
   metrics:scored.metrics,quality:scored.quality,audit:scored.audit,administrationProvenance:{},restartCount:0}
  const child={sessionId:'s',completedAt:new Date(),result,reference:{slotKey:'simon',epoch:1,resultId:'r',resultHash:canonicalHash(result),measurementDigest:frozen.measurementDigest},raw:{schemaVersion:1,attemptEpoch:1,trials},randomSeed:'golden'} as unknown as CognitiveExportChild
  const rows=[...cognitiveTrialRows(unit,child,meta)]
  expect(rows).toHaveLength(100)
  expect(rows.every(r=>r.simon?.technicallyValid&&r.simon.correct)).toBe(true)
  // Match the shared envelope parser's <=1ms serialization tolerance.
  child.raw!.trials[0].durationMs+=0.5
  expect([...cognitiveTrialRows(unit,child,meta)][0].simon?.technicallyValid).toBe(true)
  child.raw!.trials[0].durationMs-=0.5
  const trial=child.raw!.trials[0];const payload=trial.payload as Record<string,unknown>;payload.responseSide=payload.requiredSide==='left'?'right':'left'
  const wrong=[...cognitiveTrialRows(unit,child,meta)][0]
  expect(wrong.condition).toBe(rows[0].condition);expect(wrong.simon?.correct).toBe(false)
  payload.interrupted=true
  expect([...cognitiveTrialRows(unit,child,meta)][0]).toMatchObject({interrupted:true,simon:{technicallyValid:false,correct:null}})
 })
})
