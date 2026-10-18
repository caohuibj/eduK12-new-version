/** Explicit fresh synthetic C19 authors, Training course and candidate resources.
 * No historical user/course is edited. No attempt, child, session, quota, answer,
 * accepted snapshot, path proof, report or outbox job is seeded by this file.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {deflateSync} from 'node:zlib'
import {prisma,backend,require,products,normalizeProduct} from './c19-flow-client.mjs'
const {trainingFlowUnitKey,trainingFlowItemKey}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
export const unitKey=item=>item.type==='FORM'?trainingFlowUnitKey(item.formSectionId):trainingFlowItemKey(item.id)
export const formRows=product=>product.formSections.flatMap(section=>section.items.map(item=>({...item,formSectionId:section.id})))
export const expiry=()=>new Date(Date.now()+3600000).toISOString()
export const condition=(item,op,value)=>({op,field:{source:'ANSWER',instrumentKey:unitKey(item),itemKey:item.formDefinition.itemKey},...(value===undefined?{}:{value})})
export function form(label,type='SINGLE',required=true){const options=(label==='route'?['full','screen','early']:['yes','no']).map(optionKey=>({optionKey,label:optionKey}));return {type:'FORM',formType:{SINGLE:'single_choice',MULTIPLE:'multiple_choice',LIKERT:'likert'}[type],formLabel:label,required,formOptions:options.map(option=>({value:option.optionKey,label:option.label})),formPolicy:{version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'},formDefinition:{type,prompt:label,required,options,rows:[],allowRefusal:true}}}
function png(){const crc32=b=>{let n=0xffffffff;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0};const chunk=(type,data)=>{const t=Buffer.from(type),s=Buffer.alloc(4),c=Buffer.alloc(4);s.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([s,t,data,c])};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,39,107,78,255]))),chunk('IEND',Buffer.alloc(0))])}
export async function seed(h){
 const old=h.read('fixture-private.json'),sourceStudent=await prisma.user.findUniqueOrThrow({where:{username:old.student.username}}),sourceTeacher=await prisma.user.findUniqueOrThrow({where:{username:old.teacher.username}})
 const fixture={schemaVersion:1,label:'NEW_SYNTHETIC_C19_FIXTURE; NO_ACCEPTED_FACT_SEED',password:old.student.password,users:{},cases:[]}
 for(const [name,role]of [['teacher','TEACHER'],['admin','ADMIN'],['student','STUDENT'],['otherTeacher','TEACHER'],['outsider','STUDENT']]){
  const id=randomUUID(),username='c19-'+name+'-'+id
  await prisma.user.create({data:{id,username,passwordHash:sourceStudent.passwordHash,role,accountDomain:role==='ADMIN'?'LEGACY':'TRAINING',teacherApproved:true,mustChangePassword:false}})
  fixture.users[name]={id,username,role,password:fixture.password}
 }
 const course=await prisma.course.create({data:{creatorId:fixture.users.teacher.id,title:'C19 fresh synthetic Training conditional flow',courseCode:'C19-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 fixture.courseId=course.id
 await prisma.courseStudent.create({data:{courseId:course.id,studentId:fixture.users.student.id,status:'ACTIVE'}})
 const scaleSource=await prisma.scale.findUniqueOrThrow({where:{id:old.scaleId}}),assignmentSource=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:old.assignmentId}})
 const {id:scaleId,createdAt:sc,updatedAt:su,copySource,...scaleData}=scaleSource
 const {id:assignmentId,createdAt:ac,updatedAt:au,courseSnapshot,...assignmentData}=assignmentSource
 const scale=await prisma.scale.create({data:{...scaleData,creatorId:fixture.users.teacher.id,code:'C19-'+randomUUID(),name:'C19 conditional native Scale'}})
 const assignment=await prisma.cognitiveAssignment.create({data:{...assignmentData,createdBy:fixture.users.teacher.id,courseId:course.id,title:'C19 conditional 120-trial Go/No-Go',maxAttempts:100,listedStandalone:true,quotaSourceAssignmentId:null}})
 fixture.scaleId=scale.id;fixture.assignmentId=assignment.id
 const teacher=h.client(),admin=h.client();await teacher.login(fixture.users.teacher,'TEACHER');await admin.login(fixture.users.admin,'ADMIN')
 const imageBytes=png(),body=new FormData();body.append('image',new Blob([imageBytes],{type:'image/png'}),'c19-synthetic.png')
 const {asset}=await teacher.request('/situational/authoring/media/images','POST',body)
 const template=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/online-hand-calculated.json')))
 fixture.sjtResponses=template.goldenCases[0].responses
 template.instrumentKey='c19-'+randomUUID();template.display.scenes[0].image={asset,altText:'C19 private synthetic stimulus',rightsStatus:'self_authored',rightsNote:'Synthetic one-pixel C19 qualification'}
 let draft=await teacher.request('/situational/authoring/online/drafts','POST',{template,authorizationPolicy:'COURSE_GRANT_V1'})
 const review={revision:draft.revision,contentDigest:draft.contentDigest}
 await teacher.request(`/situational/authoring/drafts/${draft.id}/request-review`,'POST',review)
 await admin.request(`/situational/authoring/drafts/${draft.id}/review`,'POST',{...review,approve:true,note:'C19 independent synthetic review'})
 draft=await teacher.request(`/situational/authoring/drafts/${draft.id}`)
 const release=draft.release
 fixture.sjt={release,asset,imageBase64:imageBytes.toString('base64')}
 fixture.grant=await admin.request(`/situational/authoring/releases/${release.id}/grants`,'POST',{instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion,definitionHash:release.definitionHash,contentDigest:release.contentDigest,granteeTeacherId:fixture.users.teacher.id,courseId:course.id,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:expiry(),note:'C19 exact fresh Training distribution'})
 h.write('c19-fixture-private.json',fixture);return fixture
}
export async function logins(h,fixture){const actors={};for(const [name,credentials]of Object.entries(fixture.users)){actors[name]=h.client();await actors[name].login(credentials,credentials.role)}return actors}
export async function participant(h,fixture,label='case'){const id=randomUUID(),username='c19-'+label+'-'+id,source=await prisma.user.findUniqueOrThrow({where:{id:fixture.users.student.id}});await prisma.user.create({data:{id,username,passwordHash:source.passwordHash,role:'STUDENT',accountDomain:'TRAINING',mustChangePassword:false}});await prisma.courseStudent.create({data:{courseId:fixture.courseId,studentId:id,status:'ACTIVE'}});const user={id,username,password:fixture.password,role:'STUDENT'},client=h.client();await client.login(user,'STUDENT');return {user,client}}
const nativeItems=f=>[{type:'SCALE',scaleId:f.scaleId,required:true},{type:'COGNITIVE',cognitiveAssignmentId:f.assignmentId,required:true},{type:'SITUATIONAL',situationalInstrumentKey:f.sjt.release.instrumentKey,situationalInstrumentVersion:f.sjt.release.instrumentVersion,required:true}]
export async function draftFour(teacher,fixture,name='C19 four-tool flow'){
 let product=await teacher.request(products,'POST',{requestId:randomUUID(),name,questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:true,expiresAt:expiry()})
 product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:form('route')})
 const sectionId=formRows(product)[0].formSectionId
 for(const item of [form('multiple','MULTIPLE'),form('likert','LIKERT')])product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,formSectionId:sectionId,item})
 for(const item of nativeItems(fixture))product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item})
 return normalizeProduct(product)
}
export function mainConfig(product){
 const rows=formRows(product),route=rows.find(row=>row.formLabel==='route'),multiple=rows.find(row=>row.formLabel==='multiple'),likert=rows.find(row=>row.formLabel==='likert')
 const full={op:'AND',terms:[condition(route,'EQUALS','full'),condition(multiple,'INCLUDES','yes'),condition(likert,'EQUALS','yes')]}
 return {schemaVersion:1,blocks:[{blockKey:'intro',kind:'MATERIAL',title:'Start',body:'C19 visible introductory material'}, {blockKey:'source_form',kind:'INSTRUMENT',instrumentKey:unitKey(route)},
  {blockKey:'screen',kind:'END',termination:'SCREEN_OUT',when:condition(route,'EQUALS','screen')},
  {blockKey:'early',kind:'END',termination:'COMPLETE_EARLY',when:condition(route,'EQUALS','early')},
  {blockKey:'refusal_end',kind:'END',termination:'COMPLETE_EARLY',when:condition(route,'IS_MISSING')},
  {blockKey:'typed_material',kind:'MATERIAL',body:'C19 typed SINGLE MULTIPLE LIKERT material',when:full},
  ...product.items.filter(item=>item.type!=='FORM').map(item=>({blockKey:item.type.toLowerCase(),kind:'INSTRUMENT',instrumentKey:unitKey(item),when:full}))]}
}
export async function publish(teacher,product,config){product=await teacher.request(`${products}/${product.id}/training-flow`,'POST',{revision:product.revision,config});assert.deepEqual(product.trainingFlowDraft,config);assert.equal(product.trainingFlowFrozen,null);const preflight=await teacher.request(`${products}/${product.id}/preflight`,'POST',{revision:product.revision});assert.equal(preflight.ok,true,JSON.stringify(preflight));product=await teacher.request(`${products}/${product.id}/publish`,'POST',{revision:product.revision});assert.match(product.trainingFlowDigest,/^[a-f0-9]{64}$/);assert.equal(product.trainingFlowDigest,product.trainingFlowFrozen.flowDigest);return product}
export function formBody(attempt,mode='full'){const section=attempt.currentItem;assert.equal(section.type,'FORM_SECTION');return {submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:section.answers.map(item=>({formItemId:item.formItemId,value:mode==='refused'?{_surveyRefusal:true}:item.label==='route'?mode:item.label==='multiple'?['yes']:'yes'}))}}
