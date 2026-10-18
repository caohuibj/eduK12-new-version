/** Public authoring/save/import/validation/publication with real loopback HTTP. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {createCustomScaleDefinition}=require(path.join(backend,'dist/modules/scale/scale-definition.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const bcrypt=require('bcryptjs')
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=[], observations=[];let requests=0,sqlEvents=0
prisma.$on('query',()=>sqlEvents++)
const check=name=>{checks.push(name);console.log('PASS',name)}
function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
  requests++;const start=performance.now();const wire=body===undefined?undefined:JSON.stringify(body)
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}) ,...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(wire===undefined?{}:{body:wire})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const bytes=Buffer.from(await response.arrayBuffer());const text=bytes.toString('utf8');observations.push({method,status:response.status,requestBytes:wire?Buffer.byteLength(wire):0,responseBytes:Buffer.byteLength(text),durationMs:Math.round(performance.now()-start)})
  assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,500)}`)
  if(raw)return bytes
  const data=JSON.parse(text);if(expected!==200)return data
  assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
}}}
function definition(){const d=createCustomScaleDefinition();d.items=[{itemCode:'Q1',content:'Existing item',type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}];d.scoring.itemRules=[{itemCode:'Q1',transform:{type:'identity'}}];d.scoring.scores=[{key:'total',type:'total',label:'Total',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',items:[{itemCode:'Q1',weight:1}],aggregation:'sum'}}];d.report.primaryScoreKeys=['total'];d.report.scoreOrder=['total'];d.report.interpretations=[{scoreKey:'total',headline:'Total',source:{type:'score_only'},summary:'Synthetic descriptive fixture',bands:[],guidance:[]}];return d}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);rows.push(row);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
const teacher=client(),other=client(),student=client();const password='C09SyntheticOnly2026';let storage=[]
async function exported(draft,format){
 const queued=await teacher.request(`/composite-assessments/${draft.id}/export`,'POST',{detail:'summary',format})
 const artifact=queued.artifacts[0]
 for(let i=0;i<120;i++){const status=await teacher.request(artifact.downloadUrl.replace(/^\/api/, '')+'/status');if(status.status==='READY')break;if(status.status==='FAILED')throw Error('export failed '+JSON.stringify(status));await new Promise(r=>setTimeout(r,250));if(i===119)throw Error('export timeout')}
 const bytes=await teacher.request(artifact.downloadUrl.replace(/^\/api/,''),'GET',undefined,200,true)
 const csv=format==='zip'?unzip(bytes)['data.csv']:bytes
 const [columns,values]=parseCsv(csv)
 return {artifact,columns,data:Object.fromEntries(columns.map((col,i)=>[col,values[i]])),bytes:bytes.length}
}
try{
 const users=[];for(const role of ['TEACHER','TEACHER','STUDENT'])users.push(await prisma.user.create({data:{username:'c09-http-'+randomUUID(),passwordHash:await bcrypt.hash(password,10),role,teacherApproved:true,mustChangePassword:false}}))
 for(const [c,u] of [[teacher,users[0]],[other,users[1]],[student,users[2]]]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{username:u.username,password,expectedRole:u.role})}
 const courses=[];for(const type of ['TRAINING_COURSE','TRAINING_COURSE','LEGACY_COURSE'])courses.push(await prisma.course.create({data:{creatorId:users[0].id,title:'C09 '+type,courseCode:'C09-'+randomUUID(),courseType:type,status:'PUBLISHED'}}))
 await prisma.courseStudent.createMany({data:courses.map(course=>({courseId:course.id,studentId:users[2].id,status:'ACTIVE'}))})
 let scale=await teacher.request('/scales','POST',{code:'C09-'+randomUUID(),name:'C09 Scale',visibility:'HIDDEN'})
 scale=await teacher.request(`/scales/${scale.id}/definition`,'PUT',{definition:definition(),expectedUpdatedAt:scale.updatedAt})
 scale=await teacher.request(`/scales/${scale.id}/publish`,'POST',{expectedUpdatedAt:scale.updatedAt})
 const meta={name:'C09 timing',questionnaireType:'COURSE',courseIds:[courses[0].id],trainingTimingEnabled:true}
 for(const fields of [{questionnaireType:'GENERAL',courseIds:[]},{courseIds:[courses[2].id]},{courseIds:[courses[0].id,courses[1].id],publicEnabled:true,expiresAt:new Date(Date.now()+3600000).toISOString()}])await teacher.request('/questionnaire-products','POST',{...meta,...fields,requestId:randomUUID()},400)
 check('GENERAL, LEGACY_COURSE and ambiguous anonymous course timing rejected')
 for(const mode of [{whole:false,anonymous:false,enabled:true,missing:false},{whole:true,anonymous:true,enabled:true,missing:false},{whole:true,anonymous:false,enabled:true,missing:true},{whole:false,anonymous:false,enabled:false,missing:true}]){
  let draft=await teacher.request('/questionnaire-products','POST',{...meta,trainingTimingEnabled:mode.enabled,requestId:randomUUID(),publicEnabled:mode.anonymous,...(mode.anonymous?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})})
  assert.equal(draft.timingExportEnabled,false)
  if(mode.enabled)assert.match(draft.trainingTimingPolicy.policyHash,/^[a-f0-9]{64}$/)
  draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:{type:'SCALE',scaleId:scale.id,required:true}})
  assert.equal((await teacher.request(`/questionnaire-products/${draft.id}/preflight`,'POST',{revision:draft.revision})).ok,true)
  draft=await teacher.request(`/questionnaire-products/${draft.id}/publish`,'POST',{revision:draft.revision})
  await other.request(`/questionnaire-products/${draft.id}/timing-export-policy`,'POST',{revision:draft.revision,enabled:true},403)
  let c=student,prefix='/composite-assessments',attempt
  if(mode.anonymous){c=client();const token=await teacher.request(`/composite-assessments/${draft.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:4});const started=await c.request(`/public/composite-assessments/${token.token}/start`,'POST',{});c.recovery=started.recoveryToken;attempt=started.attempt;prefix='/public/composite-assessments'}else({attempt}=await c.request(`/composite-assessments/${draft.id}/attempts`,'POST',{}))
  const child=attempt.currentItem;assert.equal(child.type,'SCALE');assert.equal(Boolean(child.trainingTiming),mode.enabled)
  const frozen=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
  if(mode.enabled){assert.equal(frozen.trainingTimingSnapshot.course.courseId,courses[0].id);assert.equal(frozen.trainingTimingSnapshot.course.courseType,'TRAINING_COURSE')}
  const row={schemaVersion:1,firstResponseMs:120,activeTimeMs:200,changeCount:1,revisitCount:0,visits:1,interrupted:true,recoveredWithoutClock:false}
  const answers=[{itemCode:'Q1',responseValue:'option_5',responseTimeMs:17}],timings=mode.missing?{}:{itemTimings:{Q1:row}}
  let route,input
  if(mode.whole){const d=await c.request(`${prefix}/attempts/${attempt.id}/whole/definition`);input={submissionId:randomUUID(),attemptEpoch:d.attemptEpoch,slotSetHash:d.slotSetHash,contextSnapshotHash:d.contextSnapshotHash,units:d.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers,...timings}))};route=`${prefix}/attempts/${attempt.id}/whole/submit`
   await c.request(route,'POST',{...input,units:input.units.map(unit=>({...unit,itemTimings:{forged:row}}))},400)
   assert.equal((await prisma.compositeReportJob.findUnique({where:{attemptId_attemptEpoch:{attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}}}))?.wholeSubmissionId,null)
  }else{input={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:child.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers,...timings};route=`${prefix}/attempts/${attempt.id}/items/${child.id}/scale/submit`
   await c.request(route,'POST',{...input,itemTimings:mode.enabled?{forged:row}:{Q1:row}},400)
  }
  const proto=JSON.parse('{"__proto__":{}}');await c.request(route,'POST',mode.whole?{...input,units:input.units.map(unit=>({...unit,itemTimings:proto}))}:{...input,itemTimings:proto},400)
  const first=await c.request(route,'POST',input);const replay=await c.request(route,'POST',input);assert.equal(replay.replayed,true)
  const conflict=structuredClone(input);if(mode.whole)conflict.units[0].answers[0].responseValue='option_4';else conflict.answers[0].responseValue='option_4';await c.request(route,'POST',conflict,409)
  let report
  for(let i=0;i<120;i++){const current=await c.request(`${prefix}/attempts/${attempt.id}/report-status`);if(current.reportStatus?.state==='READY'){report=await c.request(`${prefix}/attempts/${attempt.id}/report`);break}await new Promise(r=>setTimeout(r,250));if(i===119)throw Error('report timeout '+JSON.stringify(current))}
  assert.ok(!JSON.stringify(report).includes('trainingTiming'))
  const record=await prisma.assessment.findUniqueOrThrow({where:{id:child.scaleAssessmentId}})
  if(mode.enabled){const fact=decryptUnifiedRuntimePayload(record.timingEncrypted);assert.equal(fact.status,mode.missing?'MISSING':'RECORDED');if(!mode.missing)assert.deepEqual(fact.items.Q1,row);else assert.deepEqual(fact.items,{})}else assert.equal(record.timingEncrypted,null)
  storage.push({mode,policyBytes:Buffer.byteLength(JSON.stringify(draft.trainingTimingPolicy)),snapshotBytes:Buffer.byteLength(JSON.stringify(frozen.trainingTimingSnapshot)),timingCipherBytes:record.timingEncrypted?Buffer.byteLength(record.timingEncrypted):0})
  let teacherReport=await teacher.request(`/composite-assessments/${draft.id}/attempts/${attempt.id}/report`);assert.ok(!JSON.stringify(teacherReport).includes('trainingTiming'))
  const without=await exported(draft,'csv');assert.ok(!without.columns.some(col=>col.includes('TIMING_')))
  draft=await teacher.request(`/questionnaire-products/${draft.id}/timing-export-policy`,'POST',{revision:draft.revision,enabled:true})
  teacherReport=await teacher.request(`/composite-assessments/${draft.id}/attempts/${attempt.id}/report`);const timing=teacherReport.unitReports[0].trainingTiming
  assert.equal(timing.status,mode.enabled?(mode.missing?'MISSING':'RECORDED'):'NOT_COLLECTED')
  for(const format of ['csv','zip']){const result=await exported(draft,format);assert.ok(result.columns.some(col=>col.includes('TIMING_')));assert.ok(!result.columns.some(col=>col.includes('Q_V_')));assert.equal(result.data.S001_TIMING_status,timing.status);if(mode.enabled&&!mode.missing)assert.equal(result.data.S001_TIMING_activeTimeMs_q1,'200')
   const revision=draft.revision;draft=await teacher.request(`/questionnaire-products/${draft.id}/timing-export-policy`,'POST',{revision,enabled:false})
   await teacher.request(result.artifact.downloadUrl.replace(/^\/api/,''),'GET',undefined,404)
   teacherReport=await teacher.request(`/composite-assessments/${draft.id}/attempts/${attempt.id}/report`);assert.ok(!JSON.stringify(teacherReport).includes('trainingTiming'))
   await teacher.request(`/questionnaire-products/${draft.id}/timing-export-policy`,'POST',{revision,enabled:true},409)
   draft=await teacher.request(`/questionnaire-products/${draft.id}/timing-export-policy`,'POST',{revision:draft.revision,enabled:true})
   await teacher.request(result.artifact.downloadUrl.replace(/^\/api/,''),'GET',undefined,404)
  }
  check(JSON.stringify(mode)+' authoring/frozen source/FINAL/replay/missing/report/CSV/ZIP/revocation')
 }
 fs.writeFileSync(path.join(state,'c09-http-result.json'),JSON.stringify({passed:true,requests,checks,observations,storage},null,2))
}catch(error){fs.writeFileSync(path.join(state,'c09-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,storage,error:String(error)},null,2));throw error}finally{await prisma.$disconnect()}
process.exit(0)
