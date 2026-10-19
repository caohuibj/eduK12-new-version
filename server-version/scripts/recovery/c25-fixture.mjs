/** Fresh C25 actors/resources only. Accepted parents, children and facts use HTTP. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {deflateSync} from 'node:zlib'
import {runtime,products,prefix,pub,policy,persistenceMetadata} from './c25-client.mjs'
export const expiry=()=>new Date(Date.now()+3600000).toISOString()
export const attemptRoute=x=>`${x.base}/attempts/${x.attempt.id}`
export const checkpointRoute=x=>attemptRoute(x)+'/checkpoint'
export const persist=(h,f)=>h.write('c25-fixture-private.json',f)
function png(){
 const crc32=b=>{let n=0xffffffff;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
 const chunk=(type,data)=>{const t=Buffer.from(type),s=Buffer.alloc(4),c=Buffer.alloc(4);s.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([s,t,data,c])}
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,39,107,78,255]))),chunk('IEND',Buffer.alloc(0))])
}
export async function seed(h){
 const {prisma,backend}=await runtime(),old=h.read('fixture-private.json'),source=await prisma.user.findUniqueOrThrow({where:{username:old.student.username}})
 const f={schemaVersion:1,scope:'NEW_SYNTHETIC_C25_ONLY',actors:{},resources:{},products:{},cases:{},restoreCases:[],checkpointCases:[]}
 for(const [name,role] of [['teacher','TEACHER'],['student','STUDENT'],['otherTeacher','TEACHER'],['outsider','STUDENT'],['admin','ADMIN']]){
  const id=randomUUID(),username='c25-'+name+'-'+id
  await prisma.user.create({data:{id,username,passwordHash:source.passwordHash,role,accountDomain:role==='ADMIN'?'LEGACY':'TRAINING',teacherApproved:true,mustChangePassword:false}})
  f.actors[name]={id,username,password:old.student.password,role};persist(h,f)
 }
 f.courseId=(await prisma.course.create({data:{creatorId:f.actors.teacher.id,title:'C25 isolated feedback and checkpoint',courseCode:'C25-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})).id
 await prisma.courseStudent.create({data:{courseId:f.courseId,studentId:f.actors.student.id,status:'ACTIVE'}})
 const scaleSource=await prisma.scale.findUniqueOrThrow({where:{id:old.scaleId}}),cognitiveSource=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:old.assignmentId}})
 const {id:si,createdAt:sc,updatedAt:su,copySource,...scaleData}=scaleSource
 const {id:ci,createdAt:cc,updatedAt:cu,courseSnapshot,...cognitiveData}=cognitiveSource
 f.resources.scale=(await prisma.scale.create({data:{...scaleData,creatorId:f.actors.teacher.id,code:'C25-'+randomUUID(),name:'C25 immutable cloned Scale definition'}})).id
 f.resources.cognitive=(await prisma.cognitiveAssignment.create({data:{...cognitiveData,createdBy:f.actors.teacher.id,courseId:f.courseId,title:'C25 120-trial Go/No-Go',maxAttempts:100,listedStandalone:true,quotaSourceAssignmentId:null}})).id
 persist(h,f)
 const teacher=h.client(),admin=h.client();await teacher.login(f.actors.teacher,'TEACHER');await admin.login(f.actors.admin,'ADMIN')
 const bytes=png(),body=new FormData();body.append('image',new Blob([bytes],{type:'image/png'}),'c25-synthetic.png')
 const {asset}=await teacher.request('/situational/authoring/media/images','POST',body)
 const template=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/online-hand-calculated.json')))
 f.sjtResponses=template.goldenCases[0].responses;template.instrumentKey='c25-'+randomUUID()
 template.display.scenes[0].image={asset,altText:'C25 private synthetic stimulus',rightsStatus:'self_authored',rightsNote:'Synthetic one-pixel C25 qualification'}
 let draft=await teacher.request('/situational/authoring/online/drafts','POST',{template,authorizationPolicy:'COURSE_GRANT_V1'})
 const review={revision:draft.revision,contentDigest:draft.contentDigest}
 await teacher.request(`/situational/authoring/drafts/${draft.id}/request-review`,'POST',review)
 await admin.request(`/situational/authoring/drafts/${draft.id}/review`,'POST',{...review,approve:true,note:'C25 independent synthetic review'})
 draft=await teacher.request(`/situational/authoring/drafts/${draft.id}`);f.resources.sjt={release:draft.release,asset}
 const r=draft.release
 f.resources.grant=await admin.request(`/situational/authoring/releases/${r.id}/grants`,'POST',{instrumentKey:r.instrumentKey,instrumentVersion:r.instrumentVersion,definitionHash:r.definitionHash,contentDigest:r.contentDigest,granteeTeacherId:f.actors.teacher.id,courseId:f.courseId,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:expiry(),note:'C25 exact fresh Training distribution'})
 persist(h,f);return f
}
export async function actors(h,f){const all={};for(const [name,u] of Object.entries(f.actors)){all[name]=h.client();await all[name].login(u,u.role)}return all}
export async function draftProduct(teacher,f,{name,four=false}){
 const {form}=await import('./c20-materials-fixture.mjs')
 let p=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C25 '+name,questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:true,expiresAt:expiry(),trainingPersistencePolicy:policy(four)})
 const r=f.resources.sjt.release
 const items=four?[form('c25 answer'),{type:'SCALE',scaleId:f.resources.scale,required:true},{type:'COGNITIVE',cognitiveAssignmentId:f.resources.cognitive,required:true},{type:'SITUATIONAL',situationalInstrumentKey:r.instrumentKey,situationalInstrumentVersion:r.instrumentVersion,required:true}]:[{type:'SCALE',scaleId:f.resources.scale,required:true}]
 for(const item of items)p=await teacher.request(`${products}/${p.id}/items`,'POST',{revision:p.revision,item})
 return p
}
export async function publish(teacher,p){
 const preflight=await teacher.request(`${products}/${p.id}/preflight`,'POST',{revision:p.revision});assert.equal(preflight.ok,true,'C25 publication preflight')
 p=await teacher.request(`${products}/${p.id}/publish`,'POST',{revision:p.revision})
 const {prisma}=await runtime(),row=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}})
 for(const key of ['trainingFlowDraft','trainingFlowFrozen','trainingFlowDigest','trainingVariantDraft','trainingVariantFrozen','trainingVariantDigest','reportPackageKey','analysisProtocolKey'])assert.equal(row[key],null,'ordinary C25 publication must have no extra package/flow/variant')
 return p
}
export async function startAuthenticated(student,p){const {attempt}=await student.request(`${prefix}/${p.id}/attempts`,'POST',{});return {client:student,attempt,base:prefix,token:null}}
export async function startAnonymous(h,teacher,p,{round=false}={}){
 const token=await teacher.request(`${prefix}/${p.id}/public-tokens`,'POST',{expiresAt:p.expiresAt,maxUses:0,...(round?{groupIpPolicy:{schemaVersion:1,timeZone:'UTC'}}:{})})
 const client=h.client();await client.request('/auth/csrf');const first=await client.request(`${pub}/${token.token}/start`,'POST',{});client.recovery=first.recoveryToken;assert.ok(client.recovery)
 return {client,attempt:first.attempt,base:pub,token}
}
export async function retain(h,f,name,x,mode){
 const {prisma,children,loadFrozenActiveSlotSet}=await runtime(),row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.attempt.id}}),c=await children(row.id),slots=await loadFrozenActiveSlotSet(row.frozenActiveSlotSetEncrypted,prisma)
 const entry={name,mode,participant:row.userId?'AUTHENTICATED':'ANONYMOUS',compositeId:row.compositeAssessmentId,attemptId:row.id,courseId:row.deliveryCourseId,accessTokenId:row.accessTokenId,roundId:row.trainingFeedbackSnapshot.roundId,attemptEpoch:row.attemptEpoch,base:x.base,recoveryToken:x.client.recovery??null,token:x.token,contextSnapshotHash:row.contextSnapshotHash,slots:slots.slots,children:{scaleId:c.scales[0]?.id??null,cognitiveSessionId:c.cognitive[0]?.id??null,situationalAttemptId:c.sjt[0]?.id??null,situationalItemId:c.sjt[0]?.compositeItemId??null},steps:[]}
 assert.equal(row.trainingFeedbackSnapshot.accessTokenId,row.accessTokenId);assert.equal(row.trainingPersistenceSnapshot.roundId,entry.roundId)
 assert.deepEqual(x.attempt.trainingPersistence,persistenceMetadata(row))
 f.cases[name]=entry;f.restoreCases=Object.values(f.cases).map(({name,mode,participant,compositeId,attemptId,courseId,accessTokenId,roundId})=>({name,mode,participant,compositeId,attemptId,courseId,accessTokenId,roundId}))
 persist(h,f);return entry
}
export async function checkpointEnvelope(x){
 const {prisma,loadFrozenActiveSlotSet}=await runtime(),row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.attempt.id}}),slots=await loadFrozenActiveSlotSet(row.frozenActiveSlotSetEncrypted,prisma)
 const forms=await prisma.compositeFormSectionAttempt.findMany({where:{attemptId:row.id},include:{section:{include:{items:true}}}})
 return {schemaVersion:1,snapshotHash:row.trainingPersistenceSnapshotHash,definitionHash:row.frozenActiveSlotSetHash,drafts:slots.slots.filter(s=>s.unitType!=='COGNITIVE').map(s=>({slotKey:s.slotKey,answers:s.unitType==='FORM_SECTION'?Object.fromEntries(forms.find(c=>c.sectionId===s.sourceBinding.sectionId).section.items.map(i=>[i.id,'yes'])):{}})),cognitiveResults:[]}
}
export async function saveCheckpoint(h,f,name,x){
 const {prisma}=await runtime(),envelope=await checkpointEnvelope(x)
 const saved=await x.client.request(checkpointRoute(x),'PUT',{expectedRevision:0,attemptEpoch:x.attempt.attemptEpoch,envelope})
 assert.equal(saved.revision,1);assert.equal(saved.successfulSaveCount,1)
 const row=await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:x.attempt.id}})
 assert.ok(row.payloadEncrypted&&row.payloadHash&&row.expiresAt);assert.equal(row.roundId,f.cases[name].roundId)
 assert.deepEqual((await x.client.request(checkpointRoute(x))).envelope,envelope)
 f.checkpointCases=f.checkpointCases.filter(c=>c.name!==name).concat({name,attemptId:x.attempt.id,state:'PAYLOAD'});persist(h,f)
 return envelope
}
export async function markTombstones(h,f,names){
 const {prisma}=await runtime()
 for(const name of names){const c=f.cases[name],row=await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:c.attemptId}});assert.equal(row.payloadEncrypted,null);assert.equal(row.successfulSaveCount,1);f.checkpointCases.find(x=>x.name===name).state='TOMBSTONE'}persist(h,f)
}
export async function revive(h,f,name,actorsByName){
 const c=f.cases[name],client=c.participant==='AUTHENTICATED'?actorsByName.student:h.client()
 if(c.participant==='ANONYMOUS'){await client.request('/auth/csrf');client.recovery=c.recoveryToken}
 return {client,base:c.base,token:c.token,attempt:await client.request(`${c.base}/attempts/${c.attemptId}`)}
}
export function scaleAnswers(definition){
 const sets=new Map((definition.responseSets??[]).map(s=>[s.key,s.options]))
 return definition.items.map(item=>{const options=item.options??sets.get(item.responseSetKey);assert.ok(options?.length);return {itemCode:item.itemCode,responseValue:options.some(o=>o.value==='yes')?'yes':options[0].value,responseTimeMs:17}})
}
