import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import bcrypt from '../backend/node_modules/bcryptjs'

import { createAccessToken } from '../backend/src/services/anonymousAccess'
import { encryptPublicAccessToken, hashPublicAccessToken } from '../backend/src/services/publicAccessTokenCrypto'
import { SITUATIONAL_STATIC_VISUAL_E2E_ASSETS } from '../backend/src/modules/situational/packages/sjt-static-visual-e2e-fixture'
import { SJT_BRANCHING_E2E_PACKAGE } from '../backend/src/modules/situational/packages/sjt-branching-e2e-fixture'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()

const instrumentKey = SJT_BRANCHING_E2E_PACKAGE.key
const instrumentVersion = SJT_BRANCHING_E2E_PACKAGE.instrumentVersion
const password = process.env.SITUATIONAL_BRANCHING_E2E_PASSWORD || 'SituationalBranchingE2E2026'
const fixturePath = process.env.SITUATIONAL_BRANCHING_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-branching-fixture.json'
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const staticVisualFixturePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
const teacherUsername = `situational_branching_teacher_${suffix}`
const studentUsername = `situational_branching_student_${suffix}`
const courseCode = `SITUATIONAL_BRANCHING_E2E_${suffix}`
const compositeCode = `SITUATIONAL_BRANCHING_E2E_${suffix}`

const seedVisualAssets = async () => {
  for (const asset of Object.values(SITUATIONAL_STATIC_VISUAL_E2E_ASSETS)) {
    const objectKey = `assets/${asset.assetId}.png`
    const filePath = path.resolve(uploadRoot, objectKey)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, staticVisualFixturePng)
    await prisma.storedAsset.upsert({
      where: { id: asset.assetId },
      update: {
        objectKey,
        provider: 'local',
        mimeType: asset.mimeType,
        sizeBytes: staticVisualFixturePng.length,
        sha256: asset.contentHash,
        originalName: `${asset.assetId}.png`,
        accessScope: 'PRIVATE',
        scopeId: null,
        deletedAt: null,
      },
      create: {
        id: asset.assetId,
        objectKey,
        provider: 'local',
        mimeType: asset.mimeType,
        sizeBytes: staticVisualFixturePng.length,
        sha256: asset.contentHash,
        originalName: `${asset.assetId}.png`,
        accessScope: 'PRIVATE',
      },
    })
  }
}

const main = async () => {
  const passwordHash = await bcrypt.hash(password, 10)
  await seedVisualAssets()

  const teacher = await prisma.user.create({
    data: {
      username: teacherUsername,
      passwordHash,
      role: 'TEACHER',
      nickname: 'SIT-V2-E Browser Teacher',
      teacherApproved: true,
      mustChangePassword: false,
    },
  })

  const student = await prisma.user.create({
    data: {
      username: studentUsername,
      passwordHash,
      role: 'STUDENT',
      nickname: 'SIT-V2-E Browser Student',
      mustChangePassword: false,
    },
  })

  const course = await prisma.course.create({
    data: {
      title: `SIT-V2-E Branching Bundle ${suffix}`,
      description: 'Isolated V2 branching browser acceptance fixture',
      courseCode,
      creatorId: teacher.id,
      status: 'PUBLISHED',
      isLibrary: false,
    },
  })

  await prisma.courseStudent.create({
    data: {
      courseId: course.id,
      studentId: student.id,
      status: 'ACTIVE',
    },
  })

  const composite = await prisma.compositeAssessment.create({
    data: {
      code: compositeCode,
      name: `SIT-V2-E Branching Bundle Browser ${suffix}`,
      description: 'One required V2 branching Situational unit for final browser acceptance',
      instruction: 'Complete the embedded branching pilot once.',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: teacher.id,
      publicEnabled: true,
      maxAttempts: 6,
      publishedAt: new Date(),
    },
  })

  const item = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SITUATIONAL',
      position: 0,
      required: true,
      situationalInstrumentKey: instrumentKey,
      situationalInstrumentVersion: instrumentVersion,
    },
  })

  const publicToken = createAccessToken()
  await prisma.compositeAssessmentAccessToken.create({
    data: {
      compositeAssessmentId: composite.id,
      token: null,
      tokenHash: hashPublicAccessToken(publicToken),
      tokenEncrypted: encryptPublicAccessToken(publicToken),
      createdBy: teacher.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      maxUses: 4,
      isActive: true,
    },
  })

  const fixture = {
    student: {
      username: student.username,
      password,
    },
    course: {
      id: course.id,
      title: course.title,
    },
    composite: {
      id: composite.id,
      name: composite.name,
    },
    item: {
      id: item.id,
      instrumentKey,
      instrumentVersion,
    },
    branching: {
      instrumentTitle: SJT_BRANCHING_E2E_PACKAGE.definition.source.title,
      reportHeadline: SJT_BRANCHING_E2E_PACKAGE.definition.report.interpretations[0]?.headline,
      scenes: {
        entry: '第一轮：发现数据被误读，你会怎么做？',
        diagnostic: '第一轮追问：你会怎样公开表达？',
        nested: '第一轮继续：对方仍坚持原判断，你会继续吗？',
        roundTwo: '第二轮：新的会议情境',
      },
      options: {
        longPath: 'A',
        earlyTerminal: 'B',
        directNested: 'C',
        nestedContinue: 'A',
        nestedTerminal: 'C',
      },
      optionalPrompt: '如果愿意补充，你对刚才判断有多大把握？',
    },
    visual: {
      image: {
        assetId: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.image.assetId,
        altText: '一组成员正在核对投影数据。',
      },
      comic: {
        panels: [
          { assetId: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelOne.assetId, altText: '漫画第一格：成员发现数据需要复核。' },
          { assetId: SITUATIONAL_STATIC_VISUAL_E2E_ASSETS.comicPanelTwo.assetId, altText: '漫画第二格：成员提出重新确认。' },
        ],
      },
    },
    publicToken,
  }

  await mkdir(path.dirname(fixturePath), { recursive: true })
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    fixturePath,
    courseId: course.id,
    compositeId: composite.id,
    itemId: item.id,
    studentUsername: student.username,
    instrumentKey,
    instrumentVersion,
    publicTokenCreated: true,
  }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
