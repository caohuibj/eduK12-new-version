import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compileCognitiveRuntime } from '../assessment-runtime/compiler'
import { createSessionConfigSnapshot,parseSessionConfigSnapshot } from '../cognitive/v2/session-snapshot'
import type { SessionConfigSnapshot } from '../cognitive/v2/types'

import { SURVEY_COGNITIVE_TEMPLATE, SURVEY_SIMON_TEMPLATE, surveyCognitiveProtocol, surveyCognitiveTaskDefinition, type SurveyCognitiveTemplate } from './cognitive.protocols'
export { SURVEY_COGNITIVE_TEMPLATE, SURVEY_GONOGO_CONFIG, surveyCognitiveTaskDefinition } from './cognitive.protocols'
export const surveyCognitiveFeedbackSchema=z.object({
  policyVersion:z.literal('SURVEY_DESCRIPTIVE_V1').default('SURVEY_DESCRIPTIVE_V1'),
  mode:z.enum(['GENERAL','DESCRIPTIVE']).default('GENERAL'),
  metricKeys:z.array(z.enum(['hitRate','goMedianRtMs','accuracy','simonEffectMeanMs'])).max(2).default([]),
  release:z.enum(['AFTER_FINAL','AFTER_COLLECTION']).default('AFTER_FINAL'),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.metricKeys).size!==value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'反馈指标不能重复'})
  if(value.mode==='GENERAL'&&value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'一般反馈不披露个体指标'})
  if(value.mode==='DESCRIPTIVE'&&!value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'描述性反馈至少选择一个获准指标'})
})
export const cognitiveDraftSchema=z.object({
  schemaVersion:z.literal(1),
  templateKey:z.enum([SURVEY_COGNITIVE_TEMPLATE,SURVEY_SIMON_TEMPLATE]),
  feedback:surveyCognitiveFeedbackSchema.default({policyVersion:'SURVEY_DESCRIPTIVE_V1',mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'}),
}).strict().superRefine((draft,ctx)=>{
  const protocol=surveyCognitiveProtocol(draft.templateKey)
  if(draft.feedback.metricKeys.some(key=>!Object.prototype.hasOwnProperty.call(protocol.feedbackMetrics,key)))
    ctx.addIssue({code:'custom',path:['feedback','metricKeys'],message:'反馈指标不属于当前冻结认知协议'})
})
export type CognitiveDraft=z.infer<typeof cognitiveDraftSchema>
export const initialCognitiveDefinition=():CognitiveDraft=>cognitiveDraftSchema.parse({schemaVersion:1,templateKey:SURVEY_COGNITIVE_TEMPLATE})
export const validateCognitiveDraft=(_definition:CognitiveDraft,_forPreview:boolean):Array<{path:string;message:string;severity:'error'|'warning'}>=>[]
export interface FrozenSurveyCognitive {
  schemaVersion:1
  templateKey:SurveyCognitiveTemplate
  sessionSnapshot:SessionConfigSnapshot
  measurementDigest:string
  timingPolicy:'software-frame-v1'|'simon-software-frame-v1'
  devicePolicy:'DESKTOP_KEYBOARD'
  restartLimit:1
  maturity:'PILOT'
  referenceMode:'none'
  partialRetentionDays:30
  feedback:CognitiveDraft['feedback']
}
export function compileResearchCognitive(input:unknown):FrozenSurveyCognitive{
  const draft=cognitiveDraftSchema.parse(input)
  const protocol=surveyCognitiveProtocol(draft.templateKey)
  const definition=surveyCognitiveTaskDefinition(draft.templateKey)
  const compiledRuntime=compileCognitiveRuntime({definition,instrumentVersion:'1.0.0'})
  const sessionSnapshot=createSessionConfigSnapshot({definition,configVersion:protocol.configVersion,
    config:protocol.config,
    // Stable template release time: actual publication/admission times are stored separately.
    frozenAt:new Date(protocol.frozenAt),
    runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime,referenceBindings:[]}})
  const measurement={schemaVersion:1 as const,templateKey:draft.templateKey,sessionSnapshot,
    timingPolicy:protocol.timingPolicy,devicePolicy:'DESKTOP_KEYBOARD' as const,
    restartLimit:1 as const,maturity:'PILOT' as const,referenceMode:'none' as const,
    partialRetentionDays:30 as const}
  return {...measurement,measurementDigest:canonicalHash(measurement),feedback:draft.feedback}
}
export function parseFrozenSurveyCognitive(value:unknown):FrozenSurveyCognitive{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid frozen cognitive template')
  const frozen=value as FrozenSurveyCognitive
  const {measurementDigest,feedback,...measurement}=frozen
  cognitiveDraftSchema.parse({schemaVersion:frozen.schemaVersion,templateKey:frozen.templateKey,feedback})
  const snapshot=parseSessionConfigSnapshot(frozen.sessionSnapshot)
  const protocol=surveyCognitiveProtocol(frozen.templateKey)
  if(canonicalHash(measurement)!==measurementDigest||snapshot.testType!==protocol.testType
    ||snapshot.configVersion!==protocol.configVersion||snapshot.engineVersion!==protocol.engineVersion||snapshot.scoringVersion!==protocol.scoringVersion
    ||canonicalHash(snapshot.config)!==canonicalHash(protocol.config)
    ||frozen.timingPolicy!==protocol.timingPolicy||frozen.devicePolicy!=='DESKTOP_KEYBOARD'
    ||frozen.restartLimit!==1||frozen.maturity!=='PILOT'||frozen.referenceMode!=='none'
    ||frozen.partialRetentionDays!==30||snapshot.referenceBindings?.length!==0)
    throw new Error('Frozen Survey cognitive measurement identity mismatch')
  return frozen
}
export function previewCognitiveDraft(input:unknown){
  const draft=cognitiveDraftSchema.parse(input),compiled=compileResearchCognitive(draft)
  return {ok:true,kind:'COGNITIVE' as const,compiledDefinition:compiled,cognitivePreview:compiled.sessionSnapshot,
    definitionDigest:canonicalHash({kind:'COGNITIVE',definition:draft}),
    scoringDigest:compiled.measurementDigest,score:null,issues:[],participantReport:'GENERAL_ONLY' as const}
}
export const surveyCognitiveReferenceSchema=z.object({
  slotKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),epoch:z.number().int().min(1).max(2),
  resultId:z.string().uuid(),resultHash:z.string().regex(/^[a-f0-9]{64}$/),
  measurementDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type SurveyCognitiveReference=z.infer<typeof surveyCognitiveReferenceSchema>
