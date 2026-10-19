/** C18 report-only repair plus the remaining education/download qualification.
 * Never resubmit an accepted FINAL or replay the observed lock-order races. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createAnalysisFixture,addStudyParticipants} from './c18-study-fixture.mjs'
import {attachFourToolSources} from './c18-study-fourtool.mjs'
import {addParticipants as addEducationParticipants} from './c16-analysis-fixture.mjs'
const base=path.dirname(fileURLToPath(import.meta.url)),backend=path.resolve(base,'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {PrismaClient}=require('@prisma/client')
const {closeQueues,exportQueue}=require(path.join(backend,'dist/config/queue.js'))
const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {trainingManifestHash}=require(path.join(backend,'dist/modules/training-analysis/manifest.js'))
const study=require(path.join(backend,'dist/modules/anonymous-study/service.js'))
const composite=require(path.join(backend,'dist/modules/composite/composite.service.js'))
const {ensureCompositeFormSections,submitCompositeFormSectionFinal}=require(path.join(backend,'dist/modules/composite/final-submit.service.js'))
const {hashRecoveryToken}=require(path.join(backend,'dist/services/anonymousAccess.js'))
const {encryptPublicAccessToken,hashPublicAccessToken}=require(path.join(backend,'dist/services/publicAccessTokenCrypto.js'))
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),credentials=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime');assert.equal(process.env.NODE_ENV,'test')
const result={passed:false,qualificationScope:'C18_STATE_RELOAD_AND_MISSING_EDUCATION_CONTINUATION',checks:[],requests:[],measurements:[],exports:[]}
const sha=value=>createHash('sha256').update(value).digest('hex'),check=text=>{result.checks.push(text);console.log('PASS',text)}
const deny=[400,403,404,409,422]
function client(credential=''){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
 const start=performance.now(),response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const bytes=Buffer.from(await response.arrayBuffer());result.requests.push({route:route.replace(/(\/public\/composite(?:-assessments)?\/)[A-Za-z0-9_-]{20,}/,'$1[public-token]'),method,status:response.status,bytes:bytes.length,elapsedMs:performance.now()-start})
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${route}: ${response.status}; ${bytes.toString().slice(0,500)}`)
 if(raw)return bytes;const envelope=JSON.parse(bytes.toString());if(response.status!==200)return {httpStatus:response.status,...envelope};assert.equal(envelope.code,0);return envelope.data
 },async login(who,role='TEACHER'){await this.request('/auth/csrf');await this.request('/auth/training-login','POST',{...who,expectedRole:role})}}}
const teacher=client()
const root=f=>`/courses/${f.courseId}/training-analysis`,analyze=(f,c=teacher)=>c.request(root(f),'POST',{selector:f.selector})
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++}else cell+=c}assert.equal(quoted,false);assert.deepEqual(row,[]);const [columns,...values]=rows;return {columns,rows:values.map(value=>Object.fromEntries(columns.map((key,index)=>[key,value[index]])))}}
function assertWideMatchesLong(long,wide){for(const row of wide.rows){const matching=long.rows.filter(item=>item.participantKind===row.participantKind&&item.participantKey===row.participantKey);assert.ok(matching.length);for(const source of matching)for(const suffix of ['value','reason','attemptId','attemptEpoch','originalFinalStatus','taskSatisfied','sourceHashes'])assert.equal(row[source.columnKey+'__'+suffix],source[suffix])}}
function unzip(bytes){const files={};let offset=0;while(offset+4<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function queue(f,a,layout='long',format='csv',requestKey=randomUUID()){
 const queued=await teacher.request(root(f)+'/exports','POST',{selector:f.selector,manifest:a.manifest,layout,format,requestKey});assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1)
 const job=await exportQueue.getJob('export-'+queued.batchId);assert.ok(job,'original Redis job must exist')
 return {queued,job,route:queued.artifacts[0].downloadUrl.replace(/^\/api/,'')}
}
async function processExport(entry,expected=true){let error;try{await runExportBatch({data:entry.job.data,id:entry.job.id,opts:{attempts:1},attemptsMade:0})}catch(e){error=e}if(expected)assert.equal(error,undefined);else assert.ok(error);const batch=await prisma.exportBatch.findUniqueOrThrow({where:{id:entry.queued.batchId}});assert.equal(batch.status,expected?'READY':'FAILED');return batch}
async function exportReady(f,a,layout='long',format='csv'){
 const entry=await queue(f,a,layout,format);await processExport(entry);assert.equal((await teacher.request(entry.route+'/status')).status,'READY');const bytes=await teacher.request(entry.route,'GET',undefined,200,true)
 result.exports.push({batchId:entry.queued.batchId,layout,format,bytes:bytes.length,sha256:sha(bytes)});return {...entry,bytes}
}
async function duringGeneration(entry,mutate,label){
 const promises=fs.promises,original=promises.writeFile;let arrive,release,seen=0,writtenPath
 const arrived=new Promise(resolve=>arrive=resolve),gate=new Promise(resolve=>release=resolve)
 promises.writeFile=async function(file,...args){const value=await original.call(this,file,...args);if(typeof file==='string'&&file.includes(entry.queued.batchId)&&file.includes('.tmp-')){seen++;writtenPath=file;arrive();await gate}return value}
 const work=processExport(entry,false)
 try{await Promise.race([arrived,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Generation write gate timed out')),10000);t.unref()})]);assert.equal(seen,1);assert.ok(fs.statSync(writtenPath).size>0);const active=await prisma.exportBatch.findUniqueOrThrow({where:{id:entry.queued.batchId}});assert.equal(active.status,'PROCESSING');assert.ok(active.generation>=1);await mutate();release();await work;assert.equal(fs.existsSync(writtenPath),false);assert.ok(!fs.readdirSync(process.env.EXPORT_DIR).some(name=>name.includes(entry.queued.batchId)));await teacher.request(entry.route+'/status','GET',undefined,deny);await teacher.request(entry.route,'GET',undefined,deny);result.duringGeneration??=[];result.duringGeneration.push({mutation:label,actualFileWritten:true,observedBatchStatus:'PROCESSING',generation:active.generation,finalStatus:'FAILED',generationAndTemporaryFilesRemoved:true,statusAndDownloadDenied:true})}
 finally{release?.();promises.writeFile=original;await Promise.allSettled([work])}
}

const scope={purpose:'C18 synthetic same-study longitudinal research only',dataCategories:['FORM','SCALE','COGNITIVE','SJT']}
const text='Synthetic research explanation: one fixed study and purpose, selected data categories, existing and future waves. Withdrawal excludes research immediately without deleting educational records.'
let fixture,education,actor,version,otherStudy
const publicRoot=id=>`/public/anonymous-studies/${id}`,ownerRoot=id=>`/anonymous-studies/${id}`
const own=p=>client(p.credential)
const consent=(p,v=version)=>own(p).request(publicRoot(fixture.studyId)+'/research-consent/accept','POST',{requestId:p.acceptRequest??(p.acceptRequest=randomUUID()),versionId:v.id,bodyHash:v.bodyHash})
const withdraw=(p,revision=1)=>own(p).request(publicRoot(fixture.studyId)+'/research-withdrawal','POST',{requestId:p.withdrawRequest??(p.withdrawRequest=randomUUID()),expectedRevision:revision})
const raw=async(id)=>JSON.stringify(await prisma.$queryRawUnsafe(`SELECT jsonb_build_object('participants',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM anonymous_study_participants p WHERE p.study_id=$1),'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM composite_assessment_attempts a JOIN anonymous_study_attempts sa ON sa.attempt_id=a.id WHERE sa.study_id=$1),'snapshots',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM assessment_unit_snapshots u JOIN anonymous_study_attempts sa ON sa.attempt_id=u.composite_attempt_id WHERE sa.study_id=$1)) AS data`,id))
async function makeFixture(){
 const f=await createAnalysisFixture({prisma,teacherId:actor.id,passwordHash:actor.passwordHash})
 f.studyId=(await teacher.request('/anonymous-studies','POST',{title:'C18 synthetic research study'})).id
 const old=JSON.parse(fs.readFileSync(path.join(state,'source-c14-http-result.json')))
 await attachFourToolSources(prisma,f,old.completed[0])
 for(const wave of f.waves){
  const token=randomBytes(32).toString('base64url'),row=await prisma.compositeAssessmentAccessToken.create({data:{compositeAssessmentId:wave.task.id,createdBy:actor.id,tokenHash:hashPublicAccessToken(token),tokenEncrypted:encryptPublicAccessToken(token),expiresAt:new Date(Date.now()+86400000)}})
  wave.tokenId=row.id;wave.studyWaveId=randomUUID();wave.token=token
  await prisma.$executeRaw`INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES(${wave.studyWaveId},${f.studyId},${row.id},${'C18 synthetic wave '+wave.index},${wave.index+1})`
 }
 return f
}
let trace=null
prisma.$on('query',event=>{if(!trace)return;trace.sql++;trace.sqlMs+=event.duration;if(event.query.includes('anonymous_study_research_states')){trace.governanceSql++;trace.governanceQuery={sql:event.query,params:JSON.parse(event.params)}};if(event.query.includes('anonymous_study_research_audit'))trace.auditScans++;if(trace.poison&&event.params.includes(trace.poison))trace.poisonReads++})
async function measure(f){
 trace={sql:0,sqlMs:0,governanceSql:0,auditScans:0,poisonReads:0,poison:otherStudy};const start=performance.now()
 const analyzed=await analyzeTrainingCourse({actor:{id:actor.id,role:'TEACHER'},courseId:f.courseId,selector:f.selector})
 const measured={...trace,elapsedMs:performance.now()-start,sourceRows:analyzed.manifest.sources.length,observations:analyzed.manifest.observationCount,analysisBytes:Buffer.byteLength(JSON.stringify(analyzed.analysis)),manifestBytes:Buffer.byteLength(JSON.stringify(analyzed.manifest))}
 const governanceQuery=trace.governanceQuery;delete measured.poison;delete measured.governanceQuery;trace=null
 if(governanceQuery){const explained=await prisma.$queryRawUnsafe('EXPLAIN (ANALYZE, FORMAT JSON) '+governanceQuery.sql,...governanceQuery.params),plan=explained[0]['QUERY PLAN'][0],relations=[];const visit=node=>{if(node['Relation Name'])relations.push({table:node['Relation Name'],rows:node['Actual Rows'],loops:node['Actual Loops']});for(const child of node.Plans??[])visit(child)};visit(plan.Plan);measured.governancePlan={actualRows:plan.Plan['Actual Rows'],planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],relations,querySha256:sha(governanceQuery.sql)}}
 result.measurements.push(measured);assert.equal(measured.auditScans,0);assert.equal(measured.poisonReads,0);return analyzed
}
function sql(command,label,owner=false,expected=0){const runtime=JSON.parse(fs.readFileSync(path.join(state,'runtime-private.json'))),url=new URL(owner?runtime.DATABASE_URL_OWNER:process.env.DATABASE_URL);const out=spawnSync('psql',['-X','-A','-t','-h',url.hostname,'-p',url.port,'-U',decodeURIComponent(url.username),'-d',url.pathname.slice(1),'-v','ON_ERROR_STOP=1','-c',command],{encoding:'utf8',timeout:15000,env:{...process.env,PGPASSWORD:decodeURIComponent(url.password)}});fs.writeFileSync(path.join(state,`c18-${label}.log`),out.stdout+out.stderr,{mode:0o600});if(expected===0)assert.equal(out.status,0,label);else assert.notEqual(out.status,0,label);return out.stdout.trim()}
async function waitersRace(studyId,operations){const gate=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});let ready,release;const arrived=new Promise(r=>ready=r),hold=new Promise(r=>release=r);const transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM anonymous_studies WHERE id=$1 FOR UPDATE',studyId);ready();await hold},{timeout:15000});let jobs;try{await arrived;jobs=operations.map(fn=>fn());let n=0;const until=performance.now()+5000;while(performance.now()<until){const rows=await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%anonymous_studies%FOR UPDATE%'");n=rows[0].n;if(n>=operations.length)break;await new Promise(r=>setTimeout(r,20))}assert.equal(n,operations.length);release();await transaction;return {observedWaiters:n,outcomes:await Promise.all(jobs)}}finally{release?.();await transaction.catch(()=>{});if(jobs)await Promise.allSettled(jobs);await gate.$disconnect()}}
try{
 const prior=JSON.parse(fs.readFileSync(path.join(state,'source-c18-http-result.json'))),partial=JSON.parse(fs.readFileSync(path.join(state,'source-c18-completion-result.json')))
 assert.equal(prior.passed,false);assert.equal(prior.checks.length,8);assert.equal(prior.requests.length,198)
 assert.equal(partial.passed,false);assert.equal(partial.checks.length,0);assert.equal(partial.requests.length,20)
 assert.equal(partial.reverseVersionRace.acceptStatus,409);assert.equal(partial.reverseVersionRace.publishStatus,200);assert.equal(partial.startWithdrawalRace.actualPgWaiters,2)
 const saved=JSON.parse(fs.readFileSync(path.join(state,'c18-fixture-private.json')));({fixture,education,version,otherStudy}=saved)
 await teacher.login(credentials.teacher);actor=await prisma.user.findUniqueOrThrow({where:{id:saved.actorId}})
 result.priorHttpEvidenceSha256=sha(fs.readFileSync(path.join(state,'source-c18-http-result.json')))
 result.priorCompletionEvidenceSha256=sha(fs.readFileSync(path.join(state,'source-c18-completion-result.json')))
 result.reusedScenarioGroups=8;result.reusedRaceSubchecks={reverseVersionRace:partial.reverseVersionRace,startWithdrawalRace:partial.startWithdrawalRace}
 const studyIds=[...new Set(partial.requests.map(r=>/^\/anonymous-studies\/([^/]+)\/waves\/create-with-link$/.exec(r.route)?.[1]).filter(Boolean))]
 assert.equal(studyIds.length,1);const realStudy=studyIds[0]
 const realWaves=await prisma.$queryRaw`SELECT w.id,w.access_token_id AS "tokenId",t.composite_assessment_id AS "taskId" FROM anonymous_study_waves w JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id WHERE w.study_id=${realStudy} ORDER BY w.ordinal`
 assert.equal(realWaves.length,2);assert.equal(realWaves[0].taskId,realWaves[1].taskId)
 const accepted=await prisma.$queryRaw`SELECT a.id,a.status,a.async_report_epoch AS "asyncReportEpoch",a.attempt_epoch AS "attemptEpoch",a.recovery_token_hash AS "recoveryHash",sa.wave_id AS "waveId",sa.participant_id AS "participantId" FROM anonymous_study_attempts sa JOIN composite_assessment_attempts a ON a.id=sa.attempt_id WHERE sa.study_id=${realStudy} AND EXISTS(SELECT 1 FROM assessment_unit_snapshots u WHERE u.composite_attempt_id=a.id)`
 assert.equal(accepted.length,1);assert.equal(accepted[0].status,'IN_PROGRESS');assert.equal(accepted[0].asyncReportEpoch,null)
 const durable=async attemptId=>JSON.stringify(await prisma.$queryRaw`SELECT jsonb_build_object('answers',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM composite_form_answers f WHERE f.attempt_id=${attemptId}),'snapshots',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM assessment_unit_snapshots u WHERE u.composite_attempt_id=${attemptId}),'governance',(SELECT to_jsonb(r) FROM anonymous_study_research_states r JOIN anonymous_study_attempts sa ON sa.participant_id=r.participant_id WHERE sa.attempt_id=${attemptId})) AS facts`)
 async function originalStateReload(attemptId,recoveryToken){
  const before=await durable(attemptId),parentBefore=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  assert.equal(parentBefore.status,'IN_PROGRESS');assert.equal(parentBefore.asyncReportEpoch,null);assert.equal(parentBefore.recoveryTokenHash,hashRecoveryToken(recoveryToken))
  assert.equal(await prisma.compositeReportJob.count({where:{attemptId}}),0)
  const respondent=client();respondent.recovery=recoveryToken
  const reread=await respondent.request('/public/composite-assessments/attempts/'+attemptId)
  assert.equal(reread.status,'COMPLETED');assert.equal(reread.progress,100)
  const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  assert.equal(parent.status,'COMPLETED');assert.equal(await durable(attemptId),before);assert.equal(await prisma.compositeReportJob.count({where:{attemptId}}),0)
  await respondent.request('/public/composite-assessments/attempts/'+attemptId+'/report')
  result.stateReloadContinuations??=[];result.stateReloadContinuations.push({attemptId,before:'IN_PROGRESS',after:'COMPLETED',originalPublicGetAndReport:true,reportJobsBeforeAndAfter:0,durableFactsAndGovernanceSha256:sha(before),durableFactsAndGovernanceUnchanged:true,acceptedFinalResubmitted:false})
 }
 // The discarded local test client is reconstructed using the SAME server-side
 // study recovery derivation; no product auth is relaxed and the stored hash
 // must match. This is only synthetic fixture setup, not a recovery UI claim.
 const priorRecovery=study.deriveStudyRecovery(accepted[0].participantId,accepted[0].waveId)
 assert.equal(priorRecovery.hash,accepted[0].recoveryHash)
 result.priorTestContextRecovery={method:'EXISTING_SYNTHETIC_STUDY_DERIVATION',storedCapabilityHashMatched:true,isRealStudyRecoveryHttpQualification:false}
 await originalStateReload(accepted[0].id,priorRecovery.token)
 // A fresh identity, on the SAME valid published study/task, exercises only
 // the not-yet-proven completed-parent withdrawal/recovery/revocation order.
 const token=await composite.revealAccessToken(actor.id,'TEACHER',realWaves[0].taskId,realWaves[0].tokenId)
 const joined=await client().request(`/public/anonymous-studies/waves/${realWaves[0].id}/join`,'POST',{token:token.token,consent:true}),real=client(joined.credential)
 fs.writeFileSync(path.join(state,'c18-finalize-progress-private.json'),JSON.stringify({realStudy,realWaves,joined}),{mode:0o600})
 const unknown=await real.request(publicRoot(realStudy)+'/research-consent');assert.equal(unknown.state,'UNKNOWN')
 await real.request(publicRoot(realStudy)+'/research-consent/accept','POST',{requestId:randomUUID(),versionId:unknown.version.id,bodyHash:unknown.version.bodyHash})
 const one=await real.request(publicRoot(realStudy)+`/waves/${realWaves[0].id}/start`,'POST',{}),attempt=await composite.getAttemptState(one.attemptId,{recoveryTokenHash:hashRecoveryToken(one.recoveryToken)}),form=attempt.currentItem
 assert.equal(form.type,'FORM_SECTION');assert.equal(form.answers.length,1)
 await submitCompositeFormSectionFinal({attemptId:one.attemptId,sectionId:form.id,submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:form.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{formItemId:form.answers[0].formItemId,value:'C18 completed-before-withdraw education response'}],recoveryTokenHash:hashRecoveryToken(one.recoveryToken)})
 await originalStateReload(one.attemptId,one.recoveryToken)
 const completedBefore=JSON.stringify(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:one.attemptId}})),factsBefore=JSON.stringify(await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:one.attemptId},orderBy:{id:'asc'}})),countsBefore=(await teacher.request(ownerRoot(realStudy)+'/statistics')).list[0]
 assert.equal(countsBefore.completedAttempts,2)
 const withdrawn=await real.request(publicRoot(realStudy)+'/research-withdrawal','POST',{requestId:randomUUID(),expectedRevision:1});assert.equal(withdrawn.state,'WITHDRAWAL_PENDING');assert.equal(withdrawn.eligible,false)
 const second=await real.request(publicRoot(realStudy)+`/waves/${realWaves[1].id}/start`,'POST',{});assert.equal(second.state,'IN_PROGRESS')
 assert.equal(JSON.stringify(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:one.attemptId}})),completedBefore);assert.equal(JSON.stringify(await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:one.attemptId},orderBy:{id:'asc'}})),factsBefore)
 const recovery=await real.request(publicRoot(realStudy)+`/waves/${realWaves[0].id}/recover`,'POST',{});assert.equal(recovery.state,'COMPLETED');assert.equal(recovery.recoveryToken,one.recoveryToken)
 const links=await prisma.$queryRaw`SELECT participant_id FROM anonymous_study_attempts WHERE attempt_id IN (${one.attemptId},${second.attemptId})`;assert.equal(links.length,2);assert.equal(new Set(links.map(r=>r.participant_id)).size,1)
 const csv=await teacher.request(ownerRoot(realStudy)+`/waves/${realWaves[0].id}/export.csv`,'GET',undefined,200,true);assert.ok(csv.toString().includes('C18 completed-before-withdraw education response'));assert.ok(csv.toString().includes('C18 accepted education response'))
 await real.request(publicRoot(realStudy)+'/revoke','POST',{})
 for(const [route,method,body]of [[publicRoot(realStudy),'GET'],[publicRoot(realStudy)+'/research-consent','GET'],[publicRoot(realStudy)+'/research-withdrawal','POST',{requestId:randomUUID(),expectedRevision:2}]])await real.request(route,method,body,404)
 await assert.rejects(composite.getAttemptState(one.attemptId,{recoveryTokenHash:hashRecoveryToken(one.recoveryToken)}),e=>e.statusCode===403)
 assert.equal((await teacher.request(ownerRoot(realStudy)+'/statistics')).list[0].completedAttempts,countsBefore.completedAttempts)
 result.completedEducation={legacyTaskUnchanged:true,priorFinalStateReloadOnly:true,newIdentityOnlyForMissingCompletedOrder:true,completedAttemptsBefore:2,completedAttemptsAfter:2,completedParentUnchangedByWithdrawal:true,finalSnapshotsUnchanged:true,stableIdentityAcrossWaves:true}
 check('Original public state reload and report complete prior accepted FINAL without resubmission or durable-fact/governance changes; fresh identity verifies completed-parent withdrawal/recovery/education CSV and separate revoke while preserving completion counts; prior start race retained without replay')
 // Download overlaps a blocked withdrawal: authorization snapshot may precede
 // withdrawal commit. A new authorization after commit must refuse artifact.
 const downloadCurrent=await analyze(fixture),downloadEntry=await exportReady(fixture,downloadCurrent),target=fixture.participants[48]
 const gate=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});let arrive,release
 const arrived=new Promise(r=>arrive=r),held=new Promise(r=>release=r),transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM anonymous_studies WHERE id=$1 FOR UPDATE',fixture.studyId);arrive();await held},{timeout:15000});let withdrawing
 try{await arrived;withdrawing=withdraw(target);let observed=0;const until=performance.now()+5000;while(performance.now()<until){observed=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%anonymous_studies%FOR UPDATE%'"))[0].n;if(observed)break;await new Promise(r=>setTimeout(r,20))}assert.equal(observed,1);await teacher.request(downloadEntry.route,'GET',undefined,200,true);release();await transaction;await withdrawing;await teacher.request(downloadEntry.route,'GET',undefined,deny);result.downloadRace={actualPgWaiters:observed,beforeWithdrawalCommit:200,afterWithdrawalCommit:'DENIED',linearization:'repeatable-read authorization snapshot'}}finally{release?.();await transaction.catch(()=>{});if(withdrawing)await Promise.allSettled([withdrawing]);await gate.$disconnect()}
 check('Actual blocked withdrawal overlaps successful pre-commit authorization; after withdrawal commit a fresh download authorization refuses the old artifact, without claiming recall of already downloaded bytes')
 assert.equal(result.checks.length,2)
 result.passed=true
}catch(error){result.error={name:error.name,message:String(error.message).replace(/(\/public\/composite(?:-assessments)?\/)[A-Za-z0-9_-]{20,}/g,'$1[public-token]').slice(0,1200)};throw error}
finally{fs.writeFileSync(path.join(state,'c18-finalize-result.json'),JSON.stringify(result,null,2));await closeQueues();await prisma.$disconnect();console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,requests:result.requests.length}))}
