/** Transient database outcomes of a composite START/RESTART transaction.
 * Only errors raised by the interactive transaction itself are classified:
 * every code below means Postgres or Prisma rolled the transaction back (or
 * never began it), so nothing from this START committed and the client may
 * safely retry the same request. Errors after commit are never reclassified.
 * P2024 (pool timeout fetching a connection) is classified only because
 * every classifyStartTransaction call site wraps a single $transaction:
 * Prisma can only raise it before BEGIN, so nothing committed. If a call
 * site ever wraps non-transactional writes before the transaction, this
 * classification must be revisited for that site. */
const ROLLED_BACK_SQLSTATES=new Set(['40001','40P01','55P03'])
// P2028 alone does not establish rollback: committed, missing and otherwise
// unknown transaction states must retain the original error. Only explicit
// acquisition failures and expired/rolled-back transactions qualify.
const knownP2028Rollback = (message: string) =>
 /unable to start a transaction in the given time/i.test(message)
 || /(?:commit|query) cannot be executed on an expired transaction/i.test(message)
 || /transaction already closed[^\n]*last state: ['"]?rolledback/i.test(message)

// Prisma's default interactive timeout is 5000 ms; measured anonymous START tx_wall p50 sits on that red line and is then killed with P2028. maxWait is connection-acquisition before BEGIN (same 10s already used by Training START).
export const START_INTERACTIVE_TRANSACTION={maxWait:10_000,timeout:15_000} as const

export const ASSESSMENT_START_BUSY='ASSESSMENT_START_BUSY'
export type StartBusyDiagnostic='pool_wait'|'transaction_expired'|'queue_full'|'queue_timeout'|'write_conflict'|'other'
const diagnosticFrom=(reason:string,original?:string):StartBusyDiagnostic=>{
 if(reason==='ADMISSION_QUEUE_FULL')return 'queue_full'
 if(reason==='ADMISSION_WAIT_TIMEOUT')return 'queue_timeout'
 if(reason==='P2028')return /unable to start a transaction/i.test(original??'')?'pool_wait':/expired transaction|Transaction not found/i.test(original??'')?'transaction_expired':'other'
 if(reason==='P2024')return 'pool_wait'
 if(reason==='P2034')return 'write_conflict'
 return 'other'
}
export class AssessmentStartBusyError extends Error{
 readonly code=ASSESSMENT_START_BUSY
 readonly statusCode=503
 /** Original rolled-back error text, for server-side diagnostics only; never
  * included in the HTTP response body. Distinguishes a transaction that never
  * began (maxWait/connection acquisition) from one that ran and expired. */
 readonly originalMessage?:string
 readonly diagnosticClass:StartBusyDiagnostic
 constructor(readonly reason:string,readonly retryAfterSeconds=1,originalMessage?:string){
   super('综合测评开始请求繁忙，请稍后重试')
   this.originalMessage=originalMessage
   this.diagnosticClass=diagnosticFrom(reason,originalMessage)
   // Low-cardinality, structured and safe: class + reason only, never SQL text.
   logger.info('assessment start busy (safe retry)',{reason,diagnosticClass:this.diagnosticClass,retryAfterSeconds})
 }
}
export const isAssessmentStartBusyError=(error:unknown):error is AssessmentStartBusyError=>error instanceof AssessmentStartBusyError

/** Stable reason for a rolled-back transaction, or null when it is not known to be one. */
export function rolledBackStartReason(error:unknown):string|null{
 const e=error as {code?:unknown;message?:unknown;meta?:{code?:unknown;error?:unknown}}|null
 if(!e||typeof e!=='object')return null
 if(e.code==='P2034')return 'P2034'
 if(e.code==='P2024')return 'P2024'
 if(e.code==='P2028'){
  const messages=[e.message,e.meta?.error].filter((value):value is string=>typeof value==='string')
  return messages.some(knownP2028Rollback)?'P2028':null
 }
 const sqlState=typeof e.meta?.code==='string'?e.meta.code:typeof e.code==='string'?e.code:null
 if(sqlState&&ROLLED_BACK_SQLSTATES.has(sqlState))return sqlState
 return null
}

/** Run exactly one START transaction attempt; no retry is added here. */
import { logger } from '../../utils/logger'
import { BoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'

/** Map a bounded-admission gate busy rejection onto the shared START busy
 * contract. The queue-full and wait-timeout reasons keep the same safe-retry
 * 503 shape as every other classified rollback. */
export function rethrowGateBusyAsStartBusy(err:unknown):unknown{
 if(err instanceof BoundedAdmissionBusyError){
  throw new AssessmentStartBusyError(
   err.reason==='timeout'?'ADMISSION_WAIT_TIMEOUT':'ADMISSION_QUEUE_FULL',
   err.retryAfterSeconds,err.message)
 }
 return err
}

export async function classifyStartTransaction<T>(run:()=>Promise<T>):Promise<T>{
 try{return await run()}
 catch(error){
  const reason=rolledBackStartReason(error)
  if(reason)throw new AssessmentStartBusyError(reason,1,error instanceof Error?error.message:undefined)
  throw error
 }
}
