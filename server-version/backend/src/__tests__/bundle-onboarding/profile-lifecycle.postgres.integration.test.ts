import { afterAll,describe,it,expect,vi } from 'vitest'
import { PrismaClient,UserRole } from '@prisma/client'
import { createHmac,randomUUID,randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { hashDeclarativePackage } from '../../modules/assessment-bundle/onboarding/contract'
import { canonicalHash,canonicalJsonString } from '../../modules/assessment-runtime/canonical'
import { BundleDefinitionProvider } from '../../modules/bundle-product/definition-provider'
import { installScaleInstrument,planScaleInstrumentInstall } from '../../modules/scale/onboarding/install'
import { planStandardScalePublication,publishStandardScale } from '../../modules/scale/onboarding/publish'
import { getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { installPackage,publishPackage } from '../../modules/bundle-product/package-release'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import * as factsModule from '../../modules/assessment-bundle/report-facts'
import { resetRuntimeObservabilityForTests,runtimeMetricLines } from '../../services/runtimeObservability'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('EVC normal install to durable FINAL and saved report',{timeout:120000},()=>{
  let db:PrismaClient|undefined
  const oldKey=process.env.BUNDLE_REVIEW_SIGNING_KEY
  afterAll(async()=>{await db?.$disconnect();if(oldKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=oldKey})
  it('uses canonical grade admission, preserves individual reports and reopens without computing',async()=>{
    process.env.DATABASE_URL=url!;requireIsolatedReleaseDatabase(url!);process.env.BUNDLE_PRODUCTS_ENABLED='true'
    const key=randomBytes(32).toString('hex');process.env.BUNDLE_REVIEW_SIGNING_KEY=key
    db=new PrismaClient({datasources:{db:{url}}});await db.$connect()
    const tag=randomUUID(),password=randomBytes(24).toString('hex')
    const actor={userId:'evc-admin-'+tag,role:UserRole.ADMIN},reviewer='evc-review-'+tag,student='evc-student-'+tag,browserStudent='evc-browser-'+tag
    for(const [id,role] of [[actor.userId,'ADMIN'],[reviewer,'ADMIN'],[student,'STUDENT'],[browserStudent,'STUDENT']] as const){
      await db.user.create({data:{id,username:id,passwordHash:await bcrypt.hash(password,4),role,accountDomain:'TRAINING',...(id===actor.userId?{platformRole:'SYSTEM_ADMIN' as const}:{})}})
    }
    const course=await db.course.create({data:{creatorId:actor.userId,title:'合成EVC学习支持',courseCode:'EVC-'+tag,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
    await db.courseStudent.createMany({data:[student,browserStudent].map(studentId=>({courseId:course.id,studentId,status:'ACTIVE'}))})
    const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
    const bindings:Array<{slotKey:string;resourceId:string}>=[]
    for(const slot of pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE')){
      const request={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:actor.userId,
        deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['STANDALONE','COMPOSITE'] as ('STANDALONE'|'COMPOSITE')[],
          runtimePolicyHash:getScaleInstrumentRuntimePolicy(slot.instrumentKey,slot.instrumentVersion)!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const,completionWindowMs:86400000}}
      expect((await planScaleInstrumentInstall(db,request)).blockers).toEqual([])
      await installScaleInstrument(db,request)
      const publish={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:actor.userId,visibility:'COURSE' as const,allowedProducts:['TRAINING' as const]}
      const preview=await planStandardScalePublication(db,publish);expect(preview.blockers).toEqual([])
      const result=await publishStandardScale(db,{...publish,expectedProofHash:preview.proofHash})
      bindings.push({slotKey:slot.slotKey,resourceId:result.scaleId})
    }
    const installed=await installPackage(db,actor.userId,pack)
    expect(installed.contentHash).toBe(hashDeclarativePackage(pack));expect(['DRAFT','PUBLISHED']).toContain(installed.status)
    const review={contentHash:hashDeclarativePackage(pack),reviewerId:reviewer,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['cross_source_condition'],scientific:true,rights:true,language:true,report:true}
    await publishPackage(db,actor.userId,'learning_motivation_math_support','0.1.1',{...review,signature:createHmac('sha256',key).update(canonicalJsonString(review)).digest('hex')})
    const product=(await import('../../modules/bundle-product/service')).createBundleProductService(new BundleDefinitionProvider([packageEntry(pack)]))
    const runtime=await import('../../modules/composite/composite.service'),forms=await import('../../modules/composite/final-submit.service'),scale=await import('../../modules/scale/scale-final-submit.service')
    let resource=await product.create(actor,{requestId:randomUUID(),bundleKey:'learning_motivation_math_support',bundleVersion:'0.1.1',name:'数学学习动机支持画像｜合成试验',courseId:course.id,bindings})
    resource=await product.publish(actor,resource.id,resource.revision)
    const started=await runtime.startUserAttempt(student,resource.id),attemptId=started.attempt.id
    const section=await db.compositeFormSection.findFirstOrThrow({where:{compositeAssessmentId:resource.id},include:{items:true}})
    expect(section.items).toHaveLength(1);expect(section.items[0].contextKey).toBe('gradeLevel')
    await forms.submitCompositeFormSectionFinal({attemptId,sectionId:section.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:(started.attempt.currentItem as any).definitionHash,answers:[{formItemId:section.items[0].id,value:'9'}]})
    const resumed=await runtime.startUserAttempt(student,resource.id);expect(resumed.attempt.id).toBe(attemptId)
    resetRuntimeObservabilityForTests();const clock=performance.now(),cpu=process.cpuUsage()
    let lastInput:Parameters<typeof scale.submitScaleAssessmentFinal>[0]|undefined
    for(const slot of pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE')){
      const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId,scale:{code:slot.instrumentKey}}})
      const definition=getExecutableScalePackage(slot.instrumentKey,slot.instrumentVersion)!.definition
      lastInput={assessmentId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(definition),contextSnapshotHash:resumed.attempt.contextSnapshotHash,
        answers:definition.items.map((item,index)=>({itemCode:item.itemCode,responseValue:String(slot.slotKey==='ase'?[2,2,2,2,3][index]:5)}))}
      await scale.submitScaleAssessmentFinal(lastInput)
    }
    await runtime.finalizeCompositeAttemptIfReady(attemptId)
    const finalMs=performance.now()-clock,finalCpu=process.cpuUsage(cpu),finalSql=runtimeMetricLines().find(s=>s.startsWith('ptool_prisma_sql_events_total '))
    expect(await scale.submitScaleAssessmentFinal(lastInput!)).toMatchObject({replayed:true})
    const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
    expect(parent.status).toBe('COMPLETED')
    const analysis=await import('../../modules/bundle-product/analysis')
    const report=await analysis.readReport(attemptId,'student')
    expect(report.status).toBe('READY');expect((report.view as any).profileView).toMatchObject({state:'MATCHED',profileId:'P4',actions:[]})
    const stored=await db.bundleAnalysis.findUniqueOrThrow({where:{id:report.analysisId}})
    const facts=decryptCognitivePayload<any>(stored.payloadEncrypted!)
    expect(facts.enginePayload.payload.profile.candidates[0].matchingScore).toBe(96.666667)
    expect(canonicalHash(facts)).toBe(report.factsHash)
    const spy=vi.spyOn(factsModule,'projectBundleReportFacts')
    resetRuntimeObservabilityForTests();const readClock=performance.now()
    const reopened=await analysis.readReport(attemptId,'student')
    const readMs=performance.now()-readClock,readSql=runtimeMetricLines().find(s=>s.startsWith('ptool_prisma_sql_events_total '))
    expect(reopened.factsHash).toBe(report.factsHash);expect(spy).not.toHaveBeenCalled();spy.mockRestore()
    expect(await db.bundleAnalysis.count({where:{attemptId}})).toBe(1)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}})).toBe(3)
    const full=await runtime.getReport(attemptId,{userId:student})
    expect(full.bundleReport?.factsHash).toBe(report.factsHash)
    const staff=await analysis.readReport(attemptId,'teacher')
    expect((staff.view as any).profileView).toMatchObject({state:'WITHHELD',profileId:null,candidates:[],actions:[]})
    expect(JSON.stringify((staff.view as any).profileView)).not.toContain('P4')
    const evidence={node:process.version,samples:1,stage:'INTEGRATED_EVC_AFTER_NORMAL_INSTALL',finalIncludesBothScaleSubmissions:true,finalMs,finalCpu,finalSql,readMs,readSql,
      responseBytes:Buffer.byteLength(JSON.stringify(reopened)),factsCipherBytes:Buffer.byteLength(stored.payloadEncrypted!),definitionCipherBytes:Buffer.byteLength(stored.targetDefinitionEncrypted),memory:process.memoryUsage()}
    if(process.env.EVC_EVIDENCE_DIRECTORY){
      const directory=path.resolve(process.env.EVC_EVIDENCE_DIRECTORY);fs.mkdirSync(directory,{recursive:true})
      fs.writeFileSync(path.join(directory,'integrated-metrics.json'),JSON.stringify(evidence,null,2)+'\n')
      fs.writeFileSync(path.join(directory,'runtime-fixture.json'),JSON.stringify({student:browserStudent,password,completedStudent:student,compositeId:resource.id,attemptId,signingKey:key}),{mode:0o600})
    }
    console.log('EVC_INTEGRATED_METRICS',JSON.stringify(evidence))
    // Retain only synthetic fixtures in this isolated test DB for the browser
    // and restore consumers. There is no production state or mocked approval.
  })
})
