import {z} from 'zod'
import {assertEffortConfig,type EffortConfig,type EffortRaw} from './protocol'
export const effortConfigSchema=z.custom<EffortConfig>(v=>{try{assertEffortConfig(v);return true}catch{return false}})
const time=z.number().finite().nonnegative(),side=z.enum(['left','right']),input=z.enum(['touch','mouse','pen','keyboard'])
const choice=z.object({side,input,key:z.string().max(60).nullable(),downAtMs:time,upAtMs:time}).strict()
const onset=z.object({iti:time,probability:time.nullable(),frame:time.nullable(),offers:time.nullable(),choice:time.nullable(),prepare:time.nullable(),execution:time.nullable(),feedback:time.nullable(),cumulative:time.nullable()}).strict()
export const effortTrialSchema=z.object({plan:z.object({index:z.number().int().min(0).max(71),phase:z.enum(['test','practice']),round:z.number().int().min(0).max(2),conditionKey:z.string().min(1).max(60),
 highGoal:z.union([z.literal(10),z.literal(50),z.literal(100),z.literal(200)]),highReward:z.union([z.literal(2),z.literal(3),z.literal(5),z.literal(7)]),probability:z.union([z.literal(1),z.literal(0.5)]),highSide:side,rewardAvailable:z.boolean(),lowGoal:z.union([z.literal(5),z.literal(20)]),lowReward:z.literal(1),executionMs:z.union([z.literal(5000),z.literal(25000)]),forced:z.enum(['low','high']).nullable()}).strict(),
 status:z.enum(['complete','interrupted']),stopReason:z.string().min(1).max(100).nullable(),startedAtPerfMs:time,endedAtPerfMs:time,onsets:onset,choiceEndMs:time.nullable(),choice:choice.nullable(),choiceOutcome:z.enum(['selected','no_response']).nullable(),
 executionEndMs:time.nullable(),executionResult:z.enum(['target_reached','window_elapsed']).nullable(),presses:z.array(choice).max(2048),reward:z.number().finite().nonnegative().nullable(),
 ignored:z.object({early:z.number().int().nonnegative(),held:z.number().int().nonnegative(),wrongSide:z.number().int().nonnegative(),late:z.number().int().nonnegative(),multiplePointer:z.number().int().nonnegative()}).strict(),eventOverflow:z.boolean()}).strict() satisfies z.ZodType<EffortRaw>
