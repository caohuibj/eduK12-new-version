import {describe,it,expect,vi} from 'vitest'
import {assertTrainingPrivateReferenceCourseUse} from '../../modules/composite/training-private-reference-use'
function fixture(){
 const now=new Date('2026-10-20T00:00:00Z')
 const release:any={releaseId:'release',layer:'REFERENCE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'source'},
  provenance:{candidateId:'candidate',reviewId:'review'}}
 const receipts=[{course_id:'course',composite_id:'source'}]
 const tasks:any[]=[{id:'source',created_by:'teacher',status:'PUBLISHED',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:now},
  {id:'target',created_by:'teacher',status:'DRAFT',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:null}]
 const deliveries=[{composite_id:'source',course_id:'course'},{composite_id:'target',course_id:'course'}]
 const course={creator_id:'teacher',course_type:'TRAINING_COURSE',is_library:false}
 const principal={role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:null as Date|null}
 const queries:string[]=[]
 const db={$queryRaw:vi.fn(async(sql:any)=>{
  const text=sql.strings.join('');queries.push(text)
  if(text.includes('training_reference_requests'))return receipts
  if(text.includes('FROM composite_assessments'))return tasks
  if(text.includes('questionnaire_course_deliveries'))return deliveries
  if(text.includes('FROM courses'))return [course]
  if(text.includes('FROM users'))return [principal]
  if(text.includes('clock_timestamp'))return [{now}]
  throw new Error('unexpected query')
 })}
 const input={release,ownerId:'teacher',compositeId:'target',currentAdmission:true,draftSelection:true}
 return {input,db,run:()=>assertTrainingPrivateReferenceCourseUse(db as never,input),receipts,tasks,deliveries,course,principal,queries,now}
}
describe('private Training aggregate references can be explicitly reused only inside their authorized course',()=>{
 it('uses immutable PUBLISH provenance without fetching samples or copying content, then rechecks at START',async()=>{
  const f=fixture();await expect(f.run()).resolves.toBeUndefined()
  f.tasks[1].status='PUBLISHED';f.input.draftSelection=false
  await expect(f.run()).resolves.toBeUndefined()
  expect(f.queries.every(q=>!q.includes('payload')&&!q.includes('source_ids')&&!q.includes('sample'))).toBe(true)
  expect(f.queries.filter(q=>q.includes('FOR SHARE')).every(q=>q.includes('NOWAIT'))).toBe(true)
 })
 it.each(['owner','public','general','published-target','unpublished-source','draft-source','missing-receipt','missing-review','other-course','additional-course','missing-course','library','foreign-course','expired'] as const)('rejects %s before reuse',async problem=>{
  const f=fixture()
  if(problem==='owner')f.tasks[0].created_by='other'
  if(problem==='public')f.tasks[1].public_enabled=true
  if(problem==='general')f.tasks[1].questionnaire_type='GENERAL'
  if(problem==='published-target')f.tasks[1].status='PUBLISHED'
  if(problem==='unpublished-source')f.tasks[0].published_at=null
  if(problem==='draft-source')f.tasks[0].status='DRAFT'
  if(problem==='missing-receipt')f.receipts.length=0
  if(problem==='missing-review')delete f.input.release.provenance.reviewId
  if(problem==='other-course')f.deliveries[1].course_id='other'
  if(problem==='additional-course')f.deliveries.push({composite_id:'target',course_id:'other'})
  if(problem==='missing-course')f.deliveries.length=1
  if(problem==='library')f.course.is_library=true
  if(problem==='foreign-course')f.course.creator_id='other'
  if(problem==='expired')f.principal.expires_at=f.now
  await expect(f.run()).rejects.toThrow('SCOPE_DENIED')
 })
 it('does not invalidate already frozen history solely because its publisher account later expired',async()=>{
  const f=fixture();f.input.currentAdmission=false;f.input.draftSelection=false;f.tasks[1].status='ARCHIVED';f.principal.expires_at=f.now
  await expect(f.run()).resolves.toBeUndefined()
  expect(f.queries.some(q=>q.includes('FROM users'))).toBe(false)
 })
 it('rejects lock contention as an explicit retriable conflict without any writes',async()=>{
  const f=fixture();f.db.$queryRaw.mockRejectedValueOnce({code:'P2010',meta:{code:'55P03'}})
  await expect(f.run()).rejects.toMatchObject({statusCode:409,message:'CONTENT_TRAINING_REFERENCE_SCOPE_BUSY_RETRY'})
  expect(f.db.$queryRaw).toHaveBeenCalledTimes(1)
 })
})
