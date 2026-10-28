import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import type {GradRaw} from './generated/protocol'
import {gradEnvelope} from './generated/envelope'
import {GradTransportError} from './transport-error'
import {GRAD_WIRE_KIND,GRAD_WIRE_VERSION,GRAD_WIRE_CODEC,GRAD_WIRE_PACK_THRESHOLD,GRAD_WIRE_MAX_DECODED_BYTES,GRAD_WIRE_MAX_PACKED_BYTES,gradWireCanonicalJson,type GradSubmission} from './generated/wire-format'
export type GradSubmissionEnvelope=Omit<ReturnType<typeof gradEnvelope>,'payload'>&{payload:GradSubmission}
/** Native port freezes this exact envelope before append/FINAL and reuses it after retry or reload. */
export async function packGradEnvelope(raw:GradRaw):Promise<GradSubmissionEnvelope> {
 const plain=new TextEncoder().encode(gradWireCanonicalJson(raw))
 if(plain.byteLength<GRAD_WIRE_PACK_THRESHOLD)return gradEnvelope(raw)
 if(plain.byteLength>GRAD_WIRE_MAX_DECODED_BYTES)throw new GradTransportError('DECODED_LIMIT')
 if(typeof CompressionStream==='undefined')throw new GradTransportError('COMPRESSION_UNAVAILABLE')
 const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))
 const packed=new Uint8Array(await new Response(stream).arrayBuffer())
 if(packed.byteLength>GRAD_WIRE_MAX_PACKED_BYTES)throw new GradTransportError('PACKED_LIMIT')
 let binary='';for(let offset=0;offset<packed.length;offset+=0x8000)binary+=String.fromCharCode(...packed.subarray(offset,offset+0x8000))
 return {...gradEnvelope(raw),payload:{kind:GRAD_WIRE_KIND,version:GRAD_WIRE_VERSION,codec:GRAD_WIRE_CODEC,decodedLength:plain.byteLength,sha256:bytesToHex(sha256(plain)),data:btoa(binary)}}
}
