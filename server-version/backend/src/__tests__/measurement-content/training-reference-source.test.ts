import {referenceConsentBodyHash} from '../../modules/measurement-content/reference-candidate'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const mocks=vi.hoisted(()=>({load:vi.fn(),release:vi.fn(),receipt:vi.fn(),authority:vi.fn(),query:vi.fn(),quality:vi.fn()}))
vi.mock('../../modules/training-analysis/source',()=>({loadTrainingAnalysisSources:mocks.load}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
vi.mock('../../modules/composite/training-content-final',()=>({decodeTrainingFinalReceipt:mocks.receipt}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
import {readTrainingReferenceSource,assertTrainingReferenceAuthority,trainingReferenceSelectorSchema} from '../../modules/training-analysis/reference-source'
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const context={actorId:id(1),courseId:id(2),compositeId:id(3),grantId:id(4)}
const selector={itemId:id(5),scoreKey:'total',publication:'2026-10-20T01:00:00.000Z',configDigest:null,variantKey:null}
const measurement={releaseId:id(6),layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',contentHash:'a'.repeat(64),
 content:{measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'score1',metrics:[{metricKey:'total'}]}}
const unit={itemId:selector.itemId,family:'SCALE',source:{kind:'SCALE',id:id(7),ownerId:context.actorId},
 measurement:{releaseId:id(6),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}
const headers=()=>Array.from({length:5},(_,i)=>{const binding={schemaVersion:1,compositeId:context.compositeId,attemptId:id(20+i),epoch:1,publicationHash:'e'.repeat(64),units:[unit]}
 return {id:id(20+i),attempt_epoch:1,training_content_binding:binding,training_content_binding_hash:canonicalHash(binding),
 aggregate_input_hash:'f'.repeat(64),training_content_interpretation_encrypted:'cipher',training_content_interpretation_hash:'c'.repeat(64)}})
const source=()=>({researchGovernance:[],manifest:{schemaVersion:1,courseId:context.courseId,selectorHash:'d'.repeat(64),authoritySnapshot:{},dictionary:[],exclusions:{IDENTITY_UNAVAILABLE:0},
 attempts:headers().map((h,i)=>({waveKey:'reference',taskId:context.compositeId,attemptId:h.id,attemptEpoch:1,status:'COMPLETED',taskSatisfaction:null,sourceHash:String(i).repeat(64),sourceHashes:{[selector.itemId]:'f'.repeat(64)}}))},
 source:{schemaVersion:1,courseId:context.courseId,observations:headers().map((h,i)=>({attemptId:h.id,attemptEpoch:1,itemId:selector.itemId,metricKey:'total',value:i+1,
 reason:null,measurementQuality:'interpretable',participantKind:'USER',participantKey:'user:'+i,sourceHashes:{[selector.itemId]:'f'.repeat(64)},
 measurement:{instrumentKey:'test',scoreKey:'total',version:'1',scoringDigest:'s',responseSignature:'r',respondentType:'SELF',unit:'points'}}))}})
let rows:ReturnType<typeof headers>,loaded:ReturnType<typeof source>
const tx={$queryRaw:mocks.query,trainingAnalysisQuality:{findMany:mocks.quality}} as any
beforeEach(()=>{vi.resetAllMocks();rows=headers();loaded=source();mocks.query.mockImplementation(async query=>{
 const sql=query.strings.join(' ')
 if(sql.includes('FROM composite_assessment_attempts'))return rows
 if(sql.includes('FROM anonymous_studies'))return []
 if(sql.includes('FROM courses'))return [{creator_id:context.actorId,course_type:'TRAINING_COURSE',is_library:false}]
 if(sql.includes('FROM users'))return [{role:'TEACHER',teacher_approved:true,account_domain:'TRAINING',is_active:true,is_frozen:false,must_change_password:false,expires_at:null}]
 if(sql.includes('FROM composite_assessments'))return [{created_by:context.actorId,course_id:context.courseId,product_kind:'LEGACY_COMPOSITE',questionnaire_type:null}]
 if(sql.includes('FROM questionnaire_course_deliveries'))return []
 if(sql.includes('clock_timestamp'))return [{now:new Date()}]
 throw new Error('Unexpected SQL '+sql)
 });mocks.load.mockImplementation(async()=>loaded);mocks.quality.mockResolvedValue([]);mocks.release.mockResolvedValue(measurement);
 mocks.receipt.mockReturnValue({sources:[{itemId:selector.itemId,resultHash:'f'.repeat(64)}]})})
describe('current Training source authority',()=>{
 it('requires real owned course, teacher, composite and explicit scientific capability',async()=>{
  await assertTrainingReferenceAuthority(tx,context,'reference.analyze')
  expect(mocks.authority).toHaveBeenCalledWith(tx,{actorId:context.actorId,grantId:context.grantId,capability:'reference.analyze',
   scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:context.courseId,resourceKind:'reference',resourceKeys:[context.compositeId]}})
  const queries=mocks.query.mock.calls.map(([q])=>q.strings.join(' '))
  expect(queries[0]).toContain('FROM courses');expect(queries[1]).toContain('FROM users');expect(queries.at(-1)).toContain('clock_timestamp')
 })
 it.each(['course','teacher','task','grant','expiry'])('rejects invalid %s before any source reader',async kind=>{
  const base=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async q=>{const sql=q.strings.join(' '),result=await base(q)
   if(kind==='course'&&sql.includes('FROM courses'))return [{...result[0],creator_id:'other'}]
   if(kind==='teacher'&&sql.includes('FROM users'))return [{...result[0],role:'ADMIN'}]
   if(kind==='task'&&sql.includes('FROM composite_assessments'))return [{...result[0],created_by:'other'}]
   if(kind==='expiry'&&sql.includes('FROM users'))return [{...result[0],expires_at:new Date(0)}]
   return result})
  if(kind==='grant')mocks.authority.mockRejectedValue(new Error('DENIED'))
  await expect(assertTrainingReferenceAuthority(tx,context,'reference.analyze')).rejects.toThrow();expect(mocks.load).not.toHaveBeenCalled()
 })
})
describe('trusted Training reference source',()=>{
 it('uses one frozen numeric source with exact FINAL receipt and no raw answers/scorer',async()=>{
  const result=await readTrainingReferenceSource(tx,context,selector)
  expect(result.eligible.map(x=>x.value)).toEqual([1,2,3,4,5]);expect(result.instrumentKey).toBe('test')
  expect(result.binding.sourceIds).toEqual(rows.map(row=>({attemptId:row.id,attemptEpoch:1})))
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith(tx,{userId:context.actorId,role:'TEACHER'},expect.objectContaining({courseId:context.courseId,
   waves:[expect.objectContaining({taskId:context.compositeId,metrics:[{itemId:selector.itemId,metricKey:'total'}]})]}),expect.objectContaining({authorityLock:'SHARE',fixedManifest:{attempts:expect.any(Array)}}))
  expect(mocks.release).toHaveBeenCalledTimes(1);expect(mocks.receipt).toHaveBeenCalledTimes(5)
  expect(result.eligible[0].factVersion).toBe(canonicalHash({sourceHash:'0'.repeat(64),bindingHash:rows[0].training_content_binding_hash,receiptHash:'c'.repeat(64)}))
  const sql=mocks.query.mock.calls[0][0].strings.join(' ');expect(sql).toContain('LIMIT 251 FOR SHARE');expect(sql).toContain("status='COMPLETED'")
 })
 it('replays only frozen IDs and fails changed evidence without admitting new FINALs',async()=>{
  const first=await readTrainingReferenceSource(tx,context,selector)
  expect((await readTrainingReferenceSource(tx,context,selector,first.binding)).binding).toEqual(first.binding)
  const query=mocks.query.mock.calls[2][0].strings.join(' ');expect(query).toContain('AND id IN')
  mocks.quality.mockResolvedValue([{attemptId:rows[0].id,attemptEpoch:1,sourceHash:'0'.repeat(64),verdict:'INCLUDE',revision:1,reviewedAt:new Date()}])
  await expect(readTrainingReferenceSource(tx,context,selector,first.binding)).rejects.toThrow('REFERENCE_TRAINING_SOURCE_CHANGED')
 })
 it.each(['binding','receipt','measurement','mixed','duplicate','withdrawal','quality','limited','metric','legacy'])('rejects unsafe %s sample',async kind=>{
  if(kind==='binding')rows[0].training_content_binding_hash='0'.repeat(64)
  if(kind==='receipt')mocks.receipt.mockReturnValue({sources:[{itemId:selector.itemId,resultHash:'0'.repeat(64)}]})
  if(kind==='measurement')mocks.release.mockResolvedValue({...measurement,status:'REVOKED'})
  if(kind==='mixed')loaded.source.observations[1].measurement.version='different'
  if(kind==='duplicate')loaded.source.observations[1].participantKey=loaded.source.observations[0].participantKey
  if(kind==='withdrawal'){loaded.source.observations[0].participantKind='STUDY_LOCAL';(loaded as any).researchGovernance=[{attemptId:rows[0].id,status:'WITHDRAWAL_PENDING',acceptanceId:'a',dataCategories:['SCALE']}];(loaded.source.observations[0] as any).researchCategory='SCALE'}
  if(kind==='quality')mocks.quality.mockResolvedValue([{attemptId:rows[0].id,attemptEpoch:1,sourceHash:'0'.repeat(64),verdict:'EXCLUDE',revision:1}])
  if(kind==='limited')loaded.source.observations[0].measurementQuality='limited'
  if(kind==='metric')(loaded.source.observations[0] as any).metricQuality='not_comparable'
  if(kind==='legacy'){(rows[0] as any).training_content_binding=null;(rows[0] as any).training_content_binding_hash=null}
  await expect(readTrainingReferenceSource(tx,context,selector)).rejects.toThrow()
 })
 it('returns only actual accepted aggregate consent scope summaries, never participant IDs',async()=>{
  const scope={purpose:'Course exploratory research only',dataCategories:['SCALE'],waveCoverage:'EXISTING_AND_FUTURE'},body='Use is limited to this course; no external sharing.',bodyHash=referenceConsentBodyHash(body),scopeHash=canonicalHash({scopeId:id(82),...scope})
  const observed=loaded.source.observations[0];observed.participantKind='STUDY_LOCAL';(observed as any).researchCategory='SCALE'
  ;(loaded as any).researchGovernance=[{attemptId:rows[0].id,status:'CONSENTED',acceptanceId:id(80),acceptedVersionId:id(81),studyId:id(82),bodyHash,scopeHash,dataCategories:['SCALE']}]
  const base=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async q=>q.strings.join(' ').includes('FROM anonymous_study_consent_versions')
   ?[{id:id(81),study_id:id(82),scope_id:id(82),version:2,scope_hash:scopeHash,scope,body,body_hash:bodyHash}]:base(q))
  const result=await readTrainingReferenceSource(tx,context,selector)
  expect(result.consentScopes).toEqual([{versionId:id(81),version:2,scopeHash,purpose:scope.purpose,dataCategories:['SCALE'],body,bodyHash}])
  expect(JSON.stringify(result.consentScopes)).not.toContain(rows[0].id)
  expect(result.consentCoveredSampleCount).toBe(1)
  ;(loaded as any).researchGovernance[0].bodyHash='f'.repeat(64)
  await expect(readTrainingReferenceSource(tx,context,selector)).rejects.toThrow('REFERENCE_TRAINING_SOURCE_CHANGED')
  ;(loaded as any).researchGovernance[0].bodyHash=bodyHash
  for(const change of [{body:body+' Altered'},{body_hash:'f'.repeat(64)},{scope_id:id(99)}]){
   mocks.query.mockImplementation(async q=>q.strings.join(' ').includes('FROM anonymous_study_consent_versions')
    ?[{id:id(81),study_id:id(82),scope_id:id(82),version:2,scope_hash:scopeHash,scope,body,body_hash:bodyHash,...change}]:base(q))
   await expect(readTrainingReferenceSource(tx,context,selector)).rejects.toThrow('REFERENCE_TRAINING_SOURCE_CHANGED')
  }
 })
 it('enforces source and privacy bounds and does not silently truncate',async()=>{
  rows=Array.from({length:251},(_,i)=>({...headers()[0],id:id(100+i)}))
  await expect(readTrainingReferenceSource(tx,context,selector)).rejects.toThrow('REFERENCE_TRAINING_SAMPLE_BOUND');expect(mocks.load).not.toHaveBeenCalled()
 })
 it('forbids actor, values, sample or mixed variant selectors',()=>{
  for(const extra of [{actorId:context.actorId},{sampleIds:[]},{statistics:{mean:1}},{measurementReleaseId:id(6)},{configDigest:'a'.repeat(64)}])
   expect(()=>trainingReferenceSelectorSchema.parse({...selector,...extra})).toThrow()
 })
})
