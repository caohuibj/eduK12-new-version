import type {Prisma,CompositeReportJob} from '@prisma/client'
import {prisma} from '../../config/database'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {canonicalHash} from '../assessment-runtime/canonical'
type Db=Pick<Prisma.TransactionClient,'$queryRaw'>
type Binding={scopeValid:boolean;attemptId:string;hash:string|null;epoch:number|null;currentEpoch:number;currentHash:string|null;userId:string|null;participantStatus:string;slotSetHash:string|null;contextHash:string|null}
const fail:()=>never=()=>{throw new InstrumentFinalSubmitError('STALE_ATTEMPT','匿名参与身份或当前恢复凭据已变化',403)}
async function binding(db:Db,attemptId:string):Promise<Binding|null>{
 const rows=await db.$queryRaw<Binding[]>`SELECT sa.attempt_id AS "attemptId",(a.id IS NOT NULL AND w.id IS NOT NULL AND p.id IS NOT NULL AND a.access_token_id=w.access_token_id) AS "scopeValid",sa.admission_credential_hash AS hash,sa.admission_attempt_epoch AS epoch,
  a.attempt_epoch AS "currentEpoch",a.recovery_token_hash AS "currentHash",a.user_id AS "userId",p.status AS "participantStatus",
  a.frozen_active_slot_set_hash AS "slotSetHash",a.context_snapshot_hash AS "contextHash"
  FROM anonymous_study_attempts sa LEFT JOIN anonymous_study_participants p ON p.id=sa.participant_id AND p.study_id=sa.study_id
  LEFT JOIN anonymous_study_waves w ON w.id=sa.wave_id AND w.study_id=sa.study_id
  LEFT JOIN composite_assessment_attempts a ON a.id=sa.attempt_id
  WHERE sa.attempt_id=${attemptId}`
 return rows[0]??null
}
/** Immutable server-created identity, not a credential presented by a client. */
export async function stableStudyAdmissionHash(db:Db,attemptId:string,currentHash:string|null,userId?:string|null){
 if(userId)return currentHash
 const row=await binding(db,attemptId)
 if(!row?.hash)return currentHash
 if(!row.scopeValid||row.userId!==null||row.epoch!==row.currentEpoch)fail()
 return row.hash
}
const acceptedReceipts=new WeakSet<object>()
const receiptUnits=new WeakMap<object,ReadonlyMap<string,string>>()
export type AcceptedStudyReceipt={readonly jobId:string;readonly attemptId:string;readonly epoch:number;readonly slotSetHash:string;readonly contextHash:string|null;
 readonly submissionId:string;readonly leaseToken:string;readonly acceptedAtMs:number;readonly payloadHash:string;readonly ciphertext:string;
}
type ReceiptUnit={assessmentId:string;submissionId:string;attemptEpoch:number;definitionHash:string;contextSnapshotHash?:string|null;answers:unknown;itemTimings?:unknown;deviceInputProvenance?:unknown}
const unitIdentity=(unit:ReceiptUnit)=>canonicalHash({assessmentId:unit.assessmentId,submissionId:unit.submissionId,attemptEpoch:unit.attemptEpoch,
 definitionHash:unit.definitionHash,contextSnapshotHash:unit.contextSnapshotHash??null,answers:unit.answers,
 ...(unit.itemTimings!==undefined?{itemTimings:unit.itemTimings}:{}),...(unit.deviceInputProvenance?{deviceInputProvenance:unit.deviceInputProvenance}:{})})
async function verifyReceipt(db:Db,cap:AcceptedStudyReceipt,lock:boolean){
 if(!acceptedReceipts.has(cap))fail()
 // Called only after the parent lock when writing: parent -> job -> child.
 const query=PrismaSqlReceipt(cap,lock)
 const rows=await db.$queryRaw<Array<{id:string}>>(query)
 if(rows.length!==1)fail()
}
import {Prisma as Sql} from '@prisma/client'
const PrismaSqlReceipt=(cap:AcceptedStudyReceipt,lock:boolean)=>Sql.sql`
 SELECT j.id FROM composite_report_jobs j JOIN composite_assessment_attempts a ON a.id=j.attempt_id
 WHERE j.id=${cap.jobId} AND j.attempt_id=${cap.attemptId} AND j.attempt_epoch=${cap.epoch}
 AND j.status='PROCESSING' AND j.lease_token=${cap.leaseToken} AND j.lease_expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
 AND j.whole_submission_id=${cap.submissionId} AND j.whole_accepted_at=${new Date(cap.acceptedAtMs)}
 AND j.whole_payload_hash=${cap.payloadHash} AND j.whole_answers_encrypted=${cap.ciphertext}
 AND j.slot_set_hash=${cap.slotSetHash} AND j.context_hash IS NOT DISTINCT FROM ${cap.contextHash}
 AND a.user_id IS NULL AND a.attempt_epoch=j.attempt_epoch AND a.async_report_epoch=a.attempt_epoch
 AND a.frozen_active_slot_set_hash=j.slot_set_hash AND a.context_snapshot_hash IS NOT DISTINCT FROM j.context_hash
 AND a.status IN ('IN_PROGRESS','COMPLETED') ${lock?Sql.sql`FOR UPDATE OF j`:Sql.empty}`
/** Worker-only: called AFTER existing full envelope/payload verification. A real
 * locked persisted job and exactly the same encrypted receipt are still required.
 * This grants computation of already accepted answers, never public read/write. */
export async function acceptedStudyReceipt(job:CompositeReportJob,raw:{schemaVersion:number;binding:{attemptId:string;attemptEpoch:number;slotSetHash:string;contextHash:string|null};payloadHash:string;units:ReceiptUnit[]}):Promise<AcceptedStudyReceipt|undefined>{
 const found=await binding(prisma,job.attemptId)
 if(!found?.hash)return undefined
 if(!found.scopeValid||found.userId!==null||found.epoch!==found.currentEpoch)fail()
 if(!job.leaseToken||!job.wholeSubmissionId||!job.wholeAcceptedAt||!job.wholePayloadHash||!job.wholeAnswersEncrypted)fail()

 if(raw.schemaVersion!==1||raw.binding.attemptId!==job.attemptId||raw.binding.attemptEpoch!==job.attemptEpoch||raw.binding.slotSetHash!==job.slotSetHash||raw.binding.contextHash!==job.contextHash||raw.payloadHash!==job.wholePayloadHash||!Array.isArray(raw.units))fail()
 const cap:AcceptedStudyReceipt=Object.freeze({jobId:job.id,attemptId:job.attemptId,epoch:job.attemptEpoch,slotSetHash:job.slotSetHash,contextHash:job.contextHash,
  submissionId:job.wholeSubmissionId,leaseToken:job.leaseToken,acceptedAtMs:job.wholeAcceptedAt.getTime(),payloadHash:job.wholePayloadHash,ciphertext:job.wholeAnswersEncrypted})
 receiptUnits.set(cap,new Map(raw.units.map(unit=>[unit.assessmentId,unitIdentity(unit)])))
 acceptedReceipts.add(cap)
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${job.attemptId} FOR UPDATE`
  await verifyReceipt(tx,cap,true)
 })
 return cap
}
export type StudyPrincipalInput={attemptId?:string|null;userId?:string|null;recoveryTokenHash?:string;attemptEpoch:number;frozenHash?:string|null;receipt?:AcceptedStudyReceipt;unit?:ReceiptUnit}
/** A bound path is checked before the legacy hash equality branch, including when
 * an OLD proof still equals the frozen principal. Never rewrite the input proof. */
export async function assertCurrentStudyPrincipal(db:Db,input:StudyPrincipalInput,lock=false):Promise<boolean>{
 if(!input.attemptId)return false
 let row=await binding(db,input.attemptId)
 if(!row?.hash)return false // historical rows keep their original protocol, never reset/backfilled
 if(lock){
  await db.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${input.attemptId} FOR UPDATE`
  row=await binding(db,input.attemptId)
 }
 if(!row?.hash||!row.scopeValid||row.userId!==null||input.userId||row.epoch!==row.currentEpoch||row.epoch!==input.attemptEpoch||row.participantStatus!=='ACTIVE')fail()
 if(input.frozenHash!==undefined&&input.frozenHash!==row.hash)fail()
 if(input.receipt){
  const cap=input.receipt
  if(!acceptedReceipts.has(cap)||cap.attemptId!==row.attemptId||cap.epoch!==row.epoch||cap.slotSetHash!==row.slotSetHash||cap.contextHash!==row.contextHash)fail()
  if(input.unit&&receiptUnits.get(cap)?.get(input.unit.assessmentId)!==unitIdentity(input.unit))fail()
  await verifyReceipt(db,cap,lock)
 }else if(!input.recoveryTokenHash||input.recoveryTokenHash!==row.currentHash)fail()
 return true
}
