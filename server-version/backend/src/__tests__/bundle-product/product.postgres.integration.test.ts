import * as reportFacts from '../../modules/assessment-bundle/report-facts'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { MIXED_SCALE_DEFINITION } from '../questionnaire/product-fixtures'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { hashRecoveryToken } from '../../services/anonymousAccess'

const url = integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let product: ReturnType<typeof import('../../modules/bundle-product/service').createBundleProductService>
let provider: import('../../modules/bundle-product/definition-provider').BundleDefinitionProvider
let analysis: typeof import('../../modules/bundle-product/analysis')
let runtime: typeof import('../../modules/composite/composite.service')
let forms: typeof import('../../modules/composite/final-submit.service')
let scaleSubmit: typeof import('../../modules/scale/scale-final-submit.service')
let cogSubmit: typeof import('../../modules/cognitive/final-submit.service')
let sjtSubmit: typeof import('../../modules/situational/situational-final-submit.service')
const suffix = randomUUID()
const actor = { userId: 'b2-teacher-' + suffix, role: UserRole.TEACHER }
const other = { userId: 'b2-other-' + suffix, role: UserRole.TEACHER }
const student = 'b2-student-' + suffix
const student2 = 'b2-student2-' + suffix
let course1: string, course2: string, scaleId: string, assignmentId: string, configId: string

const fresh = (extra: Record<string, unknown> = {}) => product.create(actor, { requestId: randomUUID(), bundleKey: 'b2_fixture_v1', bundleVersion: '1.0.0', name: 'Bundle test fixture', courseId: course1, bindings: [{slotKey:'gonogo',resourceId:assignmentId},{slotKey:'adexi',resourceId:scaleId},{slotKey:'situational'}], ...extra })
async function complete(row: any, beforeFinal?:()=>void) {
    const started=await runtime.startUserAttempt(student,row.id)
    const attemptId=started.attempt.id
    const form=started.attempt.currentItem as any
    expect(form.type).toBe('FORM_SECTION')
    const section=await db.compositeFormSection.findFirstOrThrow({where:{compositeAssessmentId:row.id},include:{items:true}})
    await expect(forms.submitCompositeFormSectionFinal({attemptId,sectionId:section.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:section.items.map((i:any)=>({formItemId:i.id,value:'invalid-age'}))})).rejects.toMatchObject({statusCode:409})
    await forms.submitCompositeFormSectionFinal({attemptId,sectionId:section.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:section.items.map((i:any)=>({formItemId:i.id,value:'25'}))})
    const scale=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
    const scaleInput={assessmentId:scale.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes'}],userId:student}
    await scaleSubmit.submitScaleAssessmentFinal(scaleInput)
    expect(await scaleSubmit.submitScaleAssessmentFinal(scaleInput)).toMatchObject({replayed:true})
    const cog=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:attemptId},include:{assignment:true}})
    await cogSubmit.submitCognitiveSessionFinal(student,{sessionId:cog.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:cog.assignment!.resolvedConfigHash!,contextSnapshotHash:null,
      trials:gonogoSequence(cog.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))})
    const child=await db.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
    beforeFinal?.()
    await sjtSubmit.submitSituationalAttemptFinal({
      attemptId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:child.definitionHash,instrumentVersion:child.instrumentVersion,compiledRuntimeHash:child.compiledRuntimeHash,scoringVersion:child.scoringVersion,
      responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}],
      embedded:{compositeAttemptId:attemptId,compositeItemId:child.compositeItemId!,compositeSlotKey:compositeItemSlotKey(child.compositeItemId!,'SITUATIONAL'),userId:student},
    })
    await runtime.finalizeCompositeAttemptIfReady(attemptId)
    expect(await runtime.getAttemptState(attemptId,{userId:student})).toMatchObject({status:'COMPLETED',progress:100,completedItems:4})
    const report=await runtime.getReport(attemptId,{userId:student})

    return {attemptId,report}
}
suite('Bundle V3 real FINAL lifecycle', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    db = new PrismaClient({ datasources: { db: { url } } })
    await db.$connect()
    process.env.BUNDLE_PRODUCTS_ENABLED='true'
    analysis = await import('../../modules/bundle-product/analysis')
    runtime = await import('../../modules/composite/composite.service')
    forms = await import('../../modules/composite/final-submit.service')
    scaleSubmit = await import('../../modules/scale/scale-final-submit.service')
    cogSubmit = await import('../../modules/cognitive/final-submit.service')
    sjtSubmit = await import('../../modules/situational/situational-final-submit.service')
    for (const [id, role] of [[actor.userId, 'TEACHER'], [other.userId, 'TEACHER'], [student, 'STUDENT'], [student2, 'STUDENT']] as const) {
      await db.user.create({ data: { id, username: id, passwordHash: 'fixture-only', role } })
    }
    const cs = []
    for (let i=0;i<2;i++) cs.push(await db.course.create({ data: { creatorId: actor.userId, title: 'Q1 course '+i, courseCode: 'Q1-'+suffix+'-'+i, status: 'PUBLISHED' } }))
    course1=cs[0].id; course2=cs[1].id
    await db.courseStudent.createMany({ data: [{ courseId: course1, studentId: student, status: 'ACTIVE' }, { courseId: course2, studentId: student2, status: 'APPROVED' }] })
    const cognitiveEntry = requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0')
    const freeze = freezeAssignmentProfile({ entry: cognitiveEntry, profile: 'standard', baseConfig: { totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'} } })
    const config = await db.cognitiveTestConfig.upsert({
      where: { testType_configVersion: { testType:'gonogo',configVersion:'1.0.0' } }, update: {},
      create: { testType:'gonogo',configVersion:'1.0.0',name:'Q1 fixture',config:freeze.resolvedConfig as any,status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN',publishedAt:new Date() },
    })
    configId=config.id
    assignmentId=(await db.cognitiveAssignment.create({ data: { configId,courseId:course1,createdBy:actor.userId,title:'Go/No-Go fixture',status:'PUBLISHED',listedStandalone:true,...freezeDataForWrite(freeze) } })).id
    scaleId=(await db.scale.create({ data: { code:'Q1-'+suffix,name:'Scale fixture',creatorId:actor.userId,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:MIXED_SCALE_DEFINITION as any,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),itemCount:1,dimensionCount:1 } })).id

    const { createCodeBundleDefinitionProvider } = await import('../../modules/bundle-product/code-catalog')
    const { BundleDefinitionProvider } = await import('../../modules/bundle-product/definition-provider')
    const entry = createCodeBundleDefinitionProvider().exact('integrated_gonogo_adexi_adult_zh_cn_v1','1.0.0')!
    entry.definition.bundleKey='b2_fixture_v1'; entry.definition.status='PUBLISHED'; entry.definition.name='Isolated lifecycle fixture'
    entry.definition.rightsRequirements={required:false,instrumentKeys:[]}
    entry.definition.slots[1].instrumentKey='Q1-'+suffix
    entry.definition.slots[1].valueSelectors=['total']
    entry.definition.slots.push({slotKey:'situational',unitType:'SITUATIONAL',position:2,required:true,instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion,respondentType:'SELF',valueSelectors:['bfi2.assertiveness.behavior']})
    provider = new BundleDefinitionProvider([entry])
    product = (await import('../../modules/bundle-product/service')).createBundleProductService(provider)
    await db.materialGrant.create({data:{teacherId:actor.userId,resourceType:'ASSESSMENT_BUNDLE',resourceId:'b2_fixture_v1@1.0.0',grantedBy:actor.userId}})
  },120000)
  afterAll(async () => {
    if (!db) return
    // Delete only this suite's owned graph; the database may host other suites.
    const ids=(await db.compositeAssessment.findMany({where:{createdBy:{in:[actor.userId,other.userId]}},select:{id:true}})).map(v=>v.id)
    const attempts=(await db.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:{in:ids}},select:{id:true}})).map(v=>v.id)
    await db.assessmentUnitSnapshot.deleteMany({where:{compositeAttemptId:{in:attempts}}})
    await db.situationalRawSubmission.deleteMany({where:{attempt:{compositeAttemptId:{in:attempts}}}})
    await db.situationalAttempt.deleteMany({where:{compositeAttemptId:{in:attempts}}})
    await db.cognitiveRawSubmission.deleteMany({where:{session:{compositeAttemptId:{in:attempts}}}})
    await db.cognitiveSession.deleteMany({where:{compositeAttemptId:{in:attempts}}})
    await db.assessment.deleteMany({where:{compositeAttemptId:{in:attempts}}})
    await db.compositeAssessment.deleteMany({where:{id:{in:ids}}})
    await db.questionnaire.deleteMany({where:{creatorId:actor.userId}})
    await db.cognitiveAssignment.deleteMany({where:{createdBy:{in:[actor.userId,other.userId]}}})
    await db.scale.deleteMany({where:{creatorId:actor.userId}})
    await db.course.deleteMany({where:{creatorId:actor.userId}})
    await db.user.deleteMany({where:{id:{in:[actor.userId,other.userId,student,student2]}}})
    await db.$disconnect()
  },60000)


  it('enforces authorization and exact concurrent creation idempotency', async () => {
    const requestId=randomUUID()
    const [a,b]=await Promise.all([fresh({requestId}),fresh({requestId})])
    expect(a.id).toBe(b.id)
    await expect(fresh({requestId,name:'changed'})).rejects.toMatchObject({statusCode:409})
    await expect(product.detail(other,a.id)).rejects.toMatchObject({statusCode:403})
    await expect(fresh({bundleVersion:'latest'})).rejects.toBeDefined()
    expect((await import('../../modules/bundle-product/code-catalog')).createCodeBundleDefinitionProvider().list().every(v=>v.definition.status==='DRAFT')).toBe(true)
  })
  it('completes four canonical sources, persists once, and appends reanalysis without changing original facts', async () => {
    let row=await fresh()
    row=await product.publish(actor,row.id,row.revision)
    expect((await runtime.listAvailableForStudent(student)).some(v=>v.id===row.id)).toBe(true)
    const {attemptId,report}=await complete(row)
    expect(report).toMatchObject({productKind:'ASSESSMENT_BUNDLE',bundleReport:{snapshotFamily:'ASSESSMENT_BUNDLE'}})
    await analysis.processInitial(attemptId)
    const initial=await db.bundleAnalysis.findFirstOrThrow({where:{attemptId,requestKey:'INITIAL'}})
    expect(initial.status).not.toBe('FAILED')
    expect((await analysis.readReport(attemptId,'student')).view!.engineSummary.kind).toBe('COMPUTED')
    expect(['READY','UNAVAILABLE']).toContain(initial.status)
    expect(initial.factsHash).toBeTruthy()
    const original=await analysis.readReport(attemptId,'student')
    expect(original.view!.rawAnswers).toBeNull()
    expect(original.view!.evidence.filter(v=>v.sourceKind==='CONTEXT_FACT').every(v=>v.value.state==='redacted')).toBe(true)
    await Promise.all([analysis.processInitial(attemptId),analysis.processInitial(attemptId)])
    expect(await db.bundleAnalysis.count({where:{attemptId}})).toBe(1)
    const req={requestId:randomUUID(),targetBundleKey:'b2_fixture_v1',targetBundleVersion:'1.0.0',reason:'Verify frozen reanalysis',previousAnalysisId:initial.id}
    const [a,b]=await Promise.all([analysis.reanalyze(actor,attemptId,req,provider,product.eligible),analysis.reanalyze(actor,attemptId,req,provider,product.eligible)])
    expect(a.analysisId).toBe(b.analysisId)
    expect(await db.bundleAnalysis.count({where:{attemptId}})).toBe(2)
    expect((await analysis.readReport(attemptId,'student')).factsHash).toBe(original.factsHash)
    await expect(analysis.reanalyze(actor,attemptId,{...req,reason:'changed'},provider,product.eligible)).rejects.toMatchObject({statusCode:409})
    await expect(analysis.history(other,attemptId)).rejects.toMatchObject({statusCode:403})
    await db.scale.update({where:{id:scaleId},data:{status:'DRAFT'}})
    try { expect(await analysis.readReport(attemptId,'student')).toEqual(original) }
    finally { await db.scale.update({where:{id:scaleId},data:{status:'PUBLISHED'}}) }
    const {BundleDefinitionProvider}=await import('../../modules/bundle-product/definition-provider')
    const target=provider.exact('b2_fixture_v1','1.0.0')!
    target.definition.bundleVersion='1.0.1';target.definition.slots[2].valueSelectors=['missing.selector']
    const unavailableProvider=new BundleDefinitionProvider([target])
    const targetProduct=(await import('../../modules/bundle-product/service')).createBundleProductService(unavailableProvider)
    const unavailable=await analysis.reanalyze({...actor,role:UserRole.ADMIN},attemptId,{...req,requestId:randomUUID(),targetBundleVersion:'1.0.1'},unavailableProvider,targetProduct.eligible)
    expect(unavailable.status).toBe('UNAVAILABLE')
    expect(unavailable.view!.evidence.some(v=>v.value.state==='missing')).toBe(true)
    await expect(runtime.getExportContext(actor.userId,actor.role,row.id)).rejects.toMatchObject({statusCode:409})
    await product.archive(actor,row.id,row.revision)
    expect((await analysis.readReport(attemptId,'student')).factsHash).toBe(original.factsHash)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}})).toBe(4)
  },120000)
  it('retains completed FINALs after an engine failure and recovers the same analysis while creation is closed', async () => {
    const row=await fresh(); await product.publish(actor,row.id,row.revision)
    const {attemptId}=await complete(row,()=>vi.spyOn(reportFacts,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('injected engine failure')}))
    vi.restoreAllMocks()
    const before=await db.bundleAnalysis.findFirstOrThrow({where:{attemptId}})
    expect(before.status).toBe('FAILED')
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})).status).toBe('COMPLETED')
    const finals=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId},orderBy:{id:'asc'}})
    process.env.BUNDLE_PRODUCTS_ENABLED='false'
    try {
      await expect(fresh()).rejects.toMatchObject({statusCode:409})
      const recovered=await runtime.retryBundleForParticipant(attemptId,{userId:student})
      expect(recovered.analysisId).toBe(before.id)
      expect(['READY','UNAVAILABLE']).toContain(recovered.status)
      expect(await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId},orderBy:{id:'asc'}})).toEqual(finals)
      expect(await db.bundleAnalysis.count({where:{attemptId}})).toBe(1)
    } finally { process.env.BUNDLE_PRODUCTS_ENABLED='true' }
  },120000)
  it('keeps draft state when publication authorization is revoked', async () => {
    const row=await fresh()
    await db.materialGrant.deleteMany({where:{teacherId:actor.userId,resourceType:'ASSESSMENT_BUNDLE'}})
    try {
      await expect(product.publish(actor,row.id,row.revision)).rejects.toMatchObject({statusCode:403})
      expect((await product.detail(actor,row.id)).status).toBe('DRAFT')
    } finally {
      await db.materialGrant.create({data:{teacherId:actor.userId,resourceType:'ASSESSMENT_BUNDLE',resourceId:'b2_fixture_v1@1.0.0',grantedBy:actor.userId}})
    }
  })

  it('rejects incomplete completion and supports anonymous admission with recovery isolation', async () => {
    const row=await fresh({courseId:null,publicEnabled:true,expiresAt:new Date(Date.now()+86400000).toISOString()})
    await product.publish(actor,row.id,row.revision)
    const token=await runtime.createAccessTokenForComposite(actor.userId,actor.role,row.id,new Date(Date.now()+3600000).toISOString(),10)
    const started=await runtime.startPublicAttempt(token.token!)
    expect((await runtime.startPublicAttempt(token.token!,started.recoveryToken!)).attempt.id).toBe(started.attempt.id)
    expect((await runtime.finalizeCompositeAttemptIfReady(started.attempt.id))?.status).not.toBe('COMPLETED')
    expect(await db.bundleAnalysis.count({where:{attemptId:started.attempt.id}})).toBe(0)
    await expect(runtime.getAttemptState(started.attempt.id,{recoveryTokenHash:hashRecoveryToken('invalid'.repeat(8))})).rejects.toBeDefined()
    await expect(runtime.retryBundleForParticipant(started.attempt.id,{recoveryTokenHash:hashRecoveryToken(started.recoveryToken!)})).rejects.toBeDefined()
  },30000)

})
