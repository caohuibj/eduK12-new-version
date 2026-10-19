/** C25-only HTTP evidence. Importing pure contracts never loads production/DB code. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {publicFailure,publicRoute,publicPostgresFailure} from './c21-error-redaction.mjs'
export {publicFailure,publicRoute,publicPostgresFailure}
export const prefix='/composite-assessments', pub='/public/composite-assessments', products='/questionnaire-products'
export const sha=value=>createHash('sha256').update(value).digest('hex')
export const runtime=()=>import('./c20-materials-client.mjs')
export const policy=local=>({schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:local?{enabled:true,ttlHours:1}:null})
export const receiptRoute=(base,id,submissionId,epoch)=>`${base}/attempts/${id}/whole/receipt?submissionId=${encodeURIComponent(submissionId)}&attemptEpoch=${epoch}`
export function persistenceMetadata(row){
 const s=row.trainingPersistenceSnapshot;assert.ok(s)
 return {snapshotHash:row.trainingPersistenceSnapshotHash,attemptId:row.id,attemptEpoch:row.attemptEpoch,courseId:row.deliveryCourseId,checkpoint:s.policy.checkpoint,localCognitive:s.policy.localCognitive}
}
export function assertWithheld(value){
 const forbidden=new Set(['score','scores','totalScore','dimensionScores','metrics','quality','qualityState','qualityFlags','result','report','reportBody','unitReports','canonicalResult','backgroundValues'])
 function visit(node){if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node)){if(forbidden.has(key))assert.ok(child==null,`closed feedback contains ${key}`);else if(!['instrument','config','profile','definition'].includes(key))visit(child)}}
 visit(value)
}
export function assertWindow({t0,releaseAt,submittedAt,closedStartedAt,closedFinishedAt,requests=[],observedOpenAt}){
 const start=Date.parse(t0),release=Date.parse(releaseAt)
 assert.ok(Number.isFinite(start));assert.equal(release-start,300000,'releaseAt must be immutable T0 + 300 seconds')
 if(submittedAt)assert.ok(Date.parse(submittedAt)-start<=180000,'submission/checkpoint/shared-drain exceeded 180 seconds')
 if(closedStartedAt&&closedFinishedAt){assert.ok(Date.parse(closedFinishedAt)-Date.parse(closedStartedAt)<=60000,'closed matrix exceeded 60 seconds');assert.ok(Date.parse(closedFinishedAt)<start+240000,'closed matrix missed T0 + 240 seconds')}
 for(const r of requests){assert.ok(Date.parse(r.receivedAt)<start+240000,'closed response arrived outside window');if(r.serverDate)assert.ok(Date.parse(r.serverDate)<start+240000,'closed server date outside window');if(r.serverNow)assert.ok(Date.parse(r.serverNow)<start+240000,'closed serverNow outside window')}
 if(observedOpenAt){assert.ok(Date.parse(observedOpenAt)>=release,'opening requires actual server clock boundary');assert.ok(Date.parse(observedOpenAt)<=release+30000,'natural boundary observation exceeded 30 seconds')}
}
const stableCheckpoint=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['payloadEncrypted','payloadHash','expiresAt','revision','updatedAt'].includes(key)))
export function assertTerminalBatch({baseline,before,after,expectedTypes,whole=false}){
 assert.equal(before.cases.length,after.cases.length);assert.ok(before.cases.length>0)
 assert.deepEqual(before.queue,{...baseline.queue,pending:baseline.queue.pending+before.cases.length})
 assert.deepEqual(after.queue,baseline.queue);assert.deepEqual(before.otherJobs,baseline.otherJobs);assert.deepEqual(after.otherJobs,baseline.otherJobs)
 for(const b of before.cases){
  const a=after.cases.find(x=>x.parent.id===b.parent.id);assert.ok(a)
  assert.equal(b.parent.status,'IN_PROGRESS');assert.equal(b.job.status,'PENDING');assert.equal(b.job.attemptCount,0);assert.equal(b.job.budgetHeld,true)
  assert.equal(a.parent.status,'COMPLETED');assert.ok(a.parent.completedAt);assert.equal(a.job.id,b.job.id);assert.equal(a.job.status,'READY');assert.equal(a.job.attemptCount,1);assert.equal(a.job.budgetHeld,false)
  for(const fact of [a,b]){assert.equal(fact.job.attemptId,fact.parent.id);assert.equal(fact.job.attemptEpoch,fact.parent.attemptEpoch);assert.equal(fact.parent.asyncReportEpoch,fact.parent.attemptEpoch);assert.equal(fact.checkpoint.attemptId,fact.parent.id)}
  assert.deepEqual(a.snapshots.map(s=>s.unitType).sort(),[...expectedTypes].sort());assert.equal(new Set(a.snapshots.map(s=>s.slotKey)).size,expectedTypes.length)
  for(const s of a.snapshots){assert.equal(s.compositeAttemptId,a.parent.id);assert.equal(s.attemptEpoch,a.parent.attemptEpoch);assert.equal(s.terminalState,'COMPLETED')}
  if(whole)assert.equal(b.snapshots.length,0,'whole ACK precedes actual materialization');else assert.deepEqual(a.snapshots,b.snapshots,'accepted four-type facts must survive drain byte-for-byte')
  assert.ok(b.checkpoint.payloadEncrypted&&b.checkpoint.payloadHash&&b.checkpoint.expiresAt)
  for(const key of ['payloadEncrypted','payloadHash','expiresAt'])assert.equal(a.checkpoint[key],null)
  assert.equal(a.checkpoint.revision,b.checkpoint.revision+(whole?expectedTypes.length:0)+1);assert.deepEqual(stableCheckpoint(a.checkpoint),stableCheckpoint(b.checkpoint))
 }
}
export async function pgNow(){const {prisma}=await runtime();const [row]=await prisma.$queryRawUnsafe('SELECT clock_timestamp() AS now');return new Date(row.now).toISOString()}
export async function reportBaseline(){const {prisma}=await runtime();return {queue:await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),otherJobs:await prisma.compositeReportJob.findMany({orderBy:{id:'asc'}})}}
export async function terminalFacts(ids){
 const {prisma}=await runtime();return {cases:await Promise.all(ids.map(async id=>({parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}}),job:await prisma.compositeReportJob.findFirstOrThrow({where:{attemptId:id}}),checkpoint:await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:id}}),snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:id},orderBy:{slotKey:'asc'}})}))),queue:await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),otherJobs:await prisma.compositeReportJob.findMany({where:{attemptId:{notIn:ids}},orderBy:{id:'asc'}})}
}
export async function acceptedFacts(id){
 const {prisma,children}=await runtime(),c=await children(id)
 const ids=rows=>rows.map(r=>r.id)
 return {...c,scaleFacts:await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:ids(c.scales)}},orderBy:{assessmentId:'asc'}}),cognitiveRaw:await prisma.cognitiveRawSubmission.findMany({where:{sessionId:{in:ids(c.cognitive)}},orderBy:{id:'asc'}}),situationalRaw:await prisma.situationalRawSubmission.findMany({where:{attemptId:{in:ids(c.sjt)}},orderBy:{id:'asc'}}),formAnswers:await prisma.compositeFormAnswer.findMany({where:{attemptId:id},orderBy:{id:'asc'}})}
}
export async function harness(phase,budgetSeconds){
 process.umask(0o077)
 const api=await runtime(),{prisma,require,backend,normalizeProduct,closeQueues}=api
 const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),started=performance.now()
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test');assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime')
 for(const [key,value] of Object.entries({BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',ASSESSMENT_WHOLE_SUBMIT_ENABLED:'true',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false'}))assert.equal(process.env[key],value,key)
 const result={schemaVersion:1,passed:false,phase,checks:[],requests:[],measurements:[],qualification:{browser:false,capacity:false,scope:'NEW_SYNTHETIC_C25_ONLY',sql:'API_PROCESS_WIDE_WINDOW_NOT_PER_REQUEST_ATTRIBUTION'}}
 const write=(name,value)=>{assert.ok(/^c25-[a-z0-9-]+\.(json|jsonl)$/.test(name),'C25 output prefix required');fs.writeFileSync(path.join(state,name),JSON.stringify(value,null,2),{mode:0o600});fs.chmodSync(path.join(state,name),0o600)}
 const read=name=>JSON.parse(fs.readFileSync(path.join(state,name)))
 const journal=path.join(state,`c25-${phase}-http-private.jsonl`);assert.ok(!fs.existsSync(journal),'Prior C25 phase journal exists; explicit continuation required')
 const record=value=>fs.appendFileSync(journal,JSON.stringify(value)+'\n',{mode:0o600})
 const moduleClosure=()=>Object.keys(require.cache).sort().filter(file=>fs.existsSync(file)).map(file=>({path:path.relative(backend,file),sha256:sha(fs.readFileSync(file))}))
 const initialModules=moduleClosure();let operation=0
 const remaining=()=>{const ms=budgetSeconds*1000-(performance.now()-started);assert.ok(ms>0,'C25 phase budget exhausted');return ms}
 write(`c25-${phase}-result.json`,result)
 const check=label=>{result.checks.push(label);console.log('PASS',label)}
 async function sqlCount(){remaining();const response=await fetch(status.apiUrl+'/metrics',{signal:AbortSignal.timeout(Math.ceil(Math.min(8000,remaining())))});assert.equal(response.status,200,'metrics endpoint unavailable');const match=(await response.text()).match(/^ptool_prisma_sql_events_total (\d+)$/m);assert.ok(match,'SQL counter absent');return Number(match[1])}
 function client(){const cookies=new Map();return {recovery:null,lastStatus:null,async request(route,method='GET',body,expected=200,raw=false){
  assert.ok(route.startsWith('/')&&!route.startsWith('/api/'),'transport supplies /api exactly once')
  const before=await sqlCount(),start=performance.now(),multipart=body instanceof FormData,op=++operation,issuedAt=new Date().toISOString()
  record({op,stage:'ISSUED',route,method,body:route.startsWith('/auth/')?'AUTH_REDACTED':multipart?'MULTIPART':body,at:issuedAt})
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(Math.ceil(Math.min(30000,remaining()))),headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const bytes=Buffer.from(await response.arrayBuffer()),receivedAt=new Date().toISOString(),safe=publicRoute(route)
  record({op,stage:'RECEIVED',status:response.status,responseSha256:sha(bytes),response:route.startsWith('/auth/')?'AUTH_REDACTED':raw?'BINARY':bytes.toString(),at:receivedAt})
  this.lastStatus=response.status
  const measurement={route:safe,method,status:response.status,bytes:bytes.length,requestBytes:body===undefined||multipart?0:Buffer.byteLength(JSON.stringify(body)),elapsedMs:performance.now()-start,issuedAt,receivedAt,serverDate:response.headers.get('date'),apiSqlEvents:(await sqlCount())-before,sqlScope:'PROCESS_WIDE_WINDOW; CONCURRENT_WINDOWS_CAN_OVERLAP'}
  result.requests.push(measurement)
  assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${safe}: unexpected status ${response.status}`)
  if(raw)return bytes
  let envelope;try{envelope=JSON.parse(bytes.toString())}catch{throw new Error('C25 response was not JSON')}
  if(envelope.data?.serverNow)measurement.serverNow=envelope.data.serverNow
  if(response.status!==200)return envelope
  assert.equal(envelope.code,0,`${safe}: nonzero response code`);return normalizeProduct(envelope.data)
 },async login(who,role){await this.request('/auth/csrf');await this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?{username:who.username,password:who.password}:{username:who.username,password:who.password,expectedRole:role})}}}
 async function finish(error){
  try{if(!error)remaining();const consumed=moduleClosure();assert.ok(initialModules.every(row=>consumed.some(now=>now.path===row.path&&now.sha256===row.sha256)),'Loaded dependency bytes changed');result.loadedModuleClosure=consumed;const lock=path.join(backend,'node_modules/.package-lock.json');result.installedDependencyLockSha256=fs.existsSync(lock)?sha(fs.readFileSync(lock)):null}catch(e){error??=e}
  if(error){result.passed=false;fs.writeFileSync(path.join(state,`c25-${phase}-error-private.log`),String(error.stack??error),{mode:0o600});result.error=publicFailure(error);process.exitCode=1}
  result.elapsedMs=performance.now()-started;write(`c25-${phase}-result.json`,result);await closeQueues();await prisma.$disconnect()
 }
 return {state,status,result,read,write,check,client,record,remaining,finish,api}
}
