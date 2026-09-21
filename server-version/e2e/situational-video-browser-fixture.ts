import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from '../backend/node_modules/bcryptjs'
import { createAccessToken } from '../backend/src/services/anonymousAccess'
import { encryptPublicAccessToken, hashPublicAccessToken } from '../backend/src/services/publicAccessTokenCrypto'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()

const KEY = 'sjt-video-e2e-fixture'
const VERSION = '2.0.0'
const VIDEO_ID = 'situational-video-e2e-video'
const POSTER_ID = 'situational-video-e2e-poster'
const CAPTION_ID = 'situational-video-e2e-caption'
const fixturePath = process.env.SITUATIONAL_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-situational-video-fixture.json'
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const password = process.env.SITUATIONAL_VIDEO_E2E_PASSWORD || 'SituationalVideoE2E2026'
const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`

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

const publishHashEnv = async (name: string, value: string) => {
  if (!process.env.GITHUB_ENV) return
  await writeFile(process.env.GITHUB_ENV, `${name}=${value}\n`, { flag: 'a' })
}

const main = async () => {
  const passwordHash = await bcrypt.hash(password, 10)
  const teacher = await prisma.user.create({
    data: {
      username: `situational_video_teacher_${suffix}`,
      passwordHash,
      role: 'TEACHER',
      nickname: 'MEDIA-5 Browser Teacher',
      teacherApproved: true,
      mustChangePassword: false,
    },
  })
  const student = await prisma.user.create({
    data: {
      username: `situational_video_student_${suffix}`,
      passwordHash,
      role: 'STUDENT',
      nickname: 'MEDIA-5 Browser Student',
      mustChangePassword: false,
    },
  })

  await mkdir(uploadRoot, { recursive: true })
  const generatedVideo = path.join(uploadRoot, `media5-generated-${suffix}.webm`)
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=12',
    '-f', 'lavfi', '-i', 'sine=frequency=520:duration=12',
    '-shortest', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '450k',
    '-c:a', process.env.SITUATIONAL_VIDEO_E2E_AUDIO_ENCODER || 'libvorbis', '-b:a', '64k', generatedVideo,
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
    bytes: Buffer.from('WEBVTT\n\n00:00.000 --> 00:05.000\nMEDIA-5 视频情境字幕\n\n00:05.000 --> 00:11.000\n作答而不是播放进度决定分支\n', 'utf8'),
    ownerId: teacher.id,
  })

  await publishHashEnv('SITUATIONAL_VIDEO_E2E_VIDEO_HASH', video.contentHash)
  await publishHashEnv('SITUATIONAL_VIDEO_E2E_POSTER_HASH', poster.contentHash)
  await publishHashEnv('SITUATIONAL_VIDEO_E2E_CAPTION_HASH', caption.contentHash)

  const course = await prisma.course.create({
    data: {
      title: `MEDIA-5 Situational Video ${suffix}`,
      description: 'Isolated Situational VIDEO adapter browser fixture',
      courseCode: `MEDIA5_VIDEO_${suffix}`,
      creatorId: teacher.id,
      status: 'PUBLISHED',
      isLibrary: false,
    },
  })
  await prisma.courseStudent.create({
    data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' },
  })
  const composite = await prisma.compositeAssessment.create({
    data: {
      code: `MEDIA5_VIDEO_${suffix}`,
      name: `MEDIA-5 Situational Video Bundle ${suffix}`,
      description: 'One required VIDEO Situational unit',
      instruction: 'Complete the video scenario once.',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: teacher.id,
      publicEnabled: true,
      maxAttempts: 4,
      publishedAt: new Date(),
    },
  })
  const item = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SITUATIONAL',
      position: 0,
      required: true,
      situationalInstrumentKey: KEY,
      situationalInstrumentVersion: VERSION,
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
    student: { username: student.username, password },
    instrument: {
      key: KEY,
      version: VERSION,
      headline: 'MEDIA-5 Situational Video Fixture',
      videoSceneTitle: '视频情境：发现数据被误读，你会怎么做？',
      followUpTitle: '后续情境：你决定继续表达',
      longPathOption: 'A',
      earlyTerminalOption: 'B',
    },
    media: {
      video,
      poster,
      caption,
      captionText: 'MEDIA-5 视频情境字幕',
    },
    composite: { id: composite.id, name: composite.name },
    item: { id: item.id },
    publicToken,
  }
  await mkdir(path.dirname(fixturePath), { recursive: true })
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ fixturePath, instrumentKey: KEY, student: student.username, compositeId: composite.id }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
