import { z } from 'zod'
import { motConfig, type MotConfig, type MotTrial } from './protocol'

const point = { x: z.number().finite().min(0).max(12), y: z.number().finite().min(0).max(12) }
const time = z.number().finite().nonnegative()
const object = z.object({ id: z.number().int().min(0).max(9), ...point,
  vx: z.number().finite().min(-8).max(8), vy: z.number().finite().min(-8).max(8) }).strict()
export const motConfigSchema = z.object({
  profile: z.enum(['research','experience']), totalTrials: z.union([z.literal(45),z.literal(9)]),
  blocks: z.union([z.literal(3),z.literal(1)]),
  repetitionsPerSpeedPerBlock: z.union([z.literal(5),z.literal(3)]),
  fieldDeg: z.literal(12), objectDiameterDeg: z.literal(1.2),
  objectCount: z.literal(10), targetCount: z.literal(5),
  fixationMs: z.literal(500), cueMs: z.literal(1000), motionMs: z.literal(8000), postMotionMs: z.literal(500),
  maxFrameGapMs: z.literal(50), durationToleranceMs: z.literal(50), minimumMotionFrames: z.literal(200),
}).strict().superRefine((value,ctx) => {
  const expected = motConfig(value.profile)
  for (const key of ['totalTrials','blocks','repetitionsPerSpeedPerBlock'] as const)
    if (value[key] !== expected[key]) ctx.addIssue({code:'custom',path:[key],message:'Profile counts must match the frozen MOT protocol'})
})
export const motTrialSchema = z.object({
  recordOrigin:z.enum(['live','recovered_without_timing']),
  phase: z.literal('test'), trialIndex: z.number().int().min(0).max(44),
  blockIndex: z.number().int().min(0).max(2), speed: z.union([z.literal(1),z.literal(4),z.literal(8)]),
  targetIds: z.array(z.number().int().min(0).max(9)).length(5),
  initialObjects: z.array(object).length(10),
  startedAtPerfMs: time, cueStartedAtPerfMs: time.nullable(),
  motionStartedAtPerfMs: time.nullable(), motionEndedAtPerfMs: time.nullable(),
  responseStartedAtPerfMs: time.nullable(), endedAtPerfMs: time, completionTimeMs: time,
  frameTiming: z.object({source:z.literal('client_reported'),frameCount:z.number().int().min(0).max(3000),
    firstMs:time.nullable(),lastMs:time.nullable(),maxGapMs:time.nullable(),
    strictlyIncreasing:z.boolean(),overflow:z.boolean()}).strict().superRefine((v,ctx)=>{
      const empty=v.frameCount===0
      if (empty !== (v.firstMs===null) || empty !== (v.lastMs===null)
        || (v.frameCount<2) !== (v.maxGapMs===null)
        || (v.firstMs!==null && v.lastMs!==null && v.lastMs<v.firstMs)
        || (v.frameCount>1 && v.maxGapMs!==null && v.firstMs!==null && v.lastMs!==null
          && (v.maxGapMs>v.lastMs-v.firstMs+1e-6 || v.maxGapMs+1e-6<(v.lastMs-v.firstMs)/(v.frameCount-1))))
        ctx.addIssue({code:'custom',message:'Inconsistent client-reported frame summary'})
    }),
  calibration: z.object({version:z.literal(1),method:z.literal('ruler_and_distance_self_reported'),
    referenceMm:z.literal(50),referenceCssPx:z.number().finite().min(50).max(2000),
    viewingDistanceMm:z.number().finite().min(100).max(2000),
    viewportWidthCssPx:z.number().finite().positive(),viewportHeightCssPx:z.number().finite().positive(),
    devicePixelRatio:z.number().finite().positive(),visualViewportScale:z.number().finite().positive(),
    language:z.enum(['zh','en'])}).strict(),
  responses: z.array(z.object({ objectId:z.number().int().min(0).max(9),...point,
    atPerfMs:time,input:z.enum(['touch','pointer','keyboard']) }).strict()).max(5),
  prematureInputs: z.number().int().nonnegative(), missedInputs: z.number().int().nonnegative(),
  ambiguousInputs: z.number().int().nonnegative(),
  interactionEvents:z.array(z.object({type:z.enum(['premature','miss','ambiguous','interruption']),atPerfMs:time,input:z.enum(['touch','pointer','keyboard']).nullable()}).strict()).max(128),
  interactionOverflow:z.boolean(),
  interruptions: z.array(z.enum(['visibility_lost','window_blur','viewport_changed','runner_restart'])).max(30),
  timedOut: z.boolean(),
}).strict()
export function parseMotConfig(value: unknown): MotConfig { return motConfigSchema.parse(value) as MotConfig }
export function parseMotTrial(value: unknown): MotTrial { return motTrialSchema.parse(value) as MotTrial }
