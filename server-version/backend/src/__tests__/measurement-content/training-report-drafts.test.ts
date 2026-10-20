import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({tx:{$queryRaw:vi.fn(),$executeRaw:vi.fn(),compositeAssessment:{findUnique:vi.fn()}},transaction:vi.fn(),authority:vi.fn(),snapshot:vi.fn(),resolve:vi.fn(),scope:vi.fn(),get:vi.fn(),publish:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get,publishContentRelease:mocks.publish}))
vi.mock('../../modules/composite/training-content-binding',()=>({prepareTrainingContentSnapshot:mocks.snapshot}))
vi.mock('../../modules/composite/composite.service',()=>({resolveCompositeSituationalItems:mocks.resolve,compositeSjtGrantScope:mocks.scope}))
import {createTrainingReportDraft,createTrainingReportInput,editTrainingReportDraft,getTrainingReportDraft,listTrainingReportDrafts,listTrainingReportMeasurements,previewTrainingReportDraft,publishTrainingReportDraft} from '../../modules/questionnaire-product/content-report.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
const measurementId='11111111-1111-4111-8111-111111111111',draftId='22222222-2222-4222-8222-222222222222',releaseId='33333333-3333-4333-8333-333333333333'
const context={actorId:'teacher',courseId:'course',compositeId:'composite',grantId:'44444444-4444-4444-8444-444444444444'}
const payload=()=>({measurementReleaseId:measurementId,metricKeys:['effort'],audience:'teacher',language:'zh-CN',template:{blocks:[{type:'METRIC',metricKey:'effort',display:'RAW'}],limitations:[]}})
const input=()=>createTrainingReportInput.parse({requestId:draftId,reportKey:'local',version:'1',payload:payload()})
const originalHash=()=>canonicalHash({actorId:context.actorId,courseId:context.courseId,compositeId:context.compositeId,input:input()})
const draft=()=>({id:draftId,course_id:'course',composite_id:'composite',owner_id:'teacher',report_key:'local',version:'1',revision:0,payload:input().payload,state:'DRAFT',published_release_id:null,create_input_hash:originalHash()})
const measurement=()=>({releaseId:measurementId,layer:'MEASUREMENT',family:'SCALE',key:'scale',version:'1',status:'PUBLISHED',scope:{kind:'PLATFORM'},contentHash:'a'.repeat(64),content:{measurementHash:'b'.repeat(64),metrics:[{metricKey:'effort',unit:'points',direction:'descriptive'}]}})
let actor:any,course:any,composite:any,delivery:any[],row:any,prior:any[]
beforeEach(()=>{
 vi.resetAllMocks();actor={role:'TEACHER',teacher_approved:true,account_domain:'TRAINING',is_active:true,is_frozen:false,must_change_password:false,expires_at:null}
 course={id:'course',creator_id:'teacher',course_type:'TRAINING_COURSE',is_library:false}
 composite={id:'composite',created_by:'teacher',course_id:null,product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE'};delivery=[{course_id:'course'}];row=draft();prior=[]
 mocks.transaction.mockImplementation(fn=>fn(mocks.tx));mocks.authority.mockResolvedValue({});mocks.tx.$executeRaw.mockResolvedValue(1)
 mocks.tx.$queryRaw.mockImplementation(async query=>{
  const sql=query.strings.join(' ')
  if(sql.includes('FROM courses'))return [course]
  if(sql.includes('FROM users'))return [actor]
  if(sql.includes('FROM composite_assessments'))return [composite]
  if(sql.includes('FROM questionnaire_course_deliveries'))return delivery
  if(sql.includes('clock_timestamp() AS now'))return [{now:new Date('2026-10-20T06:00:00Z')}]
  if(sql.includes('SELECT * FROM training_report_drafts')&&!sql.includes('course_id='))return prior
  if(sql.includes('training_report_drafts'))return [row]
  throw Error('Unexpected SQL '+sql)
 })
 mocks.tx.compositeAssessment.findUnique.mockResolvedValue({id:'composite',createdBy:'teacher',items:[{id:'item'}],questionnaireCourses:[{courseId:'course'}]})
 mocks.resolve.mockResolvedValue(new Map());mocks.scope.mockReturnValue({teacherId:'teacher',courseId:'course',purpose:'TRAINING_COURSE'})
 mocks.snapshot.mockResolvedValue({snapshot:{units:[{measurement:{releaseId:measurementId,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}]},releases:new Map([[measurementId,measurement()]])})
 mocks.get.mockResolvedValue(measurement());mocks.publish.mockResolvedValue({releaseId,contentHash:'c'.repeat(64),version:'1',status:'PUBLISHED',content:{secret:'not DTO'}})
})
const actions=[()=>createTrainingReportDraft(context,input()),()=>getTrainingReportDraft(context,draftId),()=>listTrainingReportDrafts(context),()=>listTrainingReportMeasurements(context),()=>editTrainingReportDraft(context,draftId,{revision:0,payload:payload()}),()=>previewTrainingReportDraft(context,draftId,'INTERPRETABLE'),()=>publishTrainingReportDraft(context,draftId,{revision:0,publicationNote:'Approved wording'})]
describe('Training private report drafts',()=>{
 it.each(actions.map((action,index)=>[index,action] as const))('operation %s requires current business teacher and exact capability',async(_index,action)=>{
  actor.role='ADMIN';await expect(action()).rejects.toBeInstanceOf(ContentAuthorityError)
  expect(mocks.authority).not.toHaveBeenCalled();expect(mocks.snapshot).not.toHaveBeenCalled()
 })
 it('locks course, user, composite, delivery, grant then reads the clock; no admin shortcut',async()=>{
  await getTrainingReportDraft(context,draftId)
  const sql=mocks.tx.$queryRaw.mock.calls.map(call=>call[0].strings.join(' '))
  expect(sql[0]).toContain('FROM courses');expect(sql[1]).toContain('FROM users');expect(sql[2]).toContain('FROM composite_assessments');expect(sql[3]).toContain('FROM questionnaire_course_deliveries');expect(sql[4]).toContain('clock_timestamp()')
  expect(mocks.authority).toHaveBeenCalledWith(mocks.tx,{actorId:'teacher',grantId:context.grantId,capability:'report.edit',scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:'course',resourceKind:'report',resourceKeys:['composite']}})
 })
 it.each([{account_domain:'SURVEY'},{teacher_approved:false},{is_active:false},{is_frozen:true},{must_change_password:true},{expires_at:new Date('2020-01-01')}])('rejects stale business principal %j',async change=>{
  Object.assign(actor,change);await expect(getTrainingReportDraft(context,draftId)).rejects.toBeInstanceOf(ContentAuthorityError)
 })
 it('rejects foreign course/composite and dangling questionnaire courseId without delivery',async()=>{
  course.creator_id='other';await expect(getTrainingReportDraft(context,draftId)).rejects.toBeInstanceOf(ContentAuthorityError)
  course.creator_id='teacher';composite.created_by='other';await expect(getTrainingReportDraft(context,draftId)).rejects.toBeInstanceOf(ContentAuthorityError)
  composite.created_by='teacher';composite.course_id='course';delivery=[];await expect(getTrainingReportDraft(context,draftId)).rejects.toBeInstanceOf(ContentAuthorityError)
  composite.product_kind='LEGACY_COMPOSITE';await expect(getTrainingReportDraft(context,draftId)).resolves.toEqual(row)
 })
 it('creates only for verified mounted measurement and emits a private Training report without assets',async()=>{
  await createTrainingReportDraft(context,input())
  expect(mocks.snapshot).toHaveBeenCalledWith(mocks.tx,expect.objectContaining({id:'composite'}),new Map(),'HISTORICAL_INTERPRETATION')
  expect(mocks.tx.$queryRaw.mock.calls.some(call=>call[0].strings.join(' ').includes('create_input_hash,payload'))).toBe(true)
  mocks.snapshot.mockResolvedValueOnce({snapshot:{units:[]},releases:new Map()})
  await expect(createTrainingReportDraft(context,input())).rejects.toMatchObject({statusCode:404})
 })
 it('replays original creation after editing but rejects a changed body with the same UUID',async()=>{
  prior=[{...row,revision:3,payload:{...row.payload,language:'en'}}]
  expect(await createTrainingReportDraft(context,input())).toEqual(prior[0]);expect(mocks.snapshot).not.toHaveBeenCalled()
  await expect(createTrainingReportDraft(context,{...input(),version:'2'})).rejects.toMatchObject({statusCode:409})
 })
 it('CAS-rejects stale and published drafts and checks current edit capability after source locks',async()=>{
  row.revision=1;await expect(editTrainingReportDraft(context,draftId,{revision:0,payload:payload()})).rejects.toMatchObject({statusCode:409})
  row.revision=0;row.state='PUBLISHED';await expect(editTrainingReportDraft(context,draftId,{revision:0,payload:payload()})).rejects.toMatchObject({statusCode:409})
  row.state='DRAFT';mocks.authority.mockResolvedValueOnce({}).mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'))
  await expect(editTrainingReportDraft(context,draftId,{revision:0,payload:payload()})).rejects.toBeInstanceOf(ContentAuthorityError)
  expect(mocks.tx.$queryRaw.mock.calls.some(call=>call[0].strings.join(' ').includes('UPDATE training_report_drafts'))).toBe(false)
 })
 it('uses only synthetic preview and rejects arbitrary metrics, assets and audiences',async()=>{
  expect(await previewTrainingReportDraft(context,draftId,'INVALID')).toMatchObject({synthetic:true,scenario:'INVALID'})
  await expect(createTrainingReportDraft(context,{...input(),payload:{...payload(),metricKeys:['foreign']}})).rejects.toMatchObject({statusCode:400})
  await expect(createTrainingReportDraft(context,{...input(),payload:{...payload(),template:{blocks:[{type:'ASSET',assetId:'not-authorized',alt:'image'}]}}})).rejects.toThrow('REPORT_TEMPLATE_ASSET_UNKNOWN')
  for(const extra of [{audience:'student'},{assets:[{assetId:'forbidden'}]},{actorId:'other'}])await expect(createTrainingReportDraft(context,{...input(),payload:{...payload(),...extra}})).rejects.toThrow()
 })
 it('publishes using only report.publish and returns whitelisted release identity',async()=>{
  const result=await publishTrainingReportDraft(context,draftId,{revision:0,publicationNote:'Approved wording'})
  expect(result).toEqual({draftId,releaseId,contentHash:'c'.repeat(64),version:'1',status:'PUBLISHED',idempotent:false})
  expect(mocks.authority.mock.calls.every(call=>call[1].capability==='report.publish')).toBe(true)
  expect(mocks.publish).toHaveBeenCalledWith(mocks.tx,expect.objectContaining({layer:'REPORT',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},assetRefs:[]}), 'teacher','HISTORICAL_INTERPRETATION')
 })
 it('replays publication without re-reading mutable source and refuses changed note',async()=>{
  row.state='PUBLISHED';row.published_release_id=releaseId
  mocks.get.mockResolvedValue({releaseId,layer:'REPORT',version:'1',status:'RETIRED',contentHash:'c'.repeat(64),scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},provenance:{courseId:'course',draftId,publicationNote:'Approved wording'}})
  expect(await publishTrainingReportDraft(context,draftId,{revision:0,publicationNote:'Approved wording'})).toMatchObject({idempotent:true,releaseId})
  expect(mocks.snapshot).not.toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled()
  await expect(publishTrainingReportDraft(context,draftId,{revision:0,publicationNote:'Different wording'})).rejects.toMatchObject({statusCode:409})
 })
 it('uses one verified release cache for historical measurement selection and never loads answer facts',async()=>{
  const retired={...measurement(),status:'RETIRED'}
  mocks.snapshot.mockResolvedValue({snapshot:{units:[{measurement:{releaseId:measurementId,contentHash:retired.contentHash,measurementHash:retired.content.measurementHash}}]},releases:new Map([[measurementId,retired]])})
  expect(await listTrainingReportMeasurements(context)).toEqual([{id:measurementId,family:'SCALE',key:'scale',version:'1',status:'RETIRED',contentHash:retired.contentHash,metrics:retired.content.metrics}])
  await createTrainingReportDraft(context,input())
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.tx.$queryRaw.mock.calls.some(call=>/final|answer|attempt|submission/i.test(call[0].strings.join(' ')))).toBe(false)
 })
 it('rechecks list/read authorization after blocking reads and refuses revoked cached measurements',async()=>{
  mocks.authority.mockResolvedValueOnce({}).mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'))
  await expect(listTrainingReportDrafts(context)).rejects.toBeInstanceOf(ContentAuthorityError)
  mocks.snapshot.mockResolvedValue({snapshot:{units:[{measurement:{releaseId:measurementId,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}]},releases:new Map([[measurementId,{...measurement(),status:'REVOKED'}]])})
  await expect(createTrainingReportDraft(context,input())).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
 })
 it('keeps unknown storage faults as original errors rather than authorizing or disguising them',async()=>{
  const fault=new Error('database unavailable');mocks.tx.compositeAssessment.findUnique.mockRejectedValueOnce(fault)
  await expect(createTrainingReportDraft(context,input())).rejects.toBe(fault)
 })
})
