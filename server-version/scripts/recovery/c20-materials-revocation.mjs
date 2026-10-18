/** C20 material assignment survives reached-native revocation; unreached stays closed. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,require,backend,children,candidateProof,noWrites,drainReports,cognitiveFinal,prefix,products,denied,sha} from './c20-materials-client.mjs'
import {logins,participant,formBody,formRows,form,unitKey,publish} from './c20-materials-fixture.mjs'
const production=file=>require(path.join(backend,'dist',file+'.js'))
const {createCustomScaleDefinition}=production('modules/scale/scale-definition')
const {loadFrozenScaleRuntimeSnapshot}=production('modules/assessment-runtime/runtime-snapshot')
const expires=()=>new Date(Date.now()+3600000).toISOString()
const h=harness('revocation');let error
async function submission(client,attempt,fixture){
 const unit=attempt.currentItem,c=await children(attempt.id)
 if(unit.type==='FORM_SECTION')return {route:`${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`,body:formBody(attempt)}
 if(unit.type==='SCALE'){
  const child=c.scales.find(row=>row.compositeItemId===unit.id);assert.ok(child);await client.request(`/scales/assessments/${child.id}`)
  const snapshot=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,prisma)
  return {route:`/scales/assessments/${child.id}/submit`,body:{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:snapshot.definition.items.map(item=>({itemCode:item.itemCode,responseValue:snapshot.definition.responseSets.find(set=>set.key===item.responseSetKey).options[0].value,responseTimeMs:17}))}}
 }
 if(unit.type==='COGNITIVE'){assert.equal(unit.cognitiveSession.config.totalTrials,120);await client.request(`/cognitive/sessions/${unit.cognitiveSession.sessionId}`);return {route:`/cognitive/sessions/${unit.cognitiveSession.sessionId}/submit`,body:cognitiveFinal(unit.cognitiveSession)}}
 assert.equal(unit.type,'SITUATIONAL')
 const route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`,runtime=await client.request(route)
 assert.deepEqual(await client.request(route+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,200,true),Buffer.from(fixture.sjt.imageBase64,'base64'))
 return {route:route+'/submit',body:{submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses}}
}

async function createRevocationFixtures(h,fixture,actors,record,save){
 const {teacher,otherTeacher,admin}=actors
 const course=await teacher.request('/courses','POST',{title:'C20 new synthetic grant-revocation Training course'})
 assert.equal(course.courseType,'TRAINING_COURSE');assert.equal(course.creatorId,fixture.users.teacher.id)
 record.revocation={courseId:course.id,products:{},cases:[]};save()
 let scale=await otherTeacher.request('/scales','POST',{code:'C20-BOUNDARY-'+randomUUID(),name:'C20 new synthetic revocable Scale',visibility:'HIDDEN'})
 record.revocation.scaleId=scale.id;save()
 const definition=createCustomScaleDefinition()
 definition.responseSets=[{key:'default',options:[{value:'yes',label:'yes',score:1},{value:'no',label:'no',score:0}]}]
 definition.items=[{itemCode:'c20-boundary-scale-item',content:'Synthetic boundary response',type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
 definition.scoring.itemRules=[{itemCode:'c20-boundary-scale-item',transform:{type:'identity'}}]
 definition.scoring.scores=[{key:'total',type:'total',label:'Synthetic descriptive total',direction:'descriptive',canonical:true,displayPrecision:0,source:{type:'items',items:[{itemCode:'c20-boundary-scale-item',weight:1}],aggregation:'sum'}}]
 definition.report.primaryScoreKeys=['total'];definition.report.scoreOrder=['total']
 definition.report.interpretations=[{scoreKey:'total',headline:'Synthetic qualification only',source:{type:'score_only'},summary:'This synthetic response is used only to check the access boundary.',bands:[],guidance:[]}]
 scale=await otherTeacher.request(`/scales/${scale.id}/definition`,'PUT',{definition})
 await otherTeacher.request(`/scales/${scale.id}/publish`,'POST',{})
 const scaleRow=await prisma.scale.findUniqueOrThrow({where:{id:scale.id}});assert.equal(scaleRow.status,'PUBLISHED');assert.equal(scaleRow.creatorId,fixture.users.otherTeacher.id)
 const scaleGrant=await admin.request('/admin/material-grants','POST',{teacherId:fixture.users.teacher.id,resourceType:'SCALE',resourceId:scale.id})
 record.revocation.scaleGrant=scaleGrant;save()
 const release=fixture.sjt.release
 const sjtGrant=await admin.request(`/situational/authoring/releases/${release.id}/grants`,'POST',{instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion,definitionHash:release.definitionHash,contentDigest:release.contentDigest,granteeTeacherId:fixture.users.teacher.id,courseId:course.id,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:expires(),note:'C20 new-course synthetic revocation boundary'})
 record.revocation.sjtGrant=sjtGrant;save()
 for(const type of ['SCALE','SITUATIONAL']){
  let product=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C20 fresh '+type+' revoke boundary',questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false,expiresAt:expires()})
  product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:form('boundary_form')})
  product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:type==='SCALE'?{type,scaleId:scale.id,required:true}:{type,situationalInstrumentKey:release.instrumentKey,situationalInstrumentVersion:release.instrumentVersion,required:true}})
  product=await publish(teacher,product,{...structuredClone(fixture.product.trainingFlowDraft),experiment:{...fixture.product.trainingFlowDraft.experiment,experimentKey:'revoke-'+product.id},blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(product)[0])},{blockKey:'native',kind:'INSTRUMENT',instrumentKey:unitKey(product.items.find(item=>item.type===type))}]})
  record.revocation.products[type]=product;save()
 }
 const scoped={...fixture,courseId:course.id},a=await participant(h,scoped,'revoke-reached'),b=await participant(h,scoped,'revoke-unreached')
 record.revocation.actors={a:a.user,b:b.user};save()
 h.result.revocationFixture={courseId:course.id,scaleId:scale.id,scaleOwnerIsDifferent:true,sjtReleaseId:release.id,sjtReleaseReuse:'Existing independently ADMIN-reviewed synthetic release; new grant is limited to the new course',newProductIds:Object.values(record.revocation.products).map(p=>p.id)}
 h.check('Official teacher course/Scale authoring and ADMIN grant APIs create isolated revocation resources; no old grant/resource is edited')
 return {a,b}
}


try{
 const fixture=h.read('c20-fixture-private.json'),actors=await logins(h,fixture),record={};const save=()=>h.write('c20-revocation-private.json',record)
 const {a,b}=await createRevocationFixtures(h,fixture,actors,record,save)
 for(const type of ['SCALE','SITUATIONAL']){
  const product=record.revocation.products[type];let aa=(await a.client.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt
  const bb=(await b.client.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt,initial=await candidateProof(aa.id),bInitial=await candidateProof(bb.id)
  const first=await submission(a.client,aa,fixture);await a.client.request(first.route,'POST',first.body);aa=await a.client.request(`${prefix}/attempts/${aa.id}`);assert.equal(aa.currentItem.type,type)
  const nativeRequest=await submission(a.client,aa,fixture),reached=await children(aa.id),native=type==='SCALE'?reached.scales[0]:reached.sjt[0]
  assert.ok(native);const nativeHash=sha(native.runtimeSnapshotEncrypted)
  if(type==='SCALE')await actors.admin.request(`/admin/material-grants/${record.revocation.scaleGrant.id}`,'DELETE')
  else await actors.admin.request(`/situational/authoring/grants/${record.revocation.sjtGrant.id}/revoke`,'POST',{version:record.revocation.sjtGrant.version,note:'C20 isolated fixture revocation'})
  const fresh=h.client();await fresh.login(a.user,'STUDENT');aa=await fresh.request(`${prefix}/attempts/${aa.id}`)
  const recovered=await submission(fresh,aa,fixture);assert.deepEqual({...recovered.body,submissionId:null},{...nativeRequest.body,submissionId:null})
  await fresh.request(recovered.route,'POST',recovered.body);await fresh.request(`${prefix}/attempts/${aa.id}`);await drainReports(h,[aa.id]);const complete=await fresh.request(`${prefix}/attempts/${aa.id}`);assert.equal(complete.status,'COMPLETED')
  const final=await candidateProof(aa.id);assert.deepEqual(final.stable,initial.stable);const ended=await children(aa.id);assert.equal(sha((type==='SCALE'?ended.scales[0]:ended.sjt[0]).runtimeSnapshotEncrypted),nativeHash)
  const request=await submission(b.client,bb,fixture);await b.client.request(request.route,'POST',request.body)
  const child=await children(bb.id);assert.equal(child.scales.length+child.sjt.length,0);assert.equal(child.snapshots.length,1);assert.equal(child.jobs[0].status,'WAITING');assert.equal(child.jobs[0].budgetHeld,false)
  await noWrites(h,type+' revoked future child is denied without allocation or persistence changes',()=>b.client.request(`${prefix}/attempts/${bb.id}`,'GET',undefined,403))
  assert.deepEqual((await candidateProof(bb.id)).stable,bInitial.stable)
  assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:product.id}}),2)
  assert.equal((await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id}})).reduce((n,r)=>n+r.assignedCount,0),2)
  h.result.measurements.push({type,reachedAttemptId:aa.id,unreachedAttemptId:bb.id,materialAssignmentHash:final.candidate.materialAssignment.assignmentHash,originalNativeRuntimeHash:nativeHash})
  h.check(type+': already reached native restores/FINAL after revocation, not-yet-reached native denied; frozen assignment and quota unchanged')
 }
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
