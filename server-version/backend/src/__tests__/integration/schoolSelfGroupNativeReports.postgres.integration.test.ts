import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import type {AuthenticatedPrincipal} from '../../types'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {closeAssessmentRun} from '../../modules/assessment-run/lifecycle'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {listCampusGroupReportTools,readCampusGroupReport} from '../../modules/campus/group-reports'
import {schoolPlanGroupCatalog,generateSchoolPlanGroup,readSchoolPlanGroup} from '../../modules/campus/group-longitudinal-plan.service'
import {readTaskGroupLongitudinalArtifact} from '../../modules/reporting/task-artifact'
import {readReportingArtifactRecord} from '../../modules/reporting/artifact'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
import {readCampusStudentFeedback} from '../../modules/campus/student-feedback'

const url=integrationDatabaseUrl('SCHOOL_GROUP_NATIVE_DATABASE_URL'),suite=url?describe:describe.skip
const file=process.env.SCHOOL_GROUP_NATIVE_CHECKPOINT??'/tmp/school-self-group-native-20261030.json'
const groupFile=file.replace(/\.json$/,'.groups.json')
let db:PrismaClient
type Wave={courseId:string;runId:string;trackId:string;executions:Array<{id:string;userId:string}>}
type NativeState={actors:{organizationId:string;manager:AuthenticatedPrincipal;schoolAdmin:AuthenticatedPrincipal;participantUserId:string};waves:Wave[];own:unknown;personalPhaseComplete:boolean}
type GroupState={specId?:string;delayDenied?:boolean;closed?:boolean;syntheticClosedTimeAged?:boolean;artifactId?:string;previousArtifactId?:string;countHiddenProjectionFixed?:boolean}
const save=(state:GroupState)=>writeFileSync(groupFile,JSON.stringify(state),{mode:0o600})

suite('School same-FINAL GROUP snapshots / native checkpoint continuation',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await db?.$disconnect()})
 it('generates real single-wave and plan snapshots from the two native FINAL waves with current manager/leaf rights',async()=>{
  if(!existsSync(file))throw new Error('Run the native publication/answer/FINAL phase once first')
  const native:NativeState=JSON.parse(readFileSync(file,'utf8'))
  if(!native.personalPhaseComplete||native.waves.length!==2)throw new Error('The real two-wave personal checkpoint is incomplete')
  const a=native.actors,state:GroupState=existsSync(groupFile)?JSON.parse(readFileSync(groupFile,'utf8')):{}
  if(!state.specId){
   const admin=async()=>db.user.create({data:{username:'sgspec_'+randomUUID().replace(/-/g,'').slice(0,20),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
   const author={userId:(await admin()).id,platformRole:'SYSTEM_ADMIN'},reviewer={userId:(await admin()).id,platformRole:'SYSTEM_ADMIN'}
   const spec=await createPlatformReportingSpec({actor:author,specKey:'school-native-'+randomUUID(),version:1,definition:{schemaVersion:1,analysisKind:'GROUP',engineKey:'ORG_GROUP_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',minimumCohortN:10,minimumContributorN:10,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'total',sourceMetricKey:'total',acceptedResultQuality:['interpretable','limited'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:10,observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}]}})
   await reviewPlatformReportingSpec({actor:reviewer,specId:spec.id});await publishPlatformReportingSpec({actor:reviewer,specId:spec.id})
   state.specId=spec.id;save(state)
  }
  const anchor={actor:a.manager,organizationId:a.organizationId,runId:native.waves[1].runId}
  if(!state.delayDenied){
   await expect(listCampusGroupReportTools({...anchor,runId:native.waves[0].runId,trackId:native.waves[0].trackId})).rejects.toMatchObject({code:'CAMPUS_GROUP_SOURCE_WITHHELD'})
   state.delayDenied=true;save(state)
  }
  if(!state.closed){
   for(const wave of native.waves){
    const scope={actor:a.manager,organizationId:a.organizationId,courseId:wave.courseId}
    await closeAssessmentRun({organizationId:a.organizationId,runId:wave.runId,schoolActivity:{actor:a.manager,courseId:wave.courseId}})
    const activity=await readCampusActivity(scope)
    if(activity.status!=='CLOSED')await changeCampusActivityStatus({...scope,action:'CLOSE',expectedVersion:activity.version})
   }
   state.closed=true;save(state)
  }
  if(!state.syntheticClosedTimeAged){
   // Explicit isolated time fixture, after the real CLOSE services above. This
   // proves released-vs-waiting handling, not physically elapsed 24 hours.
   // No source policy, grants, answers, result or FINAL timestamps are edited.
   for(const wave of native.waves){
    await db.$executeRaw`UPDATE assessment_runs SET closed_at=statement_timestamp()-interval '25 hours' WHERE id=${wave.runId} AND organization_id=${a.organizationId} AND status='CLOSED'`
    await db.$executeRaw`UPDATE campus_activities SET closed_at=statement_timestamp()-interval '25 hours' WHERE course_id=${wave.courseId} AND organization_id=${a.organizationId} AND status='CLOSED'`
   }
   state.syntheticClosedTimeAged=true;save(state)
  }
  const catalog=await schoolPlanGroupCatalog(anchor)
  if(catalog.status!=='CONFIGURED'||!catalog.tools.length)throw new Error('Real published tracking plan missing')
  if(!state.countHiddenProjectionFixed){state.previousArtifactId=state.artifactId;delete state.artifactId;state.countHiddenProjectionFixed=true;save(state)}
  if(!state.artifactId){
   const generated=await generateSchoolPlanGroup({...anchor,planId:catalog.planId,sourceKey:catalog.tools[0].key,throughWaveId:anchor.runId,specId:state.specId!,selection:{kind:'ALL'}})
   state.artifactId=generated.artifactId;save(state)
  }
  let canonicalReads=0;setReportingPayloadMaterializationObserverForTests(()=>canonicalReads++)
  const longitudinal=await readSchoolPlanGroup({...anchor,artifactId:state.artifactId})
  expect(longitudinal.projection.populationMode).toBe('INDEPENDENT_WAVES')
  expect(longitudinal.projection.metrics[0].points.map(point=>({mean:point.mean,n:point.validN,missing:point.missingN}))).toEqual([{mean:1,n:null,missing:null},{mean:2,n:null,missing:null}])
  expect(longitudinal.projection.metrics[0].points[1].baselineDelta).toBe(1)
  expect(JSON.stringify(longitudinal.projection)).not.toContain(a.participantUserId)
  const stored=await db.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,{product:'SCHOOL',containerId:a.organizationId,taskId:native.waves[0].runId},catalog.planId,state.artifactId!))
  const bindings=stored!.sourceBindings as {waves:Array<{artifactId:string;snapshotHash:string}>}
  expect(bindings.waves).toHaveLength(2)
  for(const [index,ref]of bindings.waves.entries()){
   const single=await readCampusGroupReport({actor:a.manager,organizationId:a.organizationId,artifactId:ref.artifactId})
   expect(single).toHaveProperty('projection.metrics.0.mean',index+1)
   expect((await readReportingArtifactRecord(ref.artifactId)).snapshotHash).toBe(ref.snapshotHash)
  }
  expect(canonicalReads).toBe(0);setReportingPayloadMaterializationObserverForTests(null)
  if(state.previousArtifactId){const old=await readSchoolPlanGroup({...anchor,artifactId:state.previousArtifactId});expect(old.projection.metrics[0].points.map(point=>point.mean)).toEqual([null,null])}
  const ownExecution=native.waves[1].executions.find(e=>e.userId===a.participantUserId)!
  const ownJson=JSON.parse(JSON.stringify(await readCampusStudentFeedback(a.participantUserId,ownExecution.id)))
  expect(canonicalHash(ownJson)).toBe(canonicalHash(native.own))
  const user=await db.user.findUniqueOrThrow({where:{id:a.participantUserId}})
  const student={...a.manager,userId:user.id,username:user.username,role:user.role}
  await expect(readSchoolPlanGroup({...anchor,actor:student,artifactId:state.artifactId})).rejects.toMatchObject({statusCode:404})
  console.info(JSON.stringify({kind:'school-native-group-phase',organizationId:a.organizationId,artifactId:state.artifactId,oldArtifactRetained:state.previousArtifactId??null,singleArtifacts:bindings.waves.map(ref=>ref.artifactId),actualExistingFinals:true,sourceRegistryMock:false,realSpecReview:true,ownReportUnchanged:true,storedReadCanonicalMaterializations:canonicalReads,privacyHiddenCountsRetained:true,preReleaseDenied:true,closedAtTimeOnlyFixture:true,physicallyElapsed24Hours:false}))
 },180000)
})
