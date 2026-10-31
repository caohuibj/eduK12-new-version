import type {TrainingFeedbackPolicy} from '../../modules/assessment-policy/training-feedback-policy'
import {randomUUID} from 'node:crypto'
import {getContentRelease,publishContentRelease} from '../../modules/measurement-content/repository'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import type {User} from '@prisma/client'
import {Prisma,type PrismaClient} from '@prisma/client'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {freezeAssignmentProfile} from '../../modules/cognitive/profile-freeze'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {prepareTrainingContentSnapshot} from '../../modules/composite/training-content-binding'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import * as producer from '../../modules/education-tools/assessment-resource.service'
import {resolveCompositeSituationalItems} from '../../modules/composite/composite.service'
import {ensureStaticSjtRegistryMapping,publishStaticSjtMeasurement,readStaticSjtMeasurementForStart} from '../../modules/situational/static-measurement-release'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'

/** Disposable database only: synthetic users/content setup followed by actual
 * exact grant issuance and prepare/register/independent review/publication.
 * No real tool, third-party content or external participant data is approved. */
export async function teacherRuntimePgFixture(owner:PrismaClient,family:'BUNDLE'|'COGNITIVE'|'SITUATIONAL'='BUNDLE',consentRequired=false,includeOther=false,withReports=false,feedbackPolicy?:TrainingFeedbackPolicy,formOnly=false,completionOnly=false){
 const user=async(label:string,accountDomain:'SCHOOL'|'TRAINING'='SCHOOL',system=false)=>owner.user.create({data:{
  username:'pr363_'+label+'_'+randomUUID(),passwordHash:'synthetic-not-login',accountDomain,role:system?'ADMIN':'TEACHER',teacherApproved:true,
  ...(system?{platformRole:'SYSTEM_ADMIN'}:{}),
 }})
 const issuer=await user('issuer','TRAINING',true),reviewer=await user('reviewer','TRAINING',true)
 const manager=await user('manager'),respondent=await user('respondent'),other=await user('other')
 const org=await owner.organization.create({data:{id:randomUUID(),name:'Synthetic PR363 runtime',productDomain:'SCHOOL',createdByUserId:manager.id}})
 await owner.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',grantedByUserId:manager.id}})
 let respondentMemberId='',otherMemberId=''
 for(const actor of [manager,respondent,other]){
  const member=await owner.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:actor.id,...(actor.id===manager.id?{orgRole:'ORG_ADMIN'}:{})}})
  await owner.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,persona:'TEACHER',grantedByUserId:manager.id}})
  if(actor.id===manager.id)await owner.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id}})
  if(actor.id===respondent.id)respondentMemberId=member.id
  if(actor.id===other.id)otherMemberId=member.id
 }
 const delivery=await runtimeDeliverySourceFixture(owner,'TEACHER',org,issuer,reviewer,family,consentRequired,withReports,feedbackPolicy,formOnly,completionOnly)
 const {entry}=delivery
 const target=await createHuiteacherTarget({organizationId:org.id,actorUserId:manager.id,kind:'ORGANIZATION',name:'Synthetic teachers'})
 const event=await createHuiteacherEvent({organizationId:org.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic PR363 event'})
 const scope={organizationId:org.id,actorUserId:manager.id,eventId:event.id}
 const run=await createHuiteacherEventRunDraft({...scope,name:'Synthetic PR363 runtime'})
 const a=entry.applicability
 await addTeacherRunTrack({...scope,expectedRunId:run.runId,expectedVersion:1,resource:{family,key:delivery.resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:includeOther?[respondentMemberId,otherMemberId]:[respondentMemberId]},
  respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:includeOther?[respondentMemberId,otherMemberId]:[respondentMemberId]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,
   relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
 await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
 await publishTeacherRun({...scope,expectedVersion:2})
 const [execution]=await owner.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT e.id FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
  WHERE e.organization_id=${org.id} AND e.run_id=${run.runId} AND respondent.user_id=${respondent.id}`)
 if(!execution)throw new Error('Real Teacher publication did not create the respondent execution')
 const [otherExecution]=await owner.$queryRaw<Array<{id:string}>>`SELECT e.id FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id WHERE e.run_id=${run.runId} AND a.user_id=${other.id}`
 return {otherExecutionId:otherExecution?.id,respondent,other,manager,issuer,reviewer,organizationId:org.id,eventId:event.id,runId:run.runId,executionId:execution.id,...delivery}
}

export async function runtimeDeliverySourceFixture(owner:PrismaClient,product:'TEACHER'|'SCHOOL',org:{id:string},issuer:User,reviewer:User,family:'BUNDLE'|'COGNITIVE'|'SITUATIONAL',consentRequired=false,withReports=false,feedbackPolicy:TrainingFeedbackPolicy={schemaVersion:1,mode:'IMMEDIATE'},formOnly=false,completionOnly=false,groupMode=false,retainedSourceId?:string){
 const retained=retainedSourceId?(await owner.assessmentManagementEvent.findFirst({where:{actorId:issuer.id,action:'EDUCATION_ASSESSMENT_PREPARED',metadata:{path:['sourceCompositeId'],equals:retainedSourceId}},orderBy:{createdAt:'desc'}}))?.metadata as any:undefined
 const resourceId=retained?.resourceId??randomUUID(),resourceKey=`education-assessment:${product}:${org.id}:${resourceId}`
 const source=retainedSourceId?await owner.compositeAssessment.findUniqueOrThrow({where:{id:retainedSourceId}}):await owner.compositeAssessment.create({data:{code:'pr363-source-'+randomUUID(),name:'Synthetic actual source',createdBy:issuer.id,
  status:'PUBLISHED',publishedAt:new Date(),publicEnabled:false,copyable:false}})
 if(source.createdBy!==issuer.id||source.status!=='PUBLISHED')throw Error('Retained synthetic source changed')
 const runtime=source
 if(!retained){
 if(family!=='SITUATIONAL'&&!formOnly&&!await owner.compositeAssessmentItem.count({where:{compositeAssessmentId:runtime.id,type:'COGNITIVE'}})){
  const config=await owner.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:'pr363-'+randomUUID(),name:'Synthetic reaction runtime parameters',status:'PUBLISHED',
   engineVersion:'1.0.0',scoringVersion:'1.1.0',accessPolicy:'OPEN',publishedAt:new Date(),config:{totalTrials:5,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,
    report:{reportVersion:'1.1.0',referenceMode:'none'}}}})
  const {resolvedConfig:_resolved,...frozen}=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion),baseConfig:config.config,profile:'experience'})
  const assignment=await owner.cognitiveAssignment.create({data:{configId:config.id,createdBy:issuer.id,title:'Synthetic reaction assignment',status:'PUBLISHED',
   publishedAt:new Date(),maxAttempts:10,listedStandalone:false,...frozen}})
  await owner.$transaction(tx=>publishAssignmentMeasurementRelease(tx,issuer.id,assignment.id))
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:assignment.id}})
 }
 if(family!=='COGNITIVE'&&!formOnly){
  await owner.$transaction(async tx=>{
   const mapping=await ensureStaticSjtRegistryMapping(tx,{instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion})
   if(groupMode&&mapping.measurement_release_id)await readStaticSjtMeasurementForStart(tx,{instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion},'PUBLISH')
   else await publishStaticSjtMeasurement(tx,{actorId:reviewer.id,mappingId:mapping.id,deployment:{locale:'zh-CN',territory:'synthetic-disposable-test'}})
  })
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'SITUATIONAL',position:family==='BUNDLE'?1:0,required:true,
   situationalInstrumentKey:sjt.key,situationalInstrumentVersion:sjt.instrumentVersion}})
 }
 if(family==='BUNDLE'&&!groupMode){
  const section=await owner.compositeFormSection.create({data:{compositeAssessmentId:runtime.id,title:'Synthetic optional note',position:2}})
  await owner.compositeAssessmentItem.create({data:{compositeAssessmentId:runtime.id,type:'FORM',position:2,required:true,formSectionId:section.id,formSectionPosition:0,
   formType:'SHORT_TEXT',formLabel:'Synthetic note',formDefinition:formQuestionSchema.parse({itemKey:'synthetic_note',type:'SHORT_TEXT',prompt:'Synthetic note',required:true,options:[],rows:[],maxLength:100})}})
 }
 const loaded=await owner.compositeAssessment.findUniqueOrThrow({where:{id:runtime.id},include:{items:{include:{scale:true,cognitiveAssignment:{include:{config:true}}}},formSections:{include:{items:true}}}})
 const prepared=await owner.$transaction(async tx=>prepareTrainingContentSnapshot(tx,loaded,await resolveCompositeSituationalItems(loaded.items,tx,true)))
 await owner.compositeAssessment.update({where:{id:source.id},data:{trainingContentSnapshot:prepared.snapshot,trainingContentSnapshotHash:prepared.snapshotHash}})
 }
 const proof={tokenVersion:0,adminSessionId:'synthetic-strong-admin-proof',adminVerifiedAt:Date.now()/1000}
 const frozenSource=await owner.compositeAssessment.findUniqueOrThrow({where:{id:source.id}})
 const resourceIds=[source.id,...(frozenSource.trainingContentSnapshot as any).units.map((unit:any)=>unit.measurement.releaseId)]
 const distribution=retained?{grantId:retained.distribution.grants[0].grantId}:await issueAdminContentRoot(issuer.id,proof,{requestId:randomUUID(),expectedVersion:0,
  reason:'Explicit target redistribution of synthetic disposable test content only',grant:{subjectId:issuer.id,
   scope:{product,scopeKind:'ORGANIZATION',scopeId:org.id,resourceKind:'material',resourceKeys:resourceIds},
   capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,
   validFrom:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString()}})
 const context=(actor:typeof issuer)=>({product,organizationId:org.id,principal:{userId:actor.id,username:actor.username,
  role:'ADMIN' as const,accountDomain:actor.accountDomain,platformRole:'SYSTEM_ADMIN' as const,mustChangePassword:false,...proof}})
 const licenses:Array<{resourceId:string;grantId:string}>=retained?retained.distribution.grants.map(({resourceId,grantId}:any)=>({resourceId,grantId})):resourceIds.map(resourceId=>({resourceId,grantId:distribution.grantId}))
 const preparation=await producer.prepareEducationAssessment(context(issuer),{resourceId,sourceCompositeId:source.id,title:'Synthetic '+family+' Teacher delivery',family,licenses})
 const reports:Array<{itemId:string;releaseId:string}>=[],metricKeys:string[]=[]
 if(withReports)for(const unit of preparation.units){
  const measurement=await owner.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId))
  if(!measurement||measurement.layer!=='MEASUREMENT')throw new Error('Actual C release required')
  const metric=measurement.content.metrics[0].metricKey;metricKeys.push(metric)
  const report=await owner.$transaction(tx=>publishContentRelease(tx,{family:unit.family,layer:'REPORT',key:'pr363-report-'+randomUUID(),version:'1.0.0',
   scope:{kind:'PRIVATE',product,ownerId:issuer.id,resourceId:preparation.runtimeCompositeId},sourceReleaseId:null,provenance:{},assetRefs:[],
   content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:[metric],
    audience:product==='TEACHER'?'teacher':'student',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,
    template:{title:'Synthetic frozen report',blocks:[{type:'TEXT',text:'Synthetic software verification only'},{type:'METRIC',metricKey:metric,display:'RAW'}]}}},issuer.id))
  const grant=await issueAdminContentRoot(issuer.id,proof,{requestId:randomUUID(),expectedVersion:0,reason:'Explicit synthetic report distribution',
   grant:{subjectId:issuer.id,scope:{product,scopeKind:'ORGANIZATION',scopeId:org.id,resourceKind:'material',resourceKeys:[report.releaseId]},capabilities:['material.distribute'],
    delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString()}})
  licenses.push({resourceId:report.releaseId,grantId:grant.grantId});reports.push({itemId:unit.itemId,releaseId:report.releaseId})
 }
 let disclosure={...testDisclosure(),...(consentRequired?{policyKey:'observer_private_respondent_v1'}:{})}
 if(completionOnly)disclosure.audiences.RESPONDENT={mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}
 if(withReports)disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:[...new Set(metricKeys)],longitudinalMetricKeys:[]}
 const groupUnits:Array<{itemId:string;disclosure:ReturnType<typeof testDisclosure>}>=[],groupParentKeys:string[]=[]
 if(groupMode){
  for(const unit of preparation.units){
   const measurement=await owner.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId))
   if(!measurement||measurement.layer!=='MEASUREMENT')throw Error('Actual native C required')
   const keys=measurement.content.metrics.map(m=>m.metricKey),leaf=testDisclosure(10)
   groupParentKeys.push(...keys);leaf.policyKey='EDUCATION_SELF_GROUP_V2'
   leaf.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:keys.slice(0,1),longitudinalMetricKeys:[]}
   groupUnits.push({itemId:unit.itemId,disclosure:leaf})
  }
  disclosure={...testDisclosure(10),policyKey:'EDUCATION_SELF_GROUP_V2'}
  disclosure.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:[...new Set(groupParentKeys)],longitudinalMetricKeys:[]}
 }
 const registered=await producer.registerEducationAssessment(context(issuer),resourceId,{expectedPreparationHash:preparation.preparationHash,
  disclosure,references:{schemaVersion:1,units:[]},reports,licenses,...(feedbackPolicy?{feedbackPolicy}:{}),...(groupMode?{analysisMode:'COHORT_AGGREGATE',groupUnits}:{})})
 const reviewed=await producer.transitionEducationAssessment(context(reviewer),resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent synthetic runtime fixture review'})
 await producer.transitionEducationAssessment(context(reviewer),resourceId,'PUBLISH',{expectedEntryHash:reviewed.entryHash,reason:'Publish synthetic runtime fixture only'})
 const identity=await owner.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey,version:groupMode?'2.0.0':'1.0.0',purpose:'NEW_USE'}))
 const entry=identity.entry,origin=identity.origin
 return {resourceId,resourceKey,entry,origin,distribution,proof,runtimeId:preparation.runtimeCompositeId,reports}
}
