import {createHash} from 'node:crypto'
import {gunzipSync,inflateRawSync} from 'node:zlib'
import {TextDecoder} from 'node:util'
import {z} from 'zod'
import type {AuthoritativeScorerInput,TrialEnvelope} from '../../v2/types'
import {parseTrialEnvelope} from '../../v2/trial-envelope'
import {canonicalHash} from '../../../assessment-runtime/canonical'
import type {GradConfig,GradRaw} from './protocol'
import {gradRawSchema} from './schema'
import {scoreGrad,gradEnvelope} from './scorer'
import {GRAD_WIRE_KIND,GRAD_WIRE_VERSION,GRAD_WIRE_CODEC,GRAD_WIRE_MAX_DECODED_BYTES,GRAD_WIRE_MAX_BASE64_CHARS,GRAD_WIRE_MAX_PACKED_BYTES,gradWireCanonicalJson,type GradSubmission,type GradWire} from './wire-format'
export type {GradSubmission,GradWire} from './wire-format'
export const gradWireSchema=z.object({kind:z.literal(GRAD_WIRE_KIND),version:z.literal(GRAD_WIRE_VERSION),codec:z.literal(GRAD_WIRE_CODEC),decodedLength:z.number().int().min(1).max(GRAD_WIRE_MAX_DECODED_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),data:z.string().min(4).max(GRAD_WIRE_MAX_BASE64_CHARS)}).strict() satisfies z.ZodType<GradWire>
/** Preserve wire bytes through FINAL normalization; decompression belongs to the task-owned scorer wrapper. */
export const gradSubmissionSchema=z.union([gradRawSchema,gradWireSchema]) satisfies z.ZodType<GradSubmission>
export function decodeGradSubmission(value:unknown):GradRaw {
 const submission=gradSubmissionSchema.parse(value)
 if(!('kind' in submission))return submission
 if(submission.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(submission.data))throw Error('Grad wire base64 invalid')
 const packed=Buffer.from(submission.data,'base64')
 if(packed.length>GRAD_WIRE_MAX_PACKED_BYTES||packed.toString('base64')!==submission.data||packed.length<18)throw Error('Grad wire base64/size invalid')
 // This exact codec uses one gzip member with no optional header sections.
 if(packed[0]!==0x1f||packed[1]!==0x8b||packed[2]!==8||packed[3]!==0||packed.readUInt32LE(packed.length-4)!==submission.decodedLength)throw Error('Grad wire gzip header/length invalid')
 let plain:Buffer
 try{
  // Node's info result exposes consumed deflate bytes; reject concatenated members and trailing bytes.
  const framing=inflateRawSync(packed.subarray(10),{info:true,maxOutputLength:submission.decodedLength}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}}
  if(10+framing.engine.bytesWritten+8!==packed.length)throw Error('Grad wire must contain one gzip member')
  plain=gunzipSync(packed,{maxOutputLength:submission.decodedLength}) // verifies gzip CRC and trailer as well
 }catch{throw Error('Grad wire gzip invalid or decoded size exceeded')}
 if(plain.length!==submission.decodedLength||createHash('sha256').update(plain).digest('hex')!==submission.sha256)throw Error('Grad wire decoded length/hash mismatch')
 let decoded:unknown,text:string
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(plain);decoded=JSON.parse(text)}catch{throw Error('Grad wire JSON/UTF-8 invalid')}
 const raw=gradRawSchema.parse(decoded)
 if(!Buffer.from(gradWireCanonicalJson(raw),'utf8').equals(plain))throw Error('Grad wire JSON is not canonical')
 return raw
}
/** Existing formula and raw replay remain the sole scorer. No COS reads or report recalculation. */
export function scoreGradSubmission(input:AuthoritativeScorerInput<GradConfig,GradSubmission>){
 if(!Array.isArray(input.trials)||input.trials.length>1)throw Error('Grad wire trial budget exceeded')
 return scoreGrad({...input,trials:input.trials.map(value=>{const e=parseTrialEnvelope<GradSubmission>(value);return {...e,payload:decodeGradSubmission(e.payload)}})})
}
/** Registry archive adapter accepts either submission shape, but its raw envelope is always the original decoded raw. */
export const gradSubmissionEnvelope=(value:GradSubmission):TrialEnvelope<GradRaw>=>gradEnvelope(decodeGradSubmission(value))
export function gradCoreMatchesRaw(corePayload:unknown,originalRaw:unknown):boolean {
 try{return canonicalHash(decodeGradSubmission(corePayload))===canonicalHash(gradRawSchema.parse(originalRaw))}catch{return false}
}
