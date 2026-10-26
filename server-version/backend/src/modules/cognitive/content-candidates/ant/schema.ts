import { z } from 'zod'
import { CUES,FLANKERS,INPUTS,antConfig,type AntConfig,type AntTrial } from './protocol'
const time=z.number().finite().nonnegative()
export const antConfigSchema=z.object({
  profile:z.enum(['research','experience']),totalTrials:z.union([z.literal(288),z.literal(48)]),
  blocks:z.union([z.literal(3),z.literal(1)]),repetitionsPerCellPerBlock:z.union([z.literal(2),z.literal(1)]),
  practiceTrials:z.literal(24),cueMs:z.literal(100),postCueMs:z.literal(400),responseWindowMs:z.literal(1700),
  trialIntervalMs:z.literal(4000),preCueMinMs:z.literal(400),preCueMaxExclusiveMs:z.literal(1600),
  neutralVariant:z.enum(['absent','dashes']),phaseToleranceMs:z.literal(20),
}).strict().superRefine((v,ctx)=>{
  const expected=antConfig(v.profile,v.neutralVariant)
  for(const key of ['totalTrials','blocks','repetitionsPerCellPerBlock'] as const)
    if(v[key]!==expected[key])ctx.addIssue({code:'custom',path:[key],message:'ANT profile condition counts disagree'})
})
export const antTrialSchema=z.object({
  phase:z.literal('test'),trialIndex:z.number().int().min(0).max(287),blockIndex:z.number().int().min(0).max(2),
  cue:z.enum(CUES),location:z.enum(['top','bottom']),direction:z.enum(['left','right']),flanker:z.enum(FLANKERS),
  neutralVariant:z.enum(['absent','dashes']),plannedPreCueMs:z.number().int().min(400).max(1599),
  recordOrigin:z.enum(['live','recovered_without_timing']),
  clock:z.object({source:z.literal('performance'),timeOriginUnixMs:time.nullable()}).strict(),
  startedAtPerfMs:time,cueOnsetPerfMs:time.nullable(),cueOffsetPerfMs:time.nullable(),
  targetOnsetPerfMs:time.nullable(),targetOffsetPerfMs:time.nullable(),endedAtPerfMs:time,
  events:z.array(z.object({direction:z.enum(['left','right']),input:z.enum(INPUTS),atPerfMs:time,
    repeat:z.boolean(),held:z.boolean()}).strict()).max(32),
  responseIndex:z.number().int().min(0).max(31).nullable(),timedOut:z.boolean(),eventOverflow:z.boolean(),
  interruptions:z.array(z.object({kind:z.enum(['visibility_lost','window_blur','viewport_changed',
    'render_failed','clock_discontinuity','runner_restart']),atPerfMs:time}).strict()).max(32),
}).strict()
export const parseAntConfig=(value:unknown):AntConfig=>antConfigSchema.parse(value) as AntConfig
export const parseAntTrial=(value:unknown):AntTrial=>antTrialSchema.parse(value) as AntTrial
