import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {createCanonicalFieldEvidence,readCanonicalFieldEvidence} from '../../modules/huiteacher/fieldComposition.evidence'
import {fieldParticipantKey,type FieldAttemptIdentity} from '../../modules/huiteacher/fieldComposition.contract'
import {educationCompositionOriginSchema,educationCompositionKey} from '../../modules/education-tools/private-tool.composition-contracts'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
const m=vi.hoisted(()=>({current:vi.fn(),reader:vi.fn(),canonical:vi.fn()}))
vi.mock('../../modules/huiteacher/fieldComposition.authority',async original=>({...await original<typeof import('../../modules/huiteacher/fieldComposition.authority')>(),currentFieldComposition:m.current}))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage',()=>({createStoredScaleFactsReader:m.reader,loadStoredCanonicalUnitResults:m.canonical}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin=educationCompositionOriginSchema.parse({schemaVersion:2,adapterVersion:'2.0.0',mode:'COMPOSITION',entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'TEACHER:EXPERT_REPORT',targetKind:'PERSON'})
const scope:FieldAttemptIdentity={organizationId:id(1),eventId:id(6),targetId:id(7),invitationId:id(8),acceptedAt:'2026-10-29T00:00:00.123Z',subjectUserId:id(10),respondentUserId:id(9),
 assessmentRef:{schemaVersion:1,kind:'COMPOSITION',compositeId:id(5),resourceKey:educationCompositionKey(origin),resourceVersion:'2.0.0',manifestHash:'b'.repeat(64),origin}}
const item=id(20),section=id(21),attempt=id(22),record=id(23),hash='c'.repeat(64)
let parent:any,snapshots:any[],children:any[],declarations:any[],stored:any
const save=vi.fn(),query=vi.fn(),getParent=vi.fn(),getSnapshots=vi.fn(),getChildren=vi.fn()
const tx={compositeAssessmentAttempt:{findUnique:getParent},assessmentUnitSnapshot:{findMany:getSnapshots},compositeFormSectionAttempt:{findMany:async()=>[{id:section,sectionId:section,submissionId:id(30)}]},assessment:{findMany:getChildren},huiteacherFieldFormEvidence:{create:save},$queryRaw:query} as unknown as Prisma.TransactionClient
const input={recordId:record,organizationId:scope.organizationId,eventId:scope.eventId,actorUserId:scope.respondentUserId,attemptId:attempt}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','55'.repeat(32));vi.stubEnv('ASSESSMENT_COMPACT_STORAGE_ENABLED','false')
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[
  {slotKey:'form-section:'+section,unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:'form',version:'3',hash},sourceBinding:{formSectionId:section}},
  {slotKey:'scale:'+item,unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'scale',version:'1',hash},sourceBinding:{compositeItemId:item}},
 ]})
 parent={id:attempt,status:'COMPLETED',userId:scope.respondentUserId,respondentUserId:scope.respondentUserId,subjectUserId:scope.subjectUserId,participantKey:fieldParticipantKey(scope),attemptEpoch:1,assignmentRef:null,contextSnapshotHash:null,compositeAssessmentId:scope.assessmentRef.compositeId,frozenActiveSlotSetHash:slots.snapshotHash,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots)}
 snapshots=[{slotKey:'form-section:'+section,unitType:'FORM_SECTION',terminalState:'COMPLETED',sourceType:'FORM_SECTION',sourceAttemptId:section,sourceSubmissionId:id(30),sourceDefinitionHash:hash,compiledRuntimeHash:null,canonicalResultEncrypted:null,
  collectionFactsEncrypted:encryptUnifiedRuntimePayload({schemaVersion:3,sectionKey:section,items:[{key:'expert-comment',label:'专业观察',state:'ANSWERED',value:'other',otherText:'EXPERT professional text'},
   {key:'matrix',label:'逐行观察',state:'ANSWERED',value:{one:0},rowStates:{one:'ANSWERED',two:'REFUSED'}}]})},
 {slotKey:'scale:'+item,unitType:'SCALE',terminalState:'COMPLETED',sourceType:'ASSESSMENT',sourceAttemptId:id(31),sourceSubmissionId:id(32),sourceDefinitionHash:hash,compiledRuntimeHash:'d'.repeat(64),canonicalResultEncrypted:encryptUnifiedRuntimePayload({canonical:'native-result'}),collectionFactsEncrypted:null}]
 children=[{id:id(31),compositeItemId:item,submissionId:id(32),userId:scope.respondentUserId,respondentUserId:scope.respondentUserId,subjectUserId:scope.subjectUserId}]
 declarations=[{itemId:item,audience:'teacher',respondent:'OBSERVER_REPORT',scores:[{key:'zero',label:'Observed zero'},{key:'missing',label:'Missing'},{key:'private',label:'Private'}],allowed:['zero','missing']}]
 stored={core:{unitType:'SCALE',sourceDefinitionHash:hash,compiledRuntimeHash:'d'.repeat(64),contextHash:null,quality:{status:'valid'},metrics:[{key:'zero',value:0},{key:'missing',value:null,quality:'not_calculable'},{key:'private',value:99}]},persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:id(31),sourceSubmissionId:id(32)}}
 getParent.mockImplementation(async()=>parent);getSnapshots.mockImplementation(async()=>snapshots);getChildren.mockImplementation(async()=>children)
 query.mockImplementation(async sql=>sql.sql.includes('SELECT b->')?declarations:[{id:attempt,attemptEpoch:1}]);save.mockImplementation(async({data})=>data)
 m.current.mockResolvedValue({scope});m.reader.mockResolvedValue({});m.canonical.mockImplementation(async()=>[stored])
})
afterEach(()=>vi.unstubAllEnvs())
describe('Formal expert evidence consumes the exact durable native final',()=>{
 it('preserves expert Form text/row refusal and canonical zero/null while excluding undeclared scale metrics, interpretations and raw identity',async()=>{
  const result=await createCanonicalFieldEvidence(tx,input),row=save.mock.calls[0][0].data
  expect(m.current).toHaveBeenCalledWith(tx,{actorUserId:scope.respondentUserId,eventId:scope.eventId,lock:true})
  expect(result).toMatchObject({attemptId:attempt,attemptEpoch:1});expect(row.formId).toBeNull();expect(row.definitionDigest).toBeNull()
  expect(row.answersCipher).not.toContain('EXPERT professional text')
  const view=await readCanonicalFieldEvidence(tx,row)
  expect(view.units).toEqual([{kind:'FORM',unitId:'form-section:'+section,items:[{key:'expert-comment',prompt:'专业观察',state:'ANSWERED',value:'other',otherText:'EXPERT professional text'},
   {key:'matrix',prompt:'逐行观察',state:'ANSWERED',value:{one:0},rowStates:{one:'ANSWERED',two:'REFUSED'}}]},
  {kind:'SCALE',unitId:'scale:'+item,state:'DESCRIPTIVE',metrics:[{key:'zero',label:'Observed zero',value:0},{key:'missing',label:'Missing',value:null}]}])
  expect(JSON.stringify(view)).not.toMatch(/respondentUserId|subjectUserId|interpretation|percentile|Private/)
  expect(JSON.stringify(view.units)).not.toContain('"value":99')
  expect(JSON.stringify(view)).not.toContain(scope.respondentUserId)
 })
 it('honors the fixed observer audience and invalid-quality null without substituting zero',async()=>{
  declarations[0].audience='student';await createCanonicalFieldEvidence(tx,input)
  let payload:any=decryptUnifiedRuntimePayload(save.mock.calls[0][0].data.answersCipher)
  expect(payload.units[1]).toMatchObject({state:'WITHHELD',metrics:[]})
  declarations[0].audience='teacher';stored.core.quality.status='invalid';await createCanonicalFieldEvidence(tx,input)
  payload=decryptUnifiedRuntimePayload(save.mock.calls[1][0].data.answersCipher)
  expect(payload.units[1].metrics.map((x:any)=>x.value)).toEqual([null,null])
 })
 it('refuses incomplete, stale-epoch, wrong-person and wrong-generation native completion without creating evidence',async()=>{
  const original={...parent}
  for(const delta of [{status:'IN_PROGRESS'},{attemptEpoch:2},{subjectUserId:id(99)},{respondentUserId:id(99)},{participantKey:'field-v2:old-generation'},{assignmentRef:'fake-run'}]){
   parent={...original,...delta};await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow()
  }
  parent=original;snapshots[0].terminalState='SKIPPED';await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow()
  expect(save).not.toHaveBeenCalled()
 })
 it('refuses a missing slot, changed source, forged canonical child/submission or undeclared result without saving',async()=>{
  const original=[...snapshots];snapshots=[snapshots[0]];await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow();snapshots=original
  snapshots[0].sourceDefinitionHash='d'.repeat(64);await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow();snapshots[0].sourceDefinitionHash=hash
  stored.persistenceProvenance.sourceSubmissionId=id(99);await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow();stored.persistenceProvenance.sourceSubmissionId=id(32)
  children[0].subjectUserId=id(99);await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow();children[0].subjectUserId=scope.subjectUserId
  declarations=[];await expect(createCanonicalFieldEvidence(tx,input)).rejects.toThrow();expect(save).not.toHaveBeenCalled()
 })
 it('reads original accepted-generation history after grant changes and refuses cipher/hash/receipt or parent identity tampering',async()=>{
  await createCanonicalFieldEvidence(tx,input);const row=save.mock.calls[0][0].data
  m.current.mockRejectedValue(Error('revoked current invitation'));await expect(readCanonicalFieldEvidence(tx,row)).resolves.toMatchObject({attemptId:attempt})
  expect(m.current).toHaveBeenCalledTimes(1)
  await expect(readCanonicalFieldEvidence(tx,{...row,answersHash:'0'.repeat(64)})).rejects.toThrow()
  const payload:any=decryptUnifiedRuntimePayload(row.answersCipher);payload.scope.acceptedAt='2026-10-29T00:00:00.124Z'
  await expect(readCanonicalFieldEvidence(tx,{...row,answersHash:canonicalHash(payload),answersCipher:encryptUnifiedRuntimePayload(payload)})).rejects.toThrow()
  snapshots[0].collectionFactsEncrypted=encryptUnifiedRuntimePayload({schemaVersion:3,sectionKey:section,items:[]})
  await expect(readCanonicalFieldEvidence(tx,row)).rejects.toThrow()
 })
})
