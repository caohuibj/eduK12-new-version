/** C11 real isolated PostgreSQL + HTTP. No production credentials or direct answer writes.
 * Run only via c11-sjt-http.py under the coordinator's measurement lock.
 * Raw-response fixture follows existing vnext-capture-fixture; runtime helpers use dist.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {compileSjtTemplate}=require(path.join(backend,'dist/modules/situational/authoring/template.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {parseCanonicalUnitResultEnvelope}=require(path.join(backend,'dist/modules/assessment-runtime/unit-result.js'))
const {deriveSituationalAssignment,assignedSituationalDefinition}=require(path.join(backend,'dist/modules/situational/situation-assignment.js'))
const {hashSituationRuntimeDefinition}=require(path.join(backend,'dist/modules/situational/situation-runtime-definition.js'))
const {situationalResponseHistoryIdentities}=require(path.join(backend,'dist/modules/situational/situation-research-capture.js'))
// Synthetic response generator, mirrored from the current vnext capture fixture.
function captureFixture(source, attemptId) {
  const definitionHash = hashSituationRuntimeDefinition(source), assignment = deriveSituationalAssignment(source, attemptId, definitionHash)
  const definition = assignedSituationalDefinition(source, assignment)
  const responses = [], events = []
  let nodeKey = definition.flow.entryNodeKey, time = 0
  while (true) {
    const node = definition.flow.nodes.find(n => n.nodeKey === nodeKey)
    if (node.nodeType === 'TERMINAL') break
    const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)
    const historyIdentity = situationalResponseHistoryIdentities(definition, responses).get(scene.sceneKey)
    events.push({ type: 'NODE_EXPOSED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    const stages = node.responseStages ?? [{ stageKey: 'unstaged', kind: 'CHOICE', channelKeys: scene.channels.map(c => c.channelKey) }]
    for (const stage of stages) {
      if (stage.kind !== 'CHOICE') events.push({ type: 'PROBE_EXPOSED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
      for (const channelKey of stage.channelKeys) {
        const channel = scene.channels.find(c => c.channelKey === channelKey)
        if (node.channelPolicies?.find(p => p.channelKey === channelKey)?.required === false) continue
        const responseValue = channel.responseType === 'SINGLE_CHOICE' ? 'A' : 80
        const response = { sceneKey: scene.sceneKey, channelKey, responseValue, historyIdentity, responseRevision: 1, ...(node.responseStages ? { stageConfirmed: true } : {}) }
        responses.push(response)
        events.push({ type: 'RESPONSE_FIRST_COMMITTED', nodeKey, channelKey, responseValue, historyIdentity, responseRevision: 1, relativeTimeMs: time++, ...(node.responseStages ? { stageKey: stage.stageKey } : {}) })
      }
      if (node.responseStages) events.push({ type: 'STAGE_CONFIRMED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
    }
    events.push({ type: 'NODE_CONFIRMED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    nodeKey = node.transition.type === 'NEXT' ? node.transition.nextNodeKey : node.transition.branches.find(b => b.optionKey === 'A').nextNodeKey
  }
  const capture = { captureVersion: 'situational-capture-v1', definitionHash, assignmentIdentity: assignment.assignmentIdentity, events }
  return { definition, definitionHash, assignment, responses, capture }
}

const bcrypt=require('bcryptjs')
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
assert.equal(process.env.NODE_ENV,'test')
assert.match(process.env.DATABASE_URL,/eduk12_runtime:.*@127\.0\.0\.1:\d+\/eduk12_recovery/)
const checks=[],requests=[],counts=[];let passed=false
const check=name=>{checks.push(name);console.log('PASS',name)}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
 const multipart=body instanceof FormData, wire=body===undefined?undefined:multipart?body:JSON.stringify(body)
 const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(25000),headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(wire===undefined?{}:{body:wire})})
 for(const c of response.headers.getSetCookie()){const pair=c.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const bytes=Buffer.from(await response.arrayBuffer());requests.push({route:route.replace(/\/public\/composite-assessments\/[^/]+\/start/,'/public/composite-assessments/[token]/start'),method,status:response.status,bytes:bytes.length})
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${route}: ${response.status} ${bytes.toString().slice(0,500)}`)
 if(raw)return bytes
 const data=JSON.parse(bytes.toString());if(response.status!==200)return data
 assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
 },async login(who,role){await this.request('/auth/csrf');await this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?who:{...who,expectedRole:role})}}}
const teacher=client(),admin=client(),student=client(),outsider=client(),otherTeacher=client()
const auth='/situational/authoring',prefix='/composite-assessments'
const template=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/teacher-demonstration.json')))
async function upload(actor,respondentType){const input={...structuredClone(template),instrumentKey:'c11-'+randomUUID(),respondentType,title:'C11 synthetic '+respondentType};const form=new FormData();form.append('file',new Blob([JSON.stringify(input)],{type:'application/json'}),'c11-synthetic.json');const d=await actor.request(auth+'/drafts','POST',form);assert.equal(d.template.respondentType,respondentType);return d}
const reviewBody=d=>({revision:d.revision,contentDigest:d.contentDigest})
async function release(d,owner=teacher){await owner.request(`${auth}/drafts/${d.id}/request-review`,'POST',reviewBody(d));await admin.request(`${auth}/drafts/${d.id}/review`,'POST',{...reviewBody(d),approve:true,note:'Independent synthetic C11 review'});return d}
async function composition(key,version='1.0.0',courseId=fixture.courses[0].id,publicMode=false){let d=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C11 synthetic course SJT',questionnaireType:'COURSE',courseIds:[courseId],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})});d=await teacher.request(`/questionnaire-products/${d.id}/items`,'POST',{revision:d.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:key,situationalInstrumentVersion:version}});assert.equal((await teacher.request(`/questionnaire-products/${d.id}/preflight`,'POST',{revision:d.revision})).ok,true);return teacher.request(`/questionnaire-products/${d.id}/publish`,'POST',{revision:d.revision})}
const embeddedRoute=(a,p=prefix)=>`${p}/attempts/${a.id}/items/${a.currentItem.id}/situational/${a.currentItem.situationalAttemptId}`
async function payload(a,d,c=student,p=prefix){const runtime=await c.request(embeddedRoute(a,p));assert.equal(runtime.attemptId,a.currentItem.situationalAttemptId);const source=compileSjtTemplate(d.template).package.definition;const capture=captureFixture(source,runtime.attemptId);return {submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responses:capture.responses,researchCapture:capture.capture}}
async function report(c,a,p=prefix){for(let i=0;i<120;i++){const r=await c.request(`${p}/attempts/${a.id}/report-status`);if(r.reportStatus?.state==='READY'){const first=await c.request(`${p}/attempts/${a.id}/report`);assert.deepEqual(await c.request(`${p}/attempts/${a.id}/report`),first);return first}await pause(250)}throw Error('C11 report timeout')}
async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),children:await prisma.situationalAttempt.count(),jobs:await prisma.compositeReportJob.count()}}
async function noWrites(name,fn,id){const before=await census(id);await fn();const after=await census(id);assert.deepEqual(after,before,name);counts.push({name,before,after});check(name)}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(row.length||cell)rows.push([...row,cell]);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function exportCheck(product,a,format){const queued=await teacher.request(`${prefix}/${product.id}/export`,'POST',{detail:'full',format});assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');for(let i=0;i<120;i++){const s=await teacher.request(url+'/status');if(s.status==='READY')break;assert.notEqual(s.status,'FAILED');if(i===119)throw Error('C11 export timeout');await pause(250)}const bytes=await teacher.request(url,'GET',undefined,200,true);const files=format==='zip'?unzip(bytes):null;const [columns,...rows]=parseCsv(files?.['data.csv']??bytes);assert.equal(rows.length,1);const row=Object.fromEntries(columns.map((k,i)=>[k,rows[0][i]]));assert.equal(row.A_attempt_id,a.id);const snapshot=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}});const canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snapshot.canonicalResultEncrypted));assert.equal(row.J001_instrument_key,canonical.core.instrumentKey);assert.equal(row.J001_result_hash,canonical.resultHash);assert.equal(row.J001_definition_hash,canonical.core.sourceDefinitionHash);assert.equal(row.J001_compiled_runtime_hash,canonical.core.compiledRuntimeHash);assert.equal(row.J001_quality_status,canonical.core.quality.status);for(const metric of canonical.core.metrics){const key=`J001_M_${metric.key.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)}_${createHash('sha256').update(metric.key).digest('hex').slice(0,16)}`;assert.ok(columns.includes(key));if(metric.value===null)assert.equal(row[key],'');else assert.equal(Number(row[key]),metric.value)}assert.ok(!columns.some(c=>c.startsWith('J001_')&&/response|answer|narrative|contribution/i.test(c)));if(files){const dict=JSON.parse(files['data_dictionary.json']);assert.deepEqual(dict.columns.map(c=>c.name),columns);assert.equal(dict.schemaVersion,createHash('sha256').update(JSON.stringify(dict.columns)).digest('hex'))}await otherTeacher.request(url,'GET',undefined,404);check(`Original export queue ${format}: exact canonical identities/metrics, no raw responses, owner-only download`)}
try{
 await teacher.login(fixture.teacher,'TEACHER');await admin.login(fixture.admin,'ADMIN');await student.login(fixture.student,'STUDENT')
 for(const [c,role] of [[outsider,'STUDENT'],[otherTeacher,'TEACHER']]){const password='C11SyntheticOnly2026',u=await prisma.user.create({data:{username:'c11-'+randomUUID(),passwordHash:await bcrypt.hash(password,10),role,teacherApproved:true,mustChangePassword:false}});await c.login({username:u.username,password},role)}
 const ownAdmin=await upload(admin,'student_self_report');await admin.request(`${auth}/drafts/${ownAdmin.id}/request-review`,'POST',reviewBody(ownAdmin));await admin.request(`${auth}/drafts/${ownAdmin.id}/review`,'POST',{...reviewBody(ownAdmin),approve:true,note:'Self review must fail'},403);assert.equal(await prisma.sjtAuthorRelease.count({where:{sourceDraftId:ownAdmin.id}}),0)
 const d=await upload(teacher,'student_self_report');await otherTeacher.request(`${auth}/drafts/${d.id}`,'GET',undefined,403);await release(d)
 const catalog=await teacher.request('/questionnaire-products/resources');assert.ok(catalog.situational.some(x=>x.instrumentKey===d.template.instrumentKey));check('Formal upload and separate-admin publication; admin self-review and nonowner access rejected')
 const wrong=await release(await upload(teacher,'teacher_self_report'))
 assert.ok(!(await teacher.request('/questionnaire-products/resources')).situational.some(x=>x.instrumentKey===wrong.template.instrumentKey))
 const wrongDraft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C11 wrong respondent',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
 await noWrites('teacher_self_report rejected by course authoring without attempt writes',async()=>{await teacher.request(`/questionnaire-products/${wrongDraft.id}/items`,'POST',{revision:wrongDraft.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:wrong.template.instrumentKey,situationalInstrumentVersion:'1.0.0'}},400)})
 await admin.request(`${auth}/drafts/${wrong.id}/retire`,'POST',{note:'C11 HTTP retirement of wrong-respondent fixture'});assert.equal((await prisma.sjtAuthorRelease.findUniqueOrThrow({where:{sourceDraftId:wrong.id}})).status,'RETIRED')
 const product=await composition(d.template.instrumentKey),crossCourse=await composition(d.template.instrumentKey,'1.0.0',fixture.courses[1].id)
 await noWrites('Nonmember and cross-course student admission rejected without parent/child/job writes',async()=>{await outsider.request(`${prefix}/${product.id}/attempts`,'POST',{},[403,404]);await student.request(`${prefix}/${crossCourse.id}/attempts`,'POST',{},[403,404])})
 const {attempt:a}=await student.request(`${prefix}/${product.id}/attempts`,'POST',{})
 assert.equal(a.currentItem.type,'SITUATIONAL');assert.equal((await student.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt.id,a.id)
 assert.equal((await student.request(`${prefix}/attempts/${a.id}`)).currentItem.situationalAttemptId,a.currentItem.situationalAttemptId)
 const final=await payload(a,d)
 await noWrites('Nonowner embedded read/FINAL denied without writes',async()=>{await outsider.request(embeddedRoute(a),'GET',undefined,[403,404]);await outsider.request(embeddedRoute(a)+'/submit','POST',final,[403,404])})
 await student.request(embeddedRoute(a)+'/submit','POST',final);const replay=await student.request(embeddedRoute(a)+'/submit','POST',final);assert.equal(replay.replayed,true)
 assert.equal(await prisma.situationalRawSubmission.count({where:{attemptId:a.currentItem.situationalAttemptId}}),1)
 assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}}),1)
 const original=await report(student,a);await teacher.request(`${prefix}/${product.id}/attempts/${a.id}/report`);await outsider.request(`${prefix}/attempts/${a.id}/report`,'GET',undefined,[403,404]);check('Member start/resume, frozen FINAL/replay, one raw and canonical fact, parent and teacher report')
 await exportCheck(product,a,'csv');await exportCheck(product,a,'zip')
 const accepted=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}})
 const acceptedResult=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(accepted.canonicalResultEncrypted))
 assert.equal(acceptedResult.core.metrics.find(m=>m.key==='E')?.value,3,'unchanged uploaded demo all-A scoring oracle')
 const uploadedPublic=await composition(d.template.instrumentKey,'1.0.0',fixture.courses[0].id,true),publicStudent=client();await publicStudent.request('/auth/csrf')
 const uploadedToken=await teacher.request(`${prefix}/${uploadedPublic.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:2})
 const uploadedStarted=await publicStudent.request(`/public/composite-assessments/${uploadedToken.token}/start`,'POST',{});publicStudent.recovery=uploadedStarted.recoveryToken
 const uploadedAttempt=uploadedStarted.attempt,uploadedFinal=await payload(uploadedAttempt,d,publicStudent,'/public/composite-assessments')
 await publicStudent.request(embeddedRoute(uploadedAttempt,'/public/composite-assessments')+'/submit','POST',uploadedFinal)
 assert.equal((await publicStudent.request(embeddedRoute(uploadedAttempt,'/public/composite-assessments')+'/submit','POST',uploadedFinal)).replayed,true)
 await report(publicStudent,uploadedAttempt,'/public/composite-assessments');check('Uploaded student SJT anonymous FINAL/replay/public report and unchanged E=3 oracle')

 // Lock the actual release row before HTTP first admission. Holding a real row
 // update (rather than sleeps alone) proves the admission reads under PG locking.
 const raceProduct=await composition(d.template.instrumentKey),pendingProduct=await composition(d.template.instrumentKey)
 const {attempt:pending}=await student.request(`${prefix}/${pendingProduct.id}/attempts`,'POST',{})
 const before=await census(raceProduct.id);let unlock,ready;const gate=new Promise(r=>{unlock=r}),locked=new Promise(r=>{ready=r})
 const retirement=prisma.$transaction(async tx=>{await tx.sjtAuthorRelease.update({where:{sourceDraftId:d.id},data:{status:'RETIRED'}});ready();await gate},{timeout:20000})
 await locked
 const starting=student.request(`${prefix}/${raceProduct.id}/attempts`,'POST',{},404).then(value=>({value}),error=>({error}))
 let blocked=false
 try{const deadline=Date.now()+12000;while(!blocked&&Date.now()<deadline){const rows=await prisma.$queryRawUnsafe("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%sjt_author_releases%' AND query LIKE '%FOR SHARE%') AS blocked");blocked=rows[0]?.blocked===true;if(!blocked)await pause(25)}}finally{unlock();await retirement}
 const outcome=await starting;if(outcome.error)throw outcome.error;assert.equal(blocked,true,'admission must visibly wait on release lock');assert.deepEqual(await census(raceProduct.id),before);counts.push({name:'retire versus first embedded admission',before,after:await census(raceProduct.id),blocked})
 assert.equal((await student.request(`${prefix}/attempts/${pending.id}`)).currentItem.situationalAttemptId,pending.currentItem.situationalAttemptId)
 await student.request(embeddedRoute(pending)+'/submit','POST',await payload(pending,d));await report(student,pending)
 assert.deepEqual(await report(student,a),original);await admin.request(`${auth}/drafts/${d.id}/retire`,'POST',{note:'Already retired race release'},404)
 check('Real retirement lock blocks first embedded admission; rollback leaves no parent/child/job; admitted frozen attempt and completed report survive retirement')
 // Existing builtin anonymous package remains supported with its own golden raw
 // responses. Public recovery credentials never enter persisted result logs.
 const builtin=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/instruments/sjt-assertiveness-golden/1.0.0/instrument.json')))
 const publicProduct=await composition(builtin.identity.instrumentKey,builtin.identity.instrumentVersion,fixture.courses[0].id,true),anon=client();await anon.request('/auth/csrf')
 const token=await teacher.request(`${prefix}/${publicProduct.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:2})
 const publicPrefix='/public/composite-assessments',started=await anon.request(`${publicPrefix}/${token.token}/start`,'POST',{});anon.recovery=started.recoveryToken;const pa=started.attempt
 assert.equal((await anon.request(`${publicPrefix}/${token.token}/start`,'POST',{recoveryToken:anon.recovery})).attempt.id,pa.id)
 const runtime=await anon.request(embeddedRoute(pa,publicPrefix)),body={submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responses:builtin.goldenCases[0].responses}
 await anon.request(embeddedRoute(pa,publicPrefix)+'/submit','POST',body);assert.equal((await anon.request(embeddedRoute(pa,publicPrefix)+'/submit','POST',body)).replayed,true);await report(anon,pa,publicPrefix)
 const uncredentialed=client();await uncredentialed.request(`${publicPrefix}/attempts/${pa.id}/report`,'GET',undefined,[400,401,403,404]);check('Builtin anonymous start/recovery/FINAL/replay/public report and missing-recovery denial remain valid')
 passed=true
}catch(error){console.error(error);throw error}finally{await prisma.$disconnect();fs.writeFileSync(path.join(state,'c11-http-result.json'),JSON.stringify({passed,checks,requests,counts},null,2))}
process.exit(0)
