import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationRuntimeActors} from './educationLibraryRuntimeFixture'
import {createOrganizationUnit} from '../../modules/organization/structure'
import {completeEducationLibraryScaleExecution} from './educationLibraryReportFixture'
import {replaceCampusRoster,setCampusRegistrationWindow,issueCampusActivationCodes,registerCampusStudent,approveCampusClass} from '../../modules/campus/admission.service'
import {createCampusActivity,readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {allocateCampusActivityParticipants} from '../../modules/campus/activity.allocation'
import {createCampusActivityRunDraft} from '../../modules/campus/activity.runs'
import {schoolTrackingOptions,createNextSchoolTrackingActivity} from '../../modules/campus/personal-tracking'
import {publishAssessmentRun} from '../../modules/assessment-run/publish'
import {addPrivateScaleRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {readCampusStudentFeedback} from '../../modules/campus/student-feedback'
import {readSchoolPersonalChanges} from '../../modules/reporting/teacher-personal-changes.service'
import {readRespondentRunSummary} from '../../modules/reporting/respondentSummary'

const url=integrationDatabaseUrl('SCHOOL_GROUP_NATIVE_DATABASE_URL'),suite=url?describe:describe.skip
const file=process.env.SCHOOL_GROUP_NATIVE_CHECKPOINT??'/tmp/school-self-group-native-20261030.json'
let db:PrismaClient
type Actors=Awaited<ReturnType<typeof setupEducationRuntimeActors>>
type State={actors:Actors;students:string[];population?:{classId:string;numbers:string[];rosterVersion?:number;codes?:string[];approved?:boolean};version?:{id:string;contentHash:string};waves:Array<{courseId:string;runId:string;trackId?:string;executions?:Array<{id:string;userId:string}>}>;own?:unknown;changes?:unknown;personalPhaseComplete?:boolean}
const save=(state:State)=>writeFileSync(file,JSON.stringify(state),{mode:0o600})
const short=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,18)

suite('School explicit SELF GROUP source / real native lifecycle',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('publishes and completes two real ten-person waves, keeping authorized own feedback while raw cohort summaries stay hidden',async()=>{
  let state:State
  if(process.env.SCHOOL_GROUP_NATIVE_CONTINUE==='true'&&existsSync(file))state=JSON.parse(readFileSync(file,'utf8'))
  else{
   const actors=await setupEducationRuntimeActors(db,'SCHOOL')
   if(!actors.schoolAdmin||!actors.classUnitId||!actors.studentNumber)throw new Error('Actual School actor fixture required')
   state={actors,students:[],waves:[]};save(state)
  }
  // The actor helper's original one-person class is already approved and must
  // remain frozen. A fresh class gets its complete roster before registration.
  if(!state.population){
   const actors=state.actors
   const [original]=await db.$queryRaw<Array<{parentId:string}>>`SELECT parent_unit_id AS "parentId" FROM organization_units WHERE id=${actors.classUnitId}`
   const cls=await createOrganizationUnit({organizationId:actors.organizationId,unitKind:'CLASS',name:'合成群体纵向十人班',parentUnitId:original.parentId})
   state.population={classId:cls.id,numbers:Array.from({length:10},()=>short('SG'))};state.students=[];save(state)
  }
  if(!state.population.approved){
   const actors=state.actors,population=state.population
   const scope={actor:actors.schoolAdmin!,organizationId:actors.organizationId,classUnitId:population.classId}
   if(!population.rosterVersion){const roster=await replaceCampusRoster({...scope,studentNumbers:population.numbers});population.rosterVersion=roster.rosterVersion;save(state)}
   if(!population.codes){await setCampusRegistrationWindow({...scope,action:'OPEN',closesAt:new Date(Date.now()+30*60_000)});population.codes=(await issueCampusActivationCodes({...scope,count:10,ttlMinutes:25})).codes;save(state)}
   for(let index=state.students.length;index<population.numbers.length;index++){
    const student=await registerCampusStudent({organizationId:actors.organizationId,classUnitId:population.classId,studentNumber:population.numbers[index],
     activationCode:population.codes[index],username:short('sgstudent'),password:'SyntheticPassword123'})
    state.students.push(student.userId);save(state)
   }
   await setCampusRegistrationWindow({...scope,action:'CLOSE'})
   await approveCampusClass({...scope,actor:actors.manager,expectedRosterVersion:population.rosterVersion!})
   actors.classUnitId=population.classId;actors.participantUserId=state.students[0]
   population.approved=true;delete population.codes;save(state)
  }
  const a=state.actors,context={entry:'SCHOOL' as const,organizationId:a.organizationId,principal:{userId:a.manager.userId,accountDomain:'SCHOOL' as const}}
  if(!state.version){
   const definition=compileResearchScale('Synthetic School explicit GROUP',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
    responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
    items:[{itemKey:'q',prompt:'Synthetic self reflection',required:true,reverse:false,dimensionKeys:['total']}]})
   definition.license={...definition.license,status:'self_authored',redistribution:'allowed'}
   definition.report.audienceContract={schemaVersion:1,respondent:'STUDENT_SELF',audience:'student',locale:'zh-CN',longitudinalMetricKeys:['total']}
   definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'reflection',min:0,max:3,includeMax:true,text:'本次合成数值只作描述。'}]}]}
   const draft=await tools.createPrivateTool(context,{kind:'SCALE',title:'Synthetic School explicit GROUP'})
   const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition})
   state.version=await tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash});save(state)
  }
  for(const ordinal of [1,2]){
   let wave=state.waves[ordinal-1]
   if(!wave){
    if(ordinal===1){
     const activity=await createCampusActivity({actor:a.manager,organizationId:a.organizationId,title:'Synthetic same-FINAL own and group',purpose:'STUDENT_WELLBEING'})
     const scope={actor:a.manager,organizationId:a.organizationId,courseId:activity.id}
     await allocateCampusActivityParticipants({...scope,classUnitIds:[a.classUnitId!],requestKey:randomUUID(),expectedVersion:1})
     wave={courseId:activity.id,runId:(await createCampusActivityRunDraft({...scope,name:'Synthetic T1'})).id}
    }else wave=await createNextSchoolTrackingActivity({...state.waves[0],actor:a.manager,organizationId:a.organizationId,requestId:randomUUID()})
    state.waves.push(wave);save(state)
   }
   const scope={actor:a.manager,organizationId:a.organizationId,courseId:wave.courseId,runId:wave.runId}
   let [run]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${wave.runId}`
   if(ordinal===1&&!wave.trackId){
    const fixed=state.version!
    const track=await addPrivateScaleRunTrack({organizationId:a.organizationId,runId:wave.runId,actorUserId:a.manager.userId,parent:{kind:'SCHOOL_ACTIVITY',id:wave.courseId}},{expectedVersion:run.version,
     privateScale:{versionId:fixed.id,contentHash:fixed.contentHash,administration:{population:'STUDENT',responseMode:'SELF'},groupReporting:{schemaVersion:1,minimumRespondents:10,leaves:[{versionId:fixed.id,contentHash:fixed.contentHash,audiences:{PROFESSIONAL:['total'],TEACHER:[],ORGANIZATION:['total']}}]}},
     subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}})
    wave.trackId=track.id;save(state)
   }
   if(run.status==='DRAFT'){
    const options=await schoolTrackingOptions(scope),chosen=options.choices.find(choice=>choice.scoreKey==='total')
    expect(chosen?.visible).toBe(true);if(!chosen)throw new Error('Real tracking metric missing')
    wave.trackId=chosen.trackId;save(state)
    const activity=await readCampusActivity(scope)
    if(activity.status==='DRAFT'){const submitted=await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:activity.version});await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})}
    ;[run]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${wave.runId}`
    const selected={trackId:chosen.trackId,itemId:chosen.itemId,scoreKey:chosen.scoreKey}
    await publishAssessmentRun({organizationId:a.organizationId,runId:wave.runId,actorUserId:a.manager.userId,expectedVersion:run.version,tracking:{mode:'LONGITUDINAL',metrics:[selected],visibleMetrics:[selected]}})
   }
   const executions=await db.$queryRaw<Array<{id:string;userId:string;status:string}>>`SELECT e.id,r.user_id AS "userId",e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${wave.runId} ORDER BY e.id`
   expect(executions).toHaveLength(10);wave.executions=executions.map(({id,userId})=>({id,userId}));save(state)
   for(const execution of executions){
    if(execution.status!=='COMPLETED')await completeEducationLibraryScaleExecution({db,actorUserId:execution.userId,executionId:execution.id,answers:[{itemCode:'q',responseValue:ordinal===1?'a':'b'}]})
   }
   const ownExecution=executions.find(e=>e.userId===a.participantUserId)!
   const own=await readCampusStudentFeedback(a.participantUserId,ownExecution.id)
   expect(own.state).toBe('READY')
   await expect(readRespondentRunSummary(a.participantUserId,ownExecution.id)).rejects.toMatchObject({statusCode:404})
   await expect(readCampusStudentFeedback(state.students.find(id=>id!==a.participantUserId)!,ownExecution.id)).rejects.toMatchObject({statusCode:404})
   const changes=await readSchoolPersonalChanges({actorUserId:a.participantUserId,executionId:ownExecution.id})
   if(ordinal===2){expect(changes.status).toBe('AVAILABLE');if(changes.status==='AVAILABLE')expect(changes.metrics[0].points.map(point=>point.value)).toEqual([1,2])}
   state.own=own;state.changes=changes;save(state)
  }
  state.personalPhaseComplete=true;save(state)
  console.info(JSON.stringify({kind:'school-native-self-group-personal-phase',organizationId:a.organizationId,waves:state.waves.map(wave=>({courseId:wave.courseId,runId:wave.runId,trackId:wave.trackId,completedN:wave.executions?.length})),actualAnswerSaveAndFinal:true,ownAndChangesRead:true,publicRawCohortHidden:true,registryMock:false,groupGenerationProved:false}))
 },240000)
})
