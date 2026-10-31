import {randomUUID as uuid} from 'node:crypto'
import express from 'express'
import {afterAll,describe,it,expect,vi} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import * as surveyBuilder from '../../modules/survey/builder.service'
import * as waves from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import {joinLinkedStudy,startLinkedWave} from '../../modules/survey/admission.service'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {surveyAnalyticsRouter} from '../../modules/survey/analytics.routes'
import * as builder from '../../modules/questionnaire-product/service'
import {startUserAttempt,getAttemptState} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {trainingAnalysisController} from '../../controllers/trainingAnalysisController'
import {authenticate,requireTeacher} from '../../middleware/auth'
import {generateToken} from '../../utils/jwt'
import {SURVEY_AUTH_COOKIE_NAME} from '../../utils/authCookies'
import * as security from '../../modules/assessment-runtime/security'
import {runtimeMetricLines} from '../../services/runtimeObservability'

const url=integrationDatabaseUrl('GROUP_LONGITUDINAL_DATABASE_URL'),suite=url?describe:describe.skip
const evidence:Record<string,unknown>={}
let retainedSurveyProjectId:string|undefined
afterAll(async()=>{if(!url)return;await(await import('../../config/queue')).closeQueues(true);await prisma.$disconnect();if(url&&process.env.GROUP_LONGITUDINAL_EVIDENCE_PATH)await(await import('node:fs/promises')).writeFile(process.env.GROUP_LONGITUDINAL_EVIDENCE_PATH,JSON.stringify(evidence,null,2))})
const user=(role:'TEACHER'|'STUDENT',domain:'TRAINING'|'SURVEY')=>prisma.user.create({data:{username:'group-long-'+uuid(),passwordHash:'synthetic-only',role,accountDomain:domain,teacherApproved:role==='TEACHER'}})
const token=(who:any)=>generateToken({userId:who.id,username:who.username,role:who.role,accountDomain:who.accountDomain,tokenVersion:who.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
async function listening(app:express.Express){const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));return{server,origin:`http://127.0.0.1:${(server.address() as {port:number}).port}`}}
const sqlCount=()=>Number(runtimeMetricLines().find(l=>l.startsWith('ptool_prisma_sql_events_total '))?.split(' ')[1])
const flags={publication:process.env.SURVEY_PUBLICATION_ENABLED,analytics:process.env.SURVEY_ANALYTICS_ENABLED,workspace:process.env.SURVEY_WORKSPACE_ENABLED}
suite('published plan group longitudinal generation and immutable read, real HTTP/PG',()=>{
 it('Survey reuses frozen leaf facts, stores separate versions, and enforces current manager/inclusion scope',async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.SURVEY_ANALYTICS_ENABLED='true';process.env.SURVEY_WORKSPACE_ENABLED='true'
  const owner=await user('STUDENT','SURVEY'),stranger=await user('STUDENT','SURVEY')
  for(const person of [owner,stranger]){
   const login='long'+uuid().replace(/-/g,'').slice(0,20);await prisma.surveyAccount.create({data:{userId:person.id,loginName:login,normalizedLogin:login}})
   await prisma.surveyResearcherGrant.create({data:{userId:person.id,status:'ACTIVE',grantedBy:owner.id}})
   await prisma.surveyMfaCredential.create({data:{userId:person.id,enabled:true,secretCipher:'synthetic-only'}})
  }
  const projectId=uuid(),draftId=uuid();retainedSurveyProjectId=projectId;await prisma.surveyProject.create({data:{id:projectId,ownerUserId:owner.id,title:'群体纵向合成研究',collectionMode:'LINKED_WAVES'}})
  await surveyBuilder.createDraft(owner.id,projectId,{requestId:draftId,kind:'SCALE',instrumentKey:'leaf-a',title:'合成 A'})
  await surveyBuilder.updateDraft(owner.id,projectId,draftId,{revision:0,title:'合成 A',definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'zero',label:'0',score:0},{optionKey:'one',label:'1',score:1}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'合成题',required:true,reverse:false,dimensionKeys:['total']}]}})
  await publishSurveyMeasurementDraft(owner.id,projectId,draftId,1)
  const consent='这是隔离合成研究，使用稳定研究编号关联不同轮次，仅用于群体纵向报告功能验证，自愿参加并可以随时退出。'
  const t1=await waves.createWave(owner.id,projectId,{requestId:uuid(),title:'T1',consentText:consent,instrumentIds:[draftId],linkageNoticeConfirmed:true})
  await prepareWave(owner.id,projectId,t1.id,0,undefined,undefined,{mode:'LONGITUDINAL',metrics:[{instrumentId:draftId,scoreKey:'total'}]})
  const first=await openWave(owner.id,projectId,t1.id,(await waves.getWave(owner.id,projectId,t1.id)).revision)
  const people=[]
  for(let i=0;i<3;i++)people.push(await joinLinkedStudy({publicId:first.publicId,waveId:t1.id,entryToken:first.entrySecret,consent:true,consentVersion:1}))
  for(const i of [0,1])await submitResearchFinal({publicId:first.publicId,attemptId:people[i].attemptId,researchCode:people[i].researchCode,accessCredential:people[i].accessCredential,submissionId:uuid(),answers:{'leaf-a':{item:i?'one':'zero'}}})
  const t2=await waves.createNextWave(owner.id,projectId,t1.id,uuid())
  await waves.updateWave(owner.id,projectId,t2.id,{revision:0,title:'T2',consentText:consent,instrumentIds:[draftId],linkageNoticeConfirmed:true})
  await prepareWave(owner.id,projectId,t2.id,1)
  await openWave(owner.id,projectId,t2.id,(await waves.getWave(owner.id,projectId,t2.id)).revision)
  for(const i of [0,2]){const p=people[i],a=await startLinkedWave({publicId:first.publicId,waveId:t2.id,researchCode:p.researchCode,accessCredential:p.accessCredential,consent:true,consentVersion:1});await submitResearchFinal({publicId:first.publicId,attemptId:a.attemptId,researchCode:p.researchCode,accessCredential:p.accessCredential,submissionId:uuid(),answers:{'leaf-a':{item:'one'}}})}
  const app=express();app.use(express.json());app.use('/api/survey/projects',surveyAnalyticsRouter)
  const {server,origin}=await listening(app),path=`/api/survey/projects/${projectId}/analytics/waves/${t1.id}/group-longitudinal`
  async function call(suffix='',method='GET',body?:unknown,who:any=owner){const r=await fetch(origin+path+suffix,{method,headers:{cookie:who?`${SURVEY_AUTH_COOKIE_NAME}=${token(who)}`:'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json() as any}}
  try{
   const catalog=await call();expect(catalog.status,catalog.message).toBe(200);expect(catalog.data.waves).toHaveLength(2)
   const selection={planId:catalog.data.planId,sourceKey:'leaf-a',throughWaveId:t2.id}
   const startCount=sqlCount(),generated=await call('','POST',selection),middle=sqlCount()
   expect(generated.status,generated.message).toBe(200)
   expect(generated.data.projection.metrics[0].points.map((p:any)=>[p.completedN,p.mean,p.validN])).toEqual([[2,.5,2],[2,1,2]])
   expect(generated.data.projection.metrics[0].points[1]).toMatchObject({adjacentDelta:.5,baselineDelta:.5,populationChanged:true})
   const decrypt=vi.spyOn(security,'decryptUnifiedRuntimePayload');const read=await call('/'+generated.data.artifactId),end=sqlCount();expect(read.status,read.message).toBe(200);expect(read.data).toEqual(generated.data);expect(decrypt).toHaveBeenCalledTimes(1);decrypt.mockRestore()
   evidence.survey={generationSqlEvents:middle-startCount,readSqlEvents:end-middle,readFinalDecryptions:0,projectId,waveId:t1.id,artifactId:generated.data.artifactId}
   const next=await call('','POST',selection);expect(next.status,next.message).toBe(200);expect(next.data.artifactId).not.toBe(generated.data.artifactId);expect((await call('/'+generated.data.artifactId)).data).toEqual(generated.data)
   const single=await fetch(origin+path.replace('group-longitudinal','group-reports'),{headers:{cookie:`${SURVEY_AUTH_COOKIE_NAME}=${token(owner)}`}});expect((await single.json() as any).data.artifacts).toEqual([])
   expect((await call('/'+generated.data.artifactId,'GET',undefined,stranger)).status).toBe(404);expect((await call('/'+generated.data.artifactId,'GET',undefined,null)).status).toBe(401)
   if(process.env.GROUP_LONGITUDINAL_BROWSER==='true'){
    const {build}=await import('esbuild'),{resolve}=await import('node:path'),{mkdir,writeFile}=await import('node:fs/promises'),{chromium}=await import('playwright-core')
    const directory=process.env.GROUP_LONGITUDINAL_ARTIFACT_DIR??'/tmp/eduk12-group-longitudinal';await mkdir(directory,{recursive:true})
    await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{GroupLongitudinalPanel}from'./src/modules/reporting/GroupLongitudinalPanel';const request=async(path,method='GET',body)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw Error(b.message);return b.data};createRoot(document.getElementById('root')).render(<GroupLongitudinalPanel base={${JSON.stringify(path)}} request={request}/>);`,resolveDir:resolve('../frontend'),loader:'tsx'},bundle:true,jsx:'automatic',outfile:directory+'/panel.js',define:{'process.env.NODE_ENV':'"production"'}})
    app.use('/_group-assets',express.static(directory));app.get('/_group-browser',(_req,res)=>res.send('<html><meta charset="utf-8"><link rel="stylesheet" href="/_group-assets/panel.css"><div id="root"></div><script src="/_group-assets/panel.js"></script></html>'))
    const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
    try{const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:SURVEY_AUTH_COOKIE_NAME,value:token(owner),url:origin}]);const page=await context.newPage();await page.goto(origin+'/_group-browser');await page.getByRole('button',{name:'打开纵向群体报告',exact:true}).click();await expect.poll(()=>page.getByRole('article',{name:'群体纵向报告',exact:true}).count()).toBe(1);await page.getByRole('button',{name:'生成更新版纵向报告',exact:true}).click();await expect.poll(()=>page.locator('svg').count()).toBeGreaterThan(0);await page.screenshot({path:directory+'/group-longitudinal-1280.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:directory+'/group-longitudinal-390.png',fullPage:true});await writeFile(directory+'/result.json',JSON.stringify({realHttp:true,realPostgres:true,synthetic:true,reportVisible:true,svgChart:true,productionAccessed:false}));await context.close()}finally{await browser.close()}
   }
   await prisma.surveyWaveAttempt.update({where:{id:people[0].attemptId},data:{excludedAt:new Date()}});expect((await call('/'+generated.data.artifactId)).status).toBe(409)
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));process.env.SURVEY_PUBLICATION_ENABLED=flags.publication;process.env.SURVEY_ANALYTICS_ENABLED=flags.analytics;process.env.SURVEY_WORKSPACE_ENABLED=flags.workspace}
 },90000)
 it('excludes a frozen but unopened Survey draft wave from the published plan catalog',async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.SURVEY_WORKSPACE_ENABLED='true'
  const projectId=process.env.GROUP_LONG_SURVEY_RESUME_PROJECT??retainedSurveyProjectId
  if(!projectId)throw new Error('Select the retained synthetic Survey fixture explicitly')
  try{
   const project=await prisma.surveyProject.findUniqueOrThrow({where:{id:projectId}})
   const source=await prisma.surveyWave.findFirstOrThrow({where:{projectId,status:'OPEN'},orderBy:{ordinal:'desc'}})
   const next=await waves.createNextWave(project.ownerUserId,projectId,source.id,uuid())
   await waves.updateWave(project.ownerUserId,projectId,next.id,{revision:0,title:'尚未开放T3',consentText:source.consentText,instrumentIds:source.instrumentIds as string[],linkageNoticeConfirmed:true})
   await prepareWave(project.ownerUserId,projectId,next.id,1)
   expect((await waves.getWave(project.ownerUserId,projectId,next.id)).publicationId).toBeTruthy()
   const {surveyGroupLongitudinalCatalog}=await import('../../modules/survey/group-longitudinal.service')
   const catalog=await surveyGroupLongitudinalCatalog({actorUserId:project.ownerUserId,projectId,waveId:source.id})
   expect(catalog.waves.some(w=>w.id===next.id)).toBe(false)
  }finally{process.env.SURVEY_PUBLICATION_ENABLED=flags.publication;process.env.SURVEY_WORKSPACE_ENABLED=flags.workspace}
 },30000)
 it('Training uses each published wave population, preserves the version and rejects other managers/participants',async()=>{
  requireIsolatedReleaseDatabase(url!)
  let teacher:any,stranger:any,course:any,task:any,t2:any,students:any[]=[]
  const resume=process.env.GROUP_LONG_TRAINING_RESUME_TASK
  if(resume){
   task=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:resume},include:{questionnaireCourses:true}})
   teacher=await prisma.user.findUniqueOrThrow({where:{id:task.createdBy}});stranger=await user('TEACHER','TRAINING')
   course=await prisma.course.findUniqueOrThrow({where:{id:task.questionnaireCourses[0].courseId}})
   t2=await prisma.compositeAssessment.findFirstOrThrow({where:{personalTrackingBaselineId:task.id,personalTrackingOrdinal:2}})
   const members=await prisma.courseStudent.findMany({where:{courseId:course.id},include:{student:true}});students=members.map(m=>m.student)
   const parents=await prisma.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:{in:[task.id,t2.id]}}})
   for(const parent of parents)expect((await getAttemptState(parent.id,{userId:parent.userId!}) as any).status).toBe('COMPLETED')
  }else{
  teacher=await user('TEACHER','TRAINING');stranger=await user('TEACHER','TRAINING');const actor={userId:teacher.id,role:'TEACHER' as const}
  course=await prisma.course.create({data:{title:'群体纵向合成课程',courseCode:uuid(),creatorId:teacher.id,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  task=await builder.create(actor,{requestId:uuid(),name:'T1',questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false})
  task=await builder.addItem(actor,task.id,{revision:task.revision,item:{type:'FORM',formType:'number',formLabel:'小时',required:false,formDefinition:{type:'NUMBER',prompt:'小时',required:false,options:[],rows:[],min:-10,max:20}}})
  task=await builder.publish(actor,task.id,{revision:task.revision,tracking:{mode:'LONGITUDINAL',metrics:[{itemId:task.items[0].id,scoreKey:'value'}]}})
  t2=await builder.copy(actor,task.id,{requestId:uuid()},{trackingNext:true});t2=await builder.publish(actor,t2.id,{revision:t2.revision})
  students=[]
  for(let i=0;i<7;i++){const student=await user('STUDENT','TRAINING');students.push(student);await prisma.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'APPROVED'}})}
  for(const [index,wave]of [task,t2].entries())for(let i=index;i<index+6;i++){
   const attempt=await startUserAttempt(students[i].id,wave.id),state=await getAttemptState(attempt.attempt.id,{userId:students[i].id}) as any,section=state.currentItem
   await submitCompositeFormSectionFinal({attemptId:attempt.attempt.id,sectionId:section.id,userId:students[i].id,submissionId:uuid(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:index?2:0}))});expect((await getAttemptState(attempt.attempt.id,{userId:students[i].id}) as any).status).toBe('COMPLETED')
  }
  }
  const app=express();app.use(express.json());const prefix='/:id/training-group-longitudinal/:taskId';app.get(prefix,authenticate,requireTeacher,trainingAnalysisController.groupLongCatalog);app.post(prefix,authenticate,requireTeacher,trainingAnalysisController.groupLongGenerate);app.get(prefix+'/:artifactId',authenticate,requireTeacher,trainingAnalysisController.groupLongRead)
  const {server,origin}=await listening(app),path=`/${course.id}/training-group-longitudinal/${task.id}`
  async function call(suffix='',method='GET',body?:unknown,who:any=teacher){const r=await fetch(origin+path+suffix,{method,headers:{cookie:who?'ptool_session='+token(who):'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,...await r.json() as any}}
  try{
   const catalog=await call();expect(catalog.status,catalog.message).toBe(200)
   const selection={planId:catalog.data.planId,sourceKey:catalog.data.tools[0].key,throughWaveId:t2.id},before=sqlCount(),first=await call('','POST',selection),middle=sqlCount()
   expect(first.status,first.message).toBe(200);expect(first.data.projection.metrics[0].points.map((p:any)=>[p.mean,p.completedN,p.validN])).toEqual([[0,6,6],[2,6,6]])
   expect(first.data.projection.metrics[0].points[1]).toMatchObject({adjacentDelta:2,baselineDelta:2,populationChanged:true})
   const decrypt=vi.spyOn(security,'decryptUnifiedRuntimePayload');const read=await call('/'+first.data.artifactId),after=sqlCount();expect(read.status,read.message).toBe(200);expect(read.data).toEqual(first.data);expect(decrypt).toHaveBeenCalledTimes(1);decrypt.mockRestore()
   evidence.training={generationSqlEvents:middle-before,readSqlEvents:after-middle,readFinalDecryptions:0,courseId:course.id,taskId:task.id,artifactId:first.data.artifactId}
   const second=await call('','POST',selection);expect(second.status,second.message).toBe(200);expect(second.data.artifactId).not.toBe(first.data.artifactId);expect((await call('/'+first.data.artifactId)).data).toEqual(first.data)
   expect((await call('/'+first.data.artifactId,'GET',undefined,stranger)).status).toBe(404);expect((await call('/'+first.data.artifactId,'GET',undefined,students[0])).status).toBe(403);expect((await call('/'+first.data.artifactId,'GET',undefined,null)).status).toBe(401)
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
 },90000)
})
