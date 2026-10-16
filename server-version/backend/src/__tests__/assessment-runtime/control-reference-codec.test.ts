import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createCipheriv } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { encryptControlReference, decryptControlReference } from '../../modules/assessment-runtime/control-reference-codec'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decryptField, isEncrypted } from '../../utils/encryption'
import { jsonArtifactBytes } from '../../modules/assessment-runtime/bounded-artifact-cache'
const h='ab'.repeat(32),when='2026-10-16T00:00:00.123Z',uuid='12345678-1234-5678-9abc-123456789abc'
beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','c'.repeat(64)))
afterEach(()=>vi.unstubAllEnvs())
describe('authenticated compact control references',()=>{
 const cases=[
  {k:'UAR2',p:h,b:'9007199254740999',x:{frozenAt:when,governance:{status:'READY',holdReason:null}}},
  {k:'UAR2',p:h,b:'12',x:{frozenAt:when,governance:{status:'HOLD',holdReason:'授权待核对'},scalePolicy:{policyHash:h,eligibility:{outcome:'INDETERMINATE',reasons:['a']}}}},
  {k:'UAR2',p:h,b:'12',x:{frozenAt:'2026-10-16T08:00:00.123+08:00',governance:{status:'READY',holdReason:null}}},
  {k:'FSP2',p:h,e:2147483647},
  {k:'SCF2',a:uuid,e:3},
  {k:'SCF2',a:'自定义-ABC-123',e:4},
  {kind:'SHARED_SCALE_RUNTIME',storageVersion:2,artifactHash:h,frozenAt:when},
  {kind:'SHARED_COGNITIVE_RUNTIME',storageVersion:1,artifactHash:h,frozenAt:when},
  {k:'WVP2',p:h,b:{attemptId:uuid,userId:'owner',contextHash:h},u:[[uuid,h],['custom-scale-id','cd'.repeat(32)]]},
 ]
 for(const [i,value]of cases.entries())it('losslessly preserves reference variant '+i,()=>{
  const encrypted=encryptControlReference(value)
  expect(decryptControlReference(encrypted)).toEqual(value);expect(decryptUnifiedRuntimePayload(encrypted)).toEqual(value)
  expect(isEncrypted(encrypted)).toBe(true);expect(decryptField(encrypted)).toEqual({schemaVersion:1,value})
 })
 it('authenticates type, codec, length and ciphertext and enforces canonical encoding',()=>{
  const encrypted=encryptControlReference(cases[0]),raw=Buffer.from(encrypted.slice(5),'base64')
  for(const offset of [0,1,2,6,7,19,raw.length-1]){const changed=Buffer.from(raw);changed[offset]^=1;expect(()=>decryptControlReference('ekr1:'+changed.toString('base64'))).toThrow()}
  expect(()=>decryptControlReference(encrypted+'=')).toThrow();expect(()=>decryptControlReference(encrypted.replace('ekr1:','ekr2:'))).toThrow()
 })
 it('rejects a changed or absent key after a successful cached-key read',()=>{
  const encrypted=encryptControlReference(cases[0]);expect(decryptControlReference(encrypted)).toEqual(cases[0])
  vi.stubEnv('DATA_ENCRYPTION_KEY','d'.repeat(64));expect(()=>decryptControlReference(encrypted)).toThrow()
  vi.stubEnv('DATA_ENCRYPTION_KEY','');expect(()=>decryptControlReference(encrypted)).toThrow()
 })
 it('bounds authenticated decompression even for internally malformed stored bytes',()=>{
  const header=Buffer.alloc(7);header[0]=1;header[1]=0;header[2]=1;header.writeUInt32BE(1,3)
  const iv=Buffer.alloc(12,7),cipher=createCipheriv('aes-256-gcm',Buffer.from('c'.repeat(64),'hex'),iv);cipher.setAAD(Buffer.concat([Buffer.from('eduk12:control-reference:v1:'),header]))
  const body=Buffer.concat([cipher.update(gzipSync(Buffer.from('x'.repeat(100000)))),cipher.final()])
  expect(()=>decryptControlReference('ekr1:'+Buffer.concat([header,iv,cipher.getAuthTag(),body]).toString('base64'))).toThrow()
 })
 it('retains all digest bits and materially reduces a small reference',()=>{
  const a=encryptControlReference(cases[0]),b=encryptControlReference({...cases[0],p:'ab'.repeat(31)+'ac'})
  expect((decryptControlReference(a)as any).p).toBe(h);expect((decryptControlReference(b)as any).p).not.toBe(h)
  expect(a.length).toBeLessThan(180)
 })
})
describe('safe reuse of deeply frozen strict JSON',()=>{
 it('returns independent bytes and preserves a fully frozen artifact',()=>{
  const value=Object.freeze({items:Object.freeze([Object.freeze({key:'A',value:3})])}),first=jsonArtifactBytes(value)!
  first.fill(0);expect(JSON.parse(jsonArtifactBytes(value)!.toString())).toEqual(value)
 })
 it('does not cache a shallow-frozen object whose descendants can change',()=>{
  const child={value:1},value=Object.freeze({child});expect(jsonArtifactBytes(value)!.toString()).toContain('1');child.value=9;expect(jsonArtifactBytes(value)!.toString()).toContain('9')
 })
 it('keeps rejecting getters, cycles and unsupported values',()=>{
  const getter=Object.freeze(Object.defineProperty({},'x',{enumerable:true,get:()=>1})),cycle:any={};cycle.self=cycle
  for(const value of [getter,cycle,Object.freeze({n:NaN}),Object.freeze([undefined]),Object.freeze({toJSON:()=>1})])expect(jsonArtifactBytes(value)).toBeNull()
 })
})
