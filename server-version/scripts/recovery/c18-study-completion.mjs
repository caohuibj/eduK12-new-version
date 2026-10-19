/** Targeted C18 continuation: only the two missing scenario groups.
 * Original eight groups and their failed fixture evidence are never replayed. */
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
const result={passed:false,qualificationScope:'C18_TARGETED_COMPLETION_TWO_GROUPS',checks:[],requests:[],measurements:[],exports:[]}
const sha=value=>createHash('sha256').update(value).digest('hex'),check=text=>{result.checks.push(text);console.log('PASS',text)}
const deny=[400,403,404,409,422]
function client(credential=''){const cookies=new Map();return {async request(route,method='GET',body,expected=200,raw=false){
 const start=performance.now(),response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
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
 const prior=JSON.parse(fs.readFileSync(path.join(state,'source-c18-http-result.json')))
 assert.equal(prior.passed,false);assert.equal(prior.checks.length,8);assert.equal(prior.requests.length,198)
 assert.ok(prior.error.message.includes('公开链接有效期必须在未来一年内'))
 const saved=JSON.parse(fs.readFileSync(path.join(state,'c18-fixture-private.json')))
 ;({fixture,education,version,otherStudy}=saved)
 await teacher.login(credentials.teacher);actor=await prisma.user.findUniqueOrThrow({where:{id:saved.actorId}})
 assert.equal(actor.username,credentials.teacher.username)
 result.priorHttpEvidenceSha256=sha(fs.readFileSync(path.join(state,'source-c18-http-result.json')))
 result.reusedScenarioGroups=8;result.newScenarioGroups=2
 // Only the missing publication-first lock ordering; the earlier acceptance-first
 // observation remains in the original evidence and is not rerun.
 const currentVersion=(await teacher.request(ownerRoot(fixture.studyId)+'/research-consent')).version
 const reverseTarget=fixture.participants[51],reverseBefore=await own(reverseTarget).request(publicRoot(fixture.studyId)+'/research-consent')
 assert.equal(reverseBefore.state,'UNKNOWN')
 const reverseGate=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});let reverseReady,reverseRelease,publishing,accepting
 const reverseArrived=new Promise(r=>reverseReady=r),reverseHeld=new Promise(r=>reverseRelease=r)
 const reverseTx=reverseGate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM anonymous_studies WHERE id=$1 FOR UPDATE',fixture.studyId);reverseReady();await reverseHeld},{timeout:15000})
 const awaitWaiters=async target=>{let observed=0;const until=performance.now()+5000;while(performance.now()<until){observed=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%anonymous_studies%FOR UPDATE%'"))[0].n;if(observed===target)return observed;await new Promise(r=>setTimeout(r,20))}assert.equal(observed,target)}
 try{
  await reverseArrived
  publishing=teacher.request(ownerRoot(fixture.studyId)+'/research-consent','POST',{requestId:randomUUID(),expectedVersionId:currentVersion.id,body:text+' Publication-first correction.',scope})
  const first=await awaitWaiters(1)
  accepting=own(reverseTarget).request(publicRoot(fixture.studyId)+'/research-consent/accept','POST',{requestId:randomUUID(),versionId:currentVersion.id,bodyHash:currentVersion.bodyHash},409)
  const both=await awaitWaiters(2);reverseRelease();await reverseTx
  await publishing;const rejected=await accepting;assert.equal(rejected.httpStatus,409)
  const after=await own(reverseTarget).request(publicRoot(fixture.studyId)+'/research-consent');assert.equal(after.state,'UNKNOWN');assert.equal(after.acceptance,null)
  result.reverseVersionRace={queuedPublicationBeforeAcceptance:true,firstObservedWaiters:first,totalObservedWaiters:both,publishStatus:200,acceptStatus:409,acceptanceUnchanged:true}
 }finally{reverseRelease?.();await reverseTx.catch(()=>{});await Promise.allSettled([publishing,accepting].filter(Boolean));await reverseGate.$disconnect()}
 // A separate real public Form path proves governance does not replace runtime.
 const realCourse=await prisma.course.create({data:{creatorId:actor.id,title:'C18 real public education path',courseCode:'C18-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 const task=await prisma.compositeAssessment.create({data:{code:'C18-'+randomUUID(),name:'C18 real form',status:'DRAFT',courseId:realCourse.id,createdBy:actor.id,publicEnabled:true,expiresAt:new Date(Date.now()+86400000)}})
 const item=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:task.id,type:'FORM',position:0,required:true,formType:'text_input',formLabel:'C18 ordinary educational answer'}})
 await ensureCompositeFormSections(task.id);await composite.publishComposite(actor.id,'TEACHER',task.id)
 const realStudy=(await teacher.request('/anonymous-studies','POST',{title:'C18 real participation'})).id,realWaves=[]
 for(const title of ['one','two']){const wave=await teacher.request(ownerRoot(realStudy)+'/waves/create-with-link','POST',{requestId:randomUUID(),compositeId:task.id,title,expiresAt:new Date(Date.now()+43200000).toISOString(),maxUses:0});const token=await composite.revealAccessToken(actor.id,'TEACHER',task.id,wave.tokenId);realWaves.push({...wave,token:token.token})}
 const joined=await client().request(`/public/anonymous-studies/waves/${realWaves[0].id}/join`,'POST',{token:realWaves[0].token,consent:true}),real=client(joined.credential)
 assert.equal((await real.request(publicRoot(realStudy)+'/research-consent')).state,'UNKNOWN')
 const realV=await teacher.request(ownerRoot(realStudy)+'/research-consent','POST',{requestId:randomUUID(),expectedVersionId:null,body:text,scope:{...scope,dataCategories:['FORM']}})
 await real.request(publicRoot(realStudy)+'/research-consent/accept','POST',{requestId:randomUUID(),versionId:realV.id,bodyHash:realV.bodyHash})
 const one=await real.request(publicRoot(realStudy)+`/waves/${realWaves[0].id}/start`,'POST',{}),attempt=await composite.getAttemptState(one.attemptId,{recoveryTokenHash:hashRecoveryToken(one.recoveryToken)})
 await submitCompositeFormSectionFinal({attemptId:one.attemptId,sectionId:attempt.formSections[0].id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:attempt.formSections[0].definitionHash,contextSnapshotHash:null,answers:[{formItemId:item.id,value:'C18 accepted education response'}],recoveryTokenHash:hashRecoveryToken(one.recoveryToken)})
 const guest=await client().request('/public/composite-assessments/'+realWaves[0].token+'/start','POST',{})
 assert.ok(guest.attempt.id);assert.equal((await prisma.$queryRaw`SELECT attempt_id FROM anonymous_study_attempts WHERE attempt_id=${guest.attempt.id}`).length,0)
 assert.equal((await teacher.request(ownerRoot(realStudy)+'/statistics')).list[0].researchUnknownParticipants,1)
 const beforeWithdrawal=JSON.stringify(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:one.attemptId}}))
 const startRace=await waitersRace(realStudy,[()=>real.request(publicRoot(realStudy)+'/research-withdrawal','POST',{requestId:randomUUID(),expectedRevision:1}),()=>real.request(publicRoot(realStudy)+`/waves/${realWaves[1].id}/start`,'POST',{})])
 assert.ok(startRace.outcomes.every(r=>!r.httpStatus));result.startWithdrawalRace={actualPgWaiters:startRace.observedWaiters,withdrawalState:startRace.outcomes[0].state,educationStartState:startRace.outcomes[1].state}
 assert.equal(JSON.stringify(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:one.attemptId}})),beforeWithdrawal)
 const recovery=await real.request(publicRoot(realStudy)+`/waves/${realWaves[0].id}/recover`,'POST',{});assert.equal(recovery.state,'COMPLETED');assert.equal(recovery.recoveryToken,one.recoveryToken)
 const links=await prisma.$queryRaw`SELECT participant_id FROM anonymous_study_attempts WHERE study_id=${realStudy}`;assert.equal(links.length,2);assert.equal(new Set(links.map(r=>r.participant_id)).size,1)
 const csv=await teacher.request(ownerRoot(realStudy)+`/waves/${realWaves[0].id}/export.csv`,'GET',undefined,200,true);assert.ok(csv.toString().includes('C18 accepted education response'))
 await real.request(publicRoot(realStudy)+'/revoke','POST',{})
 for(const [route,method,body]of [[publicRoot(realStudy),'GET'],[publicRoot(realStudy)+'/research-consent','GET'],[publicRoot(realStudy)+'/research-withdrawal','POST',{requestId:randomUUID(),expectedRevision:2}]])await real.request(route,method,body,404)
 await assert.rejects(composite.getAttemptState(one.attemptId,{recoveryTokenHash:hashRecoveryToken(one.recoveryToken)}),e=>e.statusCode===403)
 assert.equal((await teacher.request(ownerRoot(realStudy)+'/statistics')).list[0].completedAttempts,1)
 check('Real old bool join stays research UNKNOWN; explicit consent and two original starts share identity; concurrent withdraw/start both preserve education; completed FINAL/recovery/education CSV survive withdrawal, separate revoke invalidates all capabilities without deleting completion')
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
finally{fs.writeFileSync(path.join(state,'c18-completion-result.json'),JSON.stringify(result,null,2));await closeQueues();await prisma.$disconnect();console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,requests:result.requests.length}))}
