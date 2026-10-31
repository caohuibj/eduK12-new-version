import {describe,it,expect} from 'vitest'
import {validStandardConfigurationPending as valid,sameStandardConfigurationOperation as same,validStandardConfigurationUse as validUse,sameStandardConfigurationLineage as sameLineage} from './standardConfigurationGrants'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const p={requestId:id(1),combinationId:id(2),combinationHash:'a'.repeat(64),userId:id(3),configurationName:'教学简报',title:'量表'}
const found={legacy:false,grant:{id:id(1),version:1,currentVersion:1,revoked:false},request:{requestId:id(1),actorId:id(4),combinationId:id(2),combinationHash:p.combinationHash,userId:p.userId,configurationName:p.configurationName,grantId:null,expectedGrantVersion:null,expectedUseVersion:null}}
describe('Training original issue intent projection',()=>{
 it('admits only bounded non-secret intent with a paired original use identity and revision',()=>{
  expect(valid(p)).toBe(true);expect(valid({...p,expectedUseId:id(5),expectedUseVersion:2})).toBe(true)
  for(const bad of [{...p,currentPassword:'secret'},{...p,report:{}},{...p,configurationName:' '},{...p,expectedUseVersion:2},{...p,expectedUseId:id(5)},{...p,title:'x'.repeat(1001)}])expect(valid(bad)).toBe(false)
 })
 it('matches the complete original actor, entry basis, source, recipient, label and predecessor',()=>{
  expect(same(id(4),p,found)).toBe(true)
  for(const request of [{...found.request,userId:id(5)},{...found.request,actorId:id(5)},{...found.request,configurationName:'另一用途'},{...found.request,combinationHash:'b'.repeat(64)},{...found.request,grantId:id(5)},{...found.request,expectedUseId:id(5)},{...found.request,expectedUseVersion:2}])expect(same(id(4),p,{...found,request})).toBe(false)
 })
 it('requires the recorded predecessor id and next revision rather than accepting any active grant',()=>{
  const next={...p,expectedUseId:id(5),expectedUseVersion:2},receipt={...found,grant:{id:id(5),version:3,currentVersion:3,revoked:false},request:{...found.request,expectedUseVersion:2,expectedUseId:id(5)}}
  expect(same(id(4),next,receipt)).toBe(true)
  expect(same(id(4),next,{...receipt,grant:{...receipt.grant,id:id(6)}})).toBe(false)
  expect(same(id(4),next,{...receipt,grant:{...receipt.grant,version:4,currentVersion:4}})).toBe(false)
 })
 it('accepts an explicitly historical result without misreporting it as current or reconstructing deleted rows',()=>{
  expect(same(id(4),p,{...found,grant:{...found.grant,currentVersion:3,revoked:true}})).toBe(true)
  expect(same(id(4),p,{...found,grant:{...found.grant,currentVersion:null,revoked:true}})).toBe(true)
  expect(same(id(4),p,{...found,grant:{...found.grant,currentVersion:3,revoked:false}})).toBe(false)
  expect(same(id(4),p,{...found,grant:{...found.grant,currentVersion:0,revoked:true}})).toBe(false)
  expect(same(id(4),p,{...found,legacy:true,request:null})).toBe(false)
 })
})

describe('Training independent old and new-target replacement revisions',()=>{
 const replaces={grantId:id(9),expectedVersion:9,reason:'明确切换用途'},pending={...p,expectedUseId:id(5),expectedUseVersion:4,replaces}
 const supersedes={selectedBinding:{authorizationId:id(9),authorizationRevision:9,bindingHash:'d'.repeat(64),configurationHash:'e'.repeat(64)},reason:replaces.reason}
 const receipt={...found,grant:{id:id(5),version:5,currentVersion:5,revoked:false,supersedes},request:{...found.request,expectedUseId:id(5),expectedUseVersion:4,replaces}}
 it('keeps the prior target id/revision and the replaced id/revision separate, rejecting incomplete or self-referencing intent',()=>{
  expect(valid(pending)).toBe(true);expect(same(id(4),pending,receipt)).toBe(true)
  for(const bad of [{...pending,replaces:{...replaces,grantId:p.requestId}},{...pending,replaces:{...replaces,grantId:id(5)}},{...pending,replaces:{...replaces,expectedVersion:0}},{...pending,replaces:{...replaces,selectedBinding:{}}},{...pending,replaces:{...replaces,reason:'x'.repeat(501)}}])expect(valid(bad)).toBe(false)
  expect(same(id(4),pending,{...receipt,request:{...receipt.request,replaces:{...replaces,expectedVersion:4}}})).toBe(false)
  expect(same(id(4),pending,{...receipt,grant:{...receipt.grant,version:10,currentVersion:10}})).toBe(false)
 })
 it('compares the full returned old lineage and reason, preserving an explicitly superseded original operation',()=>{
  expect(same(id(4),pending,{...receipt,grant:{...receipt.grant,currentVersion:6,revoked:true}})).toBe(true)
  for(const raw of [null,{}, {selectedBinding:null}, {...supersedes,reason:'另一原因'}, {...supersedes,selectedBinding:{...supersedes.selectedBinding,authorizationRevision:4}}, {...supersedes,selectedBinding:{...supersedes.selectedBinding,bindingHash:'bad'}}])expect(sameLineage(replaces,raw)).toBe(false)
  expect(same(id(4),p,receipt)).toBe(false)
 })
 it('recognizes only the original matching current or revoked identity header without fabricating a legacy binding',()=>{
  const header={id:id(9),userId:id(3),issuerId:id(4),username:'training-test',nickname:null,version:9,revokedAt:null,combinationHash:p.combinationHash,canManage:true,selectedBinding:supersedes.selectedBinding}
  expect(validUse(header)).toBe(true);expect(validUse({...header,version:10,revokedAt:'2026-10-29T20:00:00Z'})).toBe(true)
  expect(validUse({...header,version:10})).toBe(false);expect(validUse({...header,revokedAt:''})).toBe(false)
  expect(validUse({...header,selectedBinding:{...header.selectedBinding,authorizationId:id(8)}})).toBe(false)
  expect(validUse({...header,selectedBinding:undefined})).toBe(true)
 })
})
