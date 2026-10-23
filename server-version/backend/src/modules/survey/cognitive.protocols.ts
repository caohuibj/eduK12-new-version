import { SIMON_CONFIG } from '../cognitive/tasks/simon/schema'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'

export const SURVEY_SIMON_TEMPLATE = 'simon-software-frame-v1' as const
export const SURVEY_COGNITIVE_TEMPLATE = 'gonogo-software-frame-v1' as const
export const SURVEY_GONOGO_CONFIG = {totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,
  validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none' as const}}
export const SURVEY_COGNITIVE_PROTOCOLS = {
  [SURVEY_SIMON_TEMPLATE]: {
    templateKey:SURVEY_SIMON_TEMPLATE,testType:'simon',engineVersion:'1.0.0',scoringVersion:'1.0.0',
    configVersion:'1.0.0',config:SIMON_CONFIG,formalTrials:100,estimatedDurationSeconds:480,
    timingPolicy:'simon-software-frame-v1',frozenAt:'2026-10-23T00:00:00.000Z',
    feedbackMetrics:{accuracy:'本次正式任务正确率',simonEffectMeanMs:'不相容减相容平均用时差'},
  },
  [SURVEY_COGNITIVE_TEMPLATE]: {
    templateKey:SURVEY_COGNITIVE_TEMPLATE,testType:'gonogo',engineVersion:'1.0.0',scoringVersion:'1.0.0',
    configVersion:'1.1.0',config:SURVEY_GONOGO_CONFIG,formalTrials:120,estimatedDurationSeconds:180,
    timingPolicy:'software-frame-v1',frozenAt:'2026-10-17T00:00:00.000Z',
    feedbackMetrics:{hitRate:'Go 命中率',goMedianRtMs:'Go 正确反应中位时长'},
  },
} as const
export type SurveyCognitiveTemplate = keyof typeof SURVEY_COGNITIVE_PROTOCOLS
export function surveyCognitiveProtocol(key: string) {
  if (!Object.prototype.hasOwnProperty.call(SURVEY_COGNITIVE_PROTOCOLS,key)) throw new Error('Unknown controlled Survey cognitive protocol')
  return SURVEY_COGNITIVE_PROTOCOLS[key as SurveyCognitiveTemplate]
}
/** Exact compiled identities only. A published database config cannot add arbitrary execution. */
export function matchSurveyCognitiveProtocol(row:{testType:string;engineVersion:string;scoringVersion:string;configVersion:string;config:unknown}) {
  return Object.values(SURVEY_COGNITIVE_PROTOCOLS).find(protocol => protocol.testType===row.testType
    &&protocol.engineVersion===row.engineVersion&&protocol.scoringVersion===row.scoringVersion
    &&protocol.configVersion===row.configVersion&&canonicalHash(protocol.config)===canonicalHash(row.config))
}
export function surveyCognitiveTaskDefinition(key: SurveyCognitiveTemplate = SURVEY_COGNITIVE_TEMPLATE) {
  const protocol=surveyCognitiveProtocol(key)
  const definition=getCognitiveV2TaskDefinition(protocol.testType,protocol.engineVersion,protocol.scoringVersion)
  if(!definition)throw new Error('Controlled Survey cognitive runtime is unavailable')
  return {...definition,references:[]}
}
export function surveyCognitiveResultProtocol(result:{testType:string;configVersion:string;engineVersion:string;scoringVersion:string;timingPolicy:string}) {
  const protocol=Object.values(SURVEY_COGNITIVE_PROTOCOLS).find(p=>p.testType===result.testType
    &&p.configVersion===result.configVersion&&p.engineVersion===result.engineVersion
    &&p.scoringVersion===result.scoringVersion&&p.timingPolicy===result.timingPolicy)
  if(!protocol)throw new Error('Unknown stored Survey cognitive protocol')
  return protocol
}
