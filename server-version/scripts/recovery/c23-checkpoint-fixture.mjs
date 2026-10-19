/** New synthetic users/resources only. Attempts and accepted FINALs use real HTTP. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma,products,prefix,pub,loadFrozenActiveSlotSet} from './c23-checkpoint-client.mjs'
import {form} from './c20-materials-fixture.mjs'
export const policy={schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:null}
export const iso=ms=>new Date(Date.now()+ms).toISOString()
export async function seed(h){
 const old=h.read('fixture-private.json'),source=await prisma.user.findUniqueOrThrow({where:{username:old.student.username}})
 const f={schemaVersion:1,scope:'NEW_SYNTHETIC_C23_ONLY',users:{},cases:[]}
 for(const [name,role] of [['teacher','TEACHER'],['student','STUDENT'],['outsider','STUDENT']]){
  const id=randomUUID(),username='c23-'+name+'-'+id
  await prisma.user.create({data:{id,username,passwordHash:source.passwordHash,role,accountDomain:'TRAINING',teacherApproved:true,mustChangePassword:false}})
  f.users[name]={id,username,password:old.student.password,role}
 }
 f.courseId=(await course(f)).id
 await prisma.courseStudent.create({data:{courseId:f.courseId,studentId:f.users.student.id,status:'ACTIVE'}})
 return f
}
export async function course(f){return prisma.course.create({data:{creatorId:f.users.teacher.id,title:'C23 isolated checkpoint',courseCode:'C23-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})}
export async function actors(h,f){const all={};for(const [name,u] of Object.entries(f.users)){all[name]=h.client();await all[name].login(u,u.role)}return all}
export async function product(teacher,f,{name='checkpoint',courseId=f.courseId,enabled=true,sections=2,expiresAt=iso(3600000)}={}){
 let p=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C23 '+name,questionnaireType:'COURSE',courseIds:[courseId],publicEnabled:true,expiresAt,...(enabled?{trainingPersistencePolicy:policy}:{})})
 p=await teacher.request(`${products}/${p.id}/items`,'POST',{revision:p.revision,item:form('c23 first')})
 for(let i=1;i<sections;i++){
  // Omitting formSectionId uses the revisioned product service's new-section path.
  p=await teacher.request(`${products}/${p.id}/items`,'POST',{revision:p.revision,item:form('c23 answer '+i)})
 }
 assert.equal(p.formSections.length,sections,'each revisioned standalone FORM add must produce a distinct nonempty section')
 const preflight=await teacher.request(`${products}/${p.id}/preflight`,'POST',{revision:p.revision});assert.equal(preflight.ok,true,'synthetic C23 publication preflight')
 p=await teacher.request(`${products}/${p.id}/publish`,'POST',{revision:p.revision})
 const row=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}})
 assert.equal(row.trainingFlowFrozen,null);assert.equal(row.trainingVariantFrozen,null)
 return p
}
export async function anonymous(h,teacher,p,{round=false,expiresAt=iso(1800000)}={}){
 const token=await teacher.request(`${prefix}/${p.id}/public-tokens`,'POST',{expiresAt,maxUses:0,...(round?{groupIpPolicy:{schemaVersion:1,timeZone:'UTC'}}:{})})
 const client=h.client();await client.request('/auth/csrf')
 const first=await client.request(`${pub}/${token.token}/start`,'POST',{});client.recovery=first.recoveryToken
 assert.ok(client.recovery);return {client,attempt:first.attempt,token,base:pub}
}
export async function authenticated(student,p){const {attempt}=await student.request(`${prefix}/${p.id}/attempts`,'POST',{});return {client:student,attempt,base:prefix}}
export const checkpoint=x=>`${x.base}/attempts/${x.attempt.id}/checkpoint`
export async function envelope(x){
 const row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.attempt.id}})
 const slots=await loadFrozenActiveSlotSet(row.frozenActiveSlotSetEncrypted,prisma)
 const children=await prisma.compositeFormSectionAttempt.findMany({where:{attemptId:row.id,status:'IN_PROGRESS'},include:{section:{include:{items:true}}}})
 const drafts=slots.slots.filter(s=>s.unitType==='FORM_SECTION').map(s=>{
  const child=children.find(c=>c.sectionId===s.sourceBinding.sectionId);assert.ok(child,'all no-flow FORM children are genuinely admitted')
  return {slotKey:s.slotKey,answers:Object.fromEntries(child.section.items.map(item=>[item.id,'yes']))}
 })
 assert.ok(drafts.length>0)
 return {schemaVersion:1,snapshotHash:row.trainingPersistenceSnapshotHash,definitionHash:row.frozenActiveSlotSetHash,drafts,cognitiveResults:[]}
}
export const save=(x,e,revision,expected=200)=>x.client.request(checkpoint(x),'PUT',{expectedRevision:revision,attemptEpoch:x.attempt.attemptEpoch,envelope:e},expected)
export const clear=(x,revision,expected=200)=>x.client.request(checkpoint(x),'DELETE',{expectedRevision:revision,attemptEpoch:x.attempt.attemptEpoch},expected)
export const read=x=>x.client.request(checkpoint(x))
export const row=x=>prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:x.attempt.id}})
export function retain(f,name,x){f.cases.push({name,attemptId:x.attempt.id,base:x.base,tokenId:x.token?.id??null,roundId:x.token?.roundId??null,recoveryToken:x.client.recovery??null});return x}
/** Exercise permitted expiry shortening on a NEW fixture; PostgreSQL supplies real time.
 * No clock is mocked, guards disabled, prior row changed or save count forged. */
export async function expire(x){
 await prisma.$executeRaw`UPDATE training_attempt_checkpoints SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 millisecond',revision=revision+1 WHERE attempt_id=${x.attempt.id} AND payload_encrypted IS NOT NULL`
 return row(x)
}
