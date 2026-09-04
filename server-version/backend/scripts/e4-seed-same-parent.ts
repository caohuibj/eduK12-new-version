/**
 * E4 same-parent seeder — creates ONE questionnaire assessment (single parent)
 * with N distinct form sections, each a different child/submissionId sharing
 * the same parent. Enables true same-parent contention (2/10/50).
 * Writes only the sameParent group + auth headers to a JSON file.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import {
  ensureQuestionnaireFormSections,
  listQuestionnaireFormSections,
} from '../src/services/questionnaire-form-section.service'

const OUT_DIR = process.env.FIXTURE_OUT_DIR || '/tmp/eduk12-gate47-e4-same'
const CHILD_N = Number(process.env.SAME_PARENT_CHILD_COUNT || 50)
const JWT_SECRET = process.env.JWT_SECRET!
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'gate47admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gate47AdminPass!'
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'

const prisma = new PrismaClient()

async function upsertUser(username: string, password: string, role: 'ADMIN' | 'STUDENT') {
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      role,
      nickname: username,
      isActive: true,
      mustChangePassword: false,
      teacherApproved: true,
    },
    update: {
      passwordHash,
      role,
      isActive: true,
      mustChangePassword: false,
      isFrozen: false,
      tokenVersion: 0,
    },
  })
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const admin = await upsertUser(ADMIN_USERNAME, ADMIN_PASSWORD, 'ADMIN')
  const student = await upsertUser(STUDENT_USERNAME, STUDENT_PASSWORD, 'STUDENT')

  const csrf = randomBytes(32).toString('base64url')
  const token = jwt.sign(
    {
      userId: student.id,
      username: student.username,
      role: student.role,
      tokenVersion: student.tokenVersion,
      mustChangePassword: false,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
  const headers = {
    Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
    'x-csrf-token': csrf,
    'Content-Type': 'application/json',
  }

  const runId = randomUUID().slice(0, 8)
  const questionnaire = await prisma.questionnaire.create({
    data: {
      code: `G47-Q-SAME-${runId}`,
      name: `Gate47 same-parent ${runId} (${CHILD_N} children)`,
      creatorId: admin.id,
      type: 'COURSE',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
  })

  for (let s = 0; s < CHILD_N; s += 1) {
    await prisma.questionnaireFormSection.create({
      data: {
        questionnaireId: questionnaire.id,
        title: `区段 ${s + 1}`,
        position: s,
        contextSection: false,
      },
    })
    await prisma.questionnaireFormItem.create({
      data: {
        questionnaireId: questionnaire.id,
        sectionId: (await prisma.questionnaireFormSection.findFirst({
          where: { questionnaireId: questionnaire.id, position: s },
        }))!.id,
        sectionPosition: 0,
        type: 'text_input',
        label: `字段 ${s + 1}`,
        required: true,
        position: s,
      },
    })
  }

  const assessment = await prisma.questionnaireAssessment.create({
    data: {
      questionnaireId: questionnaire.id,
      userId: student.id,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1,
      progress: 0,
    },
  })

  await ensureQuestionnaireFormSections(questionnaire.id)
  const sections = await listQuestionnaireFormSections(questionnaire.id)
  if (sections.length !== CHILD_N) {
    throw new Error(`expected ${CHILD_N} mapped sections, got ${sections.length}`)
  }

  const sameParentRequests = sections.map((mapped, idx) => ({
    fixtureId: `perf-same-parent-child-${String(idx + 1).padStart(4, '0')}`,
    instrument: 'form',
    parentKey: 'perf-parent-contention-0001',
    method: 'POST',
    path: `/api/questionnaires/assessments/${assessment.id}/form-sections/${mapped.id}/submit`,
    headers,
    body: {
      submissionId: `g47-same-${runId}-${idx + 1}`,
      attemptEpoch: 1,
      definitionHash: mapped.definitionHash,
      contextSnapshotHash: null,
      answers: mapped.items.map((it) => ({ formItemId: it.id, value: `same-${it.id}` })),
    },
  }))

  const fixturesPath = `${OUT_DIR}/same-parent-fixtures.json`
  writeFileSync(fixturesPath, JSON.stringify({ sameParent: sameParentRequests }))
  writeFileSync(`${OUT_DIR}/ledger.json`, JSON.stringify({
    runId,
    parentQuestionnaireId: questionnaire.id,
    parentAssessmentId: assessment.id,
    childCount: CHILD_N,
    createdAt: new Date().toISOString(),
  }, null, 2))
  writeFileSync(`${OUT_DIR}/auth.env`, [
    `PERF_AUTH_TOKEN=${token}`,
    `PERF_CSRF_TOKEN=${csrf}`,
    `PERF_STUDENT_USERNAME=${STUDENT_USERNAME}`,
    `PERF_STUDENT_PASSWORD=${STUDENT_PASSWORD}`,
    `PERF_STUDENT_ID=${student.id}`,
    '',
  ].join('\n'), { mode: 0o600 })

  console.log(JSON.stringify({
    fixturesPath,
    parentAssessmentId: assessment.id,
    childCount: CHILD_N,
    adminId: admin.id,
    studentId: student.id,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
