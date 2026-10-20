import {describe,it,expect} from 'vitest'
import {contentAuthorityScopeSchema,contentGrantInputSchema} from '../../modules/measurement-content/content-authority'
const scope={product:'TRAINING',scopeKind:'COURSE',scopeId:'exact-course',resourceKind:'data',resourceKeys:['exact-final']}
describe('Training data grant schema remains an exact course capability',()=>{
 it('permits only the approved Training COURSE or Survey PROJECT product/scope pair',()=>{
  expect(contentAuthorityScopeSchema.parse(scope)).toEqual(scope)
  for(const product of ['TRAINING','SURVEY','SCHOOL','TEACHER'])for(const scopeKind of ['PLATFORM','ORGANIZATION','PROJECT','COURSE']){
   if(product==='TRAINING'&&scopeKind==='COURSE'||product==='SURVEY'&&scopeKind==='PROJECT')continue
   expect(()=>contentAuthorityScopeSchema.parse({...scope,product,scopeKind})).toThrow()
  }
 })
 it('does not invent data read/export rights or permit empty and duplicate resources',()=>{
  const grant={subjectId:'teacher',scope,capabilities:['data.reinterpret'],delegableCapabilities:[],remainingDelegationDepth:0,
   validFrom:new Date('2026-10-20'),expiresAt:new Date('2026-10-21')}
  expect(contentGrantInputSchema.parse(grant).capabilities).toEqual(['data.reinterpret'])
  for(const capabilities of [['data.read'],['data.export'],['report.publish'],['data.*']])expect(()=>contentGrantInputSchema.parse({...grant,capabilities})).toThrow()
  for(const resourceKeys of [[],['a','a']])expect(()=>contentAuthorityScopeSchema.parse({...scope,resourceKeys})).toThrow()
 })
})
