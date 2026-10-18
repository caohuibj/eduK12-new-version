/** Actual persisted subject binding across independent publications and scopes. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,candidateProof,noWrites,drainReports,prefix} from './c20-materials-client.mjs'
import {logins,participant,formMaterialProduct,formBody} from './c20-materials-fixture.mjs'
const h=harness('linked');let error
try{
 const f=h.read('c20-fixture-private.json'),{teacher,otherTeacher}=await logins(h,f),key='c20-linked-'+randomUUID()
 const p1=await formMaterialProduct(teacher,f,{experimentKey:key}),actors=[await participant(h,f,'linked_a'),await participant(h,f,'linked_b')],first=[]
 for(const actor of actors){const {attempt}=await actor.client.request(`${prefix}/${p1.id}/attempts`,'POST',{});first.push((await candidateProof(attempt.id)).candidate.materialAssignment)}
 assert.notEqual(first[0].groupKey,first[1].groupKey)
 const p2=await formMaterialProduct(teacher,f,{experimentKey:key}),filler=await participant(h,f,'linked_filler'),{attempt:filled}=await filler.client.request(`${prefix}/${p2.id}/attempts`,'POST',{}),taken=(await candidateProof(filled.id)).candidate.materialAssignment.groupKey
 const blocked=first.findIndex(a=>a.groupKey===taken),allowed=1-blocked
 await noWrites(h,'KEEP_LINKED original group full refuses without moving to free group',()=>actors[blocked].client.request(`${prefix}/${p2.id}/attempts`,'POST',{},409))
 const {attempt:second}=await actors[allowed].client.request(`${prefix}/${p2.id}/attempts`,'POST',{}),inherit=(await candidateProof(second.id)).candidate.materialAssignment
 assert.equal(inherit.groupKey,first[allowed].groupKey);assert.equal(inherit.experimentId,first[allowed].experimentId);assert.notEqual(inherit.claimId,first[allowed].claimId);assert.equal(inherit.algorithm,'LINKED_INHERIT_V1')
 assert.equal((await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:inherit.claimId}})).inheritedFromClaimId,first[allowed].claimId)
 assert.equal(await prisma.trainingMaterialSubjectBinding.count({where:{experimentId:inherit.experimentId,participantKey:inherit.participantKey}}),1)
 // Same spelling, distinct course/teacher scopes: real course records and HTTP publications.
 for(const [label,author,owner] of [['course',teacher,f.users.teacher],['teacher',otherTeacher,f.users.otherTeacher]]){
  const course=await prisma.course.create({data:{creatorId:owner.id,title:'C20 independent '+label,courseCode:'C20-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  await prisma.courseStudent.create({data:{courseId:course.id,studentId:actors[allowed].user.id,status:'ACTIVE'}})
  const product=await formMaterialProduct(author,{...f,courseId:course.id},{experimentKey:key}),{attempt}=await actors[allowed].client.request(`${prefix}/${product.id}/attempts`,'POST',{}),a=(await candidateProof(attempt.id)).candidate.materialAssignment
  assert.notEqual(a.experimentId,inherit.experimentId);assert.notEqual(a.algorithm,'LINKED_INHERIT_V1');assert.equal((await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:a.claimId}})).inheritedFromClaimId,null)
 }
 const repeatProduct=await formMaterialProduct(teacher,f,{limits:{a:10,b:10}}),repeatActor=await participant(h,f,'legitimate')
 const {attempt:previous}=await repeatActor.client.request(`${prefix}/${repeatProduct.id}/attempts`,'POST',{}),oldAssignment=(await candidateProof(previous.id)).candidate.materialAssignment
 await repeatActor.client.request(`${prefix}/attempts/${previous.id}/form-sections/${previous.currentItem.id}/submit`,'POST',formBody(previous))
 await repeatActor.client.request(`${prefix}/attempts/${previous.id}`);await drainReports(h,[previous.id]);assert.equal((await repeatActor.client.request(`${prefix}/attempts/${previous.id}`)).status,'COMPLETED')
 const beforeQuota=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:repeatProduct.id}})
 const {attempt:legitimate}=await repeatActor.client.request(`${prefix}/${repeatProduct.id}/attempts`,'POST',{}),newAssignment=(await candidateProof(legitimate.id)).candidate.materialAssignment
 assert.notEqual(newAssignment.claimId,oldAssignment.claimId);assert.equal(newAssignment.groupKey,oldAssignment.groupKey)
 assert.equal((await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:repeatProduct.id}})).reduce((n,b)=>n+b.assignedCount,0),beforeQuota.reduce((n,b)=>n+b.assignedCount,0)+1)
 h.check('A legitimate new attempt after accepted completion gets a new claim and exactly one new quota reservation')
 const budget=await formMaterialProduct(teacher,f,{experimentKey:'c20-budget-'+randomUUID(),maxAttempts:2,limits:{a:10,b:10}}),actor=await participant(h,f,'budget'),{attempt}=await actor.client.request(`${prefix}/${budget.id}/attempts`,'POST',{}),restarted=await actor.client.request(`${prefix}/attempts/${attempt.id}/restart`,'POST',{})
 await noWrites(h,'Login ABANDONED attempt counts in maxAttempts',()=>actor.client.request(`${prefix}/attempts/${restarted.attempt.id}/restart`,'POST',{},409))
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:budget.id,userId:actor.user.id}}),2)
 h.result.linked={publications:[p1.id,p2.id],firstAssignments:first.map(({claimId,groupKey,experimentId})=>({claimId,groupKey,experimentId})),inheritedClaimId:inherit.claimId,blockedGroup:taken}
 h.check('KEEP_LINKED survives publications, rejects full original group despite other capacity, and isolates course/owner scope; restart budget includes ABANDONED')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
