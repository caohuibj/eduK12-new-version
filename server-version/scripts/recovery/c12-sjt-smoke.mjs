/** C12 real isolated PostgreSQL + HTTP. No production credentials or direct answer writes.
 * Run only via c12-sjt-http.py under the coordinator's measurement lock.
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
const {compileSjtOnlineDocument}=require(path.join(backend,'dist/modules/situational/authoring/online.js'))
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
const checks=[],requests=[],counts=[],diagnostics=[];let passed=false
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
const onlineFixture=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/online-hand-calculated.json')))
async function upload(actor,respondentType='student_self_report',transform=x=>x){const input=transform({...structuredClone(onlineFixture),instrumentKey:'c12-'+randomUUID()});input.display.respondentType=respondentType;return actor.request(auth+'/online/drafts','POST',{template:input})}
const reviewBody=d=>({revision:d.revision,contentDigest:d.contentDigest})
async function release(d,owner=teacher){await owner.request(`${auth}/drafts/${d.id}/request-review`,'POST',reviewBody(d));await admin.request(`${auth}/drafts/${d.id}/review`,'POST',{...reviewBody(d),approve:true,note:'Independent synthetic C12 review'});return d}
async function composition(key,version='1.0.0',courseId=fixture.courses[0].id,publicMode=false){let d=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C12 synthetic course SJT',questionnaireType:'COURSE',courseIds:[courseId],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})});d=await teacher.request(`/questionnaire-products/${d.id}/items`,'POST',{revision:d.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:key,situationalInstrumentVersion:version}});assert.equal((await teacher.request(`/questionnaire-products/${d.id}/preflight`,'POST',{revision:d.revision})).ok,true);return teacher.request(`/questionnaire-products/${d.id}/publish`,'POST',{revision:d.revision})}
const embeddedRoute=(a,p=prefix)=>`${p}/attempts/${a.id}/items/${a.currentItem.id}/situational/${a.currentItem.situationalAttemptId}`
async function payload(a,d,c=student,p=prefix,responses=d.template.goldenCases[0].responses){const runtime=await c.request(embeddedRoute(a,p));assert.equal(runtime.attemptId,a.currentItem.situationalAttemptId);assert.equal(runtime.instrument.online.responseProtocol,'sjt-online-response-v1');assert.ok(!JSON.stringify(runtime.instrument.online).includes('contributions'));assert.ok(!JSON.stringify(runtime.instrument.online).includes('expertKey'));return {submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses}}
async function report(c,a,p=prefix){for(let i=0;i<120;i++){const r=await c.request(`${p}/attempts/${a.id}/report-status`);if(r.reportStatus?.state==='READY'){const first=await c.request(`${p}/attempts/${a.id}/report`);assert.deepEqual(await c.request(`${p}/attempts/${a.id}/report`),first);return first}await pause(250)}throw Error('C12 report timeout')}
async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),children:await prisma.situationalAttempt.count(),jobs:await prisma.compositeReportJob.count()}}
async function noWrites(name,fn,id){const before=await census(id);await fn();const after=await census(id);assert.deepEqual(after,before,name);counts.push({name,before,after});check(name)}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(row.length||cell)rows.push([...row,cell]);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function exportCheck(product,a,format){const queued=await teacher.request(`${prefix}/${product.id}/export`,'POST',{detail:'full',format});assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');for(let i=0;i<120;i++){const s=await teacher.request(url+'/status');if(s.status==='READY')break;assert.notEqual(s.status,'FAILED');if(i===119)throw Error('C12 export timeout');await pause(250)}const bytes=await teacher.request(url,'GET',undefined,200,true);const files=format==='zip'?unzip(bytes):null;const [columns,...rows]=parseCsv(files?.['data.csv']??bytes);assert.equal(rows.length,1);const row=Object.fromEntries(columns.map((k,i)=>[k,rows[0][i]]));assert.equal(row.A_attempt_id,a.id);const snapshot=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}});const canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snapshot.canonicalResultEncrypted));assert.equal(row.J001_instrument_key,canonical.core.instrumentKey);assert.equal(row.J001_result_hash,canonical.resultHash);assert.equal(row.J001_definition_hash,canonical.core.sourceDefinitionHash);assert.equal(row.J001_compiled_runtime_hash,canonical.core.compiledRuntimeHash);assert.equal(row.J001_quality_status,canonical.core.quality.status);for(const metric of canonical.core.metrics){const key=`J001_M_${metric.key.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)}_${createHash('sha256').update(metric.key).digest('hex').slice(0,16)}`;assert.ok(columns.includes(key));if(metric.value===null)assert.equal(row[key],'');else assert.equal(Number(row[key]),metric.value)}assert.ok(!columns.some(c=>c.startsWith('J001_')&&/response|answer|narrative|contribution/i.test(c)));if(files){const dict=JSON.parse(files['data_dictionary.json']);assert.deepEqual(dict.columns.map(c=>c.name),columns);assert.equal(dict.schemaVersion,createHash('sha256').update(JSON.stringify(dict.columns)).digest('hex'))}await otherTeacher.request(url,'GET',undefined,404);check(`Original export queue ${format}: exact canonical identities/metrics, no raw responses, owner-only download`)}
try{
 await teacher.login(fixture.teacher,'TEACHER');await admin.login(fixture.admin,'ADMIN');await student.login(fixture.student,'STUDENT')
 for(const [c,role] of [[outsider,'STUDENT'],[otherTeacher,'TEACHER']]){const password='C12SyntheticOnly2026',u=await prisma.user.create({data:{username:'c12-'+randomUUID(),passwordHash:await bcrypt.hash(password,10),role,teacherApproved:true,mustChangePassword:false}});await c.login({username:u.username,password},role)}
 const emptyGolden=await upload(teacher,'student_self_report',t=>({...t,goldenCases:[]}));await teacher.request(`${auth}/drafts/${emptyGolden.id}/request-review`,'POST',reviewBody(emptyGolden),422)
 const bad=structuredClone(onlineFixture);bad.instrumentKey='c12-'+randomUUID();bad.goldenCases[0].expected.cooperation=999;await teacher.request(auth+'/online/drafts','POST',{template:bad},422)
 const ownAdmin=await upload(admin);await admin.request(`${auth}/drafts/${ownAdmin.id}/request-review`,'POST',reviewBody(ownAdmin));await admin.request(`${auth}/drafts/${ownAdmin.id}/review`,'POST',{...reviewBody(ownAdmin),approve:true,note:'Self review must fail'},403)
 let d=await upload(teacher);await otherTeacher.request(`${auth}/drafts/${d.id}`,'GET',undefined,403)
 const old=d;d=await teacher.request(`${auth}/drafts/${d.id}`,'PUT',{revision:d.revision,template:d.template});assert.equal(d.revision,old.revision+1)
 await teacher.request(`${auth}/drafts/${d.id}`,'PUT',{revision:old.revision,template:d.template},409)
 await teacher.request(`${auth}/drafts/${d.id}/request-review`,'POST',{...reviewBody(d),contentDigest:'f'.repeat(64)},409)
 await release(d);await teacher.request(`${auth}/drafts/${d.id}`,'PUT',{revision:d.revision,template:d.template},409)
 const catalog=await teacher.request('/questionnaire-products/resources');assert.ok(catalog.situational.some(x=>x.instrumentKey===d.template.instrumentKey));check('Online create/CAS/digest, independent review, immutable release; wrong and empty manual golden/self-review/nonowner rejected')
 const product=await composition(d.template.instrumentKey),crossCourse=await composition(d.template.instrumentKey,'1.0.0',fixture.courses[1].id)
 await noWrites('Nonmember and cross-course admission rejected',async()=>{await outsider.request(`${prefix}/${product.id}/attempts`,'POST',{},[403,404]);await student.request(`${prefix}/${crossCourse.id}/attempts`,'POST',{},[403,404])})
 const {attempt:a}=await student.request(`${prefix}/${product.id}/attempts`,'POST',{})
 assert.equal((await student.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt.id,a.id)
 assert.equal((await student.request(`${prefix}/attempts/${a.id}`)).currentItem.situationalAttemptId,a.currentItem.situationalAttemptId)
 const final=await payload(a,d)
 await noWrites('Nonowner read and FINAL denied',async()=>{await outsider.request(embeddedRoute(a),'GET',undefined,[403,404]);await outsider.request(embeddedRoute(a)+'/submit','POST',final,[403,404])})
 for(const mutate of [x=>{x.responses[0].responseValue=['a','a']},x=>{x.responses[0].responseValue=['unknown']},x=>{x.responses[0].status='REFUSED';x.responses[0].responseValue=['a']},x=>{delete x.responseProtocol}]){const bad=structuredClone(final);mutate(bad);await student.request(embeddedRoute(a)+'/submit','POST',bad,[400,409,422])}
 await student.request(embeddedRoute(a)+'/submit','POST',final);assert.equal((await student.request(embeddedRoute(a)+'/submit','POST',final)).replayed,true)
 assert.equal(await prisma.situationalRawSubmission.count({where:{attemptId:a.currentItem.situationalAttemptId}}),1)
 const rawRecord=await prisma.situationalRawSubmission.findUniqueOrThrow({where:{attemptId:a.currentItem.situationalAttemptId}}),rawPayload=decryptUnifiedRuntimePayload(rawRecord.payloadEncrypted);assert.equal(rawRecord.payloadSchemaVersion,2);assert.equal(rawRecord.encodingVersion,'situational-raw-submit-v2');assert.deepEqual(rawPayload.rawResponses,final.responses);assert.equal(rawRecord.responseCount,final.responses.length)
 assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}}),1)
 await report(student,a);await teacher.request(`${prefix}/${product.id}/attempts/${a.id}/report`);await outsider.request(`${prefix}/attempts/${a.id}/report`,'GET',undefined,[403,404])
 const accepted=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}}),canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(accepted.canonicalResultEncrypted))
 assert.equal(canonical.core.metrics.find(m=>m.key==='cooperation')?.value,9);const storedAttempt=await prisma.situationalAttempt.findUniqueOrThrow({where:{id:a.currentItem.situationalAttemptId}});assert.equal(decryptUnifiedRuntimePayload(storedAttempt.resultEncrypted).metrics.find(m=>m.key==='cooperation')?.coverage?.numberOfIndependentScenes,2)
 check('Two scenes/three questions real multiselect SUM+MEAN, raw FINAL/replay, common scorer yields manual 9 and two independent scenes')
 await exportCheck(product,a,'csv');await exportCheck(product,a,'zip')
 // Each new case has its own authorized product/attempt, no direct raw writes.
 for(const [name,responses] of [['empty',[]],['refused',d.template.goldenCases[7].responses],['partial',[d.template.goldenCases[0].responses[1]]]]){
  const p=await composition(d.template.instrumentKey),{attempt:x}=await student.request(`${prefix}/${p.id}/attempts`,'POST',{}),body=await payload(x,d,student,prefix,responses)
  await student.request(embeddedRoute(x)+'/submit','POST',body);assert.equal((await student.request(embeddedRoute(x)+'/submit','POST',body)).replayed,true);await report(student,x)
  const snap=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:x.id,unitType:'SITUATIONAL'}}),result=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snap.canonicalResultEncrypted));assert.equal(result.core.metrics[0].value,null);assert.equal(result.core.quality.flags.includes('sjt_online_task_not_satisfied'),name!=='partial');const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.id}});assert.equal(parent.taskSatisfaction,name==='partial'?'SATISFIED':'NOT_SATISFIED')
  check(`New ${name} FINAL null score with independently correct persisted task qualification`)
 }
 const required=await upload(teacher,'student_self_report',t=>{t.display.scenes[0].questions[1].required=true;t.goldenCases[6].responses=[{sceneKey:'sjt_q_second',channelKey:'second',status:'ANSWERED',responseValue:'a'}];return t});await release(required)
 const rp=await composition(required.template.instrumentKey),{attempt:ra}=await student.request(`${prefix}/${rp.id}/attempts`,'POST',{});await student.request(embeddedRoute(ra)+'/submit','POST',await payload(ra,required,student,prefix,[]),[400,409,422]);check('Required blank rejected on explicit new protocol')
 const builtin=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/instruments/sjt-assertiveness-golden/1.0.0/instrument.json'))),lp=await composition(builtin.identity.instrumentKey,builtin.identity.instrumentVersion),{attempt:la}=await student.request(`${prefix}/${lp.id}/attempts`,'POST',{}),lr=await student.request(embeddedRoute(la)),lb={submissionId:randomUUID(),attemptEpoch:lr.attempt.attemptEpoch,definitionHash:lr.attempt.definitionHash,compiledRuntimeHash:lr.attempt.compiledRuntimeHash,scoringVersion:lr.attempt.scoringVersion,responses:[]}
 await student.request(embeddedRoute(la)+'/submit','POST',lb,[400,409,422]);await student.request(embeddedRoute(la)+'/submit','POST',{...lb,responseProtocol:'sjt-online-response-v1'},[400,409,422]);assert.equal(await prisma.situationalRawSubmission.count({where:{attemptId:la.currentItem.situationalAttemptId}}),0);check('Old empty FINAL and client-driven protocol upgrade rejected without raw writes')
 const standalone=await student.request('/situational/attempts','POST',{instrumentKey:d.template.instrumentKey,instrumentVersion:'1.0.0'}),sb={submissionId:randomUUID(),attemptEpoch:standalone.attempt.attemptEpoch,definitionHash:standalone.attempt.definitionHash,compiledRuntimeHash:standalone.attempt.compiledRuntimeHash,scoringVersion:standalone.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:[]}
 await student.request(`/situational/attempts/${standalone.attemptId}/submit`,'POST',sb)
 const inbox=await student.request('/my-assessments');assert.equal(inbox.list.find(x=>x.sourceId===standalone.attemptId)?.state,'SUBMITTED_NOT_SATISFIED')
 const blob=await prisma.situationalAttempt.findUniqueOrThrow({where:{id:standalone.attemptId},select:{canonicalResultEncrypted:true}});diagnostics.push({name:'single online standalone inbox qualification',onlineResultRows:1,encryptedCanonicalBytes:Buffer.byteLength(blob.canonicalResultEncrypted),plaintextCanonicalBytes:Buffer.byteLength(JSON.stringify(decryptUnifiedRuntimePayload(blob.canonicalResultEncrypted))),httpResponseBytes:requests.at(-1).bytes,note:'diagnostic only; not throughput or memory qualification'})
 check('Standalone new empty FINAL projects unsatisfied inbox; record actual canonical and response bytes')
 passed=true
}catch(error){console.error(error);throw error}finally{await prisma.$disconnect();fs.writeFileSync(path.join(state,'c12-http-result.json'),JSON.stringify({passed,checks,requests,counts,diagnostics},null,2))}
process.exit(0)
