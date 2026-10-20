import { createHash } from 'node:crypto'
import { cacheService } from '../services/cacheService'
import type { Request,RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { BoundedAdmissionGate } from '../services/boundedAdmissionGate'
import { hashPublicAccessToken } from '../services/publicAccessTokenCrypto'
import { hashRecoveryToken,isValidRecoveryToken } from '../services/anonymousAccess'

const uuid='[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}'
export type TrainingGroupRateScope={tokenHash?:string;attemptId?:string;sessionId?:string;recoveryHash?:string}
/** Only actual supported routes and correctly shaped credentials earn a lookup.
 * Query strings (including round hints) are deliberately never inspected. */
export function trainingGroupRateScope(req:Pick<Request,'method'|'baseUrl'|'path'|'headers'|'body'>):TrainingGroupRateScope|null{
  const path=`${req.baseUrl}${req.path}`
  const method=req.method.toUpperCase()
  const entry=path.match(/^\/api\/public\/composite-assessments\/([A-Za-z0-9_-]{32})(\/start)?\/?$/)
  if(entry&&((method==='GET'&&!entry[2])||(method==='POST'&&entry[2])))return {tokenHash:hashPublicAccessToken(entry[1])}
  const header=req.headers['x-recovery-token'],recovery=Array.isArray(header)?header[0]:header
  const credential=isValidRecoveryToken(recovery)?recovery:req.body?.recoveryToken
  if(!isValidRecoveryToken(credential))return null
  const parent=path.match(new RegExp('^/api/public/composite-assessments/attempts/('+uuid+')(.*)$'))
  if(parent){
    const suffix=parent[2]
    const get=suffix===''||suffix==='/'||/^\/(whole\/(definition|receipt)|report-status|report|analysis-export)$/.test(suffix)
      ||new RegExp('^/form-sections/'+uuid+'/assets/'+uuid+'/content$').test(suffix)
      ||new RegExp('^/items/'+uuid+'/scale/assets/'+uuid+'/content$').test(suffix)
      ||new RegExp('^/items/'+uuid+'/situational/'+uuid+'(?:/assets/'+uuid+'/content|/scenes/[A-Za-z0-9_-]{1,100}/video-sources)?$').test(suffix)
    const post=/^\/(restart|whole\/submit|bundle-retry|report-retry)$/.test(suffix)
      ||new RegExp('^/form-sections/'+uuid+'/submit$').test(suffix)
      ||new RegExp('^/items/'+uuid+'/(scale/submit|situational/'+uuid+'/submit)$').test(suffix)
      ||new RegExp('^/form-sections/'+uuid+'/items/'+uuid+'/options/[0-9]{1,4}/video-capability$').test(suffix)
      ||new RegExp('^/items/'+uuid+'/scale/items/[A-Za-z0-9_-]{1,100}/video-capability$').test(suffix)
    if((method==='GET'&&get)||(method==='POST'&&post))return {attemptId:parent[1],recoveryHash:hashRecoveryToken(credential)}
  }
  const cognitive=path.match(new RegExp('^/api/public/cognitive/sessions/('+uuid+')(.*)$'))
  if(cognitive&&((method==='GET'&&(cognitive[2]===''||new RegExp('^/assets/'+uuid+'/content$').test(cognitive[2])))
    ||(method==='POST'&&/^\/(submit|restart|video-capabilities)$/.test(cognitive[2]))))
    return {sessionId:cognitive[1],recoveryHash:hashRecoveryToken(credential)}
  return null
}
/** One bounded indexed lookup, no scoring definitions or process-wide grants.
 * Database guards retain the immutable publication/course/round/link binding.
 * This result changes ONLY the coarse IP budget; it is never authentication. */
export async function lookupTrainingGroupRateScope(scope:TrainingGroupRateScope):Promise<boolean>{
  const from=scope.tokenHash?Prisma.sql`composite_assessment_access_tokens t`:
    Prisma.sql`composite_assessment_attempts attempt
      ${scope.sessionId?Prisma.sql`JOIN cognitive_sessions cs ON cs.composite_attempt_id=attempt.id AND cs.id=${scope.sessionId}`:Prisma.empty}
      JOIN composite_assessment_access_tokens t ON t.id=attempt.access_token_id AND t.composite_assessment_id=attempt.composite_assessment_id`
  const principal=scope.tokenHash?Prisma.sql`t.token_hash=${scope.tokenHash}
    AND t.is_active AND t.expires_at>statement_timestamp() AND (t.max_uses=0 OR t.used_count<t.max_uses)`:
    Prisma.sql`attempt.user_id IS NULL AND attempt.recovery_token_hash=${scope.recoveryHash??''}
      AND attempt.status::text IN ('IN_PROGRESS','COMPLETED')
      ${scope.attemptId?Prisma.sql`AND attempt.id=${scope.attemptId}`:Prisma.empty}
      ${scope.sessionId?Prisma.sql`AND cs.user_id IS NULL`:Prisma.empty}`
  const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT r.id FROM ${from}
    JOIN training_public_rounds r ON r.id=t.training_round_id AND r.composite_id=t.composite_assessment_id
    JOIN composite_assessments a ON a.id=r.composite_id AND a.published_at=r.published_at
    JOIN courses c ON c.id=r.course_id
    JOIN questionnaire_course_deliveries q ON q.composite_id=a.id AND q.course_id=c.id
    JOIN users u ON u.id=a.created_by
    WHERE ${principal} AND a.status::text='PUBLISHED' AND a.public_enabled
    AND a.product_kind::text='QUESTIONNAIRE' AND a.questionnaire_type::text='COURSE'
    AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
    AND (c.ended_at IS NULL OR c.ended_at>statement_timestamp())
    AND u.is_active AND NOT u.is_frozen AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    AND (u.role::text='ADMIN' OR (u.role::text='TEACHER' AND c.creator_id=u.id))
    AND r.opens_at<=statement_timestamp() AND r.closes_at>statement_timestamp()
    AND r.closes_at<=r.opens_at+interval '48 hours'
    AND (a.opens_at IS NULL OR a.opens_at<=statement_timestamp())
    AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp())
    LIMIT 1`
  return rows.length===1
}
const policyGate=new BoundedAdmissionGate({name:'training_group_ip_policy',maxConcurrent:4,maxQueue:8,maxWaitMs:250,retryAfterSeconds:1})
export const TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE=120
const localLookupWindows=new Map<string,{until:number;count:number}>()
const failureKey=(req:Request)=>'ratelimit:training-group-ip-negative:'+createHash('sha256').update(req.ip||req.socket?.remoteAddress||'unknown').digest('hex')
/** Only failed exception verification consumes this budget. Valid group traffic
 * never consumes a replacement shared-IP quota, and no successful grant is cached.
 * Check inside the bounded gate immediately before SQL; concurrent overshoot is
 * bounded by live lookups (four per process), not the queued request count. */
export async function admitTrainingGroupLookup(req:Request):Promise<boolean>{
  const key=failureKey(req)
  if(process.env.NODE_ENV==='production'){
    const state=await cacheService.getRateLimitState(key)
    if(!state)throw new Error('Training negative-lookup budget unavailable')
    return state.count<TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE
  }
  const prior=localLookupWindows.get(key)
  return !prior||prior.until<=Date.now()||prior.count<TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE
}
export async function recordTrainingGroupLookupFailure(req:Request):Promise<void>{
  const key=failureKey(req)
  if(process.env.NODE_ENV==='production'){
    if(!await cacheService.consumeRateLimit(key,TRAINING_GROUP_FAILED_LOOKUPS_PER_MINUTE,60))throw new Error('Training negative-lookup budget unavailable')
    return
  }
  const now=Date.now(),prior=localLookupWindows.get(key)
  if(prior&&prior.until>now){prior.count++;return}
  if(localLookupWindows.size>=4096){for(const [id,value]of localLookupWindows)if(value.until<=now)localLookupWindows.delete(id)}
  if(localLookupWindows.size>=4096&&!prior)throw new Error('Training negative-lookup budget full')
  localLookupWindows.set(key,{until:now+60000,count:1})
}
const rejectIp:RequestHandler=(_req,res)=>{res.setHeader('Retry-After','60');res.status(429).json({code:-1,message:'请求过于频繁，请稍后再试'})}
/** Called ONLY when the normal coarse IP budget rejects, after unchanged token
 * and recovery budgets. Ordinary traffic adds zero SQL. Live SQL remains held
 * after response timeout; no cache grants privilege beyond the frozen window. */
export function createTrainingGroupIpResolver(options:{lookup?:(scope:TrainingGroupRateScope)=>Promise<boolean>;gate?:BoundedAdmissionGate;responseTimeoutMs?:number;admit?:(req:Request)=>Promise<boolean>;recordFailure?:(req:Request)=>Promise<void>;reject?:RequestHandler}={}):RequestHandler{
  const lookup=options.lookup??lookupTrainingGroupRateScope,gate=options.gate??policyGate
  const admit=options.admit??admitTrainingGroupLookup,recordFailure=options.recordFailure??recordTrainingGroupLookupFailure,reject=options.reject??rejectIp
  return async(req,res,next)=>{
    if(req.aborted||res.headersSent||res.writableEnded||res.destroyed)return
    const scope=trainingGroupRateScope(req)
    if(!scope){await reject(req,res,next);return}
    let timer:ReturnType<typeof setTimeout>|undefined
    try{
      const eligible=await Promise.race([gate.run(async()=>{
        if(req.aborted||res.headersSent||res.writableEnded||res.destroyed)return false
        if(!await admit(req))return false
        const valid=await lookup(scope)
        if(!valid)await recordFailure(req)
        return valid
      }),new Promise<never>((_,fail)=>{
        timer=setTimeout(()=>fail(new Error('Training policy response deadline')),options.responseTimeoutMs??2000);timer.unref?.()
      })])
      if(res.headersSent||res.writableEnded||res.destroyed)return
      if(eligible)next();else await reject(req,res,next)
    }catch{
      if(!res.headersSent&&!res.writableEnded&&!res.destroyed){res.setHeader('Retry-After','1');res.status(503).json({code:-1,message:'公开入口繁忙，请稍后重试'})}
    }finally{if(timer)clearTimeout(timer)}
  }
}
