import {describe,it,expect} from 'vitest'
import {isEducationPending,sameEducationOperation,type EducationPendingOperation,type EducationManagerOperation} from '../educationStandardConfigurations'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const issue={kind:'ISSUE' as const,combinationId:id(1),unknown:true,body:{requestId:id(2),userId:id(3),combinationHash:'a'.repeat(64),
 authorityGrantId:id(4),expectedAuthorityVersion:1,validFrom:'2030-01-01T00:00:00.000Z',expiresAt:'2031-01-01T00:00:00.000Z',configurationName:'原固定配置'}}
const found={kind:'ISSUE' as const,grant:{id:id(2),version:1,revokedAt:null},request:issue.body}
describe('exact education configuration operation recovery',()=>{
 it('retains only the complete intended request, excluding password, arbitrary axes and profile overrides',()=>{
  expect(isEducationPending(issue)).toBe(true)
  for(const body of [{...issue.body,currentPassword:'must-not-persist'},{...issue.body,selectedBinding:{arbitrary:true}},
   {...issue.body,profile:'research'},{...issue.body,expectedAuthorityVersion:0},{...issue.body,authorityGrantId:''}])
   expect(isEducationPending({...issue,body})).toBe(false)
 })
 it('compares recipient, exact artifact, authority revision, name and both validity bounds rather than only the resource ID',()=>{
  expect(sameEducationOperation(issue,found)).toBe(true)
  for(const request of [{...issue.body,userId:id(9)},{...issue.body,combinationHash:'b'.repeat(64)},
   {...issue.body,authorityGrantId:id(9)},{...issue.body,expectedAuthorityVersion:2},{...issue.body,configurationName:'另一个用途'},
   {...issue.body,validFrom:'2030-02-01T00:00:00.000Z'},{...issue.body,expiresAt:'2031-02-01T00:00:00.000Z'}])
   expect(sameEducationOperation(issue,{...found,request})).toBe(false)
 })
 it('requires the exact revoke target, reason and revision and a persisted revoked outcome',()=>{
  const pending:EducationPendingOperation={kind:'REVOKE',combinationId:id(1),grantId:id(2),unknown:true,body:{requestId:id(5),expectedVersion:1,reason:'原撤销原因'}}
  const value:EducationManagerOperation={kind:'REVOKE',grant:{id:id(2),version:2,revokedAt:'2030-01-01T00:00:00Z'},request:pending.body}
  expect(sameEducationOperation(pending,value)).toBe(true)
  for(const changed of [{...value,request:{...value.request,reason:'其他原因'}},{...value,request:{...value.request,expectedVersion:2}},
   {...value,grant:{...value.grant,id:id(9)}},{...value,grant:{...value.grant,version:3}},{...value,grant:{...value.grant,revokedAt:null}}])
   expect(sameEducationOperation(pending,changed)).toBe(false)
 })
 it('does not confirm malformed or different-kind readback',()=>{
  expect(sameEducationOperation(issue,null as unknown as EducationManagerOperation)).toBe(false)
  expect(sameEducationOperation(issue,{} as EducationManagerOperation)).toBe(false)
  expect(sameEducationOperation(issue,{kind:'REVOKE',grant:found.grant,request:{requestId:issue.body.requestId,expectedVersion:1,reason:'other'}})).toBe(false)
 })
 it('retains only an explicit prior grant revision and reason when replacing, and excludes injected authority or password',()=>{
  const replaces={grantId:id(8),expectedVersion:1,reason:'管理员明确调整报告'}
  expect(isEducationPending({...issue,body:{...issue.body,replaces}})).toBe(true)
  for(const value of [{...replaces,expectedVersion:0},{...replaces,reason:''},{...replaces,selectedBinding:{injected:true}},
   {...replaces,currentPassword:'must-not-store'}])expect(isEducationPending({...issue,body:{...issue.body,replaces:value}})).toBe(false)
 })
 it('compares the complete replacement lineage during recovery instead of confirming another old grant or reason',()=>{
  const replaces={grantId:id(8),expectedVersion:1,reason:'明确替换原配置'},pending={...issue,body:{...issue.body,replaces}},operation={...found,request:{...issue.body,replaces}}
  expect(sameEducationOperation(pending,operation)).toBe(true)
  expect(sameEducationOperation(pending,found)).toBe(false)
  expect(sameEducationOperation(issue,operation)).toBe(false)
  for(const value of [{...replaces,grantId:id(9)},{...replaces,expectedVersion:2},{...replaces,reason:'another'}])
   expect(sameEducationOperation(pending,{...operation,request:{...operation.request,replaces:value}})).toBe(false)
 })
})
