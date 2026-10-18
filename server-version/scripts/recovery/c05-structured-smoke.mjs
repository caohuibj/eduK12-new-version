/** C05 uses public authoring APIs; direct DB reads inspect accepted synthetic facts only. */
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
const options=[{optionKey:'a',label:'甲'},{optionKey:'b',label:'乙'},{optionKey:'c',label:'丙'}]
const rows=[{rowKey:'r1',label:'第一行'},{rowKey:'r2',label:'第二行'}]
const requiredSpecs=[
 {formType:'likert',type:'LIKERT',prompt:'结构化Likert',required:true,options,value:'b'},
 {formType:'matrix',type:'MATRIX',prompt:'结构化矩阵单选',required:true,options,rows,value:{r1:'b',r2:'a'}},
 {formType:'matrix_multiple',type:'MATRIX_MULTIPLE',prompt:'结构化矩阵多选',required:true,options,rows,minSelections:2,maxSelections:2,value:{r1:['b','a'],r2:['a','c']}},
 {formType:'rank_order',type:'RANK_ORDER',prompt:'结构化排序',required:true,options,value:['c','a','b']},
 {formType:'slider',type:'SLIDER',prompt:'结构化滑块',required:true,min:-2,max:2,step:0.5,value:0},
 {formType:'constant_sum',type:'CONSTANT_SUM',prompt:'结构化恒定总和',required:true,options,total:100,value:{a:0,b:25,c:75}},
]
const specs=[...requiredSpecs,...requiredSpecs.map(s=>({...s,prompt:'选填空'+s.prompt,required:false,value:null})),
 {formType:'constant_sum',type:'CONSTANT_SUM',prompt:'目标总和零',required:true,options,total:0,integerOnly:true,value:{a:0,b:0,c:0}},
 {formType:'text_input',prompt:'旧文本',required:true,value:'旧题原文'},
]
const invalidValues={
 0:['unknown',0,null],
 1:[{}, {r1:'a'}, {r1:'a',r2:'b',unknown:'c'}, {r1:'a',r2:'b','r1:other':'c'}, {r1:['a'],r2:'b'}],
 2:[{}, {r1:[],r2:['a','b']}, {r1:['a'],r2:['a','b']}, {r1:['a','b','c'],r2:['a','b']}, {r1:['a','a'],r2:['a','b']}, {r1:['a','b'],r2:['a','b'],unknown:[]}],
 3:[['a'],['a','a','b'],['a','b','unknown']],
 4:['0',-2.5,2.5,0.25],
 5:[{a:0,b:100},{a:-1,b:26,c:75},{a:0,b:25,c:74},{a:'0',b:25,c:75}],
 12:[{a:0,b:0,c:1},{a:-1,b:1,c:0}],
}
const authorItem=spec=>{const {formType,value,type,prompt,required,...constraints}=spec;return {type:'FORM',formType,formLabel:prompt,required,...(type?{formDefinition:{type,prompt,required,options:[],rows:[],...constraints}}:{})}}
async function createForm(withScale=false,publicMode=false){
 let draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C05 synthetic '+(publicMode?'anonymous':withScale?'whole':'section'),questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}: {})})
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
 assert.equal(section.answers[0].formDefinition.type,'LIKERT')
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
async function submitSections(f,{validate=false}={}){
 let attempt=f.attempt;const payloads=[]
 while(attempt.currentItem?.type==='FORM_SECTION'){
  const section=attempt.currentItem
  const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:section.answers.map(item=>{
   const index=f.items.findIndex(x=>x.id===item.formItemId)
   assert.deepEqual(item.formDefinition??null,specs[index].type?{...authorItem(specs[index]).formDefinition,itemKey:'q_'+item.formItemId}:null)
   return {formItemId:item.formItemId,value:specs[index].value}
  })}
  const route=`${f.prefix}/attempts/${f.attempt.id}/form-sections/${section.id}/submit`
  const index=f.items.findIndex(x=>x.id===payload.answers[0].formItemId)
  if(validate){
   const invalids=invalidValues[index]??[]
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
 // Malformed schemas are rejected at authoring without changing revision or storage.
 const draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C05 rejects',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
 const malformed=[authorItem({...specs[0],options:[]}),authorItem({...specs[1],rows:[]}),authorItem({...specs[1],rows:[rows[0],rows[0]]}),authorItem({...specs[2],minSelections:3,maxSelections:2}),authorItem({...specs[4],min:3,max:2}),authorItem({...specs[4],step:0}),authorItem({...specs[5],total:-1}),{...authorItem(specs[0]),formDefinition:undefined},authorItem({...specs[0],allowRefusal:true}),authorItem({...specs[0],itemKey:'q_injected'})]
 for(const item of malformed)await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item},400)
 const unchanged=await teacher.request(`/questionnaire-products/${draft.id}`);assert.equal(unchanged.revision,draft.revision);assert.equal(unchanged.items.length,0)
 check('strict structured schema rejects empty options/rows, duplicate keys, invalid bounds and unopened policies before any write')
 for(const publicMode of [false,true]){
  const f=await createForm(false,publicMode)
  const submitted=await submitSections(f,{validate:!publicMode})
  await facts(f,specs.map(x=>x.value))
  const changed=structuredClone(submitted[0]);changed.answers[0].value='a';await f.c.request(f.route,'POST',changed,409)
  await ready(f)
  const report=publicMode?await f.c.request(`${f.prefix}/attempts/${f.attempt.id}/report`):await teacher.request(`/composite-assessments/${f.draft.id}/attempts/${f.attempt.id}/report`)
  const reportText=JSON.stringify(report)
  for(const marker of ['结构化矩阵单选','结构化矩阵多选','结构化排序','结构化恒定总和'])assert.ok(reportText.includes(marker),marker)
  check(`${publicMode?'anonymous recovery':'logged-in'} author/publish/section FINAL preserves six structured values, optional null, zero-sum and legacy facts; exact replay immutable and changed replay rejected`)
 }
 for(const publicMode of [false,true]){
  const whole=await createForm(true,publicMode)
  await submitSections(whole)
  const definition=await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/definition`)
  const payload={submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:unit.scale.definition.items.map(item=>({itemCode:item.itemCode,responseValue:item.options[0].value}))}))}
  await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/submit`,'POST',payload)
  await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/whole/submit`,'POST',payload)
  await ready(whole);const snapshots=await facts(whole,specs.map(x=>x.value))
  const wholeReport=publicMode?await whole.c.request(`${whole.prefix}/attempts/${whole.attempt.id}/report`):await teacher.request(`/composite-assessments/${whole.draft.id}/attempts/${whole.attempt.id}/report`)
  assert.ok(JSON.stringify(wholeReport).includes('结构化矩阵多选'))
  observations.push({kind:'storage',publicMode,snapshots:snapshots.length,encryptedFactBytes:snapshots.reduce((n,s)=>n+Buffer.byteLength(s.collectionFactsEncrypted),0)})
  check(`${publicMode?'anonymous':'logged-in'} section + whole Scale receipt/replay and real worker report consume identical structured V2 facts`)
  await teacher.request(`/composite-assessments/${whole.draft.id}/export/preview?detail=full`,'GET',undefined,400)
 }
 check('typed exports remain explicitly unavailable until C07')
 fs.writeFileSync(path.join(state,'c05-http-result.json'),JSON.stringify({passed:true,requests,checks,observations},null,2))
} catch(error) {fs.writeFileSync(path.join(state,'c05-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,error:String(error)},null,2));throw error}
finally {await prisma.$disconnect()}
process.exit(0)
