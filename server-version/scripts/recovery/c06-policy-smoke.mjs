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
const checks=JSON.parse(process.env.C06_COMPLETED_CHECKS||'[]');let requests=0
const observations=[]
const check=name=>{checks.push(name);console.log('PASS',name)}
function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200){
  requests++;const start=performance.now();const wire=body===undefined?undefined:JSON.stringify(body)
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}) ,...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(wire===undefined?{}:{body:wire})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const text=await response.text();observations.push({method,status:response.status,requestBytes:wire?Buffer.byteLength(wire):0,responseBytes:Buffer.byteLength(text),durationMs:Math.round(performance.now()-start)})
  assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,500)}`)
  const data=JSON.parse(text);if(expected!==200)return data
  assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
}}}
const teacher=client(),student=client()
const authoredRows=d=>d.formSections.flatMap(section=>section.items.map(item=>({...item,formSectionId:section.id})))
const policy={version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}
const options=[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'},{optionKey:'other',label:'其他'}]
const make=(label,type,extra={},required=true,override={})=>({type:'FORM',formType:{SINGLE:'single_choice',MULTIPLE:'multiple_choice',SHORT_TEXT:'text_input',MATRIX:'matrix'}[type],formLabel:label,required,...(['SINGLE','MULTIPLE'].includes(type)?{formOptions:options.map(o=>({value:o.optionKey,label:o.label}))}:{}),formPolicy:{...policy,...override},formDefinition:{type,prompt:label,required,options:['SINGLE','MULTIPLE','MATRIX'].includes(type)?options:[],rows:[],...extra}})
async function createForm({publicMode=false,whole=false,hiddenNot=false,refuse=true}={}){
 let draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C06 policy synthetic',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})})
 draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:make('source','SINGLE')})
 const source=authoredRows(draft).find(x=>x.formLabel==='source'), sectionId=source.formSectionId
 assert.ok(sectionId);assert.equal(source.formDefinition.itemKey,'q_'+source.id)
 const items=[make('hidden','SHORT_TEXT',{displayIf:{itemKey:source.formDefinition.itemKey,operator:'EQUALS',optionKey:'yes'}},true,{hiddenRequired:hiddenNot?'NOT_SATISFIED':'EXEMPT'}),make('refused','SHORT_TEXT',{allowRefusal:true}),make('missing','SHORT_TEXT',{},false),make('other','MULTIPLE',{otherOptionKey:'other',otherMaxLength:12,exclusiveOptionKeys:['no']}),make('matrix','MATRIX',{allowRefusal:true,rows:[{rowKey:'r1',label:'一'},{rowKey:'r2',label:'二'}]})]
 for(const item of items)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,formSectionId:sectionId,item})
 if(whole)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:{type:'SCALE',scaleId:fixture.scaleId}})
 const original=structuredClone(draft)
 const copied=await teacher.request(`/questionnaire-products/${draft.id}/copy`,'POST',{requestId:randomUUID()})
 const copy=await teacher.request(`/questionnaire-products/${copied.id}`)
 const copiedSource=authoredRows(copy).find(x=>x.formLabel==='source'),copiedHidden=authoredRows(copy).find(x=>x.formLabel==='hidden')
 assert.notEqual(copiedSource.id,source.id);assert.equal(copiedHidden.formDefinition.displayIf.itemKey,copiedSource.formDefinition.itemKey);assert.deepEqual(copiedHidden.formPolicy,items[0].formPolicy)
 assert.deepEqual((await teacher.request(`/questionnaire-products/${draft.id}`)).items,original.items)
 const preflight=await teacher.request(`/questionnaire-products/${draft.id}/preflight`,'POST',{revision:draft.revision});assert.equal(preflight.ok,true,JSON.stringify(preflight))
 await teacher.request(`/questionnaire-products/${draft.id}/publish`,'POST',{revision:draft.revision})
 await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,formSectionId:sectionId,item:make('immutable','SHORT_TEXT')},409)
 let attempt,c=student,prefix='/composite-assessments'
 if(publicMode){c=client();const token=await teacher.request(`/composite-assessments/${draft.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:5});const started=await c.request(`/public/composite-assessments/${token.token}/start`,'POST',{});c.recovery=started.recoveryToken;attempt=started.attempt;prefix='/public/composite-assessments';assert.equal((await c.request(`/public/composite-assessments/${token.token}/start`,'POST',{recoveryToken:c.recovery})).attempt.id,attempt.id)}
 else ({attempt}=await c.request(`/composite-assessments/${draft.id}/attempts`,'POST',{}))
 const section=attempt.currentItem;assert.equal(section.type,'FORM_SECTION');assert.equal(section.answers.length,6)
 const byLabel=Object.fromEntries(section.answers.map(a=>[a.label,a.formItemId]))
 const answers=[{formItemId:byLabel.source,value:'no'},{formItemId:byLabel.refused,value:refuse?{_surveyRefusal:true}:'answered'},{formItemId:byLabel.other,value:['other'],otherText:'细节'},{formItemId:byLabel.matrix,value:{r1:'yes',r2:refuse?{_surveyRefusal:true}:'no'}}]
 const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers}
 return {draft,attempt,section,byLabel,payload,c,prefix,publicMode,whole,expected:refuse||hiddenNot?'NOT_SATISFIED':'SATISFIED',route:`${prefix}/attempts/${attempt.id}/form-sections/${section.id}/submit`}
}
async function ready(f){for(let i=0;i<120;i++){const s=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/report-status`);if(s.reportStatus?.state==='READY')return;await new Promise(r=>setTimeout(r,500))}throw Error('report timeout')}
async function verify(f){
 await ready(f)
 const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attempt.id}});assert.equal(parent.status,'COMPLETED');assert.equal(parent.taskSatisfaction,f.expected)
 const section=await prisma.compositeFormSectionAttempt.findFirstOrThrow({where:{attemptId:f.attempt.id}});assert.equal(section.taskSatisfaction,f.expected)
 const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}});assert.equal(snapshots.length,1)
 const fact=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(snapshots[0].collectionFactsEncrypted));assert.equal(fact.schemaVersion,3)
 const facts=Object.fromEntries(fact.items.map(x=>[x.key,x]));assert.equal(facts[f.byLabel.hidden].state,'NOT_SHOWN');assert.equal(facts[f.byLabel.missing].state,'SHOWN_MISSING');assert.equal(facts[f.byLabel.other].otherText,'细节')
 const refused=typeof f.payload.answers[1].value==='object';assert.equal(facts[f.byLabel.refused].state,refused?'REFUSED':'ANSWERED');assert.equal(facts[f.byLabel.matrix].rowStates.r2,refused?'REFUSED':'ANSWERED')
 const state=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}`);assert.equal(state.taskSatisfied,f.expected==='SATISFIED')
 await ready(f)
 const report=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/report`);assert.equal(report.taskSatisfied,f.expected==='SATISFIED');assert.ok(JSON.stringify(report).includes('NOT_SHOWN'));assert.ok(JSON.stringify(report).includes('SHOWN_MISSING'));assert.ok(JSON.stringify(report).includes('细节'))
 if(!f.publicMode){const teacherReport=await teacher.request(`/composite-assessments/${f.draft.id}/attempts/${f.attempt.id}/report`);assert.equal(teacherReport.taskSatisfied,f.expected==='SATISFIED');const available=await student.request('/questionnaire-products/available');const rows=Array.isArray(available)?available:available.list;const row=rows.find(x=>x.id===f.draft.id);assert.ok(row);assert.equal(row.hasSatisfiedAttempt,f.expected==='SATISFIED');assert.equal(row.latestCompletedAttempt.id,f.attempt.id)}
 observations.push({kind:'accepted-storage',publicMode:f.publicMode,whole:f.whole,taskSatisfaction:f.expected,factBytes:Buffer.byteLength(snapshots[0].collectionFactsEncrypted)})
}
try{
 for(const [c,credentials,role] of [[teacher,fixture.teacher,'TEACHER'],[student,fixture.student,'STUDENT']]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{...credentials,expectedRole:role})}
 if(!checks.includes('A→Scale→B rejects append to A without revision/position mutation; trailing B accepts')) {
 let boundary=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C06 section boundary',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
 boundary=await teacher.request(`/questionnaire-products/${boundary.id}/items`,'POST',{revision:boundary.revision,item:make('A','SINGLE')})
 const sectionA=authoredRows(boundary).find(x=>x.formLabel==='A').formSectionId
 boundary=await teacher.request(`/questionnaire-products/${boundary.id}/items`,'POST',{revision:boundary.revision,item:{type:'SCALE',scaleId:fixture.scaleId}})
 boundary=await teacher.request(`/questionnaire-products/${boundary.id}/items`,'POST',{revision:boundary.revision,item:make('B','SINGLE')})
 const sectionB=authoredRows(boundary).find(x=>x.formLabel==='B').formSectionId
 await teacher.request(`/questionnaire-products/${boundary.id}/items`,'POST',{revision:boundary.revision,formSectionId:sectionA,item:make('bad-crossing','SHORT_TEXT')},400)
 const unchanged=await teacher.request(`/questionnaire-products/${boundary.id}`);assert.equal(unchanged.revision,boundary.revision);assert.deepEqual(unchanged.items,boundary.items)
 boundary=await teacher.request(`/questionnaire-products/${boundary.id}/items`,'POST',{revision:boundary.revision,formSectionId:sectionB,item:make('B appended','SHORT_TEXT')})
 assert.equal(authoredRows(boundary).find(x=>x.formLabel==='B appended').formSectionId,sectionB)
 check('A→Scale→B rejects append to A without revision/position mutation; trailing B accepts')
 }
 for(const mode of [{},{publicMode:true},{whole:true},{whole:true,publicMode:true},{refuse:false},{refuse:false,hiddenNot:true}]){
  if(checks.includes(JSON.stringify(mode)+' author/copy/publish/FINAL/replay/authoritative four-state facts/qualification/report'))continue
  const f=await createForm(mode)
  const bad=[...['injected',null,{_surveyRefusal:true}].map(value=>[...f.payload.answers,{formItemId:f.byLabel.hidden,value}]),f.payload.answers.map(a=>a.formItemId===f.byLabel.other?{...a,value:['no','yes']}:a),f.payload.answers.map(a=>a.formItemId===f.byLabel.other?{...a,value:['yes']}:a),f.payload.answers.map(a=>a.formItemId===f.byLabel.matrix?{...a,value:{r1:'yes',r2:'no',unknown:'yes'}}:a)]
  for(const answers of bad){await f.c.request(f.route,'POST',{...f.payload,submissionId:randomUUID(),answers},400);assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attempt.id}}),0)}
  await f.c.request(f.route,'POST',f.payload);const before=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id}});const replay=await f.c.request(f.route,'POST',f.payload);assert.equal(replay.replayed,true);assert.deepEqual(await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id}}),before)
  await f.c.request(f.route,'POST',{...f.payload,answers:f.payload.answers.map(a=>a.formItemId===f.byLabel.refused?{...a,value:'changed'}:a)},409)
  if(f.whole){const d=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/whole/definition`);const p={submissionId:randomUUID(),attemptEpoch:d.attemptEpoch,slotSetHash:d.slotSetHash,contextSnapshotHash:d.contextSnapshotHash,units:d.units.map(u=>({itemId:u.itemId,definitionHash:u.definitionHash,answers:u.scale.definition.items.map(i=>({itemCode:i.itemCode,responseValue:i.options[0].value}))}))};await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/whole/submit`,'POST',p);await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/whole/submit`,'POST',p)}
  await verify(f);check(JSON.stringify(mode)+' author/copy/publish/FINAL/replay/authoritative four-state facts/qualification/report')
 }
 fs.writeFileSync(path.join(state,'c06-http-result.json'),JSON.stringify({passed:true,requests,checks,observations},null,2))
}catch(error){fs.writeFileSync(path.join(state,'c06-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,error:String(error)},null,2));throw error}finally{await prisma.$disconnect()}
process.exit(0)
