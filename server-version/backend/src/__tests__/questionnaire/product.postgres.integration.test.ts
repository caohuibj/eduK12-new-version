import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { MIXED_SCALE_DEFINITION } from './product-fixtures'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { freezeAssignmentProfile, freezeDataForWrite } from '../../modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'
import { hashRecoveryToken } from '../../services/anonymousAccess'

const url = integrationDatabaseUrl('QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL', 'SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let product: typeof import('../../modules/questionnaire-product/service')
let runtime: typeof import('../../modules/composite/composite.service')
let forms: typeof import('../../modules/composite/final-submit.service')
let scaleSubmit: typeof import('../../modules/scale/scale-final-submit.service')
let cogSubmit: typeof import('../../modules/cognitive/final-submit.service')
let sjtSubmit: typeof import('../../modules/situational/situational-final-submit.service')
const suffix = randomUUID()
const actor = { userId: 'q1-teacher-' + suffix, role: UserRole.TEACHER }
const other = { userId: 'q1-other-' + suffix, role: UserRole.TEACHER }
const student = 'q1-student-' + suffix
const student2 = 'q1-student2-' + suffix
let course1: string, course2: string, scaleId: string, assignmentId: string, configId: string
const fresh = (extra: Record<string, unknown> = {}) => product.create(actor, { requestId: randomUUID(), name: 'Four-type questionnaire', questionnaireType: 'COURSE', courseIds: [course1, course2], ...extra })
async function add(row: any, item: any) { return product.addItem(actor, row.id, { revision: row.revision, item }) }
async function mixed(extra: Record<string, unknown> = {}) {
  let row = await fresh(extra)
  row = await add(row, { type: 'FORM', formType: 'text_input', formLabel: '学习目标', required: true })
  row = await add(row, { type: 'SCALE', scaleId, required: true })
  row = await add(row, { type: 'COGNITIVE', cognitiveAssignmentId: assignmentId, required: true })
  row = await add(row, { type: 'SITUATIONAL', situationalInstrumentKey: sjt.key, situationalInstrumentVersion: sjt.instrumentVersion, required: true })
  return row
}
suite('Four-type Questionnaire production lifecycle', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    db = new PrismaClient({ datasources: { db: { url } } })
    await db.$connect()
    product = await import('../../modules/questionnaire-product/service')
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
    const entry = requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0')
    const freeze = freezeAssignmentProfile({ entry, profile: 'standard', baseConfig: { totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'} } })
    const config = await db.cognitiveTestConfig.upsert({
      where: { testType_configVersion: { testType:'gonogo',configVersion:'1.0.0' } }, update: {},
      create: { testType:'gonogo',configVersion:'1.0.0',name:'Q1 fixture',config:freeze.resolvedConfig as any,status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN',publishedAt:new Date() },
    })
    configId=config.id
    assignmentId=(await db.cognitiveAssignment.create({ data: { configId,courseId:course1,createdBy:actor.userId,title:'Go/No-Go fixture',status:'PUBLISHED',listedStandalone:true,...freezeDataForWrite(freeze) } })).id
    scaleId=(await db.scale.create({ data: { code:'Q1-'+suffix,name:'Scale fixture',creatorId:actor.userId,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:MIXED_SCALE_DEFINITION as any,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),itemCount:1,dimensionCount:1 } })).id
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
    await db.cognitiveRawSubmission.deleteMany({where:{session:{assignmentId}}})
    await db.cognitiveSession.deleteMany({where:{assignmentId}})
    await db.cognitiveAssignment.deleteMany({where:{createdBy:{in:[actor.userId,other.userId]}}})
    await db.scale.deleteMany({where:{creatorId:actor.userId}})
    await db.course.deleteMany({where:{creatorId:actor.userId}})
    await db.user.deleteMany({where:{id:{in:[actor.userId,other.userId,student,student2]}}})
    await db.$disconnect()
  },60000)

  it('creates once under concurrent idempotent requests and rejects changed payload', async () => {
    const input={requestId:randomUUID(),name:'idempotent',questionnaireType:'COURSE',courseIds:[course1]}
    const [a,b]=await Promise.all([product.create(actor,input),product.create(actor,input)])
    expect(a.id).toBe(b.id)
    await expect(product.create(actor,{...input,name:'changed'})).rejects.toMatchObject({statusCode:409})
  })
  it('rejects unauthorized editors, foreign courses and synthesis injection', async () => {
    const row=await fresh()
    await expect(product.detail(other,row.id)).rejects.toMatchObject({statusCode:403})
    await expect(product.create(other,{requestId:randomUUID(),name:'foreign',questionnaireType:'COURSE',courseIds:[course1]})).rejects.toMatchObject({statusCode:403})
    await expect(fresh({reportPackage:{key:'fake'}})).rejects.toBeDefined()
    await expect(db.compositeAssessment.update({where:{id:row.id},data:{reportPackageKey:'fake'}})).rejects.toBeDefined()
    await expect(runtime.setCompositeReportPackage(actor.userId,actor.role,row.id,{reportPackage:null})).rejects.toBeDefined()
  })
  it('serializes competing edits and leaves only the successful mutation', async () => {
    const row=await fresh()
    const results=await Promise.allSettled([add(row,{type:'FORM',formType:'text_input',formLabel:'A'}),add(row,{type:'FORM',formType:'text_input',formLabel:'B'})])
    expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(1)
    expect(await db.compositeAssessmentItem.count({where:{compositeAssessmentId:row.id}})).toBe(1)
    expect((await product.detail(actor,row.id)).revision).toBe(1)
  })
  it('validates four-type ordering and prevents published mutation', async () => {
    let row=await mixed()
    const units=[...row.units].reverse().map((v:any)=>({id:v.id,type:v.type==='form-section'?'FORM_SECTION':v.type.toUpperCase()}))
    row=await product.reorder(actor,row.id,{revision:row.revision,units})
    expect(row.units.map((v:any)=>v.id)).toEqual(units.map((v:any)=>v.id))
    row=await product.publish(actor,row.id,{revision:row.revision})
    expect(row.status).toBe('PUBLISHED')
    await expect(add(row,{type:'FORM',formType:'text_input',formLabel:'late'})).rejects.toMatchObject({statusCode:409})
  },30000)
  it('binds each enrolled student to their own course and freezes the profile', async () => {
    let row=await mixed()
    row=await product.publish(actor,row.id,{revision:row.revision})
    for (const [userId,courseId] of [[student,course1],[student2,course2]]) {
      const started=await runtime.startUserAttempt(userId,row.id)
      const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}})
      const child=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:parent.id},include:{assignment:true}})
      expect(parent.deliveryCourseId).toBe(courseId)
      expect(child.assignment!.courseId).toBe(courseId)
      expect(child.assignment!.resolvedConfigHash).toBeTruthy()
      expect((await runtime.startUserAttempt(userId,row.id)).attempt.id).toBe(parent.id)
    }
    await expect(runtime.startUserAttempt(other.userId,row.id)).rejects.toMatchObject({statusCode:403})
    expect((await product.available(student2)).some(v=>v.id===row.id)).toBe(true)
  },30000)
  it('completes four independent FINALs and never creates synthesis', async () => {
    let row=await mixed()
    row=await product.publish(actor,row.id,{revision:row.revision})
    const started=await runtime.startUserAttempt(student,row.id)
    const attemptId=started.attempt.id
    const form=started.attempt.currentItem as any
    expect(form.type).toBe('FORM_SECTION')
    const section=row.formSections[0]
    await forms.submitCompositeFormSectionFinal({attemptId,sectionId:section.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:section.items.map((i:any)=>({formItemId:i.id,value:'学习'}))})
    const scale=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
    const scaleInput={assessmentId:scale.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes'}],userId:student}
    await scaleSubmit.submitScaleAssessmentFinal(scaleInput)
    expect(await scaleSubmit.submitScaleAssessmentFinal(scaleInput)).toMatchObject({replayed:true})
    const cog=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:attemptId},include:{assignment:true}})
    await cogSubmit.submitCognitiveSessionFinal(student,{sessionId:cog.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:cog.assignment!.resolvedConfigHash!,contextSnapshotHash:null,
      trials:gonogoSequence(cog.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))})
    const child=await db.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
    await sjtSubmit.submitSituationalAttemptFinal({
      attemptId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:child.definitionHash,instrumentVersion:child.instrumentVersion,compiledRuntimeHash:child.compiledRuntimeHash,scoringVersion:child.scoringVersion,
      responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}],
      embedded:{compositeAttemptId:attemptId,compositeItemId:child.compositeItemId!,compositeSlotKey:compositeItemSlotKey(child.compositeItemId!,'SITUATIONAL'),userId:student},
    })
    expect(await runtime.getAttemptState(attemptId,{userId:student})).toMatchObject({status:'COMPLETED',progress:100,completedItems:4})
    const report=await runtime.getReport(attemptId,{userId:student})
    expect(report).toMatchObject({productKind:'QUESTIONNAIRE',reportMode:'COLLECTION_ONLY'})
    expect(report.unitReports.find((v:any)=>v.type==='SCALE').reportKind).not.toBe('unavailable')
    expect(report.unitReports.map((v:any)=>v.type).sort()).toEqual(['COGNITIVE','SCALE','SITUATIONAL'])
    expect(await db.compositeAnalysisSnapshot.count({where:{attemptId}})).toBe(0)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}})).toBe(4)
    await expect(runtime.getAnalysisExportForParticipant(attemptId,{userId:student})).rejects.toBeDefined()
    const exported=await product.exportReports(actor,row.id,{})
    expect(exported.reports).toHaveLength(1)
    expect(exported.reports[0].unitReports.map((v:any)=>v.type).sort()).toEqual(['COGNITIVE','SCALE','SITUATIONAL'])
    expect(exported.next).toBeNull()
    await expect(product.exportReports(other,row.id,{})).rejects.toMatchObject({statusCode:403})
    const original=JSON.stringify(report)
    await product.archive(actor,row.id,{revision:row.revision})
    await db.scale.update({where:{id:scaleId},data:{status:'DRAFT'}})
    try {
      expect(JSON.stringify(await runtime.getReport(attemptId,{userId:student}))).toBe(original)
      expect((await runtime.getReportForTeacher(actor.userId,actor.role,row.id,attemptId)).unitReports).toHaveLength(3)
    } finally { await db.scale.update({where:{id:scaleId},data:{status:'PUBLISHED'}}) }
  },60000)
  it('enforces the last anonymous slot atomically and preserves scoped report recovery after closure', async () => {
    let row=await fresh({questionnaireType:'GENERAL',courseIds:[],publicEnabled:true,expiresAt:new Date(Date.now()+86400000).toISOString()})
    row=await add(row,{type:'FORM',formType:'text_input',formLabel:'Anonymous response'})
    row=await product.publish(actor,row.id,{revision:row.revision})
    const expiry=new Date(Date.now()+3600000).toISOString()
    await expect(runtime.createAccessTokenForComposite(actor.userId,actor.role,row.id,'invalid',1)).rejects.toBeDefined()
    const token=await runtime.createAccessTokenForComposite(actor.userId,actor.role,row.id,expiry,1)
    const stored=await db.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})
    expect(stored.token).toBeNull()
    expect(stored.tokenHash).toBeTruthy()
    expect(stored.tokenEncrypted).toBeTruthy()
    expect((await runtime.listAccessTokens(actor.userId,actor.role,row.id)).find(v=>v.id===token.id)?.token).toBeNull()
    expect((await runtime.revealAccessToken(actor.userId,actor.role,row.id,token.id)).token).toBe(token.token)
    await expect(runtime.revealAccessToken(other.userId,other.role,row.id,token.id)).rejects.toBeDefined()
    await expect(runtime.createAccessTokenForComposite(actor.userId,actor.role,row.id,new Date(Date.now()+366*86400000).toISOString(),1)).rejects.toBeDefined()
    await expect(runtime.listAccessTokens(other.userId,other.role,row.id)).rejects.toBeDefined()
    await expect(runtime.disableAccessToken(other.userId,other.role,row.id,token.id)).rejects.toBeDefined()
    const starts=await Promise.allSettled([runtime.startPublicAttempt(token.token!),runtime.startPublicAttempt(token.token!)])
    expect(starts.filter(v=>v.status==='fulfilled')).toHaveLength(1)
    const winner=starts.find(v=>v.status==='fulfilled')!
    if(winner.status!=='fulfilled') throw new Error('Missing successful attempt')
    const result=winner.value
    const attemptId=result.attempt.id
    const recoveryTokenHash=hashRecoveryToken(result.recoveryToken!)
    expect((await db.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount).toBe(1)
    expect((await runtime.startPublicAttempt(token.token!,result.recoveryToken!)).attempt.id).toBe(attemptId)
    const secondToken=await runtime.createAccessTokenForComposite(actor.userId,actor.role,row.id,expiry,1)
    const second=await runtime.startPublicAttempt(secondToken.token!)
    await expect(runtime.getAttemptState(attemptId,{recoveryTokenHash:hashRecoveryToken(second.recoveryToken!)})).rejects.toBeDefined()
    await expect(runtime.startPublicAttempt(token.token!,second.recoveryToken!)).rejects.toBeDefined()
    const section=row.formSections[0]
    await forms.submitCompositeFormSectionFinal({attemptId,sectionId:section.id,recoveryTokenHash,
      submissionId:randomUUID(),attemptEpoch:1,definitionHash:(result.attempt.currentItem as any).definitionHash,
      answers:section.items.map((i:any)=>({formItemId:i.id,value:'Completed anonymously'}))})
    expect(await runtime.getAttemptState(attemptId,{recoveryTokenHash})).toMatchObject({status:'COMPLETED'})
    const report=await runtime.getReport(attemptId,{recoveryTokenHash})
    expect(report).toMatchObject({productKind:'QUESTIONNAIRE',reportMode:'COLLECTION_ONLY'})
    await expect(runtime.getReport(attemptId,{recoveryTokenHash:hashRecoveryToken(second.recoveryToken!)})).rejects.toBeDefined()
    await expect(runtime.getReport(attemptId,{})).rejects.toBeDefined()
    await runtime.disableAccessToken(actor.userId,actor.role,row.id,token.id)
    await db.compositeAssessmentAccessToken.update({where:{id:token.id},data:{expiresAt:new Date(Date.now()-1000)}})
    await expect(runtime.startPublicAttempt(token.token!)).rejects.toBeDefined()
    expect((await runtime.startPublicAttempt(token.token!,result.recoveryToken!)).attempt.status).toBe('COMPLETED')
    expect(await runtime.getReport(attemptId,{recoveryTokenHash})).toEqual(report)
  },30000)
  it('returns an anonymous cognitive result through the original capability after the final slot closes', async () => {
    const publicRuntime=await import('../../modules/cognitive/public.service')
    const token=await publicRuntime.createAccessTokenForAssignment(actor.userId,actor.role,assignmentId,new Date(Date.now()+3600000).toISOString(),1)
    expect((await publicRuntime.listAccessTokens(actor.userId,actor.role,assignmentId)).find(v=>v.id===token.id)?.token).toBeNull()
    expect((await publicRuntime.revealAccessToken(actor.userId,actor.role,assignmentId,token.id)).token).toBe(token.token)
    await expect(publicRuntime.revealAccessToken(other.userId,other.role,assignmentId,token.id)).rejects.toBeDefined()
    await expect(publicRuntime.createAccessTokenForAssignment(actor.userId,actor.role,assignmentId,new Date(Date.now()+366*86400000).toISOString(),1)).rejects.toBeDefined()
    const started=await publicRuntime.startPublicSession(token.token!)
    await expect(publicRuntime.startPublicSession(token.token!)).rejects.toBeDefined()
    const session=await db.cognitiveSession.findUniqueOrThrow({where:{id:started.session.sessionId},include:{assignment:true}})
    const input={submissionId:randomUUID(),attemptEpoch:1,definitionHash:session.assignment!.resolvedConfigHash!,contextSnapshotHash:null,
      trials:gonogoSequence(session.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))}
    await publicRuntime.submitSessionFinal(session.id,started.recoveryToken!,input)
    expect(await publicRuntime.submitSessionFinal(session.id,started.recoveryToken!,input)).toMatchObject({replayed:true})
    const report=await publicRuntime.getSession(session.id,started.recoveryToken!)
    expect(report.status).toBe('COMPLETED')
    expect(report.result).toBeTruthy()
    await publicRuntime.disableAccessToken(actor.userId,actor.role,assignmentId,token.id)
    expect((await publicRuntime.startPublicSession(token.token!,started.recoveryToken!)).session.status).toBe('COMPLETED')
    await expect(publicRuntime.getSession(session.id,'x'.repeat(32))).rejects.toBeDefined()
    expect((await db.cognitiveSession.findUniqueOrThrow({where:{id:session.id}})).userId).toBeNull()
  },30000)
  it('restarts with a new epoch, rejects the old FINAL and keeps existing reads when creation closes', async () => {
    let row=await fresh()
    row=await add(row,{type:'FORM',formType:'text_input',formLabel:'Restart field'})
    row=await product.publish(actor,row.id,{revision:row.revision})
    const original=await runtime.startUserAttempt(student,row.id)
    const originalItem=original.attempt.currentItem as any
    const restarted=await runtime.restartUserAttempt(student,original.attempt.id)
    expect(restarted.attempt.id).not.toBe(original.attempt.id)
    expect(restarted.attempt.attemptEpoch).toBe(2)
    await expect(forms.submitCompositeFormSectionFinal({attemptId:original.attempt.id,sectionId:row.formSections[0].id,userId:student,
      submissionId:randomUUID(),attemptEpoch:1,definitionHash:originalItem.definitionHash,
      answers:row.formSections[0].items.map((i:any)=>({formItemId:i.id,value:'stale'}))})).rejects.toBeDefined()
    process.env.QUESTIONNAIRE_PRODUCTS_ENABLED='false'
    try {
      await expect(fresh()).rejects.toMatchObject({statusCode:409})
      expect((await runtime.getAttemptState(restarted.attempt.id,{userId:student})).status).toBe('IN_PROGRESS')
      expect((await product.detail(actor,row.id)).id).toBe(row.id)
    } finally { delete process.env.QUESTIONNAIRE_PRODUCTS_ENABLED }
  },30000)
  it('allows administrator authoring and rejects a retired resource at publication', async () => {
    const admin={userId:actor.userId,role:UserRole.ADMIN}
    let row=await product.create(admin,{requestId:randomUUID(),name:'Admin authored',questionnaireType:'COURSE',courseIds:[course1]})
    row=await product.addItem(admin,row.id,{revision:row.revision,item:{type:'SCALE',scaleId}})
    await db.scale.update({where:{id:scaleId},data:{status:'DRAFT'}})
    try {
      await expect(product.publish(admin,row.id,{revision:row.revision})).rejects.toBeDefined()
      expect((await product.detail(admin,row.id)).revision).toBe(row.revision)
    } finally { await db.scale.update({where:{id:scaleId},data:{status:'PUBLISHED'}}) }
    expect((await product.publish(admin,row.id,{revision:row.revision})).status).toBe('PUBLISHED')
  },30000)
  it('copies legacy definitions without changing legacy history or identity', async () => {
    const old=await db.questionnaire.create({data:{code:'Q1-old-'+suffix,name:'Legacy',creatorId:actor.userId,formItems:{create:{type:'text_input',label:'Old form',position:0}}}})
    const before=await db.questionnaire.findUnique({where:{id:old.id},include:{formItems:true}})
    const copied=await product.copy(actor,old.id,{requestId:randomUUID()})
    expect(copied.id).not.toBe(old.id)
    expect(copied.productKind).toBe('QUESTIONNAIRE')
    expect(await db.questionnaire.findUnique({where:{id:old.id},include:{formItems:true}})).toEqual(before)
    expect((await product.list(actor,1,100)).list.some(v=>v.id===old.id&&v.kind==='LEGACY')).toBe(true)
  })
  it('allows two slots of the same scale without conflating identity', async () => {
    let row=await fresh()
    row=await add(row,{type:'SCALE',scaleId})
    row=await add(row,{type:'SCALE',scaleId})
    row=await product.publish(actor,row.id,{revision:row.revision})
    const started=await runtime.startUserAttempt(student,row.id)
    const children=await db.assessment.findMany({where:{compositeAttemptId:started.attempt.id}})
    expect(children).toHaveLength(2)
    expect(new Set(children.map(v=>v.compositeItemId)).size).toBe(2)
    await Promise.all(children.map((child,index)=>scaleSubmit.submitScaleAssessmentFinal({
      assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:1,
      definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,
      answers:[{itemCode:'mixed-scale-item-1',responseValue:index?'no':'yes'}],userId:student,
    })))
    // FINAL persists each canonical unit; authorized state reads reconcile the parent.
    const states=await Promise.all([runtime.getAttemptState(started.attempt.id,{userId:student}),runtime.getAttemptState(started.attempt.id,{userId:student})])
    expect(states.every(v=>v.status==='COMPLETED'&&v.progress===100)).toBe(true)
    const report=await runtime.getReport(started.attempt.id,{userId:student})
    expect(report.unitReports).toHaveLength(2)
    expect(new Set(report.unitReports.map((v:any)=>v.itemId)).size).toBe(2)
    expect((await runtime.getAttemptState(started.attempt.id,{userId:student})).progress).toBe(100)
    expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:started.attempt.id}})).toBe(2)
  },30000)
  it('copies a published four-type product and can publish the new draft', async () => {
    let row=await mixed()
    row=await product.publish(actor,row.id,{revision:row.revision})
    const copy=await product.copy({userId:other.userId,role:UserRole.ADMIN},row.id,{requestId:randomUUID()})
    expect(copy.status).toBe('DRAFT')
    expect((await product.publish({userId:other.userId,role:UserRole.ADMIN},copy.id,{revision:copy.revision})).status).toBe('PUBLISHED')
  },30000)
})
