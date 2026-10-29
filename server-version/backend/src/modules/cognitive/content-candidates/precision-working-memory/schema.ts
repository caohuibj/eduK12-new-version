import {z} from 'zod'
import {assertSpatialConfig,type SpatialConfig,type SpatialRaw} from './protocol'
export const spatialConfigSchema=z.custom<SpatialConfig>(value=>{try{assertSpatialConfig(value);return true}catch{return false}})
const time=z.number().finite().nonnegative(),angle=z.number().finite().min(0).lt(360),colour=z.enum(['black','yellow','cyan','green','red']),input=z.enum(['touch','mouse','pen','keyboard'])
export const spatialTrialSchema=z.object({plan:z.object({index:z.number().int().min(0).max(399),phase:z.enum(['practice','test']),round:z.number().int().min(0).max(2),setSize:z.union([z.literal(1),z.literal(3),z.literal(5)]),targetColour:colour,
  items:z.array(z.object({colour,positionIndex:z.number().int().min(0).max(99),angleDeg:angle}).strict()).min(1).max(5),itiMs:z.number().int().min(950).max(1049),keyboardStartAngle:angle}).strict(),
  status:z.enum(['complete','interrupted']),stopReason:z.string().min(1).max(100).nullable(),startedAtPerfMs:time,encodingOnsetMs:time.nullable(),retentionOnsetMs:time.nullable(),responseOnsetMs:time.nullable(),endedAtPerfMs:time,
  warningAtMs:time.nullable(),signedErrorDeg:z.number().finite().min(-180).lt(180).nullable(),response:z.object({angleDeg:angle,x:z.number().finite(),y:z.number().finite(),rawX:z.number().finite().nullable(),rawY:z.number().finite().nullable(),input,
    firstSelectedAtMs:time,lastAdjustedAtMs:time,confirmedAtMs:time}).strict().nullable(),
  events:z.array(z.object({kind:z.enum(['select','release','keyboard','confirm']),atMs:time,angleDeg:angle,input}).strict()).max(256),eventOverflow:z.boolean()}).strict() satisfies z.ZodType<SpatialRaw>
