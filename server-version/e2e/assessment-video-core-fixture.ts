import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import bcrypt from '../backend/node_modules/bcryptjs'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
} from '../backend/src/modules/assessment-media/assessment-asset'

const { PrismaClient } = require('../backend/node_modules/@prisma/client') as { PrismaClient: new () => any }
const prisma = new PrismaClient()

const fixturePath = process.env.ASSESSMENT_VIDEO_E2E_FIXTURE_FILE || '/tmp/eduk12-assessment-video-fixture.json'
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'uploads')
const password = process.env.ASSESSMENT_VIDEO_E2E_PASSWORD || 'AssessmentVideoE2E2026'
const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
const scopeId = `MEDIA4:${suffix}`
const publicRecoveryToken = randomBytes(24).toString('base64url')

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex')

const persistAsset = async (params: {
  id: string
  fileName: string
  mimeType: string
  bytes?: Buffer
  sourcePath?: string
  ownerId: string
}) => {
  const objectKey = `assets/${params.fileName}`
  const filePath = path.resolve(uploadRoot, objectKey)
  await mkdir(path.dirname(filePath), { recursive: true })
  if (params.bytes) await writeFile(filePath, params.bytes)
  const sourcePath = params.sourcePath || filePath
  if (params.sourcePath) {
    const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(params.sourcePath!))
    await writeFile(filePath, bytes)
  }
  const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(filePath))
  const size = (await stat(filePath)).size
  await prisma.storedAsset.create({
    data: {
      id: params.id,
      objectKey,
      provider: 'local',
      mimeType: params.mimeType,
      sizeBytes: size,
      sha256: sha256(bytes),
      originalName: params.fileName,
      ownerId: params.ownerId,
      accessScope: 'PRIVATE',
    },
  })
  return { assetId: params.id, contentHash: sha256(bytes), mimeType: params.mimeType }
}

const main = async () => {
  const student = await prisma.user.create({
    data: {
      username: `assessment_video_student_${suffix}`,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'STUDENT',
      nickname: 'MEDIA-4 Browser Student',
      mustChangePassword: false,
    },
  })

  await mkdir(uploadRoot, { recursive: true })
  const generatedVideo = path.join(uploadRoot, `media4-generated-${suffix}.mp4`)
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12',
    '-shortest',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '500k', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k',
    '-movflags', '+faststart',
    generatedVideo,
  ])

  const video = await persistAsset({
    id: `media4-video-${suffix}`,
    fileName: `media4-video-${suffix}.mp4`,
    mimeType: 'video/mp4',
    sourcePath: generatedVideo,
    ownerId: student.id,
  })
  const poster = await persistAsset({
    id: `media4-poster-${suffix}`,
    fileName: `media4-poster-${suffix}.png`,
    mimeType: 'image/png',
    bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    ownerId: student.id,
  })
  const captionText = `WEBVTT\n\n00:00.000 --> 00:04.000\nMEDIA-4 caption visible\n\n00:04.000 --> 00:10.000\nRange seek remains authorized\n`
  const caption = await persistAsset({
    id: `media4-caption-${suffix}`,
    fileName: `media4-caption-${suffix}.vtt`,
    mimeType: 'text/vtt',
    bytes: Buffer.from(captionText, 'utf8'),
    ownerId: student.id,
  })

  await prisma.assetReference.createMany({
    data: [video, poster, caption].map((asset) => ({
      assetId: asset.assetId,
      entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
      entityId: scopeId,
      field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
    })),
    skipDuplicates: true,
  })

  const fixture = {
    scopeId,
    student: { id: student.id, username: student.username, password },
    publicRecoveryToken,
    publicRecoveryTokenHash: sha256(publicRecoveryToken),
    presentation: {
      schemaVersion: 1,
      video,
      poster,
      captions: [{
        asset: caption,
        kind: 'captions',
        srcLang: 'en',
        label: 'English captions',
        default: true,
      }],
      transcript: {
        language: 'en',
        text: 'MEDIA-4 transcript accessibility fixture.',
      },
      title: 'MEDIA-4 Universal Video Core',
      description: 'Isolated capability, Range, seek, poster and caption acceptance fixture.',
    },
  }

  await writeFile(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')
  console.log(JSON.stringify({ fixturePath, scopeId, videoAssetId: video.assetId }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
