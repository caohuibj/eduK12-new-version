import { surveyCognitiveResultProtocol } from './cognitive.protocols'
import { Prisma,type SurveyCognitiveResult } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseUnifiedCognitiveRawSubmissionPayload,type UnifiedCognitiveRawSubmissionPayload } from '../cognitive/unified-raw-submission'
import type { AdministrationProvenanceV1 } from '../cognitive/administration-provenance'
import type { CognitiveScoreResult } from '../cognitive/v2/types'
import type { ResearchFrozenPublication } from './publication.service'
import { parseFrozenSurveyCognitive,surveyCognitiveReferenceSchema,type SurveyCognitiveReference } from './cognitive.definition'
export type { SurveyCognitiveReference } from './cognitive.definition'
export class SurveyCognitiveError extends Error{
  constructor(readonly statusCode:number,message:string){super(message)}
}
export const cognitiveFail=(status:number,message:string):never=>{throw new SurveyCognitiveError(status,message)}
export interface SurveyCognitiveStoredResult {
  schemaVersion:1;sessionId:string;projectId:string;waveId:string;attemptId:string;publicationId:string;
  slotKey:string;epoch:number;measurementDigest:string;configHash:string;protocolSignature:string;
  testType:string;configVersion:string;engineVersion:string;scoringVersion:string;
  timingPolicy:'software-frame-v1';maturity:'PILOT';referenceMode:'none';
  metrics:Record<string,unknown>;quality:CognitiveScoreResult['quality'];audit:CognitiveScoreResult['audit'];
  administrationProvenance:AdministrationProvenanceV1;restartCount:number;rawHash:string;completedAt:string;
}
export type LoadedSurveyCognitiveResult={reference:SurveyCognitiveReference;sessionId:string;completedAt:Date;
  result:SurveyCognitiveStoredResult;raw?:UnifiedCognitiveRawSubmissionPayload;randomSeed?:string}
type Scope={projectId:string;waveId:string;attemptId:string;publicationId:string}
/** Receipt metadata only: participant lifecycle and reference checks never need ciphertext. */
export const surveyCognitiveReceiptSelect={id:true,slotKey:true,epoch:true,resultHash:true,
  measurementDigest:true,submissionId:true,payloadHash:true,completedAt:true} as const
export type SurveyCognitiveReceipt=Prisma.SurveyCognitiveResultGetPayload<{select:typeof surveyCognitiveReceiptSelect}>
const scopeKey=(scope:Scope)=>JSON.stringify([scope.projectId,scope.waveId,scope.attemptId,scope.publicationId])
export const surveyCognitiveResultReference=(row:Pick<SurveyCognitiveResult,
  'id'|'slotKey'|'epoch'|'resultHash'|'measurementDigest'>):SurveyCognitiveReference=>({
    slotKey:row.slotKey,epoch:row.epoch,resultId:row.id,resultHash:row.resultHash,measurementDigest:row.measurementDigest,
  })
const refs=(values:unknown):SurveyCognitiveReference[]=>{
  const parsed=z.array(surveyCognitiveReferenceSchema).max(4).parse(values)
  if(new Set(parsed.map(r=>r.slotKey)).size!==parsed.length||new Set(parsed.map(r=>r.resultId)).size!==parsed.length)
    cognitiveFail(409,'认知结果引用重复')
  return parsed
}
const matches=(row:Pick<SurveyCognitiveResult,'id'|'slotKey'|'epoch'|'resultHash'|'measurementDigest'>,ref:SurveyCognitiveReference)=>
  row.id===ref.resultId&&row.slotKey===ref.slotKey&&row.epoch===ref.epoch&&row.resultHash===ref.resultHash
    &&row.measurementDigest===ref.measurementDigest
/** Call only inside the current parent authorization transaction, with its Attempt lock held.
 * References are a subset here: the parent flow verifier decides the exact reachable set. */
export async function verifySurveyCognitiveReferences(tx:Prisma.TransactionClient,input:Scope&{
  snapshot:ResearchFrozenPublication;references:unknown
}):Promise<SurveyCognitiveReference[]>{
  const references=refs(input.references)
  for(const ref of references){
    const unit=input.snapshot.units.find(u=>u.kind==='COGNITIVE'&&u.instrumentKey===ref.slotKey)
    if(!unit)cognitiveFail(409,'认知结果不属于本轮冻结工具槽位')
    const frozen=parseFrozenSurveyCognitive(unit!.compiledDefinition)
    if(ref.measurementDigest!==frozen.measurementDigest)cognitiveFail(409,'认知结果测量版本不匹配')
  }
  if(!references.length)return references
  const sessions=await tx.surveyCognitiveSession.findMany({where:{
    projectId:input.projectId,waveId:input.waveId,attemptId:input.attemptId,
    publicationId:input.publicationId,slotKey:{in:references.map(ref=>ref.slotKey)},
  },orderBy:{epoch:'desc'},select:{slotKey:true,status:true,epoch:true,
    result:{select:surveyCognitiveReceiptSelect}}})
  const latest=new Map<string,(typeof sessions)[number]>()
  for(const session of sessions)if(!latest.has(session.slotKey))latest.set(session.slotKey,session)
  for(const ref of references){
    const row=latest.get(ref.slotKey)
    if(!row||row.status!=='COMPLETED'||row.epoch!==ref.epoch||!row.result||!matches(row.result,ref))
      cognitiveFail(409,'认知结果未完成、属于旧轮次或不属于当前作答')
  }
  return references
}
const storedResultSelect={id:true,sessionId:true,projectId:true,waveId:true,attemptId:true,publicationId:true,
  slotKey:true,epoch:true,measurementDigest:true,resultHash:true,resultCipher:true,rawHash:true,
  completedAt:true,trialCount:true} as const
type StoredResultRow=Prisma.SurveyCognitiveResultGetPayload<{select:typeof storedResultSelect}>&{
  rawCipher?:string;session?:{randomSeedCipher:string}}
function decodeResults(input:Scope&{includeRaw?:boolean},references:SurveyCognitiveReference[],rows:StoredResultRow[]){
  const byId=new Map(rows.map(row=>[row.id,row]))
  if(rows.length!==references.length||byId.size!==rows.length)cognitiveFail(409,'认知权威结果引用无法匹配')
  return references.map(reference=>{
    try{
      const row=byId.get(reference.resultId)
      if(!row||scopeKey(row)!==scopeKey(input)||!matches(row,reference))cognitiveFail(409,'认知权威结果引用无法匹配')
      const result=decryptUnifiedRuntimePayload<SurveyCognitiveStoredResult>(row!.resultCipher)
      if(canonicalHash(result)!==reference.resultHash||result.schemaVersion!==1
        ||result.sessionId!==row!.sessionId||result.projectId!==input.projectId
        ||result.waveId!==input.waveId||result.attemptId!==input.attemptId||result.publicationId!==input.publicationId
        ||result.slotKey!==reference.slotKey||result.epoch!==reference.epoch
        ||result.measurementDigest!==reference.measurementDigest||result.rawHash!==row!.rawHash
        ||result.audit.trialCount!==row!.trialCount||row!.trialCount!==surveyCognitiveResultProtocol(result).formalTrials)
        cognitiveFail(409,'认知权威结果密文或来源摘要校验失败')
      const base:LoadedSurveyCognitiveResult={reference,sessionId:row!.sessionId,completedAt:row!.completedAt,result}
      if(input.includeRaw){
        const raw=parseUnifiedCognitiveRawSubmissionPayload(decryptUnifiedRuntimePayload(row!.rawCipher!))
        if(canonicalHash(raw)!==row!.rawHash||raw.attemptEpoch!==reference.epoch||raw.trials.length!==row!.trialCount)
          cognitiveFail(409,'认知原始试次密文校验失败')
        base.raw=raw
        base.randomSeed=decryptUnifiedRuntimePayload<string>(row!.session!.randomSeedCipher)
      }
      return base
    }catch(error){
      if(error instanceof SurveyCognitiveError)throw error
      return cognitiveFail(409,'认知权威结果密文或原始数据损坏，无法读取')
    }
  })
}
/** Metrics-only bounded batch for authorized export/report callers. Each group keeps its
 * own exact parent scope and references; no ciphertext is fetched before all byte checks. */
export async function loadSurveyCognitiveResultGroups(tx:Prisma.TransactionClient,
  inputs:Array<Scope&{references:unknown;includeRaw?:false}>):Promise<LoadedSurveyCognitiveResult[][]>{
  if(inputs.length>8||inputs.some(input=>input.includeRaw))cognitiveFail(413,'认知结果批次超过读取预算')
  const groups=inputs.map(input=>({input,references:refs(input.references),key:scopeKey(input)}))
  if(new Set(groups.map(group=>group.key)).size!==groups.length)cognitiveFail(409,'认知结果父级作用域重复')
  const active=groups.filter(group=>group.references.length)
  if(!active.length)return groups.map(()=>[])
  const predicates=active.map(({input,references})=>Prisma.sql`(project_id=${input.projectId}
    AND wave_id=${input.waveId} AND attempt_id=${input.attemptId} AND publication_id=${input.publicationId}
    AND id IN (${Prisma.join(references.map(reference=>reference.resultId))}))`)
  const sizes=await tx.$queryRaw<Array<Scope&{id:string;bytes:number}>>(Prisma.sql`
    SELECT id,project_id AS "projectId",wave_id AS "waveId",attempt_id AS "attemptId",
      publication_id AS "publicationId",octet_length(result_cipher) AS bytes
    FROM survey_cognitive_results WHERE ${Prisma.join(predicates,' OR ')}`)
  let total=0
  for(const group of active){
    const allowed=new Set(group.references.map(reference=>reference.resultId))
    const selected=sizes.filter(row=>scopeKey(row)===group.key&&allowed.has(row.id))
    if(selected.length!==group.references.length||new Set(selected.map(row=>row.id)).size!==selected.length)
      cognitiveFail(409,'认知权威结果引用无法匹配')
    const bytes=selected.reduce((sum,row)=>sum+row.bytes,0)
    if(selected.some(row=>!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>256*1024)||bytes>1024*1024)
      cognitiveFail(413,'认知结果数据超过本次读取预算')
    total+=bytes
  }
  if(total>8*1024*1024)cognitiveFail(413,'认知结果批次超过读取预算')
  const rows=await tx.surveyCognitiveResult.findMany({where:{OR:active.map(({input,references})=>({
    projectId:input.projectId,waveId:input.waveId,attemptId:input.attemptId,publicationId:input.publicationId,
    id:{in:references.map(reference=>reference.resultId)},
  }))},select:storedResultSelect})
  const grouped=new Map<string,StoredResultRow[]>()
  for(const row of rows){
    const key=scopeKey(row),group=grouped.get(key)
    if(group)group.push(row)
    else grouped.set(key,[row])
  }
  return groups.map(group=>decodeResults(group.input,group.references,grouped.get(group.key)??[]))
}
/** No scoring occurs on reads. The authorized caller supplies its exact immutable parent refs.
 * Bound ciphertext bytes before selecting/decrypting either metrics or raw payloads. */
export async function loadSurveyCognitiveResults(tx:Prisma.TransactionClient,input:Scope&{
  references:unknown;includeRaw?:boolean
}):Promise<LoadedSurveyCognitiveResult[]>{
  const references=refs(input.references)
  if(!references.length)return []
  {
    const sizes=await tx.$queryRaw<Array<{id:string;bytes:number}>>`
      SELECT id,octet_length(result_cipher)
        + CASE WHEN ${Boolean(input.includeRaw)} THEN octet_length(raw_cipher) ELSE 0 END AS bytes
      FROM survey_cognitive_results WHERE project_id=${input.projectId} AND wave_id=${input.waveId}
        AND attempt_id=${input.attemptId} AND publication_id=${input.publicationId}
        AND id IN (${Prisma.join(references.map(reference=>reference.resultId))})`
    const allowed=new Set(references.map(r=>r.resultId))
    const selected=sizes.filter(r=>allowed.has(r.id))
    if(selected.length!==references.length)cognitiveFail(409,'认知权威结果引用无法匹配')
    const rowBudget=input.includeRaw?2359296:256*1024,totalBudget=input.includeRaw?8*1024*1024:1024*1024
    if(selected.some(r=>!Number.isSafeInteger(r.bytes)||r.bytes<0||r.bytes>rowBudget)
      ||selected.reduce((sum,r)=>sum+r.bytes,0)>totalBudget)
      cognitiveFail(413,'认知结果数据超过本次读取预算')
  }
  const rows=await tx.surveyCognitiveResult.findMany({where:{
    projectId:input.projectId,waveId:input.waveId,attemptId:input.attemptId,
    publicationId:input.publicationId,id:{in:references.map(r=>r.resultId)},
  },select:{...storedResultSelect,...(input.includeRaw?{rawCipher:true,session:{select:{randomSeedCipher:true}}}:{}),
  }})
  return decodeResults(input,references,rows)
}
/** Caller has authenticated this attempt and holds its lock. Recover only original answer locks. */
export async function readSurveyCognitiveLockedAnswers(tx:Prisma.TransactionClient,input:Scope){
  const rows=await tx.surveyCognitiveSession.findMany({where:{...input,epoch:1},
    select:{lockedAnswersCipher:true,lockedAnswersHash:true}})
  const lockedPriorAnswers:Record<string,unknown>={}
  for(const row of rows){
    let locked:Record<string,unknown>
    try{locked=decryptUnifiedRuntimePayload<Record<string,unknown>>(row.lockedAnswersCipher)}
    catch{return cognitiveFail(409,'认知前置答案锁校验失败')}
    if(!locked||typeof locked!=='object'||Array.isArray(locked)||canonicalHash(locked)!==row.lockedAnswersHash)
      cognitiveFail(409,'认知前置答案锁校验失败')
    for(const [key,value] of Object.entries(locked)){
      if(Object.prototype.hasOwnProperty.call(lockedPriorAnswers,key)
        &&canonicalHash(lockedPriorAnswers[key])!==canonicalHash(value))
        cognitiveFail(409,'认知前置答案锁来源不一致')
      lockedPriorAnswers[key]=value
    }
  }
  return lockedPriorAnswers
}
/** Caller holds the parent Attempt lock so a new start cannot race an answer change. */
export async function assertSurveyCognitiveLockedAnswers(tx:Prisma.TransactionClient,attemptId:string,
  answers:Record<string,unknown>):Promise<void>{
  const sessions=await tx.surveyCognitiveSession.findMany({where:{attemptId,epoch:1},
    select:{lockedAnswersCipher:true,lockedAnswersHash:true}})
  for(const session of sessions){
    const locked=decryptUnifiedRuntimePayload<Record<string,unknown>>(session.lockedAnswersCipher)
    if(canonicalHash(locked)!==session.lockedAnswersHash)cognitiveFail(409,'认知前置答案锁校验失败')
    for(const [key,value] of Object.entries(locked)){
      if(!Object.prototype.hasOwnProperty.call(answers,key)||canonicalHash(answers[key])!==canonicalHash(value))
        cognitiveFail(409,'进入认知任务后不能修改影响测量路径的前置答案')
    }
  }
}
export async function listSurveyCognitiveSessions(tx:Prisma.TransactionClient,attemptId:string){
  const sessions=await tx.surveyCognitiveSession.findMany({where:{attemptId},orderBy:{epoch:'desc'},
    select:{id:true,slotKey:true,status:true,epoch:true,result:{select:{id:true,slotKey:true,epoch:true,resultHash:true,measurementDigest:true}}}})
  const seen=new Set<string>()
  return sessions.filter(s=>{if(seen.has(s.slotKey))return false;seen.add(s.slotKey);return true}).map(s=>({
    slotKey:s.slotKey,sessionId:s.id,status:s.status,epoch:s.epoch,
    resultReference:s.result?surveyCognitiveResultReference(s.result):null,
  }))
}
