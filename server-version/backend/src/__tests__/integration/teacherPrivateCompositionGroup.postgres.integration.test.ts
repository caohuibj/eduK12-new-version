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
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {listTeacherNumericGroups,generateTeacherNumericGroup,readTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
import {readTeacherCompositionLibraryGroupChoices} from '../../modules/education-tools/teacher-composition-group-source'

const url=integrationDatabaseUrl('TEACHER_PRIVATE_GROUP_DATABASE_URL')
if(url)requireIsolatedReleaseDatabase(url)
afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await db.$disconnect()})
it.skipIf(!url)('publishes a new Teacher private GROUP composition, retains own feedback below group N and reads its sufficient-N snapshot',async()=>{
 const file=process.env.TEACHER_PRIVATE_GROUP_CHECKPOINT!
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
  await publishTeacherRun({...scope,eventId:event.id,expectedVersion:2})
  const result={scope:{...scope,eventId:event.id},runId:run.runId,sourceVersionId:fixed.id}
  writeFileSync(file,JSON.stringify(result));return result
 })()
 const checkOwn=async(row:{id:string;userId:string})=>{
  const own=await readTeacherOrdinaryFeedback({actorUserId:row.userId,executionId:row.id})
  writeFileSync(file+'.own.json',JSON.stringify(own,null,2))
  expect(own).toMatchObject({state:'READY',units:[{kind:'SCALE',state:'READY'}]})
 }
 const [completed]=await db.$queryRaw<Array<{id:string;userId:string}>>`SELECT e.id,r.user_id AS "userId" FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.run_id=e.run_id AND r.organization_id=e.organization_id
  WHERE e.run_id=${checkpoint.runId} AND e.status='COMPLETED' ORDER BY e.id LIMIT 1`
 if(completed)await checkOwn(completed)
 const pending=await db.$queryRaw<Array<{id:string;userId:string}>>`SELECT e.id,r.user_id AS "userId" FROM assessment_run_executions e
  JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.run_id=e.run_id AND r.organization_id=e.organization_id
  WHERE e.run_id=${checkpoint.runId} AND e.status<>'COMPLETED' ORDER BY e.id`
 let submittedFinals=0
 for(const [i,row] of pending.entries()){
  const started=await startAssessmentRunExecution({executionId:row.id,actorUserId:row.userId})
  if(started.state!=='STARTED')throw Error('Actual private composition start required')
  const state=await getAttemptState(started.runtimeBindingRef,{userId:row.userId},undefined,'current-unit'),item=state.currentItem
  if(state.status!=='COMPLETED'){
   await submitCompositeScaleFinal(started.runtimeBindingRef,item.id,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash,
    answers:item.scale.definition.items.map((q:{itemCode:string})=>({itemCode:q.itemCode,responseValue:'a'}))},{userId:row.userId},{receiptOnly:true})
   submittedFinals++
  }
  await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
  if(i===0&&!completed)await checkOwn(row)
 }
 const index=await listTeacherNumericGroups(checkpoint.scope,{configure:true}),choice=index.sources[0]
 expect(index.sources).toHaveLength(1);expect(choice.tools).toHaveLength(1)
 const admin=await db.user.create({data:{username:'private-group-spec-'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
 const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN'}
 const spec=await createPlatformReportingSpec({actor,specKey:'private-teacher-group-'+randomUUID(),version:1,definition:{schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'total',sourceMetricKey:'total',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN','SD_SAMPLE'],missingnessRule:'EXCLUDE',minimumMetricN:10,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}]}})
 await reviewPlatformReportingSpec({actor:await independentReviewer(actor),specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
 const result=await generateTeacherNumericGroup({...checkpoint.scope,trackId:choice.trackId,leaf:choice.tools[0].leaf,specId:spec.id,selection:{kind:'ALL'}})
 expect(result.projection.metrics[0]).toMatchObject({key:'total',validN:10,mean:1,sdSample:0})
 let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>{materializations++})
 expect(await readTeacherNumericGroup({...checkpoint.scope,artifactId:result.artifactId})).toEqual(result)
 setReportingPayloadMaterializationObserverForTests(null);expect(materializations).toBe(0)
 expect((await listTeacherNumericGroups(checkpoint.scope)).versions.some(v=>v.artifactId===result.artifactId)).toBe(true)
 writeFileSync(file,JSON.stringify({...checkpoint,artifactId:result.artifactId}))
 if(process.env.TEACHER_PRIVATE_GROUP_PROOF)writeFileSync(process.env.TEACHER_PRIVATE_GROUP_PROOF,JSON.stringify({passed:true,ownFeedbackBelowGroupN:true,completedParents:10,newFinalsThisContinuation:submittedFinals,groupValidN:10,mean:1,sdSample:0,readCanonicalMaterializations:materializations,historyPointer:true,sourceRegistryOrResultMock:false,productionAccessed:false},null,2))
},90_000)

it.skipIf(!url)('reuses the exact approved library GROUP policy through its existing historical identity reader without FINAL work',async()=>{
 const saved=JSON.parse(readFileSync(process.env.TEACHER_PRIVATE_LIBRARY_GROUP_CHECKPOINT!,'utf8'))
 const [row]=await db.$queryRaw<Array<{key:string;version:string;hash:string;entry:any}>>`SELECT resource_key AS key,resource_version AS version,entry_hash AS hash,entry FROM registered_assessment_resources WHERE id=${saved.groupId}`
 expect(row).toBeDefined()
 const origin=row.entry.libraryOrigin,groupPolicy={resourceKey:row.key,resourceVersion:row.version,entryHash:row.hash}
 const choice=(await readTeacherCompositionLibraryGroupChoices(db,[{versionId:origin.entryId,contentHash:origin.approvedSnapshotHash,groupPolicy}],'HISTORY')).get(origin.entryId)!
 expect(choice.groupPolicy).toEqual(groupPolicy)
 expect(choice.minimumRespondents).toBeGreaterThanOrEqual(row.entry.resultDisclosure.minimumRespondents)
 expect(choice.audiences.ORGANIZATION).toEqual(row.entry.resultDisclosure.audiences.ORGANIZATION.metricKeys)
 expect(choice.audiences.TEACHER).toEqual([])
 expect((await readTeacherCompositionLibraryGroupChoices(db,[{versionId:origin.entryId,contentHash:origin.approvedSnapshotHash,groupPolicy:{...groupPolicy,entryHash:'0'.repeat(64)}}],'HISTORY')).size).toBe(0)
 if(process.env.TEACHER_PRIVATE_LIBRARY_GROUP_PROOF)writeFileSync(process.env.TEACHER_PRIVATE_LIBRARY_GROUP_PROOF,JSON.stringify({passed:true,approvedPolicyPointer:groupPolicy,minimumN:choice.minimumRespondents,
  sameExactLibrarySnapshot:true,fullExistingGroupReader:true,wrongPointerRejected:true,newFinals:0,groupReportGenerated:false,productionAccessed:false},null,2))
},30_000)
