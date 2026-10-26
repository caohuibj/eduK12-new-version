import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
const mocks=vi.hoisted(()=>({db:{$transaction:vi.fn(),$queryRaw:vi.fn()},atomic:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/assessment-runtime/whole-receipt-atomic',()=>({registerWholeReceiptAtomic:mocks.atomic}))
import { enqueueCompositeReportForUnit, registerWholeQuestionnaireReceipt, ReportProcessingLeaseLostError } from '../../modules/assessment-runtime/report-outbox.service'

const statement=(parts:any,...values:any[])=>Array.isArray(parts)?Prisma.sql(parts,...values):parts
const parent={id:'parent',attemptEpoch:2,frozenActiveSlotSetHash:'slots',contextSnapshotHash:'context'}
const acceptedAt=new Date('2026-10-26T12:00:00.000Z')
const input={submissionId:'submission',payloadHash:'payload',answersEncrypted:'sealed',acceptedAt,requiredFormSlots:[],validationHash:'manifest'}
const execution={submissionId:input.submissionId,payloadHash:input.payloadHash,leaseToken:'current-lease',acceptedAtMs:acceptedAt.getTime()}
const enqueueInput={compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,wholeReceipt:execution}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED','true')
 vi.stubEnv('ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED','true')
 vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED','true');vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED','true')
})
afterEach(()=>vi.unstubAllEnvs())

function callbackTransaction(options:{budgetAvailable?:boolean;validationHash?:string;accepted?:boolean}={}){
 const state={budgetAccesses:0,budgetHeld:undefined as unknown,statements:[] as Prisma.Sql[]}
 const job={id:'job',status:'WAITING',budgetHeld:false,wholeSubmissionId:options.accepted?input.submissionId:null,
  wholePayloadHash:options.accepted?input.payloadHash:null,wholeAcceptedAt:options.accepted?acceptedAt:null,wholeValidationHash:options.validationHash??'manifest'}
 const tx:any={assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([])},$queryRaw:vi.fn(async(...args:any[])=>{
  const sql=statement(args[0],...args.slice(1));state.statements.push(sql)
  if(sql.sql.includes('INSERT INTO "composite_report_jobs"'))return [job]
  if(sql.sql.includes('WITH parent_cas AS')){
   const usesBudget=sql.sql.includes('composite_report_queue_budget');if(usesBudget)state.budgetAccesses++
   const prefix=sql.sql.split('"budget_held" = ')[0]
   state.budgetHeld=sql.sql.includes('"budget_held" = true')?true:sql.values[(prefix.match(/\?/g)??[]).length]
   return [{parentCount:1n,envelopeCount:1n,queueDepth:usesBudget&&options.budgetAvailable!==false?7:null}]
  }
  throw new Error('Unexpected receipt statement')
 })}
 mocks.db.$transaction.mockImplementation(async(fn:any)=>fn(tx))
 return {tx,state}
}

describe('whole receipt lease is fresh after its job lock',()=>{
 it('rejects a lease that expires while waiting for the job, rather than using transaction-start time',async()=>{
  let now=1_000;const transactionStart=now;const expires=2_000
  let unlock!:()=>void;const lock=new Promise<void>(resolve=>{unlock=resolve})
  let lockReached!:()=>void;const reached=new Promise<void>(resolve=>{lockReached=resolve})
  const tx:any={$queryRaw:vi.fn(async(...args:any[])=>{
   const query=statement(args[0],...args.slice(1));const sql=query.sql
   if(sql.includes('FOR UPDATE')){lockReached();await lock;if(!sql.includes('JOIN'))return [{id:'job'}]}
   const observed=sql.includes('clock_timestamp()')?now:transactionStart
   return expires>observed?[{id:'job'}]:[]
  })}
  const pending=enqueueCompositeReportForUnit(tx,enqueueInput)
  await reached;now=3_000;unlock()
  await expect(pending).rejects.toBeInstanceOf(ReportProcessingLeaseLostError)
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
 })
 it('locks first then verifies the complete live receipt binding without loading projections or writing a job',async()=>{
  const tx:any={$queryRaw:vi.fn().mockResolvedValue([{id:'job'}]),$executeRaw:vi.fn(),
   compositeAssessmentAttempt:{findUnique:vi.fn(),update:vi.fn()},compositeReportJob:{update:vi.fn()}}
  expect(await enqueueCompositeReportForUnit(tx,enqueueInput)).toBe('job')
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  const [first,second]=tx.$queryRaw.mock.calls.map((args:any[])=>statement(args[0],...args.slice(1)))
  expect(first.sql).toContain('FOR UPDATE');expect(first.sql).not.toContain('lease_expires_at')
  expect(second.sql).toContain("clock_timestamp() AT TIME ZONE 'UTC'")
  for(const predicate of ['"delivery_mode" = \'FINAL_ONLY\'','"runtime_generation" = \'UNIFIED_V1\'','"whole_answers_encrypted"','"async_report_epoch"','"frozen_active_slot_set_hash"','"context_snapshot_hash"','"whole_submission_id"','"whole_payload_hash"','"whole_accepted_at"','"lease_token"'])expect(second.sql).toContain(predicate)
  expect(second.values).toEqual(expect.arrayContaining([parent.id,parent.attemptEpoch,input.submissionId,input.payloadHash,acceptedAt,execution.leaseToken]))
  expect(tx.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled();expect(tx.compositeAssessmentAttempt.update).not.toHaveBeenCalled()
  expect(tx.compositeReportJob.update).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled()
 })
 it('rejects a missing or changed live binding after successfully locking the job',async()=>{
  const tx:any={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'job'}]).mockResolvedValueOnce([])}
  await expect(enqueueCompositeReportForUnit(tx,enqueueInput)).rejects.toBeInstanceOf(ReportProcessingLeaseLostError)
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
 })
})

describe('collection callback keeps durable receipt storage semantics',()=>{
 it('accepts detached RAW with a collection callback without touching a full legacy shared budget',async()=>{
  const {tx,state}=callbackTransaction({budgetAvailable:false});const allowed=vi.fn().mockResolvedValue(undefined)
  await expect(registerWholeQuestionnaireReceipt(parent,input,allowed)).resolves.toEqual({acceptedAt,replayed:false})
  expect(state.budgetAccesses).toBe(0);expect(state.budgetHeld).toBe(false)
  expect(allowed).toHaveBeenCalledExactlyOnceWith(tx);expect(mocks.atomic).not.toHaveBeenCalled();expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
  expect(allowed.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$queryRaw.mock.invocationCallOrder[0])
  expect(allowed.mock.invocationCallOrder[0]).toBeLessThan(tx.assessmentUnitSnapshot.findMany.mock.invocationCallOrder[0])
 })
 it('keeps the original permit and queue depth for the legacy callback route',async()=>{
  vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED','false')
  const {state}=callbackTransaction();const allowed=vi.fn().mockResolvedValue(undefined)
  await expect(registerWholeQuestionnaireReceipt(parent,input,allowed)).resolves.toEqual({acceptedAt,replayed:false,queueDepth:7})
  expect(state.budgetAccesses).toBe(1);expect(state.budgetHeld).toBe(true)
 })
 it('keeps legacy queue-full refusal instead of silently detaching that route',async()=>{
  vi.stubEnv('ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED','false')
  const {state}=callbackTransaction({budgetAvailable:false})
  await expect(registerWholeQuestionnaireReceipt(parent,input,async()=>{})).rejects.toMatchObject({code:'COMPLETION_BUSY'})
  expect(state.budgetAccesses).toBe(1);expect(state.budgetHeld).toBe(true)
 })
 it('rejects a changed locked validation manifest before the callback, snapshot read or RAW persistence',async()=>{
  const {tx,state}=callbackTransaction({validationHash:'changed-manifest'});const allowed=vi.fn().mockResolvedValue(undefined)
  await expect(registerWholeQuestionnaireReceipt(parent,input,allowed)).rejects.toMatchObject({code:'SUBMISSION_PAYLOAD_CONFLICT'})
  expect(allowed).not.toHaveBeenCalled();expect(tx.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled();expect(state.statements).toHaveLength(1)
 })
 it('leaves an already accepted replay independent of new collection permission and budget',async()=>{
  const {tx,state}=callbackTransaction({accepted:true,validationHash:'later-manifest'});const allowed=vi.fn().mockRejectedValue(new Error('later stop'))
  await expect(registerWholeQuestionnaireReceipt(parent,input,allowed)).resolves.toEqual({acceptedAt,replayed:true})
  expect(allowed).not.toHaveBeenCalled();expect(tx.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled();expect(state.budgetAccesses).toBe(0)
 })
 it('does not save RAW or reserve any permit when the collection callback refuses',async()=>{
  const {tx,state}=callbackTransaction();const stop=new Error('shared emergency stop')
  await expect(registerWholeQuestionnaireReceipt(parent,input,async()=>{throw stop})).rejects.toBe(stop)
  expect(tx.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled();expect(state.statements).toHaveLength(1);expect(state.budgetAccesses).toBe(0)
 })
})
