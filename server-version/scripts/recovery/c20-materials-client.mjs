/** Shared C20 transport/assertions. Production code is loaded from the frozen dist.
 * Responses, credentials and DB rows remain only in the private state directory.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
export const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
export const require=createRequire(path.join(backend,'package.json'))
export const {prisma}=require(path.join(backend,'dist/config/database.js'))
export const {PrismaClient}=require('@prisma/client')
export const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
export const {loadFrozenActiveSlotSet}=require(path.join(backend,'dist/modules/assessment-runtime/slot-set.js'))
export const {readCognitiveQuota}=require(path.join(backend,'dist/modules/cognitive/attempt-quota.js'))
export const {closeQueues}=require(path.join(backend,'dist/config/queue.js'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {gonogoSequence}=require(path.join(backend,'dist/modules/cognitive/randomization.js'))
const {createTrialEnvelope}=require(path.join(backend,'dist/modules/cognitive/v2/trial-envelope.js'))
export const sha=value=>createHash('sha256').update(value).digest('hex')
export const denied=[400,403,404,409,422],prefix='/composite-assessments',pub='/public/composite-assessments',products='/questionnaire-products'
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export function normalizeProduct(value){if(!value||value.revision===undefined||!Array.isArray(value.items)||!Array.isArray(value.formSections))return value;return {...value,items:value.items.map(item=>({...item,scaleId:item.scale?.id??item.scaleId,cognitiveAssignmentId:item.cognitiveAssignment?.id??item.cognitiveAssignmentId,situationalInstrumentKey:item.situational?.key??item.situationalInstrumentKey,situationalInstrumentVersion:item.situational?.version??item.situationalInstrumentVersion,formSectionId:value.formSections.find(section=>(section.items??[]).some(child=>child.id===item.id))?.id??item.formSectionId}))}}
export function harness(phase){
 const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test');assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime')
 const journal=path.join(state,'c20-'+phase+'-http-private.jsonl');let operationId=0
 const journalWrite=value=>fs.appendFileSync(journal,JSON.stringify(value)+'\n',{mode:0o600})
 const result={passed:false,phase,checks:[],requests:[],measurements:[],counts:[]}
 const read=name=>JSON.parse(fs.readFileSync(path.join(state,name)))
 const write=(name,value)=>fs.writeFileSync(path.join(state,name),JSON.stringify(value,null,2),{mode:0o600})
 const check=text=>{result.checks.push(text);console.log('PASS',text)}
 async function sqlCount(){const response=await fetch(status.apiUrl+'/metrics',{signal:AbortSignal.timeout(8000)});assert.equal(response.status,200);const text=await response.text();const match=text.match(/^ptool_prisma_sql_events_total (\d+)$/m);assert.ok(match,'SQL observability must be enabled');return Number(match[1])}
 function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
  const before=await sqlCount(),start=performance.now(),multipart=body instanceof FormData
  const op=++operationId;journalWrite({op,stage:'ISSUED',route,method,body:route.startsWith('/auth/')?'AUTH_REDACTED':multipart?'MULTIPART':body,at:new Date().toISOString()})
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(30000),headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const bytes=Buffer.from(await response.arrayBuffer()),safe=route.replace(/(\/public\/composite-assessments\/)(?!attempts\/)[^/]+/,'$1[token]')
  journalWrite({op,stage:'RECEIVED',status:response.status,responseSha256:sha(bytes),response:route.startsWith('/auth/')?'AUTH_REDACTED':raw?'BINARY':bytes.toString(),at:new Date().toISOString()})
  result.requests.push({route:safe,method,status:response.status,bytes:bytes.length,elapsedMs:performance.now()-start,apiSqlEvents:(await sqlCount())-before,sqlScope:'PROCESS_WIDE_WINDOW; CONCURRENT_WINDOWS_CAN_OVERLAP'})
  assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${safe}: ${response.status}; ${bytes.toString().slice(0,700)}`)
  if(raw)return bytes
  const envelope=JSON.parse(bytes.toString());if(response.status!==200)return envelope
  assert.equal(envelope.code,0,`${safe}: ${envelope.message}`);return normalizeProduct(envelope.data)
 },async login(who,role){await this.request('/auth/csrf');await this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?{username:who.username,password:who.password}:{username:who.username,password:who.password,expectedRole:role})}}}
 async function finish(error){if(error)result.error={name:error.name,message:error.message};write('c20-'+phase+'-result.json',result);await closeQueues();await prisma.$disconnect()}
 return {state,status,result,read,write,check,client,finish}
}
export async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),forms:await prisma.compositeFormSectionAttempt.count(),formAnswers:await prisma.compositeFormAnswer.count(),scales:await prisma.assessment.count(),cognitive:await prisma.cognitiveSession.count(),sjt:await prisma.situationalAttempt.count(),rawScale:await prisma.assessmentResultFact.count(),rawCognitive:await prisma.cognitiveRawSubmission.count(),rawSjt:await prisma.situationalRawSubmission.count(),snapshots:await prisma.assessmentUnitSnapshot.count(),jobs:await prisma.compositeReportJob.count(),materialClaims:await prisma.trainingMaterialAllocationClaim.count(),materialBindings:await prisma.trainingMaterialSubjectBinding.count(),materialBucketsHash:sha(JSON.stringify(await prisma.trainingMaterialQuotaBucket.findMany({orderBy:{id:'asc'}}))),accessTokensHash:sha(JSON.stringify(await prisma.compositeAssessmentAccessToken.findMany({orderBy:{id:'asc'}})))}}
export async function noWrites(h,name,fn){const before=await census();await fn();const after=await census();assert.deepEqual(after,before,name);h.result.counts.push({name,before,after})}
export async function children(attemptId){const [forms,scales,cognitive,sjt,snapshots,jobs]=await Promise.all([prisma.compositeFormSectionAttempt.findMany({where:{attemptId}}),prisma.assessment.findMany({where:{compositeAttemptId:attemptId}}),prisma.cognitiveSession.findMany({where:{compositeAttemptId:attemptId}}),prisma.situationalAttempt.findMany({where:{compositeAttemptId:attemptId}}),prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId}}),prisma.compositeReportJob.findMany({where:{attemptId}})]);return {forms,scales,cognitive,sjt,snapshots,jobs}}
export async function candidateProof(attemptId){const row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}});assert.ok(row.trainingFlowSnapshotEncrypted&&row.trainingFlowSnapshotHash);assert.equal(row.trainingFlowPathEncrypted==null,row.trainingFlowPathHash==null);const candidate=decryptUnifiedRuntimePayload(row.trainingFlowSnapshotEncrypted),proof=row.trainingFlowPathEncrypted?decryptUnifiedRuntimePayload(row.trainingFlowPathEncrypted):null,slots=await loadFrozenActiveSlotSet(row.frozenActiveSlotSetEncrypted,prisma);assert.equal(candidate.slotSetHash,slots.snapshotHash);assert.equal(canonicalHash(candidate),row.trainingFlowSnapshotHash);if(proof)assert.equal(canonicalHash(proof),row.trainingFlowPathHash);if(candidate.schemaVersion===2){const a=candidate.materialAssignment;assert.ok(a);const {assignmentHash,...assignmentBody}=a;assert.equal(canonicalHash(assignmentBody),assignmentHash);assert.equal(a.attemptId,row.id);assert.equal(a.attemptEpoch,row.attemptEpoch);assert.equal(a.participantKey,row.participantKey);assert.equal(a.compositeId,row.compositeAssessmentId);assert.equal(a.configDigest,candidate.flowDigest);assert.match(a.assignmentHash,/^[a-f0-9]{64}$/);const claim=await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:a.claimId}});for(const key of ['experimentId','compositeId','publicationKey','configDigest','participantKey','groupKey','materialDigest','algorithm'])assert.equal(a[key],claim[key]);if(proof){assert.equal(proof.schemaVersion,2);assert.equal(proof.assignmentHash,a.assignmentHash);assert.equal(proof.path.assignmentHash,a.assignmentHash)}}if(proof)assert.equal(proof.path.flowDigest,candidate.flowDigest);else assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}}),0,'accepted FINAL requires a persisted path proof');return {row,candidate,proof,slots,stable:{candidateBytes:Buffer.byteLength(row.trainingFlowSnapshotEncrypted),candidateSha256:sha(row.trainingFlowSnapshotEncrypted),slotsetBytes:Buffer.byteLength(row.frozenActiveSlotSetEncrypted),slotsetSha256:sha(row.frozenActiveSlotSetEncrypted),candidateHash:row.trainingFlowSnapshotHash,slotSetHash:row.frozenActiveSlotSetHash}}}
export function assertHidden(state,product,reachedTypes){const text=JSON.stringify(state);for(const item of product.items.filter(item=>!reachedTypes.includes(item.type)))assert.ok(!text.includes(item.id),'future item identity leaked');for(const key of ['trainingFlowFrozen','trainingFlowSnapshotEncrypted','trainingFlowPathEncrypted','acceptedFacts','reachedInstrumentKeys','skippedInstrumentKeys'])assert.ok(!text.includes('"'+key+'"'),'private flow evidence leaked');assert.ok(!text.includes('expertKey'))}
export function cognitiveFinal(session,recovery){return {submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,...(recovery?{recoveryToken:recovery}:{}),trials:gonogoSequence(session.randomSeed,session.config.totalTrials,session.config.nogoRatio).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1500,endedAtPerfMs:trialIndex*1500+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))}}
export function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}if(row.length||cell)rows.push([...row,cell]);assert.equal(quoted,false);const [columns,...values]=rows;return {columns,rows:values.map(value=>Object.fromEntries(columns.map((key,index)=>[key,value[index]])))}}
/** Execute only genuinely queued fixture outboxes through the unchanged claim /
 * lease / processor. Original jobs are row-locked, never updated or recreated;
 * PostgreSQL SKIP LOCKED keeps the original production selection algorithm.
 * Draining each phase restores the preexisting global pending budget exactly.
 */
export async function drainReports(h,attemptIds){
 const {claimCompositeReportJob}=require(path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))
 const {processCompositeReportJob}=require(path.join(backend,'dist/workers/compositeReportWorker.js'))
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('application_name','c20_original_outbox_preservation')
 const gate=new PrismaClient({datasources:{db:{url:url.toString()}}})
 let release,arrived,rejectReady;const hold=new Promise(r=>release=r),ready=new Promise((r,j)=>{arrived=r;rejectReady=j})
 const transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE NOT (attempt_id=ANY($1::text[])) FOR UPDATE',attemptIds);arrived();await hold},{maxWait:10000,timeout:120000});transaction.catch(rejectReady)
 const processed=[]
 try{
  await ready
  const expected=await prisma.compositeReportJob.findMany({where:{attemptId:{in:attemptIds}}})
  assert.equal(expected.length,attemptIds.length,'every accepted completed fixture needs one original outbox')
  for(const target of expected){
   if(target.status==='READY')continue
   const job=await claimCompositeReportJob();assert.ok(job,'completed fixture outbox must be genuinely claimable');assert.ok(attemptIds.includes(job.attemptId),'nonfixture job must remain locked and untouched')
   await processCompositeReportJob(job)
   const final=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(final.status,'READY','original report processing failed; do not forge or reset its outbox')
   assert.equal(final.attemptCount,1,'first report materialization must use one original claim')
   processed.push({attemptId:job.attemptId,jobId:job.id,attemptCount:final.attemptCount,requestedRevision:final.requestedRevision,status:final.status})
  }
  for(const attemptId of attemptIds)assert.equal((await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId,attemptEpoch:1}}})).status,'READY')
 }finally{release();await transaction;await gate.$disconnect()}
 h.result.originalOutboxProcessed=processed
 return processed
}
