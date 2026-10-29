import {describe,it,expect} from 'vitest'
import {withNativeCoreReceipt,nativeFinalActorMatches} from '../../modules/cognitive/native-final-receipt'
const identity={sessionId:'synthetic-owned-session',submissionId:'native-submit',definitionHash:'a'.repeat(64)}
const context={nativeTask:true,attemptEpoch:2,compositeAttemptId:null}
const data={submissionId:identity.submissionId,payloadHash:'b'.repeat(64),replayed:false,response:{sessionId:identity.sessionId,status:'COMPLETED',result:{report:{title:'frozen-description'}}}}
describe('native committed core receipt mapping',()=>{
 it('adds the verified identity while leaving report and archive state independent',()=>{
  const r=withNativeCoreReceipt(data,context,identity)
  expect(r).toMatchObject({...identity,attemptEpoch:2,coreSaved:true,payloadHash:data.payloadHash})
  expect(r.response).toBe(data.response);expect(r).not.toHaveProperty('archiveConfirmed');expect(data).not.toHaveProperty('coreSaved')
 })
 it('keeps a replay on the same committed identity and frozen result',()=>{
  const replay={...data,replayed:true};expect(withNativeCoreReceipt(replay,context,identity)).toMatchObject({replayed:true,coreSaved:true,response:data.response})
 })
 it.each(['session','submission','pending','hash'])('rejects mismatched %s instead of claiming saved',(kind)=>{
  const value=structuredClone(data)
  if(kind==='session')value.response.sessionId='other'
  if(kind==='submission')value.submissionId='other'
  if(kind==='pending')value.response.status='IN_PROGRESS'
  if(kind==='hash')value.payloadHash='invalid'
  expect(()=>withNativeCoreReceipt(value,context,identity)).toThrow('authorized identity')
 })
 it('preserves legacy and parent privacy projections without adding a core claim',()=>{
  expect(withNativeCoreReceipt(data,{...context,nativeTask:false},identity)).toBe(data)
  const deferred={completed:true,feedbackDeferred:true};expect(withNativeCoreReceipt(deferred,{...context,compositeAttemptId:'parent'},identity)).toBe(deferred)
 })
})

describe('native first-journey FINAL actor scope',()=>{
 it.each([
  {name:'owned standalone',child:{userId:'actor',compositeAttemptId:null,compositeItemId:null},actor:'actor',allowed:true},
  {name:'other owner',child:{userId:'actor',compositeAttemptId:null,compositeItemId:null},actor:'other',allowed:false},
  {name:'anonymous',child:{userId:null,compositeAttemptId:null,compositeItemId:null},actor:null,allowed:false},
  {name:'unadapted composite',child:{userId:'actor',compositeAttemptId:'parent',compositeItemId:'slot'},actor:'actor',allowed:false},
 ])('$name remains explicit at native FINAL dispatch',({child,actor,allowed})=>expect(nativeFinalActorMatches(child,actor)).toBe(allowed))
})
