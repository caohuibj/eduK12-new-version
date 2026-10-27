import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { AntRawRecord } from './capture'
function canonical(value:unknown):string {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value)
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}'
  throw Error('ANT sealed data must be finite canonical JSON')
}
/** Used only on the async local-save/final path, never in capture.tick/paint. */
export const antDigest=(value:unknown):string=>bytesToHex(sha256(new TextEncoder().encode(canonical(value))))
export const antRecordDigest=(record:AntRawRecord):string=>antDigest(record)
export const freezeAntValue=<T>(value:T):T=>{
  if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value as Record<string,unknown>))freezeAntValue(child)}
  return value
}
