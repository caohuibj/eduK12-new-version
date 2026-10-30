import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_COGNITIVE_GENERAL==='1'?describe:describe.skip
suite('Training GENERAL exact profile anonymous FINAL and frozen report after ordinary revoke',()=>{
 let db:any,server:Server|undefined,base='',sign:any,teacher:any,manager:any,other:any,assignment:any,config:any,row:any,attempt:any,state:any,session:any,recovery='',token='',grant:any,stage='init'
 const requests:any[]=[],observations:any[]=[],ids:any={}
 async function call(actor:any,method:string,path:string,body?:unknown,status=200,credential?:string){
  const jwt=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   ...(jwt?{Cookie:'ptool_session='+jwt+'; ptool_csrf=profile-general','X-CSRF-Token':'profile-general'}:{}),...(credential?{'X-Recovery-Token':credential}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await res.json() as any;requests.push({method,path:path.replace(/\/public\/composite-assessments\/[^/]+\/start$/,'/public/composite-assessments/:token/start'),status:res.status,expectedStatus:status})
  expect(res.status,value.message??'HTTP error').toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Actual runtime fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.contentCapabilityGrant.count()).toBe(4)
  if(await db.compositeAssessment.findFirst({where:{name:'Synthetic cognitive precise GENERAL fixed admission'}}))throw Error('Read retained fixed GENERAL outcome before retry')
  if(!process.env.PRECISE_TRAINING_COGNITIVE_GENERAL_CHECKPOINT)throw Error('Private credential checkpoint required before anonymous writes')
  teacher=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-teacher-'}}});manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-manager-'}}})
  other=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-outsider-'}}});config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',status:'PUBLISHED'}})
  assignment=await db.cognitiveAssignment.findFirstOrThrow({where:{configId:config.id,profile:'research',status:'PUBLISHED',listedStandalone:true}})
  grant=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:assignment.courseSnapshot.selectedCognitiveProfile.selectedBinding.authorizationId}});expect(grant.revokedAt).not.toBeNull()
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default);app.use('/api/public/cognitive',(await import('../../modules/cognitive/cognitive.public.routes')).default)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default);app.use('/api/public/composite-assessments',(await import('../../modules/composite/composite.public.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler);sign=(await import('../../utils/jwt')).generateToken
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port;stage='ready'
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_COGNITIVE_GENERAL_EVIDENCE??'/tmp/training-cognitive-profile-general.json',JSON.stringify({productionAccessed:false,stage,ids,requests,observations,
   scope:'Real anonymous GENERAL parent and native cognitive FINAL. Access/recovery credentials, answers, seeds and report body omitted from evidence.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('preserves the exact scientific/report source through anonymous admission, revoke, FINAL and historical read',async()=>{
  // Previous invocation exposed the admission defect; keep those two attempts.
  // Its random recovery secret was intentionally absent from public evidence and
  // cannot be reconstructed. Start a normal new use revision/assignment instead
  // of resetting rows or forging a credential for the old participant.
  const approval=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'COGNITIVE_PROFILE_APPROVED',metadata:{path:['configuration','profile'],equals:'research'},AND:{metadata:{path:['artifactFormatVersion'],equals:2}}}})
  const issue=await call(manager,'POST','/cognitive/profile-configurations/training/'+config.id+'/research/use-grants',{
   requestId:randomUUID(),userId:teacher.id,artifactHash:approval.metadata.artifactHash,configurationName:'Synthetic GENERAL fixed profile admission',
   validFrom:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()})
  ids.newUse=issue.id;grant={id:issue.id};stage='new-use'
  const fresh=await call(teacher,'POST','/cognitive/assignments',{courseId:assignment.courseId,configId:config.id,title:'Synthetic GENERAL fixed profile source'})
  assignment=await call(teacher,'POST','/cognitive/assignments/'+fresh.id+'/publish');ids.newAssignment=fresh.id
  const expiresAt=new Date(Date.now()+3600000).toISOString()
  row=await call(teacher,'POST','/questionnaire-products',{requestId:randomUUID(),name:'Synthetic cognitive precise GENERAL fixed admission',questionnaireType:'GENERAL',publicEnabled:true,expiresAt});ids.questionnaire=row.id;stage='created'
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/items',{revision:row.revision,item:{type:'COGNITIVE',cognitiveAssignmentId:assignment.id}});stage='added'
  row=await call(teacher,'POST','/questionnaire-products/'+row.id+'/publish',{revision:row.revision});stage='published'
  const link=await call(teacher,'POST','/composite-assessments/'+row.id+'/public-tokens',{expiresAt,maxUses:3});token=link.token
  const started=await call(null,'POST','/public/composite-assessments/'+token+'/start',{});attempt=started.attempt;recovery=started.recoveryToken;ids.attempt=attempt.id;stage='admitted'
  await writeFile(process.env.PRECISE_TRAINING_COGNITIVE_GENERAL_CHECKPOINT!,JSON.stringify({token,recovery,attemptId:attempt.id,questionnaireId:row.id}),{mode:0o600})
  const path='/public/composite-assessments/attempts/'+attempt.id
  state=await call(null,'GET',path,undefined,200,recovery);expect(state.currentItem.type).toBe('COGNITIVE')
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'COGNITIVE'}})
  const stored=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:attempt.id,compositeItemId:item.id}});ids.session=stored.id
  session=await call(null,'GET','/public/cognitive/sessions/'+stored.id,undefined,200,recovery);expect(session.profile).toBe('research');expect(session.config.totalTrials).toBe(60)
  const original=(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).trainingContentBinding
  await call(manager,'POST','/cognitive/profile-configurations/training/'+config.id+'/use-grants/'+grant.id+'/revoke',{requestId:randomUUID(),expectedVersion:1,reason:'Synthetic revoke after anonymous precise admission'});stage='revoked'
  await call(null,'POST','/public/composite-assessments/'+token+'/start',{},403)
  const resume=await call(null,'POST','/public/composite-assessments/'+token+'/start',{recoveryToken:recovery});expect(resume.attempt.id).toBe(attempt.id)
  expect((await call(null,'GET','/public/cognitive/sessions/'+stored.id,undefined,200,recovery)).randomSeed).toBe(session.randomSeed)
  const {createTrialEnvelope}=await import('../../modules/cognitive/v2/trial-envelope')
  const trials=Array.from({length:60},(_,i)=>createTrialEnvelope({trialIndex:i,phase:'test',payload:{foreperiodMs:800,rtMs:300+i,prematureCount:0,interrupted:false,inputMode:'pointer'},startedAtPerfMs:i*3000,endedAtPerfMs:i*3000+1200}))
  const input={recoveryToken:recovery,submissionId:'precise-profile-'+randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,trials}
  const receipt=await call(null,'POST','/public/cognitive/sessions/'+stored.id+'/submit',input);stage='final'
  expect(receipt.replayed).toBe(false);expect((await call(null,'POST','/public/cognitive/sessions/'+stored.id+'/submit',input)).replayed).toBe(true)
  expect((await call(null,'GET',path,undefined,200,recovery)).status).toBe('COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}});expect(parent.trainingContentBinding).toEqual(original)
  const reportPath='/composite-assessments/'+row.id+'/attempts/'+attempt.id+'/report',report=await call(teacher,'GET',reportPath)
  expect(await call(teacher,'GET',reportPath)).toEqual(report);await call(other,'GET',reportPath,undefined,403)
  const read=await call(null,'GET','/public/cognitive/sessions/'+stored.id,undefined,200,recovery)
  expect(read.status).toBe('COMPLETED');expect(read.result.report.method.profile).toBe('research')
  const immutable=(await import('../../modules/assessment-authorization/cognitive-profile-artifact'))
  const artifact=await immutable.loadCognitiveProfileArtifact(assignment.courseSnapshot.selectedCognitiveProfile.artifactHash,undefined)
  expect(read.result.report.method.configVersion).toBe(artifact.identity.configVersion)
  observations.push({ordinaryRevokeStopsNewAnonymousStart:true,admittedRecoverySeedRetained:true,exactResearch60TrialsFinal:true,idempotentFinal:true,parentCompleted:true,
   historicalReportReadableAfterRevoke:true,reportProfileFixed:'research',otherTeacherCannotReadReport:true,originalT3BindingUnchanged:true});stage='complete'
 },30000)
})
