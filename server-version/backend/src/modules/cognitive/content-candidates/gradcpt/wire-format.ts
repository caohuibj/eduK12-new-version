import type {GradRaw} from './protocol'
export const GRAD_WIRE_KIND='GRADCPT_RAW_WIRE' as const
export const GRAD_WIRE_VERSION=1 as const
export const GRAD_WIRE_CODEC='gzip-canonical-json-v1' as const
export const GRAD_WIRE_PACK_THRESHOLD=1024*1024
export const GRAD_WIRE_MAX_DECODED_BYTES=8*1024*1024
/** Leave 64KiB for the envelope and existing FINAL metadata within the 1536KiB budget. */
export const GRAD_WIRE_MAX_BASE64_CHARS=1472*1024
export const GRAD_WIRE_MAX_PACKED_BYTES=GRAD_WIRE_MAX_BASE64_CHARS/4*3
export interface GradWire {kind:typeof GRAD_WIRE_KIND;version:typeof GRAD_WIRE_VERSION;codec:typeof GRAD_WIRE_CODEC;decodedLength:number;sha256:string;data:string}
export type GradSubmission=GradRaw|GradWire
/** Same finite, plain-object, lexical-key canonical JSON semantics as the existing FINAL canonicalizer. */
export function gradWireCanonicalJson(value:unknown):string {
 const active=new WeakSet<object>()
 const normalize=(v:unknown):unknown=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return v
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Grad wire requires finite numbers');return Object.is(v,-0)?0:v}
  if(!v||typeof v!=='object'||active.has(v))throw Error('Grad wire requires finite JSON')
  const proto=Object.getPrototypeOf(v);if(!Array.isArray(v)&&proto!==Object.prototype&&proto!==null)throw Error('Grad wire requires plain JSON objects')
  if(Object.getOwnPropertySymbols(v).length)throw Error('Grad wire does not accept symbol keys')
  active.add(v);try{return Array.isArray(v)?v.map(normalize):Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize((v as Record<string,unknown>)[k])]))}finally{active.delete(v)}
 }
 return JSON.stringify(normalize(value))
}
