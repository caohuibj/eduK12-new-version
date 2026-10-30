import {describe,it,expect} from 'vitest'
import {isEducationCognitivePending,sameEducationCognitiveOperation,type EducationCognitivePending} from '../educationCognitiveConfigurations'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const p:Extract<EducationCognitivePending,{kind:'ISSUE'}>={kind:'ISSUE',configId:id(1),profile:'research',unknown:true,body:{requestId:id(2),userId:id(3),artifactHash:'a'.repeat(64),authorityGrantId:id(4),expectedAuthorityVersion:1,validFrom:'2030-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',configurationName:'科研反应配置'}}
const op={kind:'ISSUE',grant:{id:p.body.requestId,version:1,revokedAt:null},request:{...p.body,profile:p.profile}}
describe('Education exact cognitive original intent',()=>{
 it('reuses bounded dates, exact delegation and replacement validation without storing secrets or arbitrary binding',()=>{
  expect(isEducationCognitivePending(p)).toBe(true)
  for(const v of [{...p,profile:'unknown'},{...p,currentPassword:'secret'},{...p,configId:'not-id'},{...p,body:{...p.body,artifactHash:'latest'}},{...p,body:{...p.body,selectedBinding:{}}},{...p,body:{...p.body,expiresAt:p.body.validFrom}}])expect(isEducationCognitivePending(v)).toBe(false)
 })
 it('compares the full original profile, hash, receiver, authority, dates, name and replacement',()=>{
  expect(sameEducationCognitiveOperation(p,op)).toBe(true)
  for(const change of [{profile:'experience'},{artifactHash:'b'.repeat(64)},{userId:id(8)},{expectedAuthorityVersion:2},{configurationName:'changed'},{expiresAt:'2032-01-01T00:00:00Z'}])expect(sameEducationCognitiveOperation(p,{...op,request:{...op.request,...change}})).toBe(false)
  const replaces={grantId:id(9),expectedVersion:1,reason:'明确更换科研配置'},next={...p,body:{...p.body,replaces}}
  expect(isEducationCognitivePending(next)).toBe(true);expect(sameEducationCognitiveOperation(next,{...op,request:{...op.request,replaces}})).toBe(true)
  expect(sameEducationCognitiveOperation(next,op)).toBe(false)
 })
})
