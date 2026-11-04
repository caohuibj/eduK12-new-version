/** Transient database outcomes of a composite START/RESTART transaction.
 * Only errors raised by the interactive transaction itself are classified:
 * every code below means Postgres or Prisma rolled the transaction back (or
 * never began it), so nothing from this START committed and the client may
 * safely retry the same request. Errors after commit are never reclassified. */
const ROLLED_BACK_SQLSTATES=new Set(['40001','40P01','55P03'])
// P2028 is a family of interactive-transaction API errors. Only these two are
// known rollbacks: maxWait expired before BEGIN, or the engine expired the tx.
const P2028_ROLLED_BACK=/Unable to start a transaction in the given time|expired transaction/i

export const ASSESSMENT_START_BUSY='ASSESSMENT_START_BUSY'
export class AssessmentStartBusyError extends Error{
 readonly code=ASSESSMENT_START_BUSY
 readonly statusCode=503
 /** Original rolled-back error text, for server-side diagnostics only; never
  * included in the HTTP response body. Distinguishes a transaction that never
  * began (maxWait/connection acquisition) from one that ran and expired. */
 readonly originalMessage?:string
 constructor(readonly reason:string,readonly retryAfterSeconds=1,originalMessage?:string){
   super('综合测评开始请求繁忙，请稍后重试')
   this.originalMessage=originalMessage
 }
}
export const isAssessmentStartBusyError=(error:unknown):error is AssessmentStartBusyError=>error instanceof AssessmentStartBusyError

/** Stable reason for a rolled-back transaction, or null when it is not known to be one. */
export function rolledBackStartReason(error:unknown):string|null{
 const e=error as {code?:unknown;message?:unknown;meta?:{code?:unknown}}|null
 if(!e||typeof e!=='object')return null
 if(e.code==='P2034')return 'P2034'
 if(e.code==='P2028')return typeof e.message==='string'&&P2028_ROLLED_BACK.test(e.message)?'P2028':null
 const sqlState=typeof e.meta?.code==='string'?e.meta.code:typeof e.code==='string'?e.code:null
 return sqlState&&ROLLED_BACK_SQLSTATES.has(sqlState)?sqlState:null
}

/** Run exactly one START transaction attempt; no retry is added here. */
export async function classifyStartTransaction<T>(run:()=>Promise<T>):Promise<T>{
 try{return await run()}
 catch(error){
  const reason=rolledBackStartReason(error)
  if(reason)throw new AssessmentStartBusyError(reason,1,error instanceof Error?error.message:undefined)
  throw error
 }
}
