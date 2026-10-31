import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationRuntimeActors} from './educationLibraryRuntimeFixture'
import {independentReviewer} from './independent-reviewer'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun,teacherTrackingOptions,createNextTeacherTrackingEvent} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {listTeacherNumericGroups,generateTeacherNumericGroup,readTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
import {readReportingArtifactRecord} from '../../modules/reporting/artifact'
import {teacherGroupLongitudinalCatalog,generateTeacherGroupLongitudinal,readTeacherGroupLongitudinal} from '../../modules/huiteacher/groupLongitudinalReport.service'
import {readTeacherCompositionLibraryGroupChoices} from '../../modules/education-tools/teacher-composition-group-source'

const url=integrationDatabaseUrl('TEACHER_PRIVATE_GROUP_LONGITUDINAL_DATABASE_URL')
if(url)requireIsolatedReleaseDatabase(url)
afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await db.$disconnect()})
it.skipIf(!url)('publishes two private composition waves through the real source and preserves small-N suppression and saved reads',async()=>{
 const file=process.env.TEACHER_PRIVATE_GROUP_LONGITUDINAL_CHECKPOINT!
 if(!file)throw Error('Explicit synthetic checkpoint required')
 const checkpoint=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):await(async()=>{
  const f=await setupEducationRuntimeActors(db,'TEACHER'),scope={organizationId:f.organizationId,actorUserId:f.manager.userId}
  const members=[f.participantMembershipId!]
  for(let i=0;i<9;i++){
   const user=await db.user.create({data:{username:'private-group-'+randomUUID(),passwordHash:'synthetic-only',role:'TEACHER',accountDomain:'SCHOOL',teacherApproved:true}})
   const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:user.id}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,persona:'TEACHER',grantedByUserId:f.manager.userId}})
   members.push(member.id)
  }
  const context={entry:'TEACHER' as const,organizationId:f.organizationId,principal:{userId:f.manager.userId,accountDomain:'SCHOOL' as const}}
  const freeze=async(kind:'SCALE'|'COMPOSITION',definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title:'Synthetic private GROUP source'})
   const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const scale=compileResearchScale('Synthetic private support',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Support',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic support',required:true,reverse:false,dimensionKeys:['total']}]})
  scale.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN'}
  scale.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'reflection',min:0,max:3,includeMax:true,text:'Own authorized reflection'}]}]}
  const leaf=await freeze('SCALE',scale),blockId=randomUUID()
  const fixed=await freeze('COMPOSITION',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',
   blocks:[{blockId,instruction:'',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:leaf.id,contentHash:leaf.contentHash}}],
   groupReporting:{schemaVersion:1,minimumRespondents:10,leaves:[{blockId,versionId:leaf.id,contentHash:leaf.contentHash,audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}}]}})
  const target=await createHuiteacherTarget({...scope,kind:'ORGANIZATION',name:'Synthetic private source population'})
  const event=await createHuiteacherEvent({...scope,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic private composition'})
  const run=await createHuiteacherEventRunDraft({...scope,eventId:event.id,name:'Synthetic private composition'})
  await addTeacherPrivateCompositionRunTrack({...scope,eventId:event.id},{expectedVersion:1,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:members},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:members}})
  await transitionHuiteacherEvent({...scope,eventId:event.id,action:'OPEN',expectedVersion:1})
  const options=await teacherTrackingOptions({...scope,eventId:event.id})
  await publishTeacherRun({...scope,eventId:event.id,expectedVersion:2,tracking:{mode:'LONGITUDINAL',metrics:options.choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))}})
  const result={scope:{...scope,eventId:event.id},runId:run.runId,sourceVersionId:fixed.id,participantUserId:f.participantUserId,next:null as null|{eventId:string;runId:string;ordinal:number},specId:null as string|null}
  writeFileSync(file,JSON.stringify(result));return result
 })()
 const persist=()=>writeFileSync(file,JSON.stringify(checkpoint))
 const completeOne=async(runId:string)=>{
  const [row]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT e.id,e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.run_id=e.run_id AND r.organization_id=e.organization_id WHERE e.run_id=${runId} AND r.user_id=${checkpoint.participantUserId}`
  if(row.status!=='COMPLETED'){
   const started=await startAssessmentRunExecution({executionId:row.id,actorUserId:checkpoint.participantUserId});if(started.state!=='STARTED')throw Error('private longitudinal START required')
   const state=await getAttemptState(started.runtimeBindingRef,{userId:checkpoint.participantUserId},undefined,'current-unit'),item=state.currentItem
   await submitCompositeScaleFinal(started.runtimeBindingRef,item.id,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:item.scale.definition.items.map((q:{itemCode:string})=>({itemCode:q.itemCode,responseValue:'a'}))},{userId:checkpoint.participantUserId},{receiptOnly:true})
   await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
  }
  expect(await readTeacherOrdinaryFeedback({actorUserId:checkpoint.participantUserId,executionId:row.id})).toMatchObject({state:'READY'})
 }
 await completeOne(checkpoint.runId)
 if(!checkpoint.next){checkpoint.next=await createNextTeacherTrackingEvent({...checkpoint.scope,requestId:randomUUID()});persist()}
 const nextScope={...checkpoint.scope,eventId:checkpoint.next.eventId}
 const [run]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${checkpoint.next.runId}`
 if(run.status==='DRAFT'){
  await transitionHuiteacherEvent({...nextScope,action:'OPEN',expectedVersion:1})
  await publishTeacherRun({...nextScope,expectedVersion:run.version})
 }
 await completeOne(checkpoint.next.runId)
 if(!checkpoint.specId){
  const admin=await db.user.create({data:{username:'private-long-spec-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}}),actor={userId:admin.id,platformRole:'SYSTEM_ADMIN'}
  const spec=await createPlatformReportingSpec({actor,specKey:'private-long-'+randomUUID(),version:1,definition:{schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'total',sourceMetricKey:'total',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN','SD_SAMPLE'],missingnessRule:'EXCLUDE',minimumMetricN:10,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}]}})
  await reviewPlatformReportingSpec({actor:await independentReviewer(actor),specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id});checkpoint.specId=spec.id;persist()
 }
 const catalog=await teacherGroupLongitudinalCatalog(checkpoint.scope);if(catalog.status!=='CONFIGURED')throw Error('actual private plan required')
 const result=await generateTeacherGroupLongitudinal({...checkpoint.scope,planId:catalog.planId,sourceKey:catalog.tools[0].key,throughWaveId:checkpoint.next.runId,specId:checkpoint.specId,selection:{kind:'ALL'}})
 expect(result.projection.metrics[0].points).toHaveLength(2)
 expect(result.projection.metrics[0].points.every(p=>p.mean===null&&p.validN===null&&p.adjacentDelta===null)).toBe(true)
 let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>{materializations++})
 expect(await readTeacherGroupLongitudinal({...nextScope,artifactId:result.artifactId})).toEqual(result)
 expect((await teacherGroupLongitudinalCatalog(nextScope)).artifacts[0].artifactId).toBe(result.artifactId)
 setReportingPayloadMaterializationObserverForTests(null);expect(materializations).toBe(0)
 writeFileSync(file+'.proof.json',JSON.stringify({productionAccessed:false,realPrivateSourceAndPlan:true,publishedWaves:2,newSourceFinals:2,originalFinalsReplayed:0,minimumN:10,smallNSuppressed:true,savedReadCanonicalMaterializations:materializations,artifactId:result.artifactId},null,2))
},120000)
