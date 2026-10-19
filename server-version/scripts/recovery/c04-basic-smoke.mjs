/** C04 uses public authoring APIs; direct DB reads inspect accepted synthetic facts only. */
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
const longText='中文长文本，保留换行与引号。"\n'.repeat(300)
const specs=[
 {formType:'number',type:'NUMBER',prompt:'零和负数',required:true,min:-10,max:10,precision:2,step:0.25,value:0},
 {formType:'long_text',type:'LONG_TEXT',prompt:'长文本事实',required:true,maxLength:10000,value:longText},
 {formType:'date',type:'DATE',prompt:'闰年日期',required:true,value:'2024-02-29'},
 {formType:'time',type:'TIME',prompt:'分钟时间',required:true,timeZone:'UTC',value:'00:00'},
 {formType:'number',type:'NUMBER',prompt:'选填空数值',required:false,value:null},
 {formType:'long_text',type:'LONG_TEXT',prompt:'选填空文本',required:false,value:null},
 {formType:'text_input',prompt:'旧文本',required:true,value:'旧题原文'},
]
const authorItem=spec=>{const {formType,value,type,prompt,required,...constraints}=spec;return {type:'FORM',formType,formLabel:prompt,required,...(type?{formDefinition:{type,prompt,required,options:[],rows:[],...constraints}}:{})}}
async function createForm(withScale=false,publicMode=false){
 let draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C04 synthetic '+(publicMode?'anonymous':withScale?'whole':'section'),questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}: {})})
 for(const spec of specs)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:authorItem(spec)})
 if(withScale)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:{type:'SCALE',scaleId:fixture.scaleId}})
 const items=await prisma.compositeAssessmentItem.findMany({where:{compositeAssessmentId:draft.id,type:'FORM'},orderBy:{position:'asc'}})
 for(const [index,item] of items.entries()) {
  if(specs[index].type)assert.equal(item.formDefinition.itemKey,'q_'+item.id)
  else assert.equal(item.formDefinition,null)
 }
 draft=await teacher.request(`/questionnaire-products/${draft.id}`)
 const preflight=await teacher.request(`/questionnaire-products/${draft.id}/preflight`,'POST',{revision:draft.revision});assert.equal(preflight.ok,true)
 await teacher.request(`/questionnaire-products/${draft.id}/publish`,'POST',{revision:draft.revision})
 let attempt,c=student,prefix='/composite-assessments'
 if(publicMode){
  const anonymous=client()
  const token=await teacher.request(`/composite-assessments/${draft.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:5})
  assert.ok(token.token)
  const started=await anonymous.request(`/public/composite-assessments/${token.token}/start`,'POST',{})
  anonymous.recovery=started.recoveryToken;assert.ok(anonymous.recovery);attempt=started.attempt;c=anonymous;prefix='/public/composite-assessments'
  const recovered=await anonymous.request(`/public/composite-assessments/${token.token}/start`,'POST',{recoveryToken:anonymous.recovery})
  assert.equal(recovered.attempt.id,attempt.id)
 }else ({attempt}=await student.request(`/composite-assessments/${draft.id}/attempts`,'POST',{}))
 const section=attempt.currentItem;assert.equal(section.type,'FORM_SECTION')
 assert.equal(section.answers[0].formDefinition.min,-10)
 const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:section.answers.map(item=>({formItemId:item.formItemId,value:specs[items.findIndex(x=>x.id===item.formItemId)].value}))}
 return {draft,items,attempt,section,payload,c,prefix,route:`${prefix}/attempts/${attempt.id}/form-sections/${section.id}/submit`}
}
async function facts(f,expected){
 const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}})
 assert.equal(snapshots.length,specs.length)
 for(const snapshot of snapshots){
  const fact=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(snapshot.collectionFactsEncrypted))
  for(const item of fact.items){const index=f.items.findIndex(x=>x.id===item.key);assert.ok(index>=0);assert.equal(fact.schemaVersion,specs[index].type?2:1);assert.deepEqual(item.value,expected[index])}
 }
 const parent=await prisma.compositeAssessmentAttempt.findUnique({where:{id:f.attempt.id},include:{compositeAssessment:{include:{items:true,formSections:{include:{items:true}}}}}})
 const values=await loadCompositeTypedFormValues(parent)
 for(const [index,item] of f.items.entries())if(specs[index].type)assert.deepEqual(values.get(item.id),expected[index])
 return snapshots
}
async function submitSections(f,{negative=false,validate=false}={}){
 let attempt=f.attempt;const payloads=[]
 while(attempt.currentItem?.type==='FORM_SECTION'){
  const section=attempt.currentItem
  const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:section.answers.map(item=>{
   const index=f.items.findIndex(x=>x.id===item.formItemId)
   assert.deepEqual(item.formDefinition??null,specs[index].type?{...authorItem(specs[index]).formDefinition,itemKey:'q_'+item.formItemId}:null)
   return {formItemId:item.formItemId,value:index===0&&negative?-1.25:specs[index].value}
  })}
  const route=`${f.prefix}/attempts/${f.attempt.id}/form-sections/${section.id}/submit`
  const index=f.items.findIndex(x=>x.id===payload.answers[0].formItemId)
  if(validate){
   const invalids={0:['0',10.25,0.333,null],1:['x'.repeat(10001)],2:['2023-02-29'],3:['24:00']}[index]??[]
   const before=await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}})
   for(const value of invalids){const invalid=structuredClone(payload);invalid.submissionId=randomUUID();invalid.answers[0].value=value;await f.c.request(route,'POST',invalid,400);assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}}),before)}
  }
  await f.c.request(route,'POST',payload)
  const first=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'},select:{id:true,collectionFactsEncrypted:true},orderBy:{id:'asc'}})
  const replay=await f.c.request(route,'POST',payload);assert.equal(replay.replayed,true)
  assert.deepEqual(await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'},select:{id:true,collectionFactsEncrypted:true},orderBy:{id:'asc'}}),first)
  payloads.push(payload)
  attempt=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}`)
 }
 return payloads
}
async function ready(f){
 const deadline=Date.now()+60000
 while(Date.now()<deadline){const s=await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/report-status`);if(s.reportStatus?.state==='READY')return;await new Promise(r=>setTimeout(r,500))}
 throw new Error('report READY deadline exceeded')
}
try {
 for(const [c,credentials,role] of [[teacher,fixture.teacher,'TEACHER'],[student,fixture.student,'STUDENT']]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{...credentials,expectedRole:role})}
 if(process.env.C04_PHASE==='auth'){
  specs.splice(1)
  const a=await createForm(false,true),b=await createForm(false,true)
  const payloads=await submitSections(b);await ready(b)
  const snapshotBefore=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:b.attempt.id},orderBy:{id:'asc'}})
  const reportBefore=await b.c.request(`${b.prefix}/attempts/${b.attempt.id}/report`)
  const wrong=client();wrong.recovery='invalid-synthetic-recovery-credential'
  await wrong.request(`${a.prefix}/attempts/${a.attempt.id}`,'GET',undefined,403)
  await a.c.request(`${b.prefix}/attempts/${b.attempt.id}`,'GET',undefined,403)
  await a.c.request(b.route,'POST',payloads[0],403)
  await a.c.request(`${b.prefix}/attempts/${b.attempt.id}/report`,'GET',undefined,403)
  assert.deepEqual(await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:b.attempt.id},orderBy:{id:'asc'}}),snapshotBefore)
  assert.deepEqual(await b.c.request(`${b.prefix}/attempts/${b.attempt.id}/report`),reportBefore)
  assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:a.attempt.id}}),0)
  check('wrong recovery credential and A credential reading/submitting/reporting B are 403; B accepted snapshot/report unchanged and A has no accepted facts')
  fs.writeFileSync(path.join(state,'c04-http-result.json'),JSON.stringify({passed:true,phase:'auth',requests,checks,observations},null,2))
  await prisma.$disconnect();process.exit(0)
 }
 if(process.env.C04_PHASE !== 'whole') {
 // Strict public API rejects malformed definitions without adding rows or changing revision.
 const draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C04 rejects',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
 for(const item of [authorItem({...specs[0],min:2,max:1}),authorItem({...specs[3],timeZone:undefined}),{...authorItem(specs[0]),formDefinition:undefined},authorItem({...specs[0],allowRefusal:true}),authorItem({...specs[0],itemKey:'q_injected'}),authorItem({...specs[0],type:'SLIDER',formType:'slider'})])await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item},400)
 const unchanged=await teacher.request(`/questionnaire-products/${draft.id}`);assert.equal(unchanged.revision,draft.revision);assert.equal(unchanged.items.length,0)
 check('public authoring rejects malformed constraints, timezone, identities and unopened policies without writes')
 const f=await createForm()
 const submitted=await submitSections(f,{validate:true})
 check('invalid numeric type/range/precision, required null, text length and impossible date/time rejected before accepted facts')
 await facts(f,specs.map(x=>x.value))
 const changed=structuredClone(submitted[0]);changed.answers[0].value=-1.25;await f.c.request(f.route,'POST',changed,409)
 await ready(f)
 const report=await teacher.request(`/composite-assessments/${f.draft.id}/attempts/${f.attempt.id}/report`)
 assert.ok(JSON.stringify(report).includes('2024-02-29'));assert.ok(JSON.stringify(report).includes(JSON.stringify(longText).slice(1,-1)))
 check('logged-in authoring/publish/section FINAL retains 0/null/long text/date/time in V2 facts and report; replay is immutable')
 const anon=await createForm(false,true);await submitSections(anon,{negative:true});await ready(anon)
 await facts(anon,specs.map((x,i)=>i===0?-1.25:x.value))
 const anonReport=await anon.c.request(`${anon.prefix}/attempts/${anon.attempt.id}/report`);assert.ok(JSON.stringify(anonReport).includes('-1.25'))
 check('anonymous recovery credential resumes same attempt; negative number and section replay preserved')
 }
 const whole=await createForm(true)
 await submitSections(whole)
 const definition=await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/definition`)
 const payload={submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:unit.scale.definition.items.map(item=>({itemCode:item.itemCode,responseValue:item.options[0].value}))}))}
 await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/submit`,'POST',payload)
 await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/submit`,'POST',payload)
 await ready(whole);await facts(whole,specs.map(x=>x.value))
 const wholeReport=await teacher.request(`/composite-assessments/${whole.draft.id}/attempts/${whole.attempt.id}/report`)
 assert.ok(JSON.stringify(wholeReport).includes('2024-02-29'))
 check('section plus whole Scale receipt/replay and real worker report retain the same typed facts')
 await teacher.request(`/composite-assessments/${whole.draft.id}/export/preview?detail=full`,'GET',undefined,400)
 check('typed export remains explicitly unavailable until C07')
 fs.writeFileSync(path.join(state,'c04-http-result.json'),JSON.stringify({passed:true,requests,checks,observations,longTextCharacters:longText.length},null,2))
} catch(error) {fs.writeFileSync(path.join(state,'c04-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,error:String(error)},null,2));throw error}
finally {await prisma.$disconnect()}
process.exit(0)
