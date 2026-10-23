import type { Request,RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { BoundedAdmissionGate } from '../../services/boundedAdmissionGate'
import { hashResearchCredential } from './identity.service'
import { surveyPublicRateLimits } from './public-rate.config'

const uuid='[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}'
const secret=/^[A-Za-z0-9_-]{43}$/
const code=/^R-[A-Z0-9]{8,32}$/
type Scope={publicId:string;waveId?:string;attemptId?:string;entryHash?:string;
  credentialHash?:string;researchCode?:string;linked?:boolean;slotKey?:string;sessionId?:string}
/** Only recognized routes and credential shapes reach the small policy query.
 * A plausible but incorrect secret still requires a bounded database lookup. */
export function surveyGroupRateScope(req:Pick<Request,'method'|'path'|'body'>):Scope|null{
  if(req.method!=='POST'||!req.body||typeof req.body!=='object'||Array.isArray(req.body))return null
  const match=req.path.match(new RegExp('^/r/('+uuid+')/(.+?)/?$'))
  if(!match)return null
  const [,publicId,path]=match,body=req.body as Record<string,unknown>
  const entry=typeof body.entryToken==='string'&&secret.test(body.entryToken)
    ?hashResearchCredential(body.entryToken):undefined
  if(path==='info')return entry?{publicId,entryHash:entry}:null
  const wave=path.match(new RegExp('^waves/('+uuid+')/(join|start|start-unlinked)$'))
  if(wave&&wave[2]!=='start')return entry?{publicId,waveId:wave[1],entryHash:entry,linked:wave[2]==='join'}:null
  const credential=typeof body.accessCredential==='string'&&secret.test(body.accessCredential)
    ?hashResearchCredential(body.accessCredential):undefined
  if(!credential)return null
  const researchCode=typeof body.researchCode==='string'&&code.test(body.researchCode)?body.researchCode:undefined
  if(path==='enter')return researchCode&&typeof body.waveId==='string'&&new RegExp('^'+uuid+'$').test(body.waveId)
    ?{publicId,waveId:body.waveId,credentialHash:credential,researchCode,linked:true}:null
  if(wave)return researchCode?{publicId,waveId:wave[1],credentialHash:credential,researchCode,linked:true}:null
  const attempt=path.match(new RegExp('^attempts/('+uuid+')/(.+)$'))
  if(!attempt)return null
  const action=attempt[2]
  const simple=/^(task|final|screen-out|general|withdraw-data|checkpoint\/(read|save|clear))$/.test(action)
    ||new RegExp('^(?:images|materials|report-materials)/'+uuid+'$').test(action)
  const cognitive=action.match(new RegExp('^cognitive/([a-z][a-z0-9_-]{0,79})/(?:('+uuid+')/(read|interrupt|restart|final)|(start))$'))
  if(!simple&&!cognitive)return null
  return {publicId,attemptId:attempt[1],credentialHash:credential,researchCode,
    ...(cognitive?{slotKey:cognitive[1],...(cognitive[2]?{sessionId:cognitive[2]}:{})}:{})}
}
/** The result is solely IP-budget eligibility, never reusable mutation authority.
 * One narrow indexed query; no private definition payload is read. The migration
 * guard checks immutable publication/wave/policy binding at freeze and activation;
 * published IDs/policy cannot change. Do not replace that database invariant.
 * Every handler retains its existing identity, consent, source and locked-window checks. */
export async function lookupSurveyGroupRateScope(scope:Scope):Promise<boolean>{
  const entry=scope.entryHash?Prisma.sql`EXISTS (SELECT 1 FROM survey_entry_tokens t
    WHERE t.wave_id=w.id AND t.project_id=p.id AND t.token_hash=${scope.entryHash}
      AND t.revoked_at IS NULL AND t.expires_at>statement_timestamp())`:Prisma.sql`TRUE`
  const person=Prisma.sql`EXISTS (SELECT 1 FROM survey_participants sp
    WHERE sp.project_id=p.id AND sp.research_code=${scope.researchCode??''}
      AND sp.credential_hash=${scope.credentialHash??''} AND sp.status='ACTIVE'
      AND sp.credential_revoked_at IS NULL)`
  const attempt=scope.attemptId?Prisma.sql`EXISTS (SELECT 1 FROM survey_wave_attempts a
    LEFT JOIN survey_participants sp ON sp.id=a.participant_id AND sp.project_id=a.project_id
    WHERE a.id=${scope.attemptId} AND a.wave_id=w.id AND a.project_id=p.id
      AND a.status IN ('STARTED','COMPLETED','SCREENED_OUT') AND a.excluded_at IS NULL
      AND ((a.participant_id IS NULL AND p.collection_mode='SINGLE_UNLINKED' AND a.session_hash=${scope.credentialHash??''})
        OR (p.collection_mode='LINKED_WAVES' AND sp.research_code=${scope.researchCode??''}
          AND sp.credential_hash=${scope.credentialHash??''} AND sp.status='ACTIVE' AND sp.credential_revoked_at IS NULL))
      ${scope.sessionId?Prisma.sql`AND EXISTS (SELECT 1 FROM survey_cognitive_sessions cs
        WHERE cs.id=${scope.sessionId} AND cs.attempt_id=a.id AND cs.wave_id=w.id AND cs.project_id=p.id
          AND cs.publication_id=pub.id AND cs.slot_key=${scope.slotKey??''})`:Prisma.empty})`:Prisma.sql`TRUE`
  const rows=await prisma.$queryRaw<Array<{id:string}>>`
    SELECT w.id FROM survey_projects p
    JOIN survey_waves w ON w.project_id=p.id
    JOIN survey_publications pub ON pub.id=w.publication_id AND pub.project_id=p.id
    JOIN users u ON u.id=p.owner_user_id
    JOIN survey_researcher_grants g ON g.user_id=u.id
    JOIN survey_mfa_credentials m ON m.user_id=u.id
    WHERE p.public_id=${scope.publicId} AND p.status='ACTIVE' AND w.status='OPEN'
      AND w.hard_stop_at IS NULL AND w.group_ip_activated_at IS NOT NULL
      AND w.opens_at=w.group_ip_activated_at AND w.opens_at<=statement_timestamp()
      AND w.closes_at>statement_timestamp() AND w.finish_until>statement_timestamp()
      AND w.closes_at<=w.group_ip_activated_at+interval '48 hours'
      AND w.finish_until<=w.closes_at
      AND w.group_ip_policy IS NOT NULL
      AND w.group_ip_policy->>'schemaVersion'='1'
      AND pub.purpose='RESEARCH_ONLY'
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp()) AND g.status='ACTIVE' AND m.enabled
      ${scope.waveId?Prisma.sql`AND w.id=${scope.waveId}`:Prisma.empty}
      ${scope.linked===undefined?Prisma.empty:Prisma.sql`AND p.collection_mode=${scope.linked?'LINKED_WAVES':'SINGLE_UNLINKED'}`}
      AND ${entry} AND ${attempt}
      ${!scope.entryHash&&!scope.attemptId?Prisma.sql`AND ${person}`:Prisma.empty}
    LIMIT 1`
  return rows.length===1
}
const policyGate=new BoundedAdmissionGate({name:'survey_group_ip_policy',maxConcurrent:4,
  maxQueue:8,maxWaitMs:250,retryAfterSeconds:1})
/** The response deadline NEVER releases a live SQL slot. At most four actual
 * lookups can remain outstanding in this process, including timed-out callers.
 * Queued operations expire in the existing gate before they can execute. */
export function createSurveyPublicRateLimiter(options:{
  lookup?:(scope:Scope)=>Promise<boolean>;gate?:BoundedAdmissionGate;responseTimeoutMs?:number;
  standard?:RequestHandler
}={}):RequestHandler{
  const standard=options.standard??createRedisRateLimiter({name:'survey-public-entry',...surveyPublicRateLimits()})
  const lookup=options.lookup??lookupSurveyGroupRateScope,gate=options.gate??policyGate
  return async(req,res,next)=>{
    const scope=surveyGroupRateScope(req)
    if(!scope){await standard(req,res,next);return}
    let timer:ReturnType<typeof setTimeout>|undefined
    let eligible=false
    try{
      eligible=await Promise.race([gate.run(()=>lookup(scope)),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Survey policy response deadline')),options.responseTimeoutMs??2000)
        timer.unref?.()
      })])
    }catch{
      // Eligibility is only permission to bypass the ordinary shared IP bucket.
      // An unavailable/overloaded lookup grants no exemption. Keep live SQL
      // slots bounded and apply the stricter Redis limit rather than rejecting
      // otherwise valid ordinary participants before their handler can run.
      eligible=false
    }finally{if(timer)clearTimeout(timer)}
    if(res.headersSent||res.writableEnded||res.destroyed)return
    if(eligible){next();return}
    // Exactly one ordinary budget decision; Redis failure still fails closed.
    await standard(req,res,next)
  }
}
