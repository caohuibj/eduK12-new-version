/** Test-only scientific fixtures. Never imported by the application build. */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import bcrypt from '../backend/node_modules/bcryptjs'
import { prisma } from '../backend/src/config/database'
import type { RelationalProductEntryV1 } from '../backend/src/modules/assessment-relational/product-registry'

async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('PR5 fixture requires NODE_ENV=test')
  const suffix = randomUUID().slice(0, 8)
  const password = 'Pr5ScenarioPass2026!'
  const passwordHash = await bcrypt.hash(password, 10)
  const users: Record<string, any> = {}
  for (const name of ['platform', 'owner', 'parent', 'legacyTeacher', 'teacher0', 'teacher1', 'teacher2', 'student0', 'student1', 'student2', 'counselor0', 'counselor1', 'counselor2', 'client0', 'client1', 'client2']) {
    const role = name === 'platform' || name === 'counselor0' ? 'ADMIN' : name === 'parent' ? 'PARENT' : name === 'legacyTeacher' ? 'TEACHER' : 'STUDENT'
    const user = await prisma.user.create({ data: { username: `pr5_scenario_${name}_${suffix}`, passwordHash, role,
      platformRole: name === 'platform' ? 'SYSTEM_ADMIN' : 'STANDARD', teacherApproved: true, mustChangePassword: false } })
    users[name] = { id: user.id, username: user.username, password, role }
  }
  const composite = await prisma.compositeAssessment.create({ data: {
    code: `pr5-scenario-${suffix}`, name: 'PR5 隔离验收测评', status: 'PUBLISHED', createdBy: users.platform.id, publishedAt: new Date(),
  } })
  const item = await prisma.compositeAssessmentItem.create({ data: { compositeAssessmentId: composite.id,
    type: 'SITUATIONAL', position: 0, required: true, situationalInstrumentKey: 'sjt-assertiveness-golden', situationalInstrumentVersion: '1.0.0' } })
  const entries: RelationalProductEntryV1[] = []
  function resource(key: string, subject: any, respondent: any, relationship: any, protectedFeedback = false) {
    entries.push({ title: `PR5 ${key}`, description: 'Isolated acceptance fixture, not released scientific content',
      releaseStatus: 'PUBLISHED', scienceMaturity: 'PILOT', launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: composite.id },
      applicability: { schemaVersion: 1, resourceKind: 'BUNDLE', resourceKey: `pr5-${key}-${suffix}`, resourceVersion: '1.0.0',
        subjectRoles: [subject], respondentRoles: [respondent], relationshipKinds: [relationship],
        perspectives: [protectedFeedback ? 'RELATIONAL_EXPERIENCE' : relationship === 'SELF' ? 'SELF_REPORT' : 'OBSERVER_REPORT'],
        analysisMode: protectedFeedback ? 'COHORT_AGGREGATE' : 'INDIVIDUAL_ONLY',
        visibilityPolicyKey: protectedFeedback ? 'ORG_PROTECTED_FEEDBACK_V1' : ['PARENT', 'TEACHER'].includes(respondent) && relationship !== 'SELF' ? 'observer_assigning_teacher_v1' : 'ORG_SELF_V1',
        minimumRespondents: protectedFeedback ? 3 : null },
      cohortAnalysisPolicy: protectedFeedback ? { schemaVersion: 1, policyKey: 'pr5-test', policyVersion: '1.0.0', minimumRespondents: 3, metricKeys: ['bfi2.assertiveness.behavior'] } : null })
  }
  resource('teacher-self', 'TEACHER', 'TEACHER', 'SELF')
  resource('student-self', 'STUDENT', 'STUDENT', 'SELF')
  resource('teacher-student', 'STUDENT', 'TEACHER', 'CLASS_TEACHER_STUDENT')
  resource('parent-student', 'STUDENT', 'PARENT', 'PARENT_CHILD')
  resource('student-teacher', 'TEACHER', 'STUDENT', 'CLASS_TEACHER_STUDENT', true)
  resource('client-self', 'CLIENT', 'CLIENT', 'SELF')
  resource('counselor-self', 'COUNSELOR', 'COUNSELOR', 'SELF')
  resource('counselor-client', 'CLIENT', 'COUNSELOR', 'COUNSELOR_CLIENT')
  resource('client-counselor', 'COUNSELOR', 'CLIENT', 'COUNSELOR_CLIENT', true)
  resource('legacy-experience', 'TEACHER', 'STUDENT', 'COURSE_TEACHER_STUDENT', true)
  entries[entries.length - 1].applicability.visibilityPolicyKey = 'student_teacher_min_n_v1'
  const course = await prisma.course.create({ data: { title: 'PR5 legacy isolation', courseCode: `pr5-legacy-${suffix}`, creatorId: users.legacyTeacher.id, status: 'PUBLISHED' } })
  for (const name of ['student0', 'student1', 'student2']) await prisma.courseStudent.create({ data: { courseId: course.id, studentId: users[name].id, status: 'ACTIVE' } })
  const output = process.env.PR5_SCENARIOS_FIXTURE || '/tmp/eduk12-pr5-scenarios.json'
  writeFileSync(output, JSON.stringify({ suffix, users, courseId: course.id, compositeId: composite.id, itemId: item.id, entries }, null, 2))
  console.log(`PR5 scenario inputs written to ${output}`)
}
main().catch(err => { console.error(err); process.exitCode = 1 }).finally(() => prisma.$disconnect())
