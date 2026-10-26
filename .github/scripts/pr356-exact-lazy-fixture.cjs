// One real consumer, not the four vertical tests or the direct guard contracts.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createRequire}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const CASE_ID='actual-current-exact-child-materialization';
const ASSERTIONS=[
 'fresh-isolated-schema','registered-source-installed-published','real-three-trials-online',
 'lawful-use-and-flow-published','parent-start-froze-exact-candidate',
 'form-final-advanced-without-scale-child','use-and-source-withdrawn-without-emergency',
 'current-exact-child-written-after-withdrawal','frozen-identity-epoch-and-null-guide',
 'reread-keeps-one-child','new-start-remains-denied',
];
function noLinks(value){
 const absolute=path.resolve(value);let current=path.parse(absolute).root;
 for(const component of absolute.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,component);
  try{assert(!fs.lstatSync(current).isSymbolicLink(),'Synthetic evidence paths cannot contain symlinks')}catch(error){if(error.code!=='ENOENT')throw error}
 }
 return absolute;
}
function assertIsolation(env=process.env){
 const url=new URL(env.DATABASE_URL??'invalid:');
 assert.equal(env.NODE_ENV,'test');assert.equal(env.PR356_EXACT_LAZY_ISOLATED,'1');
 assert.equal(env.BACKGROUND_WORKERS_ENABLED,'false');assert.equal(env.ASSESSMENT_REPORT_ASYNC_ENABLED,'false');
 assert(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.port,'55439');
 assert(/^\/pr356_exact_lazy_test_[a-f0-9]{10}$/.test(url.pathname));assert(!url.search&&!url.hash);
 for(const key of ['RUNNER_TEMP','PR356_DATABASE_OUTPUT_DIR','PR356_EXACT_LAZY_OUTPUT'])assert(path.isAbsolute(env[key]??''),'Absolute synthetic evidence paths required');
 const temp=noLinks(env.RUNNER_TEMP),out=noLinks(env.PR356_DATABASE_OUTPUT_DIR),output=noLinks(env.PR356_EXACT_LAZY_OUTPUT);
 const relative=path.relative(temp,out);assert(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
 assert.equal(fs.realpathSync(temp),temp);assert.equal(fs.realpathSync(out),out);
 assert.equal(output,path.join(out,'exact-lazy-result.json'));assert(!fs.existsSync(output),'Existing fixture results are never overwritten');
 return {databaseName:url.pathname.slice(1),output};
}
async function loadRealModules(){
 const req=createRequire(path.resolve('package.json'));
 const db=req('./src/config/database.ts').prisma;let queues;
 try{
  queues=req('./src/config/queue.ts');
  return {db,queues,registry:req('./src/modules/scale/onboarding/instrument-registry.ts'),
   install:req('./src/modules/scale/onboarding/install.ts'),publication:req('./src/modules/scale/onboarding/publish.ts'),
   standard:req('./src/modules/survey/standard-triplet.service.ts'),model:req('./src/modules/survey/standard-triplet.model.ts'),
   uses:req('./src/modules/measurement-content/standard-combination-use.ts'),product:req('./src/modules/questionnaire-product/service.ts'),
   composite:req('./src/modules/composite/composite.service.ts'),form:req('./src/modules/composite/final-submit.service.ts'),
   flow:req('./src/modules/assessment-core/flow/training.ts'),runtime:req('./src/modules/assessment-runtime/runtime-snapshot.ts'),
   slots:req('./src/modules/assessment-runtime/slot-set.ts'),security:req('./src/modules/assessment-runtime/security.ts'),canonical:req('./src/modules/assessment-runtime/canonical.ts')};
 }catch(error){try{if(queues)await queues.closeQueues(true)}finally{await db.$disconnect()}throw error}
}
async function runFixture({load=loadRealModules}={}){
 const safe=assertIsolation();
 assert(globalThis.prisma===undefined&&globalThis.prismaObservabilityClient===undefined,'Unknown Prisma context blocks this isolated consumer');
 const result={schemaVersion:1,kind:'pr356-real-exact-lazy-consumer',caseId:CASE_ID,syntheticOnly:true,status:'running',assertions:[],observed:{},startedAt:new Date().toISOString()};
 const checked=(id,body)=>{assert(ASSERTIONS.includes(id)&&!result.assertions.some(x=>x.id===id));body();result.assertions.push({id,status:'passed'})};
 let m,error,stage='load-real-modules';
 try{
  m=await load();const {db}=m;
  stage='verify-fresh-schema';const [identity]=await db.$queryRaw`SELECT current_database() AS database_name`;
  checked('fresh-isolated-schema',()=>assert.equal(identity.database_name,safe.databaseName));
  assert.equal(await db.user.count(),0);assert.equal(await db.scale.count(),0);assert.equal(await db.compositeAssessmentAttempt.count(),0);assert.equal(await db.compositeReportJob.count(),0);
  stage='legal-actors-and-source';
  const actor=async(name,role='STUDENT',platformRole='STANDARD')=>db.user.create({data:{username:'exact-lazy-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC NONLOGIN',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER'}});
  const system=await actor('system','STUDENT','SYSTEM_ADMIN'),issuer=await actor('issuer'),teacher=await actor('teacher','TEACHER'),student=await actor('student'),newStudent=await actor('new-student');
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:issuer.id,entry:'TRAINING',grantedBy:system.id}});
  const key='academic_self_concept_biology_zh_cn',version='1.0.0',source=m.registry.getScaleInstrumentSource(key,version),policy=m.registry.getScaleInstrumentRuntimePolicy(key,version);
  assert(source?.executable&&policy,'Existing registered executable source required');
  const install={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'],runtimePolicyHash:policy.runtimePolicyHash,localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}};
  assert.deepEqual((await m.install.planScaleInstrumentInstall(db,install)).blockers,[]);
  const installed=await m.install.installScaleInstrument(db,install);
  const publication={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN',allowedProducts:['SURVEY']};
  const publishPlan=await m.publication.planStandardScalePublication(db,publication);assert.deepEqual(publishPlan.blockers,[]);
  await m.publication.publishStandardScale(db,{...publication,expectedProofHash:publishPlan.proofHash});
  checked('registered-source-installed-published',()=>assert(installed.scaleId));
  stage='approve-through-real-trials';
  const parts=m.model.sourceParts(key,version),selection={toolKey:key,...Object.fromEntries(parts.map(part=>[part.axis,part.hash]))};
  const preview=await m.standard.previewStandardTriplet(db,system.id,selection);assert.deepEqual(preview.blockers,[]);
  const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),tokenVersion:system.tokenVersion};
  const online=await m.standard.approveStandardTriplet(system.id,{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,reason:'Isolated actual exact lazy child consumer',allowedProducts:['TRAINING']},proof);
  const trials=await db.$queryRaw`SELECT id,report,scores FROM survey_standard_trials WHERE release_id=${online.id}`;
  checked('real-three-trials-online',()=>{assert.equal(online.state,'ONLINE');assert.equal(trials.length,3);for(const trial of trials){assert(trial.report.blocks.length>0);assert.equal(trial.scores.units.length,1)}});
  const pointer={releaseId:online.id,combinationHash:online.combinationHash};
  const use=await m.uses.grantTrainingStandardCombinationUse(issuer.id,online.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:pointer.combinationHash});
  const course=await db.course.create({data:{creatorId:teacher.id,title:'Synthetic exact lazy course',courseType:'TRAINING_COURSE',courseCode:'exact-lazy-'+randomUUID(),status:'PUBLISHED'}});
  await db.courseStudent.createMany({data:[student,newStudent].map(user=>({courseId:course.id,studentId:user.id,status:'ACTIVE'}))});
  const teacherActor={userId:teacher.id,role:teacher.role};
  let q=await m.product.create(teacherActor,{requestId:randomUUID(),name:'Synthetic exact lazy flow',questionnaireType:'COURSE',courseIds:[course.id]});
  q=await m.product.addItem(teacherActor,q.id,{revision:q.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}});
  q=await m.product.addItem(teacherActor,q.id,{revision:q.revision,item:{type:'SCALE',scaleId:installed.scaleId,required:true,standardCombination:pointer}});
  const draft=await db.compositeAssessment.findUniqueOrThrow({where:{id:q.id},include:{items:true,formSections:{include:{items:true}}}});
  const section=draft.formSections.find(s=>s.items.some(item=>item.contextKey==='gradeLevel')),item=draft.items.find(value=>value.type==='SCALE');assert(section&&item);
  q=await m.product.updateTrainingFlow(teacherActor,q.id,{revision:q.revision,config:{schemaVersion:1,blocks:[{blockKey:'context',kind:'INSTRUMENT',instrumentKey:m.flow.trainingFlowUnitKey(section.id)},{blockKey:'exact-scale',kind:'INSTRUMENT',instrumentKey:m.flow.trainingFlowItemKey(item.id)}]}});
  q=await m.product.publish(teacherActor,q.id,{revision:q.revision});
  checked('lawful-use-and-flow-published',()=>{assert.equal(q.status,'PUBLISHED');assert.equal(q.trainingFlowFrozen.schemaVersion,1);assert.equal(use.revoked,false)});
  stage='parent-start-freezes-all-candidates';
  const started=await m.composite.startUserAttempt(student.id,q.id),initial=started.attempt,id=initial.id;
  assert.equal(initial.currentItem.type,'FORM_SECTION');assert.equal(initial.currentItem.id,section.id);assert.equal(await db.assessment.count({where:{compositeAttemptId:id}}),0);
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}}),candidate=m.security.decryptUnifiedRuntimePayload(parent.trainingFlowSnapshotEncrypted);
  const frozen=await m.runtime.loadFrozenScaleRuntimeSnapshot(candidate.references[item.id],db),slots=await m.slots.loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted,db);
  const slot=slots.slots.find(value=>value.sourceBinding.compositeItemId===item.id),bound=parent.trainingContentBinding.units.find(value=>value.itemId===item.id);
  checked('parent-start-froze-exact-candidate',()=>{
   assert.equal(m.canonical.canonicalHash(candidate),parent.trainingFlowSnapshotHash);assert.equal(candidate.attemptId,id);assert.equal(candidate.attemptEpoch,parent.attemptEpoch);assert.equal(candidate.slotSetHash,parent.frozenActiveSlotSetHash);
   assert.equal(slots.attemptEpoch,parent.attemptEpoch);assert(slot&&bound);assert.equal(bound.source.standardCombination.reference.combination.releaseId,pointer.releaseId);assert.equal(bound.source.standardCombination.reference.authority.useGrantId,use.id);
   assert.equal(bound.source.id,installed.scaleId);assert.equal(frozen.instrumentKey,key);assert.equal(frozen.instrumentVersion,version);assert(Object.hasOwn(frozen,'instruction'));assert.equal(frozen.instruction,null);
  });
  stage='real-form-final-before-current-child';
  const form=initial.currentItem;
  await m.form.submitCompositeFormSectionFinal({attemptId:id,sectionId:form.id,userId:student.id,submissionId:randomUUID(),attemptEpoch:initial.attemptEpoch,definitionHash:form.definitionHash,contextSnapshotHash:initial.contextSnapshotHash,answers:form.answers.map(answer=>({formItemId:answer.formItemId??answer.id,value:'7'}))});
  const progressed=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}}),pathEvidence=m.security.decryptUnifiedRuntimePayload(progressed.trainingFlowPathEncrypted);
  checked('form-final-advanced-without-scale-child',()=>{assert.equal(pathEvidence.path.currentInstrumentKey,m.flow.trainingFlowItemKey(item.id));assert.equal(progressed.attemptEpoch,parent.attemptEpoch);assert.equal(progressed.trainingFlowSnapshotHash,parent.trainingFlowSnapshotHash);assert(progressed.contextSnapshotHash);assert.equal(progressed.status,'IN_PROGRESS')});
  assert.equal(await db.assessment.count({where:{compositeAttemptId:id}}),0);
  stage='normal-use-and-source-withdrawal';
  await m.uses.revokeTrainingStandardCombinationUse(issuer.id,use.id,{expectedVersion:use.version,reason:'Ordinary use withdrawal after parent flow START'});
  const live=await m.standard.standardReleaseRow(db,online.id);await m.standard.withdrawStandardTriplet(system.id,online.id,live.version,'Ordinary source withdrawal before pending exact child',proof);
  const revoked=await db.materialGrant.findUniqueOrThrow({where:{id:use.id}}),withdrawn=await m.standard.standardReleaseRow(db,online.id);
  const emergency=await db.$queryRaw`SELECT target_id FROM scale_library_emergency_stops`;
  checked('use-and-source-withdrawn-without-emergency',()=>{assert(revoked.revokedAt);assert.equal(withdrawn.state,'WITHDRAWN');assert.equal(emergency.length,0)});
  await db.scale.update({where:{id:installed.scaleId},data:{instruction:'Later native display text must not enter this parent-frozen exact runtime'}});
  stage='actual-get-state-materializes-current-exact-child';
  // This public service enters its private ensureTrainingFlowCurrentChildInTransaction,
  // loads the real frozen runtime and actually INSERTs the child. No sentinels.
  const delivered=await m.composite.getAttemptState(id,{userId:student.id},undefined,'current-unit');
  const children=await db.assessment.findMany({where:{compositeAttemptId:id}});
  checked('current-exact-child-written-after-withdrawal',()=>{assert.equal(children.length,1);assert.equal(delivered.currentItem.type,'SCALE');assert.equal(delivered.currentItem.id,item.id);assert.equal(delivered.currentItem.scaleAssessmentId,children[0].id);assert.equal(delivered.trainingFlow.currentInstrumentKey,m.flow.trainingFlowItemKey(item.id))});
  const child=children[0],childRuntime=await m.runtime.loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db);
  checked('frozen-identity-epoch-and-null-guide',()=>{
   assert.equal(child.compositeAttemptId,id);assert.equal(child.compositeItemId,item.id);assert.equal(child.scaleId,installed.scaleId);assert.equal(child.userId,student.id);assert.equal(child.attemptEpoch,parent.attemptEpoch);
   assert.equal(child.runtimeSnapshotEncrypted,candidate.references[item.id]);assert.equal(child.compiledRuntimeHash,frozen.compiledRuntime.compiledRuntimeHash);assert.equal(childRuntime.sourceDefinitionHash,slot.sourceDefinitionIdentity.hash);assert.equal(child.compiledRuntimeHash,slot.sourceBinding.compiledRuntimeHash);
   assert.equal(childRuntime.instruction,null);assert.equal(delivered.currentItem.scale.instruction,null);assert.equal(delivered.attemptEpoch,parent.attemptEpoch);
  });
  const again=await m.composite.getAttemptState(id,{userId:student.id},undefined,'current-unit');
  checked('reread-keeps-one-child',()=>{assert.equal(again.currentItem.scaleAssessmentId,child.id);assert.equal(again.currentItem.scale.instruction,null)});
  assert.equal(await db.assessment.count({where:{compositeAttemptId:id}}),1);
  stage='new-start-still-requires-current-authority';let newStartDenied=false;
  try{await m.composite.startUserAttempt(newStudent.id,q.id)}catch(error){assert([403,409].includes(error.statusCode??error.status));newStartDenied=true}
  checked('new-start-remains-denied',()=>assert(newStartDenied));
  assert.equal(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:q.id,userId:newStudent.id}}),0);
  assert.deepEqual(result.assertions.map(value=>value.id),ASSERTIONS);
  result.observed={databaseName:safe.databaseName,parentId:id,itemId:item.id,childId:child.id,epoch:parent.attemptEpoch,sourceKey:key,sourceVersion:version,combinationReleaseId:pointer.releaseId,combinationHash:pointer.combinationHash,flowSnapshotHash:parent.trainingFlowSnapshotHash,slotSetHash:parent.frozenActiveSlotSetHash,compiledRuntimeHash:child.compiledRuntimeHash,sourceDefinitionHash:childRuntime.sourceDefinitionHash,materializedChildCount:children.length,trialCount:trials.length,emergencyStopCount:emergency.length,frozenInstruction:null,useRevoked:true,sourceWithdrawn:true,newStartDenied};
  result.status='passed';
 }catch(caught){error=caught;result.status='failed';result.failure={stage,name:caught.name,message:caught.message}}
 finally{
  if(m){try{await m.queues.closeQueues(true)}catch(caught){error??=caught}try{await m.db.$disconnect()}catch(caught){error??=caught}
   if(globalThis.prisma===m.db)delete globalThis.prisma;if(globalThis.prismaObservabilityClient===m.db)delete globalThis.prismaObservabilityClient;
  }
 }
 if(error&&result.status==='passed'){result.status='failed';result.failure={stage:'cleanup',name:error.name,message:error.message}}
 result.completedAt=new Date().toISOString();fs.writeFileSync(safe.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 if(error)throw error;return result;
}
module.exports={CASE_ID,ASSERTIONS,assertIsolation,runFixture};
if(require.main===module)runFixture().catch(()=>{console.error('Exact lazy consumer failed; inspect retained result and phase command log');process.exitCode=1});
