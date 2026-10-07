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
import { verifyReleaseSchema } from './release-schema-contract.mjs'
import { verifyConfiguredRuntime } from './runtime-role-contract.mjs'

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
  'questionnaire_access_tokens',
  'checkin_access_tokens',
  'composite_assessment_access_tokens',
  'cognitive_access_tokens',
  'submission_histories',
  'submission_idempotency_receipts',
  'checkin_submission_idempotency_receipts',
  'courses',
  'assignments',
  'checkins',
  'videos',
  'documents',
  'checkin_submissions',
  'questionnaire_form_sections',
  'questionnaire_form_section_attempts',
  'composite_form_sections',
  'composite_form_section_attempts',
]

const assertUploadDirectory = async () => {
  let uploadStats
  try {
    uploadStats = await fs.promises.stat(uploadDir)
  } catch {
    throw new Error('UPLOAD_DIR is missing or not readable')
  }
  if (!uploadStats.isDirectory()) {
    throw new Error('UPLOAD_DIR must be a directory')
  }
}

const countFilesOutsideAssetRoot = async () => {
  await assertUploadDirectory()
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
  const releaseSchema = await verifyReleaseSchema(prisma)
  const runtime = await verifyConfiguredRuntime({ allowIsolatedTestAbsence: true })
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
    plaintext_questionnaire_tokens: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "questionnaire_access_tokens"
      WHERE token IS NOT NULL
    `),
    missing_questionnaire_token_hash: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "questionnaire_access_tokens"
      WHERE token IS NULL AND token_hash IS NULL
    `),
    missing_questionnaire_token_encrypted: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "questionnaire_access_tokens"
      WHERE token IS NULL AND token_encrypted IS NULL
    `),
    plaintext_composite_tokens: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "composite_assessment_access_tokens"
      WHERE token IS NOT NULL
    `),
    missing_composite_token_hash: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "composite_assessment_access_tokens"
      WHERE token IS NULL AND token_hash IS NULL
    `),
    missing_composite_token_encrypted: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "composite_assessment_access_tokens"
      WHERE token IS NULL AND token_encrypted IS NULL
    `),
    plaintext_cognitive_tokens: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "cognitive_access_tokens"
      WHERE token IS NOT NULL
    `),
    missing_cognitive_token_hash: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "cognitive_access_tokens"
      WHERE token IS NULL AND token_hash IS NULL
    `),
    missing_cognitive_token_encrypted: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "cognitive_access_tokens"
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
      WHERE COALESCE(cover_url, '') ~* '(^|[" ])/?uploads/'
    `),
    legacy_assignment_asset_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "assignments"
      WHERE COALESCE(images::text, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(documents::text, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(videos::text, '') ~* '(^|[" ])/?uploads/'
    `),
    legacy_checkin_asset_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "checkins"
      WHERE COALESCE(images::text, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(documents::text, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(videos::text, '') ~* '(^|[" ])/?uploads/'
    `),
    legacy_video_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "videos"
      WHERE COALESCE(file_path, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(original_url, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(processed_url, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(thumbnail_url, '') ~* '(^|[" ])/?uploads/'
    `),
    legacy_document_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "documents"
      WHERE COALESCE(file_path, '') ~* '(^|[" ])/?uploads/'
         OR COALESCE(cos_url, '') ~* '(^|[" ])/?uploads/'
    `),
    legacy_submission_references: await countRows(`
      SELECT COUNT(*)::int AS count FROM "checkin_submissions"
      WHERE COALESCE(images::text, '') ~* '(^|[" ])/?uploads/'
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
    unvalidated_public_token_constraints: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM pg_constraint
      WHERE conrelid IN (
        'questionnaire_access_tokens'::regclass,
        'checkin_access_tokens'::regclass,
        'composite_assessment_access_tokens'::regclass,
        'cognitive_access_tokens'::regclass
      )
        AND conname IN (
          'questionnaire_access_tokens_token_must_be_null',
          'questionnaire_access_tokens_protected_fields_present',
          'checkin_access_tokens_token_must_be_null',
          'checkin_access_tokens_protected_fields_present',
          'composite_assessment_access_tokens_token_must_be_null',
          'composite_assessment_access_tokens_protected_fields_present',
          'cognitive_access_tokens_token_must_be_null',
          'cognitive_access_tokens_protected_fields_present'
        )
        AND convalidated = false
    `),
    missing_public_token_constraints: await countRows(`
      SELECT (8 - COUNT(*))::int AS count
      FROM pg_constraint
      WHERE conrelid IN (
        'questionnaire_access_tokens'::regclass,
        'checkin_access_tokens'::regclass,
        'composite_assessment_access_tokens'::regclass,
        'cognitive_access_tokens'::regclass
      )
        AND conname IN (
          'questionnaire_access_tokens_token_must_be_null',
          'questionnaire_access_tokens_protected_fields_present',
          'checkin_access_tokens_token_must_be_null',
          'checkin_access_tokens_protected_fields_present',
          'composite_assessment_access_tokens_token_must_be_null',
          'composite_assessment_access_tokens_protected_fields_present',
          'cognitive_access_tokens_token_must_be_null',
          'cognitive_access_tokens_protected_fields_present'
        )
    `),
    // Work C invariant: every form item must be bound to a section owned by
    // the same parent. A non-null foreign key is not sufficient: a direct DB
    // write can bind an item to a section from another questionnaire/composite.
    orphan_questionnaire_form_items: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "questionnaire_form_items" AS item
      LEFT JOIN "questionnaire_form_sections" AS section
        ON section."id" = item."section_id"
      WHERE item."section_id" IS NULL
        OR section."questionnaire_id" IS DISTINCT FROM item."questionnaire_id"
    `),
    orphan_composite_form_items: await countRows(`
      SELECT COUNT(*)::int AS count
      FROM "composite_assessment_items" AS item
      LEFT JOIN "composite_form_sections" AS section
        ON section."id" = item."form_section_id"
      WHERE item."type" = 'FORM'
        AND (
          item."form_section_id" IS NULL
          OR section."composite_assessment_id" IS DISTINCT FROM item."composite_assessment_id"
        )
    `),
  }

  const blockingFields = [
    'failed_migrations',
    'plaintext_checkin_tokens',
    'missing_checkin_token_hash',
    'missing_checkin_token_encrypted',
    'plaintext_questionnaire_tokens',
    'missing_questionnaire_token_hash',
    'missing_questionnaire_token_encrypted',
    'plaintext_composite_tokens',
    'missing_composite_token_hash',
    'missing_composite_token_encrypted',
    'plaintext_cognitive_tokens',
    'missing_cognitive_token_hash',
    'missing_cognitive_token_encrypted',
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
    'unvalidated_public_token_constraints',
    'missing_public_token_constraints',
    'orphan_questionnaire_form_items',
    'orphan_composite_form_items',
  ]
  const blocking = blockingFields.filter((field) => metrics[field] > 0)
  const result = { ok: blocking.length === 0, releaseSchema, runtime, metrics }
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
