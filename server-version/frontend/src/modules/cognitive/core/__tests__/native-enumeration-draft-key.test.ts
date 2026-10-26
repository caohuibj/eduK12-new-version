import {describe,it,expect} from 'vitest'
import {nativeEnumerationDraftKey} from '../native-enumeration-draft-key'
import {cognitiveDraftKey} from '../useCognitiveSession'
import type {CognitiveSession} from '../../types'
const session={sessionId:'synthetic-enum-key',testType:'enumeration',engineVersion:'0.2.0',scoringVersion:'0.2.0',configVersion:'0.3.0',nativeTask:true,attemptEpoch:1,attemptNo:1} as CognitiveSession
describe('native enumeration first-product draft keys',()=>{
 it('isolates authorized epochs without changing MOT, legacy or old enum keys',()=>{
  const first=cognitiveDraftKey(session),next=cognitiveDraftKey({...session,attemptEpoch:2,attemptNo:2})
  expect(first).toBe(nativeEnumerationDraftKey(session.sessionId,1));expect(next).not.toBe(first)
  expect(cognitiveDraftKey({...session,testType:'mot',engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0'})).toBe('cognitive:'+session.sessionId)
  expect(cognitiveDraftKey({...session,nativeTask:false})).toBe('cognitive:'+session.sessionId)
  expect(cognitiveDraftKey({...session,engineVersion:'0.1.0',configVersion:'0.2.0'})).toBe('cognitive:'+session.sessionId)
 })
 it('requires a real positive epoch and unambiguous session identity',()=>{
  expect(()=>nativeEnumerationDraftKey('',1)).toThrow()
  expect(()=>nativeEnumerationDraftKey('s',0)).toThrow()
  expect(()=>nativeEnumerationDraftKey('s',NaN)).toThrow()
  expect(nativeEnumerationDraftKey('s:1',2)).not.toBe(nativeEnumerationDraftKey('s',12))
 })
})
