#!/usr/bin/env node

/**
 * Read-only release data preflight.
 *
 * The script deliberately emits counts only.  It is safe to run with a
 * read-only database role and refuses the release when a known migration or
 * asset/token invariant is not satisfied.
 */

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'))

const countRows = async (sql) => {
  const rows = await prisma.$queryRawUnsafe(sql)
  return Number(rows?.[0]?.count || 0)
}

const tableExists = async (table) => {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `
  return Boolean(rows?.[0]?.exists)
}

const requiredTables = [
  '_prisma_migrations',
  'checkin_access_tokens',
  'submission_histories',
  'courses',
  'assignments',
  'checkins',
  'videos',
  'documents',
  'checkin_submissions',
]

const countFilesOutsideAssetRoot = async () => {
  if (!fs.existsSync(uploadDir)) return 0
  const assetRoot = path.resolve(uploadDir, 'assets')
  let total = 0
  const visit = async (directory) => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.resolve(directory, entry.name)
      if (absolute === assetRoot || absolute.startsWith(`${assetRoot}${path.sep}`)) continue
      if (entry.isDirectory()) await visit(absolute)
      else total += 1
    }
  }
  await visit(uploadDir)
  return total
}

const run = async () => {
  const missingTables = []
  for (const table of requiredTables) {
    if (!(await tableExists(table))) missingTables.push(table)
  }
  if (missingTables.length > 0) {
    throw new Error(`required release tables are missing (${missingTables.join(',')})`)
  }

  const metrics = {
    applied_migrations: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `),
    failed_migrations: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `),
    plaintext_checkin_tokens: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "checkin_access_tokens"
      WHERE token IS NOT NULL
    `),
    missing_checkin_token_hash: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "checkin_access_tokens"
      WHERE token IS NULL AND token_hash IS NULL
    `),
    missing_checkin_token_encrypted: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "checkin_access_tokens"
      WHERE token IS NULL AND token_encrypted IS NULL
    `),
    duplicate_submission_history_versions: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT submission_id, version
        FROM "submission_histories"
        GROUP BY submission_id, version
        HAVING COUNT(*) > 1
      ) duplicate_groups
    `),
    legacy_course_asset_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "courses"
      WHERE COALESCE(cover_url, '') ILIKE '%/uploads/%'
    `),
    legacy_assignment_asset_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "assignments"
      WHERE COALESCE(images::text, '') ILIKE '%/uploads/%'
         OR COALESCE(documents::text, '') ILIKE '%/uploads/%'
         OR COALESCE(videos::text, '') ILIKE '%/uploads/%'
    `),
    legacy_checkin_asset_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "checkins"
      WHERE COALESCE(images::text, '') ILIKE '%/uploads/%'
         OR COALESCE(documents::text, '') ILIKE '%/uploads/%'
         OR COALESCE(videos::text, '') ILIKE '%/uploads/%'
    `),
    legacy_video_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "videos"
      WHERE COALESCE(file_path, '') ILIKE '%/uploads/%'
         OR COALESCE(original_url, '') ILIKE '%/uploads/%'
         OR COALESCE(processed_url, '') ILIKE '%/uploads/%'
         OR COALESCE(thumbnail_url, '') ILIKE '%/uploads/%'
    `),
    legacy_document_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "documents"
      WHERE COALESCE(file_path, '') ILIKE '%/uploads/%'
         OR COALESCE(cos_url, '') ILIKE '%/uploads/%'
    `),
    legacy_submission_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "checkin_submissions"
      WHERE COALESCE(images::text, '') ILIKE '%/uploads/%'
    `),
    legacy_files_outside_asset_root: await countFilesOutsideAssetRoot(),
    unvalidated_checkin_token_constraints: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM pg_constraint
      WHERE conrelid = 'checkin_access_tokens'::regclass
        AND conname IN (
          'checkin_access_tokens_token_must_be_null',
          'checkin_access_tokens_protected_fields_present'
        )
        AND convalidated = false
    `),
    missing_checkin_token_constraints: await countRows(`
      SELECT (2 - COUNT(*))::int AS count
      FROM pg_constraint
      WHERE conrelid = 'checkin_access_tokens'::regclass
        AND conname IN (
          'checkin_access_tokens_token_must_be_null',
          'checkin_access_tokens_protected_fields_present'
        )
    `),
  }

  const blockingFields = [
    'failed_migrations',
    'plaintext_checkin_tokens',
    'missing_checkin_token_hash',
    'missing_checkin_token_encrypted',
    'duplicate_submission_history_versions',
    'legacy_course_asset_references',
    'legacy_assignment_asset_references',
    'legacy_checkin_asset_references',
    'legacy_video_references',
    'legacy_document_references',
    'legacy_submission_references',
    'legacy_files_outside_asset_root',
    'unvalidated_checkin_token_constraints',
    'missing_checkin_token_constraints',
  ]
  const blocking = blockingFields.filter((field) => metrics[field] > 0)
  const result = { ok: blocking.length === 0, metrics }
  console.log(JSON.stringify(result))
  if (blocking.length > 0) {
    throw new Error(`release preflight blocked by ${blocking.join(',')}`)
  }
}

try {
  await run()
} catch {
  // Never print Prisma errors because they may contain a connection URL.
  if (!process.stdout.isTTY) process.stderr.write('release data preflight failed\n')
  else console.error('release data preflight failed')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
