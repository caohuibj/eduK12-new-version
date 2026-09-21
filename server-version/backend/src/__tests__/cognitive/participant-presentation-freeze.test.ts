import { describe, expect, it } from 'vitest'
import { listCognitiveRegistryEntries, requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'

const frozenFor = (testType: string) => {
  const entry = requireCognitiveRegistryEntry(testType,'1.0.0','1.0.0')
  const seed = COGNITIVE_SEEDS.find(s=>s.testType===testType)!
  return readFrozenReport(freezeAssignmentProfile({entry,baseConfig:seed.config,profile:'standard'}).resolvedReportSnapshotEncrypted)!
}
const single = (testType: string, frozen: ReturnType<typeof frozenFor>) => buildCognitiveSingleTaskReport({testType,engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',profile:'standard',frozenReport:frozen,score:50,metrics:{flankerEffectMs:80,congruentAccuracy:0.9},qualityFlags:{interpretable:true},reference:null})
const v2 = (frozen: ReturnType<typeof frozenFor>) => projectThreeLayerReport({testType:'flanker',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',protocolSignature:'test',profile:'standard',participantPresentation:frozen.participantPresentation,definition:frozen.v2ReportDefinition!,metricDefinitions:frozen.v2MetricDefinitions!,qualityDefinitions:frozen.v2QualityDefinitions!,metrics:{flankerEffectMs:80,congruentAccuracy:0.9},score:{metrics:{},quality:{state:'interpretable',flags:{},reasons:[]},audit:{trialCount:80,scorerVersion:'1.0.0'}}})

describe('task-owned participant presentation freeze',()=>{
  it('declares presentation for every exact identity and never shares cross-task metric objects',()=>{
    for(const entry of listCognitiveRegistryEntries()) {
      const presentation=resolveParticipantPresentation(entry)!
      expect(presentation).toBeDefined()
      expect(Object.keys(presentation.metrics).sort()).toEqual(Object.keys(entry.metricDefinitions).sort())
      expect(presentation.scoringVersion).toBe(entry.scoringVersion)
      expect(entry.executionSemantics).toBeDefined()
      expect(Object.keys(entry.executionSemantics!.qualityEffects).sort()).toEqual(Object.keys(entry.qualityDefinitions).sort())
    }
    const flanker=resolveParticipantPresentation({testType:'flanker',engineVersion:'1.0.0',scoringVersion:'1.0.0'})!
    const stroop=resolveParticipantPresentation({testType:'stroop',engineVersion:'1.0.0',scoringVersion:'1.0.0'})!
    expect(flanker.metrics.congruentAccuracy).not.toBe(stroop.metrics.congruentAccuracy)
    expect(resolveParticipantPresentation({testType:'flanker',engineVersion:'2.0.0',scoringVersion:'1.0.0'})).toBeUndefined()
  })
  it('live wording, profile additions and execution wording do not alter either frozen report projection or hashes',()=>{
    const previousKey=process.env.DATA_ENCRYPTION_KEY
    process.env.DATA_ENCRYPTION_KEY='1'.repeat(64)
    const entry=requireCognitiveRegistryEntry('flanker','1.0.0','1.0.0')
    const presentation=resolveParticipantPresentation(entry)!
    const original=structuredClone(presentation)
    const originalTitle=entry.reportDefinition.title
    try {
      const frozen=frozenFor('flanker'), beforeSingle=single('flanker',frozen),beforeV2=v2(frozen)
      const runtime=compileCognitiveRuntime({definition:buildCognitiveV2TaskDefinition(entry)})
      presentation.title='Changed live title'
      presentation.metrics.congruentAccuracy.label='Only Flanker changes'
      presentation.protocols.standard!.participantConclusion='New conclusion'
      presentation.hiddenMetrics.push('flankerEffectMs')
      expect(compileCognitiveRuntime({definition:buildCognitiveV2TaskDefinition(entry)})).toEqual(runtime)
      entry.reportDefinition.title='Changed legacy execution title'
      expect(single('flanker',frozen)).toEqual(beforeSingle)
      expect(v2(frozen)).toEqual(beforeV2)
      expect(resolveParticipantPresentation({testType:'stroop',engineVersion:'1.0.0',scoringVersion:'1.0.0'})!.metrics.congruentAccuracy.label).not.toBe('Only Flanker changes')
    } finally {
      Object.assign(presentation,original)
      entry.reportDefinition.title=originalTitle
      if(previousKey===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=previousKey
    }
  })
  it('does not consult live protocol presentation for a versioned snapshot with no profile override',()=>{
    const previousKey=process.env.DATA_ENCRYPTION_KEY;process.env.DATA_ENCRYPTION_KEY='1'.repeat(64)
    const presentation=resolveParticipantPresentation({testType:'fake',engineVersion:'1.0.0',scoringVersion:'1.0.0'})!
    try {
      const frozen=frozenFor('fake'),before=single('fake',frozen)
      presentation.protocols.standard={tier:'PILOT',profileLabel:'unexpected live wording',participantConclusion:'unexpected',reportCaveats:[]}
      expect(single('fake',frozen)).toEqual(before)
    } finally {delete presentation.protocols.standard;if(previousKey===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=previousKey}
  })
})
