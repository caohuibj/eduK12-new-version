import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

// Only synthetic text enters the public fixture. This registry overlay stands
// for an explicitly reviewed private build; it does not publish official text.
vi.mock('../../modules/scale/onboarding/instruments.generated', async original => {
  const actual = await original<any>()
  const { createChexiZhHansSource } = await import('../../modules/scale/packages/chexi-zh-hans-v1')
  const source = createChexiZhHansSource({ items: Array.from({length:24},(_,i) => 'SYNTHETIC ONLY '+i), instruction:'Synthetic observer instruction' })
  source.executable!.releaseStatus = 'PUBLISHED'
  return { ...actual, GENERATED_SCALE_INSTRUMENT_SOURCES: [...actual.GENERATED_SCALE_INSTRUMENT_SOURCES, source] }
})
import { prisma as db } from '../../config/database'
import { config } from '../../config'
import { canonicalJsonString } from '../../modules/assessment-runtime/canonical'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { BundleDefinitionProvider } from '../../modules/bundle-product/definition-provider'
import { createBundleProductService } from '../../modules/bundle-product/service'
import { createChildCrossMethodService } from '../../modules/bundle-product/child-cross-method'
import { installPackage, publishPackage } from '../../modules/bundle-product/package-release'
import { getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument } from '../../modules/scale/onboarding/install'
import { publishRegisteredScaleFixture } from '../integration/registered-resource-fixture'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { getAttemptState, finalizeCompositeAttemptIfReady } from '../../modules/composite/composite.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'
import { submitScaleAssessmentFinal } from '../../modules/scale/scale-final-submit.service'
import { submitCognitiveSessionFinal } from '../../modules/cognitive/final-submit.service'
import { gonogoSequence, flankerSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'

const url = integrationDatabaseUrl('CHILD_CROSS_METHOD_TEST_DATABASE_URL'), suite = url ? describe : describe.skip
const root = path.resolve(__dirname, '../../modules/assessment-bundle/packages')
const names = ['child_cognitive_tasks_zh_cn','child_chexi_parent_zh_cn_v1','child_chexi_teacher_zh_cn_v1','child_cognitive_control_parent_teacher_zh_cn']
const packs = names.map(name => loadPackage(root+'/'+name+'/0.1.0'))
const provider = new BundleDefinitionProvider(packs.map(packageEntry)), product = createBundleProductService(provider)
const service = createChildCrossMethodService(db, { eligible: product.eligible })
const suffix = randomUUID(), ids = { teacher:'child-teacher-'+suffix, child:'child-subject-'+suffix, parent:'child-parent-'+suffix, admin:'child-admin-'+suffix, reviewer:'child-reviewer-'+suffix }
const actor = { userId:ids.teacher,role:'TEACHER' as const }
const previousCognitive = config.cognitiveModuleEnabled
const previousGrants = config.materialGrantsEnabled
let courseId:string, scaleId:string, templates:string[] = []
suite('child cross-method real relational START / FINAL / saved report', {timeout:60000}, () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    config.cognitiveModuleEnabled=true
    config.materialGrantsEnabled=true
    process.env.DATA_ENCRYPTION_KEY='e'.repeat(64); process.env.DATA_PSEUDONYM_KEY='d'.repeat(64)
    process.env.BUNDLE_PRODUCTS_ENABLED='true'; process.env.BUNDLE_REVIEW_SIGNING_KEY='synthetic-child-review-key-000000000000'
    for (const [key,id] of Object.entries(ids)) await db.user.create({data:{id,username:id,passwordHash:'SYNTHETIC ONLY',accountDomain:'TRAINING',
      role:key==='child'?'STUDENT':key==='parent'?'PARENT':key==='teacher'?'TEACHER':'ADMIN',teacherApproved:key==='teacher',platformRole:key==='admin'||key==='reviewer'?'SYSTEM_ADMIN':'STANDARD'}})
    courseId=(await db.course.create({data:{title:'Synthetic child workflow',courseCode:'child-'+suffix,courseType:'TRAINING_COURSE',status:'PUBLISHED',creatorId:ids.teacher}})).id
    await db.courseStudent.create({data:{courseId,studentId:ids.child,status:'ACTIVE'}})
    await db.parentStudentRelationship.create({data:{parentUserId:ids.parent,studentUserId:ids.child,status:'ACTIVE',approvedByUserId:ids.teacher,approvedAt:new Date()}})
    await installScaleInstrument(db,{instrumentKey:'chexi_zh_hans',instrumentVersion:'1.0.0',actorUserId:ids.admin,deploymentPolicy:{schemaVersion:2,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['COMPOSITE'],runtimePolicyHash:getScaleInstrumentRuntimePolicy('chexi_zh_hans','1.0.0')!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE',completionWindowMs:86400000}})
    scaleId=(await db.scale.findUniqueOrThrow({where:{code:'chexi_zh_hans'}})).id
    await db.scale.update({where:{id:scaleId},data:{status:'PUBLISHED',visibility:'PUBLIC'}})
    await publishRegisteredScaleFixture(db,scaleId)
    await db.materialGrant.create({data:{teacherId:ids.teacher,resourceType:'SCALE',resourceId:scaleId,grantedBy:ids.admin}})
    const bindings=[]
    for(const type of ['gonogo','flanker']) {
      const seed=cognitiveSeeds.find(s=>s.testType===type&&s.configVersion==='1.0.0')!
      const config=await db.cognitiveTestConfig.upsert({where:{testType_configVersion:{testType:type,configVersion:'1.0.0'}},update:{status:'PUBLISHED'},create:{...seed,status:'PUBLISHED',accessPolicy:'OPEN',config:seed.config as any}})
      const freeze=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry(type,'1.0.0','1.0.0'),profile:'standard',baseConfig:seed.config as any})
      const assignment=await db.cognitiveAssignment.create({data:{configId:config.id,courseId,createdBy:ids.teacher,title:'Synthetic '+type,status:'PUBLISHED',maxAttempts:10,...freezeDataForWrite(freeze)}})
      await (await import('../fixtures/published-measurement')).publishTrainingSourcesFixture(db,ids.teacher,{assignmentIds:[assignment.id]})
      bindings.push({slotKey:type,resourceId:assignment.id})
    }
    for(const p of packs) {
      const row=await installPackage(db,ids.admin,p),material={contentHash:row.contentHash,reviewerId:ids.reviewer,expiresAt:new Date(Date.now()+86400000).toISOString(),claims:['independent_summary','cross_source_condition','joint_conclusion'],scientific:true,rights:true,language:true,report:true}
      const signature=createHmac('sha256',process.env.BUNDLE_REVIEW_SIGNING_KEY!).update(canonicalJsonString(material)).digest('hex')
      await publishPackage(db,ids.reviewer,p.manifest.definition.bundleKey,'0.1.0',{...material,signature})
      await db.materialGrant.create({data:{teacherId:ids.teacher,resourceType:'ASSESSMENT_BUNDLE',resourceId:p.manifest.definition.bundleKey+'@0.1.0',grantedBy:ids.admin}})
    }
    for(let i=0;i<3;i++) {
      const row=await product.create(actor,{requestId:randomUUID(),bundleKey:names[i],bundleVersion:'0.1.0',name:'Synthetic child component '+i,courseId,bindings:i===0?bindings:[{slotKey:'chexi',resourceId:scaleId}]})
      templates.push((await product.publish(actor,row.id,row.revision)).id)
    }
  },60000)
  // The fixture uses an explicitly selected disposable DB. Retain its synthetic
  // graph for failure inspection; the caller destroys that container/database.
  afterAll(async()=>{config.cognitiveModuleEnabled=previousCognitive;config.materialGrantsEnabled=previousGrants;await db.$disconnect()})
  it('uses three actual people and one episode; freezes independent observation and task facts', async () => {
    await expect(product.create(actor,{requestId:randomUUID(),bundleKey:names[3],bundleVersion:'0.1.0',name:'Invalid single participant',courseId,bindings:[]})).rejects.toThrow('跨报告者')
    const input={requestId:randomUUID(),subjectUserId:ids.child,taskCompositeId:templates[0],parent:{userId:ids.parent,compositeId:templates[1]},teacherObserverCompositeId:templates[2],reportBundleKey:names[3],reportBundleVersion:'0.1.0'}
    const [issued,replayed]=await Promise.all([service.issue(actor,input),service.issue(actor,input)])
    expect(issued).toEqual(replayed);expect(issued.assignments).toHaveLength(3)
    const child=issued.assignments.find((a:any)=>a.respondentType==='SELF')!
    await expect(service.start(actor,child.assignmentId)).rejects.toThrow('真实作答者')
    const parent=issued.assignments.find((a:any)=>a.respondentType==='PARENT')!
    const parentActor={userId:ids.parent,role:'PARENT'}
    expect(await service.tasks(parentActor)).toEqual([expect.objectContaining({assignmentId:parent.assignmentId,subjectUserId:ids.child,subjectName:ids.child,consentRequired:true})])
    await expect(service.start(parentActor,parent.assignmentId)).rejects.toThrow()
    await service.accept(parentActor,parent.assignmentId)
    for(const a of issued.assignments) {
      const who={userId:a.respondentUserId,role:a.respondentType==='SELF'?'STUDENT':a.respondentType}
      const started=await service.start(who,a.assignmentId)
      let state=await getAttemptState(started.attemptId,{userId:who.userId})
      const form=state.currentItem as any
      if(form.type==='FORM_SECTION') await submitCompositeFormSectionFinal({attemptId:started.attemptId,sectionId:form.formSectionId,userId:who.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:form.answers.map((q:any)=>({formItemId:q.formItemId,value:'2018-01'}))})
      for(let i=0;i<2;i++) {
        state=await getAttemptState(started.attemptId,{userId:who.userId}); const unit=state.currentItem as any
        if(state.status==='COMPLETED'||!unit)break
        if(unit.type==='SCALE') await submitScaleAssessmentFinal({assessmentId:unit.scaleAssessmentId,userId:who.userId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:unit.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:a.respondentType==='PARENT'?2:4}))})
        else {
          const session=await db.cognitiveSession.findUniqueOrThrow({where:{id:unit.cognitiveSession.sessionId},include:{assignment:true}})
          const trials=session.testType==='gonogo'?gonogoSequence(session.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}})):flankerSequence(session.randomSeed,80).map((spec,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*2200,endedAtPerfMs:trialIndex*2200+500,payload:{targetDirection:spec.targetDirection,flankerDirection:spec.flankerDirection,response:spec.correctResponse,rtMs:spec.targetDirection===spec.flankerDirection?500:488,interrupted:false,timedOut:false}}))
          await submitCognitiveSessionFinal(who.userId,{sessionId:session.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:session.assignment!.resolvedConfigHash!,contextSnapshotHash:state.contextSnapshotHash,trials})
        }
      }
      await finalizeCompositeAttemptIfReady(started.attemptId)
      expect(await db.compositeAssessmentAttempt.findUnique({where:{id:started.attemptId}})).toMatchObject({status:'COMPLETED',subjectUserId:ids.child,respondentUserId:who.userId,episodeId:issued.episodeId,assignmentRef:a.assignmentId})
      if(a.respondentType!=='SELF') {
        const row=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attemptId}})
        const context=(await import('../../services/assessmentContextService')).readCompositeAttemptContext(row)
        expect(context.context?.subjectUserId).toBe(ids.child)
        expect(await service.sourceReport(who,a.assignmentId)).toMatchObject({status:'READY'})
      }
    }
    const report=await service.collect(actor,issued.episodeId,randomUUID()) as any
    expect(report.status).toBe('READY')
    expect(report.view.evidence.find((e:any)=>e.evidenceKey==='parent_chexi_working_memory').value).toMatchObject({state:'present',value:2})
    expect(report.view.evidence.find((e:any)=>e.evidenceKey==='teacher_chexi_working_memory').value).toMatchObject({state:'present',value:4})
    expect(report.view.evidence.find((e:any)=>e.evidenceKey==='flanker_flanker_effect_ms').value).toMatchObject({state:'present',value:-12})
    const saved=await db.bundleAnalysis.findUniqueOrThrow({where:{id:report.analysisId}})
    expect(saved.purpose).toBe('REANALYSIS')
    await expect((await import('../../modules/bundle-product/analysis')).readReport(saved.attemptId,'teacher',report.analysisId)).rejects.toThrow('所属儿童评估轮次')
    const reads=vi.spyOn(await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service'),'readCompletedCompositeBundleInputs')
    expect((await service.read(actor,report.analysisId)).factsHash).toBe(report.factsHash); expect(reads).not.toHaveBeenCalled()
  })
})
