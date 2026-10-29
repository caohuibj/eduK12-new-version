import {describe,it,expect} from 'vitest'
import {isSurveyStandardPending,sameSurveyStandardOperation,type SurveyStandardPending,type SurveyStandardOperation} from '../surveyStandardConfigurations'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pending:SurveyStandardPending={requestId:id(1),recipientId:id(2),source:{kind:'SCALE',sourceId:'survey-standard:'+id(3),sourceVersion:'a'.repeat(64)},configurationName:'固定配置',title:'量表'}
const operation:SurveyStandardOperation={request:{requestId:pending.requestId,userId:pending.recipientId,source:pending.source,configurationName:pending.configurationName},grant:{id:pending.requestId,
 recipientId:pending.recipientId,title:pending.title,kind:'SCALE',status:'ACTIVE',sourceRef:pending.source,configurationName:pending.configurationName,
 selectedBinding:{authorizationId:pending.requestId,authorizationRevision:1,bindingHash:'b'.repeat(64),configurationHash:'c'.repeat(64)}}}
describe('Survey original standard request intent',()=>{
 it('accepts only the minimal original intent and excludes password, arbitrary binding and organization injection',()=>{
  expect(isSurveyStandardPending(pending)).toBe(true)
  for(const value of [{...pending,currentPassword:'secret'},{...pending,selectedBinding:{}},{...pending,source:{...pending.source,organizationId:id(4)}},
   {...pending,source:{...pending.source,sourceVersion:'latest'}},{...pending,configurationName:''},{...pending,recipientId:'not-uuid'}])expect(isSurveyStandardPending(value)).toBe(false)
 })
 it('compares the receiver, full source, business name, original authorization and both hashes',()=>{
  expect(sameSurveyStandardOperation(pending,operation)).toBe(true)
  for(const value of [{...operation,request:{...operation.request,userId:id(9)}},{...operation,request:{...operation.request,configurationName:'other'}},
   {...operation,grant:{...operation.grant,recipientId:id(9)}},{...operation,grant:{...operation.grant,sourceRef:{...pending.source,sourceVersion:'d'.repeat(64)}}},
   {...operation,grant:{...operation.grant,selectedBinding:{...operation.grant.selectedBinding!,authorizationRevision:2}}},
   {...operation,grant:{...operation.grant,selectedBinding:{...operation.grant.selectedBinding!,bindingHash:'bad'}}}])expect(sameSurveyStandardOperation(pending,value)).toBe(false)
 })
 it('confirms an already-revoked original operation without treating it as a new live grant',()=>{
  expect(sameSurveyStandardOperation(pending,{...operation,grant:{...operation.grant,status:'REVOKED'}})).toBe(true)
  expect(sameSurveyStandardOperation(pending,{...operation,grant:{...operation.grant,status:'PENDING'}})).toBe(false)
 })
 it('does not confirm missing or malformed operation fields',()=>{
  for(const value of [null,{}, {request:operation.request,grant:{}},{...operation,request:{...operation.request,source:null}}])
   expect(sameSurveyStandardOperation(pending,value as unknown as SurveyStandardOperation)).toBe(false)
 })
})
