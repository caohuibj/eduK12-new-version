import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import bcrypt from 'bcryptjs'
import {UserRole} from '@prisma/client'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {teacherJdrPackage} from './teacher-jdr.fixture'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {savePackage,approvePackage,refreshPublishedPackages} from '../../modules/bundle-product/admin-authoring'
import {installScaleInstrument,planScaleInstrumentInstall} from '../../modules/scale/onboarding/install'
import {planStandardScalePublication,publishStandardScale} from '../../modules/scale/onboarding/publish'
import {getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {createGrant} from '../../services/materialGrant'
import {bundleDefinitionProvider,bundleProductService as product} from '../../modules/bundle-product/service'
import * as runtime from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import * as analysis from '../../modules/bundle-product/analysis'
import * as factsModule from '../../modules/assessment-bundle/report-facts'
import {decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {runtimeMetricLines,resetRuntimeObservabilityForTests} from '../../services/runtimeObservability'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),test=url?it:it.skip
type Checkpoint={tag:string;key:string;password:string;actorsReady?:boolean;bindings:Array<{slotKey:string;resourceId:string}>;approved?:boolean;wholeGrant?:boolean;compositeId?:string;attemptId?:string;lastSubmission?:Parameters<typeof submitScaleAssessmentFinal>[0];replayVerified?:boolean}
test('installs, reviews, grants the whole fixed JD-R bundle and preserves five single reports and frozen self feedback',async()=>{
  requireIsolatedReleaseDatabase(url!)
  const directory=process.env.JDR_EVIDENCE_DIRECTORY,checkpointPath=directory?path.join(directory,'jdr-private-checkpoint.json'):undefined
  const c:Checkpoint=checkpointPath&&fs.existsSync(checkpointPath)?JSON.parse(fs.readFileSync(checkpointPath,'utf8')):{tag:randomUUID(),key:randomBytes(32).toString('hex'),password:randomBytes(24).toString('hex'),bindings:[]}
  const save=()=>{if(checkpointPath)fs.writeFileSync(checkpointPath,JSON.stringify(c),{mode:0o600})};save()
  const previousKey=process.env.BUNDLE_REVIEW_SIGNING_KEY,previousEnabled=process.env.BUNDLE_PRODUCTS_ENABLED
  process.env.BUNDLE_REVIEW_SIGNING_KEY=c.key;process.env.BUNDLE_PRODUCTS_ENABLED='true'
  const actor={userId:'jdr-author-'+c.tag,role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN' as const},reviewer={userId:'jdr-review-'+c.tag,role:UserRole.ADMIN,platformRole:'SYSTEM_ADMIN' as const},owner={userId:'jdr-owner-'+c.tag,role:UserRole.TEACHER},participant='jdr-participant-'+c.tag,courseId='jdr-course-'+c.tag
  const pack=teacherJdrPackage(),definitionHash=hashDeclarativePackage(pack),key=pack.manifest.definition.bundleKey,version=pack.manifest.definition.bundleVersion
  const smoke=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../modules/assessment-bundle/ci-fixtures/teacher_jdr_workplace_zh_cn/0.1.0.json'),'utf8')) as {slots:Record<string,{answers:Array<{itemCode:string;responseValue:string}>}>}
  try{
    if(!c.actorsReady){
      const passwordHash=await bcrypt.hash(c.password,4)
      for(const [id,role] of [[actor.userId,'ADMIN'],[reviewer.userId,'ADMIN'],[owner.userId,'TEACHER'],[participant,'STUDENT']] as const)await db.user.upsert({where:{id},update:{},create:{id,username:id,passwordHash,role,accountDomain:'TRAINING',...(role==='ADMIN'?{platformRole:'SYSTEM_ADMIN' as const}:{}),...(role==='TEACHER'?{teacherApproved:true}:{})}})
      await db.course.upsert({where:{id:courseId},update:{},create:{id:courseId,creatorId:owner.userId,title:'合成教师JD-R工作条件',courseCode:'JDR-'+c.tag,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
      await db.courseStudent.upsert({where:{courseId_studentId:{courseId,studentId:participant}},update:{},create:{courseId,studentId:participant,status:'ACTIVE'}})
      c.actorsReady=true;save()
    }
    for(const slot of pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE'&&!c.bindings.some(b=>b.slotKey===s.slotKey))){
      const request={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:actor.userId,
        deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['STANDALONE','COMPOSITE'] as ('STANDALONE'|'COMPOSITE')[],runtimePolicyHash:getScaleInstrumentRuntimePolicy(slot.instrumentKey,slot.instrumentVersion)!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const,completionWindowMs:86400000}}
      expect((await planScaleInstrumentInstall(db,request)).blockers).toEqual([])
      await installScaleInstrument(db,request)
      const publication={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:actor.userId,visibility:'COURSE' as const,allowedProducts:['TRAINING' as const]}
      const plan=await planStandardScalePublication(db,publication);expect(plan.blockers).toEqual([])
      const published=await publishStandardScale(db,{...publication,expectedProofHash:plan.proofHash})
      await createGrant({teacherId:owner.userId,resourceType:'SCALE',resourceId:published.scaleId,grantedBy:actor.userId})
      c.bindings.push({slotKey:slot.slotKey,resourceId:published.scaleId});save()
    }
    if(!c.approved){
      const installed=await savePackage(db,actor,pack);expect(installed.contentHash).toBe(definitionHash)
      const approved=await approvePackage(db,reviewer,key,version,{contentHash:definitionHash,scientific:true,rights:true,language:true,report:true,claims:['cross_source_condition']})
      expect(approved.status).toBe('PUBLISHED');expect(approved.publishedBy).toBe(reviewer.userId)
      c.approved=true;save()
    }
    await refreshPublishedPackages(db,bundleDefinitionProvider)
    if(!c.wholeGrant){
      // Five leaf grants alone never grant the complete expert model.
      await expect(product.eligible(owner,key,version)).rejects.toThrow('缺少此精确版本 Bundle 的使用授权')
      await createGrant({teacherId:owner.userId,resourceType:'ASSESSMENT_BUNDLE',resourceId:key+'@'+version,grantedBy:actor.userId})
      c.wholeGrant=true;save()
    }
    if(!c.compositeId){
      let source=await product.create(owner,{requestId:randomUUID(),bundleKey:key,bundleVersion:version,name:'教师工作要求与资源｜合成JD-R',courseId,bindings:c.bindings})
      source=await product.publish(owner,source.id,source.revision);c.compositeId=source.id;save()
    }
    if(!c.attemptId){c.attemptId=(await runtime.startUserAttempt(participant,c.compositeId!)).attempt.id;save()}
    let state=await runtime.getAttemptState(c.attemptId!,{userId:participant})
    const form=state.currentItem as {type:string;formSectionId:string;definitionHash:string;answers:Array<{formItemId:string}>}|null
    if(form?.type==='FORM_SECTION'){
      expect(form.answers).toHaveLength(2)
      await submitCompositeFormSectionFinal({attemptId:c.attemptId!,sectionId:form.formSectionId,userId:participant,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:form.answers.map(answer=>({formItemId:answer.formItemId,value:'true'}))})
    }
    if(state.status!=='COMPLETED')expect((await runtime.startUserAttempt(participant,c.compositeId!)).attempt.id).toBe(c.attemptId)
    resetRuntimeObservabilityForTests();const clock=performance.now(),cpu=process.cpuUsage(),submitted:string[]=[]
    for(const slot of pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE')){
      const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:c.compositeId,scaleId:c.bindings.find(b=>b.slotKey===slot.slotKey)!.resourceId}})
      const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:c.attemptId,compositeItemId:item.id}})
      if(child.status==='COMPLETED')continue
      state=await runtime.getAttemptState(c.attemptId!,{userId:participant})
      const current=state.currentItem as {scaleAssessmentId:string;definitionHash:string}
      expect(current.scaleAssessmentId).toBe(child.id)
      c.lastSubmission={assessmentId:child.id,userId:participant,submissionId:randomUUID(),attemptEpoch:1,definitionHash:current.definitionHash,contextSnapshotHash:state.contextSnapshotHash,answers:smoke.slots[slot.slotKey].answers};save()
      await submitScaleAssessmentFinal(c.lastSubmission);submitted.push(slot.slotKey)
    }
    if(!c.replayVerified)await runtime.finalizeCompositeAttemptIfReady(c.attemptId!)
    const finalMs=performance.now()-clock,finalCpu=process.cpuUsage(cpu),finalSql=runtimeMetricLines().find(s=>s.startsWith('ptool_prisma_sql_events_total '))
    if(!c.replayVerified){expect(await submitScaleAssessmentFinal(c.lastSubmission!)).toMatchObject({replayed:true});c.replayVerified=true;save()}
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:c.attemptId}})).status).toBe('COMPLETED')
    const report=await analysis.readReport(c.attemptId!,'student')
    expect(report.status).toBe('READY');expect(report.view?.profileView).toMatchObject({state:'MATCHED',profileId:'J2'})
    expect(report.view?.profileView?.actions).toHaveLength(2)
    const full=await runtime.getReport(c.attemptId!,{userId:participant})
    expect(full.unitReports).toHaveLength(5)
    for(const unit of full.unitReports){expect(unit.scores).toHaveLength(1);expect(unit.interpretations.length).toBeGreaterThan(0);expect(unit.interpretations.every((f:{label:string|null;headline:string})=>f.label===null&&f.headline==='结果说明')).toBe(true)}
    expect(full.bundleReport?.factsHash).toBe(report.factsHash)
    const stored=await db.bundleAnalysis.findUniqueOrThrow({where:{id:report.analysisId}}),facts=decryptCognitivePayload(stored.payloadEncrypted!)
    expect(canonicalHash(facts)).toBe(report.factsHash)
    const spy=vi.spyOn(factsModule,'projectBundleReportFacts');resetRuntimeObservabilityForTests();const readStart=performance.now()
    const reopened=await analysis.readReport(c.attemptId!,'student'),readMs=performance.now()-readStart,readSql=runtimeMetricLines().find(s=>s.startsWith('ptool_prisma_sql_events_total '))
    expect(reopened.factsHash).toBe(report.factsHash);expect(spy).not.toHaveBeenCalled();spy.mockRestore()
    expect(await db.bundleAnalysis.count({where:{attemptId:c.attemptId}})).toBe(1)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:c.attemptId}})).toBe(6)
    expect((await analysis.readReport(c.attemptId!,'teacher')).view?.profileView).toMatchObject({state:'WITHHELD',profileId:null,actions:[]})
    const evidence={stage:'ISOLATED_TRAINING_FIXED_JDR',node:process.version,definitionHash,attemptId:c.attemptId,compositeId:c.compositeId,analysisId:report.analysisId,factsHash:report.factsHash,submitted,finalMs,finalCpu,finalSql,readMs,readSql,responseBytes:Buffer.byteLength(JSON.stringify(full)),factsCipherBytes:Buffer.byteLength(stored.payloadEncrypted!),memory:process.memoryUsage(),profileView:reopened.view?.profileView,singleReports:full.unitReports}
    if(directory)fs.writeFileSync(path.join(directory,'jdr-lifecycle-result.json'),JSON.stringify(evidence,null,2)+'\n')
    console.log('JDR_LIFECYCLE_RESULT',JSON.stringify({definitionHash,submitted,finalMs,readMs,reportCount:full.unitReports.length,profile:'J2'}))
  }finally{if(previousKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=previousKey;if(previousEnabled===undefined)delete process.env.BUNDLE_PRODUCTS_ENABLED;else process.env.BUNDLE_PRODUCTS_ENABLED=previousEnabled;await db.$disconnect()}
},180000)
