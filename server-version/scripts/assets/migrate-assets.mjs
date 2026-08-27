#!/usr/bin/env node

/**
 * Idempotent legacy upload migration.
 *
 * Run only during the documented maintenance window, after writes have been
 * stopped. It copies local legacy files, records their digest, and links the
 * owning rows to StoredAsset. Remote COS objects are intentionally not
 * downloaded by the local-only migration; production must provide a reviewed
 * COS copy adapter before running against that storage.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
require('../../backend/node_modules/dotenv/config')
const { PrismaClient } = require('../../backend/node_modules/@prisma/client')

const prisma = new PrismaClient()
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(scriptDir, '../../backend')
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(backendDir, 'uploads'))
const assetRoot = path.join(uploadDir, 'assets')

function fail(message) {
  throw new Error(message)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

function safeFileName(name) {
  const base = path.basename(name || 'asset.bin').replace(/[^a-zA-Z0-9._-]/g, '_')
  return base || 'asset.bin'
}

function assetIdentity({ ownerId, accessScope, scopeId }) {
  return `${accessScope}:${scopeId || ''}:${ownerId || ''}`
}

function migratedObjectKey(digest, originalName, identity) {
  const identityDigest = sha256(Buffer.from(identity)).slice(0, 16)
  return `assets/migrated/${digest}-${identityDigest}-${safeFileName(originalName)}`
}

function mimeTypeFor(name) {
  const extension = path.extname(name || '').toLowerCase()
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  }[extension] || 'application/octet-stream'
}

function localLegacyPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      if (parsed.pathname.startsWith('/uploads/')) return localLegacyPath(parsed.pathname)
    } catch {
      return null
    }
    return null
  }

  const relative = raw.replace(/^\/+/, '').replace(/^uploads\//i, '')
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(uploadDir, relative)
  const resolvedRoot = path.resolve(uploadDir)
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) return null
  return candidate
}

const assetCache = new Map()
const assetInFlight = new Map()

async function ensureAsset({ source, originalName, ownerId, accessScope = 'PRIVATE', scopeId }) {
  const sourcePath = localLegacyPath(source)
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) return null
  const stat = await fsPromises.stat(sourcePath)
  if (stat.size <= 0) return null
  const digest = await sha256File(sourcePath)
  const identity = assetIdentity({ ownerId, accessScope, scopeId })
  const cacheKey = `${digest}:${identity}`
  const cached = assetCache.get(cacheKey)
  if (cached) return cached
  const inFlight = assetInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const work = (async () => {
    const existing = await prisma.storedAsset.findFirst({
      where: {
        sha256: digest,
        deletedAt: null,
        accessScope,
        scopeId: scopeId || null,
        ownerId: ownerId || null,
      },
    })
    if (existing) {
      assetCache.set(cacheKey, existing)
      return existing
    }

    // Include the ownership/scope identity in the key. Equal content used by
    // two courses must not collide on StoredAsset.objectKey.
    const objectKey = migratedObjectKey(digest, originalName || path.basename(sourcePath), identity)
    const target = path.resolve(assetRoot, objectKey.replace(/^assets\//, ''))
    if (target !== assetRoot && !target.startsWith(`${assetRoot}${path.sep}`)) fail('calculated asset path escaped asset root')
    await fsPromises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    if (!fs.existsSync(target)) await fsPromises.copyFile(sourcePath, target)
    await fsPromises.chmod(target, 0o600)

    const created = await prisma.storedAsset.create({
      data: {
        objectKey,
        provider: 'local',
        mimeType: mimeTypeFor(originalName || sourcePath),
        sizeBytes: stat.size,
        sha256: digest,
        originalName: originalName || path.basename(sourcePath),
        ownerId,
        accessScope,
        scopeId,
      },
    })
    assetCache.set(cacheKey, created)
    return created
  })()

  assetInFlight.set(cacheKey, work)
  try {
    return await work
  } finally {
    assetInFlight.delete(cacheKey)
  }
}

async function reference(assetId, entityType, entityId, field) {
  await prisma.assetReference.upsert({
    where: { assetId_entityType_entityId_field: { assetId, entityType, entityId, field } },
    create: { assetId, entityType, entityId, field },
    update: {},
  })
}

function existingAssetMatchesScope(asset, { ownerId, accessScope, scopeId }) {
  if (!asset || asset.deletedAt) return false
  if (asset.accessScope !== accessScope) return false
  if (scopeId && asset.scopeId !== scopeId) return false
  if (ownerId && asset.ownerId && asset.ownerId !== ownerId) return false
  return true
}

async function migrateCourses(report) {
  const rows = await prisma.course.findMany({ where: { coverAssetId: null, coverUrl: { not: null } }, select: { id: true, creatorId: true, coverUrl: true } })
  for (const row of rows) {
    const asset = await ensureAsset({ source: row.coverUrl, originalName: row.coverUrl || 'cover', ownerId: row.creatorId, accessScope: 'COURSE', scopeId: row.id })
    if (!asset) { report.skipped += 1; continue }
    await prisma.course.update({ where: { id: row.id }, data: { coverAssetId: asset.id, coverUrl: null } })
    await reference(asset.id, 'Course', row.id, 'cover')
    report.migrated += 1
  }
}

async function migrateDocuments(report) {
  const rows = await prisma.document.findMany({ where: { assetId: null }, select: { id: true, teacherId: true, filePath: true, fileName: true, cosUrl: true } })
  for (const row of rows) {
    const asset = await ensureAsset({ source: row.filePath || row.cosUrl, originalName: row.fileName, ownerId: row.teacherId })
    if (!asset) { report.skipped += 1; continue }
    await prisma.document.update({ where: { id: row.id }, data: { assetId: asset.id, filePath: asset.objectKey, cosUrl: null, cosKey: null } })
    await reference(asset.id, 'Document', row.id, 'file')
    report.migrated += 1
  }
}

async function migrateVideos(report) {
  const rows = await prisma.video.findMany({
    where: {
      OR: [
        { originalAssetId: null },
        { processedAssetId: null },
        { thumbnailAssetId: null },
      ],
    },
    select: {
      id: true,
      teacherId: true,
      filePath: true,
      fileName: true,
      originalUrl: true,
      processedUrl: true,
      thumbnailUrl: true,
      originalAssetId: true,
      processedAssetId: true,
      thumbnailAssetId: true,
    },
  })
  for (const row of rows) {
    if (!row.originalAssetId) {
      const original = await ensureAsset({ source: row.filePath || row.originalUrl, originalName: row.fileName, ownerId: row.teacherId })
      if (!original) { report.skipped += 1; continue }
      await prisma.video.update({ where: { id: row.id }, data: { originalAssetId: original.id, filePath: original.objectKey, originalUrl: null } })
      await reference(original.id, 'Video', row.id, 'original')
      report.migrated += 1
    }

    for (const [field, value, assetId] of [
      ['processed', row.processedUrl, row.processedAssetId],
      ['thumbnail', row.thumbnailUrl, row.thumbnailAssetId],
    ]) {
      if (assetId) continue
      const derivative = await ensureAsset({ source: value, originalName: `${row.id}-${field}`, ownerId: row.teacherId })
      if (!derivative) continue
      await prisma.video.update({ where: { id: row.id }, data: field === 'processed' ? { processedAssetId: derivative.id, processedUrl: null } : { thumbnailAssetId: derivative.id, thumbnailUrl: null } })
      await reference(derivative.id, 'Video', row.id, field)
    }
  }
}

async function migrateJsonReferences(report) {
  const [assignments, checkins, submissions] = await Promise.all([
    prisma.assignment.findMany({
      select: {
        id: true,
        images: true,
        documents: true,
        videos: true,
        courseId: true,
        course: { select: { creatorId: true } },
      },
    }),
    prisma.checkin.findMany({ select: { id: true, images: true, documents: true, videos: true, creatorId: true, courseId: true } }),
    prisma.checkinSubmission.findMany({
      select: {
        id: true,
        images: true,
        studentId: true,
        isAnonymous: true,
        checkinId: true,
        checkin: { select: { courseId: true } },
      },
    }),
  ])

  const walk = async (value, entityType, entityId, field, ownerId, scopeId, accessScope = 'PRIVATE') => {
    if (typeof value === 'string') {
      const asset = await ensureAsset({ source: value, originalName: path.basename(value), ownerId, accessScope, scopeId })
      if (asset) {
        await reference(asset.id, entityType, entityId, field)
        report.migrated += 1
        return { assetId: asset.id }
      }
      return value
    }
    if (Array.isArray(value)) {
      const migrated = []
      for (const [index, item] of value.entries()) {
        migrated.push(await walk(item, entityType, entityId, `${field}.${index}`, ownerId, scopeId, accessScope))
      }
      return migrated
    }
    if (!value || typeof value !== 'object') return value

    if (typeof value.assetId === 'string' && value.assetId) {
      const existing = await prisma.storedAsset.findUnique({
        where: { id: value.assetId },
        select: { id: true, objectKey: true, ownerId: true, accessScope: true, scopeId: true, deletedAt: true },
      })
      if (!existingAssetMatchesScope(existing, { ownerId, accessScope, scopeId })) {
        // Older runs incorrectly changed teacher-authored anonymous check-in
        // media to PUBLIC_CHECKIN. Copy those local assets into the correct
        // course-scoped identity and rewrite only this parent reference. The
        // old asset is retained if another entity (such as a submission) still
        // references it.
        if (accessScope === 'COURSE' && existing?.accessScope === 'PUBLIC_CHECKIN' && existing.objectKey) {
          const replacement = await ensureAsset({
            source: existing.objectKey,
            originalName: value.fileName || value.name || path.basename(existing.objectKey),
            ownerId,
            accessScope,
            scopeId,
          })
          if (replacement) {
            await reference(replacement.id, entityType, entityId, field)
            await prisma.assetReference.deleteMany({
              where: { assetId: value.assetId, entityType, entityId, field },
            })
            report.migrated += 1
            return { ...value, assetId: replacement.id }
          }
        }
        report.skipped += 1
        return value
      }
      await reference(value.assetId, entityType, entityId, field)
      return value
    }

    const sourceKey = ['url', 'processedUrl', 'originalUrl', 'cosUrl', 'filePath'].find((key) => typeof value[key] === 'string')
    if (sourceKey) {
      const asset = await ensureAsset({
        source: value[sourceKey],
        originalName: value.fileName || value.name || path.basename(value[sourceKey]),
        ownerId,
        accessScope,
        scopeId,
      })
      if (asset) {
        await reference(asset.id, entityType, entityId, field)
        report.migrated += 1
        return { ...value, assetId: asset.id }
      }
    }

    const entries = []
    for (const [key, item] of Object.entries(value)) {
      entries.push([
        key,
        await walk(item, entityType, entityId, `${field}.${key}`, ownerId, scopeId, accessScope),
      ])
    }
    return Object.fromEntries(entries)
  }

  for (const row of assignments) {
    const updates = {}
    for (const [field, value] of [['images', row.images], ['documents', row.documents], ['videos', row.videos]]) {
      updates[field] = await walk(value, 'Assignment', row.id, field, row.course.creatorId, row.courseId, 'COURSE')
    }
    if (JSON.stringify(updates.images) !== JSON.stringify(row.images) || JSON.stringify(updates.documents) !== JSON.stringify(row.documents) || JSON.stringify(updates.videos) !== JSON.stringify(row.videos)) {
      await prisma.assignment.update({ where: { id: row.id }, data: updates })
    }
  }
  for (const row of checkins) {
    // Teacher-authored check-in media remain course assets. Public access is
    // granted by the check-in token plus its exact AssetReference, not by
    // changing the asset's storage scope.
    const accessScope = 'COURSE'
    const scopeId = row.courseId
    const updates = {}
    for (const [field, value] of [['images', row.images], ['documents', row.documents], ['videos', row.videos]]) {
      updates[field] = await walk(value, 'Checkin', row.id, field, row.creatorId, scopeId, accessScope)
    }
    if (JSON.stringify(updates.images) !== JSON.stringify(row.images) || JSON.stringify(updates.documents) !== JSON.stringify(row.documents) || JSON.stringify(updates.videos) !== JSON.stringify(row.videos)) {
      await prisma.checkin.update({ where: { id: row.id }, data: updates })
    }
  }
  for (const row of submissions) {
    const accessScope = row.isAnonymous ? 'PUBLIC_CHECKIN' : 'COURSE'
    const scopeId = row.isAnonymous ? row.checkinId : row.checkin.courseId
    const images = await walk(
      row.images,
      'CheckinSubmission',
      row.id,
      'images',
      row.studentId || undefined,
      scopeId,
      accessScope,
    )
    if (JSON.stringify(images) !== JSON.stringify(row.images)) {
      await prisma.checkinSubmission.update({ where: { id: row.id }, data: { images } })
    }
  }
}

async function main() {
  if (process.env.ASSET_MIGRATION_CONFIRMATION !== 'MAINTENANCE') fail('ASSET_MIGRATION_CONFIRMATION=MAINTENANCE is required')
  const report = { migrated: 0, skipped: 0 }
  try {
    await migrateCourses(report)
    await migrateDocuments(report)
    await migrateVideos(report)
    await migrateJsonReferences(report)
    console.log(JSON.stringify({ status: 'ok', uploadDir, ...report }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'asset migration failed')
  process.exitCode = 1
})
