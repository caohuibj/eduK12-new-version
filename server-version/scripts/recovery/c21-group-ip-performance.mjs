import {publicRoute} from './c21-error-redaction.mjs'
/** Production-dist middleware over real loopback HTTP + PostgreSQL.
 * Terminal handler intentionally does no business SQL. Measures policy overhead,
 * not whole-application capacity, business latency or resource benefit.
 */
import assert from 'node:assert/strict'
import {harness,prisma,require,backend,sha,pause} from './c21-group-ip-client.mjs'
import path from 'node:path'
const {publicAssessmentRateLimiters}=require(path.join(backend,'dist/middleware/publicAssessmentRateLimit.js'))
const {createTrainingGroupIpResolver}=require(path.join(backend,'dist/middleware/trainingPublicGroupRate.js'))
const {BoundedAdmissionGate}=require(path.join(backend,'dist/services/boundedAdmissionGate.js'))
const {cacheService}=require(path.join(backend,'dist/services/cacheService.js'))
const express=require('express'),{Client}=require('pg'),h=harness('performance');let error,server,locker,observer,monitor,cacheOpened=false
let queries=[];prisma.$on('query',e=>queries.push({sha256:sha(e.query),durationMs:e.duration,policy:e.query.includes('training_public_rounds')}))
try{
 assert.equal(process.env.PUBLIC_ASSESSMENT_IP_GET_LIMIT,'1');assert.equal(process.env.PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT,'10000');assert.equal(process.env.PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT,'10000')
 const f=h.read('c21-fixture-private.json'),app=express();app.set('trust proxy','loopback');app.use(express.json())
 const gate=new BoundedAdmissionGate({name:'c21_real_sql_probe',maxConcurrent:4,maxQueue:8,maxWaitMs:250,retryAfterSeconds:1})
 app.use('/gate',(req,res,next)=>{req.url=req.url;next()})
 // Separate mounted router rewrites baseUrl only for the isolated gate probe;
 // SQL lookup and gating remain the unchanged production implementation.
 app.use('/gate',async(req,res,next)=>{req.baseUrl='/api';await createTrainingGroupIpResolver({gate})(req,res,next)},(_req,res)=>res.json({passed:true}))
 const timeoutGate=new BoundedAdmissionGate({name:'c21_real_sql_timeout_probe',maxConcurrent:4,maxQueue:8,maxWaitMs:250,retryAfterSeconds:1})
 app.use('/deadline',async(req,res,next)=>{req.baseUrl='/api';await createTrainingGroupIpResolver({gate:timeoutGate,responseTimeoutMs:40})(req,res,next)},(_req,res)=>res.json({passed:true}))
 app.use('/api',...publicAssessmentRateLimiters,(_req,res)=>res.json({passed:true}))
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const base=`http://127.0.0.1:${server.address().port}`
 async function probe(route,ip,expected=200,recovery,method='GET'){const from=queries.length,start=performance.now(),r=await fetch(base+route,{method,headers:{'x-forwarded-for':ip,...(recovery?{'x-recovery-token':recovery}:{})},signal:AbortSignal.timeout(8000)});const bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,expected,publicRoute(route));return {status:r.status,responseBytes:bytes.length,responseSha256:sha(bytes),ms:performance.now()-start,queries:queries.slice(from)}}
 const active='/api/public/composite-assessments/'+f.tokens.active.token,plain='/api/public/composite-assessments/'+f.tokens.plain.token
 const baseline=await probe(plain,'192.0.2.1');assert.equal(baseline.queries.length,0)
 const plainOver=await probe(plain+'?roundId='+f.tokens.active.roundId,'192.0.2.1',429);assert.equal(plainOver.queries.filter(q=>q.policy).length,1)
 const ordinary=await probe(active,'192.0.2.2');assert.equal(ordinary.queries.length,0)
 const samples=[];for(let i=0;i<125;i++){const r=await probe(active,'192.0.2.2');assert.equal(r.queries.filter(q=>q.policy).length,1);samples.push(r)}
 const recoveryRoute='/api/public/composite-assessments/attempts/'+f.recovery.attemptId
 const recoveryOrdinary=await probe(recoveryRoute,'192.0.2.3',200,f.recovery.token);assert.equal(recoveryOrdinary.queries.length,0)
 const recoveryOver=await probe(recoveryRoute,'192.0.2.3',200,f.recovery.token);assert.equal(recoveryOver.queries.filter(q=>q.policy).length,1)
 assert.equal((await probe(recoveryRoute,'192.0.2.3',429,'A'.repeat(43))).queries.filter(q=>q.policy).length,1)
 const revoked='/api/public/composite-assessments/'+f.tokens.revoked.token
 await probe(revoked,'192.0.2.4');assert.equal((await probe(revoked,'192.0.2.4',429)).queries.filter(q=>q.policy).length,1)
 const expired='/api/public/composite-assessments/'+f.tokens.expiring.token
 await probe(expired,'192.0.2.5');assert.equal((await probe(expired,'192.0.2.5',429)).queries.filter(q=>q.policy).length,1)
 const negative='/api/public/composite-assessments/'+'Z'.repeat(32);await probe(negative,'192.0.2.6')
 const storm=[];for(let i=0;i<125;i++)storm.push(await probe(negative,'192.0.2.6',429))
 assert.equal(storm.reduce((n,r)=>n+r.queries.filter(q=>q.policy).length,0),120)
 for(const r of storm.slice(120))assert.equal(r.queries.length,0)
 const finalSamples=[]
 for(const [route,ip,credential] of [[active+'/start','192.0.2.20',undefined],[recoveryRoute+'/whole/submit','192.0.2.21',f.recovery.token]]){
  const first=await probe(route,ip,200,credential,'POST');assert.equal(first.queries.length,0);finalSamples.push(first)
  for(let i=0;i<5;i++){const sample=await probe(route,ip,200,credential,'POST');assert.equal(sample.queries.filter(q=>q.policy).length,1);finalSamples.push(sample)}
 }
 const invalidFinal=await probe(recoveryRoute+'/whole/submit','192.0.2.21',429,'B'.repeat(43),'POST');assert.equal(invalidFinal.queries.filter(q=>q.policy).length,1)
 h.result.finalPostProbe={scope:'ISOLATED_TERMINAL_NO_BUSINESS_FINAL_SUBMISSION',samples:finalSamples,invalid:invalidFinal,coarseLimit:1,validOverCoarse:10}
 h.check('Actual POST start and recovery FINAL middleware have zero-SQL ordinary paths, continue over independent coarse FINAL budget, and reject wrong recovery')
 h.check('Ordinary traffic zero SQL; only coarse rejection reads DB; plain/hint/revoked/expired reject; valid125 lookups do not consume negative120 budget; recovery authenticates live')
 locker=new Client({connectionString:process.env.DATABASE_URL});observer=new Client({connectionString:process.env.DATABASE_URL});await locker.connect();await observer.connect()
 const pid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await locker.query('BEGIN');await locker.query('LOCK TABLE training_public_rounds IN ACCESS EXCLUSIVE MODE')
 const start=performance.now(),gateStart=queries.length,pending=Array.from({length:20},(_,i)=>fetch(base+'/gate/public/composite-assessments/'+f.tokens.active.token,{headers:{'x-forwarded-for':`198.51.100.${i+1}`},signal:AbortSignal.timeout(8000)}).then(async r=>{await r.text();return r.status}))
 let blocking=[],stats;const deadline=performance.now()+220
 while(performance.now()<deadline){stats=gate.getStats();blocking=(await observer.query('SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))',[pid])).rows;if(blocking.length===4&&stats.queued===8)break;await pause(5)}
 h.result.gateObserved={active:stats.active,queued:stats.queued,blocking,observationMs:performance.now()-start}
 assert.equal(blocking.length,4,'four actual SQL operations must be seen blocked before release');assert.equal(stats.active,4);assert.equal(stats.queued,8)
 await locker.query('ROLLBACK');const statuses=await Promise.all(pending);assert.equal(statuses.filter(s=>s===200).length,12);assert.equal(statuses.filter(s=>s===503).length,8);assert.equal(queries.slice(gateStart).filter(q=>q.policy).length,12)
 assert.equal(gate.getStats().active,0);assert.equal(gate.getStats().queued,0)
 // A response deadline must not free a still-live SQL slot.
 await locker.query('BEGIN');await locker.query('LOCK TABLE training_public_rounds IN ACCESS EXCLUSIVE MODE')
 const timed=fetch(base+'/deadline/public/composite-assessments/'+f.tokens.active.token,{headers:{'x-forwarded-for':'198.51.100.90'},signal:AbortSignal.timeout(8000)})
 const timeoutDeadline=Date.now()+2000;let live=[]
 while(Date.now()<timeoutDeadline){live=(await observer.query('SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))',[pid])).rows;if(live.length===1)break;await pause(5)}
 assert.equal(live.length,1);const timedResponse=await timed;await timedResponse.text();assert.equal(timedResponse.status,503);assert.equal(timeoutGate.getStats().active,1)
 h.result.liveSqlAfterResponseDeadline={status:503,active:timeoutGate.getStats().active,blocking:live}
 await locker.query('ROLLBACK');while(timeoutGate.getStats().active&&Date.now()<timeoutDeadline)await pause(5);assert.equal(timeoutGate.getStats().active,0)
 // Execute the production Redis failure-budget branch in this isolated process.
 // MONITOR accounts exact synthetic keys, not process-wide commandstats noise.
 const IORedis=require('ioredis'),redisObserver=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:1,retryStrategy:()=>null})
 monitor=await redisObserver.monitor();redisObserver.disconnect();const commands=[]
 monitor.on('monitor',(at,args,source,database)=>commands.push({at,args,source,database}))
 await cacheService.initialize();cacheOpened=true;assert.equal((await cacheService.getStats()).connected,true)
 const redisIp='203.0.113.71',negativeKey='ratelimit:training-group-ip-negative:'+sha(redisIp),oldEnv=process.env.NODE_ENV
 const exactCommands=(from,to)=>commands.slice(from,to).filter(c=>c.args.includes(negativeKey)).map(c=>({command:c.args[0].toLowerCase(),source:c.source}))
 try{
  process.env.NODE_ENV='production'
  const validStart=commands.length,sqlStart=queries.length
  for(let i=0;i<125;i++)await probe('/gate/public/composite-assessments/'+f.tokens.active.token,redisIp)
  await pause(20);const validEnd=commands.length,validCommands=exactCommands(validStart,validEnd)
  assert.equal(queries.slice(sqlStart).filter(q=>q.policy).length,125)
  assert.equal(validCommands.filter(c=>c.command==='get').length,125);assert.equal(validCommands.filter(c=>c.command==='ttl').length,125);assert.equal(validCommands.filter(c=>['eval','incr','expire'].includes(c.command)).length,0)
  assert.equal((await cacheService.getRateLimitState(negativeKey)).count,0)
  await pause(20);const invalidStart=commands.length,negativeSqlStart=queries.length
  for(let i=0;i<125;i++)await probe('/gate/public/composite-assessments/'+'Y'.repeat(32),redisIp,429)
  await pause(20);const invalidEnd=commands.length,invalidCommands=exactCommands(invalidStart,invalidEnd)
  assert.equal(queries.slice(negativeSqlStart).filter(q=>q.policy).length,120)
  assert.equal(invalidCommands.filter(c=>c.command==='get').length,125);assert.equal(invalidCommands.filter(c=>c.command==='eval').length,120);assert.equal(invalidCommands.filter(c=>c.command==='incr').length,120);assert.equal(invalidCommands.filter(c=>c.command==='expire').length,1);assert.equal(invalidCommands.filter(c=>c.command==='ttl').length,245)
  assert.equal((await cacheService.getRateLimitState(negativeKey)).count,120)
  await cacheService.close();cacheOpened=false;const disconnected=await probe('/gate/public/composite-assessments/'+f.tokens.active.token,'203.0.113.72',503);assert.equal(disconnected.queries.length,0)
  h.result.redisProductionBranch={scope:'EXACT_SYNTHETIC_KEY_MONITOR_WITH_REAL_REDIS_NO_PRODUCTION_APP_START',successful:125,successfulSql:125,validCommands,negativeRequests:125,negativeSql:120,invalidCommands,counter:120,disconnectedStatus:503,disconnectedSql:0}
 }finally{process.env.NODE_ENV=oldEnv}
 h.check('Real Redis production branch: successful125 checks GET+TTL only;120 negatives increment shared counter; excess negatives zero SQL; disconnected cache fails closed before SQL')
 const sorted=samples.map(r=>r.ms).sort((a,b)=>a-b)
 h.result.measurements={scope:'ISOLATED_POLICY_OVERHEAD_NOT_CAPACITY_OR_RESOURCE_BENEFIT',baseline,ordinary,plainOver,recoveryOrdinary,recoveryOver,validSamples:samples,validLookups:samples.length,validSql:samples.reduce((n,r)=>n+r.queries.length,0),validP50Ms:sorted[Math.floor(sorted.length*.5)],validP95Ms:sorted[Math.floor(sorted.length*.95)],negativeResponses:storm.length,negativeSql:120,gateStatuses:statuses}
 h.result.sqlEvents=queries;h.check('Actual PostgreSQL lock barrier observes four live SQL + eight queued, rejects overflow and drains without exceeding bounds');h.result.passed=true
}catch(e){error=e;throw e}finally{if(monitor)monitor.disconnect();if(cacheOpened)await cacheService.close();if(locker){await locker.query('ROLLBACK').catch(()=>{});await locker.end()}if(observer)await observer.end();if(server)await new Promise(r=>server.close(r));await h.finish(error)}
