import {describe,it,expect} from 'vitest'
import {validStandardConfigurationPending as valid,sameStandardConfigurationOperation as same} from './standardConfigurationGrants'
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
