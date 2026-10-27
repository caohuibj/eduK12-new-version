import {randomUUID} from 'node:crypto'
import {Prisma,type PrismaClient} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {freezeAssignmentProfile} from '../../modules/cognitive/profile-freeze'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {prepareTrainingContentSnapshot} from '../../modules/composite/training-content-binding'
import {buildTrainingFlowUnits} from '../../modules/composite/training-flow-definition'
import {resolveCompositeSituationalItems} from '../../modules/composite/composite.service'
import {ensureStaticSjtRegistryMapping,publishStaticSjtMeasurement} from '../../modules/situational/static-measurement-release'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {draftEducationAssessmentEntry} from '../../modules/education-tools/assessment-resource.contract'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'

/** Disposable-DB source producer fixture. Real C/P/R projection/persistence and
 * immutable delivery lifecycle constraints are used. Direct owner seeding of
 * synthetic authorities/configs/delivery approval is NOT the production source
 * authoring/publishing workflow; no real tool or external data is approved. */
export async function teacherRuntimePgFixture(owner:PrismaClient,family:'BUNDLE'|'COGNITIVE'|'SITUATIONAL'='BUNDLE',consentRequired=false){
 const user=async(label:string,accountDomain:'SCHOOL'|'TRAINING'='SCHOOL',system=false)=>owner.user.create({data:{
  username:'pr363_'+label+'_'+randomUUID(),passwordHash:'synthetic-not-login',accountDomain,role:system?'ADMIN':'TEACHER',teacherApproved:true,
  ...(system?{platformRole:'SYSTEM_ADMIN'}:{}),
 }})
 const issuer=await user('issuer','TRAINING',true),reviewer=await user('reviewer','TRAINING',true)
 const manager=await user('manager'),respondent=await user('respondent'),other=await user('other')
 const org=await owner.organization.create({data:{id:randomUUID(),name:'Synthetic PR363 runtime',productDomain:'SCHOOL',createdByUserId:manager.id}})
 await owner.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',grantedByUserId:manager.id}})
 let respondentMemberId=''
 for(const actor of [manager,respondent,other]){
  const member=await owner.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:actor.id,...(actor.id===manager.id?{orgRole:'ORG_ADMIN'}:{})}})
  await owner.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,persona:'TEACHER',grantedByUserId:manager.id}})
  if(actor.id===manager.id)await owner.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id}})
  if(actor.id===respondent.id)respondentMemberId=member.id
 }
 const resourceId=randomUUID(),resourceKey=`education-assessment:TEACHER:${org.id}:${resourceId}`
 const source=await owner.compositeAssessment.create({data:{code:'pr363-source-'+randomUUID(),name:'Synthetic source placeholder',createdBy:issuer.id}})
 const runtime=await owner.compositeAssessment.create({data:{code:'pr363-runtime-'+randomUUID(),name:'Synthetic Teacher runtime',createdBy:issuer.id,
  productKind:'ORGANIZATION_RESOURCE',status:'PUBLISHED',publishedAt:new Date(),publicEnabled:false,copyable:false,creationKey:resourceKey}})
 if(family!=='SITUATIONAL'){
  const config=await owner.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:'pr363-'+randomUUID(),name:'Synthetic reaction runtime parameters',status:'PUBLISHED',
   engineVersion:'1.0.0',scoringVersion:'1.1.0',accessPolicy:'OPEN',publishedAt:new Date(),config:{totalTrials:5,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,
    report:{reportVersion:'1.1.0',referenceMode:'none'}}}})
  const {resolvedConfig:_resolved,...frozen}=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion),baseConfig:config.config,profile:'experience'})
  const assignment=await owner.cognitiveAssignment.create({data:{configId:config.id,createdBy:issuer.id,title:'Synthetic reaction assignment',status:'PUBLISHED',
   publishedAt:new Date(),maxAttempts:10,listedStandalone:false,...frozen}})
  await owner.$transaction(tx=>publishAssignmentMeasurementRelease(tx,issuer.id,assignment.id))
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:assignment.id}})
 }
 if(family!=='COGNITIVE'){
  await owner.$transaction(async tx=>{
   const mapping=await ensureStaticSjtRegistryMapping(tx,{instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion})
   await publishStaticSjtMeasurement(tx,{actorId:reviewer.id,mappingId:mapping.id,deployment:{locale:'zh-CN',territory:'synthetic-disposable-test'}})
  })
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'SITUATIONAL',position:family==='BUNDLE'?1:0,required:true,
   situationalInstrumentKey:sjt.key,situationalInstrumentVersion:sjt.instrumentVersion}})
 }
 if(family==='BUNDLE'){
  const section=await owner.compositeFormSection.create({data:{compositeAssessmentId:runtime.id,title:'Synthetic optional note',position:2}})
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'FORM',position:2,required:true,formSectionId:section.id,formSectionPosition:0,
   formType:'SHORT_TEXT',formLabel:'Synthetic note',formDefinition:formQuestionSchema.parse({itemKey:'synthetic_note',type:'SHORT_TEXT',prompt:'Synthetic note',required:true,options:[],rows:[],maxLength:100})}})
 }
 const loaded=await owner.compositeAssessment.findUniqueOrThrow({where:{id:runtime.id},include:{items:{include:{scale:true,cognitiveAssignment:{include:{config:true}}}},formSections:{include:{items:true}}}})
 const prepared=await owner.$transaction(async tx=>prepareTrainingContentSnapshot(tx,loaded,await resolveCompositeSituationalItems(loaded.items,tx,true)))
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,resourceId,product:'TEACHER' as const,organizationId:org.id,family,
  sourceCompositeId:source.id,runtimeCompositeId:runtime.id,sourceSnapshotHash:canonicalHash({syntheticSourcePlaceholder:source.id}),
  runtimeSnapshotHash:prepared.snapshotHash,runtimeDefinitionHash:canonicalHash(buildTrainingFlowUnits(loaded)),
  units:prepared.snapshot.units.map(unit=>({itemId:unit.itemId,family:unit.family,measurement:unit.measurement,references:[],report:null}))}
 await owner.compositeAssessment.update({where:{id:runtime.id},data:{trainingContentSnapshot:prepared.snapshot,trainingContentSnapshotHash:prepared.snapshotHash,creationHash:canonicalHash(origin)}})
 const draft=draftEducationAssessmentEntry({origin,title:'Synthetic '+family+' Teacher delivery',disclosure:{...testDisclosure(),...(consentRequired?{policyKey:'observer_private_respondent_v1'}:{})}})
 const createdProof={kind:'SYSTEM_ADMIN',actorId:issuer.id},reviewedProof={kind:'SYSTEM_ADMIN',actorId:reviewer.id}
 await owner.$executeRaw(Prisma.sql`INSERT INTO education_assessment_deliveries(id,product,organization_id,family,source_composite_id,runtime_composite_id,
  entry,entry_hash,created_by_user_id,created_authority) VALUES(${resourceId},'TEACHER',${org.id},${family},${source.id},${runtime.id},
  ${JSON.stringify(draft)}::jsonb,${canonicalHash(draft)},${issuer.id},${JSON.stringify(createdProof)}::jsonb)`)
 await owner.$executeRaw(Prisma.sql`UPDATE education_assessment_deliveries SET status='REVIEWED',reviewed_by_user_id=${reviewer.id},reviewed_at=clock_timestamp(),
  reviewed_authority=${JSON.stringify(reviewedProof)}::jsonb WHERE id=${resourceId}`)
 const entry={...draft,releaseStatus:'PUBLISHED' as const}
 await owner.$executeRaw(Prisma.sql`UPDATE education_assessment_deliveries SET status='PUBLISHED',entry=${JSON.stringify(entry)}::jsonb,entry_hash=${canonicalHash(entry)},
  published_by_user_id=${reviewer.id},published_at=clock_timestamp(),published_authority=${JSON.stringify(reviewedProof)}::jsonb WHERE id=${resourceId}`)
 const target=await createHuiteacherTarget({organizationId:org.id,actorUserId:manager.id,kind:'ORGANIZATION',name:'Synthetic teachers'})
 const event=await createHuiteacherEvent({organizationId:org.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic PR363 event'})
 const scope={organizationId:org.id,actorUserId:manager.id,eventId:event.id}
 const run=await createHuiteacherEventRunDraft({...scope,name:'Synthetic PR363 runtime'})
 const a=entry.applicability
 await addTeacherRunTrack({...scope,resource:{family,key:resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[respondentMemberId]},
  respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[respondentMemberId]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,
   relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
 await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
 await publishTeacherRun({...scope,expectedVersion:2})
 const [execution]=await owner.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT e.id FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
  WHERE e.organization_id=${org.id} AND e.run_id=${run.runId} AND respondent.user_id=${respondent.id}`)
 if(!execution)throw new Error('Real Teacher publication did not create the respondent execution')
 return {respondent,other,manager,issuer,reviewer,organizationId:org.id,eventId:event.id,runId:run.runId,executionId:execution.id,resourceId,resourceKey,runtimeId:runtime.id,origin}
}
