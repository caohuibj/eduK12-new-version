import { createHash } from 'node:crypto'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { freezeAssignmentProfile, readFrozenReport, type FrozenReportSnapshot } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import type { CognitiveProfile } from '../../modules/cognitive/cognitive.types'
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const reportDigests = (entry: ReturnType<typeof listCognitiveRegistryEntries>[number], profile:CognitiveProfile, frozenReport:FrozenReportSnapshot|null) => {
  const definition=buildCognitiveV2TaskDefinition(entry)
  const metrics=Object.fromEntries(Object.entries(entry.metricDefinitions).map(([key,m])=>[key,m.valueType==='object'?{'1':0.75}:m.valueType==='array'?[1,2]:m.unit==='ratio'?0.75:2]))
  const identity={testType:entry.testType,engineVersion:entry.engineVersion,scoringVersion:entry.scoringVersion,configVersion:'compatibility',profile}
  return {
    single:[true,false].map(interpretable=>digest(buildCognitiveSingleTaskReport({...identity,frozenReport,score:50,metrics,qualityFlags:{interpretable},reference:null}))),
    v2:(['interpretable','limited','invalid'] as const).map(state=>digest(projectThreeLayerReport({...identity,protocolSignature:'compatibility',definition:definition.report,metrics,metricDefinitions:definition.metrics,qualityDefinitions:definition.quality,score:{metrics,quality:{state,flags:{},reasons:[]},audit:{trialCount:2,scorerVersion:entry.scoringVersion}}}))),
  }
}
export const captureLegacyReports = () => listCognitiveRegistryEntries().flatMap(entry=>{
  const seed=COGNITIVE_SEEDS.find(s=>s.testType===entry.testType&&s.engineVersion===entry.engineVersion&&s.scoringVersion===entry.scoringVersion)!
  return (['experience','standard','research'] as const).map(profile=>{
    const frozen=readFrozenReport(freezeAssignmentProfile({entry,baseConfig:seed.config,profile}).resolvedReportSnapshotEncrypted)!
    return {testType:entry.testType,engineVersion:entry.engineVersion,scoringVersion:entry.scoringVersion,profile,frozen,withSnapshot:reportDigests(entry,profile,frozen),withoutSnapshot:reportDigests(entry,profile,null)}
  })
})
