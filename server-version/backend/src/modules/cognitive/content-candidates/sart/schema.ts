import {z} from 'zod'
import {assertSartConfig,type SartConfig,type SartRaw} from './protocol'
export const sartConfigSchema=z.custom<SartConfig>(v=>{try{assertSartConfig(v);return true}catch{return false}})
const time=z.number().finite().nonnegative(),token=z.string().min(1).max(80)
export const sartRawSchema=z.object({plan:z.object({index:z.number().int().min(0).max(224),phase:z.enum(['test','practice']),round:z.number().int().min(0).max(2),digit:z.number().int().min(1).max(9),fontPx:z.number().int().min(32).max(80),digitMs:z.union([z.literal(250),z.literal(400)]),maskMs:z.union([z.literal(900),z.literal(1400)])}).strict(),
  onsetMs:time,endedAtMs:time,status:z.enum(['complete','interrupted']),stopReason:z.string().min(1).max(100).nullable(),heldBefore:z.array(token).max(16),
  events:z.array(z.discriminatedUnion('kind',[z.object({kind:z.literal('mask'),atMs:time}).strict(),z.object({kind:z.enum(['down','up']),atMs:time,token,input:z.enum(['touch','mouse','pen','keyboard']),repeat:z.boolean()}).strict()])).max(128),ignoredRepeats:z.number().int().nonnegative(),overflow:z.boolean()}).strict() satisfies z.ZodType<SartRaw>
