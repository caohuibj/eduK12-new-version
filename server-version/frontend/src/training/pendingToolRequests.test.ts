import {beforeEach,it,expect} from 'vitest'
import {hasPendingTrainingToolRequest} from './pendingToolRequests'
beforeEach(()=>sessionStorage.clear())
it('retains report recovery only for the exact actor and composition',()=>{
  const key='training-report-create:'+JSON.stringify({actorId:'actor',compositeId:'tool',courseId:'course',grantId:'grant'})
  sessionStorage.setItem(key,JSON.stringify({scope:key,request:{requestId:'request',payload:{name:'report'}}}))
  expect(hasPendingTrainingToolRequest('actor','tool')).toBe(true)
  expect(hasPendingTrainingToolRequest('other','tool')).toBe(false)
  expect(hasPendingTrainingToolRequest('actor','other')).toBe(false)
})
it('does not let a corrupt record hide a later valid recovery request',()=>{
  sessionStorage.setItem('training-report-create:broken','invalid')
  const key='training-report-create:'+JSON.stringify({actorId:'actor',compositeId:'tool'})
  sessionStorage.setItem(key,JSON.stringify({scope:key,request:{requestId:'request',payload:{}}}))
  expect(hasPendingTrainingToolRequest('actor','tool')).toBe(true)
})
it('ignores a report record with a mismatched recovery identity',()=>{
  const key='training-report-create:'+JSON.stringify({actorId:'actor',compositeId:'tool'})
  sessionStorage.setItem(key,JSON.stringify({scope:'other',request:{requestId:'request',payload:{}}}))
  expect(hasPendingTrainingToolRequest('actor','tool')).toBe(false)
})
