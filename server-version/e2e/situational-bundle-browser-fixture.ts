import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import bcrypt from '../backend/node_modules/bcryptjs'

import { createAccessToken } from '../backend/src/services/anonymousAccess'
import { encryptPublicAccessToken, hashPublicAccessToken } from '../backend/src/services/publicAccessTokenCrypto'
import { SITUATIONAL_STATIC_VISUAL_E2E_ASSETS } from '../backend/src/modules/situational/packages/sjt-static-visual-e2e-fixture'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()

const useVisualFixture = process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE === 'true'
const instrumentKey = process.env.SITUATIONAL_BUNDLE_E2E_INSTRUMENT_KEY || (useVisualFixture ? 'sjt-static-visual-e2e-fixture' : 'sjt-assertiveness-golden')
const instrumentVersion = '1.0.0'
const password = process.env.SITUATIONAL_BUNDLE_E2E_PASSWORD || 'SituationalBundleE2E2026'
const fixturePath = process.env.SITUATIONAL_BUNDLE_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-bundle-fixture.json'
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const staticVisualFixturePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
const teacherUsername = `situational_bundle_teacher_${suffix}`
const studentUsername = `situational_bundle_student_${suffix}`
const courseCode = `SITUATIONAL_BUNDLE_E2E_${suffix}`
const compositeCode = `SITUATIONAL_BUNDLE_E2E_${suffix}`

const seedStaticVisualAssets = async () => {
  if (!useVisualFixture) return
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
  await seedStaticVisualAssets()

  const teacher = await prisma.user.create({
    data: {
      username: teacherUsername,
      passwordHash,
      role: 'TEACHER',
      nickname: useVisualFixture ? 'PR-E Browser Teacher' : 'PR-D Browser Teacher',
      teacherApproved: true,
      mustChangePassword: false,
    },
  })

  const student = await prisma.user.create({
    data: {
      username: studentUsername,
      passwordHash,
      role: 'STUDENT',
      nickname: useVisualFixture ? 'PR-E Browser Student' : 'PR-D Browser Student',
      mustChangePassword: false,
    },
  })

  const course = await prisma.course.create({
    data: {
      title: `${useVisualFixture ? 'PR-E' : 'PR-D'} Situational Bundle ${suffix}`,
      description: 'Isolated seeded browser acceptance fixture',
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
      name: `${useVisualFixture ? 'PR-E' : 'PR-D'} Situational Bundle Browser ${suffix}`,
      description: useVisualFixture ? 'One required static visual Situational unit for seeded browser acceptance' : 'One required Situational unit for seeded browser acceptance',
      instruction: useVisualFixture ? 'Complete the embedded static visual pilot once.' : 'Complete the embedded text pilot once.',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: teacher.id,
      publicEnabled: true,
      maxAttempts: 3,
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
      maxUses: 3,
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
    visual: useVisualFixture ? {
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
    } : null,
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
