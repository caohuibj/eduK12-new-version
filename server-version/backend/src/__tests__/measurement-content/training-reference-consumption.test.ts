import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),formal:vi.fn(),disclosure:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/measurement-content/formal-reference-resolver',()=>({resolveFormalReferenceRelease:mocks.formal}))
vi.mock('../../modules/composite/training-metric-disclosure',async importOriginal=>({...await importOriginal<typeof import('../../modules/composite/training-metric-disclosure')>(),loadTrainingMetricDisclosure:mocks.disclosure}))
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {attachTrainingReferenceSelection,listTrainingReferenceChoices,trainingReferenceSelectionSchema} from '../../modules/composite/training-reference-selection'
import {freezeTrainingReferenceBinding,decodeTrainingReferenceBinding} from '../../modules/composite/training-reference-binding'
import {prepareTrainingFinalReceipt,decodeTrainingFinalReceipt} from '../../modules/composite/training-content-final'
import {readTrainingContentReports} from '../../modules/composite/training-content-report'
import {prepareRelease,type ReleaseInput} from '../../modules/measurement-content/release'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createCanonicalUnitResultEnvelope,projectScaleCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {encryptAssessmentContext,hashAssessmentContext} from '../../modules/assessment-context'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const mid=id(1),rid=id(2),reportId=id(3),itemId=id(4),h='a'.repeat(64),now='2026-10-20T00:00:00.000Z'
const privateScope={kind:'PRIVATE' as const,product:'TRAINING' as const,ownerId:'teacher',resourceId:'composite'}
function fixture(){
 const entry:any={scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{description:'Authorized observed sample'},source:{citation:'Synthetic fixture only',sampleSize:20},statistics:{mean:2},limitations:['Synthetic fixture, not a scientific norm']}
 const measurement:any={...prepareRelease({layer:'MEASUREMENT',family:'SCALE',key:'m',version:'1',scope:{...privateScope,resourceId:'scale'},assetRefs:[],sourceReleaseId:null,
  content:{projectionVersion:1,instrumentVersion:'1',measurementHash:h,measurementHashScheme:'test',scoringVersion:'1',runnerKey:'test',runnerVersion:'1',locale:'zh-CN',localizationVersion:'1',metrics:[{metricKey:'total',unit:'points',direction:'descriptive'}],executable:{}}}),releaseId:mid,status:'PUBLISHED'}
 const reference:any={...prepareRelease({layer:'REFERENCE',family:'SCALE',key:'r',version:'1',scope:privateScope,assetRefs:[],sourceReleaseId:null,
  content:{projectionVersion:1,measurement:{releaseId:mid,contentHash:measurement.contentHash},entries:[{metricKey:'total',referenceKind:entry.referenceKind,definition:entry}],evidence:{sampleCount:20}}}),releaseId:rid,status:'PUBLISHED'}
 const report:any={...prepareRelease({layer:'REPORT',family:'SCALE',key:'report',version:'1',scope:privateScope,assetRefs:[],sourceReleaseId:null,
  content:{projectionVersion:1,measurements:[{releaseId:mid,contentHash:measurement.contentHash}],metricKeys:['total'],audience:'teacher',language:'zh-CN',generatorVersion:'DECLARATIVE_REPORT_V1',
   template:{title:'Frozen interpretation',blocks:[{type:'METRIC',metricKey:'total',display:'RAW'}],limitations:[]}}}),releaseId:reportId,status:'PUBLISHED'}
 const unit:any={itemId,family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'teacher'},measurement:{releaseId:mid,contentHash:measurement.contentHash,measurementHash:h}}
 const snapshot:any={schemaVersion:1,compositeId:'composite',units:[unit]},releases=new Map<string,any>([[mid,measurement],[rid,reference],[reportId,report]])
 const selection=()=>({schemaVersion:1,units:[{itemId,choices:[{releaseId:rid,entryKey:referenceEntryKey(entry),priority:5}]}]})
 mocks.get.mockImplementation(async(_tx,key)=>releases.get(key))
 const update=vi.fn().mockResolvedValue({count:1}),db={compositeAssessmentAttempt:{updateMany:update},$queryRaw:vi.fn()}
 const parent=(publication:any)=>({id:'attempt',attemptEpoch:1,compositeAssessmentId:'composite',compositeAssessment:{id:'composite',createdBy:'teacher'},contextSnapshotEncrypted:null,contextSnapshotHash:null,
  trainingContentBinding:{...publication.snapshot,attemptId:'attempt',epoch:1,publicationHash:publication.snapshotHash},trainingContentBindingHash:'',trainingReferenceBinding:null,trainingReferenceBindingHash:null})
 const publish=()=>attachTrainingReferenceSelection(db as never,{snapshot,releases:new Map([[mid,measurement]]),ownerId:'teacher',selection:selection()})
 const start=async(contextValues?:any)=>{
  const publication=await publish(),p:any=parent(publication);p.trainingContentBindingHash=canonicalHash(p.trainingContentBinding)
  let frozen:any
  if(contextValues){const context={schemaVersion:1 as const,frozenAt:now,values:contextValues};frozen={context,hash:hashAssessmentContext(context)};p.contextSnapshotEncrypted=encryptAssessmentContext(context);p.contextSnapshotHash=frozen.hash}
  const bound=await freezeTrainingReferenceBinding(db as never,p,frozen)
  p.trainingReferenceBinding=bound;p.trainingReferenceBindingHash=canonicalHash(bound)
  return p
 }
 return {entry,measurement,reference,report,unit,snapshot,releases,selection,db,update,publish,start,parent}
}
function rehash(release:any){const {releaseId,status,hashScheme:_hashScheme,contentHash:_contentHash,...raw}=release;Object.assign(release,prepareRelease(raw as ReleaseInput),{releaseId,status})}
function result(parent:any,quality='interpretable'){
 const runtime:any={schemaVersion:1,compilerVersion:'fixture',instrumentType:'SCALE',instrumentKey:'demo',instrumentVersion:'1',sourceDefinitionHash:h,
  compiledRuntimeHash:h,scorerKey:'demo',scorerVersion:'1',metricDefinitions:{total:{unit:'points'}},aggregateProjection:{allowedMetricKeys:['total'],allowedFactKeys:[],allowedReferenceClassifications:[]}}
 const core=projectScaleCanonicalUnitResult({runtime,contextHash:parent.contextSnapshotHash,result:{quality:{status:quality,flags:[]},scores:[{key:'total',value:5,status:'calculated'}],references:[]} as any})
 return createCanonicalUnitResultEnvelope({core,completedAt:now,persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:'child'}})
}
const finalInput=(parent:any,envelope=result(parent))=>({parent,aggregateInputHash:h,completedAt:now,verifiedPayloads:[{header:{slotKey:`scale:${itemId}`},envelope}]})
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));mocks.disclosure.mockResolvedValue({
 metricKeys:new Set(['total']),referenceMetricKeys:new Set(['total']),capabilities:DISCLOSURE_PRESETS.FULL_REPORT()})})
afterEach(()=>vi.unstubAllEnvs())
describe('explicit Training reference choices and publication policy',()=>{
 it('explicitly freezes a same-owner same-course producer release into a new draft and START, retaining original provenance',async()=>{
  const f=fixture();f.reference.scope={...privateScope,resourceId:'source-composite'};f.reference.provenance={candidateId:id(8),reviewId:id(9)};rehash(f.reference)
  let started=false
  f.db.$queryRaw.mockImplementation(async(sql:any)=>{
   const q=sql.strings.join('')
   if(q.includes('FROM training_reference_requests'))return [{course_id:'course',composite_id:'source-composite'}]
   if(q.includes('FROM composite_assessments'))return [
    {id:'source-composite',created_by:'teacher',status:'PUBLISHED',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:new Date(now)},
    {id:'composite',created_by:'teacher',status:started?'PUBLISHED':'DRAFT',product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE',public_enabled:false,published_at:started?new Date(now):null}]
   if(q.includes('FROM questionnaire_course_deliveries'))return [{composite_id:'source-composite',course_id:'course'},{composite_id:'composite',course_id:'course'}]
   if(q.includes('FROM courses'))return [{creator_id:'teacher',course_type:'TRAINING_COURSE',is_library:false}]
   if(q.includes('FROM users'))return [{role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:null}]
   if(q.includes('clock_timestamp'))return [{now:new Date(now)}]
   throw new Error('unexpected private course query')
  })
  const publication=await f.publish(),parent:any=f.parent(publication);parent.trainingContentBindingHash=canonicalHash(parent.trainingContentBinding);started=true
  const binding=await freezeTrainingReferenceBinding(f.db as never,parent)
  expect(binding!.units[0].references[0]).toMatchObject({status:'SELECTED',releaseId:rid,contentHash:f.reference.contentHash})
  expect(f.reference.scope.resourceId).toBe('source-composite');expect(JSON.stringify(publication.snapshot)).not.toMatch(/sampleManifest|statistics|course_id/)
 })
 it('projects exact hash/metric/kind from stored release and never embeds aggregate statistics or sample IDs',async()=>{
  const f=fixture(),p=await f.publish()
  expect(p.snapshot.units[0].referencePolicy).toEqual({policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:mid,choices:[{...f.selection().units[0].choices[0],contentHash:f.reference.contentHash,metricKey:'total',referenceKind:'descriptive_sample'}]})
  expect(p.snapshotHash).toBe(canonicalHash(p.snapshot));expect(JSON.stringify(p.snapshot)).not.toMatch(/statistics|sampleManifest|sampleIds/)
  expect(f.snapshot.units[0]).not.toHaveProperty('referencePolicy')
 })
 it('requires unique items and choices, safe integer priorities, and no authoritative client hash/context',()=>{
  const f=fixture(),s=f.selection()
  for(const invalid of [{...s,units:[...s.units,...s.units]},{...s,units:[{...s.units[0],choices:[...s.units[0].choices,...s.units[0].choices]}]},
   {...s,units:[{...s.units[0],choices:[{...s.units[0].choices[0],priority:0.1}]}]},
   {...s,units:[{...s.units[0],choices:[{...s.units[0].choices[0],contentHash:h}]}]}, {...s,populationContext:{gradeLevel:'1'}}])expect(()=>trainingReferenceSelectionSchema.parse(invalid)).toThrow()
 })
 it.each([{ownerId:'foreign'},{resourceId:'other'},{product:'SURVEY'},{kind:'SHARED'}])('does not let private reference scope escape %j',async patch=>{
  const f=fixture();f.reference.scope={...privateScope,...patch};await expect(f.publish()).rejects.toThrow('SCOPE_DENIED');expect(mocks.formal).not.toHaveBeenCalled()
 })
 it.each(['SUPERSEDED','RETIRED','REVOKED'])('rejects %s for a new publication',async status=>{const f=fixture();f.reference.status=status;await expect(f.publish()).rejects.toThrow('UNAVAILABLE')})
 it('requires independently verified formal publication and never treats platform status as private measurement permission',async()=>{
  const f=fixture();f.reference.scope={kind:'PLATFORM'};mocks.formal.mockRejectedValueOnce(new Error('formal review missing'))
  await expect(f.publish()).rejects.toThrow('formal review missing')
  mocks.formal.mockResolvedValue({releaseId:rid,contentHash:f.reference.contentHash,measurementReleaseId:mid,status:'PUBLISHED',entries:[f.entry]})
  const p=await f.publish();expect(p.snapshot.units[0].measurement).toEqual(f.unit.measurement)
  expect(mocks.formal).toHaveBeenLastCalledWith(f.db,expect.objectContaining({releaseId:rid,purpose:'NEW_BINDING'}),f.reference)
 })
 it('lists only aggregate-compatible choices and published compatible owner reports',async()=>{
  const f=fixture();f.db.$queryRaw.mockImplementation(async q=>q.strings.join(' ').includes("layer='REPORT'")?[{id:reportId}]:[{id:rid}])
  const data=await listTrainingReferenceChoices(f.db as never,{snapshot:f.snapshot,releases:new Map([[mid,f.measurement]]),ownerId:'teacher'})
  expect(data.units[0]).toMatchObject({itemId,choices:[{releaseId:rid,entryKey:referenceEntryKey(f.entry),version:'1',scope:'PRIVATE'}],reports:[{releaseId:reportId,audience:'teacher',title:'Frozen interpretation'}]})
  expect(JSON.stringify(data)).not.toMatch(/sampleManifest|sourceIds|analyzerId|statistics|contentHash/)
  expect(f.db.$queryRaw.mock.calls[0][0].values).toContain('teacher');expect(f.db.$queryRaw.mock.calls[0][0].values).toContain('composite')
  f.reference.scope={...privateScope,ownerId:'foreign'}
  const denied=await listTrainingReferenceChoices(f.db as never,{snapshot:f.snapshot,releases:new Map([[mid,f.measurement]]),ownerId:'teacher'})
  expect(denied.units[0].choices).toEqual([])
 })
})
describe('one reference selection at actual measurement START',()=>{
 it('truthfully downgrades missing population and never reads a profile or joins new candidates',async()=>{
  const f=fixture();f.entry.population.match={gradeLevels:['1']};rehash(f.reference)
  const p=await f.start();expect(p.trainingReferenceBinding.units[0].references).toEqual([{metricKey:'total',referenceKind:'descriptive_sample',status:'UNAVAILABLE',reason:'MISSING_CONTEXT'}])
  expect(p.trainingReferenceBinding.contextHash).toBeNull();expect(mocks.get.mock.calls.map(c=>c[1])).toEqual([rid,rid])
  expect(JSON.stringify(p.trainingReferenceBinding)).not.toContain('gradeLevel')
 })
 it('uses verified frozen demographics once; retry remains stable after withdrawal and new population/profile data',async()=>{
  const f=fixture();f.entry.population.match={gradeLevels:['1']};rehash(f.reference)
  const p=await f.start({gradeLevel:'1'}),before=canonicalHash(p.trainingReferenceBinding);mocks.get.mockClear();f.update.mockClear();f.reference.status='REVOKED'
  expect((await freezeTrainingReferenceBinding(f.db as never,p))?.units[0].references[0].status).toBe('SELECTED')
  expect(canonicalHash(p.trainingReferenceBinding)).toBe(before);expect(mocks.get).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled()
  const changed={schemaVersion:1 as const,frozenAt:now,values:{gradeLevel:'2' as const}}
  await expect(freezeTrainingReferenceBinding(f.db as never,p,{context:changed,hash:hashAssessmentContext(changed)})).rejects.toThrow('BINDING_IDENTITY')
 })
 it.each(['REVOKED','RETIRED'] as const)('turns a frozen candidate %s before START into explicit unavailability',async status=>{
  const f=fixture(),publication=await f.publish(),p:any=f.parent(publication);p.trainingContentBindingHash=canonicalHash(p.trainingContentBinding);f.reference.status=status
  const bound=await freezeTrainingReferenceBinding(f.db as never,p)
  expect(bound?.units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:status})
 })
 it('preserves exact identity after normal supersession and rejects substituted hashes or missing frozen release',async()=>{
  const f=fixture(),publication=await f.publish(),p:any=f.parent(publication);p.trainingContentBindingHash=canonicalHash(p.trainingContentBinding);f.reference.status='SUPERSEDED'
  expect((await freezeTrainingReferenceBinding(f.db as never,p))?.units[0].references[0].status).toBe('SELECTED')
  f.reference.contentHash='b'.repeat(64);await expect(freezeTrainingReferenceBinding(f.db as never,p)).rejects.toThrow('UNAVAILABLE')
  f.releases.delete(rid);await expect(freezeTrainingReferenceBinding(f.db as never,p)).rejects.toThrow('UNAVAILABLE')
 })
 it('rejects tampered selection even with a recalculated outer hash, and does not backfill old absent policies',async()=>{
  const f=fixture(),p=await f.start();p.trainingReferenceBinding.units[0].references[0].releaseId=id(90);p.trainingReferenceBindingHash=canonicalHash(p.trainingReferenceBinding)
  expect(()=>decodeTrainingReferenceBinding(p)).toThrow('BINDING_IDENTITY')
  delete f.unit.referencePolicy;const old:any=f.parent({snapshot:f.snapshot,snapshotHash:canonicalHash(f.snapshot)});old.trainingContentBindingHash=canonicalHash(old.trainingContentBinding);f.update.mockClear()
  expect(await freezeTrainingReferenceBinding(f.db as never,old)).toBeNull();expect(f.update).not.toHaveBeenCalled()
 })
 it('refuses a lost CAS rather than treating an unpersisted binding as successful',async()=>{
  const f=fixture();f.update.mockResolvedValue({count:0});await expect(f.start()).rejects.toThrow('BINDING_CONFLICT')
 })
})
describe('single-scored FINAL facts and frozen authorized interpretation consumption',()=>{
 it('creates compact V2 numeric interpretation and reads it without scorer or release lookup',async()=>{
  const f=fixture(),p=await f.start(),envelope=result(p),before=canonicalHash(envelope),receipt=(await prepareTrainingFinalReceipt(f.db as never,finalInput(p,envelope)))!
  expect(receipt.receipt).toMatchObject({schemaVersion:2,referenceBindingHash:p.trainingReferenceBindingHash,interpretation:{units:[{references:[{status:'AVAILABLE',values:{meanDifference:3}}]}]}})
  expect(canonicalHash(envelope)).toBe(before);expect(JSON.stringify(receipt.receipt)).not.toMatch(/sampleManifest|"metrics"|"template"/)
  mocks.get.mockClear();const read=decodeTrainingFinalReceipt({...p,aggregateInputHash:h,trainingContentInterpretationEncrypted:receipt.encrypted,trainingContentInterpretationHash:receipt.hash})
  expect(read).toEqual(receipt.receipt);expect(mocks.get).not.toHaveBeenCalled()
 })
 it('keeps skipped, invalid-quality and reference revocation unavailable without rescoring or blocking raw identity',async()=>{
  const f=fixture(),p=await f.start()
  expect((await prepareTrainingFinalReceipt(f.db as never,{...finalInput(p),verifiedPayloads:[]}))!.receipt.interpretation.units[0]).toMatchObject({reason:'NOT_EXECUTED',references:[{status:'UNAVAILABLE'}]})
  expect((await prepareTrainingFinalReceipt(f.db as never,finalInput(p,result(p,'invalid'))))!.receipt.interpretation.units[0]).toMatchObject({reason:'QUALITY_UNAVAILABLE',references:[{status:'UNAVAILABLE'}]})
  f.reference.status='REVOKED';expect((await prepareTrainingFinalReceipt(f.db as never,finalInput(p)))!.receipt.interpretation.units[0].references[0].status).toBe('REVOKED')
 })
 it('requires exact reference receipt/context hash and cannot silently decode a V2 receipt as old V1',async()=>{
  const f=fixture(),p=await f.start(),saved=(await prepareTrainingFinalReceipt(f.db as never,finalInput(p)))!
  const parent={...p,aggregateInputHash:h,trainingContentInterpretationEncrypted:saved.encrypted,trainingContentInterpretationHash:saved.hash}
  expect(()=>decodeTrainingFinalReceipt({...parent,trainingReferenceBindingHash:'f'.repeat(64)})).toThrow()
  const bad={...saved.receipt,schemaVersion:1};delete (bad as any).referenceBindingHash
  expect(()=>decodeTrainingFinalReceipt({...parent,trainingContentInterpretationEncrypted:encryptUnifiedRuntimePayload(bad),trainingContentInterpretationHash:canonicalHash(bad)})).toThrow()
 })
 it('renders band text from the saved FINAL interpretation; current withdrawal suppresses that band, not raw facts',async()=>{
  const f=fixture();f.entry.referenceKind='criterion_threshold';f.entry.statistics={thresholds:[{key:'high',label:'High',minInclusive:3}]};f.reference.content.entries[0].referenceKind='criterion_threshold';f.reference.content.entries[0].definition=f.entry;rehash(f.reference)
  f.report.content.template.blocks.push({type:'REFERENCE_BAND',metricKey:'total',referenceKind:'criterion_threshold',bandKey:'high',text:'Chosen frozen band'})
  rehash(f.report);f.unit.report={releaseId:reportId,contentHash:f.report.contentHash}
  const p=await f.start(),envelope=result(p),saved=(await prepareTrainingFinalReceipt(f.db as never,finalInput(p,envelope)))!
  expect(saved.receipt.interpretation.units[0].references[0]).toMatchObject({status:'AVAILABLE',values:{bandKey:'high'}})
  const parent={...p,aggregateInputHash:h,trainingContentInterpretationEncrypted:saved.encrypted,trainingContentInterpretationHash:saved.hash}
  const db={...f.db,assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([{compositeAttemptId:p.id,attemptEpoch:1,slotKey:`scale:${itemId}`,unitType:'SCALE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',canonicalResultEncrypted:encryptUnifiedRuntimePayload(envelope),sourceType:'ASSESSMENT',sourceAttemptId:'child',sourceSubmissionId:null}])}}
  const before=parent.trainingContentInterpretationHash,a=await readTrainingContentReports(db as never,{parent,audience:'teacher'})
  expect(a[0].rendered?.blocks).toContainEqual(expect.objectContaining({text:'Chosen frozen band'}))
  f.reference.status='REVOKED';const b=await readTrainingContentReports(db as never,{parent,audience:'teacher'})
  expect(b[0].rendered?.blocks).not.toContainEqual(expect.objectContaining({text:'Chosen frozen band'}));expect(b[0].rendered?.blocks).toContainEqual(expect.objectContaining({value:5}))
  expect(b[0].lifecycleNotices).toContainEqual({layer:'REFERENCE',releaseId:rid,status:'REVOKED'});expect(parent.trainingContentInterpretationHash).toBe(before)
  expect(await readTrainingContentReports(db as never,{parent,audience:'participant'})).toEqual([])
 })
})
