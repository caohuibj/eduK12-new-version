import {z} from 'zod'
import {assertNumberSeriesConfig,type NumberSeriesConfig,type NumberSeriesRaw} from './protocol'
const time=z.number().finite().nonnegative(),input=z.enum(['touch','mouse','pen','keyboard','assistive'])
export const numberSeriesConfigValidator=z.custom<NumberSeriesConfig>(value=>{try{assertNumberSeriesConfig(value);return true}catch{return false}})
export const numberSeriesRawValidator=z.object({
  plan:z.object({index:z.number().int().min(0).max(23),phase:z.enum(['practice','test']),round:z.number().int().min(0).max(2),blockIndex:z.number().int().min(0).max(3),itemId:z.string().min(1).max(64),family:z.enum(['addition','multiplication','growing-gap']),known:z.array(z.number().int().min(1).max(200)).length(4),options:z.array(z.number().int().min(1).max(200)).length(4),correctIndex:z.number().int().min(0).max(3),answer:z.number().int().min(1).max(200)}).strict(),
  startedAtPerfMs:time,endedAtPerfMs:time,status:z.enum(['answered','skipped','interrupted']),response:z.number().int().min(0).max(3).nullable(),rtMs:time.nullable(),input:input.nullable(),stopReason:z.string().min(1).max(96).nullable(),
  events:z.array(z.discriminatedUnion('kind',[
    z.object({kind:z.literal('answer'),atMs:time,choice:z.number().int().min(0).max(3),input,key:z.string().min(1).max(40).nullable()}).strict(),
    z.object({kind:z.literal('skip'),atMs:time,input}).strict(),
    z.object({kind:z.literal('interrupt'),atMs:time,reason:z.string().min(1).max(96)}).strict(),
  ])).length(1),ignoredRepeatCount:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict() satisfies z.ZodType<NumberSeriesRaw>
