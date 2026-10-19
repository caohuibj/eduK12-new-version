/** Real HTTP authorization, immutable identity, cumulative budget and expiry. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,prefix,pub,require,backend,pause} from './c23-checkpoint-client.mjs'
import path from 'node:path'
import {seed,actors,product,course,iso,anonymous,authenticated,checkpoint,envelope,save,clear,read,row,retain,expire} from './c23-checkpoint-fixture.mjs'
const h=harness('functional');let error
try{
 const f=await seed(h),{teacher,student,outsider}=await actors(h,f)
 const p=await product(teacher,f);f.productId=p.id
 const auth=retain(f,'authenticated',await authenticated(student,p)),aenv=await envelope(auth)
 assert.equal((await read(auth)).revision,0)
 const first=await save(auth,aenv,0);assert.equal(first.revision,1);assert.equal(first.successfulSaveCount,1)
 const stored=await row(auth);assert.ok(stored.payloadEncrypted);assert.notEqual(stored.payloadEncrypted,JSON.stringify(aenv));assert.equal(stored.roundId,null)
 assert.deepEqual((await read(auth)).envelope,aenv)
 for(const method of ['GET','PUT','DELETE'])await outsider.request(checkpoint(auth),method,method==='GET'?undefined:method==='PUT'?{expectedRevision:1,attemptEpoch:1,envelope:aenv}:{expectedRevision:1,attemptEpoch:1},[403,404])
 await auth.client.request(checkpoint(auth),'PUT',{expectedRevision:1,attemptEpoch:2,envelope:aenv},409)
 await save(auth,{...aenv,snapshotHash:'0'.repeat(64)},1,409)
 await save(auth,{...aenv,definitionHash:'0'.repeat(64)},1,409)
 await save(auth,{...aenv,drafts:[{slotKey:'not-admitted',answers:{}}]},1,400)
 assert.deepEqual(await row(auth),stored)
 h.check('Authenticated owner HTTP save/read, cross-owner/stale epoch/frozen hashes rejected atomically')
 const anon=retain(f,'anonymous-null-round',await anonymous(h,teacher,p)),nenv=await envelope(anon)
 await save(anon,nenv,0);assert.equal((await row(anon)).roundId,null)
 const wrong=h.client();await wrong.request('/auth/csrf');wrong.recovery=randomUUID()
 for(const method of ['GET','PUT','DELETE'])await wrong.request(checkpoint(anon),method,method==='GET'?undefined:method==='PUT'?{expectedRevision:1,attemptEpoch:1,envelope:nenv}:{expectedRevision:1,attemptEpoch:1},[400,401,403,404])
 await auth.client.request(`${prefix}/attempts/${anon.attempt.id}/checkpoint`,'GET',undefined,[403,404])
 const bound=retain(f,'anonymous-bound-round',await anonymous(h,teacher,p,{round:true})),benv=await envelope(bound)
 await save(bound,benv,0);assert.equal((await row(bound)).roundId,bound.token.roundId);assert.ok(bound.token.roundId)
 assert.deepEqual((await read(bound)).envelope,benv)
 h.check('Anonymous recovery ownership, null-round and exact bound-round checkpoint behavior')
 const roundExpiry=retain(f,'natural-round-closure',await anonymous(h,teacher,p,{round:true,expiresAt:iso(12000)}))
 await save(roundExpiry,await envelope(roundExpiry),0)
 const roundDeadline=new Date(roundExpiry.token.groupIpWindow.closesAt).getTime()
 while(Date.now()<=roundDeadline)await pause(Math.min(250,roundDeadline-Date.now()+1))
 await roundExpiry.client.request(checkpoint(roundExpiry),'GET',undefined,403)
 assert.equal((await row(roundExpiry)).payloadEncrypted,null);assert.equal((await row(roundExpiry)).successfulSaveCount,1)
 h.check('Actual wall-clock bound-round closure commits payload erasure without resetting save count')
 const legacyProduct=await product(teacher,f,{enabled:false,name:'legacy-null'}),legacy=retain(f,'legacy-policy-off',await anonymous(h,teacher,legacyProduct))
 await legacy.client.request(checkpoint(legacy),'GET',undefined,403)
 assert.equal(await prisma.trainingAttemptCheckpoint.count({where:{attemptId:legacy.attempt.id}}),0)
 const old=h.read('c21-fixture-private.json'),oldClient=h.client();await oldClient.request('/auth/csrf');oldClient.recovery=old.recovery.token
 await oldClient.request(`${pub}/attempts/${old.recovery.attemptId}/checkpoint`,'GET',undefined,[403,409])
 assert.equal(await prisma.trainingAttemptCheckpoint.count({where:{attemptId:old.recovery.attemptId}}),0)
 h.check('Pre-C23 accepted attempt and newly admitted policy-null attempt remain checkpoint-disabled')
 const tomb=retain(f,'clear-before-first-save',await anonymous(h,teacher,p)),tenv=await envelope(tomb)
 assert.equal((await clear(tomb,0)).revision,1);await save(tomb,tenv,0,409);await save(tomb,tenv,1)
 const cleared=await clear(tomb,2);assert.equal(cleared.revision,3);assert.equal(cleared.successfulSaveCount,1)
 assert.equal((await read(tomb)).envelope,null);await save(tomb,tenv,2,409)
 h.check('Explicit initial clear retains tombstone revision and invalidates stale CAS')
 const budget=retain(f,'cumulative-budget100',await anonymous(h,teacher,p)),budgetEnvelope=await envelope(budget)
 let revision=0
 for(let i=1;i<=100;i++){
  const saved=await save(budget,budgetEnvelope,revision);revision=saved.revision;assert.equal(saved.successfulSaveCount,i)
  if(i===25){const c=await clear(budget,revision);revision=c.revision;assert.equal(c.successfulSaveCount,i)}
  if(i===50){const expired=await expire(budget);await save(budget,budgetEnvelope,expired.revision,409);const c=await read(budget);revision=c.revision;assert.equal(c.successfulSaveCount,i);assert.equal(c.envelope,null)}
 }
 await save(budget,budgetEnvelope,revision,429)
 const capped=await clear(budget,revision);assert.equal(capped.successfulSaveCount,100);await save(budget,budgetEnvelope,capped.revision,429)
 h.result.counts.push({case:'cumulative-budget',successfulSaves:100,clearAt:25,expiryAt:50,afterClearDeniedStatus:429})
 h.check('Exactly 100 real HTTP saves; clear and committed expiry preserve cumulative budget and deny save 101')
 const publicationProduct=await product(teacher,f,{name:'publication-recheck'}),publication=retain(f,'publication-recheck',await anonymous(h,teacher,publicationProduct))
 await save(publication,await envelope(publication),0)
 // No C21 round: permitted status transition tests checkpoint's current publication check.
 await prisma.compositeAssessment.update({where:{id:publicationProduct.id},data:{status:'DRAFT'}})
 await publication.client.request(checkpoint(publication),'GET',undefined,409)
 const closedCourse=await course(f),closedProduct=await product(teacher,f,{name:'course-closure',courseId:closedCourse.id})
 const closed=retain(f,'course-closure',await anonymous(h,teacher,closedProduct));await save(closed,await envelope(closed),0)
 const earlier=new Date(Date.now()+60000)
 await prisma.course.update({where:{id:closedCourse.id},data:{endedAt:earlier}})
 const tightened=await read(closed);assert.equal(new Date(tightened.expiresAt).getTime(),earlier.getTime());assert.equal(tightened.revision,2);assert.equal(tightened.successfulSaveCount,1)
 await prisma.course.update({where:{id:closedCourse.id},data:{status:'COMPLETED'}})
 await closed.client.request(checkpoint(closed),'GET',undefined,403)
 const closedRow=await row(closed);assert.equal(closedRow.payloadEncrypted,null);assert.equal(closedRow.payloadHash,null);assert.equal(closedRow.expiresAt,null);assert.equal(closedRow.successfulSaveCount,1)
 h.check('Current publication mismatch rejects; current course closure commits payload erasure and retains budget')
 const {cleanupExpiredTrainingCheckpoints}=require(path.join(backend,'dist/modules/composite/training-checkpoint.service.js'))
 const expired=retain(f,'maintenance-expiry',await anonymous(h,teacher,p));await save(expired,await envelope(expired),0);const expiredRow=await expire(expired)
 assert.equal(await cleanupExpiredTrainingCheckpoints(),1)
 const afterExpiry=await row(expired);assert.equal(afterExpiry.payloadEncrypted,null);assert.equal(afterExpiry.revision,expiredRow.revision+1);assert.equal(afterExpiry.successfulSaveCount,1)
 assert.equal(await cleanupExpiredTrainingCheckpoints(),0)
 h.check('Actual restricted-role production maintenance clears only due payload and preserves identity/budget; repeat selects none')
 h.write('c23-fixture-private.json',f);h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
