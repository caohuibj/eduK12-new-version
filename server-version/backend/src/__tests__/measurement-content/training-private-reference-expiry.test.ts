import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {assertTrainingPrivateReferenceCourseUse,assertTrainingPrivateReferenceAdmissionCurrent} from '../../modules/composite/training-private-reference-use'
function fixture(expiresAt:Date|null=new Date('2026-10-20T01:00:00Z')){
 let now=new Date('2026-10-20T00:00:00Z')
 const db={$queryRaw:vi.fn(async(sql:any)=>{
  const q=sql.strings.join('')
  if(q.includes('FROM training_reference_requests'))return [{course_id:'course',composite_id:'source'}]
  if(q.includes('FROM composite_assessments'))return ['source','target'].map(id=>({id,created_by:'owner',status:'PUBLISHED',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:now}))
  if(q.includes('FROM questionnaire_course_deliveries'))return ['source','target'].map(composite_id=>({composite_id,course_id:'course'}))
  if(q.includes('FROM courses'))return [{creator_id:'owner',course_type:'TRAINING_COURSE',is_library:false}]
  if(q.includes('FROM users'))return [{role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:expiresAt}]
  if(q.includes('clock_timestamp'))return [{now}]
  throw new Error('Unexpected query: '+q)
 })}
 const input={release:{layer:'REFERENCE',releaseId:'reference-A',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:'source'},provenance:{candidateId:'candidate',reviewId:'review'}} as any,
  ownerId:'owner',compositeId:'target',currentAdmission:true,draftSelection:false,recordAdmissionExpiry:true}
 return {db,input,setNow:(value:Date)=>{now=value}}
}
describe('transaction-local private reference admission expiry',()=>{
 it('rejects expiry after a later reference lock and admission writes without rereading principal or samples',async()=>{
  const f=fixture();await assertTrainingPrivateReferenceCourseUse(f.db as never,f.input)
  f.setNow(new Date('2026-10-20T01:00:00Z'));f.db.$queryRaw.mockClear()
  await expect(assertTrainingPrivateReferenceAdmissionCurrent(f.db as never)).rejects.toThrow('CONTENT_TRAINING_REFERENCE_SCOPE_DENIED')
  expect(f.db.$queryRaw).toHaveBeenCalledTimes(1)
  expect(f.db.$queryRaw.mock.calls[0][0].strings.join('')).toBe('SELECT clock_timestamp() AS now')
 })
 it('retains the receipt across nested fences so later writes cannot outlive it',async()=>{
  const f=fixture();await assertTrainingPrivateReferenceCourseUse(f.db as never,f.input)
  await assertTrainingPrivateReferenceAdmissionCurrent(f.db as never)
  f.setNow(new Date('2026-10-20T01:00:01Z'))
  await expect(assertTrainingPrivateReferenceAdmissionCurrent(f.db as never)).rejects.toThrow('SCOPE_DENIED')
 })
 it.each([null,new Date('2026-10-20T01:00:00Z')])('does not reauthorize replay or another transaction (%s)',async expiry=>{
  const f=fixture(expiry);await assertTrainingPrivateReferenceCourseUse(f.db as never,f.input)
  const replay={$queryRaw:vi.fn()};await assertTrainingPrivateReferenceAdmissionCurrent(replay as never)
  expect(replay.$queryRaw).not.toHaveBeenCalled()
  if(expiry===null){f.db.$queryRaw.mockClear();await assertTrainingPrivateReferenceAdmissionCurrent(f.db as never);expect(f.db.$queryRaw).not.toHaveBeenCalled()}
 })
 it('does not enroll historical scope checks in current admission authorization',async()=>{
  const f=fixture();await assertTrainingPrivateReferenceCourseUse(f.db as never,{...f.input,currentAdmission:false,recordAdmissionExpiry:false})
  f.setNow(new Date('2026-10-21T00:00:00Z'));f.db.$queryRaw.mockClear()
  await assertTrainingPrivateReferenceAdmissionCurrent(f.db as never);expect(f.db.$queryRaw).not.toHaveBeenCalled()
 })
 it('keeps final fences after START child/material writes and UNIFIED completed-unit/outbox insertion',()=>{
  const composite=readFileSync(new URL('../../modules/composite/composite.service.ts',import.meta.url),'utf8')
  expect(composite).toMatch(/await contentCandidate\?\.recheckSourceLicenses\(\)\s+await assertTrainingPrivateReferenceAdmissionCurrent\(db as Prisma.TransactionClient\)\s+return attempt/)
  const unified=readFileSync(new URL('../../modules/assessment-runtime/unified-form-section-final-submit.service.ts',import.meta.url),'utf8')
  expect(unified).toMatch(/await insertCompletedUnitSnapshot\(tx,[\s\S]*?await assertTrainingPrivateReferenceAdmissionCurrent\(tx\)\s+return \{ replayed: false, sectionAttemptId: currentSection.id/)
  const legacy=readFileSync(new URL('../../modules/composite/final-submit.service.ts',import.meta.url),'utf8')
  expect(legacy).toMatch(/await assertTrainingPrivateReferenceAdmissionCurrent\(tx\)\s+return \{\s+replayed: false,\s+sectionAttemptId: sectionAttempt.id/)
 })
})
