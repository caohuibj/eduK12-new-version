import {z} from 'zod'
import {assertConfig,type Config,type Raw} from './protocol'
const time=z.number().finite().nonnegative(),location=z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3)])
export const configValidator=z.custom<Config>(v=>{try{assertConfig(v);return true}catch{return false}})
export const rawValidator=z.object({
  plan:z.object({index:z.number().int().min(0).max(419),phase:z.enum(['practice','test']),round:z.number().int().min(0).max(2),run:z.number().int().min(0).max(4),position:z.number().int().min(0).max(83),sequenceVariant:z.union([z.literal(0),z.literal(1)]),source:z.enum(['R','S']),condition:z.enum(['R','S','tail']),target:location}).strict(),
  startedAtPerfMs:time,endedAtPerfMs:time,status:z.enum(['completed','interrupted']),firstLocation:location.nullable(),firstRtMs:time.nullable(),firstCorrect:z.boolean().nullable(),correctAtMs:time.nullable(),ignoredInputCount:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  events:z.array(z.discriminatedUnion('kind',[z.object({kind:z.literal('tap'),atMs:time,location,input:z.literal('touch')}).strict(),z.object({kind:z.literal('interrupt'),atMs:time,reason:z.string().min(1).max(96)}).strict()])).min(1).max(2049),
}).strict() satisfies z.ZodType<Raw>
