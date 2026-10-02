import situationalRoutes from '../../routes/situational'
import * as situationRegistry from '../../modules/situational/situation-package.registry'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import bcrypt from 'bcryptjs'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {config} from '../../config'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl} from './integration-env'
import {miniHttpClient,nativeRequire,assertMiniTestDatabase} from './mini-http-client'
import {scaleDefinitionFor} from './mini-scale-definition'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import authRoutes from '../../routes/auth'
import capabilitiesRoutes from '../../routes/capabilities'
import scalesRouter from '../../routes/scales'
import questionnaireRoutes from '../../routes/questionnaires'
import compositeRoutes from '../../modules/composite/composite.routes'
import {assessmentRuntimeRouter} from '../../modules/mobile/assessment.routes'
import {csrfProtection} from '../../middleware/csrf'
const {createAssessmentService}=nativeRequire('../../../../miniprogram-v2/domains/assessments/service.js')
const {reportTargetForAttempt}=nativeRequire('../../../../miniprogram-v2/domains/assessments/reports.js')
const {path:webPath}=nativeRequire('../../../../miniprogram-v2/domains/assessments/web-runtime.js')
const {createReportService}=nativeRequire('../../../../miniprogram-v2/domains/assessments/reports.js')
const url=integrationDatabaseUrl('MINI_RUNTIME_TEST_DB_URL','PARENT_PORTAL_TEST_DB_URL','RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let server:Server,baseUrl:string,previousFlag:boolean,passwordHash:string
const password='Synthetic-runtime-test-2026'
function client(){const c=miniHttpClient(baseUrl);c.runtime.assessments=createAssessmentService(c.runtime.api,c.runtime.session,c.runtime.drafts,c.runtime.config);c.runtime.reports=createReportService(c.runtime.api,c.runtime.session);return c}
async function account(){return prisma.user.create({data:{username:'mini-runtime-'+randomUUID(),passwordHash,role:'STUDENT'}})}
suite('PR3 Mini FINAL runtime against canonical HTTP and real PostgreSQL',()=>{
 beforeAll(async()=>{assertMiniTestDatabase(url!);previousFlag=config.miniAssessmentEnabled;config.miniAssessmentEnabled=true;passwordHash=await bcrypt.hash(password,4);const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/auth',authRoutes);app.use('/api/capabilities',capabilitiesRoutes);app.use('/api/situational',situationalRoutes);app.use('/api/scales',scalesRouter);app.use('/api/questionnaires',questionnaireRoutes);app.use('/api/composite-assessments',compositeRoutes);app.use('/api/mobile/assessment-runtime',assessmentRuntimeRouter);app.use((e:any,_q:any,r:any,_n:any)=>{console.error(e);r.status(500).json({data:null,message:'fixture failure'})});server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw new Error('listener missing');baseUrl='http://127.0.0.1:'+address.port},90000)
 afterAll(async()=>{config.miniAssessmentEnabled=previousFlag;if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}await prisma.$disconnect()})
 it('starts through canonical admission, reads frozen Scale despite source edits, persists one FINAL receipt and rejects foreign/embedded/legacy reads',async()=>{
  const u=await account(),stranger=await account(),c=client(),other=client();await c.runtime.session.login({username:u.username,password});await other.runtime.session.login({username:stranger.username,password})
  const definition=scaleDefinitionFor(2,'NATIVE'),scale=await prisma.scale.create({data:{code:'MINI-'+randomUUID(),name:'HTTP scale',creatorId:u.id,status:'PUBLISHED',visibility:'PUBLIC',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:definition as any,definitionHash:hashScaleDefinition(definition),itemCount:2,dimensionCount:1}})
  const target={family:'SCALE',resourceId:scale.id},handle=await c.runtime.assessments.begin(target),unit=await c.runtime.assessments.resume(handle)
  expect(unit.meta.definitionHash).toBe(hashScaleDefinition(definition));expect(unit.items).toHaveLength(2)
  const changed=structuredClone(definition);changed.items[0].content='New mutable text';await prisma.scale.update({where:{id:scale.id},data:{definition:changed as any,definitionHash:hashScaleDefinition(changed)}})
  const frozen=await c.runtime.assessments.resume(handle);expect(frozen.items[0].label).not.toBe('New mutable text');expect(frozen.meta.definitionHash).toBe(unit.meta.definitionHash)
  await expect(other.runtime.api.get('/mobile/assessment-runtime/scales/'+handle.rootId)).rejects.toMatchObject({status:404})
  config.miniAssessmentEnabled=false;await expect(c.runtime.api.get('/mobile/assessment-runtime/scales/'+handle.rootId)).rejects.toMatchObject({status:404});config.miniAssessmentEnabled=true
  for(const item of frozen.items)await c.runtime.assessments.change(frozen,item.key,'1')
  const original=c.platform.request;let drop=true;c.platform.request=(o:any)=>original({...o,success:(response:any)=>{if(drop&&o.url.endsWith('/submit')&&response.statusCode===200){drop=false;o.fail({errMsg:'synthetic lost receipt'})}else o.success(response)}});await expect(c.runtime.assessments.submit(frozen)).rejects.toMatchObject({kind:'network'});c.platform.request=original;const pending=await c.runtime.assessments.resume(handle);expect(pending.recovery).toBe(true);await Promise.all([c.runtime.assessments.submit(pending),c.runtime.assessments.submit(pending)])
  const final=c.calls.find((call:any)=>call.url.endsWith('/'+handle.rootId+'/submit'));expect(final).toBeTruthy();expect(final.header['X-CSRF-Token']).toBeTruthy();expect(final.header.Authorization).toBeUndefined()
  const replay=await c.runtime.api.post('/scales/assessments/'+handle.rootId+'/submit',final.data);expect(replay.replayed).toBe(true)
  const row=await prisma.assessment.findUniqueOrThrow({where:{id:handle.rootId}});expect(row.status).toBe('COMPLETED');expect(row.submissionId).toBe(final.data.submissionId)
  expect((await c.runtime.assessments.resume(handle)).state).toBe('submitted');expect(await c.runtime.reports.read('SCALE',handle.rootId)).toHaveProperty('blocks')
  const newHandle=await c.runtime.assessments.begin(target),unfinished=await c.runtime.assessments.resume(newHandle),restarted=await c.runtime.assessments.restart(unfinished);expect(restarted.handle.rootId).not.toBe(newHandle.rootId);expect((await c.runtime.assessments.resume(restarted.handle)).rootStatus).toBe('IN_PROGRESS')
  const q=await prisma.questionnaire.create({data:{code:'MINI-embed-'+randomUUID(),name:'Embedded fixture',creatorId:u.id}})
  await prisma.assessment.update({where:{id:handle.rootId},data:{questionnaireAssessmentId:(await prisma.questionnaireAssessment.create({data:{questionnaireId:q.id,userId:u.id}})).id}})
  await expect(c.runtime.api.get('/mobile/assessment-runtime/scales/'+handle.rootId)).rejects.toMatchObject({status:404})
  await prisma.assessment.update({where:{id:handle.rootId},data:{questionnaireAssessmentId:null,deliveryMode:'LEGACY'}});await expect(c.runtime.api.get('/mobile/assessment-runtime/scales/'+handle.rootId)).rejects.toMatchObject({status:409})
  await c.runtime.session.logout();await other.runtime.session.logout()
 },90000)
 it('native text SJT V1 submits exact frozen scene/channel values through canonical HTTP',async()=>{
  const published={...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,releaseStatus:'PUBLISHED' as const}
  const list=vi.spyOn(situationRegistry,'listSituationPackages').mockReturnValue([published]),exact=vi.spyOn(situationRegistry,'getSituationPackage').mockReturnValue(published)
  try{
   const u=await account(),c=client();await c.runtime.session.login({username:u.username,password})
   const target={family:'SITUATIONAL',resourceId:published.key,version:published.instrumentVersion},handle=await c.runtime.assessments.begin(target),unit=await c.runtime.assessments.resume(handle)
   expect(unit.unitKind).toBe('SITUATIONAL');expect(unit.items).toHaveLength(2)
   for(const item of unit.items)await c.runtime.assessments.change(unit,item.key,'0')
   await c.runtime.assessments.submit(unit);const sent=c.calls.find((call:any)=>call.url.endsWith('/'+handle.rootId+'/submit'))
   expect(sent.data.responses).toEqual(unit.items.map((item:any)=>({sceneKey:item.sceneKey,channelKey:item.channelKey,responseValue:item.options[0].value})))
   expect(sent.data.definitionHash).toBe(unit.meta.definitionHash);expect(sent.data.compiledRuntimeHash).toBe(unit.server.attempt.compiledRuntimeHash);expect(sent.data.scoringVersion).toBe(unit.server.attempt.scoringVersion)
   const complete=await c.runtime.assessments.resume(handle);expect(complete.rootStatus).toBe('COMPLETED');expect((await prisma.situationalAttempt.findUniqueOrThrow({where:{id:handle.rootId}})).submissionId).toBe(sent.data.submissionId)
   await expect(c.runtime.reports.read('SITUATIONAL',handle.rootId)).rejects.toMatchObject({kind:'unsupportedRenderer'});expect(webPath(reportTargetForAttempt('SITUATIONAL',handle.rootId))).toBe('/student/situational/attempts/'+handle.rootId+'/result');await c.runtime.session.logout()
  }finally{list.mockRestore();exact.mockRestore()}
 },90000)
 it.each(['QUESTIONNAIRE','COMPOSITE'])('%s delivers exact form section identities and advances via canonical FINAL contracts',async family=>{
  const u=await account(),c=client();await c.runtime.session.login({username:u.username,password});const course=await prisma.course.create({data:{creatorId:u.id,title:'Runtime test course',courseCode:randomUUID().slice(0,12)}});await prisma.courseStudent.create({data:{courseId:course.id,studentId:u.id,status:'ACTIVE'}});let resource:any
  if(family==='QUESTIONNAIRE'){
   resource=await prisma.questionnaire.create({data:{code:'MINI-questionnaire-'+randomUUID(),name:'HTTP questionnaire',creatorId:u.id,type:'COURSE',status:'PUBLISHED',visibility:'PUBLIC'}})
   await prisma.courseQuestionnaire.create({data:{courseId:course.id,questionnaireId:resource.id}})
   for(let i=0;i<2;i++){const section=await prisma.questionnaireFormSection.create({data:{questionnaireId:resource.id,title:'区段 '+i,position:i}});await prisma.questionnaireFormItem.create({data:{questionnaireId:resource.id,sectionId:section.id,sectionPosition:0,type:'text_input',label:'字段 '+i,required:true,position:i}})}
  }else{
   resource=await prisma.compositeAssessment.create({data:{code:'MINI-composite-'+randomUUID(),name:'HTTP composite',createdBy:u.id,courseId:course.id,status:'PUBLISHED',publicEnabled:true,maxAttempts:3}})
   for(let i=0;i<2;i++){const section=await prisma.compositeFormSection.create({data:{compositeAssessmentId:resource.id,title:'区段 '+i,position:i}});await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:resource.id,type:'FORM',position:i,formType:'text_input',formLabel:'字段 '+i,required:true,formSectionId:section.id,formSectionPosition:0}})}
  }
  const target={family,resourceId:resource.id},handle=await c.runtime.assessments.begin(target);expect((await c.runtime.assessments.begin(target)).rootId).toBe(handle.rootId)
  const first=await c.runtime.assessments.resume(handle);expect(first.unitKind).toBe('FORM');expect(first.items).toHaveLength(1);await c.runtime.assessments.change(first,first.items[0].key,'first answer');await c.runtime.assessments.submit(first)
  const second=await c.runtime.assessments.resume(handle);expect(second.unitId).not.toBe(first.unitId);await c.runtime.assessments.change(second,second.items[0].key,'second answer');await c.runtime.assessments.submit(second)
  let complete=await c.runtime.assessments.resume(handle);if(complete.needsComplete){await c.runtime.assessments.finish(complete);complete=await c.runtime.assessments.resume(handle)}expect(complete.rootStatus).toBe('COMPLETED')
  const submissions=c.calls.filter((call:any)=>call.url.endsWith('/submit'));expect(submissions).toHaveLength(2);expect(submissions[0].data.answers[0].formItemId).toBe(first.items[0].key);expect(submissions[0].data.definitionHash).toBe(first.meta.definitionHash)
  await c.runtime.session.logout()
 },90000)
})
