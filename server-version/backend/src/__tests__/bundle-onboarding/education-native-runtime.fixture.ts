import {randomUUID} from 'node:crypto'
import fs from 'node:fs'
import {prisma as db} from '../../config/database'
import type {AuthenticatedPrincipal} from '../../types'
import {grantPersona,grantCapability} from '../../modules/organization/service'
import {createOrganizationUnit} from '../../modules/organization/structure'
import {assignStaffToClass} from '../../modules/organization/classRelationships'
import {replaceCampusRoster,setCampusRegistrationWindow,issueCampusActivationCodes,registerCampusStudent,approveCampusClass} from '../../modules/campus/admission.service'
import {createCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {allocateCampusActivityParticipants} from '../../modules/campus/activity.allocation'
import {createCampusActivityRunDraft} from '../../modules/campus/activity.runs'
import {addAssessmentRunTrackDraft} from '../../modules/assessment-run/repository'
import {publishAssessmentRun} from '../../modules/assessment-run/publish'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {readEducationRespondentAssessmentReport} from '../../modules/reporting/education-assessment-report.service'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {expect} from 'vitest'

/** Continuation of an already normally published synthetic source. No earlier
 * C/P/R installation, publication checks or single-score cases execute again. */
export async function finishSchoolNative(checkpoint:{organizationId:string;managerId:string;resourceId:string;sourceId:string;resourceKey:string}){
 const org={id:checkpoint.organizationId},manager=await db.user.findUniqueOrThrow({where:{id:checkpoint.managerId}}),prepared={resourceId:checkpoint.resourceId},published={resourceKey:checkpoint.resourceKey,version:'1.0.0'}
 const identity=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:published.version,purpose:'NEW_USE'}))
 const source=await db.compositeAssessment.findUniqueOrThrow({where:{id:checkpoint.sourceId},include:{bundleInstance:true}})
 const actor=(u:{id:string;username:string;role:any;accountDomain:any;platformRole:any}):AuthenticatedPrincipal=>({userId:u.id,username:u.username,role:u.role,accountDomain:u.accountDomain,platformRole:u.platformRole,tokenVersion:0,mustChangePassword:false})
 const [priorGrade]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM organization_units WHERE organization_id=${org.id} AND unit_kind='GRADE' AND name='九年级'`
 const grade=priorGrade??await createOrganizationUnit({organizationId:org.id,unitKind:'GRADE',name:'九年级'})
 const [priorRoom]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM organization_units WHERE organization_id=${org.id} AND parent_unit_id=${grade.id} AND unit_kind='CLASS' AND name='合成班级'`
 const room=priorRoom??await createOrganizationUnit({organizationId:org.id,unitKind:'CLASS',name:'合成班级',parentUnitId:grade.id})
 const [staff]=await db.$queryRaw<Array<{membershipId:string;userId:string}>>`SELECT m.id AS "membershipId",m.user_id AS "userId" FROM organization_staff_class_assignments a JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id WHERE a.organization_id=${org.id} AND a.class_unit_id=${room.id} AND a.staff_role='HOMEROOM' AND a.valid_until IS NULL LIMIT 1`
 let teacher
 if(staff)teacher=await db.user.findUniqueOrThrow({where:{id:staff.userId}})
 else{
  teacher=await db.user.create({data:{username:'evc-homeroom-'+randomUUID(),passwordHash:'synthetic-only',role:'TEACHER',teacherApproved:true,accountDomain:'SCHOOL'}})
  const tm=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:teacher.id}})
  for(const persona of ['TEACHER','COUNSELOR'] as const)await grantPersona({organizationId:org.id,membershipId:tm.id,persona,meta:{actorUserId:manager.id,commandKey:randomUUID()}})
  await grantCapability({organizationId:org.id,membershipId:tm.id,capability:'PSYCHOLOGY_STAFF',meta:{actorUserId:manager.id,commandKey:randomUUID()}})
  await assignStaffToClass({organizationId:org.id,membershipId:tm.id,classUnitId:room.id,staffRole:'HOMEROOM'})
 }
 const evidenceDir=process.env.EVC_EVIDENCE_DIRECTORY,stateFile=evidenceDir?evidenceDir+'/education-native-runtime-'+checkpoint.resourceId+'.json':undefined
 const recovery: {studentNumber?:string;rosterVersion?:number;studentId?:string;activityId?:string;runId?:string;executionId?:string}=stateFile&&fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{}
 const save=()=>{if(stateFile)fs.writeFileSync(stateFile,JSON.stringify(recovery),{mode:0o600})}
 let admission=await db.campusClassAdmission.findUnique({where:{classUnitId:room.id}})
 if(!recovery.rosterVersion){
  // A previous synthetic login failed before enrollment. Use the normal close
  // command before changing that unopened population; never overwrite a live roster.
  if(admission?.status==='OPEN')await setCampusRegistrationWindow({actor:actor(manager),organizationId:org.id,classUnitId:room.id,action:'CLOSE'})
  recovery.studentNumber='EVC'+randomUUID().slice(0,8)
  const roster=await replaceCampusRoster({actor:actor(manager),organizationId:org.id,classUnitId:room.id,studentNumbers:[recovery.studentNumber]})
  recovery.rosterVersion=roster.rosterVersion;save()
 }
 if(!recovery.studentId){
  admission=await db.campusClassAdmission.findUnique({where:{classUnitId:room.id}})
  if(admission?.status!=='OPEN')await setCampusRegistrationWindow({actor:actor(manager),organizationId:org.id,classUnitId:room.id,action:'OPEN',closesAt:new Date(Date.now()+3600000)})
  const codes=await issueCampusActivationCodes({actor:actor(manager),organizationId:org.id,classUnitId:room.id,count:1,ttlMinutes:30})
  const enrolled=await registerCampusStudent({organizationId:org.id,classUnitId:room.id,studentNumber:recovery.studentNumber!,activationCode:codes.codes[0],username:'evc_pupil_'+randomUUID().replace(/-/g,'').slice(0,16),password:'SyntheticEvcOnly123'})
  recovery.studentId=enrolled.userId;save()
 }
 const enrolled={userId:recovery.studentId!}
 admission=await db.campusClassAdmission.findUnique({where:{classUnitId:room.id}})
 if(admission?.status==='OPEN')await setCampusRegistrationWindow({actor:actor(manager),organizationId:org.id,classUnitId:room.id,action:'CLOSE'})
 if(admission?.status!=='APPROVED')await approveCampusClass({actor:actor(teacher),organizationId:org.id,classUnitId:room.id,expectedRosterVersion:recovery.rosterVersion!})
 const sm=await db.organizationMembership.findFirstOrThrow({where:{organizationId:org.id,userId:enrolled.userId,validUntil:null}})
 const activity=recovery.activityId?{id:recovery.activityId}:await createCampusActivity({actor:actor(manager),organizationId:org.id,title:'EVC研究试验',purpose:'SCHOOL_CLIMATE'})
 recovery.activityId=activity.id;save()
 if(!recovery.runId)await allocateCampusActivityParticipants({actor:actor(manager),organizationId:org.id,courseId:activity.id,classUnitIds:[room.id],requestKey:randomUUID(),expectedVersion:1})
 const run=recovery.runId?{id:recovery.runId}:await createCampusActivityRunDraft({actor:actor(manager),organizationId:org.id,courseId:activity.id,name:'EVC native School'})
 recovery.runId=run.id;save()
 const a=identity.entry.applicability
 const [runState]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE organization_id=${org.id} AND id=${run.id}`
 const [existingTrack]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_tracks WHERE organization_id=${org.id} AND run_id=${run.id} AND resource_key=${published.resourceKey}`
 if(!existingTrack)await addAssessmentRunTrackDraft({organizationId:org.id,runId:run.id,actorUserId:manager.id,expectedVersion:runState.version,expectedRunId:run.id,educationWorkflow:{product:'SCHOOL',id:activity.id},resource:{family:'BUNDLE',key:published.resourceKey,version:published.version},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[sm.id]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[sm.id]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
 let [activityState]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM campus_activities WHERE organization_id=${org.id} AND course_id=${activity.id}`
 if(activityState.status==='DRAFT')await changeCampusActivityStatus({actor:actor(manager),organizationId:org.id,courseId:activity.id,action:'SUBMIT',expectedVersion:activityState.version})
 ;[activityState]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM campus_activities WHERE organization_id=${org.id} AND course_id=${activity.id}`
 if(activityState.status==='SUBMITTED')await changeCampusActivityStatus({actor:actor(manager),organizationId:org.id,courseId:activity.id,action:'OPEN',expectedVersion:activityState.version})
 const [readyRun]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE organization_id=${org.id} AND id=${run.id}`
 if(readyRun.status==='DRAFT')expect((await publishAssessmentRun({organizationId:org.id,runId:run.id,actorUserId:manager.id,expectedVersion:readyRun.version})).executionCount).toBe(1)
 const [execution]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE organization_id=${org.id} AND run_id=${run.id}`
 const started=await startAssessmentRunExecution({executionId:execution.id,actorUserId:enrolled.userId})
 if(!('runtimeBindingRef' in started)||started.runtimeBindingKind!=='COMPOSITE')throw new Error('EXPECTED_COMPOSITE_START')
 const id=started.runtimeBindingRef
 recovery.executionId=execution.id;save()
 let state=await getAttemptState(id,{userId:enrolled.userId});const form=state.currentItem as any
 if(form?.type==='FORM_SECTION')await submitCompositeFormSectionFinal({attemptId:id,sectionId:form.formSectionId,userId:enrolled.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:form.answers.map((f:any)=>({formItemId:f.formItemId,value:'9'}))})
 for(let n=0;n<2;n++){state=await getAttemptState(id,{userId:enrolled.userId});const unit=state.currentItem as any;if(!unit||state.status==='COMPLETED')break;await submitScaleAssessmentFinal({assessmentId:unit.scaleAssessmentId,userId:enrolled.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:unit.scale.definition.items.map((q:any,k:number)=>({itemCode:q.itemCode,responseValue:String(unit.scale.definition.items.length===5?[2,2,2,2,3][k]:5)}))})}
 await finalizeCompositeAttemptIfReady(id)
 const feedback=await readEducationRespondentAssessmentReport({actorUserId:enrolled.userId,executionId:execution.id,product:'SCHOOL'})
 expect(feedback).toMatchObject({state:'READY',nativeBundle:{status:'READY',profileView:{state:'MATCHED',profileId:'P4',actions:[]}}})
 expect(await db.bundleAnalysis.count({where:{attemptId:id}})).toBe(1)
 if(process.env.EVC_EVIDENCE_DIRECTORY)fs.writeFileSync(process.env.EVC_EVIDENCE_DIRECTORY+'/education-native-result.json',JSON.stringify({status:'PASS',resourceId:prepared.resourceId,executionId:execution.id,attemptId:id,sourceDefinitionHash:source.bundleInstance!.definitionHash,nativeBundle:(feedback as any).nativeBundle},null,2))
}
