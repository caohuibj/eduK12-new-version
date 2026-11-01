import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {cognitiveSeeds} from '../../modules/cognitive/generated/seeds'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {freezeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {getCognitiveV2TaskDefinition} from '../../modules/cognitive/v2/registry'
import {createSessionConfigSnapshot} from '../../modules/cognitive/v2/session-snapshot'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {runAuthoritativeScorer} from '../../modules/cognitive/v2/authoritative-scorer'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
beforeAll(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','f'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','e'.repeat(64))})
afterAll(()=>vi.unstubAllEnvs())
it('scores actual frozen R3 sharing facts without turning missing choices into zero or rewriting legacy R',()=>{
 const seed=cognitiveSeeds.find(s=>s.testType==='sharegame'&&s.configVersion==='2.0.0-report3')!
 const old=cognitiveSeeds.find(s=>s.testType==='sharegame'&&s.configVersion==='2.0.0')!
 const entry=requireCognitiveRegistryEntry(seed.testType,seed.engineVersion,seed.scoringVersion)
 const legacy=readFrozenReport(freezeAssignmentProfile({entry,baseConfig:old.config,profile:'experience'}).resolvedReportSnapshotEncrypted)!
 const resolved=freezeAssignmentProfile({entry,baseConfig:seed.config,profile:'experience'})
 const frozen=readFrozenReport(resolved.resolvedReportSnapshotEncrypted)!
 expect(frozen.participantPresentation?.reportReading?.version).toBe('3.0.0')
 const task=getCognitiveV2TaskDefinition(seed.testType,seed.engineVersion,seed.scoringVersion)!
 const config=resolved.resolvedConfig as {endowments:number[]}
 const session=createSessionConfigSnapshot({definition:task,configVersion:seed.configVersion,config:resolved.resolvedConfig})
 for(const answered of [true,false]){
  const trials=config.endowments.map((endowment,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*30000,endedAtPerfMs:trialIndex*30000+20000,
   payload:{endowment,response:answered?'choice':'timeout',given:answered?0:null,rtMs:answered?250:null,interrupted:false}}))
  const score=runAuthoritativeScorer({definition:task,session,trials,randomSeed:'synthetic-union'})
  expect(score.metrics.givingRate).toBe(answered?0:null)
  expect(score.metrics.answeredRounds).toBe(answered?config.endowments.length:0)
  const report=projectThreeLayerReport({...seed,profile:'experience',protocolSignature:session.protocolSignature,
   participantPresentation:frozen.participantPresentation,definition:frozen.v2ReportDefinition!,metricDefinitions:frozen.v2MetricDefinitions!,qualityDefinitions:frozen.v2QualityDefinitions!,metrics:score.metrics,score})
  if(answered)expect([...report.headline,...report.user,...report.detail].find(m=>m.key==='givingRate')?.value).toBe(0)
  else{expect([...report.headline,...report.user,...report.detail].some(m=>m.key==='givingRate')).toBe(false);expect(report.reading?.visuals).toEqual([])}
 }
 expect(legacy.participantPresentation?.reportReading?.version).toBe('2.0.0')
})
