/** C16 actual restricted-role PG + dist HTTP/queue qualification.
 * New 10/20/50 two-wave data are explicitly synthetic DB facts; retained C14
 * four-tool facts are only read. This is neither browser nor capacity evidence.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomUUID,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createAnalysisFixture,addParticipants,addDuplicate} from './c16-analysis-fixture.mjs'
const base=path.dirname(fileURLToPath(import.meta.url)),backend=path.resolve(base,'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {PrismaClient}=require('@prisma/client')
const {closeQueues,exportQueue}=require(path.join(backend,'dist/config/queue.js'))
const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
const {loadTrainingAnalysisSources}=require(path.join(backend,'dist/modules/training-analysis/source.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {parseCanonicalUnitResultEnvelope}=require(path.join(backend,'dist/modules/assessment-runtime/unit-result.js'))
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),credentials=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime');assert.equal(process.env.NODE_ENV,'test')
const result={passed:false,qualificationScope:'C16_ANALYSIS_ONLY',checks:[],requests:[],measurements:[],exports:[],fixtureScope:'10/20/50 two-wave synthetic PG facts, not browser or re-FINAL; original C14 facts read only'}
const sha=value=>createHash('sha256').update(value).digest('hex'),check=text=>{result.checks.push(text);console.log('PASS',text)}
const deny=[400,403,404,409,422]
function client(){const cookies=new Map();return {async request(route,method='GET',body,expected=200,raw=false){
 const start=performance.now(),response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const bytes=Buffer.from(await response.arrayBuffer());result.requests.push({route,method,status:response.status,bytes:bytes.length,elapsedMs:performance.now()-start})
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${route}: ${response.status}; ${bytes.toString().slice(0,500)}`)
 if(raw)return bytes;const envelope=JSON.parse(bytes.toString());if(response.status!==200)return {httpStatus:response.status,...envelope};assert.equal(envelope.code,0);return envelope.data
 },async login(who,role='TEACHER'){await this.request('/auth/csrf');await this.request('/auth/training-login','POST',{...who,expectedRole:role})}}}
const teacher=client(),other=client(),student=client()
const root=f=>`/courses/${f.courseId}/training-analysis`,analyze=(f,c=teacher)=>c.request(root(f),'POST',{selector:f.selector})
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++}else cell+=c}assert.equal(quoted,false);assert.deepEqual(row,[]);const [columns,...values]=rows;return {columns,rows:values.map(value=>Object.fromEntries(columns.map((key,index)=>[key,value[index]])))}}
function unzip(bytes){const files={};let offset=0;while(offset+4<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
function golden(analysis,n){
 assert.equal(analysis.state,'present');assert.equal(analysis.metrics[0].validCaseN,n);assert.equal(analysis.metrics[0].comparisons[0].delta,10)
 for(let index=0;index<2;index++){
  const row=analysis.descriptives.find(d=>d.waveKey===`wave_${index+1}`),offset=index*10
  assert.equal(row.validN,n);assert.equal(row.statistics.mean,(n+1)/2+offset);assert.equal(row.statistics.median,(n+1)/2+offset)
  assert.ok(Math.abs(row.statistics.sdSample-Math.sqrt(n*(n+1)/12))<1e-10)
  assert.deepEqual(row.statistics.minMax,{min:1+offset,max:n+offset});assert.deepEqual(row.statistics.quartiles,{q1:1+(n-1)*.25+offset,q2:(n+1)/2+offset,q3:1+(n-1)*.75+offset})
 }
}
async function qualityRows(f,a){const all=[...a.quality.list];for(let page=2;all.length<a.quality.total;page++){const next=await teacher.request(root(f)+'/quality/list','POST',{selector:f.selector,manifest:a.manifest,page});assert.equal(next.pageSize,25);all.push(...next.list)}assert.equal(new Set(all.map(x=>x.attemptId)).size,all.length);return all}
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
async function originalC14(teacherId){
 const old=JSON.parse(fs.readFileSync(path.join(state,'source-c14-http-result.json'))),first=old.completed[0],task=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:first.productId},include:{items:true}}),parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attemptId}})
 const variants=[...new Set(old.completed.filter(row=>row.productId===task.id).map(row=>row.variantKey))];assert.equal(variants.length,2)
 const available=await teacher.request(`/courses/${parent.deliveryCourseId}/training-analysis/sources`)
 const selector={schemaVersion:1,courseId:parent.deliveryCourseId,mode:'PAIRWISE',waves:[]}
 for(const variantKey of variants){const example=old.completed.find(row=>row.productId===task.id&&row.variantKey===variantKey),snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:example.attemptId}}),metrics=[]
  for(const type of ['SCALE','COGNITIVE','SITUATIONAL']){const snapshot=snapshots.find(row=>row.unitType===type),envelope=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snapshot.canonicalResultEncrypted)),item=task.items.find(row=>row.type===type&&example.selectedItemIds.includes(row.id));const allowed=available.list.find(row=>row.taskId===task.id&&row.variantKey===variantKey)?.metrics??[];const metric=envelope.core.metrics.find(row=>typeof row.value==='number'&&(type!=='SITUATIONAL'||row.key==='cooperation')&&(type!=='COGNITIVE'||allowed.some(value=>value.itemId===item.id&&value.metricKey===row.key)));assert.ok(metric);metrics.push({itemId:item.id,metricKey:metric.key})}
  selector.waves.push({waveKey:'original_'+variantKey,taskId:task.id,publication:task.publishedAt.toISOString(),configDigest:task.trainingVariantDigest,variantKey,metrics})
 }
 const loaded=await prisma.$transaction(tx=>loadTrainingAnalysisSources(tx,{userId:teacherId,role:'TEACHER'},selector))
 assert.ok(loaded.source.observations.some(row=>row.metricKey==='cooperation'&&row.value===9));assert.ok(loaded.source.observations.some(row=>row.metricKey==='total'&&row.value===1));assert.ok(loaded.source.observations.some(row=>row.itemId===selector.waves[0].metrics[1].itemId&&typeof row.value==='number'))
 result.originalC14={taskId:task.id,sourceCount:loaded.manifest.attempts.length,observationCount:loaded.source.observations.length,completedFourToolFacts:old.completed.length,originalTrialCount:120,readOnly:true};check('Actual C14 four-tool accepted facts reused read-only; Scale=1/SJT cooperation=9/cognitive frozen numeric facts validated, no resubmission or rescoring')
 const bad=structuredClone(selector);bad.waves[0].metrics[1].metricKey='productIndex';await teacher.request(`/courses/${parent.deliveryCourseId}/training-analysis`,'POST',{selector:bad},deny);check('Unauthorized cognitive product index cannot be unlocked through analysis')
}

async function witnessedQualityRace(f,body){
 const gate=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}}),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let release,ready;const waiting=new Promise(resolve=>ready=resolve),hold=new Promise(resolve=>release=resolve)
 const transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM courses WHERE id=$1 FOR UPDATE',f.courseId);ready();await hold},{timeout:10000})
 let jobs
 try{await waiting;jobs=[teacher.request(root(f)+'/quality','POST',body,[200,409]),teacher.request(root(f)+'/quality','POST',body,[200,409])];const until=performance.now()+2500;let observed=0
  while(performance.now()<until){const rows=await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF c%'");observed=rows[0].n;if(observed>=2)break;await pause(20)}
  assert.equal(observed,2,'Both quality requests must actually wait on the held course lock');result.qualityRace={actualPgWaiters:observed,lock:'courses row FOR UPDATE',concurrentRequests:2};release();await transaction;return await Promise.all(jobs)
 }finally{release?.();await transaction.catch(()=>{});if(jobs)await Promise.allSettled(jobs);await gate.$disconnect()}
}

let fixture,otherId
try{
 await teacher.login(credentials.teacher);const owner=await prisma.user.findUniqueOrThrow({where:{username:credentials.teacher.username}}),password=await prisma.user.findUniqueOrThrow({where:{username:credentials.student.username}})
 const otherAccount=await prisma.user.create({data:{username:'c16-other-'+randomUUID(),passwordHash:password.passwordHash,role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true,mustChangePassword:false}});otherId=otherAccount.id
 await other.login({username:otherAccount.username,password:credentials.student.password});await student.login(credentials.student,'STUDENT')
 fixture=await createAnalysisFixture({prisma,teacherId:owner.id,passwordHash:password.passwordHash})
 let current
 for(const n of [10,20,50]){
  await addParticipants(prisma,fixture,n);fs.writeFileSync(path.join(state,'c16-fixture-private.json'),JSON.stringify(fixture),{mode:0o600})
  current=await analyze(fixture);golden(current.analysis,n)
  const measured=spawnSync(process.execPath,[path.join(base,'c16-analysis-measure.mjs'),state,String(n)],{cwd:backend,env:process.env,encoding:'utf8',timeout:90000});fs.writeFileSync(path.join(state,`c16-measure-${n}.log`),measured.stdout+measured.stderr);fs.writeFileSync(path.join(state,`c16-measure-${n}.exit`),String(measured.status)+'\n');assert.equal(measured.status,0,`SQL measurement ${n} failed`)
  result.measurements.push(...JSON.parse(fs.readFileSync(path.join(state,`c16-measure-${n}.json`))).rows)
 }
 check('Real HTTP two-wave 10/20/50 synthetic numeric facts match independent mean/median/sample-SD/type7-quartile/min-max and paired-delta=10 hand formulas')
 for(const temperature of ['PROCESS_COLD_TEMPLATE_FIRST_READ','SAME_PROCESS_TEMPLATE_HOT']){const rows=result.measurements.filter(row=>row.temperature===temperature);assert.ok(Math.max(...rows.map(row=>row.sqlEvents))-Math.min(...rows.map(row=>row.sqlEvents))<=4,'SQL count grew per participant')}
 check('Actual PostgreSQL SQL-event counts remain batch-bounded at 10/20/50 fixed two-wave sources; cold and hot process timings separately recorded, no capacity claim')
 const discovery=await teacher.request(root(fixture)+'/sources');assert.equal(discovery.list.filter(row=>fixture.selector.waves.some(wave=>wave.taskId===row.taskId)).length,2)
 await other.request(root(fixture)+'/sources','GET',undefined,deny);await other.request(root(fixture),'POST',{selector:fixture.selector},deny);await student.request(root(fixture),'POST',{selector:fixture.selector},deny)
 await prisma.courseShare.create({data:{courseId:fixture.courseId,sharedBy:owner.id,sharedTo:otherId}});await other.request(root(fixture),'POST',{selector:fixture.selector},deny)
 check('Owner discovers/analyzes current Training course; nonowner, student and CourseShare-only teacher denied')
 const alias=structuredClone(fixture.selector);alias.waves[1]={...alias.waves[0],waveKey:'alias'};await teacher.request(root(fixture),'POST',{selector:alias},409)
 const full=await teacher.request(root(fixture),'POST',{selector:{...fixture.selector,mode:'FULL_CASE'}});golden(full.analysis,50);assert.equal(full.analysis.metrics[0].countKind,'COMPLETE_CASE')
 check('Same publication alias rejected 409; full-case mode retains the same explicitly matched 50 participants')
 const allQuality=await qualityRows(fixture,current);assert.equal(allQuality.length,100);check('Bounded quality list paginates 25 rows with exact 100-source manifest binding')
 const long=await exportReady(fixture,current),wide=await exportReady(fixture,current,'wide'),dict=await exportReady(fixture,current,'dictionary'),zip=await exportReady(fixture,current,'long','zip')
 const L=parseCsv(long.bytes),W=parseCsv(wide.bytes),D=parseCsv(dict.bytes),Z=unzip(zip.bytes);assert.equal(L.rows.length,100);assert.equal(W.rows.length,50);assert.equal(D.rows.length,2)
 for(const row of L.rows){const expected=fixture.attempts.find(attempt=>attempt.id===row.attemptId);assert.ok(expected);assert.equal(Number(row.value),expected.value);assert.equal(row.reason,'');assert.equal(row.originalFinalStatus,'COMPLETED');assert.equal(row.taskSatisfied,'true')}
 for(const row of W.rows){const matching=L.rows.filter(item=>item.participantKey===row.participantKey);assert.equal(matching.length,2);for(const source of matching){assert.equal(row[source.columnKey+'__value'],source.value);assert.equal(row[source.columnKey+'__attemptId'],source.attemptId)}}
 assert.deepEqual(parseCsv(Z['long.csv']),L);assert.deepEqual(parseCsv(Z['wide.csv']),W);assert.deepEqual(parseCsv(Z['dictionary.csv']),D);assert.equal(JSON.parse(Z['manifest.json']).manifestHash,current.manifest.manifestHash)
 for(const row of D.rows)assert.ok(L.rows.some(source=>source.columnKey===row.columnKey&&source.waveKey===row.waveKey&&source.itemId===row.itemId));for(const text of [long.bytes,wide.bytes,dict.bytes].map(bytes=>bytes.toString()))for(const user of fixture.participants){assert.ok(!text.includes(user.username));assert.ok(!text.includes(user.id),'raw user UUID leaked in anonymous export')}
 await other.request(long.route,'GET',undefined,deny);await student.request(long.route,'GET',undefined,deny)
 check('Original Redis queue + dist export consumer + authenticated status/download produce exact long/wide/dictionary CSV and ZIP from one frozen sample; full status/task satisfaction preserved')
 const pending=await queue(fixture,current),target=allQuality.find(row=>row.attemptId===fixture.attempts[0].id),body={selector:fixture.selector,attemptId:target.attemptId,attemptEpoch:target.attemptEpoch,sourceHash:target.sourceHash,expectedRevision:0,verdict:'EXCLUDE',reason:'C16 synthetic independent quality review'}
 const race=await witnessedQualityRace(fixture,body);assert.equal(race.filter(row=>row.httpStatus===409).length,1)
 const audits=await prisma.trainingAnalysisQualityAudit.findMany({where:{courseId:fixture.courseId,attemptId:target.attemptId}});assert.equal(audits.length,1);assert.equal(audits[0].revision,1)
 const review=await prisma.trainingAnalysisQuality.findFirstOrThrow({where:{courseId:fixture.courseId,attemptId:target.attemptId}})
 await assert.rejects(prisma.$transaction(async tx=>{await tx.trainingAnalysisQuality.update({where:{id:review.id},data:{revision:2,reason:'Unaudited synthetic mutation'}})}));assert.deepEqual(await prisma.trainingAnalysisQuality.findUniqueOrThrow({where:{id:review.id}}),review)
 await assert.rejects(prisma.trainingAnalysisQualityAudit.update({where:{id:audits[0].id},data:{reason:'Forbidden synthetic audit rewrite'}}));await assert.rejects(prisma.trainingAnalysisQuality.delete({where:{id:review.id}}));assert.deepEqual(await prisma.trainingAnalysisQualityAudit.findUniqueOrThrow({where:{id:audits[0].id}}),audits[0])
 await other.request(root(fixture)+'/quality','POST',body,deny);await teacher.request(root(fixture)+'/quality','POST',{...body,sourceHash:'f'.repeat(64)},deny)
 check('Real restricted-role PG rejects unaudited review revision at commit and audit rewrite/review deletion; exact review/audit unchanged; outsider and mismatched source review denied')
 await teacher.request(root(fixture)+'/exports','POST',{selector:fixture.selector,manifest:current.manifest,layout:'long',format:'csv',requestKey:randomUUID()},409)
 await processExport(pending,false);await teacher.request(zip.route,'GET',undefined,deny);await teacher.request(zip.route+'/status','GET',undefined,deny)
 check('Concurrent quality CAS permits one revision/audit and rejects stale writer409; changed quality invalidates stale registration, pending generation and READY download/status')
 for(const row of fixture.attempts.filter(row=>row.waveIndex===0).slice(1,5)){const q=allQuality.find(item=>item.attemptId===row.id);await teacher.request(root(fixture)+'/quality','POST',{...body,attemptId:q.attemptId,attemptEpoch:q.attemptEpoch,sourceHash:q.sourceHash})}
 current=await analyze(fixture);assert.equal(current.analysis.descriptives.find(row=>row.waveKey==='wave_1').missingByReason.QUALITY_EXCLUDED,5);assert.equal(current.analysis.metrics[0].validCaseN,45)
 const excluded=await exportReady(fixture,current);const qualityLong=parseCsv(excluded.bytes);assert.equal(qualityLong.rows.filter(row=>row.reason==='QUALITY_EXCLUDED').length,5);assert.ok(qualityLong.rows.filter(row=>row.reason==='QUALITY_EXCLUDED').every(row=>row.value===''&&row.originalFinalStatus==='COMPLETED'&&row.taskSatisfied==='true'))
 check('Independent quality exclusions are missing reasons, never zero scores or task failures; five excluded FINAL facts remain COMPLETED/SATISFIED and paired valid N=45')
 const permissionPending=await queue(fixture,current);await prisma.course.update({where:{id:fixture.courseId},data:{creatorId:otherId}})
 try{await processExport(permissionPending,false);await teacher.request(excluded.route,'GET',undefined,deny);await teacher.request(excluded.route+'/status','GET',undefined,deny)}finally{await prisma.course.update({where:{id:fixture.courseId},data:{creatorId:owner.id}})}
 check('Current course authority revocation blocks pending generation and READY status/download; no stale ownership reuse')
 await originalC14(owner.id)
 const missing=await createAnalysisFixture({prisma,teacherId:owner.id,passwordHash:password.passwordHash});await addParticipants(prisma,missing,10);await addParticipants(prisma,missing,15,{missingFirst:true,nonFinalSecond:true});const missingResult=await analyze(missing)
 assert.equal(missingResult.analysis.descriptives.find(row=>row.waveKey==='wave_1').missingByReason.UNANSWERED,5);assert.equal(missingResult.analysis.descriptives.find(row=>row.waveKey==='wave_2').missingByReason.NON_FINAL,5);assert.equal(missingResult.analysis.metrics[0].validCaseN,10)
 const incomparable=await createAnalysisFixture({prisma,teacherId:owner.id,passwordHash:password.passwordHash,incomparable:true});await addParticipants(prisma,incomparable,10);const incomparableResult=await analyze(incomparable);assert.equal(incomparableResult.analysis.metrics[0].state,'not_comparable');assert.equal(incomparableResult.analysis.metrics[0].reason,'NOT_COMPARABLE');assert.ok(incomparableResult.analysis.descriptives.every(row=>row.validN===10))
 check('Unanswered, non-FINAL, independent quality exclusion and not-comparable measurement remain distinct; incomparable waves retain their own valid descriptives')
 await addDuplicate(prisma,missing);const duplicate=await teacher.request(root(missing),'POST',{selector:missing.selector},409);assert.equal(duplicate.code,'AMBIGUOUS_OBSERVATION');check('Duplicate participant×wave×metric rejected409; no implicit latest-attempt pick')
 result.passed=true
}catch(error){result.errorType=error?.name;throw error}
finally{fs.writeFileSync(path.join(state,'c16-http-result.json'),JSON.stringify(result,null,2),{mode:0o600});await closeQueues(true);await prisma.$disconnect();console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,requests:result.requests.length}))}
