import {describe,it,expect} from 'vitest'
import sd from '../../modules/situational/instruments/u4-cjx01-sd/0.3.0/instrument.json'
import wd from '../../modules/situational/instruments/u4-cjx01-wd/0.3.0/instrument.json'
import scientific from '../../modules/situational/instruments/u4-cjx01-sd/0.3.0/scientific.json'
import {instrumentSourceSchema,projectSituationPackage} from '../../modules/situational/onboarding/schema'
import {evaluateSituationalPublicationGate} from '../../modules/situational/onboarding/publication-gate'
import {validateSituationRuntimeDefinition} from '../../modules/situational/situation-runtime-definition'
import {freezeSituationalRuntimeAtAttemptStart,parseFrozenSituationalRuntimeSnapshot} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {scoreSituationalModel} from '../../modules/situational/situation-model-resolver'
import {scoreSituational} from '../../modules/situational/situation-scoring'
import {deriveAuthoritativeSituationalTrajectory,projectReachableSituationDefinitionForScoring} from '../../modules/situational/situation-trajectory'
import {projectSituationCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {buildSjtNarrative} from '../../modules/situational/authoring/narrative'
import {sjtMeasurementRelease} from '../../modules/measurement-content/sjt'
import {prepareRelease} from '../../modules/measurement-content/release'
import {compileSurveyNativeSituationalHeader,frozenSurveyNativeSituationalRuntime} from '../../modules/survey/situational-native.definition'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as legacy} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

export const unscoredPackages=[sd,wd].map(content=>projectSituationPackage(instrumentSourceSchema.parse({content,publication:{releaseStatus:'DRAFT'},scientific})))
describe('explicit unscored CJX01 contract',()=>{
 it.each([sd,wd])('checks all 106 terminal paths without manufacturing scores: $identity.instrumentKey',content=>{
  const gate=evaluateSituationalPublicationGate({content,publication:{releaseStatus:'DRAFT'},scientific})
  expect(gate.errors).toEqual([]);expect(gate.eligibleToPublish).toBe(true)
  expect(gate.runtimeCapabilities).toMatchObject({standalone:true,embedded:true,aggregateEligible:false})
  const pkg=unscoredPackages.find(p=>p.key===content.identity.instrumentKey)!
  expect(pkg.releaseStatus).toBe('DRAFT');expect(pkg.goldenCases).toHaveLength(106)
  expect(pkg.goldenCases.filter(g=>g.expected.unscored!.responseStatus==='COMPLETE')).toHaveLength(64)
  const frozen=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition})
  expect(parseFrozenSituationalRuntimeSnapshot(frozen)).toEqual(frozen)
  for(const g of pkg.goldenCases){
   const trajectory=deriveAuthoritativeSituationalTrajectory(pkg.definition,g.responses)
   const d=projectReachableSituationDefinitionForScoring(pkg.definition,trajectory)
   const result=scoreSituationalModel(d,g.responses)
   expect(result).toMatchObject({mode:'UNSCORED',metrics:[],quality:{status:'unscored'},responseStatus:g.expected.unscored!.responseStatus})
   expect(result).not.toHaveProperty('model')
   expect(buildSjtNarrative(pkg.definition,g.responses)?.paragraphs).toEqual(g.expected.unscored!.paragraphs)
   expect(projectSituationCanonicalUnitResult({result,runtime:frozen.compiledRuntime,contextHash:null}).metrics).toEqual([])
  }
  const release=prepareRelease(sjtMeasurementRelease({localId:pkg.key,version:pkg.instrumentVersion,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,scope:{kind:'PLATFORM'}}))
  expect(release.content).toMatchObject({resultMode:'UNSCORED',metrics:[]})
  const header=compileSurveyNativeSituationalHeader({...pkg,releaseStatus:'PUBLISHED'})
  const {snapshot}=frozenSurveyNativeSituationalRuntime({kind:'SJT',executionProtocol:header.protocol,compiledDefinition:pkg.definition,nativeSituational:{...header,attemptEpoch:1,frozenAt:'2026-11-02T00:00:00Z'}})
  expect(snapshot.scorerKey).toBe('situational.unscored')
 })
 it('requires explicit mode, raw roles, exact choice narrative, and no score/model/metric claims',()=>{
  for(const mutate of [
   (d:any)=>delete d.scoring.mode,
   (d:any)=>d.scoring.mode='SCORED',
   (d:any)=>d.scoring.choiceScores=legacy.definition.scoring.choiceScores,
   (d:any)=>d.scoring.publishedMetrics=legacy.definition.scoring.publishedMetrics,
   (d:any)=>d.scoring.model={modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',expertKey:[]},
   (d:any)=>d.flow.nodes[0].channelPolicies[0].measurementRole='SCORED',
   (d:any)=>d.flow.nodes[0].channelPolicies[0].required=false,
   (d:any)=>d.report.narrative.fragments[0].text='你表现出优秀教学能力',
   (d:any)=>d.report.narrative.fragments.pop(),
  ]){const d=structuredClone(sd.definition);mutate(d);expect(validateSituationRuntimeDefinition(d).issues.some(i=>i.severity==='error')).toBe(true)}
  const pkg=unscoredPackages[0],frozen=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition})
  const result=scoreSituationalModel(projectReachableSituationDefinitionForScoring(pkg.definition,deriveAuthoritativeSituationalTrajectory(pkg.definition,pkg.goldenCases[0].responses)),pkg.goldenCases[0].responses)
  expect(()=>projectSituationCanonicalUnitResult({runtime:frozen.compiledRuntime,contextHash:null,result:{...result,metrics:[{key:'completion',value:1} as never]}})).toThrow()
  expect(()=>scoreSituational(pkg.definition,pkg.goldenCases[0].responses)).toThrow('UNSCORED_REQUIRES_MODEL_RESOLVER')
 })
 it('preserves scored nonempty metrics and rejects incomplete/duplicate canonical output',()=>{
  const d=structuredClone(legacy.definition);d.scoring.publishedMetrics=[]
  expect(validateSituationRuntimeDefinition(d).issues.some(i=>i.severity==='error')).toBe(true)
  const frozen=freezeSituationalRuntimeAtAttemptStart({instrumentKey:legacy.key,instrumentVersion:legacy.instrumentVersion,definition:legacy.definition})
  const result=scoreSituationalModel(legacy.definition,legacy.goldenCases[0].responses)
  expect(()=>projectSituationCanonicalUnitResult({runtime:frozen.compiledRuntime,contextHash:null,result:{...result,metrics:[]}})).toThrow()
  expect(()=>projectSituationCanonicalUnitResult({runtime:frozen.compiledRuntime,contextHash:null,result:{...result,metrics:[...result.metrics,result.metrics[0]]}})).toThrow()
  expect(projectSituationCanonicalUnitResult({runtime:frozen.compiledRuntime,contextHash:null,result}).metrics.length).toBeGreaterThan(0)
 })
})
