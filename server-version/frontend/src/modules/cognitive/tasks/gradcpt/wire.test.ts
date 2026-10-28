import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {Blob as NodeBlob} from 'node:buffer'
import {describe,expect,it,vi,afterEach} from 'vitest'
import {packGradEnvelope} from './wire'
import {gradEnvelope} from './generated/envelope'
import {gradWireCanonicalJson,GRAD_WIRE_MAX_DECODED_BYTES} from './generated/wire-format'
import {decodeGradSubmission} from '../../../../../../backend/src/modules/cognitive/content-candidates/gradcpt/wire'
const root=resolve(__dirname,'../../../../../../..'),dir=resolve(root,'docs/cognitive-library/onboarding-content-20261028/parallel-review/grad-transport/raw'),detail=JSON.parse(gunzipSync(readFileSync(resolve(dir,'research-240-archive.json.gz'))).toString('utf8')),large=detail.records.find((r:{phase:string})=>r.phase==='test').raw,small=JSON.parse(readFileSync(resolve(dir,'capture-prefix-research-240.json'),'utf8'))
afterEach(()=>{vi.unstubAllGlobals()})
describe('GradCPT browser-side envelope packer (Node CompressionStream compatibility)',()=>{
 it('keeps small raw unchanged, including when CompressionStream is unavailable',async()=>{
  vi.stubGlobal('CompressionStream',undefined)
  expect(await packGradEnvelope(small)).toEqual(gradEnvelope(small))
  await expect(packGradEnvelope(large)).rejects.toThrow('原件仍保留')
 })
 it('packs the one saved large research240 raw and restores every canonical byte without scoring it',async()=>{
  vi.stubGlobal('Blob',NodeBlob)
  const envelope=await packGradEnvelope(large);expect('kind' in envelope.payload).toBe(true)
  expect(gradWireCanonicalJson(decodeGradSubmission(envelope.payload))).toBe(gradWireCanonicalJson(large))
  expect(new TextEncoder().encode(gradWireCanonicalJson({trials:[envelope]})).byteLength).toBeLessThan(1536*1024)
 })
 it('leaves an over-8MiB raw unsupported rather than dropping frames or raising the decoded limit',async()=>{
  const raw=JSON.parse(gunzipSync(readFileSync(resolve(dir,'schema-max-raw.json.gz'))).toString('utf8'))
  expect(new TextEncoder().encode(gradWireCanonicalJson(raw)).byteLength).toBeGreaterThan(GRAD_WIRE_MAX_DECODED_BYTES)
  await expect(packGradEnvelope(raw)).rejects.toThrow('8MiB')
 })
})
