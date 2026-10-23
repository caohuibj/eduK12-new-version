import {randomUUID} from 'node:crypto'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {compileEducationApplicability} from '../../modules/scale-library-governance/education-applicability'
import {educationLibraryResourceEntry} from '../../modules/scale-library-governance/education-runtime-entry'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
import {Prisma} from '@prisma/client'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const mocks=vi.hoisted(()=>({source:vi.fn(),slots:vi.fn(),runtime:vi.fn()}))
vi.mock('../../modules/scale-library-governance/education-runtime-resources',()=>({readEducationLibraryRegisteredSource:mocks.source}))
vi.mock('../../modules/assessment-runtime/slot-set',()=>({loadFrozenActiveSlotSet:mocks.slots,compositeItemSlotKey:(id:string,kind:string)=>kind.toLowerCase()+':'+id}))
vi.mock('../../modules/assessment-runtime/runtime-snapshot',()=>({loadFrozenScaleRuntimeSnapshot:mocks.runtime}))
import {assertEducationLibraryExecutionSource} from '../../modules/assessment-run/educationLibraryExecution'
import {teacherLibraryExecutionBindingMatches} from '../../modules/huiteacher/libraryScaleExecution'
const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'teacher_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]})
const compiled=compileEducationApplicability({schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]})
const resourceEntry=educationLibraryResourceEntry({origin:{schemaVersion:1,adapterVersion:'1.0.0',entryId:randomUUID(),product:'TEACHER',releaseId:randomUUID(),contentHash:'a'.repeat(64),approvedSnapshotHash:'b'.repeat(64),sourceDefinitionHash:canonicalHash(definition),applicabilityHash:compiled.contractHash,variantKey:'TEACHER:SELF',dependencies:[]},variant:compiled.variants[0],definition,title:'Synthetic',compositeId:'composite'})
const source={variantKey:'TEACHER:SELF',compositeId:'composite',compositeItemId:'item',scaleId:'scale',sourceDefinitionHash:canonicalHash(definition),resourceEntry}
const policy=relationalEntryToRunPolicy(resourceEntry)
const input={organizationId:'org',actorUserId:'actor',resourceKey:policy.key,resourceVersion:policy.version,attemptId:'parent',assignmentId:'assignment',itemId:'item'}
const parent={id:'parent',compositeAssessmentId:'composite',assignmentRef:'assignment',userId:'actor',subjectUserId:'actor',respondentUserId:'actor',frozenActiveSlotSetEncrypted:'encrypted',frozenActiveSlotSetHash:'slots-hash',attemptEpoch:1}
const slots={snapshotHash:'slots-hash',attemptEpoch:1,slots:[{unitType:'SCALE',required:true,slotKey:'scale:item',sourceDefinitionIdentity:{hash:source.sourceDefinitionHash,key:'code',version:'1.0.0'},sourceBinding:{compositeItemId:'item',compiledRuntimeHash:'compiled-hash'}}]}
function bindingDb(){return {compositeAssessmentAttempt:{findUnique:vi.fn().mockResolvedValue(parent)},assessment:{findMany:vi.fn().mockResolvedValue([{scaleId:'scale',compositeItemId:'item',userId:'actor',runtimeSnapshotEncrypted:'runtime'}])}}}
beforeEach(()=>{vi.clearAllMocks();mocks.source.mockResolvedValue(source);mocks.slots.mockResolvedValue(slots);mocks.runtime.mockResolvedValue({schemaVersion:2,sourceDefinitionHash:source.sourceDefinitionHash,instrumentKey:'code',instrumentVersion:'1.0.0',compiledRuntime:{compiledRuntimeHash:'compiled-hash'}})})
describe('exact library execution content binding',()=>{
 it('START validates actual product and immutable launch policy without a respondent library grant',async()=>{
  const row={organizationId:'org',key:policy.key,version:policy.version,policy,policyHash:canonicalHash(policy),school:false,teacher:true,subjectRole:'TEACHER',respondentRole:'TEACHER',relationship:'SELF'}
  const tx={$queryRaw:vi.fn().mockResolvedValue([row])} as unknown as Prisma.TransactionClient
  await assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'composite'})
  expect(mocks.source).toHaveBeenCalledWith(tx,{product:'TEACHER',resourceKey:policy.key,resourceVersion:'1.0.0',purpose:'EXISTING_EXECUTION'})
  await expect(assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'other'})).rejects.toThrow('BINDING_MISMATCH')
 })
 it('rejects ambiguous or absent actual product context',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([{school:true,teacher:true}])} as unknown as Prisma.TransactionClient
  await expect(assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'composite'})).rejects.toThrow('CONTEXT_MISMATCH')
  expect(mocks.source).not.toHaveBeenCalled()
 })
 it('accepts exact parent, child, frozen source and compiled slot',async()=>{
  expect(await teacherLibraryExecutionBindingMatches(bindingDb() as any,input)).toBe(true)
 })
 it('accepts a genuinely compiled and verified V1 snapshot without weakening independent slot identity',async()=>{
  const actual=await vi.importActual<typeof import('../../modules/assessment-runtime/runtime-snapshot')>('../../modules/assessment-runtime/runtime-snapshot')
  const frozen=actual.createFrozenScaleRuntimeSnapshot({instrumentKey:'code',instrumentVersion:'1.0.0',definition,frozenAt:new Date('2026-10-22T00:00:00.000Z')})
  const runtime=actual.parseVersionedFrozenScaleRuntimeSnapshot(frozen)
  expect(runtime.schemaVersion).toBe(1)
  mocks.runtime.mockResolvedValue(runtime)
  mocks.slots.mockResolvedValue({...slots,slots:[{...slots.slots[0],sourceBinding:{...slots.slots[0].sourceBinding,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash}}]})
  expect(await teacherLibraryExecutionBindingMatches(bindingDb() as any,input)).toBe(true)
  mocks.slots.mockResolvedValue({...slots,slots:[{...slots.slots[0],sourceDefinitionIdentity:{...slots.slots[0].sourceDefinitionIdentity,hash:'f'.repeat(64)}}]})
  expect(await teacherLibraryExecutionBindingMatches(bindingDb() as any,input)).toBe(false)
  expect(()=>actual.parseVersionedFrozenScaleRuntimeSnapshot({...frozen,sourceDefinitionHash:'f'.repeat(64)})).toThrow()
 })
 it('cannot use an arbitrary item or another owner parent',async()=>{
  const db=bindingDb()
  expect(await teacherLibraryExecutionBindingMatches(db as any,{...input,itemId:'other'})).toBe(false)
  expect(db.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  db.compositeAssessmentAttempt.findUnique.mockResolvedValue({...parent,userId:'other'})
  expect(await teacherLibraryExecutionBindingMatches(db as any,input)).toBe(false)
 })
 it('rejects child/slot source mismatches and does not create missing media children',async()=>{
  const db=bindingDb();db.assessment.findMany.mockResolvedValue([])
  expect(await teacherLibraryExecutionBindingMatches(db as any,input)).toBe(false)
  expect(await teacherLibraryExecutionBindingMatches(db as any,{...input,itemId:undefined})).toBe(true)
  mocks.slots.mockResolvedValue({...slots,snapshotHash:'other'})
  expect(await teacherLibraryExecutionBindingMatches(db as any,input)).toBe(false)
 })
 it('history uses exact source identity rather than current collection/new-use grants',async()=>{
  const db=bindingDb()
  expect(await teacherLibraryExecutionBindingMatches(db as any,{...input,purpose:'REPORT_READ'})).toBe(true)
  expect(mocks.source).toHaveBeenCalledWith(db,expect.objectContaining({purpose:'HISTORY'}))
 })
})
