import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from '../backend/node_modules/bcryptjs'
import { compileCognitiveRuntime } from '../backend/src/modules/assessment-runtime/compiler'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  retainAssessmentAssetReferences,
} from '../backend/src/modules/assessment-media/assessment-asset'
import { listCognitiveRegistryEntries } from '../backend/src/modules/cognitive/cognitive.registry'
import { encryptCognitivePayload, getParticipantKey } from '../backend/src/modules/cognitive/cognitive.security'
import {
  cognitivePresentationAssetReferences,
  parseCognitivePresentationDefinition,
} from '../backend/src/modules/cognitive/v2/presentation'
import { buildCognitiveV2TaskDefinition } from '../backend/src/modules/cognitive/v2/registry'
import { createSessionConfigSnapshot } from '../backend/src/modules/cognitive/v2/session-snapshot'
import { createRecoveryCredential } from '../backend/src/services/anonymousAccess'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()

const fixturePath = process.env.COGNITIVE_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-cognitive-video-fixture.json'
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const password = process.env.COGNITIVE_VIDEO_E2E_PASSWORD || 'CognitiveVideoE2E2026'
const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
const VIDEO_ID = `cognitive-video-e2e-video-${suffix}`
const POSTER_ID = `cognitive-video-e2e-poster-${suffix}`
const CAPTION_ID = `cognitive-video-e2e-caption-${suffix}`

const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

const persistAsset = async (params: {
  id: string
  fileName: string
  mimeType: string
  ownerId: string
  bytes?: Buffer
  sourcePath?: string
}) => {
  const objectKey = `assets/${params.fileName}`
  const filePath = path.resolve(uploadRoot, objectKey)
  await mkdir(path.dirname(filePath), { recursive: true })
  if (params.sourcePath) await writeFile(filePath, await readFile(params.sourcePath))
  else if (params.bytes) await writeFile(filePath, params.bytes)
  else throw new Error('fixture asset requires bytes or sourcePath')
  const bytes = await readFile(filePath)
  const contentHash = sha256(bytes)
  await prisma.storedAsset.create({
    data: {
      id: params.id,
      objectKey,
      provider: 'local',
      mimeType: params.mimeType,
      sizeBytes: (await stat(filePath)).size,
      sha256: contentHash,
      originalName: params.fileName,
      ownerId: params.ownerId,
      accessScope: 'PRIVATE',
    },
  })
  return { assetId: params.id, contentHash, mimeType: params.mimeType }
}

const main = async () => {
  const fakeEntry = listCognitiveRegistryEntries().find((entry) => entry.testType === 'fake')
  if (!fakeEntry) throw new Error('fake cognitive registry entry missing')
  const config = await prisma.cognitiveTestConfig.findFirst({
    where: {
      testType: fakeEntry.testType,
      engineVersion: fakeEntry.engineVersion,
      scoringVersion: fakeEntry.scoringVersion,
      status: 'PUBLISHED',
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!config) throw new Error('published fake cognitive config missing; run db:seed first')

  const passwordHash = await bcrypt.hash(password, 10)
  const teacher = await prisma.user.create({
    data: {
      username: `cognitive_video_teacher_${suffix}`,
      passwordHash,
      role: 'TEACHER',
      nickname: 'MEDIA-7 Browser Teacher',
      teacherApproved: true,
      mustChangePassword: false,
    },
  })
  const student = await prisma.user.create({
    data: {
      username: `cognitive_video_student_${suffix}`,
      passwordHash,
      role: 'STUDENT',
      nickname: 'MEDIA-7 Browser Student',
      mustChangePassword: false,
    },
  })
  const course = await prisma.course.create({
    data: {
      title: `MEDIA-7 Cognitive Video ${suffix}`,
      description: 'Isolated Cognitive VIDEO adapter browser fixture',
      courseCode: `MEDIA7_VIDEO_${suffix}`,
      creatorId: teacher.id,
      status: 'PUBLISHED',
      isLibrary: false,
    },
  })
  await prisma.courseStudent.create({ data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' } })
  const assignment = await prisma.cognitiveAssignment.create({
    data: {
      courseId: course.id,
      courseSnapshot: { id: course.id, title: course.title, courseCode: course.courseCode },
      configId: config.id,
      createdBy: teacher.id,
      title: `MEDIA-7 Cognitive Video Assignment ${suffix}`,
      instruction: 'Instruction video is presentation-only and must not alter scoring.',
      status: 'PUBLISHED',
      maxAttempts: 4,
      required: true,
    },
  })

  await mkdir(uploadRoot, { recursive: true })
  const generatedVideo = path.join(uploadRoot, `media7-generated-${suffix}.webm`)
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=620:duration=6',
    '-shortest', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '420k',
    '-c:a', 'libvorbis', '-b:a', '64k', generatedVideo,
  ])

  const video = await persistAsset({
    id: VIDEO_ID,
    fileName: `${VIDEO_ID}.webm`,
    mimeType: 'video/webm',
    sourcePath: generatedVideo,
    ownerId: teacher.id,
  })
  const poster = await persistAsset({
    id: POSTER_ID,
    fileName: `${POSTER_ID}.png`,
    mimeType: 'image/png',
    bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    ownerId: teacher.id,
  })
  const caption = await persistAsset({
    id: CAPTION_ID,
    fileName: `${CAPTION_ID}.vtt`,
    mimeType: 'text/vtt',
    bytes: Buffer.from('WEBVTT\n\n00:00.000 --> 00:03.000\nMEDIA-7 认知测评说明视频\n\n00:03.000 --> 00:05.500\n播放状态不进入科学结果\n', 'utf8'),
    ownerId: teacher.id,
  })

  const videoPresentation = {
    schemaVersion: 1 as const,
    video,
    poster,
    captions: [{ asset: caption, kind: 'captions' as const, srcLang: 'zh-CN', label: '中文字幕', default: true }],
    transcript: { language: 'zh-CN', text: 'MEDIA-7 非时序关键认知测评说明视频。' },
    title: 'MEDIA-7 认知测评说明视频',
  }
  const presentation = parseCognitivePresentationDefinition({
    schemaVersion: 1,
    videos: { instruction: [videoPresentation] },
  })
  const definition = buildCognitiveV2TaskDefinition({ ...fakeEntry, presentation }, 'DRAFT')
  const compiledRuntime = compileCognitiveRuntime({ definition, instrumentVersion: fakeEntry.engineVersion })
  const snapshot = createSessionConfigSnapshot({
    definition,
    configVersion: config.configVersion,
    config: config.config,
    runtime: { runtimeGeneration: 'UNIFIED_V1', compiledRuntime, referenceBindings: [] },
  })
  const references = cognitivePresentationAssetReferences(snapshot.presentation)
  await retainAssessmentAssetReferences({
    owner: {
      entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
      entityId: `COGNITIVE:${compiledRuntime.compiledRuntimeHash}`,
      field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
    },
    references,
    db: prisma,
  })
  const encryptedSnapshot = encryptCognitivePayload(snapshot)

  const authenticatedSession = await prisma.cognitiveSession.create({
    data: {
      userId: student.id,
      participantKey: getParticipantKey(student.id),
      participantSnapshotEncrypted: encryptCognitivePayload({ nickname: student.nickname }),
      assignmentId: assignment.id,
      configId: config.id,
      testType: fakeEntry.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted: encryptedSnapshot,
      engineVersion: fakeEntry.engineVersion,
      scoringVersion: fakeEntry.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: compiledRuntime.compiledRuntimeHash,
    },
  })

  const credential = createRecoveryCredential()
  const publicSession = await prisma.cognitiveSession.create({
    data: {
      userId: null,
      participantKey: credential.participantKey,
      participantSnapshotEncrypted: encryptCognitivePayload({ anonymousCode: credential.anonymousCode }),
      assignmentId: assignment.id,
      recoveryTokenHash: credential.hash,
      anonymousCode: credential.anonymousCode,
      configId: config.id,
      testType: fakeEntry.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted: encryptedSnapshot,
      engineVersion: fakeEntry.engineVersion,
      scoringVersion: fakeEntry.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: compiledRuntime.compiledRuntimeHash,
    },
  })

  const fixture = {
    student: { id: student.id, username: student.username, password },
    assignment: { id: assignment.id, title: assignment.title },
    authenticatedSession: { id: authenticatedSession.id },
    publicSession: { id: publicSession.id, recoveryToken: credential.token, anonymousCode: credential.anonymousCode },
    media: { video, poster, caption, title: videoPresentation.title, captionText: 'MEDIA-7 认知测评说明视频' },
    runtime: { compiledRuntimeHash: compiledRuntime.compiledRuntimeHash, definitionHash: snapshot.configHash },
  }
  await mkdir(path.dirname(fixturePath), { recursive: true })
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ fixturePath, authenticatedSessionId: authenticatedSession.id, publicSessionId: publicSession.id }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
