/** GitHub-only isolated proof against the once-built /app/dist candidate.
 * Run with node /probe.cjs, or --verify-restore after the synthetic pg_restore.
 * No application source is imported, no limiter/auth/database implementation is mocked.
 */
'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {readFileSync,writeFileSync,mkdirSync,readdirSync}=require('node:fs');
const {join}=require('node:path');
const {createRequire}=require('node:module');
const {createServer}=require('node:http');
assert.equal(process.env.CI,'true');assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.SURVEY_CI_ISOLATED,'1');assert.equal(process.versions.node,'24.21.0');
const restoreMode=process.argv[2]==='--verify-restore';
assert(process.argv.length===2 || (process.argv.length===3&&restoreMode),'Unsupported mode');
const database=restoreMode?'survey_restore_ci_test':'survey_candidate_ci_test';
function isolatedUrl(value,kind){
 const u=new URL(value);assert.equal(u.hostname,'127.0.0.1');assert(!u.hash);
 if(kind==='db'){assert.equal(u.protocol,'postgresql:');assert.equal(u.port,'5432');assert.equal(u.pathname,'/'+database)}
 else{assert.equal(u.protocol,'redis:');assert.equal(u.port,'6379');assert(['','/0'].includes(u.pathname));assert(!u.username&&!u.password&&!u.search)}
 return u;
}
const adminUrl=isolatedUrl(process.env.DATABASE_URL_ADMIN,'db');assert.equal(adminUrl.username,'ptool');
const runtimeUrl=isolatedUrl(process.env.DATABASE_URL_RUNTIME,'db');assert.equal(runtimeUrl.username,'survey_ci_runtime');assert.equal(runtimeUrl.password,'survey-ci-only-runtime');
isolatedUrl(process.env.REDIS_URL,'redis');
assert(/^[0-9a-f]{40}$/.test(process.env.SURVEY_CI_SOURCE_SHA||''));
assert(/^sha256:[0-9a-f]{64}$/.test(process.env.SURVEY_CI_IMAGE_ID||''));
const out='/evidence';mkdirSync(out,{recursive:true});
const dist='/app/dist',sha=x=>createHash('sha256').update(x).digest('hex'),req=createRequire('/app/package.json');
function treeHash(dir){const entries=[];function walk(base,relative=''){for(const e of readdirSync(base,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const rel=relative+e.name;if(e.isDirectory())walk(join(base,e.name),rel+'/');else{assert(e.isFile(),'Candidate artifact must contain regular files');entries.push([rel,sha(readFileSync(join(base,e.name)))])}}}walk(dir);return sha(JSON.stringify(entries))}
const binding={sourceSha:process.env.SURVEY_CI_SOURCE_SHA,imageId:process.env.SURVEY_CI_IMAGE_ID,distSha256:treeHash(dist),probeSha256:sha(readFileSync(__filename)),node:process.versions.node};
runtimeUrl.searchParams.set('application_name','survey_group_ip_http');runtimeUrl.searchParams.set('connection_limit','10');runtimeUrl.searchParams.set('pool_timeout','5');
process.env.DATABASE_URL=runtimeUrl.toString();process.env.NODE_ENV='production';
process.env.CORS_ORIGIN='http://127.0.0.1:53019';process.env.TRUST_PROXY_HOPS='1';
process.env.PERF_ISOLATED_TEST_MODE='1';process.env.PERF_SQL_EVENT_COUNT='1';process.env.SURVEY_ANALYTICS_ENABLED='true';
// Public fixture keys belong solely to this disposable database; never production.
process.env.JWT_SECRET='survey-ci-synthetic-jwt-not-production-20261017';
process.env.ASSET_SIGNING_SECRET='survey-ci-synthetic-assets-not-production';
process.env.DATA_ENCRYPTION_KEY='57'.repeat(32);process.env.DATA_PSEUDONYM_KEY='58'.repeat(32);
const {PrismaClient}=req('@prisma/client'),db=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}});
function createLoadGuards({globalMs,blockMs}){
 const controller=new AbortController();let failure=null,blockTimer=null;
 const abort=e=>{failure??=e instanceof Error?e:new Error(String(e));controller.abort(failure)};
 const timer=setTimeout(()=>{abort(new Error('Probe hard deadline'));process.exitCode=1;server.closeAllConnections()},globalMs);
 return {signal:controller.signal,abort,startBlock(){blockTimer=setTimeout(()=>abort(new Error('Probe block deadline')),blockMs)},
 check(){if(failure)throw failure},telemetry(row,available){if(row.ormErrors)abort(new Error('Unexpected runtime ORM error'));if(row.memory.rss>1073741824)abort(new Error('RSS exceeds 1 GiB'));if(available<2147483648)abort(new Error('Available memory below 2 GiB'))},
 close(){clearTimeout(timer);clearTimeout(blockTimer)}};
}
const {surveyPlatformRouter}=req(dist+'/modules/survey/platform.routes.js');
const {surveyAuthRouter}=req(dist+'/modules/survey/auth.routes.js');
const {surveyExportsRouter}=req(dist+'/modules/survey/analytics.export.routes.js');
const {issueCsrfToken}=req(dist+'/utils/authCookies.js');
const {hashPassword}=req(dist+'/utils/password.js');
const express=req('express'),{cacheService}=req(dist+'/services/cacheService.js'),{prisma}=req(dist+'/config/database.js'),{generateToken}=req(dist+'/utils/jwt.js')
const {publicSurveyRouter}=req(dist+'/modules/survey/public.routes.js'),{surveyWavesRouter}=req(dist+'/modules/survey/waves.routes.js'),{surveyProjectsRouter}=req(dist+'/modules/survey/projects.routes.js'),{csrfProtection}=req(dist+'/middleware/csrf.js'),{errorHandler}=req(dist+'/middleware/errorHandler.js')
const {createDraft,updateDraft}=req(dist+'/modules/survey/builder.service.js'),{initialCognitiveDefinition}=req(dist+'/modules/survey/cognitive.definition.js'),{canonicalHash}=req(dist+'/modules/assessment-runtime/canonical.js')
const {groupIpLocalDate}=req(dist+'/modules/survey/group-ip-policy.js')
const {createClient}=req('redis'),redis=createClient({url:process.env.REDIS_URL})
const evidence={status:'running',scope:'Built candidate product routers, production Redis limiter and restricted PostgreSQL role; synthetic-only, not browser or capacity proof',binding,requests:[],checks:[],sql:{calls:0,definitionReads:0,policyQueries:0},limits:{requestMs:10000,phaseMs:180000,maxConcurrency:8,rssBytes:1073741824,minimumAvailableBytes:2147483648,dbWaitMs:5000},clock:'Real server clock for HTTP expiry; unit tests separately inject deterministic Dates; Redis count is explicitly preloaded to5000/900, no5001burst',serverStopped:false}
const save=()=>writeFileSync(out+(restoreMode?'/runtime-restore.json':'/runtime-result.json'),JSON.stringify(evidence,null,2)),check=(name,a,b)=>{assert.deepEqual(a,b,name);evidence.checks.push({name,pass:true});save()}
const guards=createLoadGuards({globalMs:180000,blockMs:180000});guards.startBlock();let origin='http://127.0.0.1:53019',monitor,monitorBusy=false,lockSince=0,ormErrors=0,active=0,maxActive=0
prisma.$use(async(p,next)=>{evidence.sql.calls++;if(p.action==='$queryRaw'&&p.args?.[0]?.includes?.('SELECT w.id'))evidence.sql.policyQueries++;try{return await next(p)}catch(e){ormErrors++;guards.abort(new Error('Unexpected runtime ORM error'));throw e}})
prisma.$on('query',(e)=>{evidence.sql.statements=(evidence.sql.statements||0)+1;if(e.query.includes('SELECT w.id FROM survey_projects')){evidence.sql.policyQueries++;if(e.query.includes('compiled_snapshot'))throw new Error('Policy must not read snapshot');evidence.sql.policySqlMs=(evidence.sql.policySqlMs||0)+e.duration}else if(e.query.includes('compiled_snapshot'))evidence.sql.definitionReads++})
const app=express(),server=createServer(app);app.set('trust proxy',1);app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection);app.get('/api/auth/csrf',(r,s)=>s.json({code:0,data:{csrfToken:issueCsrfToken(r,s)}}));app.use('/api/platform/survey',surveyPlatformRouter);app.use('/api/survey/auth',surveyAuthRouter);app.use('/api/survey/projects',surveyExportsRouter);app.use('/api/survey/projects',surveyWavesRouter);app.use('/api/survey/projects',surveyProjectsRouter);app.use('/api/public/survey',publicSurveyRouter);app.use(errorHandler)
const ip='198.18.0.31',bucket='ratelimit:survey-public-entry:'+sha(ip)
class Client{
 constructor(name,token){this.name=name;this.token=token}
 async call(path,body,expected=200,label=path,method=body===undefined?'GET':'POST'){
  guards.check();const started=performance.now(),before=evidence.sql.calls,csrf='fixture_csrf_'+randomUUID();active++;maxActive=Math.max(active,maxActive)
  try{const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,'x-forwarded-for':ip,...(this.token?{cookie:'huisurvey_research_session='+this.token+'; huisurvey_research_csrf='+csrf,'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([guards.signal,AbortSignal.timeout(10000)])})
   const raw=await r.text(),d=JSON.parse(raw);evidence.requests.push({role:this.name,label,method,path:path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,':id'),status:r.status,responseBytes:Buffer.byteLength(raw),ms:Math.round((performance.now()-started)*1000)/1000,ormCalls:active===1?evidence.sql.calls-before:null,retryAfter:r.headers.get('retry-after'),limit:r.headers.get('ratelimit-limit')});save()
   if(r.status>=500)guards.abort(new Error('Unexpected5xx'));assert((Array.isArray(expected)?expected:[expected]).includes(r.status),label+': HTTP'+r.status+' '+d.message);return d.data
  }finally{active--}
 }
}
const participant=new Client('participant'),consent='Synthetic research consent for voluntary participation, with a clear right to withdraw and no diagnostic feedback.',form={schemaVersion:1,pages:[{pageKey:'page',title:'Synthetic question',questions:[{itemKey:'choice',type:'SINGLE',prompt:'Choose',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]}]}
let owner,researcher
const basePath=(pub)=>'/api/public/survey/r/'+pub
const setBucket=async(n=5000)=>{await redis.set(bucket,String(n),{EX:900})}
const resetBucket=async()=>redis.del(bucket)
async function createProject(mode='SINGLE_UNLINKED'){
 const p=await researcher.call('/api/survey/projects',{requestId:randomUUID(),title:'Synthetic group IP research',collectionMode:mode})
 const d=await createDraft(owner.id,p.id,{requestId:randomUUID(),kind:'FORM',instrumentKey:'form',title:'Synthetic form'})
 await updateDraft(owner.id,p.id,d.id,{revision:d.revision,title:d.title,definition:form})
 return {id:p.id,tool:d.id}
}
async function createWave(p,group=true,extra={}){
 const path='/api/survey/projects/'+p.id+'/waves'
 const body={requestId:randomUUID(),title:group?'Group':'Ordinary',consentText:consent,generalText:'Synthetic thanks',instrumentIds:[p.tool],allowNewParticipants:true,linkageNoticeConfirmed:true,checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:2},...(group?{groupIpPolicy:{schemaVersion:1,timeZone:'Asia/Shanghai'}}:{}),...extra}
 let w=await researcher.call(path,body)
 await researcher.call(path+'/'+w.id+'/prepare',{revision:w.revision});w=await researcher.call(path+'/'+w.id)
 const opened=await researcher.call(path+'/'+w.id+'/open',{revision:w.revision});w=await researcher.call(path+'/'+w.id)
 return {...w,...opened,path:path+'/'+w.id,request:body}
}
async function start(w){return participant.call(basePath(w.publicId)+'/waves/'+w.id+'/start-unlinked',{entryToken:w.entrySecret,consent:true,consentVersion:1})}
async function transition(w,action){const current=await researcher.call(w.path);return researcher.call(w.path+'/'+action,{revision:current.revision})}
async function seedTimed(template,remainingMs,linked=false){
 const source=await db.surveyPublication.findUniqueOrThrow({where:{id:template.publicationId}}),publicId=randomUUID(),projectId=randomUUID(),waveId=randomUUID(),publicationId=randomUUID()
 const end=new Date(Date.now()+remainingMs),startAt=new Date(end.getTime()-48*3600000),policy={schemaVersion:1,timeZone:'Asia/Shanghai',activationDate:groupIpLocalDate(startAt,'Asia/Shanghai')}
 const snapshot={...source.compiledSnapshot,projectId,waveId,collectionMode:linked?'LINKED_WAVES':'SINGLE_UNLINKED',groupIpPolicy:policy,linkageNoticeConfirmed:linked}
 await db.surveyProject.create({data:{id:projectId,publicId,ownerUserId:owner.id,title:'Synthetic exact48hour boundary',collectionMode:snapshot.collectionMode,status:'ACTIVE'}})
 await db.surveyPublication.create({data:{id:publicationId,projectId,version:1,definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot,consentVersion:1}})
 await db.surveyWave.create({data:{id:waveId,projectId,publicationId,ordinal:1,title:'Synthetic expiry',status:'OPEN',consentText:consent,linkageNoticeConfirmed:linked,groupIpPolicy:policy,groupIpActivatedAt:startAt,opensAt:startAt,closesAt:end,finishUntil:end}})
 const entrySecret=randomBytes(32).toString('base64url');await db.surveyEntryToken.create({data:{id:randomUUID(),projectId,waveId,tokenHash:sha(entrySecret),expiresAt:end}})
 return {id:waveId,projectId,publicationId,publicId,entrySecret,end,startAt,snapshot}
}
async function seedAttempt(w){const secret=randomBytes(32).toString('base64url'),attemptId=randomUUID();await db.surveyWaveAttempt.create({data:{id:attemptId,projectId:w.projectId,waveId:w.id,sessionHash:sha(secret)}});await db.surveyConsent.create({data:{id:randomUUID(),projectId:w.projectId,waveId:w.id,attemptId,consentVersion:1,accepted:true}});return {attemptId,accessCredential:secret}}
async function waitUntil(date){while(Date.now()<=date.getTime())await new Promise(r=>setTimeout(r,Math.min(50,date.getTime()-Date.now()+2)))}
async function main(){
 await initialize();
 if(restoreMode){await verifyRestored();return}
 monitor=setInterval(async()=>{if(monitorBusy)return;monitorBusy=true;try{const available=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;evidence.peakRssBytes=Math.max(evidence.peakRssBytes||0,process.memoryUsage().rss);evidence.minimumAvailableBytes=Math.min(evidence.minimumAvailableBytes||Infinity,available);guards.telemetry({ormErrors,memory:process.memoryUsage()},available);const rows=await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='survey_group_ip_http' AND wait_event_type='Lock'");if(rows[0].n){lockSince||=Date.now();if(Date.now()-lockSince>5000)guards.abort(new Error('DBwait5s'))}else lockSince=0}catch(e){guards.abort(e)}finally{monitorBusy=false}},250)
 const admin=await db.user.create({data:{username:'group_admin_'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
 owner=await db.user.create({data:{username:'group_owner_'+randomUUID(),passwordHash:'synthetic-only',role:'STUDENT',accountDomain:'SURVEY'}})
 const login='group_'+randomUUID().replace(/-/g,'').slice(0,16);await db.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:owner.id,grantedBy:admin.id,status:'ACTIVE'}});await db.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-only'}})
 researcher=new Client('researcher',generateToken({userId:owner.id,username:owner.username,role:owner.role,accountDomain:'SURVEY',tokenVersion:owner.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)}))
 const p=await createProject(),group=await createWave(p),ordinary=await createWave(p,false),otherGroup=await createWave(p)
 const delta=Date.parse(group.closesAt)-Date.parse(group.groupIpActivatedAt);check('Default_group_window_exact48elapsed_hours',delta,48*3600000);check('Group_no_grace',group.finishUntil,group.closesAt);check('Immediate_group_activation',group.opensAt,group.groupIpActivatedAt)
 const info=await participant.call(basePath(group.publicId)+'/info',{entryToken:group.entrySecret});check('Group_info_exact_target_only',info.waves.map((x)=>x.id),[group.id])
 const normalInfo=await participant.call(basePath(ordinary.publicId)+'/info',{entryToken:ordinary.entrySecret});check('Ordinary_token_keeps_multiwave_discovery',normalInfo.waves.length,3)
 const standard=await start(ordinary),g=await start(group),g2=await start(group)
 await setBucket();await participant.call(basePath(group.publicId)+'/info',undefined,429,'ordinary_GET_at5000_rejected')
 check('Real_production_limit_default',evidence.requests.at(-1).limit,'5000');assert(Number(evidence.requests.at(-1).retryAfter)>0&&Number(evidence.requests.at(-1).retryAfter)<=900)
 const before=await redis.get(bucket)
 await Promise.all(Array.from({length:8},(_,i)=>participant.call(basePath(group.publicId)+'/info',{entryToken:group.entrySecret},200,'group_same_IP_parallel8_'+i)))
 check('Group_parallel8_all_allowed_without_incrementing_full_bucket',await redis.get(bucket),before)
 await participant.call(basePath(group.publicId)+'/waves/'+group.id+'/start-unlinked',{entryToken:group.entrySecret,consent:true,consentVersion:1},200,'Group_can_start_past_limit')
 await participant.call(basePath(ordinary.publicId)+'/attempts/'+standard.attemptId+'/task',{accessCredential:standard.accessCredential},429,'Ordinary_target_cannot_borrow_group')
 await participant.call(basePath(group.publicId)+'/waves/'+otherGroup.id+'/start-unlinked',{entryToken:group.entrySecret,consent:true,consentVersion:1},429,'Token_cannot_borrow_other_group_wave')
 await participant.call(basePath(group.publicId)+'/attempts/'+g.attemptId+'/task',{},429,'Missing_proof_not_exempt')
 await participant.call(basePath(group.publicId)+'/attempts/'+g.attemptId+'/task',{accessCredential:randomBytes(32).toString('base64url')},429,'Plausible_wrong_proof_not_exempt')
 await participant.call(basePath(group.publicId)+'/attempts/'+randomUUID()+'/task',{accessCredential:g.accessCredential},429,'Random_attempt_not_exempt')
 await participant.call(basePath(group.publicId)+'/attempts/'+g.attemptId+'/arbitrary',{accessCredential:g.accessCredential},429,'Unknown_endpoint_not_exempt')
 await resetBucket();await participant.call(basePath(group.publicId)+'/attempts/'+g.attemptId+'/task',{},400,'Missing_proof_still_rejected_with_free_budget')
 await participant.call(basePath(group.publicId)+'/attempts/'+g.attemptId+'/task',{accessCredential:randomBytes(32).toString('base64url')},403,'Wrong_proof_still_rejected_with_free_budget')
 await setBucket();const prefix=basePath(group.publicId)+'/attempts/'+g.attemptId,proof={accessCredential:g.accessCredential}
 await participant.call(prefix+'/task',proof);await participant.call(prefix+'/checkpoint/save',{...proof,revision:0,answers:{form:{choice:'yes'}}});await participant.call(prefix+'/checkpoint/read',proof)
 const final={...proof,submissionId:randomUUID(),answers:{form:{choice:'yes'}}};const receipt=await participant.call(prefix+'/final',final);check('Group_final_persisted',receipt.status,'COMPLETED');await participant.call(prefix+'/final',final);await participant.call(prefix+'/general',proof)
 await transition(group,'pause');await participant.call(prefix+'/task',proof,429,'Paused_group_no_exemption');await transition(group,'resume');await participant.call(prefix+'/task',proof,200,'Resume_same_deadline')
 const afterResume=await researcher.call(group.path);check('Resume_does_not_extend',afterResume.closesAt,group.closesAt)
 await researcher.call(group.path+'/open',{revision:afterResume.revision},409,'Repeated_open_not_renewable')
 const rot=await researcher.call(group.path+'/entry-token/rotate',{revision:afterResume.revision});check('Rotation_same_deadline',rot.expiresAt,group.closesAt)
 await participant.call(basePath(group.publicId)+'/info',{entryToken:group.entrySecret},429,'Revoked_old_entry_not_exempt')
 // Fixed48h fixture against real clock: no fake production time and no48h wait.
 await resetBucket();const expires=await seedTimed(group,1200),ea=await seedAttempt(expires),ep=basePath(expires.publicId)+'/attempts/'+ea.attemptId,eb={accessCredential:ea.accessCredential}
 await participant.call(ep+'/task',eb);await waitUntil(expires.end);await participant.call(ep+'/final',{...eb,submissionId:randomUUID(),answers:{form:{choice:'yes'}}},403,'Real_exact48h_new_FINAL_rejected');await participant.call(basePath(expires.publicId)+'/waves/'+expires.id+'/start-unlinked',{entryToken:expires.entrySecret,consent:true,consentVersion:1},403,'Real_exact48h_new_start_rejected');await participant.call(ep+'/checkpoint/save',{...eb,revision:0,answers:{form:{choice:'yes'}}},403,'Real_exact48h_checkpoint_rejected')
 await setBucket();await participant.call(ep+'/task',eb,429,'Expired_group_returns_to_original_bucket');await resetBucket();await participant.call(ep+'/withdraw-data',eb,200,'Expired_group_withdraw_still_available')
 // Shorten a live group's finish window without extending/restarting it.
 const end=new Date(Date.now()+60);await db.surveyWave.update({where:{id:group.id},data:{closesAt:end,finishUntil:end}});await waitUntil(end)
 await participant.call(prefix+'/general',proof,200,'Historical_general_after_group_expiry');await participant.call(prefix+'/final',final,200,'Noncognitive_committed_receipt_replay_after_expiry')
 await participant.call(basePath(group.publicId)+'/attempts/'+g2.attemptId+'/final',{accessCredential:g2.accessCredential,submissionId:randomUUID(),answers:{form:{choice:'yes'}}},403,'Unfinished_attempt_cannot_submit_after_expiry');await participant.call(prefix+'/withdraw-data',proof,200,'Completed_group_withdraw_after_expiry')
 check('Withdraw_excludes_immutable_FINAL',(await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:g.attemptId}})).status,'WITHDRAWN');check('Immutable_FINAL_retained',await db.surveyWaveFinal.count({where:{attemptId:g.attemptId}}),1)
 // Database guards are the frozen policy binding used by the narrow rate query.
 for(const [name,mutation]of [
  ['Cannot_change_published_policy',()=>db.surveyWave.update({where:{id:otherGroup.id},data:{groupIpPolicy:null}})],
  ['Cannot_extend_deadline',()=>db.surveyWave.update({where:{id:otherGroup.id},data:{closesAt:new Date(Date.parse(otherGroup.closesAt)+1),finishUntil:new Date(Date.parse(otherGroup.finishUntil)+1)}})],
  ['Cannot_reset_activation',()=>db.surveyWave.update({where:{id:otherGroup.id},data:{groupIpActivatedAt:new Date(),opensAt:new Date()}})],
  ['Cannot_replace_publication',()=>db.surveyWave.update({where:{id:otherGroup.id},data:{publicationId:ordinary.publicationId}})],
  ['Cannot_change_frozen_snapshot',()=>db.surveyPublication.update({where:{id:otherGroup.publicationId},data:{compiledSnapshot:{}}})],
 ]){await assert.rejects(mutation);check(name,true,true)}
 await transition(otherGroup,'hard-stop');await setBucket();await participant.call(basePath(otherGroup.publicId)+'/info',{entryToken:otherGroup.entrySecret},429,'Hard_stop_not_exempt');await resetBucket()
 // Linked scope remains wave-local; ordinary enter keeps its previous history semantics.
 const lp=await createProject('LINKED_WAVES'),lg=await createWave(lp),ln=await createWave(lp,false)
 const li=await participant.call(basePath(lg.publicId)+'/waves/'+lg.id+'/join',{entryToken:lg.entrySecret,consent:true,consentVersion:1}),lib={researchCode:li.researchCode,accessCredential:li.accessCredential}
 await setBucket();const scoped=await participant.call(basePath(lg.publicId)+'/enter',{...lib,waveId:lg.id});check('Linked_group_enter_exact_wave',scoped.waves.map((x)=>x.id),[lg.id]);await participant.call(basePath(lg.publicId)+'/enter',lib,429,'Unscoped_enter_no_borrow');await participant.call(basePath(lg.publicId)+'/enter',{...lib,waveId:ln.id},429,'Ordinary_enter_scope_no_borrow');await resetBucket();const all=await participant.call(basePath(lg.publicId)+'/enter',lib);check('Legacy_enter_keeps_multiwave_semantics',all.waves.length,2)
 // Acquire the Wave lock before join, then let its original48h deadline pass.
 const locked=await seedTimed(lg,2000,true);let release,held;const ready=new Promise(r=>held=r),releasePromise=new Promise(r=>release=r)
 const holding=db.$transaction(async(tx)=>{await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${locked.id} FOR UPDATE`;held();await releasePromise},{timeout:5000});await ready
 const lateJoin=participant.call(basePath(locked.publicId)+'/waves/'+locked.id+'/join',{entryToken:locked.entrySecret,consent:true,consentVersion:1},403,'Join_waiting_for_lock_rechecks_expiry')
 let sawLock=false;for(let i=0;i<50;i++){const rows=await db.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='survey_group_ip_http' AND wait_event_type='Lock'");if(rows[0].n){sawLock=true;break}await new Promise(r=>setTimeout(r,10))};check('Join_really_waited_for_lock',sawLock,true)
 await waitUntil(locked.end);release();await holding;await lateJoin;check('Late_locked_join_creates_no_attempt',await db.surveyWaveAttempt.count({where:{waveId:locked.id}}),0)
 // Group project CLOSE is immediate; ordinary sibling retains old grace semantics.
 const startedLinked=li.attemptId;const proj=await researcher.call('/api/survey/projects/'+lp.id);await researcher.call('/api/survey/projects/'+lp.id+'/close',{revision:proj.revision})
 const gc=await db.surveyWave.findUniqueOrThrow({where:{id:lg.id}}),nc=await db.surveyWave.findUniqueOrThrow({where:{id:ln.id}});assert(gc.finishUntil<=new Date());assert(nc.finishUntil>new Date());check('Project_close_no_group_grace_ordinary_preserved',true,true)
 await participant.call(basePath(lg.publicId)+'/attempts/'+startedLinked+'/final',{...lib,submissionId:randomUUID(),answers:{form:{choice:'yes'}}},403,'Project_closed_group_FINAL_denied')
 await participant.call(basePath(lg.publicId)+'/withdraw-linked',lib,200,'Linked_privacy_withdraw_after_close')
 // Cognitive child and parent use the same group deadline and original exact-session proof.
 const cp=await createProject(),ct=await createDraft(owner.id,cp.id,{requestId:randomUUID(),kind:'COGNITIVE',instrumentKey:'go',title:'Synthetic Go NoGo'})
 await updateDraft(owner.id,cp.id,ct.id,{revision:ct.revision,title:ct.title,definition:initialCognitiveDefinition()})
 const cw=await createWave(cp,true,{instrumentIds:[cp.tool,ct.id]}),ca=await start(cw),cap=basePath(cw.publicId)+'/attempts/'+ca.attemptId,cab={accessCredential:ca.accessCredential},provenance={schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}
 await setBucket();const cs=await participant.call(cap+'/cognitive/go/start',{...cab,priorAnswers:{form:{choice:'yes'}},administrationProvenance:provenance})
 await participant.call(cap+'/cognitive/go/'+cs.sessionId+'/read',cab)
 await participant.call(cap+'/cognitive/go/'+randomUUID()+'/read',cab,429,'Wrong_cognitive_session_not_exempt')
 await resetBucket();const cognitiveEnd=new Date(Date.now()+70);await db.surveyWave.update({where:{id:cw.id},data:{closesAt:cognitiveEnd,finishUntil:cognitiveEnd}});await waitUntil(cognitiveEnd)
 await participant.call(cap+'/cognitive/go/'+cs.sessionId+'/restart',{...cab,attemptEpoch:cs.attemptEpoch},403,'Cognitive_restart_after_deadline_denied')
 const {gonogoSequence}=req(dist+'/modules/cognitive/randomization.js'),{createTrialEnvelope}=req(dist+'/modules/cognitive/v2/trial-envelope.js')
 const trials=gonogoSequence(cs.randomSeed,120,.25).map((trialType,index)=>createTrialEnvelope({trialIndex:index,phase:'test',startedAtPerfMs:index*1300,endedAtPerfMs:index*1300+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?320:null,interrupted:false}}))
 await participant.call(cap+'/cognitive/go/'+cs.sessionId+'/final',{...cab,attemptEpoch:cs.attemptEpoch,submissionId:randomUUID(),definitionHash:cs.definitionHash,trials,administrationProvenance:provenance},403,'Cognitive_child_FINAL_after_same_deadline_denied')
 await participant.call(cap+'/final',{...cab,submissionId:randomUUID(),answers:{form:{choice:'yes'}}},403,'Cognitive_parent_FINAL_after_same_deadline_denied')
 check('Expired_cognitive_creates_no_result',await db.surveyCognitiveResult.count({where:{attemptId:ca.attemptId}}),0)
 await adminContract();await recoveryFixture(cp,ct);guards.check();check('Zero_unexpected_runtime_ORM_errors',ormErrors,0);evidence.maxObservedHttpConcurrency=maxActive;evidence.status='pass';save()
}

async function initialize(){
 const [version]=await db.$queryRawUnsafe("SELECT current_setting('server_version_num') AS version");
 check('Actual_PostgreSQL_16_15',version.version,'160015');binding.postgres=version.version;
 const role=await import('/app/scripts/runtime-role-contract.mjs');
 evidence.runtimeRole=await role.verifyConfiguredRuntime({current:true});
 check('Restricted_runtime_principal',evidence.runtimeRole.restrictedRuntimeRole,true);
 await redis.connect();const info=await redis.info('server');const versionMatch=/^redis_version:(7\.4\.\d+)\r?$/m.exec(info);assert(versionMatch,'Actual Redis 7.4.x required');binding.redis=versionMatch[1];
 await cacheService.initialize();check('Production_Redis_connected',cacheService.getStatus().connected,true);
 await new Promise(r=>server.listen(53019,'127.0.0.1',r));
}
class AdminClient{
 constructor(name,token){this.name=name;this.cookies=new Map(token?[['ptool_session',token]]:[])}
 async call(path,body,expected=200,label=path){
  guards.check();const csrf=this.cookies.get('ptool_csrf'),method=body===undefined?'GET':'POST';
  const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,'x-forwarded-for':ip,cookie:[...this.cookies].map(([k,v])=>k+'='+v).join(';'),...(csrf?{'x-csrf-token':decodeURIComponent(csrf)}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([guards.signal,AbortSignal.timeout(10000)])});
  for(const c of r.headers.getSetCookie()){const p=c.split(';')[0],i=p.indexOf('=');this.cookies.set(p.slice(0,i),p.slice(i+1))}
  const raw=await r.text(),data=JSON.parse(raw);evidence.requests.push({role:this.name,label,method,status:r.status,retryAfter:r.headers.get('retry-after')});save();assert.equal(r.status,expected,label+': '+raw);return data.data;
 }
}
async function adminContract(){
 const pw='Synthetic!'+randomBytes(18).toString('hex'),hash=await hashPassword(pw);
 async function seed(name,platformRole='SYSTEM_ADMIN'){
  const u=await db.user.create({data:{username:'ci_admin_'+name+'_'+randomUUID(),passwordHash:hash,role:'ADMIN',accountDomain:'LEGACY',platformRole}});
  const client=new AdminClient(name,generateToken({userId:u.id,username:u.username,role:'ADMIN',accountDomain:'LEGACY',tokenVersion:u.tokenVersion}));await client.call('/api/auth/csrf');return {u,client};
 }
 const a=await seed('a'),b=await seed('b'),non=await seed('non','STANDARD'),key=id=>'auth:survey:admin-password:'+sha(id),p='/api/platform/survey';
 for(let i=0;i<16;i++)await a.client.call(p+'/researcher-invitations',{currentPassword:pw},200,'correct_sensitive_write_'+(i+1));
 check('More_than_15_successful_sensitive_writes_unlimited',(await cacheService.getRateLimitState(key(a.u.id))).count,0);
 const events=await db.surveyEvent.count({where:{actorUserId:a.u.id}});
 for(let i=0;i<15;i++)await a.client.call(p+'/researcher-invitations',{currentPassword:'wrong'},403,'wrong_password_'+(i+1));
 check('Wrong_password_15_per_900',await redis.get(key(a.u.id)),'15');
 const ttl=await redis.ttl(key(a.u.id));assert(ttl>0&&ttl<=900);check('Wrong_password_fixed_900_second_window',true,true);
 await a.client.call(p+'/researcher-invitations',{currentPassword:pw},429,'wrong_password_budget_blocks_16th');
 const retry=Number(evidence.requests.at(-1).retryAfter);assert(retry>0&&retry<=900);
 check('Rejected_password_writes_have_no_audit_side_effect',await db.surveyEvent.count({where:{actorUserId:a.u.id}}),events);
 for(const path of ['/researchers','/researcher-invitations','/source-catalog?kind=FORM&page=1','/researchers/'+owner.id+'/tool-grants'])await a.client.call(p+path,undefined,200,'GET_unlimited_while_password_budget_full');
 check('GET_does_not_increment_password_budget',await redis.get(key(a.u.id)),'15');
 await b.client.call(p+'/researcher-invitations',{currentPassword:pw},200,'other_admin_same_IP_unaffected');
 await non.client.call(p+'/researchers',undefined,403,'non_admin_GET_rejected');await non.client.call(p+'/researcher-invitations',{currentPassword:pw},403,'non_admin_write_rejected');
 check('Non_admin_creates_no_password_bucket',await redis.exists(key(non.u.id)),0);
 await new AdminClient('anonymous').call(p+'/researchers',undefined,401,'anonymous_rejected');
 // A real catalog grant supplies the new table's restored snapshot/audit fixture.
 const form=await db.questionnaire.create({data:{code:'ci_source_'+randomUUID(),name:'Synthetic recovery form',status:'PUBLISHED',creatorId:b.u.id}});
 const section=await db.questionnaireFormSection.create({data:{questionnaireId:form.id,title:'Synthetic',position:0,contextSection:false}});
 await db.questionnaireFormItem.create({data:{questionnaireId:form.id,sectionId:section.id,type:'single_choice',label:'Synthetic category',required:true,position:0,sectionPosition:0,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}});
 const catalog=await b.client.call(p+'/source-catalog?kind=FORM&page=1');const source=catalog.list.find(x=>x.available&&x.ref.sourceId==='questionnaire:'+section.id);assert(source,'Fixture form visible in real catalog');
 const grant=await b.client.call(p+'/researchers/'+owner.id+'/tool-grants',{currentPassword:pw,source:source.ref});evidence.recoveryGrantId=grant.id;
 // Invoke the unchanged production middleware, with its real Redis store. No limiter replacement.
 const {passwordChangeRateLimit}=req(dist+'/middleware/passwordChangeAdmission.js'),{createMfaAttemptRateLimiter}=req(dist+'/middleware/mfaAttemptRateLimit.js'),login=req(dist+'/middleware/loginRateLimit.js');
 async function invoke(fn,r){let status=200,next=false;const s={setHeader(){return s},status(n){status=n;return s},json(){return s}};await fn(r,s,()=>{next=true});return {status,next}}
 const shim={user:{userId:randomUUID(),accountDomain:'SURVEY'},ip:'198.18.0.9',socket:{remoteAddress:'198.18.0.9'},body:{username:'ci_'+randomUUID()},originalUrl:'/api/survey/auth/login'};
 let value;for(let i=0;i<11;i++)value=await invoke(passwordChangeRateLimit,shim);check('Independent_password_change_11th_429',value.status,429);
 const mfa=createMfaAttemptRateLimiter({realm:'SURVEY',ipName:'survey-mfa-challenge',pendingCookieName:'huisurvey_mfa_pending'});for(let i=0;i<21;i++)value=await invoke(mfa,shim);check('Independent_MFA_21st_429',value.status,429);
 check('Independent_login_initial_admission',await invoke(login.loginRateLimit,shim),{status:200,next:true});for(let i=0;i<10;i++)await login.recordLoginFailure(shim);check('Independent_login_after_10_failures_429',(await invoke(login.loginRateLimit,shim)).status,429);
}
async function recoveryFixture(cp,ct){
 const wave=await createWave(cp,true,{instrumentIds:[cp.tool,ct.id]}),attempt=await start(wave),prefix=basePath(wave.publicId)+'/attempts/'+attempt.attemptId,proof={accessCredential:attempt.accessCredential};
 const provenance={schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'};
 const session=await participant.call(prefix+'/cognitive/go/start',{...proof,priorAnswers:{form:{choice:'yes'}},administrationProvenance:provenance});
 const {gonogoSequence}=req(dist+'/modules/cognitive/randomization.js'),{createTrialEnvelope}=req(dist+'/modules/cognitive/v2/trial-envelope.js');
 const trials=gonogoSequence(session.randomSeed,120,.25).map((trialType,index)=>createTrialEnvelope({trialIndex:index,phase:'test',startedAtPerfMs:index*1300,endedAtPerfMs:index*1300+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?320:null,interrupted:false}}));
 const child=await participant.call(prefix+'/cognitive/go/'+session.sessionId+'/final',{...proof,attemptEpoch:session.attemptEpoch,submissionId:randomUUID(),definitionHash:session.definitionHash,trials,administrationProvenance:provenance});
 const parent=await participant.call(prefix+'/final',{...proof,submissionId:randomUUID(),answers:{form:{choice:'yes'},go:{}},cognitiveReferences:[child.resultReference]});
 check('Recovery_fixture_parent_FINAL_persisted',parent.status,'COMPLETED');
 const ticket=await researcher.call('/api/survey/projects/'+cp.id+'/exports',{format:'COGNITIVE_TRIAL_LONG',waveId:wave.id});
 const artifact=await researcher.call('/api/survey/projects/'+cp.id+'/exports/'+ticket.id+'/download');
 check('Recovery_fixture_export_120_real_trials',artifact.manifest.rowCount,120);
 const result=await db.surveyCognitiveResult.findUniqueOrThrow({where:{id:child.resultReference.resultId}});
 writeFileSync(out+'/runtime-fixture.json',JSON.stringify({sourceSha:binding.sourceSha,distSha256:binding.distSha256,ownerId:owner.id,projectId:cp.id,waveId:wave.id,attemptId:attempt.attemptId,sessionId:session.sessionId,resultId:result.id,grantId:evidence.recoveryGrantId,exportId:ticket.id,artifactHash:canonicalHash(artifact),csvSha256:sha(artifact.csv),rawCipherSha256:sha(result.rawCipher),resultCipherSha256:sha(result.resultCipher),resultReference:child.resultReference},null,2));
}
async function verifyRestored(){
 const f=JSON.parse(readFileSync(out+'/runtime-fixture.json','utf8'));assert.equal(f.sourceSha,binding.sourceSha);assert.equal(f.distSha256,binding.distSha256);
 owner=await db.user.findUniqueOrThrow({where:{id:f.ownerId}});researcher=new Client('restored-researcher',generateToken({userId:owner.id,username:owner.username,role:owner.role,accountDomain:'SURVEY',tokenVersion:owner.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)}));
 const result=await prisma.surveyCognitiveResult.findUniqueOrThrow({where:{id:f.resultId}});
 check('Restored_raw_cipher_fingerprint',sha(result.rawCipher),f.rawCipherSha256);check('Restored_result_cipher_fingerprint',sha(result.resultCipher),f.resultCipherSha256);
 const {decryptUnifiedRuntimePayload}=req(dist+'/modules/assessment-runtime/security.js');
 check('Restored_raw_decrypts_120_trials',decryptUnifiedRuntimePayload(result.rawCipher).trials.length,120);
 const artifact=await researcher.call('/api/survey/projects/'+f.projectId+'/exports/'+f.exportId+'/download');
 check('Restored_encrypted_export_decrypts_identically',canonicalHash(artifact),f.artifactHash);
 const fresh=await researcher.call('/api/survey/projects/'+f.projectId+'/exports',{format:'COGNITIVE_TRIAL_LONG',waveId:f.waveId});
 const freshArtifact=await researcher.call('/api/survey/projects/'+f.projectId+'/exports/'+fresh.id+'/download');
 check('Restored_eligible_parent_child_new_export_120_trials',freshArtifact.manifest.rowCount,120);check('Restored_fresh_export_same_CSV',sha(freshArtifact.csv),f.csvSha256);
 const grants=await prisma.$queryRaw`SELECT snapshot,snapshot_digest FROM survey_tool_grants WHERE id=${f.grantId}`;assert.equal(grants.length,1);check('Restored_grant_snapshot_digest',canonicalHash(grants[0].snapshot),grants[0].snapshot_digest);
 // Representative fresh persistence through the restored restricted role.
 const p=await researcher.call('/api/survey/projects',{requestId:randomUUID(),title:'Synthetic restored write',collectionMode:'SINGLE_UNLINKED'});check('Restored_runtime_can_persist_project',(await prisma.surveyProject.findUniqueOrThrow({where:{id:p.id}})).ownerUserId,owner.id);
 evidence.status='pass';save();
}
main().catch(e=>{evidence.status='failed';evidence.error={name:e.name,message:e.message};save();console.error(e);process.exitCode=1}).finally(async()=>{
 clearInterval(monitor);guards.close();server.closeAllConnections();await new Promise(r=>server.close(()=>r()));
 await prisma.$disconnect();await db.$disconnect();await cacheService.close();if(redis.isOpen)await redis.quit();evidence.serverStopped=true;save();
 console.log(JSON.stringify({status:evidence.status,requests:evidence.requests.length,checks:evidence.checks.length,serverStopped:true}));
});
