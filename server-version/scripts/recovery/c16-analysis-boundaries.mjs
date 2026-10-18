/** Additional C16-only synthetic authority/selected-source PG fixtures.
 * All inserts bind new rows. Original C14 tasks, accepted results and hashes stay unchanged.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {attachFourToolSources,addCopiedFourToolFacts} from './c16-analysis-fourtool.mjs'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {encryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {createWeightedVariantAllocation,parseCompiledWeightedVariants}=require(path.join(backend,'dist/modules/assessment-core/weighted-variants.js'))

export async function createSyntheticDisclosureBinding(prisma,fixture){
 const org=randomUUID(),run=randomUUID(),track=randomUUID(),member=randomUUID(),actor=randomUUID(),relationship=randomUUID(),execution=randomUUID(),user=fixture.participants[0].id,parent=fixture.attempts[0].id
 await prisma.organization.create({data:{id:org,name:'C16 SYNTHETIC disclosure boundary',createdByUserId:fixture.teacherId}})
 await prisma.organizationMembership.create({data:{id:member,organizationId:org,userId:user,orgRole:'MEMBER',validFrom:new Date()}})
 await prisma.$executeRawUnsafe('INSERT INTO assessment_runs(id,organization_id,name,created_by_user_id) VALUES($1,$2,$3,$4)',run,org,'C16 SYNTHETIC disclosure boundary',fixture.teacherId)
 await prisma.$executeRawUnsafe("INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy,frozen_resource_policy,resource_policy_hash) VALUES($1,$2,$3,'BUNDLE','C16_SYNTHETIC','1','{}'::jsonb,'{}'::jsonb,$4)",track,org,run,canonicalHash({}))
 await prisma.$executeRawUnsafe("INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,actor_role,snapshot_payload,snapshot_hash) VALUES($1,$2,$3,'ORG_MEMBER',$4,$5,'STUDENT',$6::jsonb,$7)",actor,org,run,user,member,JSON.stringify({synthetic:true,userId:user}),canonicalHash({synthetic:true,userId:user}))
 await prisma.$executeRawUnsafe("INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash) VALUES($1,$2,$3,'SELF',$4,$4,'{}'::jsonb,$5)",relationship,org,run,actor,canonicalHash({}))
 await prisma.$executeRawUnsafe("INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,respondent_actor_snapshot_id,relationship_snapshot_id,status,runtime_binding_kind,runtime_binding_ref,started_at) VALUES($1,$2,$3,$4,$5,$5,$6,'STARTED','COMPOSITE',$7,now())",execution,org,run,track,actor,relationship,parent)
 return {track,async restrict(){const policy={schemaVersion:1,synthetic:true,resultDisclosure:{mode:'COHORT_ONLY'}};assert.equal(await prisma.$executeRawUnsafe('UPDATE assessment_run_tracks SET frozen_resource_policy=$1::jsonb,resource_policy_hash=$2 WHERE id=$3',JSON.stringify(policy),canonicalHash(policy),track),1)}}
}

export async function createVariantPoisonFixture(prisma,owner,passwordHash,completed){
 const first=completed[0],other=completed.find(row=>row.productId===first.productId&&row.variantKey!==first.variantKey);assert.ok(other)
 const course=await prisma.course.create({data:{creatorId:owner,title:'C16 SYNTHETIC selected group poison boundary',courseCode:'C16-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 const task=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:first.productId}}),config=parseCompiledWeightedVariants(task.trainingVariantFrozen)
 let selectedMetric,selectedAssignment,poisonParent,poisonChild
 const selectedIds=[]
 for(const [which,example]of [first,other].entries()){
  const f={waves:[],selector:{waves:[]},attempts:[]};await attachFourToolSources(prisma,f,example)
  const original=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:example.attemptId}}),form=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:original.id,unitType:'FORM_SECTION'}})
  const units=f.fourTool.units,chosen=units.find(unit=>unit.type==='COGNITIVE');if(which===0){selectedMetric={itemId:chosen.item.id,metricKey:chosen.metricKey};selectedAssignment=chosen.item.cognitiveAssignmentId}
  f.waves=[{index:0,extraItems:units.map(unit=>({type:unit.type,id:unit.item.id,metricKey:unit.metricKey,value:unit.value}))}]
  if(which===1)f.poisonUnitType='COGNITIVE'
  const ticket=config.groups.slice(0,config.groups.findIndex(group=>group.variantKey===example.variantKey)).reduce((sum,group)=>sum+group.weight,0)
  for(let index=0;index<(which===0?5:1);index++){
   const user=await prisma.user.create({data:{username:'c16-synthetic-poison-'+randomUUID(),passwordHash,role:'STUDENT',accountDomain:'TRAINING',mustChangePassword:false}}),id=randomUUID(),participantKey='c16-synthetic:'+user.id
   const allocation=createWeightedVariantAllocation(config,{compositeId:task.id,attemptId:id,participantKey,attemptEpoch:1,publishedAt:task.publishedAt.toISOString()},{randomInt:()=>ticket})
   await prisma.compositeAssessmentAttempt.create({data:{...original,id,userId:user.id,participantKey,deliveryCourseId:course.id,attemptNo:1,accessTokenId:null,recoveryTokenHash:null,anonymousCode:null,subjectUserId:null,respondentUserId:null,episodeId:null,assignmentRef:null,consentId:null,contextSnapshotRef:null,asyncReportEpoch:null,trainingVariantAllocationEncrypted:encryptUnifiedRuntimePayload(allocation),trainingVariantAllocationHash:allocation.allocationHash}})
   await prisma.assessmentUnitSnapshot.create({data:{...form,id:randomUUID(),compositeAttemptId:id,sourceAttemptId:randomUUID(),sourceSubmissionId:randomUUID()}})
   f.attempts.push({id,userId:user.id,waveIndex:0,value:null});await addCopiedFourToolFacts(prisma,f,[user])
   if(which===0)selectedIds.push(id);else{poisonParent=id;poisonChild=(await prisma.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:id}})).id}
  }
 }
 const followup=await prisma.compositeAssessment.create({data:{code:'C16-'+randomUUID(),name:'C16 SYNTHETIC empty follow-up',createdBy:owner,courseId:course.id,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'PUBLISHED',publishedAt:new Date(),maxAttempts:1}})
 const followupItem=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:followup.id,type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:selectedAssignment}})
 return {courseId:course.id,selectedIds,poisonParent,poisonChild,selector:{schemaVersion:1,courseId:course.id,mode:'PAIRWISE',waves:[{waveKey:'selected_group',taskId:task.id,publication:task.publishedAt.toISOString(),configDigest:task.trainingVariantDigest,variantKey:first.variantKey,metrics:[selectedMetric]},{waveKey:'empty_followup',taskId:followup.id,publication:followup.publishedAt.toISOString(),configDigest:null,variantKey:null,metrics:[{itemId:followupItem.id,metricKey:selectedMetric.metricKey}]}]}}
}
