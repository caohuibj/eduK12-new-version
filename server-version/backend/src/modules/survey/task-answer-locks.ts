import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
type Fail=(status:number,message:string)=>never
type Scope={projectId:string;waveId:string;attemptId:string;publicationId:string}
type Lock={lockedAnswersCipher:string;lockedAnswersHash:string}
/** Shared host facts, separate from scientific snapshots and expiring drafts.
 * Callers authenticate the exact parent and hold its lock before reading. */
async function rows(tx:Prisma.TransactionClient,attemptId:string,scope?:Scope):Promise<Lock[]>{
  const cognitive=await tx.surveyCognitiveSession.findMany({where:{...(scope??{attemptId}),epoch:1},
    select:{lockedAnswersCipher:true,lockedAnswersHash:true}})
  const native=await tx.situationalAttempt.findMany({where:{surveyAttemptId:attemptId,
    ...(scope?{surveyPublicationId:scope.publicationId}:{}),attemptEpoch:1,
    surveyLockedAnswersCipher:{not:null}},select:{surveyLockedAnswersCipher:true,surveyLockedAnswersHash:true}})
  return [...cognitive,...native.map(row=>({lockedAnswersCipher:row.surveyLockedAnswersCipher!,lockedAnswersHash:row.surveyLockedAnswersHash!}))]
}
function merge(locks:Lock[],fail:Fail){
  const merged:Record<string,unknown>={}
  for(const row of locks){
    let locked:Record<string,unknown>
    try{locked=decryptUnifiedRuntimePayload<Record<string,unknown>>(row.lockedAnswersCipher)}
    catch{return fail(409,'任务前置答案锁校验失败')}
    if(!locked||typeof locked!=='object'||Array.isArray(locked)||canonicalHash(locked)!==row.lockedAnswersHash)
      fail(409,'任务前置答案锁校验失败')
    for(const [key,value] of Object.entries(locked)){
      if(Object.prototype.hasOwnProperty.call(merged,key)&&canonicalHash(merged[key])!==canonicalHash(value))
        fail(409,'任务前置答案锁来源不一致')
      merged[key]=value
    }
  }
  return merged
}
export async function readSurveyTaskLockedAnswers(tx:Prisma.TransactionClient,scope:Scope,fail:Fail){
  return merge(await rows(tx,scope.attemptId,scope),fail)
}
export async function assertSurveyTaskLockedAnswers(tx:Prisma.TransactionClient,attemptId:string,answers:Record<string,unknown>,fail:Fail){
  const locked=merge(await rows(tx,attemptId),fail)
  for(const [key,value] of Object.entries(locked)){
    if(!Object.prototype.hasOwnProperty.call(answers,key)||canonicalHash(answers[key])!==canonicalHash(value))
      fail(409,'进入任务后不能修改影响测量路径的前置答案')
  }
}
