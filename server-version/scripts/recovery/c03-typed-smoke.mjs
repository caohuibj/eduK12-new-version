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
const {buildCompositeReport}=require(path.join(backend,'dist/modules/composite/composite.service.js'))
const {mapCompositeSection}=require(path.join(backend,'dist/modules/assessment-runtime/form-section-definition.js'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const state=process.argv[2], status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
const fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=[];let requests=0
const check=name=>{checks.push(name);console.log('PASS',name)}
function client(){const cookies=new Map();return {async request(route,method='GET',body,expected=200){
  requests++;const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const text=await response.text();assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,500)}`)
  if(expected!==200)return text
  const data=JSON.parse(text);assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
}}}
const teacher=client(),student=client()
async function login(c,credentials,role){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{...credentials,expectedRole:role})}
async function ready(attemptId){
  const deadline=Date.now()+60000
  while(Date.now()<deadline){const s=await student.request(`/composite-assessments/attempts/${attemptId}/report-status`);if(s.reportStatus?.state==='READY')return;await new Promise(r=>setTimeout(r,500))}
  throw new Error('report READY deadline exceeded')
}
const typedDefinitions=[
  {type:'NUMBER',formType:'number',prompt:'数值事实',required:true,min:0,max:100,precision:4,value:12.3456},
  {type:'MATRIX_MULTIPLE',formType:'matrix_multiple',prompt:'矩阵事实',required:true,options:[{optionKey:'a',label:'甲'},{optionKey:'b',label:'乙'}],rows:[{rowKey:'r1',label:'第一行'},{rowKey:'r2',label:'第二行'}],value:{r1:['b','a'],r2:['a']}},
  {type:'NUMBER',formType:'number',prompt:'选填空值',required:false,value:null},
]
async function createTyped(withScale=false){
  let draft=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C03 synthetic typed '+(withScale?'whole':'form'),questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
  for(const spec of typedDefinitions)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:{type:'FORM',formType:'text_input',formLabel:spec.prompt}})
  if(withScale)draft=await teacher.request(`/questionnaire-products/${draft.id}/items`,'POST',{revision:draft.revision,item:{type:'SCALE',scaleId:fixture.scaleId}})
  // C03 intentionally does not enable advanced authoring. Configure only this
  // synthetic DRAFT before publication, then use production publish/FINAL HTTP.
  const items=await prisma.compositeAssessmentItem.findMany({where:{compositeAssessmentId:draft.id,type:'FORM'},orderBy:{position:'asc'}})
  const sectionId=items[0].formSectionId
  assert.ok(sectionId)
  for(const [i,item] of items.entries()){
    const {formType,value,...q}=typedDefinitions[i]
    await prisma.compositeAssessmentItem.update({where:{id:item.id},data:{formType,required:q.required,formSectionId:sectionId,formSectionPosition:i,formDefinition:{itemKey:'q_'+item.id.replaceAll('-','_'),options:[],rows:[],...q}}})
  }
  await prisma.compositeFormSection.deleteMany({where:{compositeAssessmentId:draft.id,id:{not:sectionId},items:{none:{}}}})
  const preflight=await teacher.request(`/questionnaire-products/${draft.id}/preflight`,'POST',{revision:draft.revision});assert.equal(preflight.ok,true)
  await teacher.request(`/questionnaire-products/${draft.id}/publish`,'POST',{revision:draft.revision})
  const {attempt}=await student.request(`/composite-assessments/${draft.id}/attempts`,'POST',{})
  assert.equal(attempt.currentItem.type,'FORM_SECTION')
  const section=attempt.currentItem
  const payload={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:items.map((item,i)=>({formItemId:item.id,value:typedDefinitions[i].value}))}
  return {draft,items,attempt,section,payload,route:`/composite-assessments/attempts/${attempt.id}/form-sections/${section.id}/submit`}
}
try{
  await login(teacher,fixture.teacher,'TEACHER');await login(student,fixture.student,'STUDENT')
  // Existing accepted snapshots and encrypted reports remain readable after upgrade.
  const old=await prisma.compositeAssessmentAttempt.findFirst({where:{status:'COMPLETED',compositeAssessment:{name:'C02 synthetic Form baseline'}}})
  assert.ok(old)
  const oldReport=await teacher.request(`/composite-assessments/${old.compositeAssessmentId}/attempts/${old.id}/report`)
  assert.ok(JSON.stringify(oldReport).includes('C02中文反思'))
  const oldSnapshot=await prisma.assessmentUnitSnapshot.findFirst({where:{compositeAttemptId:old.id,unitType:'FORM_SECTION'}})
  assert.equal(readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(oldSnapshot.collectionFactsEncrypted)).schemaVersion,1)
  const oldSection=await prisma.compositeFormSection.findFirst({where:{compositeAssessmentId:old.compositeAssessmentId},include:{items:true}})
  assert.equal(canonicalHash(mapCompositeSection(oldSection)),oldSnapshot.sourceDefinitionHash)
  check('historical frozen hash, V1 snapshot and teacher report readable after 167')
  const f=await createTyped()
  const copy=await teacher.request(`/questionnaire-products/${f.draft.id}/copy`,'POST',{requestId:randomUUID()})
  const copied=await prisma.compositeAssessmentItem.findMany({where:{compositeAssessmentId:copy.id,type:'FORM'},orderBy:{position:'asc'}})
  const original=await prisma.compositeAssessmentItem.findMany({where:{compositeAssessmentId:f.draft.id,type:'FORM'},orderBy:{position:'asc'}})
  assert.deepEqual(copied.map(x=>x.formDefinition),original.map(x=>x.formDefinition));assert.notEqual(copied[0].id,original[0].id)
  check('typed DRAFT publication, frozen admission and copy preserves definition with new DB IDs')
  const invalids=[
    {...f.payload,answers:[...f.payload.answers,{formItemId:f.items[0].id,value:3}]},
    {...f.payload,answers:f.payload.answers.map((a,i)=>i===0?{...a,value:'12.3456'}:a)},
    {...f.payload,answers:f.payload.answers.map((a,i)=>i===1?{...a,value:{hidden:['a']}}:a)},
    {...f.payload,answers:[...f.payload.answers,{formItemId:'hidden',value:'injected'}]},
  ]
  for(const payload of invalids)await student.request(f.route,'POST',payload,400)
  assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attempt.id}}),0)
  check('duplicate IDs, string-coerced number, hidden matrix row and injected field rejected before snapshot')
  await student.request(f.route,'POST',f.payload)
  assert.equal((await student.request(f.route,'POST',f.payload)).replayed,true)
  await ready(f.attempt.id)
  const snapshot=await prisma.assessmentUnitSnapshot.findFirst({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}})
  const facts=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(snapshot.collectionFactsEncrypted))
  assert.equal(facts.schemaVersion,2);assert.deepEqual(facts.items.map(x=>x.value),typedDefinitions.map(x=>x.value))
  assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attempt.id,unitType:'FORM_SECTION'}}),1)
  check('real PG typed V2 number/object/null snapshot and idempotent HTTP FINAL replay')
  const report=await teacher.request(`/composite-assessments/${f.draft.id}/attempts/${f.attempt.id}/report`)
  assert.ok(JSON.stringify(report).includes('12.3456'));assert.ok(JSON.stringify(report).includes('r1'))
  // Mutating this test-only String shadow must not affect a rebuilt report.
  await prisma.compositeFormAnswer.updateMany({where:{attemptId:f.attempt.id},data:{value:'CORRUPTED_LEGACY_SHADOW'}})
  const parent=await prisma.compositeAssessmentAttempt.findUnique({where:{id:f.attempt.id},include:{compositeAssessment:{include:{items:true,formSections:{include:{items:true}}}},scaleAssessments:true,cognitiveSessions:true,situationalAttempts:true,formAnswers:true}})
  assert.equal((await loadCompositeTypedFormValues(parent)).get(f.items[0].id),12.3456)
  const rebuilt=await buildCompositeReport(parent)
  assert.ok(JSON.stringify(rebuilt).includes('12.3456'));assert.ok(!JSON.stringify(rebuilt).includes('CORRUPTED_LEGACY_SHADOW'))
  check('teacher report and explicit rebuild read canonical typed facts, never String shadows')
  const denied=await teacher.request(`/composite-assessments/${f.draft.id}/export/preview?detail=full`,'GET',undefined,400)
  assert.ok(denied.includes('TYPED_FORM_EXPORT_NOT_AVAILABLE'))
  await teacher.request(`/composite-assessments/${f.draft.id}/export`,'POST',{detail:'full',format:'sav',anonymize:true},400)
  await student.request(`/questionnaire-products/${f.draft.id}/reports`,'GET',undefined,403)
  check('typed export preview/SAV registration explicitly rejected; student teacher-report route denied')
  const whole=await createTyped(true)
  await student.request(whole.route,'POST',whole.payload)
  const definition=await student.request(`/composite-assessments/attempts/${whole.attempt.id}/whole/definition`)
  const wholePayload={submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:unit.scale.definition.items.map(item=>({itemCode:item.itemCode,responseValue:item.options[0].value}))}))}
  await student.request(`/composite-assessments/attempts/${whole.attempt.id}/whole/submit`,'POST',wholePayload)
  await ready(whole.attempt.id)
  const wholeReport=await teacher.request(`/composite-assessments/${whole.draft.id}/attempts/${whole.attempt.id}/report`)
  assert.ok(JSON.stringify(wholeReport).includes('12.3456'))
  const final=await prisma.compositeAssessmentAttempt.findUnique({where:{id:whole.attempt.id}});assert.equal(final.status,'COMPLETED');assert.ok(final.aggregateInputHash)
  check('real whole Scale receipt/worker FINAL preserves prerequisite typed Form facts and report')
  fs.writeFileSync(path.join(state,'typed-http-result.json'),JSON.stringify({passed:true,requests,checks},null,2))
}catch(e){fs.writeFileSync(path.join(state,'typed-http-result.json'),JSON.stringify({passed:false,requests,checks,error:String(e)},null,2));throw e}
finally{await prisma.$disconnect()}
// Imported production queues have lifecycle handles; all test work is finished.
process.exit(0)
