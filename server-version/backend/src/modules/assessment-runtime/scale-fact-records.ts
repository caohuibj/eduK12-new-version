import { ScaleSubmissionKeyConflictError } from '../scale/scale-final-submit-conflict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { ScaleResultV2 } from '../scale/scale-result'
import type { CanonicalUnitResultEnvelopeV1 } from './unit-result'
export type FactDb=Pick<Prisma.TransactionClient,'$queryRaw'|'$executeRaw'>
export type ScaleFactRecord={id:string;attemptEpoch:number;submissionId:string;submissionPayloadHash:string;sourceResultHash:string;canonicalResultHash:string|null;
 factsEncrypted:string;rawAnswersEncrypted:string|null;rawReceiptAttemptId:string|null;completedAt:Date|string;totalTime:number}
export type ScaleFactsReference={k:'SFF1';e:number}
export type ScaleRawReference={k:'SFR1';e:number}
export const makeScaleFactsReference=(epoch:number):ScaleFactsReference=>({k:'SFF1',e:epoch})
export const makeScaleRawReference=(epoch:number):ScaleRawReference=>({k:'SFR1',e:epoch})
export const isScaleFactsReference=(value:any):value is ScaleFactsReference=>value?.k==='SFF1'&&Number.isSafeInteger(value.e)&&value.e>0
export const isScaleRawReference=(value:any):value is ScaleRawReference=>value?.k==='SFR1'&&Number.isSafeInteger(value.e)&&value.e>0
const COMMITTED=Symbol('committed unit fact context')
const LOADED=Symbol('loaded immutable unit fact row')
export type CommittedScaleFacts={row:ScaleFactRecord;result:ScaleResultV2;canonical:CanonicalUnitResultEnvelopeV1|null}
export const attachCommittedScaleFacts=<T extends object>(record:T,context:CommittedScaleFacts):T=>{
 Object.defineProperty(record,COMMITTED,{value:context,enumerable:false});return record
}
export const readCommittedScaleFacts=(record:any):CommittedScaleFacts|null=>{
 const context=record?.[COMMITTED] as CommittedScaleFacts|undefined
 if(!context||!isScaleFactsReference(record.result)||record.id!==context.row.id||record.result.e!==context.row.attemptEpoch
  ||record.attemptEpoch!==context.row.attemptEpoch||record.submissionId!==context.row.submissionId||record.submissionPayloadHash!==context.row.submissionPayloadHash)return null
 return context
}
export const loadScaleFactRecords=async(identities:Array<{id:string;attemptEpoch:number}>,db:Pick<Prisma.TransactionClient,'$queryRaw'>=prisma,withRaw=false):Promise<ScaleFactRecord[]>=>{
 if(!identities.length)return []
 const unique=[...new Map(identities.map(x=>[x.id+'/'+x.attemptEpoch,x])).values()]
 for(const x of unique)if(typeof x.id!=='string'||!x.id||!Number.isSafeInteger(x.attemptEpoch)||x.attemptEpoch<1)throw new Error('Invalid result fact identity')
 return db.$queryRaw<ScaleFactRecord[]>`SELECT assessment_id AS id,attempt_epoch AS "attemptEpoch",submission_id AS "submissionId",
  payload_hash AS "submissionPayloadHash",source_result_hash AS "sourceResultHash",canonical_result_hash AS "canonicalResultHash",facts_encrypted AS "factsEncrypted",
  ${withRaw?Prisma.sql`raw_answers_encrypted`:Prisma.sql`NULL::text`} AS "rawAnswersEncrypted",raw_receipt_attempt_id AS "rawReceiptAttemptId",completed_at AS "completedAt",total_time AS "totalTime"
  FROM assessment_result_facts WHERE (assessment_id,attempt_epoch) IN (${Prisma.join(unique.map(x=>Prisma.sql`(${x.id},${x.attemptEpoch})`))})`
}
export const persistScaleFactRecords=async(db:FactDb,rows:ScaleFactRecord[]):Promise<void>=>{
 if(!rows.length)return
 const data=rows.map(row=>({id:row.id,attemptEpoch:row.attemptEpoch,submissionId:row.submissionId,payloadHash:row.submissionPayloadHash,
  sourceResultHash:row.sourceResultHash,canonicalResultHash:row.canonicalResultHash,factsEncrypted:row.factsEncrypted,
  rawAnswersEncrypted:row.rawAnswersEncrypted,rawReceiptAttemptId:row.rawReceiptAttemptId,completedAt:row.completedAt instanceof Date?row.completedAt.toISOString():row.completedAt,totalTime:row.totalTime}))
 const inserted=await db.$queryRaw<Array<{id:string}>>`INSERT INTO assessment_result_facts(assessment_id,attempt_epoch,submission_id,payload_hash,source_result_hash,canonical_result_hash,facts_encrypted,raw_answers_encrypted,raw_receipt_attempt_id,completed_at,total_time)
  SELECT source.id,source."attemptEpoch",source."submissionId",source."payloadHash",source."sourceResultHash",source."canonicalResultHash",source."factsEncrypted",source."rawAnswersEncrypted",source."rawReceiptAttemptId",source."completedAt",source."totalTime"
  FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb) AS source(id text,"attemptEpoch" integer,"submissionId" text,"payloadHash" text,"sourceResultHash" text,"canonicalResultHash" text,"factsEncrypted" text,"rawAnswersEncrypted" text,"rawReceiptAttemptId" text,"completedAt" timestamp,"totalTime" integer)
  ON CONFLICT ON CONSTRAINT assessment_result_facts_submission_id_key DO NOTHING
  RETURNING assessment_id AS id`
 // Only this named submission-key constraint may suppress an insertion. Both
 // callers run in the enclosing FINAL transaction; throwing rolls back all
 // other rows in a mixed batch. Other unique/database errors remain unchanged.
 if(inserted.length<rows.length)throw new ScaleSubmissionKeyConflictError()
 if(inserted.length!==rows.length||new Set(inserted.map(r=>r.id)).size!==rows.length)throw new Error('Result fact insert count mismatch')
}

export const attachLoadedScaleFactRecord=<T extends object>(record:T,row:ScaleFactRecord):T=>{Object.defineProperty(record,LOADED,{value:row,enumerable:false,configurable:true});return record}
export const readLoadedScaleFactRecord=(record:any):ScaleFactRecord|null=>{
 const row=readCommittedScaleFacts(record)?.row??record?.[LOADED] as ScaleFactRecord|undefined
 if(!row||!isScaleFactsReference(record.result)||record.id!==row.id||record.result.e!==row.attemptEpoch
  ||(record.attemptEpoch!==undefined&&record.attemptEpoch!==row.attemptEpoch)
  ||(record.submissionId!==undefined&&record.submissionId!==row.submissionId)
  ||(record.submissionPayloadHash!==undefined&&record.submissionPayloadHash!==row.submissionPayloadHash))return null
 return row
}
