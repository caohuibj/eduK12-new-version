import {it,expect,vi} from 'vitest'
import {PrismaClient,UserRole} from '@prisma/client'
import {randomUUID,randomBytes,createHmac} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {installPackage,publishPackage} from '../../modules/bundle-product/package-release'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
import {createBundleProductService} from '../../modules/bundle-product/service'
import {reanalyze,readReport} from '../../modules/bundle-product/analysis'
import {decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import * as factsModule from '../../modules/assessment-bundle/report-facts'
import {resetRuntimeObservabilityForTests,runtimeMetricLines} from '../../services/runtimeObservability'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),attemptId=process.env.EVC_CONTINUATION_ATTEMPT_ID
// Explicit recovery consumer, separate from the fresh lifecycle suite.
const evidenceDirectory=process.env.EVC_EVIDENCE_DIRECTORY
const test=url&&attemptId&&evidenceDirectory?it:it.skip
test('continues the saved EVC FINAL using a new native mapping and preserves the original rejection',async()=>{
  process.env.DATABASE_URL=url!;requireIsolatedReleaseDatabase(url!)
  const db=new PrismaClient({datasources:{db:{url}}})
  const key=randomBytes(32).toString('hex');process.env.BUNDLE_REVIEW_SIGNING_KEY=key;process.env.BUNDLE_PRODUCTS_ENABLED='true'
  try{
    const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId!},include:{compositeAssessment:{include:{items:true}}}})
    expect(parent.status).toBe('COMPLETED')
    const initial=await db.bundleAnalysis.findFirstOrThrow({where:{attemptId,requestKey:'INITIAL'}})
    expect(initial.status).toBe('UNAVAILABLE')
    const originalHash=initial.factsHash
    const actor={userId:parent.compositeAssessment.createdBy!,role:UserRole.ADMIN},tag=randomUUID(),reviewer='evc-repair-review-'+tag
    await db.user.create({data:{id:reviewer,username:reviewer,passwordHash:'synthetic-review-only',role:'ADMIN',accountDomain:'TRAINING'}})
    const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
    const installed=await installPackage(db,actor.userId,pack);expect(installed.status).toBe('DRAFT')
    const review={contentHash:hashDeclarativePackage(pack),reviewerId:reviewer,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['cross_source_condition'],scientific:true,rights:true,language:true,report:true}
    await publishPackage(db,actor.userId,'learning_motivation_math_support','0.1.1',{...review,signature:createHmac('sha256',key).update(canonicalJsonString(review)).digest('hex')})
    const provider=new BundleDefinitionProvider([packageEntry(pack)]),product=createBundleProductService(provider)
    const started=performance.now()
    const appended=await reanalyze(actor,attemptId!,{requestId:randomUUID(),targetBundleKey:'learning_motivation_math_support',targetBundleVersion:'0.1.1',reason:'修正原生完整定义hash绑定，保留B模型0.1.0所有参数及原拒判记录',previousAnalysisId:initial.id},provider,product.eligible)
    expect(appended.status).toBe('READY')
    const stored=await db.bundleAnalysis.findUniqueOrThrow({where:{id:appended.analysisId}})
    const facts=decryptCognitivePayload<any>(stored.payloadEncrypted!)
    expect(facts.enginePayload.payload.profile).toMatchObject({state:'MATCHED',profileId:'P4',model:{version:'0.1.0',mappingVersion:'0.1.1'}})
    expect(facts.enginePayload.payload.profile.candidates[0].matchingScore).toBe(96.666667)
    expect((await db.bundleAnalysis.findUniqueOrThrow({where:{id:initial.id}})).factsHash).toBe(originalHash)
    const spy=vi.spyOn(factsModule,'projectBundleReportFacts');resetRuntimeObservabilityForTests();const clock=performance.now(),cpu=process.cpuUsage()
    const report=await readReport(attemptId!,'student',appended.analysisId)
    const metrics={samples:1,node:process.version,analysisMs:performance.now()-started,readMs:performance.now()-clock,readCpu:process.cpuUsage(cpu),
      readSql:runtimeMetricLines().find(s=>s.startsWith('ptool_prisma_sql_events_total ')),responseBytes:Buffer.byteLength(JSON.stringify(report)),
      factsCipherBytes:Buffer.byteLength(stored.payloadEncrypted!),definitionCipherBytes:Buffer.byteLength(stored.targetDefinitionEncrypted),memory:process.memoryUsage()}
    expect(spy).not.toHaveBeenCalled();spy.mockRestore()
    expect((report.view as any).profileView).toMatchObject({profileId:'P4',actions:[]})
    const teacher=await readReport(attemptId!,'teacher',appended.analysisId)
    expect((teacher.view as any).profileView).toMatchObject({state:'WITHHELD',profileId:null,candidates:[],actions:[]})
    expect(JSON.stringify((teacher.view as any).profileView)).not.toContain('P4')
    expect((await readReport(attemptId!,'student',initial.id)).factsHash).toBe(originalHash)
    const student='evc-browser-repair-'+tag,password=randomBytes(24).toString('hex')
    await db.user.create({data:{id:student,username:student,passwordHash:await bcrypt.hash(password,4),role:'STUDENT',accountDomain:'TRAINING'}})
    await db.courseStudent.create({data:{studentId:student,courseId:parent.compositeAssessment.courseId!,status:'ACTIVE'}})
    const bindings=pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE').map(s=>({slotKey:s.slotKey,resourceId:parent.compositeAssessment.items.find(i=>i.type==='SCALE'&&i.position===(s.slotKey==='ase'?1:2))!.scaleId!}))
    let resource=await product.create(actor,{requestId:randomUUID(),bundleKey:'learning_motivation_math_support',bundleVersion:'0.1.1',name:'数学学习动机支持画像｜合成试验',courseId:parent.compositeAssessment.courseId,bindings})
    resource=await product.publish(actor,resource.id,resource.revision)
    const directory=path.resolve(evidenceDirectory!)
    fs.mkdirSync(directory,{recursive:true})
    fs.writeFileSync(path.join(directory,'mapping-repair-metrics.json'),JSON.stringify(metrics,null,2)+'\n')
    fs.writeFileSync(path.join(directory,'runtime-fixture.json'),JSON.stringify({student,password,compositeId:resource.id,attemptId,analysisId:appended.analysisId,signingKey:key}),{mode:0o600})
    console.log('EVC_MAPPING_REPAIR',JSON.stringify(metrics))
  }finally{await db.$disconnect()}
},120000)
