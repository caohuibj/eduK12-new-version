import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import bcrypt from '../backend/node_modules/bcryptjs'
import { PrismaClient } from '../backend/node_modules/@prisma/client'
import { MIXED_SCALE_DEFINITION } from '../backend/src/__tests__/questionnaire/product-fixtures'
import { hashScaleDefinition } from '../backend/src/modules/scale/scale-definition'
import { freezeAssignmentProfile, freezeDataForWrite } from '../backend/src/modules/cognitive/profile-freeze'
import { requireCognitiveRegistryEntry } from '../backend/src/modules/cognitive/cognitive.registry'

async function main() {
 const selected = process.env.TRAINING_TEST_DATABASE_URL
 if (process.env.NODE_ENV !== 'test' || !selected || selected !== process.env.DATABASE_URL ||
     !process.env.DATA_ENCRYPTION_KEY || !process.env.DATA_PSEUDONYM_KEY || !['localhost', '127.0.0.1'].includes(new URL(selected).hostname) || !process.env.TRAINING_FIXTURE_FILE) {
  throw new Error('Explicit isolated loopback TRAINING_TEST_DATABASE_URL and fixture output required')
 }
 const db = new PrismaClient(), suffix = randomUUID().replaceAll('-', '').slice(0, 8)
 const password = 'TrainingSynthetic2026', passwordHash = await bcrypt.hash(password, 10)
 try {
  const users: Record<string, { id: string; username: string; password: string }> = {}
  for (const [key, role, nickname] of [['trainer','TEACHER','王培训师'],['learner','STUDENT','李学员'],['outsider','TEACHER','课程外培训师'],['admin','ADMIN','培训管理员']] as const) {
   const user = await db.user.create({ data: { username: 'Train'+key+suffix, passwordHash, role, nickname,
    teacherApproved: true, platformRole: key === 'admin' ? 'SYSTEM_ADMIN' : 'STANDARD' } })
   users[key] = { id: user.id, username: user.username, password }
  }
  const course = await db.course.create({ data: { title: '教师专业发展研修', description: '阅读、实践与反思，让每一步学习都有回响。', creatorId: users.trainer.id, courseCode: 'P'+suffix.toUpperCase(), status: 'PUBLISHED' } })
  const other = await db.course.create({ data: { title: '课堂沟通与协作', creatorId: users.outsider.id, courseCode: 'I'+suffix.toUpperCase(), status: 'PUBLISHED' } })
  await db.courseStudent.create({ data: { courseId: course.id, studentId: users.learner.id, status: 'ACTIVE' } })
  const assignment = await db.assignment.create({ data: { courseId: course.id, title: '第一周教学反思', description: '结合本周课堂经验，写下一个新的发现。', content: '请记录一次课堂实践，并提出下一步改进计划。', questions: [], status: 'PUBLISHED' } })
  const checkin = await db.checkin.create({ data: { courseId: course.id, creatorId: users.trainer.id, title: '每日阅读打卡', description: '记录今天的阅读与思考。', content: '写下今天读到的一句话，以及它给你的启发。' } })
  const scaleData = { creatorId: users.admin.id, status: 'PUBLISHED' as const, visibility: 'COURSE' as const,
   instrumentClass: 'CUSTOM_DESCRIPTIVE' as const, instrumentVersion: '2.0.0', definition: MIXED_SCALE_DEFINITION as any,
   definitionHash: hashScaleDefinition(MIXED_SCALE_DEFINITION), itemCount: 1, dimensionCount: 1 }
  const scale = await db.scale.create({ data: { ...scaleData, code: 'training-scale-'+suffix, name: '学习实践自评（测试）' } })
  const ownScale = await db.scale.create({ data: { ...scaleData, creatorId: users.trainer.id, code: 'training-owned-'+suffix, name: '个人学习自评（测试）' } })
  const unrelated = await db.scale.create({ data: { ...scaleData, code: 'training-other-'+suffix, name: '其他课程量表（测试）', courseScales: { create: { courseId: other.id } } } })
  const publicScale = await db.scale.create({ data: { ...scaleData, code: 'training-public-'+suffix, name: '未投放的公开量表（测试）', visibility: 'PUBLIC' } })
  const entry = requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0')
  const freeze = freezeAssignmentProfile({ entry, profile: 'standard', baseConfig: { totalTrials: 120, nogoRatio: .25, stimulusMs: 800, isiMs: 500, validRtFloorMs: 100, report: { reportVersion: '1.0.0', referenceMode: 'none' } } })
  const config = await db.cognitiveTestConfig.upsert({ where: { testType_configVersion: { testType: 'gonogo', configVersion: '1.0.0' } }, update: {},
   create: { testType: 'gonogo', configVersion: '1.0.0', name: 'Go/No-Go 隔离测试', config: freeze.resolvedConfig as any, status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.0.0', accessPolicy: 'OPEN', publishedAt: new Date() } })
  const cognitive = await db.cognitiveAssignment.create({ data: { configId: config.id, courseId: course.id, createdBy: users.trainer.id, title: '注意控制练习（测试）', status: 'PUBLISHED', listedStandalone: true, ...freezeDataForWrite(freeze) } })
  const internal = await db.cognitiveAssignment.create({ data: { configId: config.id, courseId: course.id, createdBy: users.trainer.id, title: '问卷内部认知（测试）', status: 'PUBLISHED', listedStandalone: false, ...freezeDataForWrite(freeze) } })
  await writeFile(process.env.TRAINING_FIXTURE_FILE!, JSON.stringify({ users, suffix, courseId: course.id, courseCode: course.courseCode, otherCourseId: other.id, otherCourseCode: other.courseCode,
   assignmentId: assignment.id, checkinId: checkin.id, scaleId: scale.id, ownScaleId: ownScale.id, unrelatedScaleId: unrelated.id, publicScaleId: publicScale.id, cognitiveId: cognitive.id, internalCognitiveId: internal.id }, null, 2), { mode: 0o600 })
  console.log('Created isolated synthetic training fixtures; scientific definitions unchanged.')
 } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
