import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {scaleDefinitionFor} from './mini-scale-definition'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishScaleMeasurement} from '../../modules/measurement-content/scale'
import * as product from '../../modules/questionnaire-product/service'
import * as composite from '../../modules/composite/composite.service'
import {readTrainingPersonalChanges} from '../../modules/composite/personal-tracking.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {loadFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import * as study from '../../modules/anonymous-study/service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
import {Prisma} from '@prisma/client'

const url=integrationDatabaseUrl('TRAINING_PERSONAL_TRACKING_DATABASE_URL'),suite=url?describe:describe.skip
suite('Training personal longitudinal native publication and SELF results',()=>{
 let teacher:any,student:any,course:any,source:any,item:any,next:any,actor:any,scale:any
 const id=()=>randomUUID(),future=()=>new Date(Date.now()+86400000)
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='false'
  if(process.env.TRAINING_PERSONAL_TRACKING_BROWSER_ONLY==='true'||process.env.TRAINING_PERSONAL_TRACKING_CONTINUATION_ONLY==='true')return
  teacher=await db.user.create({data:{username:'longitudinal-teacher-'+id(),passwordHash:'synthetic',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}})
  student=await db.user.create({data:{username:'longitudinal-student-'+id(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}})
  actor={userId:teacher.id,role:'TEACHER'}
  course=await db.course.create({data:{title:'纵向合成课程',courseCode:'lt-'+id(),creatorId:teacher.id,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student.id,status:'ACTIVE'}})
  const definition=scaleDefinitionFor(1,'frozen-T1')
  scale=await db.scale.create({data:{code:'lt-scale-'+id(),name:'合成原始分',creatorId:teacher.id,visibility:'PUBLIC',status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:definition as any,definitionHash:hashScaleDefinition(definition),itemCount:1,dimensionCount:1}})
  const release=await db.$transaction(tx=>publishScaleMeasurement(tx,{localId:scale.id,version:'1',instrumentVersion:scale.instrumentVersion,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:teacher.id,resourceId:scale.id}},teacher.id))
  await db.scale.update({where:{id:scale.id},data:{measurementReleaseId:release.releaseId}})
  source=await db.compositeAssessment.create({data:{code:'lt-q-'+id(),name:'纵向合成问卷',createdBy:teacher.id,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',publicEnabled:true,expiresAt:future(),maxAttempts:2,questionnaireCourses:{create:{courseId:course.id}}}})
  item=await db.compositeAssessmentItem.create({data:{compositeAssessmentId:source.id,type:'SCALE',scaleId:scale.id,required:true,position:0}})
 },30000)
 ;(process.env.TRAINING_PERSONAL_TRACKING_BROWSER_ONLY==='true'?it:it.skip)('runs native next-wave publication, real learner answer and both reports in Chromium',async()=>{
  const previous=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{status:'COMPLETED',
   user:{username:{startsWith:'longitudinal-student-'}},compositeAssessment:{personalTrackingOrdinal:2}},orderBy:{completedAt:'desc'},include:{user:true,compositeAssessment:true}})
  const publisher=await db.user.findUniqueOrThrow({where:{id:previous.compositeAssessment.createdBy!}})
  const express=(await import('express')).default,app=express()
  const {csrfProtection}=await import('../../middleware/csrf'),{errorHandler}=await import('../../middleware/errorHandler')
  app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/auth',(await import('../../routes/auth')).default)
  app.use('/api/capabilities',(await import('../../routes/capabilities')).default)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use(errorHandler)
  const server=await new Promise<import('node:http').Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
  const apiPort=(server.address() as {port:number}).port
  const {createServer}=await import('vite'),{resolve}=await import('node:path'),{chromium}=await import('playwright-core')
  const vite=await createServer({root:resolve('../frontend'),configFile:resolve('../frontend/vite.config.ts'),server:{host:'127.0.0.1',port:5181,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+apiPort,changeOrigin:true}}}})
  await vite.listen()
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  const {generateToken}=await import('../../utils/jwt'),origin='http://training.localhost:5181'
  async function pageFor(user:typeof publisher){
   const context=await browser.newContext({viewport:{width:1200,height:950}})
   await context.addCookies([{name:'ptool_session',value:generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:'TRAINING',tokenVersion:user.tokenVersion}),url:origin},
    {name:'ptool_csrf',value:'synthetic-csrf',url:origin}])
   return context.newPage()
  }
  try{
   const editor=await pageFor(publisher)
   const pending=await db.compositeAssessment.findFirst({where:{personalTrackingBaselineId:previous.compositeAssessment.personalTrackingBaselineId,
    personalTrackingOrdinal:3,status:{in:['DRAFT','PUBLISHED']}}})
   await editor.goto(origin+'/questionnaire-products/'+(pending?.id??previous.compositeAssessmentId)+'#questionnaire-publish',{waitUntil:'domcontentloaded',timeout:60000})
   if(!pending)await editor.getByRole('button',{name:'创建下一轮',exact:true}).click({timeout:45000})
   if(pending?.status!=='PUBLISHED'){
   await editor.getByRole('navigation',{name:'编制步骤',exact:true}).getByRole('link',{name:/检查与发布/}).click()
   await editor.getByText(/纵向追踪 · T3/).waitFor({timeout:30000})
   await editor.getByRole('button',{name:'发布组合测评',exact:true}).click()
   await editor.getByRole('button',{name:'确认发布',exact:true}).click()
   await editor.getByText(/已发布 ·/).waitFor({timeout:30000})
   }
   const targetId=new URL(editor.url()).pathname.split('/').pop()!
   const page=await pageFor(previous.user!)
   const completed=await db.compositeAssessmentAttempt.findFirst({where:{compositeAssessmentId:targetId,userId:previous.userId,status:'COMPLETED'}})
   await page.goto(origin+(completed?'/student/composite/attempts/'+completed.id+'/report':'/student/composite/'+targetId),{waitUntil:'domcontentloaded',timeout:60000})
   if(!completed){
   const yes=page.getByRole('button',{name:'是',exact:true})
   await yes.waitFor({timeout:45000});await yes.click()
   await page.getByRole('button',{name:'提交整份量表',exact:true}).click()
   }
   await page.getByRole('button',{name:'查看我的变化',exact:true}).click({timeout:45000})
   await page.getByRole('heading',{name:'我的变化',exact:true}).waitFor()
   await page.getByRole('table',{name:'总分各轮记录',exact:true}).waitFor()
   expect(await page.getByText('T2 → T3：0 points',{exact:true}).count()).toBe(1)
   await page.screenshot({path:'/tmp/longitudinal-training-browser.png',fullPage:true})
  }catch(cause){const pages=browser.contexts().flatMap(c=>c.pages());const page=pages[pages.length-1];if(page)await page.screenshot({path:'/tmp/longitudinal-training-browser-failure.png',fullPage:true});throw cause}
  finally{await browser.close();await vite.close();await new Promise<void>(resolve=>server.close(()=>resolve()))}
 },120000)
 afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
 async function finish(parentId:string,proof:{userId?:string;recoveryTokenHash?:string},value:'yes'|'no'){
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parentId}})
  const children=await db.assessment.findMany({where:{compositeAttemptId:parentId}})
  for(const child of children){
  const runtime=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!,db)
  await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:'lt-submit-'+id(),attemptEpoch:parent.attemptEpoch,
   definitionHash:hashScaleDefinition(runtime.definition),contextSnapshotHash:parent.contextSnapshotHash,compositeAttemptId:parentId,...proof,
   answers:runtime.definition.items.map(i=>({itemCode:i.itemCode,responseValue:value}))})
  }
  await composite.finalizeCompositeAttemptIfReady(parentId)
  expect((await composite.getReport(parentId,proof)).unitReports).toHaveLength(children.length)
 }
 it('keeps a fixed Bundle complete while tracking one leaf through its own exact-version next deployment',async()=>{
  process.env.BUNDLE_PRODUCTS_ENABLED='true'
  const {createCodeBundleDefinitionProvider}=await import('../../modules/bundle-product/code-catalog')
  const {BundleDefinitionProvider}=await import('../../modules/bundle-product/definition-provider')
  const {createBundleProductService}=await import('../../modules/bundle-product/service')
  const entry=createCodeBundleDefinitionProvider().exact('wellbeing_who5_youth_self_zh_cn_v1','1.0.0')!
  entry.definition.bundleKey='lt_fixed_'+id().replace(/-/g,'');entry.definition.status='PUBLISHED';entry.definition.rightsRequirements={required:false,instrumentKeys:[]}
  entry.definition.name='Synthetic complete two-Scale fixed Bundle';entry.definition.population={subjectPopulation:'unspecified'}
  entry.definition.slots=[0,1].map(position=>({slotKey:'scale'+position,unitType:'SCALE',position,required:true,
   instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,respondentType:'SELF',valueSelectors:['total']}))
  const bundles=createBundleProductService(new BundleDefinitionProvider([entry]))
  await db.materialGrant.create({data:{teacherId:teacher.id,resourceType:'ASSESSMENT_BUNDLE',resourceId:entry.definition.bundleKey+'@1.0.0',grantedBy:teacher.id}})
  const first=await bundles.create(actor,{requestId:id(),bundleKey:entry.definition.bundleKey,bundleVersion:'1.0.0',name:'完整固定包合成投放',courseId:course.id,
   bindings:entry.definition.slots.map(slot=>({slotKey:slot.slotKey,resourceId:scale.id}))})
  await bundles.publish(actor,first.id,first.revision,{mode:'LONGITUDINAL',metrics:[{itemId:first.items[0].id,scoreKey:'total'}]})
  const attempt1=await composite.startUserAttempt(student.id,first.id);await finish(attempt1.attempt.id,{userId:student.id},'no')
  const second=await bundles.nextWave(actor,first.id,{requestId:id()})
  expect(second.items).toHaveLength(2);expect(second.bundle.bundleKey).toBe(first.bundle.bundleKey)
  expect(second.definitionHash).toBe(first.definitionHash)
  await bundles.publish(actor,second.id,second.revision)
  const attempt2=await composite.startUserAttempt(student.id,second.id);await finish(attempt2.attempt.id,{userId:student.id},'yes')
  const changes=await readTrainingPersonalChanges(attempt2.attempt.id,{userId:student.id})
  expect(changes).toMatchObject({status:'AVAILABLE',metrics:[{points:[{value:0},{value:1}]}]})
  if('metrics' in changes)expect(changes.metrics).toHaveLength(1)
 },30000)
 it('tracks a typed numeric Form response through copy and real FINAL without creating a psychological score',async()=>{
  const q=await db.compositeAssessment.create({data:{code:'lt-form-'+id(),name:'次数回答合成追踪',createdBy:teacher.id,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:{create:{courseId:course.id}}}})
  const section=await db.compositeFormSection.create({data:{compositeAssessmentId:q.id,title:'次数',position:0}})
  const number=await db.compositeAssessmentItem.create({data:{compositeAssessmentId:q.id,type:'FORM',position:0,formSectionId:section.id,formSectionPosition:0,formType:'number',formLabel:'本周完成的次数',required:true,
   formDefinition:{itemKey:'q_'+id(),type:'NUMBER',prompt:'本周完成的次数',required:true,options:[],rows:[],min:0,max:100}}})
  await product.publish(actor,q.id,{revision:0,tracking:{mode:'LONGITUDINAL',metrics:[{itemId:number.id,scoreKey:'value'}]}})
  const later=await product.copy(actor,q.id,{requestId:id()},{trackingNext:true})
  await product.publish(actor,later.id,{revision:later.revision})
  let endId=''
  for(const [compositeId,value] of [[q.id,0],[later.id,3]] as const){
   const started=await composite.startUserAttempt(student.id,compositeId),current=started.attempt.currentItem as any
   const row=await db.compositeFormSection.findFirstOrThrow({where:{compositeAssessmentId:compositeId},include:{items:true}})
   const {submitCompositeFormSectionFinal}=await import('../../modules/composite/final-submit.service')
   await submitCompositeFormSectionFinal({attemptId:started.attempt.id,sectionId:row.id,userId:student.id,submissionId:id(),attemptEpoch:1,
    definitionHash:current.definitionHash,answers:[{formItemId:row.items[0].id,value}]})
   await composite.finalizeCompositeAttemptIfReady(started.attempt.id)
   expect(await composite.getReport(started.attempt.id,{userId:student.id})).toBeTruthy()
   endId=started.attempt.id
  }
  expect(await readTrainingPersonalChanges(endId,{userId:student.id})).toMatchObject({status:'AVAILABLE',metrics:[{unit:'raw',points:[{value:0},{value:3}],adjacent:[{delta:3}]}]})
 },30000)
 it('publishes T1, inherits exact C into T2 after source edits, records real finals and serves both own reports',async()=>{
  await product.publish(actor,source.id,{revision:0,tracking:{mode:'LONGITUDINAL',metrics:[{itemId:item.id,scoreKey:'total'}]}})
  const first=await composite.startUserAttempt(student.id,source.id)
  await finish(first.attempt.id,{userId:student.id},'no')
  const changed=scaleDefinitionFor(1,'changed-after-T1')
  await db.scale.update({where:{id:scale.id},data:{definition:changed as any,definitionHash:hashScaleDefinition(changed)}})
  next=await product.copy(actor,source.id,{requestId:id()},{trackingNext:true})
  expect(next.personalTracking.ordinal).toBe(2)
  await product.update(actor,next.id,{revision:next.revision,name:next.name,courseIds:[course.id],publicEnabled:true,expiresAt:future().toISOString()})
  const draft=await product.detail(actor,next.id)
  await product.publish(actor,next.id,{revision:draft.revision})
  const second=await composite.startUserAttempt(student.id,next.id)
  await finish(second.attempt.id,{userId:student.id},'yes')
  const changes=await readTrainingPersonalChanges(second.attempt.id,{userId:student.id})
  expect(changes.status).toBe('AVAILABLE')
  expect(changes).toMatchObject({metrics:[{points:[{value:0},{value:1}],adjacent:[{delta:1}],baseline:[{delta:1}]}]})
  const again=await readTrainingPersonalChanges(second.attempt.id,{userId:student.id})
  expect(again).toEqual(changes)
  expect((await db.scale.findUniqueOrThrow({where:{id:scale.id}})).definition).toEqual(changed)
  await expect(readTrainingPersonalChanges(second.attempt.id,{userId:teacher.id})).rejects.toMatchObject({statusCode:403})
  const final=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:second.attempt.id}})
  expect(Object.keys(final.personalChangesSnapshots as object)).toHaveLength(1)
  await expect(db.compositeAssessment.update({where:{id:source.id},data:{personalTracking:Prisma.JsonNull}})).rejects.toThrow('Published personal tracking is immutable')
 },30000)
 it('uses the actual stable anonymous Study credential, isolates identities and denies revoked cached reads',async()=>{
  const s=await study.createStudy(teacher.id,'稳定匿名纵向合成活动')
  const t1=await study.createWaveWithLink(teacher.id,'TEACHER',s.id,{requestId:id(),compositeId:source.id,title:'T1',expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses:0})
  const token1=await composite.revealAccessToken(teacher.id,'TEACHER',source.id,t1.tokenId)
  const joined=await study.joinStudy(t1.id,token1.token!,true)
  const first=await study.startStudyWave(s.id,t1.id,joined.credential)
  await finish(first.attemptId,{recoveryTokenHash:hashRecoveryToken(first.recoveryToken)},'no')
  const t2=await study.createWaveWithLink(teacher.id,'TEACHER',s.id,{requestId:id(),compositeId:next.id,title:'T2',expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses:0})
  const second=await study.startStudyWave(s.id,t2.id,joined.credential)
  await finish(second.attemptId,{recoveryTokenHash:hashRecoveryToken(second.recoveryToken)},'yes')
  const changes=await readTrainingPersonalChanges(second.attemptId,{study:{studyId:s.id,credential:joined.credential}})
  expect(changes).toMatchObject({status:'AVAILABLE',metrics:[{points:[{value:0},{value:1}]}]})
  await expect(readTrainingPersonalChanges(second.attemptId,{userId:student.id})).rejects.toMatchObject({statusCode:403})
  const other=await study.createStudy(teacher.id,'另一合成活动')
  await expect(readTrainingPersonalChanges(second.attemptId,{study:{studyId:other.id,credential:joined.credential}})).rejects.toThrow()
  await study.revokeStudyIdentity(s.id,joined.credential)
  await expect(readTrainingPersonalChanges(second.attemptId,{study:{studyId:s.id,credential:joined.credential}})).rejects.toThrow()
 },30000)
 it('selects the latest completed whole Training parent while retaining prior snapshots and rechecking course access',async()=>{
  const end=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{status:'COMPLETED',user:{username:{startsWith:'longitudinal-student-'}},
   compositeAssessment:{productKind:'QUESTIONNAIRE',personalTrackingOrdinal:2,items:{some:{type:'SCALE'}}}},orderBy:{completedAt:'desc'},include:{compositeAssessment:true}})
  const baselineId=end.compositeAssessment.personalTrackingBaselineId!,userId=end.userId!
  const before=await readTrainingPersonalChanges(end.id,{userId})
  const original=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:end.id}})
  const priorRepeats=await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:baselineId,userId,status:'COMPLETED'}})
  // A continuation resumes the completed redo from the retained first failure;
  // it must not allocate another attempt merely to manufacture green evidence.
  if(priorRepeats<2){
   const repeat=await composite.startUserAttempt(userId,baselineId)
   expect(await readTrainingPersonalChanges(end.id,{userId})).toEqual(before)
   await finish(repeat.attempt.id,{userId},'yes')
  }
  const current=await readTrainingPersonalChanges(end.id,{userId})
  expect(current).toMatchObject({status:'AVAILABLE',metrics:[{points:[{value:1},{value:1}],adjacent:[{delta:0}]}]})
  const after=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:end.id}})
  expect(after.personalChangesSnapshots).toMatchObject(original.personalChangesSnapshots as object)
  await db.courseStudent.updateMany({where:{courseId:end.deliveryCourseId!,studentId:userId},data:{status:'PENDING'}})
  try{await expect(readTrainingPersonalChanges(end.id,{userId})).rejects.toMatchObject({statusCode:403})}
  finally{await db.courseStudent.updateMany({where:{courseId:end.deliveryCourseId!,studentId:userId},data:{status:'ACTIVE'}})}
 },30000)
})
