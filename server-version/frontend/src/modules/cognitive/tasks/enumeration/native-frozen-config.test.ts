import {describe,it,expect} from 'vitest'
import {createEnumerationRecipeSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/enumeration/package'
import {cognitiveRawDigest} from '../../core/raw-archive'
import type {CognitiveTaskContext} from '../../core/runner.types'
import {nativeEnumerationConfig} from './NativeEnumerationRunner'

function context(){
 const s=createEnumerationRecipeSnapshot('experience')
 return {nativeTask:true,sessionId:'synthetic-enumeration-frozen-review',attemptNo:1,attemptEpoch:1,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,
  definitionHash:s.configHash,config:structuredClone(s.config),randomSeed:'enumeration-frozen-review',sessionSnapshot:structuredClone(s)} as unknown as CognitiveTaskContext
}
describe('enumeration native frozen configuration before exposure',()=>{
 it('accepts the actual snapshot hashes and existing opaque protocol key',()=>{
  const c=context();expect(c.sessionSnapshot!.protocol.key).toBe('enumeration/0.1.0/0.1.0')
  expect(nativeEnumerationConfig(c)).toEqual(c.config)
 })
 it('rejects a wrong config digest even when the outer identity repeats it',()=>{
  const c=context();c.definitionHash='a'.repeat(64);c.sessionSnapshot!.configHash=c.definitionHash
  expect(()=>nativeEnumerationConfig(c)).toThrow()
 })
 it('rejects a wrong protocol digest',()=>{
  const c=context();c.sessionSnapshot!.protocolSignature='b'.repeat(64)
  expect(()=>nativeEnumerationConfig(c)).toThrow()
 })
 it.each([false,true])('rejects altered protocol content with recomputed digest=%s',recompute=>{
  const c=context();c.sessionSnapshot!.protocol.phases=[]
  if(recompute)c.sessionSnapshot!.protocolSignature=cognitiveRawDigest(c.sessionSnapshot!.protocol)
  expect(()=>nativeEnumerationConfig(c)).toThrow()
 })
})
