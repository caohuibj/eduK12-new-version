import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import bcrypt from '../backend/node_modules/bcryptjs'
import { PrismaClient, UserRole } from '../backend/node_modules/@prisma/client'
import { MIXED_SCALE_DEFINITION } from '../backend/src/__tests__/questionnaire/product-fixtures'
import { hashScaleDefinition } from '../backend/src/modules/scale/scale-definition'
import { freezeAssignmentProfile, freezeDataForWrite } from '../backend/src/modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../backend/src/modules/cognitive/cognitive.registry'

async function main() {
  if (process.env.NODE_ENV !== 'test' || !process.env.QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL ||
      process.env.QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL !== process.env.DATABASE_URL) {
    throw new Error('Use an explicitly isolated QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL with NODE_ENV=test')
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

  await writeFile(process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json',
    JSON.stringify({ teacher: { username: actor.userId, password }, admin: { username: other.userId, password },
      student: { username: student, password }, courses: cs.map(v => ({id: v.id,title:v.title})), scaleId, assignmentId }), { mode: 0o600 })
  await db.$disconnect()
}
main().catch(error => { console.error(error); process.exitCode = 1 })
