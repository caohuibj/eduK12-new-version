import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
function sorted(value:unknown):unknown {if(Array.isArray(value))return value.map(sorted)
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,sorted(v)]))
 return value}
/** Candidate port digest, computed in preparation/local-save microtasks, never during a paint callback. */
export function sealDigest(value:unknown){return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(sorted(value)))))}
