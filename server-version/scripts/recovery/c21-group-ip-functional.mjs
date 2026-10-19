/** Real auth/product API authoring and existing anonymous FORM runtime. No historical edits. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,products,prefix,pub,denied,drainReports,children,pause} from './c21-group-ip-client.mjs'
import {form,formRows,unitKey,publish,formBody} from './c20-materials-fixture.mjs'
const h=harness('functional');let error
const iso=ms=>new Date(Date.now()+ms).toISOString(),policy={schemaVersion:1,timeZone:'UTC'}
try{
 const old=h.read('fixture-private.json'),source=await prisma.user.findUniqueOrThrow({where:{username:old.student.username}})
 const f={schemaVersion:1,scope:'NEW_SYNTHETIC_C21_ONLY',users:{},tokens:{},cases:[]}
 for(const [name,role] of [['teacher','TEACHER'],['admin','ADMIN'],['student','STUDENT'],['otherTeacher','TEACHER']]){
  const id=randomUUID(),username='c21-'+name+'-'+id
  await prisma.user.create({data:{id,username,passwordHash:source.passwordHash,role,accountDomain:role==='ADMIN'?'LEGACY':'TRAINING',teacherApproved:true,mustChangePassword:false}})
  f.users[name]={id,username,password:old.student.password,role}
 }
 const course=await prisma.course.create({data:{creatorId:f.users.teacher.id,title:'C21 real round qualification',courseCode:'C21-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}});f.courseId=course.id
 await prisma.courseStudent.create({data:{courseId:course.id,studentId:f.users.student.id,status:'ACTIVE'}})
 const actors={};for(const [name,u] of Object.entries(f.users)){actors[name]=h.client();await actors[name].login(u,u.role)}
 const {teacher,otherTeacher,student,admin}=actors
 async function product(name,opts={}){
  let p=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C21 '+name,questionnaireType:'COURSE',courseIds:[opts.courseId??course.id],publicEnabled:true,opensAt:opts.opensAt??iso(-86400000),expiresAt:opts.expiresAt??iso(7*86400000)})
  p=await teacher.request(`${products}/${p.id}/items`,'POST',{revision:p.revision,item:form('c21 answer')})
  if(opts.noFlow){const preflight=await teacher.request(`${products}/${p.id}/preflight`,'POST',{revision:p.revision});assert.equal(preflight.ok,true,JSON.stringify(preflight));return teacher.request(`${products}/${p.id}/publish`,'POST',{revision:p.revision})}
  return publish(teacher,p,{schemaVersion:1,blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(p)[0])}]})
 }
 const p=await product('prior-day task');f.productId=p.id
 const route=id=>`${prefix}/${id}/public-tokens`
 const mint=(p,extra={},expiry=iso(1800000),actor=teacher)=>actor.request(route(p.id),'POST',{expiresAt:expiry,maxUses:0,...extra})
 const start=async token=>{const client=h.client();await client.request('/auth/csrf');const first=await client.request(`${pub}/${token.token}/start`,'POST',{});client.recovery=first.recoveryToken;return {client,first}}
 const before=Date.now();const active=await mint(p,{groupIpPolicy:policy});f.tokens.active=active
 assert.ok(active.roundId);assert.ok(new Date(active.groupIpWindow.opensAt).getTime()>=before);assert.ok(new Date(active.groupIpWindow.opensAt).getTime()<=Date.now());assert.ok(new Date(p.opensAt)<new Date(active.groupIpWindow.opensAt))
 const raw=await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:active.id}});assert.equal(raw.trainingRoundId,active.roundId);assert.equal(raw.token,null);assert.ok(raw.tokenHash)
 const round=await prisma.trainingPublicRound.findUniqueOrThrow({where:{id:active.roundId}});assert.equal(round.courseId,course.id);assert.equal(round.compositeId,p.id);assert.equal(round.groupIpPolicy.activationDate,new Date(round.opensAt).toISOString().slice(0,10))
 const linked=await mint(p,{roundId:active.roundId},iso(900000));assert.equal(linked.roundId,active.roundId);assert.deepEqual(linked.groupIpWindow,active.groupIpWindow)
 const list=await teacher.request(route(p.id));assert.equal(list.list.find(t=>t.id===active.id).roundId,active.roundId)
 const revealed=await teacher.request(`${route(p.id)}/${active.id}/reveal`,'POST',{});assert.equal(revealed.token,active.token);assert.equal(revealed.roundId,active.roundId)
 const plain=await mint(p);f.tokens.plain=plain;assert.equal(plain.roundId,null);assert.equal(plain.groupIpWindow,null)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:plain.id}})).trainingRoundId,null)
 await teacher.request(route(p.id),'POST',{expiresAt:iso(49*3600000),maxUses:0,groupIpPolicy:policy},denied)
 await teacher.request(route(p.id),'POST',{expiresAt:iso(-1000),maxUses:0,groupIpPolicy:policy},denied)
 await teacher.request(route(p.id),'POST',{expiresAt:iso(1800000),maxUses:0,groupIpPolicy:policy,roundId:active.roundId},denied)
 for(const actor of [otherTeacher,student]){await actor.request(route(p.id),'POST',{expiresAt:iso(1800000),maxUses:0,roundId:active.roundId},denied);await actor.request(`${route(p.id)}/${active.id}/reveal`,'POST',{},denied)}
 const wrong=await product('wrong publication');await teacher.request(route(wrong.id),'POST',{expiresAt:iso(600000),maxUses:0,roundId:active.roundId},denied)
 const future=await product('future task',{opensAt:iso(3600000)});await teacher.request(route(future.id),'POST',{expiresAt:iso(7200000),maxUses:0,groupIpPolicy:policy},denied)
 const cutoff=await product('cutoff',{expiresAt:iso(600000)});await teacher.request(route(cutoff.id),'POST',{expiresAt:iso(1200000),maxUses:0,groupIpPolicy:policy},denied)
 // Explicit ADMIN authority is supported; this does not imply cross-teacher permission.
 const adminLink=await mint(p,{roundId:active.roundId},iso(600000),admin);assert.equal(adminLink.roundId,active.roundId)
 const noFlow=await product('plain FORM without flow or variants',{noFlow:true}),noFlowRow=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:noFlow.id}});assert.equal(noFlowRow.trainingFlowFrozen,null);assert.equal(noFlowRow.trainingVariantFrozen,null)
 const noFlowToken=await mint(noFlow,{groupIpPolicy:policy}),noFlowStart=await start(noFlowToken)
 const noFlowAttempt=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:noFlowStart.first.attempt.id}})
 assert.equal(noFlowAttempt.deliveryCourseId,course.id);assert.equal(noFlowAttempt.accessTokenId,noFlowToken.id);assert.equal(noFlowAttempt.userId,null)
 f.cases.push({name:'plain-no-flow-round-delivery-course',productId:noFlow.id,attemptId:noFlowAttempt.id,deliveryCourseId:noFlowAttempt.deliveryCourseId})
 h.check('Plain FORM with no flow/variants sets real round deliveryCourseId; prior-day round server-now binding and permission/window rejection')
 const admitted=await start(active);f.recovery={attemptId:admitted.first.attempt.id,token:admitted.first.recoveryToken};h.write('c21-fixture-private.json',f)
 const hinted=await h.client().request(`${pub}/${plain.token}?roundId=${active.roundId}`);assert.ok(hinted)
 // A short real wall-clock round expires naturally; no clock spoof, guards or row mutation.
 const short=await mint(p,{groupIpPolicy:policy},iso(12000)),expired=await start(short);f.tokens.expiring=short
 const remaining=new Date(short.groupIpWindow.closesAt).getTime()-Date.now();if(remaining>0)await pause(remaining+150)
 const deniedClient=h.client();await deniedClient.request('/auth/csrf');await deniedClient.request(`${pub}/${short.token}/start`,'POST',{},denied)
 await expired.client.request(`${pub}/attempts/${expired.first.attempt.id}/restart`,'POST',{},denied)
 assert.equal((await expired.client.request(`${pub}/attempts/${expired.first.attempt.id}`)).id,expired.first.attempt.id)
 await teacher.request(`${route(p.id)}/${active.id}`,'DELETE')
 await deniedClient.request(`${pub}/${active.token}/start`,'POST',{},denied)
 assert.equal((await admitted.client.request(`${pub}/attempts/${admitted.first.attempt.id}`)).id,admitted.first.attempt.id)
 // Restore an independently active credential for subsequent SQL measurement; revoked link remains revoked.
 f.tokens.revoked=active;f.tokens.active=linked
 for(const {client,first} of [expired,admitted]){
  const body=formBody(first.attempt,'yes'),submit=`${pub}/attempts/${first.attempt.id}/form-sections/${first.attempt.currentItem.id}/submit`
  await client.request(submit,'POST',body);assert.equal((await client.request(submit,'POST',body)).replayed,true)
  assert.equal((await children(first.attempt.id)).snapshots.length,1)
 }
 await drainReports(h,[expired.first.attempt.id,admitted.first.attempt.id])
 for(const {client,first} of [expired,admitted]){assert.equal((await client.request(`${pub}/attempts/${first.attempt.id}`)).status,'COMPLETED');await client.request(`${pub}/attempts/${first.attempt.id}/report-status`);await client.request(`${pub}/attempts/${first.attempt.id}/report`)}
 f.cases.push({name:'expired-round-recovery-final-report',attemptId:expired.first.attempt.id},{name:'revoked-link-recovery-final-report',attemptId:admitted.first.attempt.id})
 h.write('c21-fixture-private.json',f);h.check('Natural round expiry and link revocation deny new admission while original FORM FINAL/replay/report recovery remains functional')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
