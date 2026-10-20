import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn(),execute:vi.fn(),authority:vi.fn(),release:vi.fn(),snapshots:vi.fn(),canonical:vi.fn(),formal:vi.fn(),disclosure:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
vi.mock('../../modules/measurement-content/formal-reference-resolver',()=>({resolveFormalReferenceRelease:mocks.formal}))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({loadStoredCanonicalUnitResults:mocks.canonical}))
vi.mock('../../modules/composite/training-metric-disclosure',async importOriginal=>({...await importOriginal<typeof import('../../modules/composite/training-metric-disclosure')>(),loadTrainingMetricDisclosure:mocks.disclosure}))
import {createTrainingReinterpretation,readTrainingReinterpretation,exportTrainingReinterpretation} from '../../modules/questionnaire-product/reinterpretation.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {contentAuthorityScopeSchema} from '../../modules/measurement-content/content-authority'
import {compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const c={actorId:id(1),courseId:id(2),compositeId:id(3),attemptId:id(4),grantId:id(5)}
const h='a'.repeat(64),rh='b'.repeat(64),itemId=id(6),measurementId=id(7),reportId=id(8),referenceId=id(9)
const input=()=>({requestId:id(10),itemId,reason:'Explicitly apply reviewed report',reportReleaseId:reportId,references:[{releaseId:referenceId,entryKey:referenceEntryKey(entry as never),priority:0}]})
const entry={scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{description:'local'},source:{citation:'synthetic'},statistics:{mean:2},limitations:[]}
const scope={kind:'PRIVATE',product:'TRAINING',ownerId:c.actorId,resourceId:c.compositeId}
const measurement=()=>({releaseId:measurementId,contentHash:h,version:'1',status:'PUBLISHED',layer:'MEASUREMENT',family:'SCALE',scope:{...scope,resourceId:id(11)},
 content:{measurementHash:h,instrumentVersion:'1',scoringVersion:'1',metrics:[{metricKey:'total',unit:'points'}]}})
const reference=()=>({releaseId:referenceId,contentHash:h,version:'2',status:'PUBLISHED',layer:'REFERENCE',family:'SCALE',scope,
 content:{measurement:{releaseId:measurementId,contentHash:h},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const report=()=>({releaseId:reportId,contentHash:h,version:'3',status:'PUBLISHED',layer:'REPORT',family:'SCALE',scope,assetRefs:[],
 content:{generatorVersion:'DECLARATIVE_REPORT_V1',audience:'teacher',measurements:[{releaseId:measurementId,contentHash:h}],metricKeys:['total'],
 template:{schemaVersion:1,title:'New wording',blocks:[{type:'METRIC',metricKey:'total',display:'RAW'}],limitations:[]}}})
let parent:any,course:any,user:any,task:any,delivery:any[],rows:Map<string,any>,receipt:any,envelope:any,releases:Map<string,any>,clock:Date
function saveReceipt(){parent.trainingContentInterpretationEncrypted=encryptUnifiedRuntimePayload(receipt);parent.trainingContentInterpretationHash=canonicalHash(receipt)}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));clock=new Date('2026-10-20T06:00:00Z');rows=new Map()
 mocks.disclosure.mockImplementation(async()=>({metricKeys:new Set(['total']),referenceMetricKeys:new Set(['total']),capabilities:DISCLOSURE_PRESETS.FULL_REPORT()}))
 course={creator_id:c.actorId,course_type:'TRAINING_COURSE',is_library:false};user={role:'TEACHER',teacher_approved:true,account_domain:'TRAINING',is_active:true,is_frozen:false,must_change_password:false,expires_at:null}
 task={created_by:c.actorId,course_id:null,product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE'};delivery=[{course_id:c.courseId}]
 const binding={schemaVersion:1,compositeId:c.compositeId,attemptId:c.attemptId,epoch:1,publicationHash:h,units:[{itemId,family:'SCALE',source:{kind:'SCALE',id:id(11),ownerId:c.actorId},measurement:{releaseId:measurementId,contentHash:h,measurementHash:h}}]}
 parent={id:c.attemptId,compositeAssessmentId:c.compositeId,deliveryCourseId:c.courseId,attemptEpoch:1,aggregateInputHash:h,trainingContentBinding:binding,
  trainingContentBindingHash:canonicalHash(binding),contextSnapshotEncrypted:null,contextSnapshotHash:null,assignmentRef:null,status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1'}
 receipt={schemaVersion:1,attemptId:c.attemptId,epoch:1,aggregateInputHash:h,contentBindingHash:parent.trainingContentBindingHash,generatedAt:'2026-10-20T00:00:00.000Z',sources:[{itemId,resultHash:rh}],
  interpretation:{schemaVersion:1,contentBindingHash:parent.trainingContentBindingHash,units:[{instrumentKey:itemId,status:'NOT_SELECTED',references:[],report:{status:'NOT_SELECTED'}}]}}
 saveReceipt()
 envelope={resultHash:rh,core:{unitType:'SCALE',instrumentVersion:'1',scorerVersion:'1',contextHash:null,quality:{status:'interpretable'},metrics:[{key:'total',value:5,quality:'calculated'}]},persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:id(12)}}
 mocks.canonical.mockImplementation(async()=>[envelope]);mocks.snapshots.mockResolvedValue([{compositeAttemptId:c.attemptId,attemptEpoch:1,slotKey:compositeItemSlotKey(itemId,'SCALE'),unitType:'SCALE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',canonicalResultEncrypted:'encrypted-unit',sourceType:'ASSESSMENT',sourceAttemptId:id(12),sourceSubmissionId:null}])
 releases=new Map([[measurementId,measurement()],[referenceId,reference()],[reportId,report()]])
 mocks.release.mockImplementation(async(_tx,id)=>releases.get(id));mocks.authority.mockResolvedValue({grantId:c.grantId,version:1})
 mocks.transaction.mockImplementation(async run=>run({$queryRaw:mocks.query,$executeRaw:mocks.execute,assessmentUnitSnapshot:{findMany:mocks.snapshots}}))
 mocks.query.mockImplementation(async query=>{
  const sql=query.strings.join(' '),values=query.values
  if(sql.includes('FROM courses'))return course?[course]:[]
  if(sql.includes('FROM users'))return user?[user]:[]
  if(sql.includes('FROM composite_assessments '))return task?[task]:[]
  if(sql.includes('FROM questionnaire_course_deliveries'))return delivery
  if(sql.includes('FROM composite_assessment_attempts'))return parent?[parent]:[]
  if(sql.includes('clock_timestamp()'))return [{now:clock}]
  if(sql.includes('INSERT INTO training_interpretation_artifacts')){
   const [id,course_id,composite_id,attempt_id,attempt_epoch,item_id,created_by,request_hash,source_aggregate_hash,source_binding_hash,source_receipt_hash,previous_artifact_id,artifact_cipher,artifact_hash]=values
   const row={id,course_id,composite_id,attempt_id,attempt_epoch,item_id,created_by,request_hash,source_aggregate_hash,source_binding_hash,source_receipt_hash,previous_artifact_id,artifact_cipher,artifact_hash,created_at:clock}
   rows.set(id,row);return [row]
  }
  if(sql.includes('FROM training_interpretation_artifacts'))return rows.has(values[0])?[rows.get(values[0])]:[]
  throw new Error('Unexpected SQL '+sql)
 })
})
afterEach(()=>vi.unstubAllEnvs())
describe('Training exact FINAL reinterpretation and independent 7B export',()=>{
 it('uses real receipt decode + shared interpreter/renderer, no raw mutation and one canonical read',async()=>{
  const before=JSON.stringify(parent),result=await createTrainingReinterpretation(c,input())
  expect(JSON.stringify(parent)).toBe(before);expect(result.artifact.sourceResultHash).toBe(rh)
  expect(result.artifact.previous).toEqual({kind:'FINAL_RECEIPT',hash:parent.trainingContentInterpretationHash})
  expect(result.artifact.interpretation.units[0].references[0]).toMatchObject({status:'AVAILABLE',values:{meanDifference:3}})
  expect(result.artifact.report?.blocks).toContainEqual(expect.objectContaining({value:5}))
  expect(mocks.canonical).toHaveBeenCalledTimes(1);expect(mocks.release).toHaveBeenCalledTimes(3)
  expect(mocks.authority).toHaveBeenCalledWith(expect.anything(),{actorId:c.actorId,grantId:c.grantId,capability:'data.reinterpret',scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:c.courseId,resourceKind:'data',resourceKeys:[c.attemptId]}})
  expect(rows.get(input().requestId).artifact_cipher).not.toContain('New wording')
 })
 it('serializes same-UUID retries and preserves artifact through normal retirement and error withdrawal',async()=>{
  const first=await createTrainingReinterpretation(c,input());mocks.canonical.mockClear()
  releases.get(reportId).status='REVOKED'
  const replay=await createTrainingReinterpretation(c,input())
  expect(replay.artifactHash).toBe(first.artifactHash);expect(replay.artifact).toEqual(first.artifact)
  expect(replay.currentUseStatus).toBe('REVOKED');expect(replay.lifecycleNotices).toContainEqual({layer:'REPORT',releaseId:reportId,status:'REVOKED'})
  expect(mocks.canonical).not.toHaveBeenCalled();expect(rows.size).toBe(1)
  expect(mocks.execute.mock.calls[0][0].sql).toContain('pg_advisory_xact_lock')
  await expect(createTrainingReinterpretation(c,{...input(),reason:'changed reason'})).rejects.toThrow('REQUEST_CONFLICT')
  await expect(createTrainingReinterpretation(c,{...input(),requestId:id(15)})).rejects.toThrow('REPORT_UNAVAILABLE')
 })
 it('retains predecessor chain without replacing either the original receipt or earlier artifact',async()=>{
  const first=await createTrainingReinterpretation(c,input()),second=await createTrainingReinterpretation(c,{...input(),requestId:id(15),previousArtifactId:first.artifactId})
  expect(second.artifact.previous).toEqual({kind:'INTERPRETATION',artifactId:first.artifactId,hash:first.artifactHash});expect(rows.size).toBe(2)
  expect((await readTrainingReinterpretation(c,first.artifactId)).artifactHash).toBe(first.artifactHash)
  await expect(createTrainingReinterpretation(c,{...input(),requestId:id(16),previousArtifactId:id(17)})).rejects.toThrow('PREVIOUS_IDENTITY')
 })
 it('exports a fixed schema/hash through fresh authority without rescoring and separates current notices',async()=>{
  await createTrainingReinterpretation(c,input());mocks.canonical.mockClear();mocks.authority.mockClear()
  const a=await exportTrainingReinterpretation(c,input().requestId)
  releases.get(referenceId).status='REVOKED'
  const b=await exportTrainingReinterpretation(c,input().requestId)
  expect(b.document).toEqual(a.document);expect(b.exportHash).toBe(a.exportHash);expect(a.exportHash).toBe(canonicalHash(a.document))
  expect(a.document.schema).toBe('TRAINING_INTERPRETATION_EXPORT_V1');expect(b.currentUseStatus).toBe('REVOKED')
  expect(mocks.authority).toHaveBeenCalledTimes(4);expect(mocks.canonical).not.toHaveBeenCalled()
  mocks.authority.mockRejectedValue(new Error('revoked capability'));await expect(exportTrainingReinterpretation(c,input().requestId)).rejects.toThrow('revoked capability')
 })
 it('rejects client actor, scores, population, path substitution and missing explicit selection',async()=>{
  for(const extra of [{actorId:c.actorId},{scores:[5]},{populationContext:{}},{attemptId:c.attemptId}])await expect(createTrainingReinterpretation(c,{...input(),...extra})).rejects.toThrow()
  await expect(createTrainingReinterpretation(c,{...input(),reportReleaseId:undefined,references:[]})).rejects.toThrow()
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it.each(['course','teacher','delivery','attemptCourse','incomplete','epoch','binding','relational','expired'])('rejects current scope/source failure %s before reading unit facts',async failure=>{
  if(failure==='course')course.creator_id=id(50)
  if(failure==='teacher')user.role='ADMIN'
  if(failure==='delivery')delivery=[]
  if(failure==='attemptCourse')parent.deliveryCourseId=id(50)
  if(failure==='incomplete')parent.status='IN_PROGRESS'
  if(failure==='epoch')parent.attemptEpoch=2
  if(failure==='binding')parent.trainingContentBindingHash=h
  if(failure==='relational')parent.assignmentRef=id(50)
  if(failure==='expired')user.expires_at=clock
  await expect(createTrainingReinterpretation(c,input())).rejects.toThrow();expect(mocks.canonical).not.toHaveBeenCalled();expect(rows.size).toBe(0)
 })
 it('rechecks capability after computation and before committing a new artifact',async()=>{
  mocks.authority.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('expired'))
  await expect(createTrainingReinterpretation(c,input())).rejects.toThrow('expired');expect(rows.size).toBe(0)
 })
 it('validates exact unit result hash, provenance, scorer and metric identities',async()=>{
  for(const corrupt of [()=>envelope.resultHash=h,()=>envelope.persistenceProvenance.sourceAttemptId=id(40),()=>envelope.core.scorerVersion='2',()=>envelope.core.metrics.push({key:'unknown',value:4})]){
   const old=JSON.stringify(envelope);corrupt();await expect(createTrainingReinterpretation(c,input())).rejects.toThrow();envelope=JSON.parse(old)
  }expect(rows.size).toBe(0)
 })
 it('does not invent execution for skipped units or turn invalid quality into a reference result',async()=>{
  receipt.sources=[];Object.assign(receipt.interpretation.units[0],{status:'UNAVAILABLE',reason:'NOT_EXECUTED'});saveReceipt()
  const result=await createTrainingReinterpretation(c,input());expect(result.artifact.report).toBeNull();expect(result.artifact.interpretation.units[0]).toMatchObject({reason:'NOT_EXECUTED',report:{status:'UNAVAILABLE'}})
  expect(mocks.canonical).not.toHaveBeenCalled()
 })
 it('keeps invalid metrics unavailable and rejects revoked new reference, measurement, foreign private content',async()=>{
  envelope.core.quality.status='invalid';const result=await createTrainingReinterpretation(c,input())
  expect(result.artifact.interpretation.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'QUALITY_UNAVAILABLE'})
  expect(result.artifact.report?.blocks).toContainEqual(expect.objectContaining({value:null,status:'INVALID'}))
  for(const releaseId of [measurementId,referenceId,reportId]){
   releases.get(releaseId).status='REVOKED';await expect(createTrainingReinterpretation(c,{...input(),requestId:id(20)})).rejects.toThrow();releases.get(releaseId).status='PUBLISHED'
  }
  releases.get(referenceId).scope={...scope,resourceId:id(30)};await expect(createTrainingReinterpretation(c,{...input(),requestId:id(20)})).rejects.toThrow('RELEASE_SCOPE')
 })
 it('keeps Cognitive engine and config version axes separate when verifying actual stored runtime facts',async()=>{
  const unit=parent.trainingContentBinding.units[0];unit.family='COGNITIVE';unit.source={kind:'COGNITIVE_CONFIG',id:id(11),assignmentId:id(13),ownerId:c.actorId}
  parent.trainingContentBindingHash=canonicalHash(parent.trainingContentBinding);receipt.contentBindingHash=parent.trainingContentBindingHash
  receipt.interpretation.contentBindingHash=parent.trainingContentBindingHash;saveReceipt()
  const m=releases.get(measurementId);m.family='COGNITIVE';m.scope.resourceId=id(13);m.content.instrumentVersion='config-1';m.content.runnerVersion='engine-2'
  releases.get(reportId).family='COGNITIVE';envelope.core.unitType='COGNITIVE';envelope.core.instrumentVersion='engine-2';envelope.persistenceProvenance.sourceType='COGNITIVE_SESSION'
  mocks.snapshots.mockResolvedValue([{compositeAttemptId:c.attemptId,attemptEpoch:1,slotKey:compositeItemSlotKey(itemId,'COGNITIVE'),unitType:'COGNITIVE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',canonicalResultEncrypted:'encrypted-unit',sourceType:'COGNITIVE_SESSION',sourceAttemptId:id(12),sourceSubmissionId:null}])
  const result=await createTrainingReinterpretation(c,{...input(),references:[]})
  expect(result.artifact.report?.blocks).toContainEqual(expect.objectContaining({value:5}))
  envelope.core.instrumentVersion='wrong-engine';await expect(createTrainingReinterpretation(c,{...input(),requestId:id(21),references:[]})).rejects.toThrow('FACT_IDENTITY')
 })
 it('detects corrupted immutable payload and source receipt changes on read',async()=>{
  const result=await createTrainingReinterpretation(c,input()),row=rows.get(result.artifactId)
  const value=decryptUnifiedRuntimePayload<any>(row.artifact_cipher);value.reason='tampered';row.artifact_cipher=encryptUnifiedRuntimePayload(value)
  await expect(readTrainingReinterpretation(c,result.artifactId)).rejects.toThrow('ARTIFACT_INTEGRITY')
 })
 it('allows data only for exact Training COURSE or Survey PROJECT, never blanket entry/platform scope',()=>{
  expect(contentAuthorityScopeSchema.parse({product:'TRAINING',scopeKind:'COURSE',scopeId:c.courseId,resourceKind:'data',resourceKeys:[c.attemptId]})).toBeDefined()
  for(const product of ['TRAINING','SURVEY','SCHOOL','TEACHER'])for(const scopeKind of ['PLATFORM','ORGANIZATION','PROJECT','COURSE']){
   if(product==='TRAINING'&&scopeKind==='COURSE'||product==='SURVEY'&&scopeKind==='PROJECT')continue
   expect(()=>contentAuthorityScopeSchema.parse({product,scopeKind,scopeId:c.courseId,resourceKind:'data',resourceKeys:[c.attemptId]})).toThrow()
  }
 })
})

it('explicit reinterpretation consumes a verified platform formal release without granting original private source access',async()=>{
 const ref=releases.get(referenceId);ref.scope={kind:'PLATFORM'}
 mocks.formal.mockResolvedValue({releaseId:referenceId,contentHash:h,measurementReleaseId:measurementId,status:'PUBLISHED',entries:[entry]})
 const made=await createTrainingReinterpretation(c,input())
 expect(made.artifact.interpretation.units[0].references[0]).toMatchObject({status:'AVAILABLE',values:{meanDifference:3}})
 expect(mocks.formal).toHaveBeenCalledWith(expect.anything(),{releaseId:referenceId,contentHash:h,measurementReleaseId:measurementId,purpose:'REINTERPRETATION'},ref)
 expect(JSON.stringify(made.artifact)).not.toMatch(/sampleManifest|sourceIds|reviewerGrant/)
 releases.get(measurementId).scope={...scope,ownerId:id(45),resourceId:id(11)}
 await expect(createTrainingReinterpretation(c,{...input(),requestId:id(55)})).rejects.toThrow('MEASUREMENT_UNAVAILABLE')
})
it('rejects an unreviewed PLATFORM label for explicit reinterpretation instead of inheriting use from a grant',async()=>{
 releases.get(referenceId).scope={kind:'PLATFORM'};mocks.formal.mockRejectedValue(new Error('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE'))
 await expect(createTrainingReinterpretation(c,input())).rejects.toThrow('FORMAL_REFERENCE_RELEASE_NOT_ELIGIBLE')
 expect(rows.size).toBe(0);expect(mocks.canonical).not.toHaveBeenCalled()
})

it('rejects an unauthorized numeric template even with report and reinterpret grants',async()=>{
 const metricKey='total'
 mocks.disclosure.mockResolvedValue({metricKeys:new Set(),referenceMetricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.NONE()})
 const before=JSON.stringify(parent)
 await expect(createTrainingReinterpretation(c,{...input(),references:[]})).rejects.toThrow('DISCLOSURE_DENIED')
 expect(rows.size).toBe(0);expect(JSON.stringify(parent)).toBe(before);expect(releases.get(reportId).content.metricKeys).toEqual([metricKey])
})
it('rejects reference-only disclosure where numeric scores are permitted but reference capability is not',async()=>{
 mocks.disclosure.mockResolvedValue({metricKeys:new Set(['total']),referenceMetricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.SCORES()})
 const {reportReleaseId:_reportReleaseId,...referenceOnly}=input()
 await expect(createTrainingReinterpretation(c,referenceOnly)).rejects.toThrow('DISCLOSURE_DENIED')
 expect(rows.size).toBe(0)
 const made=await createTrainingReinterpretation(c,{...input(),references:[]})
 expect(made.artifact.report?.blocks).toContainEqual(expect.objectContaining({value:5}))
})
it('rechecks frozen numeric disclosure for saved read, export and idempotent replay without rewriting ciphertext',async()=>{
 const made=await createTrainingReinterpretation(c,input()),row=rows.get(made.artifactId),before=JSON.stringify(row),sourceBefore=JSON.stringify(parent)
 mocks.canonical.mockClear()
 mocks.disclosure.mockResolvedValue({metricKeys:new Set(),referenceMetricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.NONE()})
 await expect(readTrainingReinterpretation(c,made.artifactId)).rejects.toThrow('DISCLOSURE_DENIED')
 await expect(exportTrainingReinterpretation(c,made.artifactId)).rejects.toThrow('DISCLOSURE_DENIED')
 await expect(createTrainingReinterpretation(c,input())).rejects.toThrow('DISCLOSURE_DENIED')
 expect(JSON.stringify(row)).toBe(before);expect(JSON.stringify(parent)).toBe(sourceBefore);expect(rows.size).toBe(1)
 expect(mocks.canonical).not.toHaveBeenCalled()
})
