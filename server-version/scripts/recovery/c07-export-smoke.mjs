/** C06 uses public authoring APIs; direct DB reads inspect accepted synthetic facts only. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {readFormSectionCollectionFacts}=require(path.join(backend,'dist/modules/assessment-runtime/form-facts.js'))
const {loadCompositeTypedFormValues}=require(path.join(backend,'dist/modules/assessment-runtime/typed-form-facts.js'))
const state=process.argv[2], status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
const fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=[];let requests=0
const observations=[]
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
const teacher=client(),student=client()
const policy={version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}
const options=[{optionKey:'b',label:'乙'},{optionKey:'a',label:'甲'}]
const long='中文, "引用"\n尾 🐈'.repeat(400)
const q=(label,type,extra={},v3=false)=>({type:'FORM',formType:({SINGLE:'single_choice',MULTIPLE:'multiple_choice',SHORT_TEXT:'text_input'}[type]??type.toLowerCase()),formLabel:label,required:false,...(v3?{formPolicy:policy}:{}),formDefinition:{type,prompt:label,required:false,options:['SINGLE','MULTIPLE','LIKERT','MATRIX','MATRIX_MULTIPLE','RANK_ORDER','CONSTANT_SUM'].includes(type)?options:[],rows:[],...extra}})
async function create(v3,publicMode){
 let draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C07 typed export',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})})
 const definitions=[q('zero','NUMBER',{precision:8},v3),q('decimal','NUMBER',{precision:8},v3),q('missing','NUMBER',{},v3),q('text','LONG_TEXT',{maxLength:16000},v3),q('formula','SHORT_TEXT',{},v3),q('apostrophe','SHORT_TEXT',{},v3),q('multi','MULTIPLE',{},v3),q('rank','RANK_ORDER',{},v3),q('matrix','MATRIX',{rows:[{rowKey:'r1',label:'行一'},{rowKey:'r2',label:'行二'}],...(v3?{allowRefusal:true}:{})},v3),q('matrixmulti','MATRIX_MULTIPLE',{rows:[{rowKey:'r1',label:'行一'},{rowKey:'r2',label:'行二'}]},v3),q('sum','CONSTANT_SUM',{total:100},v3),q('slider','SLIDER',{min:-1,max:1,step:0.25,precision:2},v3),q('date','DATE',{},v3),q('time','TIME',{timeZone:'UTC'},v3),q('likert','LIKERT',{},v3)]
 let sectionId
 for(const item of definitions){draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,...(sectionId?{formSectionId:sectionId}:{}),item});sectionId=draft.items[0].formSectionId}
 if(v3){
  for(const item of [q('source','SINGLE',{},true),q('other','MULTIPLE',{otherOptionKey:'b',otherMaxLength:80},true)])draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,formSectionId:sectionId,item})
  const source=draft.items.find(x=>x.formLabel==='source')
  const hidden=q('hidden','SHORT_TEXT',{displayIf:{itemKey:source.formDefinition.itemKey,operator:'EQUALS',optionKey:'a'}},true)
  draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,formSectionId:sectionId,item:hidden})
 }
 const checked=await teacher.request(`/questionnaire-products/${draft.id}/preflight`,'POST',{revision:draft.revision});assert.equal(checked.ok,true,JSON.stringify(checked))
 await teacher.request(`/questionnaire-products/${draft.id}/publish`,'POST',{revision:draft.revision})
 let c=student,attempt,prefix='/composite-assessments'
 if(publicMode){c=client();const token=await teacher.request(`/composite-assessments/${draft.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:5});const started=await c.request(`/public/composite-assessments/${token.token}/start`,'POST',{});c.recovery=started.recoveryToken;attempt=started.attempt;prefix='/public/composite-assessments';assert.equal((await c.request(`/public/composite-assessments/${token.token}/start`,'POST',{recoveryToken:c.recovery})).attempt.id,attempt.id)}else({attempt}=await c.request(`/composite-assessments/${draft.id}/attempts`,'POST',{}))
 const expected={zero:0,decimal:-12.34567891,missing:null,text:long,formula:'=1+1',apostrophe:"'=1+1",multi:['b','a'],rank:['a','b'],matrix:{r1:'a',...(v3?{}:{r2:'b'})},matrixmulti:{r1:['b','a'],r2:['a']},sum:{a:0,b:100},slider:-0.25,date:'2024-02-29',time:'09:05',likert:'b',...(v3?{source:'b',other:['b'],hidden:null}:{})}
 const section=attempt.currentItem;assert.equal(section.type,'FORM_SECTION')
 const byLabel=Object.fromEntries(section.answers.map(a=>[a.label,a.formItemId]))
 const answers=Object.entries(expected).filter(([label])=>label!=='hidden').map(([label,value])=>({formItemId:byLabel[label],value:label==='matrix'&&v3?{r1:'a',r2:{_surveyRefusal:true}}:value,...(label==='other'?{otherText:'=其他, "说明"'}:{})}))
 const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers}
 await c.request(`${prefix}/attempts/${attempt.id}/form-sections/${section.id}/submit`,'POST',payload)
 const facts=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id}})
 assert.equal(facts.length,1);assert.equal(readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(facts[0].collectionFactsEncrypted)).schemaVersion,v3?3:2)
 observations.push({kind:'accepted-storage',v3,bytes:Buffer.byteLength(facts[0].collectionFactsEncrypted)})
 assert.equal((await c.request(`${prefix}/attempts/${attempt.id}/form-sections/${section.id}/submit`,'POST',payload)).replayed,true)
 for(let n=0;n<120;n++){const status=await c.request(`${prefix}/attempts/${attempt.id}/report-status`);if(status.reportStatus?.state==='READY')break;await new Promise(r=>setTimeout(r,250));if(n===119)throw Error('report timeout')}
 const report=await c.request(`${prefix}/attempts/${attempt.id}/report`),cached=await c.request(`${prefix}/attempts/${attempt.id}/report`)
 assert.deepEqual(report,cached)
 for(const [label,value] of Object.entries(expected)){const field=report.backgroundValues.find(x=>x.itemId===byLabel[label]);assert.deepEqual(field.typedValue,value,label);assert.equal(field.presentation.type,draft.items.find(x=>x.id===byLabel[label]).formDefinition.type)}
 if(v3){assert.equal(report.backgroundValues.find(x=>x.itemId===byLabel.hidden).state,'NOT_SHOWN');assert.equal(report.backgroundValues.find(x=>x.itemId===byLabel.matrix).rowStates.r2,'REFUSED')}
 // Poison only this synthetic legacy shadow. Canonical snapshots remain immutable.
 await prisma.compositeFormAnswer.updateMany({where:{attemptId:attempt.id},data:{value:'POISON SHADOW'}})
 return {draft,attempt,expected,byLabel,v3}
}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);rows.push(row);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function exportAndVerify(f,detail,format){
 const before=await prisma.exportBatch.count({where:{resourceId:f.draft.id}})
 await teacher.request(`/composite-assessments/${f.draft.id}/export`,'POST',{detail,format:'sav'},400)
 assert.equal(await prisma.exportBatch.count({where:{resourceId:f.draft.id}}),before)
 const queued=await teacher.request(`/composite-assessments/${f.draft.id}/export`,'POST',{detail,format})
 assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const artifact=queued.artifacts[0]
 let status
 for(let i=0;i<120;i++){status=await teacher.request(artifact.downloadUrl.replace(/^\/api/,'')+'/status');if(status.status==='READY')break;if(status.status==='FAILED')throw Error('export failed '+JSON.stringify(status));await new Promise(r=>setTimeout(r,250));if(i===119)throw Error('export timeout')}
 const bytes=await teacher.request(artifact.downloadUrl.replace(/^\/api/,''),'GET',undefined,200,true)
 const files=format==='zip'?unzip(bytes):null,csv=files?.['data.csv']??bytes
 const [columns,...rows]=parseCsv(csv);assert.equal(rows.length,1);const data=Object.fromEntries(columns.map((name,i)=>[name,rows[0][i]]));assert.equal(data.A_attempt_id,f.attempt.id)
 const dictionary=files?JSON.parse(files['data_dictionary.json']):null
 for(let i=0;i<f.draft.items.length;i++){
  const item=f.draft.items[i],prefix='F'+String(i+1).padStart(3,'0'),value=f.expected[item.formLabel],isText=['SHORT_TEXT','LONG_TEXT'].includes(item.formDefinition.type)
  if(detail==='summary'&&isText){assert.ok(!columns.includes(prefix+'_value'));continue}
  const encoded=data[prefix+'_value']
  assert.ok(columns.includes(prefix+'_value'))
  if(value===null)assert.equal(encoded,'');else if(typeof value==='number')assert.equal(Number(encoded),value);else if(typeof value==='object'||isText)assert.deepEqual(JSON.parse(encoded),value);else assert.equal(encoded,value)
  assert.equal(data[prefix+'_state'],f.v3?(item.formLabel==='hidden'?'NOT_SHOWN':item.formLabel==='missing'?'SHOWN_MISSING':'ANSWERED'):'')
  if(item.formLabel==='sum'){assert.equal(data[prefix+'_O001_value'],'100');assert.equal(data[prefix+'_O002_value'],'0')}
  if(item.formLabel==='matrix'&&f.v3){assert.equal(data[prefix+'_R002_value'],'');assert.equal(data[prefix+'_R002_state'],'REFUSED')}
  if(item.formLabel==='other'){if(detail==='full')assert.equal(JSON.parse(data[prefix+'_other_text']),'=其他, "说明"');else assert.ok(!columns.includes(prefix+'_other_text'))}
  if(dictionary){const field=dictionary.columns.find(x=>x.name===prefix+'_value');assert.equal(field.formSource.factsSchemaVersion,f.v3?3:2);assert.equal(field.formSource.itemKey,item.formDefinition.itemKey);assert.deepEqual(field.formSource.options,item.formDefinition.options.map(x=>({optionKey:x.optionKey,label:x.label})));assert.equal(field.formSource.formulaGuard,'EXCEL_APOSTROPHE_PREFIX')}
 }
 if(dictionary){assert.deepEqual(dictionary.columns.map(x=>x.name),columns);const {createHash}=await import('node:crypto');assert.equal(dictionary.schemaVersion,createHash('sha256').update(JSON.stringify(dictionary.columns)).digest('hex'))}
 const stored=await prisma.exportArtifact.findUniqueOrThrow({where:{id:artifact.id}})
 observations.push({kind:'artifact',format,detail,downloadBytes:bytes.length,csvBytes:csv.length,storageBytes:fs.statSync(path.join(process.env.EXPORT_DIR,stored.storageKey)).size,fields:columns.length})
 assert.ok(!csv.includes(Buffer.from('POISON SHADOW')))
 return artifact
}
try{
 for(const [c,credentials,role] of [[teacher,fixture.teacher,'TEACHER'],[student,fixture.student,'STUDENT']]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{...credentials,expectedRole:role})}
 for(const mode of [{v3:false,publicMode:false},{v3:true,publicMode:true}]){
  const f=await create(mode.v3,mode.publicMode)
  await teacher.request(`/composite-assessments/${f.draft.id}/export/preview`)
  const full=await exportAndVerify(f,'full','zip');await exportAndVerify(f,'summary','zip');await exportAndVerify(f,'full','csv')
  // Existing artifacts must cease being downloadable immediately after ownership loss.
  await prisma.compositeAssessment.update({where:{id:f.draft.id},data:{createdBy:fixture.admin.username}})
  try{await teacher.request(full.downloadUrl.replace(/^\/api/,''),'GET',undefined,404)}finally{await prisma.compositeAssessment.update({where:{id:f.draft.id},data:{createdBy:fixture.teacher.username}})}
  check(JSON.stringify(mode)+' canonical report/cache and original queue CSV/ZIP exact values/dictionary/summary/SAV rejection/revoked download')
 }
 fs.writeFileSync(path.join(state,'c07-http-result.json'),JSON.stringify({passed:true,requests,checks,observations},null,2))
}catch(error){fs.writeFileSync(path.join(state,'c07-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,error:String(error)},null,2));throw error}finally{await prisma.$disconnect()}
process.exit(0)
