import {it,expect} from 'vitest'
import {getCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {buildCognitiveProfileArtifact} from '../../modules/assessment-authorization/cognitive-profile-artifact'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileSurveyCognitiveProfile} from '../../modules/survey/cognitive-profile.definition'
import {compileResearchCognitive,initialCognitiveDefinition,surveyCognitiveTaskDefinition} from '../../modules/survey/cognitive.definition'
import {assertSurveyCognitiveTrialBudget,buildSurveyCognitiveReportSnapshot,readSurveyBundleCognitiveReport} from '../../modules/survey/cognitive-bundle-report'
import {syntheticCognitiveTrials} from '../../modules/survey/governed-tool.trial'
import {runAuthoritativeScorer} from '../../modules/cognitive/v2/authoritative-scorer'
import {cognitiveParentUnit,cognitiveParticipantFeedback} from '../../modules/survey/measurement.result'
import {seeds as corsiSeeds} from '../../modules/cognitive/tasks/corsi/seeds'
import {seeds as backwardSeeds} from '../../modules/cognitive/tasks/digitbackward/seeds'
import type {ResearchFrozenUnit} from '../../modules/survey/publication.service'
import type {LoadedSurveyCognitiveResult} from '../../modules/survey/cognitive.results'
const id='11111111-1111-4111-8111-111111111111',releaseId='22222222-2222-4222-8222-222222222222'
export function sample(type:'corsi'|'digitbackward'){
 const seed=(type==='corsi'?corsiSeeds:backwardSeeds)[0],config={id,...seed},entry=getCognitiveRegistryEntry(type,'1.0.0','1.0.0')!
 const m={...prepareRelease(cognitiveMeasurementRelease({localId:type,version:seed.configVersion,...seed,scope:{kind:'PLATFORM'}})),releaseId,status:'PUBLISHED',publishedBy:id,publishedAt:new Date()} as any
 const f=compileSurveyCognitiveProfile(buildCognitiveProfileArtifact({config,entry,profile:'standard',measurement:{releaseId,contentHash:m.contentHash}}),m)
 const randomSeed='survey-bundle-bridge-synthetic',trials=syntheticCognitiveTrials(randomSeed,1,f)
 const score=runAuthoritativeScorer({definition:surveyCognitiveTaskDefinition(f),session:f.sessionSnapshot,trials,randomSeed})
 const snapshot=buildSurveyCognitiveReportSnapshot(f,score,new Date('2026-11-01T00:00:00Z'),trials)
 const unit:ResearchFrozenUnit={draftId:type,instrumentKey:type,kind:'COGNITIVE',title:type,draftRevision:1,sourceDigest:canonicalHash(f),scoringDigest:f.measurementDigest,compiledDefinition:f,displayDefinition:{},sourceProvenance:{reportConfigured:true},nativeBundleCognitiveReport:{definitionHash:'a'.repeat(64),artifactHash:f.artifactHash,selectors:['maxSpan','totalCorrectTrials',type==='corsi'?'trialCount':'completedLevelCount'],reportEnabled:true}}
 const reference={slotKey:type,epoch:1,resultId:id,resultHash:'b'.repeat(64),measurementDigest:f.measurementDigest}
 const loaded={reference,result:{...score,reportSnapshot:snapshot,profileArtifactHash:f.artifactHash,profile:f.artifact.identity.profile,configHash:f.sessionSnapshot.configHash,engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:f.sessionSnapshot.protocolSignature}} as unknown as LoadedSurveyCognitiveResult
 return {f,unit,result:cognitiveParentUnit(unit,loaded),trials,score}
}
for(const type of ['corsi','digitbackward'] as const)it(type+' uses original terminal scorer and frozen report for feedback',()=>{
 const x=sample(type);expect(x.trials.length).toBeLessThan(x.f.maxTrials);expect(()=>assertSurveyCognitiveTrialBudget(x.f,x.trials.length)).not.toThrow()
 const projected=readSurveyBundleCognitiveReport(x.unit,x.result)!
 expect(projected).not.toBeNull();expect(projected.disclosure.metricKeys.has('maxSpan')).toBe(true);expect(projected.disclosure.capabilities.individualInterpretations).toBe(true)
 const feedback=cognitiveParticipantFeedback(x.unit,x.result,false) as any
 expect(feedback.metrics.find((m:any)=>m.key==='maxSpan').value).toBe(x.score.metrics.maxSpan)
 expect(JSON.stringify(feedback)).not.toMatch(/randomSeed|profileArtifactHash|scoringVersion|protocolSignature/)
 expect(()=>runAuthoritativeScorer({definition:surveyCognitiveTaskDefinition(x.f),session:x.f.sessionSnapshot,trials:x.trials.slice(0,2),randomSeed:'survey-bundle-bridge-synthetic'})).toThrow(/terminal|advance/)
})
it('withholds mismatched receipt/profile, absent saved report, hidden metrics and disabled source',()=>{
 const x=sample('digitbackward')
 for(const modify of [(y:any)=>y.result.childReference.resultHash='0'.repeat(64),(y:any)=>y.unit.nativeBundleCognitiveReport.artifactHash='0'.repeat(64),(y:any)=>delete y.result.privateScoring.nativeCognitive,(y:any)=>y.unit.sourceProvenance.reportConfigured=false,(y:any)=>y.unit.sourceProvenance.reportAudience='researcher']){
  const y=structuredClone(x);modify(y);expect(readSurveyBundleCognitiveReport(y.unit,y.result)).toBeNull()
 }
 const y=structuredClone(x),proof=(y.result.privateScoring as any).nativeCognitive
 proof.snapshot.report.headline=[];proof.snapshot.report.user=[];proof.snapshot.report.detail=[];proof.snapshotHash=canonicalHash(proof.snapshot)
 expect(readSurveyBundleCognitiveReport(y.unit,y.result)!.disclosure.metricKeys.size).toBe(0)
})
it('preserves old GENERAL feedback and legacy exact trial budget',()=>{
 const x=sample('corsi');delete x.unit.nativeBundleCognitiveReport
 expect(cognitiveParticipantFeedback(x.unit,x.result,false)).toBeNull()
 const legacy=compileResearchCognitive(initialCognitiveDefinition())
 expect(()=>assertSurveyCognitiveTrialBudget(legacy,119)).toThrow();expect(()=>assertSurveyCognitiveTrialBudget(legacy,120)).not.toThrow()
 expect(()=>assertSurveyCognitiveTrialBudget(x.f,x.f.maxTrials+1)).toThrow()
})
