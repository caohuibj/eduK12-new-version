import {surveyCognitiveProfileDraftSchema,parseFrozenSurveyCognitiveProfile,surveyProfileTaskDefinition,type FrozenSurveyCognitiveProfile} from './cognitive-profile.definition'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compileCognitiveRuntime } from '../assessment-runtime/compiler'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import { createSessionConfigSnapshot,parseSessionConfigSnapshot } from '../cognitive/v2/session-snapshot'
import type { SessionConfigSnapshot } from '../cognitive/v2/types'

export const SURVEY_COGNITIVE_TEMPLATE='gonogo-software-frame-v1' as const
export const surveyCognitiveFeedbackSchema=z.object({
  policyVersion:z.literal('SURVEY_DESCRIPTIVE_V1').default('SURVEY_DESCRIPTIVE_V1'),
  mode:z.enum(['GENERAL','DESCRIPTIVE']).default('GENERAL'),
  metricKeys:z.array(z.enum(['hitRate','goMedianRtMs'])).max(2).default([]),
  release:z.enum(['AFTER_FINAL','AFTER_COLLECTION']).default('AFTER_FINAL'),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.metricKeys).size!==value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'反馈指标不能重复'})
  if(value.mode==='GENERAL'&&value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'一般反馈不披露个体指标'})
  if(value.mode==='DESCRIPTIVE'&&!value.metricKeys.length)
    ctx.addIssue({code:'custom',path:['metricKeys'],message:'描述性反馈至少选择一个获准指标'})
})
const legacyCognitiveDraftSchema=z.object({
  schemaVersion:z.literal(1),
  templateKey:z.literal(SURVEY_COGNITIVE_TEMPLATE),
  feedback:surveyCognitiveFeedbackSchema.default({policyVersion:'SURVEY_DESCRIPTIVE_V1',mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'}),
}).strict()
export type CognitiveDraft=z.infer<typeof legacyCognitiveDraftSchema>|z.infer<typeof surveyCognitiveProfileDraftSchema>
export const cognitiveDraftSchema:z.ZodType<CognitiveDraft>=z.discriminatedUnion('schemaVersion',[legacyCognitiveDraftSchema,surveyCognitiveProfileDraftSchema])
export const initialCognitiveDefinition=():CognitiveDraft=>cognitiveDraftSchema.parse({schemaVersion:1,templateKey:SURVEY_COGNITIVE_TEMPLATE})
export const validateCognitiveDraft=(_definition:CognitiveDraft,_forPreview:boolean):Array<{path:string;message:string;severity:'error'|'warning'}>=>[]
export type FrozenSurveyCognitive=FrozenSurveyLegacyCognitive|FrozenSurveyCognitiveProfile
export interface FrozenSurveyLegacyCognitive {
  schemaVersion:1
  templateKey:typeof SURVEY_COGNITIVE_TEMPLATE
  sessionSnapshot:SessionConfigSnapshot
  measurementDigest:string
  timingPolicy:'software-frame-v1'
  devicePolicy:'DESKTOP_KEYBOARD'
  restartLimit:1
  maturity:'PILOT'
  referenceMode:'none'
  partialRetentionDays:30
  feedback:z.infer<typeof surveyCognitiveFeedbackSchema>
}
// This is a fixed, versioned Survey template, not an editable task configuration.
// Its existing runner selects software-frame-v1 only for this exact config identity.
export const SURVEY_GONOGO_CONFIG={totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,
  validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none' as const}}
export const surveyCognitiveTaskDefinition=(frozen?:FrozenSurveyCognitive)=>{
  if(frozen?.schemaVersion===2)return surveyProfileTaskDefinition(frozen.artifact)
  const definition=getCognitiveV2TaskDefinition('gonogo','1.0.0','1.0.0')
  if(!definition)throw new Error('Survey Go/No-Go runtime is unavailable')
  // No catalog norms are admitted into this expressly non-normative pilot.
  return {...definition,references:[]}
}
export function compileResearchCognitive(input:unknown):FrozenSurveyLegacyCognitive{
  const draft=legacyCognitiveDraftSchema.parse(input)
  const definition=surveyCognitiveTaskDefinition()
  const compiledRuntime=compileCognitiveRuntime({definition,instrumentVersion:'1.0.0'})
  const sessionSnapshot=createSessionConfigSnapshot({definition,configVersion:'1.1.0',
    config:SURVEY_GONOGO_CONFIG,
    // Stable template release time: actual publication/admission times are stored separately.
    frozenAt:new Date('2026-10-17T00:00:00.000Z'),
    runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime,referenceBindings:[]}})
  const measurement={schemaVersion:1 as const,templateKey:draft.templateKey,sessionSnapshot,
    timingPolicy:'software-frame-v1' as const,devicePolicy:'DESKTOP_KEYBOARD' as const,
    restartLimit:1 as const,maturity:'PILOT' as const,referenceMode:'none' as const,
    partialRetentionDays:30 as const}
  return {...measurement,measurementDigest:canonicalHash(measurement),feedback:draft.feedback}
}
export function parseFrozenSurveyCognitive(value:unknown):FrozenSurveyCognitive{
  if(value&&typeof value==='object'&&(value as {schemaVersion?:number}).schemaVersion===2)return parseFrozenSurveyCognitiveProfile(value)
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid frozen cognitive template')
  const frozen=value as FrozenSurveyLegacyCognitive
  const {measurementDigest,feedback,...measurement}=frozen
  cognitiveDraftSchema.parse({schemaVersion:frozen.schemaVersion,templateKey:frozen.templateKey,feedback})
  const snapshot=parseSessionConfigSnapshot(frozen.sessionSnapshot)
  if(canonicalHash(measurement)!==measurementDigest||snapshot.testType!=='gonogo'
    ||snapshot.configVersion!=='1.1.0'||snapshot.engineVersion!=='1.0.0'||snapshot.scoringVersion!=='1.0.0'
    ||canonicalHash(snapshot.config)!==canonicalHash(SURVEY_GONOGO_CONFIG)
    ||frozen.timingPolicy!=='software-frame-v1'||frozen.devicePolicy!=='DESKTOP_KEYBOARD'
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
  resultId:z.string().guid(),resultHash:z.string().regex(/^[a-f0-9]{64}$/),
  measurementDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type SurveyCognitiveReference=z.infer<typeof surveyCognitiveReferenceSchema>
