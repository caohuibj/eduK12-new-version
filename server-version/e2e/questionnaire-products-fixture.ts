import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import bcrypt from '../backend/node_modules/bcryptjs'
import { PrismaClient, UserRole } from '../backend/node_modules/@prisma/client'
import { MIXED_SCALE_DEFINITION } from '../backend/src/__tests__/questionnaire/product-fixtures'
import { hashScaleDefinition } from '../backend/src/modules/scale/scale-definition'
import { freezeAssignmentProfile, freezeDataForWrite } from '../backend/src/modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../backend/src/modules/cognitive/cognitive.registry'
import { changeEntryGrant } from '../backend/src/modules/admin-permissions/service'
import { prisma as authorityDb } from '../backend/src/config/database'
import {publishTrainingSourcesFixture,grantPublicScaleFixture} from '../backend/src/__tests__/fixtures/published-measurement'
const { assertSyntheticDatabase } = require('./helpers/synthetic-admin-session.cjs')

async function main() {
  if (process.env.NODE_ENV !== 'test' || !process.env.QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL ||
      process.env.QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL !== process.env.DATABASE_URL) {
    throw new Error('Use an explicitly isolated QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL with NODE_ENV=test')
  }
  assertSyntheticDatabase()
  if (process.env.TRAINING_OPTIONAL_WORK === 'copy-source') {
    const file = process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json'
    const fixture = JSON.parse(await readFile(file, 'utf8'))
    const db = new PrismaClient()
    try {
      const source = await db.questionnaire.create({ data: {
        code: 'legacy-copy-' + randomUUID(), name: 'Training历史选填复制验收', type: 'COURSE', status: 'PUBLISHED',
        creatorId: fixture.teacher.username, courseQuestionnaires: { create: { courseId: fixture.courses[0].id } },
      } })
      const types = ['text_input', 'fill_blank', 'single_choice', 'multiple_choice', 'year_month']
      const labels = ['必填反思', '选填填空', '选填单选', '选填多选', '选填年月']
      for (let i = 0; i < types.length; i++) {
        const section = await db.questionnaireFormSection.create({ data: { questionnaireId: source.id, title: '历史区段' + (i + 1), position: i, contextSection: false } })
        await db.questionnaireFormItem.create({ data: { questionnaireId: source.id, sectionId: section.id, sectionPosition: 0,
          type: types[i], label: labels[i], required: i === 0, position: i,
          ...(i === 2 || i === 3 ? { options: [{ value: 'a', label: '选项甲' }, { value: 'b', label: '选项乙' }] } : {}),
        } })
      }
      await writeFile(file, JSON.stringify({ ...fixture, legacyCopySource: { id: source.id, name: source.name } }), { mode: 0o600 })
    } finally { await db.$disconnect() }
    return
  }
  // Bounded real production workers for the Training browser scenario only.
  // They materialize HTTP-accepted work; they never write answers or bypass auth.
  if (process.env.TRAINING_OPTIONAL_WORK === 'reports') {
    const { claimCompositeReportJob } = await import('../backend/src/modules/assessment-runtime/report-outbox.service')
    const { processCompositeReportJob } = await import('../backend/src/workers/compositeReportWorker')
    for (let count = 0; count < 30; count++) {
      const job = await claimCompositeReportJob()
      if (!job) process.exit(0)
      await processCompositeReportJob(job)
    }
    throw new Error('Bounded report drain exceeded 30 jobs')
  }
  if (process.env.TRAINING_OPTIONAL_WORK === 'export') {
    const batchId = process.env.TRAINING_OPTIONAL_BATCH_ID
    if (!batchId || !/^[a-zA-Z0-9-]{1,100}$/.test(batchId)) throw new Error('Exact synthetic export batch required')
    const { runExportBatch } = await import('../backend/src/workers/exportBatchTask')
    await runExportBatch({ data: { batchId }, id: 'training-browser-' + batchId, opts: { attempts: 2 }, attemptsMade: 0 } as any)
    process.exit(0)
  }
  const db = new PrismaClient()
  const suffix = randomUUID()
  const actor = { userId: 'q1-browser-teacher-' + suffix, role: UserRole.TEACHER }
  const other = { userId: 'q1-browser-admin-' + suffix, role: UserRole.ADMIN }
  const student = 'q1-browser-student-' + suffix
  const student2 = 'q1-browser-student2-' + suffix
  let course1: string, course2: string, scaleId: string, assignmentId: string, configId: string
  const password = 'Q1BrowserSynthetic2026'
  const passwordHash = await bcrypt.hash(password, 10)
    for (const [id, role] of [[actor.userId, 'TEACHER'], [other.userId, 'ADMIN'], [student, 'STUDENT'], [student2, 'STUDENT']] as const) {
      await db.user.create({ data: { id, username: id, passwordHash, role, teacherApproved: true, mustChangePassword: false } })
    }
    // An old ADMIN label alone grants nothing. An unusable synthetic governor
    // supplies the explicit entry precondition through the audited grant service.
    const governor = await db.user.create({ data: { username: 'q1-browser-governor-' + suffix,
      passwordHash: 'unusable', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN', mustChangePassword: false } })
    try {
      await changeEntryGrant({ actorUserId: governor.id, actorSession: { tokenVersion: 0,
        adminVerifiedAt: Math.floor(Date.now() / 1000), adminSessionId: randomUUID() },
        targetUserId: other.userId, entry: 'TRAINING', active: true, expectedVersion: 0,
        reason: 'isolated questionnaire public-delivery business acceptance precondition' })
    } finally { await authorityDb.$disconnect() }
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
    // Exercise the existing exact publication/license services, including the
    // independent static SJT review. Status labels alone are not releases.
    await publishTrainingSourcesFixture(db,actor.userId,{scaleIds:[scaleId],assignmentIds:[assignmentId],
      situational:[{instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0'}]})
    await grantPublicScaleFixture(db,scaleId)

  await writeFile(process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json',
    JSON.stringify({ teacher: { username: actor.userId, password }, admin: { username: other.userId, password },
      student: { username: student, password }, courses: cs.map(v => ({id: v.id,title:v.title})), scaleId, assignmentId }), { mode: 0o600 })
  await db.$disconnect()
}
main().catch(error => { console.error(error); process.exitCode = 1 })
