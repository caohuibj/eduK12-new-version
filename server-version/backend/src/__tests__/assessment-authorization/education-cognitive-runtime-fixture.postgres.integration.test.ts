import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_RUNTIME_FIXTURE==='1'?describe:describe.skip
suite('Separate education native runtime synthetic identity metadata only',()=>{
 let db:any,state:any;const observations:any[]=[]
 async function checkpoint(){await writeFile(process.env.PRECISE_EDUCATION_RUNTIME_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 beforeAll(async()=>{
  const u=new URL(process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/precise_education_cognitive_runtime_test_20261030'||u.username!=='materials_owner'||process.env.PRECISE_EDUCATION_RUNTIME_FIXTURE_OWNER!=='1')throw Error('Owner allowed solely for explicit new synthetic metadata fixture')
  db=(await import('../../config/database')).prisma;expect(await db.user.count()).toBe(8)
  state=JSON.parse(await readFile('/workspace/materials-load-20261029/education-cognitive-profile-private.json','utf8'));state.runtimeEntries={}
 })
 afterAll(async()=>{await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-native-runtime-fixture.json',JSON.stringify({productionAccessed:false,fixtureDatabaseRole:'materials_owner',scope:'Synthetic identities/organization/workflow fixture only. Existing repository identity initializers and normal registration/workflow services; no duplicate scale source, tool grant, native session or result. Participant/authorization runtime qualification is separate and must use the restricted role.',observations},null,2)+'\n');if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('prepares a normally registered School pupil and a Teacher member without rebuilding any scientific content',async()=>{
  const fixture=await import('../integration/educationLibraryRuntimeFixture')
  for(const product of ['SCHOOL','TEACHER'] as const){
   const seed=await(product==='SCHOOL'?fixture.seedEducationSchoolRuntimeIdentity(db):fixture.seedEducationTeacherRuntimeIdentity(db))
   const e:any={organizationId:seed.organizationId,manager:seed.manager,userId:seed.manager.userId,participantUserId:seed.participantUserId,subjectMembershipId:seed.participantMembershipId,classUnitId:seed.classUnitId};state.runtimeEntries[product]=e;await checkpoint()
   if(product==='SCHOOL'){
    const activity=await(await import('../../modules/campus/activity.service')).createCampusActivity({actor:seed.manager,organizationId:e.organizationId,title:'Synthetic precise native profile',purpose:'STUDENT_WELLBEING'})
    e.workflowId=activity.id;await checkpoint();const scope={actor:seed.manager,organizationId:e.organizationId,courseId:activity.id}
    await(await import('../../modules/campus/activity.allocation')).allocateCampusActivityParticipants({...scope,classUnitIds:[seed.classUnitId!],requestKey:randomUUID(),expectedVersion:1})
    const run=await(await import('../../modules/campus/activity.runs')).createCampusActivityRunDraft({...scope,name:'Synthetic exact native runtime'});e.runId=run.id
   }else{
    const service=await import('../../modules/huiteacher/evaluation.service')
    const target=await service.createHuiteacherTarget({organizationId:e.organizationId,actorUserId:e.userId,kind:'ORGANIZATION',name:'Synthetic exact Teacher native cohort'})
    const event=await service.createHuiteacherEvent({organizationId:e.organizationId,actorUserId:e.userId,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic precise Teacher native profile'})
    e.workflowId=event.id;await checkpoint();const run=await service.createHuiteacherEventRunDraft({organizationId:e.organizationId,actorUserId:e.userId,eventId:event.id,name:'Synthetic exact native runtime'});e.runId=run.runId
   }
   const [run]=await db.$queryRaw`SELECT version,status FROM assessment_runs WHERE id=${e.runId}`;e.runVersion=run.version
   expect(run.status).toBe('DRAFT');await checkpoint();observations.push({product,organizationId:e.organizationId,authorId:e.userId,participantId:e.participantUserId,runId:e.runId,workflowId:e.workflowId,noCognitiveContentRebuilt:true,noUseGrantOrParticipantResultWritten:true})
  }
 },60000)
})
