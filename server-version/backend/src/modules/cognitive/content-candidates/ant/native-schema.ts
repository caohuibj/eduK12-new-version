import {z} from 'zod'
import {canonicalHash} from '../../../assessment-runtime/canonical'
import {antTrialSchema} from './schema'
import {ANT_PRACTICE_POLICY,antCaptureTiming,type AntConfig} from './protocol'
import {antNativeGeometry,ANT_NATIVE_GEOMETRY_VERSION,type AntNativeRawRecord} from './native-protocol'
const positive=z.number().finite().positive(),time=z.number().finite().nonnegative(),hash=z.string().regex(/^[a-f0-9]{64}$/)
const geometry=z.object({fieldWidthCssPx:positive,fieldHeightCssPx:positive,eccentricityCssPx:positive,arrowWidthCssPx:positive,arrowHeightCssPx:positive,arrowSpacingCssPx:positive,cueDiameterCssPx:positive,strokeCssPx:positive,responseWidthCssPx:positive,responseHeightCssPx:positive,responseGapCssPx:positive}).strict()
export const antNativeDisplaySchema=z.object({schemaVersion:z.literal(1),calibrationId:z.string().min(1).max(512),geometryVersion:z.literal(ANT_NATIVE_GEOMETRY_VERSION),geometryHash:hash,configHash:hash,protocolSignature:hash,origin:z.literal('host_physical_calibration'),referenceMm:z.literal(50),referenceCssPx:z.number().min(50).max(360),viewingDistanceMm:z.number().min(100).max(2000),viewport:z.object({width:positive,height:positive,devicePixelRatio:positive,visualScale:positive}).strict(),geometry,inputMap:z.object({leftKey:z.literal('ArrowLeft'),rightKey:z.literal('ArrowRight')}).strict()}).strict().superRefine((d,ctx)=>{
 if(canonicalHash(d.geometry)!==canonicalHash(antNativeGeometry(d.referenceCssPx,d.viewingDistanceMm))||d.geometryHash!==canonicalHash({geometryVersion:d.geometryVersion,geometry:d.geometry,inputMap:d.inputMap}))ctx.addIssue({code:'custom',message:'ANT measured geometry binding mismatch'})
 if(d.geometry.fieldWidthCssPx>d.viewport.width-28||d.geometry.fieldHeightCssPx+d.geometry.responseHeightCssPx+80>d.viewport.height||d.geometry.responseWidthCssPx*2+d.geometry.responseGapCssPx>d.viewport.width-28)ctx.addIssue({code:'custom',message:'ANT frozen geometry does not fit'})
})
const core=antTrialSchema.extend({phase:z.enum(['practice','test'])}).omit({presentationBinding:true})
export const antNativeRecordSchema=z.object({schemaVersion:z.literal(1),contextId:z.string().min(1).max(512),phase:z.enum(['practice','test']),key:z.string().min(1).max(100),core,
 raw:z.object({display:antNativeDisplaySchema,frameTimesPerfMs:z.array(time).max(1024),frameOverflow:z.boolean(),diagnostics:z.array(z.object({kind:z.string().min(1).max(100),observedAtPerfMs:time,markerAtPerfMs:time}).strict()).max(32),fixture:z.literal(false),practice:z.object({policyVersion:z.literal(ANT_PRACTICE_POLICY.version),round:z.number().int().min(0).max(2),timing:z.object({cueMs:positive,postCueMs:positive,responseWindowMs:positive,trialIntervalMs:positive}).strict()}).strict().optional()}).strict()}).strict().superRefine((r,ctx)=>{
 if(r.phase!==r.core.phase||r.core.recordOrigin!=='live'||r.key!==(r.phase==='test'?`test:${r.core.trialIndex}`:`practice:${r.raw.practice?.round}:${r.core.trialIndex}`))ctx.addIssue({code:'custom',message:'ANT original record identity mismatch'})
})
export function parseAntNativeRecord(value:unknown,config:AntConfig):AntNativeRawRecord{
 const r=antNativeRecordSchema.parse(value)
 if(r.phase==='practice'&&(!r.raw.practice||canonicalHash(r.raw.practice.timing)!==canonicalHash(antCaptureTiming(config,'practice'))))throw Error('ANT practice timing mismatch')
 if(r.phase==='test'&&r.raw.practice)throw Error('ANT unexpected practice binding')
 return r as AntNativeRawRecord
}
