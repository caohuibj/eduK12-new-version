/** C13 affected-only real PostgreSQL/HTTP qualification. Never writes answers directly.
 * Run via c13-sjt-http.py under the shared measurement lock; not the C12 suite.
 * All actors/data are synthetic, database is loopback + restricted runtime role.
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
const {PrismaClient}=require('@prisma/client')
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {parseCanonicalUnitResultEnvelope}=require(path.join(backend,'dist/modules/assessment-runtime/unit-result.js'))
const bcrypt=require('bcryptjs')
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
assert.equal(process.env.NODE_ENV,'test')
assert.match(process.env.DATABASE_URL,/eduk12_runtime:.*@127\.0\.0\.1:\d+\/eduk12_recovery/)
const checks=[],requests=[],counts=[],races=[],receipts=[];let passed=false,teacherId,outsiderId
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
const teacher=client(),admin=client(),student=client(),outsider=client(),otherTeacher=client(),author=client(),newStudent=client()
const auth='/situational/authoring',prefix='/composite-assessments',products='/questionnaire-products'
const onlineFixture=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/online-hand-calculated.json')))
const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=','base64')
const denied=[400,403,404,409,422]
const exact=r=>({instrumentKey:r.instrumentKey,instrumentVersion:r.instrumentVersion,definitionHash:r.definitionHash,contentDigest:r.contentDigest})
const reviewBody=d=>({revision:d.revision,contentDigest:d.contentDigest})
const embeddedRoute=(a,p=prefix)=>`${p}/attempts/${a.id}/items/${a.currentItem.id}/situational/${a.currentItem.situationalAttemptId}`
async function upload(actor,bytes=imageBytes,mime='image/png',expected=200){const f=new FormData();f.append('image',new Blob([bytes],{type:mime}),'synthetic.png');return actor.request(auth+'/media/images','POST',f,expected)}
async function online(actor=author,asset,policy='COURSE_GRANT_V1'){
 const template={...structuredClone(onlineFixture),instrumentKey:'c13-'+randomUUID()}
 if(asset)template.display.scenes[0].image={asset,altText:'Synthetic single-pixel stimulus',rightsStatus:'self_authored',rightsNote:'Generated solely for this isolated qualification'}
 return actor.request(auth+'/online/drafts','POST',{template,authorizationPolicy:policy})
}
async function release(d,owner=author){await owner.request(`${auth}/drafts/${d.id}/request-review`,'POST',reviewBody(d));await admin.request(`${auth}/drafts/${d.id}/review`,'POST',{...reviewBody(d),approve:true,note:'Independent synthetic C13 review'});return owner.request(`${auth}/drafts/${d.id}`)}
async function grant(r,changes={}){return admin.request(`${auth}/releases/${r.id}/grants`,'POST',{...exact(r),granteeTeacherId:teacherId,courseId:fixture.courses[0].id,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),note:'Synthetic C13 exact grant',...changes})}
const revoke=g=>admin.request(`${auth}/grants/${g.id}/revoke`,'POST',{version:g.version,note:'Synthetic C13 revocation'})
async function productDraft(r,{courseIds=[fixture.courses[0].id],publicEnabled=false,actor=teacher}={}){
 let d=await actor.request(products,'POST',{requestId:randomUUID(),name:'C13 synthetic SJT delivery',questionnaireType:'COURSE',courseIds,publicEnabled,...(publicEnabled?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})})
 d=await actor.request(`${products}/${d.id}/items`,'POST',{revision:d.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:r.instrumentKey,situationalInstrumentVersion:r.instrumentVersion}});return d
}
async function publish(d){assert.equal((await teacher.request(`${products}/${d.id}/preflight`,'POST',{revision:d.revision})).ok,true);return teacher.request(`${products}/${d.id}/publish`,'POST',{revision:d.revision})}
const composition=async(r,options)=>publish(await productDraft(r,options))
async function rejectComposition(name,r,{courseIds=[fixture.courses[0].id],publicEnabled=false,questionnaireType='COURSE'}={}){
 const d=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C13 rejected '+name,questionnaireType,courseIds,publicEnabled,...(publicEnabled?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})})
 const item=await teacher.request(`${products}/${d.id}/items`,'POST',{revision:d.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:r.instrumentKey,situationalInstrumentVersion:r.instrumentVersion}},[200,...denied])
 if(item.id)await teacher.request(`${products}/${d.id}/publish`,'POST',{revision:item.revision},denied)
 assert.equal((await prisma.compositeAssessment.findUniqueOrThrow({where:{id:d.id}})).status,'DRAFT');check(name)
}
async function payload(a,d,c=student,p=prefix){const runtime=await c.request(embeddedRoute(a,p));assert.equal(runtime.instrument.online.responseProtocol,'sjt-online-response-v1');assert.ok(!JSON.stringify(runtime.instrument.online).includes('contributions'));assert.ok(!JSON.stringify(runtime.instrument.online).includes('expertKey'));return {submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:d.template.goldenCases[0].responses}}
async function report(c,a,p=prefix){for(let i=0;i<120;i++){const r=await c.request(`${p}/attempts/${a.id}/report-status`);if(r.reportStatus?.state==='READY'){const first=await c.request(`${p}/attempts/${a.id}/report`);assert.deepEqual(await c.request(`${p}/attempts/${a.id}/report`),first);return first}await pause(250)}throw Error('C13 report timeout')}
async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),children:await prisma.situationalAttempt.count(),jobs:await prisma.compositeReportJob.count(),raw:await prisma.situationalRawSubmission.count(),snapshots:await prisma.assessmentUnitSnapshot.count()}}
async function noWrites(name,fn){const before=await census();await fn();const after=await census();assert.deepEqual(after,before,name);counts.push({name,before,after});check(name)}
async function assertReceipt(a,r,g){const child=await prisma.situationalAttempt.findUniqueOrThrow({where:{id:a.currentItem.situationalAttemptId}}),frozen=decryptUnifiedRuntimePayload(child.runtimeSnapshotEncrypted);assert.deepEqual(Object.fromEntries(Object.keys(exact(r)).map(k=>[k,frozen.authorizationReceipt[k]])),exact(r));assert.equal(frozen.authorizationReceipt.releaseId,r.id);assert.equal(frozen.authorizationReceipt.grantId,g.id);assert.equal(frozen.authorizationReceipt.grantVersion,g.version);assert.equal(frozen.authorizationReceipt.granteeTeacherId,teacherId);assert.equal(frozen.authorizationReceipt.courseId,fixture.courses[0].id);assert.equal(frozen.authorizationReceipt.permission,'DISTRIBUTE');assert.equal(frozen.authorizationReceipt.purpose,'TRAINING_COURSE');assert.equal(frozen.authorizationReceipt.validFrom,new Date(g.validFrom).toISOString());assert.equal(frozen.authorizationReceipt.expiresAt,new Date(g.expiresAt).toISOString());assert.ok(Date.parse(frozen.authorizationReceipt.admittedAt)>=Date.parse(g.validFrom));assert.ok(Date.parse(frozen.authorizationReceipt.admittedAt)<Date.parse(g.expiresAt));receipts.push({attemptId:child.id,runtimeSnapshotSha256:createHash('sha256').update(child.runtimeSnapshotEncrypted).digest('hex'),receipt:frozen.authorizationReceipt});return frozen}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(row.length||cell)rows.push([...row,cell]);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function exportCheck(product,a,format){const queued=await teacher.request(`${prefix}/${product.id}/export`,'POST',{detail:'full',format});assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');for(let i=0;i<120;i++){const s=await teacher.request(url+'/status');if(s.status==='READY')break;assert.notEqual(s.status,'FAILED');if(i===119)throw Error('C13 export timeout');await pause(250)}const bytes=await teacher.request(url,'GET',undefined,200,true);const files=format==='zip'?unzip(bytes):null;const [columns,...rows]=parseCsv(files?.['data.csv']??bytes);assert.equal(rows.length,1);const row=Object.fromEntries(columns.map((k,i)=>[k,rows[0][i]]));assert.equal(row.A_attempt_id,a.id);const snapshot=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}});const canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snapshot.canonicalResultEncrypted));assert.equal(row.J001_instrument_key,canonical.core.instrumentKey);assert.equal(row.J001_result_hash,canonical.resultHash);assert.equal(row.J001_definition_hash,canonical.core.sourceDefinitionHash);assert.equal(row.J001_compiled_runtime_hash,canonical.core.compiledRuntimeHash);assert.equal(row.J001_quality_status,canonical.core.quality.status);for(const metric of canonical.core.metrics){const key=`J001_M_${metric.key.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)}_${createHash('sha256').update(metric.key).digest('hex').slice(0,16)}`;assert.ok(columns.includes(key));if(metric.value===null)assert.equal(row[key],'');else assert.equal(Number(row[key]),metric.value)}assert.ok(!columns.some(c=>c.startsWith('J001_')&&/response|answer|narrative|contribution/i.test(c)));if(files){const dict=JSON.parse(files['data_dictionary.json']);assert.deepEqual(dict.columns.map(c=>c.name),columns);assert.equal(dict.schemaVersion,createHash('sha256').update(JSON.stringify(dict.columns)).digest('hex'))}await otherTeacher.request(url,'GET',undefined,404);check(`Original export queue ${format}: exact canonical identities/metrics, no raw responses, owner-only download`)}

// These gates use independent real restricted-role PostgreSQL sessions. HTTP is
// never mocked, and no answer, grant, or attempt row is fabricated for a race.
const gateClients=[]
function tracked(promise){const t={settled:false,error:null,value:null};t.done=promise.then(v=>{t.settled=true;t.value=v},e=>{t.settled=true;t.error=e});t.result=async()=>{await t.done;if(t.error)throw t.error;return t.value};return t}
async function observedLock(table,blocker,request,exclude=[]){
 const until=Date.now()+7000
 while(Date.now()<until){
  if(request?.settled){if(request.error)throw request.error;throw Error(`${table}: HTTP completed before required SQL contention`)}
  const rows=await prisma.$queryRawUnsafe(`SELECT pid, wait_event AS "waitEvent", pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND query LIKE $1 AND pid <> pg_backend_pid()`, '%'+table+'%')
  const blockers=Array.isArray(blocker)?blocker:[blocker];const row=rows.find(r=>!exclude.includes(r.pid)&&r.blockers.some(b=>blockers.includes(b)));if(row){races.push({table,pid:row.pid,waitEvent:row.waitEvent,blockers:row.blockers});return row.pid}await pause(25)
 }
 throw Error(`Real PostgreSQL ${table} lock contention not observed`)
}
async function withGate(table,id,fn,mutate){
 assert.ok(['sjt_release_grants','stored_assets','users','courses'].includes(table))
 const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL.replace(/connection_limit=\d+/,'connection_limit=1')}}});gateClients.push(db)
 let release,ready,failed;const released=new Promise(r=>{release=r}),locked=new Promise((r,j)=>{ready=r;failed=j})
 const running=db.$transaction(async tx=>{const [{pid}]=await tx.$queryRawUnsafe('SELECT pg_backend_pid()::int AS pid');await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`,id);if(mutate)await mutate(tx);ready(pid);await released},{maxWait:10000,timeout:25000})
 running.catch(failed)
 try{return await fn(await locked,release)}finally{release();await running;await db.$disconnect()}
}
async function revokeFirst(r,g,operation,name){
 const before=await census()
 await withGate('sjt_release_grants',g.id,async(pid,unlock)=>{
  const rev=tracked(revoke(g)),revPid=await observedLock('sjt_release_grants',pid,rev)
  const op=tracked(operation());await observedLock('sjt_release_grants',[pid,revPid],op,[revPid])
  unlock();await rev.result();await op.result()
 })
 assert.deepEqual(await census(),before);check(name)
}
async function operationFirst(asset,g,operation,name){
 let value
 await withGate('stored_assets',asset.assetId,async(pid,unlock)=>{
  const op=tracked(operation()),opPid=await observedLock('stored_assets',pid,op)
  const rev=tracked(revoke(g));await observedLock('sjt_release_grants',opPid,rev)
  assert.equal(op.settled,false);assert.equal(rev.settled,false);unlock();value=await op.result();await rev.result()
 })
 check(name);return value
}
async function syntheticActor(c,role,member=false){const password='C13SyntheticOnly2026',u=await prisma.user.create({data:{username:'c13-'+randomUUID(),passwordHash:await bcrypt.hash(password,10),role,teacherApproved:true,mustChangePassword:false}});if(member)await prisma.courseStudent.create({data:{courseId:fixture.courses[0].id,studentId:u.id,status:'ACTIVE'}});await c.login({username:u.username,password},role);return u}
try{
 const [role]=await prisma.$queryRawUnsafe('SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user')
 assert.equal(role.name,'eduk12_runtime');for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolbypassrls'])assert.equal(role[key],false)
 teacherId=(await syntheticActor(teacher,'TEACHER')).id
 const fixtureStudent=await prisma.user.findUniqueOrThrow({where:{username:fixture.student.username}})
 fixture.courses=await Promise.all([0,1].map(i=>prisma.course.create({data:{courseType:'TRAINING_COURSE',creatorId:teacherId,title:'C13 Training '+i,courseCode:'C13-'+randomUUID(),status:'PUBLISHED'}})))
 await prisma.courseStudent.create({data:{courseId:fixture.courses[0].id,studentId:fixtureStudent.id,status:'ACTIVE'}})
 await admin.login(fixture.admin,'ADMIN');await student.login(fixture.student,'STUDENT')
 await syntheticActor(author,'TEACHER');await syntheticActor(otherTeacher,'TEACHER');outsiderId=(await syntheticActor(outsider,'STUDENT')).id;await syntheticActor(newStudent,'STUDENT',true)
 check('Real HTTP actors and restricted NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS runtime')

 const uploaded=await upload(author),asset=uploaded.asset
 assert.equal(asset.mimeType,'image/png');assert.equal(asset.contentHash,createHash('sha256').update(imageBytes).digest('hex'));assert.equal(uploaded.sizeBytes,imageBytes.length)
 const row=await prisma.storedAsset.findUniqueOrThrow({where:{id:asset.assetId}});assert.equal(row.accessScope,'PRIVATE');assert.equal(row.scopeId,'sjt-authoring');assert.ok(row.sizeBytes<=2*1024*1024)
 assert.deepEqual(await author.request(`${auth}/media/images/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 await teacher.request(`${auth}/media/images/${asset.assetId}/content`,'GET',undefined,404)
 const assetCount=await prisma.storedAsset.count();await upload(author,Buffer.concat([imageBytes,Buffer.alloc(2*1024*1024)]),'image/png',[400,413]);await upload(author,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/svg+xml',[400,415]);assert.equal(await prisma.storedAsset.count(),assetCount)
 let draft=await online(author,asset)
 for(const [name,mutate] of [['wrong image hash',t=>{t.display.scenes[0].image.asset.contentHash='f'.repeat(64)}],['blank image alt',t=>{t.display.scenes[0].image.altText=''}],['unknown image rights',t=>{t.display.scenes[0].image.rightsStatus='unknown'}]]){
  const template=structuredClone(draft.template);template.instrumentKey='c13-'+randomUUID();mutate(template);await author.request(auth+'/online/drafts','POST',{template,authorizationPolicy:'COURSE_GRANT_V1'},denied)
 }
 await teacher.request(auth+'/online/drafts','POST',{template:{...structuredClone(draft.template),instrumentKey:'c13-'+randomUUID()},authorizationPolicy:'COURSE_GRANT_V1'},403)
 await author.request(`${auth}/drafts/${draft.id}/review`,'POST',{...reviewBody(draft),approve:true,note:'Nonadmin review denied'},403)
 assert.deepEqual(await admin.request(`${auth}/drafts/${draft.id}/media/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 draft=await release(draft);const rel=draft.release;assert.equal(rel.authorizationPolicy,'COURSE_GRANT_V1')
 const original=await prisma.sjtAuthorRelease.findUniqueOrThrow({where:{id:rel.id}})
 await author.request(`${auth}/media/images/${asset.assetId}`,'DELETE',undefined,409)
 assert.ok(await prisma.assetReference.findFirst({where:{assetId:asset.assetId,entityType:'SjtAuthorRelease',entityId:rel.id}}))
 check('Private <=2 MB image HTTP upload, owner proxy, MIME/size/rights/hash/foreign-use rejection, independent immutable release and retention')

 const valid={...exact(rel),granteeTeacherId:teacherId,courseId:fixture.courses[0].id,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),note:'Synthetic invalid grant matrix'}
 for(const [name,changes] of [['wrong key',{instrumentKey:'wrong-key'}],['wrong version',{instrumentVersion:'99.0.0'}],['wrong hash',{definitionHash:'e'.repeat(64)}],['wrong digest',{contentDigest:'d'.repeat(64)}],['wrong teacher',{granteeTeacherId:outsiderId}],['wrong course',{courseId:randomUUID()}],['wrong purpose',{purpose:'RESEARCH'}],['expired',{expiresAt:new Date(Date.now()-1).toISOString()}]]){
  const before=await prisma.sjtReleaseGrant.count();await noWrites(`Grant ${name} rejected without attempt artifacts`,()=>admin.request(`${auth}/releases/${rel.id}/grants`,'POST',{...valid,...changes},denied));assert.equal(await prisma.sjtReleaseGrant.count(),before)
 }
 const legacyCourse=await prisma.course.create({data:{creatorId:teacherId,title:'C13 non-Training boundary',courseCode:'C13-'+randomUUID(),status:'PUBLISHED',courseType:'LEGACY_COURSE'}})
 await noWrites('Controlled release cannot be granted to a non-Training course',()=>admin.request(`${auth}/releases/${rel.id}/grants`,'POST',{...valid,courseId:legacyCourse.id},403))
 await teacher.request(`${auth}/releases/${rel.id}/grants`,'POST',valid,403)
 const dist=await grant(rel),product=await composition(rel)
 const catalog=await teacher.request(auth+'/releases');assert.ok(Array.isArray(catalog.items));assert.ok(catalog.items.some(r=>r.id===rel.id));assert.ok(!/"(?:package|template|contributions|expertKey)"/.test(JSON.stringify(catalog)))
 await teacher.request(`${auth}/drafts/${draft.id}`,'GET',undefined,403)
 await teacher.request(`${auth}/drafts/${draft.id}/media/${asset.assetId}/content`,'GET',undefined,403)
 await teacher.request(`${auth}/drafts/${draft.id}/preview`,'POST',{responseProtocol:'sjt-online-response-v1',responses:onlineFixture.goldenCases[0].responses},403)
 await author.request(`${auth}/drafts/${draft.id}/policy`,'PUT',{revision:draft.revision,authorizationPolicy:null},denied)
 const adaptBody={...exact(rel),courseId:fixture.courses[0].id,grantId:dist.id,grantVersion:dist.version,newInstrumentKey:rel.instrumentKey,newInstrumentVersion:'2.0.0'}
 await teacher.request(`${auth}/releases/${rel.id}/adapt`,'POST',adaptBody,denied)
 const controlledPublic=await composition(rel,{publicEnabled:true}),controlledAnon=client(),publicPrefix='/public/composite-assessments';await controlledAnon.request('/auth/csrf')
 const controlledToken=await teacher.request(`${prefix}/${controlledPublic.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:3}),controlledStart=await controlledAnon.request(`${publicPrefix}/${controlledToken.token}/start`,'POST',{});controlledAnon.recovery=controlledStart.recoveryToken;const controlledAttempt=controlledStart.attempt
 await assertReceipt(controlledAttempt,rel,dist)
 await rejectComposition('Controlled release rejects GENERAL anonymous publishing',rel,{courseIds:[],publicEnabled:true,questionnaireType:'GENERAL'})
 await rejectComposition('Controlled release rejects unbound COURSE publishing',rel,{courseIds:[]})
 await rejectComposition('Controlled release rejects multi-course publishing',rel,{courseIds:fixture.courses.map(c=>c.id)})
 await rejectComposition('Exact course grant rejects another course',rel,{courseIds:[fixture.courses[1].id]})
 await noWrites('Nonmember/other teacher/standalone admission rejected',async()=>{await outsider.request(`${prefix}/${product.id}/attempts`,'POST',{},denied);await otherTeacher.request(`${prefix}/${product.id}/attempts`,'POST',{},denied);await student.request('/situational/attempts','POST',{instrumentKey:rel.instrumentKey,instrumentVersion:rel.instrumentVersion},denied)})
 const {attempt:a}=await student.request(`${prefix}/${product.id}/attempts`,'POST',{});const frozen=await assertReceipt(a,rel,dist)
 assert.equal(frozen.online.compilerVersion,'sjt-online-static-image-v1');await revoke(dist)
 await noWrites('Revocation rejects a new eligible student without parent/child/job/raw/canonical residue',()=>newStudent.request(`${prefix}/${product.id}/attempts`,'POST',{},denied))
 const newAnon=client();await newAnon.request('/auth/csrf');await noWrites('Revocation rejects fresh anonymous admission in the authorized single-course delivery',()=>newAnon.request(`${publicPrefix}/${controlledToken.token}/start`,'POST',{},denied))
 assert.equal((await student.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt.id,a.id)
 assert.equal((await student.request(`${prefix}/attempts/${a.id}`)).currentItem.situationalAttemptId,a.currentItem.situationalAttemptId)
 assert.deepEqual(await student.request(embeddedRoute(a)+`/assets/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 await outsider.request(embeddedRoute(a)+`/assets/${asset.assetId}/content`,'GET',undefined,denied)
 const final=await payload(a,draft);await student.request(embeddedRoute(a)+'/submit','POST',final);assert.equal((await student.request(embeddedRoute(a)+'/submit','POST',final)).replayed,true);await report(student,a)
 assert.equal(await prisma.situationalRawSubmission.count({where:{attemptId:a.currentItem.situationalAttemptId}}),1)
 const canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload((await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}})).canonicalResultEncrypted));assert.equal(canonical.core.metrics.find(m=>m.key==='cooperation').value,9)
 assert.equal((await controlledAnon.request(`${publicPrefix}/${controlledToken.token}/start`,'POST',{recoveryToken:controlledAnon.recovery})).attempt.id,controlledAttempt.id)
 assert.deepEqual(await controlledAnon.request(embeddedRoute(controlledAttempt,publicPrefix)+`/assets/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 const controlledFinal=await payload(controlledAttempt,draft,controlledAnon,publicPrefix);await controlledAnon.request(embeddedRoute(controlledAttempt,publicPrefix)+'/submit','POST',controlledFinal);await report(controlledAnon,controlledAttempt,publicPrefix)
 check('Exact frozen grant receipt survives revocation for member and single-course anonymous users: resume/image/FINAL/report; both fresh admission paths denied')
 await exportCheck(product,a,'csv');await exportCheck(product,a,'zip')

 const expiring=await grant(rel,{expiresAt:new Date(Date.now()+4500).toISOString()}),ep=await composition(rel),{attempt:ea}=await student.request(`${prefix}/${ep.id}/attempts`,'POST',{})
 await assertReceipt(ea,rel,expiring);await pause(Math.max(0,Date.parse(expiring.expiresAt)-Date.now()+60))
 await noWrites('Expired grant denies fresh eligible admission without artifacts',()=>newStudent.request(`${prefix}/${ep.id}/attempts`,'POST',{},denied))
 assert.equal((await student.request(`${prefix}/${ep.id}/attempts`,'POST',{})).attempt.id,ea.id)
 assert.deepEqual(await student.request(embeddedRoute(ea)+`/assets/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 const ef=await payload(ea,draft);await student.request(embeddedRoute(ea)+'/submit','POST',ef);await report(student,ea);check('Expiry preserves previously admitted image/FINAL/report recovery');await revoke(expiring)
 const future=await grant(rel,{validFrom:new Date(Date.now()+60000).toISOString()});await rejectComposition('Future grant cannot authorize publishing',rel);await noWrites('Future grant cannot authorize new admission',()=>newStudent.request(`${prefix}/${ep.id}/attempts`,'POST',{},denied));await revoke(future)

 const adaptGrant=await grant(rel,{permission:'ADAPT'});await rejectComposition('ADAPT alone cannot authorize source distribution',rel)
 for(const [name,change] of [['grant version',{grantVersion:adaptGrant.version+1}],['source hash',{definitionHash:'f'.repeat(64)}],['source version',{instrumentVersion:'98.0.0'}],['course',{courseId:fixture.courses[1].id}],['grant id',{grantId:randomUUID()}]]){
  const count=await prisma.sjtAuthorDraft.count();await teacher.request(`${auth}/releases/${rel.id}/adapt`,'POST',{...adaptBody,grantId:adaptGrant.id,grantVersion:adaptGrant.version,...change},denied);assert.equal(await prisma.sjtAuthorDraft.count(),count);check(`ADAPT exact ${name} mismatch cannot create a draft`)
 }
 let adapted=await teacher.request(`${auth}/releases/${rel.id}/adapt`,'POST',{...adaptBody,grantId:adaptGrant.id,grantVersion:adaptGrant.version})
 assert.equal(adapted.status,'DRAFT');assert.equal(adapted.template.instrumentVersion,'2.0.0');assert.deepEqual(adapted.template.goldenCases,[])
 assert.deepEqual(await teacher.request(`${auth}/drafts/${adapted.id}/media/${asset.assetId}/content`,'GET',undefined,200,true),imageBytes)
 await teacher.request(`${auth}/drafts/${adapted.id}/request-review`,'POST',reviewBody(adapted),422)
 const adaptedTemplate=structuredClone(adapted.template);adaptedTemplate.goldenCases=structuredClone(onlineFixture.goldenCases)
 adapted=await teacher.request(`${auth}/drafts/${adapted.id}`,'PUT',{revision:adapted.revision,template:adaptedTemplate});adapted=await release(adapted,teacher)
 await rejectComposition('New adapted release requires its own DISTRIBUTE grant',adapted.release)
 assert.notEqual(adapted.release.id,rel.id);assert.equal(adapted.release.instrumentVersion,'2.0.0');assert.deepEqual(await prisma.sjtAuthorRelease.findUniqueOrThrow({where:{id:rel.id}}),original)
 const pendingAdapt=await teacher.request(`${auth}/releases/${rel.id}/adapt`,'POST',{...adaptBody,grantId:adaptGrant.id,grantVersion:adaptGrant.version,newInstrumentVersion:'3.0.0'})
 await revoke(adaptGrant);await teacher.request(`${auth}/releases/${rel.id}/adapt`,'POST',{...adaptBody,grantId:adaptGrant.id,grantVersion:adaptGrant.version,newInstrumentVersion:'3.0.0'},denied);await teacher.request(`${auth}/drafts/${pendingAdapt.id}`,'GET',undefined,denied)
 await teacher.request(`${auth}/drafts/${pendingAdapt.id}/media/${asset.assetId}/content`,'GET',undefined,403)
 check('ADAPT makes independent reviewed version with new manual golden; immutable original unchanged; revoked ADAPT blocks new/unpublished source-draft access')

 const raceGrant1=await grant(rel),rp1=await composition(rel)
 await revokeFirst(rel,raceGrant1,()=>student.request(`${prefix}/${rp1.id}/attempts`,'POST',{},denied),'Real grant row lock: revoke-first commits before admission; zero attempt artifacts')
 const raceGrant2=await grant(rel),rp2=await composition(rel)
 const admitted=await operationFirst(asset,raceGrant2,()=>student.request(`${prefix}/${rp2.id}/attempts`,'POST',{}),'Real grant→asset row locks: admission-first commits frozen attempt before revoke')
 await assertReceipt(admitted.attempt,rel,raceGrant2);assert.equal((await student.request(`${prefix}/${rp2.id}/attempts`,'POST',{})).attempt.id,admitted.attempt.id)
 await noWrites('Admission-first still rejects a later new student after revoke',()=>newStudent.request(`${prefix}/${rp2.id}/attempts`,'POST',{},denied))
 const raceGrant3=await grant(rel),rp3=await productDraft(rel)
 await revokeFirst(rel,raceGrant3,()=>teacher.request(`${products}/${rp3.id}/publish`,'POST',{revision:rp3.revision},denied),'Real publication race: revoke-first leaves original product DRAFT')
 assert.equal((await prisma.compositeAssessment.findUniqueOrThrow({where:{id:rp3.id}})).status,'DRAFT')
 const raceGrant4=await grant(rel),rp4=await productDraft(rel)
 await operationFirst(asset,raceGrant4,()=>teacher.request(`${products}/${rp4.id}/publish`,'POST',{revision:rp4.revision}),'Real publication race: publish-first commits then revoke denies later admission')
 assert.equal((await prisma.compositeAssessment.findUniqueOrThrow({where:{id:rp4.id}})).status,'PUBLISHED')
 await noWrites('Publish-first then revoked grant denies new admission',()=>student.request(`${prefix}/${rp4.id}/attempts`,'POST',{},denied))

 const scopeGrant=await grant(rel),sp=await composition(rel)
 await noWrites('Teacher freezes while scope SHARE waits: committed account state rejects HTTP admission without artifacts',()=>withGate('users',teacherId,async(pid,unlock)=>{
  const op=tracked(student.request(`${prefix}/${sp.id}/attempts`,'POST',{},denied));await observedLock('users',pid,op);unlock();await op.result()
 },tx=>tx.user.update({where:{id:teacherId},data:{isFrozen:true}})))
 await prisma.user.update({where:{id:teacherId},data:{isFrozen:false}});await revoke(scopeGrant)

 const lockExpiry=await grant(rel,{expiresAt:new Date(Date.now()+3500).toISOString()}),xp=await composition(rel)
 await noWrites('Expiry while waiting for real grant row lock rejects admission without artifacts',()=>withGate('sjt_release_grants',lockExpiry.id,async(pid,unlock)=>{
  const op=tracked(student.request(`${prefix}/${xp.id}/attempts`,'POST',{},denied));await observedLock('sjt_release_grants',pid,op);await pause(Math.max(0,Date.parse(lockExpiry.expiresAt)-Date.now()+60));unlock();await op.result()
 }))

 // One original code-owned, null-policy anonymous chain; no C12 suite rerun.
 const builtin=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/instruments/sjt-assertiveness-golden/1.0.0/instrument.json')))
 const lp=await composition(builtin.identity,{courseIds:fixture.courses.map(c=>c.id),publicEnabled:true}),anon=client();await anon.request('/auth/csrf')
 const token=await teacher.request(`${prefix}/${lp.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:2}),pp='/public/composite-assessments',started=await anon.request(`${pp}/${token.token}/start`,'POST',{});anon.recovery=started.recoveryToken;const la=started.attempt
 assert.equal((await anon.request(`${pp}/${token.token}/start`,'POST',{recoveryToken:anon.recovery})).attempt.id,la.id)
 const legacyFrozen=decryptUnifiedRuntimePayload((await prisma.situationalAttempt.findUniqueOrThrow({where:{id:la.currentItem.situationalAttemptId}})).runtimeSnapshotEncrypted);assert.equal(legacyFrozen.authorizationReceipt,undefined)
 const lr=await anon.request(embeddedRoute(la,pp)),lb={submissionId:randomUUID(),attemptEpoch:lr.attempt.attemptEpoch,definitionHash:lr.attempt.definitionHash,compiledRuntimeHash:lr.attempt.compiledRuntimeHash,scoringVersion:lr.attempt.scoringVersion,responses:builtin.goldenCases[0].responses}
 await anon.request(embeddedRoute(la,pp)+'/submit','POST',lb);assert.equal((await anon.request(embeddedRoute(la,pp)+'/submit','POST',lb)).replayed,true);await report(anon,la,pp)
 const noRecovery=client();await noRecovery.request(`${pp}/attempts/${la.id}/report`,'GET',undefined,[400,401,403,404]);check('Legacy null-policy multi-course anonymous start/resume/FINAL/replay/report remains compatible without injected grant receipt')
 passed=true
}catch(error){console.error(error);throw error}finally{for(const db of gateClients)await db.$disconnect();await prisma.$disconnect();fs.writeFileSync(path.join(state,'c13-http-result.json'),JSON.stringify({passed,checks,requests,counts,races,receipts},null,2))}
process.exit(0)
