import {z} from 'zod'
import {assertGradConfig,type GradConfig,type GradRaw} from './protocol'
export const gradConfigSchema=z.custom<GradConfig>(v=>{try{assertGradConfig(v);return true}catch{return false}})
const time=z.number().finite().nonnegative(),index=z.number().int().min(0).max(301),frame={atMs:time,slotIndex:index,opacity:z.number().min(0).max(1)}
export const gradRawSchema=z.object({plan:z.array(z.object({index,image:z.string().max(30),kind:z.enum(['city','mountain','boundary']),durationMs:z.union([z.literal(800),z.literal(1600)])}).strict()).min(3).max(302),
 startedAtPerfMs:time,endedAtPerfMs:time,status:z.enum(['complete','interrupted']),stopReason:z.string().min(1).max(100).nullable(),slots:z.array(z.object({index,startMs:time,endMs:time.nullable()}).strict()).min(1).max(302),
 frames:z.array(z.object(frame).strict()).min(1).max(120000),events:z.array(z.object({...frame,type:z.enum(['down','up']),token:z.string().min(1).max(60),input:z.enum(['touch','mouse','pen','keyboard']),repeat:z.boolean(),primary:z.boolean()}).strict()).max(8192),overflow:z.boolean()}).strict() satisfies z.ZodType<GradRaw>
