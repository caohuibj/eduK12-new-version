import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {compilePrivateComposition} from '../../modules/education-tools/private-tool.composition-compiler'
import {educationCompositionOriginSchema,educationCompositionKey,privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {fieldAssessmentRefSchema,fieldParticipantKey,issueVerifiedFieldStart,readVerifiedFieldStart,type FieldAttemptIdentity} from '../../modules/huiteacher/fieldComposition.contract'
import {currentFieldComposition} from '../../modules/huiteacher/fieldComposition.authority'
import {assertCompositionCollection} from '../../modules/assessment-run/educationCompositionExecution'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
vi.mock('../../modules/assessment-run/educationCompositionExecution',()=>({assertCompositionCollection:vi.fn()}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin=(targetKind='PERSON')=>educationCompositionOriginSchema.parse({schemaVersion:2,adapterVersion:'2.0.0',mode:'COMPOSITION',entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'TEACHER:EXPERT_REPORT',targetKind})
const ref=(targetKind='PERSON')=>{const o=origin(targetKind);return fieldAssessmentRefSchema.parse({schemaVersion:1,kind:'COMPOSITION',compositeId:id(5),resourceKey:educationCompositionKey(o),resourceVersion:'2.0.0',manifestHash:'b'.repeat(64),origin:o})}
const scope=(targetKind='PERSON'):FieldAttemptIdentity=>({organizationId:id(1),eventId:id(6),targetId:id(7),invitationId:id(8),acceptedAt:'2026-10-29T00:00:00.123Z',assessmentRef:ref(targetKind),respondentUserId:id(9),subjectUserId:targetKind==='PERSON'?id(10):null})
const form={schemaVersion:2,pages:[{pageKey:'p',title:'观察',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'专业观察',required:false,options:[],rows:[]}]}]}
function scale(respondentType='expert_report'){
 const native=compileResearchScale('Expert support',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'teacher_self_report',aggregation:'mean',responseOptions:[{optionKey:'zero',label:'未观察到',score:0},{optionKey:'one',label:'观察到',score:1}],dimensions:[{dimensionKey:'support',label:'支持',direction:'descriptive'}],items:[{itemKey:'q',prompt:'教师提供支持',required:true,reverse:false,dimensionKeys:['support']}]})
 // This is a newly authored native version, before hashing/freezing. The
 // shared Survey draft compiler deliberately retains its SELF vocabulary.
 return {...native,respondentType}
}
function version(kind:'FORM'|'SCALE',n:number,definition:unknown){return {id:id(n),toolId:id(n+20),entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),kind,title:'Fixed '+kind,definition,sourceRevision:1,contentHash:privateToolContentHash(kind,'Fixed '+kind,definition),createdAt:new Date(0)}}
const f=version('FORM',11,form),s=version('SCALE',12,scale())
const definition=(targetKind='PERSON',sources=[s,f])=>({schemaVersion:2,adapterVersion:'2.0.0',administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind},instruction:'观察指定目标',blocks:sources.map((source,n)=>({blockId:id(30+n),instruction:'',source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))})
const context={entry:'TEACHER' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const findMany=vi.fn(),query=vi.fn(),tx={educationPrivateToolVersion:{findMany},$queryRaw:query} as unknown as Prisma.TransactionClient
beforeEach(()=>{vi.clearAllMocks();findMany.mockResolvedValue([s,f])})
describe('Explicit expert source and transaction-bound field identity',()=>{
 it('requires the new exact declaration and rejects reinterpreting a V1/School source or expert background as teacher context',()=>{
  expect(privateCompositionDefinitionSchema.parse(definition())).toEqual(definition())
  for(const change of [{schemaVersion:1},{adapterVersion:'1.0.0'},{administration:{population:'STUDENT',responseMode:'EXPERT_REPORT',targetKind:'PERSON'}},
   {contextFields:[{contextKey:'sexAtBirth',formType:'single_choice',formLabel:'Expert sex',formOptions:[]}]}])expect(privateCompositionDefinitionSchema.safeParse({...definition(),...change}).success).toBe(false)
  expect(fieldAssessmentRefSchema.safeParse({...ref(),resourceVersion:'1.0.0'}).success).toBe(false)
  expect(fieldAssessmentRefSchema.safeParse({...ref(),resourceKey:ref().resourceKey.replace('EXPERT_REPORT','SELF')}).success).toBe(false)
 })
 it('compiles the original expert Scale+Form once without changing zero, formulas, fixed report or form content',async()=>{
  const raw=definition(),before=structuredClone(raw),compiled=await compilePrivateComposition(tx,context,raw)
  expect(compiled.definition).toEqual(before);expect(compiled.leaves.get('PRIVATE_VERSION:'+s.id)).toMatchObject({kind:'SCALE',definition:s.definition})
  expect(compiled.leaves.get('PRIVATE_VERSION:'+f.id)).toMatchObject({kind:'FORM',form:{definition:form}})
  expect(findMany).toHaveBeenCalledTimes(1);expect(query).not.toHaveBeenCalled()
 })
 it('refuses a private SELF/other-observer Scale even when the caller supplies its correct original content hash',async()=>{
  for(const type of ['teacher_self_report','observer_report','participant_self_report']){
   const old=version('SCALE',12,scale(type));findMany.mockResolvedValueOnce([old,f])
   await expect(compilePrivateComposition(tx,context,definition('PERSON',[old,f]))).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_EXPERT_SCALE_DECLARATION_REQUIRED'})
  }
 })
 it('permits a non-person Form but rejects a non-person Scale and undeclared public/library providers before source queries',async()=>{
  findMany.mockResolvedValueOnce([f]);expect((await compilePrivateComposition(tx,context,definition('TEAM',[f]))).leaves.size).toBe(1)
  findMany.mockClear();await expect(compilePrivateComposition(tx,context,definition('TEAM'))).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_EXPERT_PERSON_TARGET_REQUIRED'})
  for(const [provider,kind] of [['PUBLIC_FORM','FORM'],['STANDARD_SCALE','SCALE'],['LIBRARY_SCALE','SCALE']] as const){
   const raw=definition();raw.blocks=[{...raw.blocks[0],source:{...raw.blocks[0].source,provider,kind}}]
   await expect(compilePrivateComposition(tx,context,raw)).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_EXPERT_SOURCE_DECLARATION_REQUIRED'})
  }
  expect(findMany).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled()
 })
 it('keeps accepted-generation/source keys stable on retry and different across target, invitation and a new acceptance',()=>{
  const value=scope(),key=fieldParticipantKey(value)
  expect(fieldParticipantKey(structuredClone(value))).toBe(key)
  for(const change of [{eventId:id(80)},{targetId:id(81)},{invitationId:id(82)},{acceptedAt:'2026-10-29T00:00:00.124Z'},
   {assessmentRef:{...value.assessmentRef,origin:{...value.assessmentRef.origin,contentHash:'c'.repeat(64)}}}])expect(fieldParticipantKey({...value,...change})).not.toBe(key)
 })
 it('accepts only the same transaction proof, real expert and exact parent, preserving null non-person subject',()=>{
  const transaction={},value=scope(),proof=issueVerifiedFieldStart({...value,tx:transaction}),expected={tx:transaction,compositeId:value.assessmentRef.compositeId,respondentUserId:value.respondentUserId}
  expect(readVerifiedFieldStart(proof,expected)).toMatchObject({...value,participantKey:fieldParticipantKey(value)})
  for(const delta of [{tx:{}},{respondentUserId:id(99)},{compositeId:id(99)}])expect(()=>readVerifiedFieldStart(proof,{...expected,...delta})).toThrow('FIELD_START_IDENTITY_INVALID')
  expect(()=>readVerifiedFieldStart({...proof},expected)).toThrow('FIELD_START_IDENTITY_INVALID')
  for(const delta of [{subjectUserId:value.respondentUserId},{subjectUserId:null},{assessmentRef:ref('TEAM')}])expect(()=>issueVerifiedFieldStart({...value,...delta,tx:transaction})).toThrow('FIELD_START_IDENTITY_INVALID')
  const team=scope('TEAM'),teamProof=issueVerifiedFieldStart({...team,tx:transaction})
  expect(readVerifiedFieldStart(teamProof,{...expected,respondentUserId:team.respondentUserId}).subjectUserId).toBeNull()
 })
 it('checks a bounded sealed source and exact current parent before native access, rejecting mismatched accepted generation or subject',async()=>{
  const value=scope(),row={...value,acceptedAt:new Date(value.acceptedAt),targetKind:'PERSON',targetName:'Verified teacher',
   compositeId:value.assessmentRef.compositeId,resourceKey:value.assessmentRef.resourceKey,creationHash:canonicalHash(value.assessmentRef.origin),createdBy:id(2),manifestHash:value.assessmentRef.manifestHash,origin:value.assessmentRef.origin,title:'Expert fixed',status:'PUBLISHED',
   manifest:definition().blocks.map(block=>({...block.source,sourceProvider:'PRIVATE_VERSION',blockId:block.blockId})),units:[],parentId:id(40),parentKey:fieldParticipantKey(value),parentSubject:value.subjectUserId,parentRespondent:value.respondentUserId,parentAssignment:null,parentEpoch:1,parentStatus:'IN_PROGRESS'}
  query.mockResolvedValueOnce([row]);expect((await currentFieldComposition(tx,{actorUserId:value.respondentUserId,attemptId:row.parentId,lock:true})).scope).toEqual(value)
  expect(assertCompositionCollection).toHaveBeenCalledWith(tx,expect.objectContaining({origin:value.assessmentRef.origin}),'BOUND_COLLECTION',true)
  // SQL authority is exercised against real grants/denies in the PG suite;
  // this assertion also prevents silently deleting these product fences.
  const sql=query.mock.calls[0][0].sql as string
  expect(sql).toContain("grant_row.role='EXPERT'");expect(sql).toContain("'EDUCATION_ACCESS','HUITEACHER_ACCESS'");expect(sql).toContain('FOR SHARE OF grant_row,event,target,org,product')
  for(const change of [{parentKey:'field-v2:old-generation'},{parentSubject:id(99)},{parentRespondent:id(99)},{parentAssignment:'fake-run'},
   {assessmentRef:{...value.assessmentRef,manifestHash:'f'.repeat(64)}}]){
   query.mockResolvedValueOnce([{...row,...change}]);await expect(currentFieldComposition(tx,{actorUserId:value.respondentUserId,attemptId:row.parentId})).rejects.toThrow()
  }
  query.mockResolvedValueOnce([]);await expect(currentFieldComposition(tx,{actorUserId:value.respondentUserId,invitationId:value.invitationId})).rejects.toMatchObject({statusCode:403})
 })
 it('reports an authorized unconfigured event as null while refusing START or a changed configured source',async()=>{
  const query=vi.fn().mockResolvedValue([{assessmentRef:null,compositeId:null}]),db={$queryRaw:query} as unknown as Prisma.TransactionClient
  await expect(currentFieldComposition(db,{actorUserId:id(9),invitationId:id(8),allowUnconfigured:true})).resolves.toBeNull()
  await expect(currentFieldComposition(db,{actorUserId:id(9),invitationId:id(8)})).rejects.toMatchObject({code:'HUITEACHER_FIELD_FIXED_QUESTIONNAIRE_REQUIRED'})
  query.mockResolvedValueOnce([{assessmentRef:ref(),compositeId:null}])
  await expect(currentFieldComposition(db,{actorUserId:id(9),invitationId:id(8),allowUnconfigured:true})).rejects.toMatchObject({code:'HUITEACHER_FIELD_FIXED_SOURCE_UNAVAILABLE'})
  query.mockResolvedValueOnce([])
  await expect(currentFieldComposition(db,{actorUserId:id(99),invitationId:id(8),allowUnconfigured:true})).rejects.toMatchObject({statusCode:403})
 })
})
