import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {describe,expect,it} from 'vitest'
import {scoreGrad,gradEnvelope} from '../../modules/cognitive/content-candidates/gradcpt/scorer'
import {decodeGradSubmission,gradSubmissionSchema,gradSubmissionEnvelope,gradCoreMatchesRaw,scoreGradSubmission} from '../../modules/cognitive/content-candidates/gradcpt/wire'
import {GRAD_WIRE_KIND,GRAD_WIRE_VERSION,GRAD_WIRE_CODEC,GRAD_WIRE_MAX_DECODED_BYTES,gradWireCanonicalJson,type GradWire} from '../../modules/cognitive/content-candidates/gradcpt/wire-format'
const root=resolve(__dirname,'../../../../..'),source=JSON.parse(readFileSync(resolve(root,'docs/cognitive-library/onboarding-content-20261028/batch-2/evidence/report-raw-inputs.json'),'utf8')).inputs.grad.limited,raw=source.trials[0].payload
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex')
function fromText(text:Buffer):GradWire{return {kind:GRAD_WIRE_KIND,version:GRAD_WIRE_VERSION,codec:GRAD_WIRE_CODEC,decodedLength:text.length,sha256:sha(text),data:gzipSync(text).toString('base64')}}
const wire=()=>fromText(Buffer.from(gradWireCanonicalJson(raw)))
describe('GradCPT task-owned lossless transport',()=>{
 it('keeps old raw and new wire equivalent on one existing representative prefix, without changing raw or scoring formulas',()=>{
  const encoded=wire();expect(gradSubmissionSchema.parse(encoded)).toEqual(encoded)
  expect(decodeGradSubmission(encoded)).toEqual(raw);expect(decodeGradSubmission(raw)).toEqual(raw)
  expect(gradSubmissionEnvelope(encoded)).toEqual(gradEnvelope(raw))
  expect(scoreGradSubmission({...source,trials:[{...source.trials[0],payload:encoded}]})).toEqual(scoreGrad(source))
  expect(gradCoreMatchesRaw(encoded,raw)).toBe(true);expect(gradCoreMatchesRaw(raw,raw)).toBe(true)
  expect(gradCoreMatchesRaw(encoded,{...raw,endedAtPerfMs:raw.endedAtPerfMs+1})).toBe(false)
 })
 it('rejects unknown fields/versions, malformed and noncanonical base64, gzip header, truncation, CRC and concatenated members',()=>{
  const good=wire(),packed=Buffer.from(good.data,'base64'),header=Buffer.from(packed),crc=Buffer.from(packed);header[3]=8;crc[crc.length-8]^=1
  const bad=[{...good,version:2},{...good,extra:true},{...good,data:good.data+'\n'},{...good,data:'%%%%'},{...good,data:'AB=='},{...good,data:header.toString('base64')},{...good,data:packed.subarray(0,packed.length-1).toString('base64')},{...good,data:crc.toString('base64')},{...good,data:Buffer.concat([gzipSync(Buffer.alloc(0)),packed]).toString('base64')},{...good,data:Buffer.concat([packed,Buffer.from([0])]).toString('base64')}]
  for(const value of bad)expect(()=>decodeGradSubmission(value)).toThrow()
 })
 it('rejects false decoded lengths/hashes, noncanonical JSON, invalid UTF-8 and wrong raw schema',()=>{
  const good=wire(),bad=[{...good,decodedLength:good.decodedLength+1},{...good,sha256:'0'.repeat(64)},fromText(Buffer.from(JSON.stringify(raw))),fromText(Buffer.from([0xff])),fromText(Buffer.from('{}')),fromText(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(gradWireCanonicalJson(raw))]))]
  for(const value of bad)expect(()=>decodeGradSubmission(value)).toThrow()
 })
 it('bounds decoded expansion even when a bomb forges its gzip length trailer to the allowed declaration',()=>{
  const plain=Buffer.alloc(GRAD_WIRE_MAX_DECODED_BYTES+1,0x61),packed=gzipSync(plain);packed.writeUInt32LE(GRAD_WIRE_MAX_DECODED_BYTES,packed.length-4)
  const bomb={...wire(),decodedLength:GRAD_WIRE_MAX_DECODED_BYTES,sha256:sha(plain),data:packed.toString('base64')}
  expect(()=>decodeGradSubmission(bomb)).toThrow('decoded size exceeded')
  expect(()=>decodeGradSubmission({...bomb,decodedLength:GRAD_WIRE_MAX_DECODED_BYTES+1})).toThrow()
 })
})
