import { Prisma, PrismaClient } from '@prisma/client'
import { applyImportPlan, inspectImportPlan, createImportPlanner, importPlanHash, verifyImportPlan, type ImportAction } from './import-plan'
// Migration errors must not emit private Prisma payloads or runtime health timers.
const prisma = new PrismaClient({ log: [] })
import { validateScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { encryptToken, hashToken } from '../../services/checkinTokenCrypto'
import { LegacyClient, legacyNumber } from './legacy-client'
import { convertLegacyScaleDefinition, type LegacyDimensionRow, type LegacyItemDimensionRow, type LegacyScaleItemRow } from './legacy-scale-converter'
import { applyRewrites, buildRewriteMap, type LoadedRewrite } from './url-rewrite'

/**
 * Legacy ptool → eduK12 importer.
 *
 * Modes:
 *  - dry-run: execute every mapping and validation against the legacy data and
 *    report what would be written; zero business-table writes (only the
 *    dry_run batch record).
 *  - apply:   batched, idempotent upserts keyed by legacy IDs (preserved for
 *    every shared table, so new_id === legacy_id); every row is recorded in
 *    _legacy_import_id_map for traceability.
 *  - verify:  per-table count reconciliation (legacy vs new with expected
 *    differences), orphan checks and token-hash spot checks.
 *
 * Scale/questionnaire ASSESSMENTS are intentionally NOT imported: they stay in
 * the legacy archive database verbatim (see docs/migration/legacy-import-mapping.md).
 * All enums were verified identical between old @2b9a11d9 and new @69235a74.
 */

type Mode = 'dry_run' | 'apply' | 'verify'

interface Args {
  mode: Mode
  urlRewriteMap?: string
  legacyCosDomain: string
  only: Set<string>
  skip: Set<string>
  batchSize: number
  approvedAdmins: Set<string>
  approveTeachers: boolean
  confirmApply: boolean
}

const parseArgs = (): Args => {
  const argv = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const list = (name: string): Set<string> => new Set((flag(name) ?? '').split(',').filter(Boolean))
  const mode = (flag('mode') ?? 'dry_run') as Mode
  if (!['dry_run', 'apply', 'verify'].includes(mode)) throw new Error('--mode must be dry_run|apply|verify')
  return {
    mode,
    urlRewriteMap: flag('url-rewrite-map'),
    legacyCosDomain: flag('legacy-cos-domain') ?? 'https://cdn.eduk12.top',
    only: list('only'),
    skip: list('skip'),
    batchSize: Number(flag('batch-size') ?? 50),
    approvedAdmins: list('admin-users'),
    approveTeachers: argv.includes('--approve-legacy-teachers'),
    confirmApply: argv.includes('--confirm-apply'),
  }
}

const asDate = (value: unknown): Date | null => (value ? new Date(value as string) : null)
const asDateRequired = (value: unknown): Date => {
  const parsed = asDate(value)
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error('Invalid legacy datetime')
  return parsed
}
const asJson = (value: unknown): never => {
  if (value === undefined) throw new Error('A legacy JSON column is missing from its mapping')
  return (value === null ? Prisma.JsonNull : value) as never
}

class ImportContext {
  readonly counts: Record<string, { legacy: number; imported: number; rewritten: number }> = {}
  readonly notes: string[] = []
  note(message: string): void {
    this.notes.push(message)
  }
  tally(table: string, legacy: number, imported: number, rewritten = 0): void {
    this.counts[table] = { legacy, imported, rewritten }
  }
}

const rewriteCache: { loaded?: LoadedRewrite } = {}
const loadRewrites = (args: Args): LoadedRewrite => {
  if (!rewriteCache.loaded) {
    if (args.urlRewriteMap) {
      const fs = require('fs') as typeof import('fs')
      const parsed = JSON.parse(fs.readFileSync(args.urlRewriteMap, 'utf8')) as {
        missing_business_references?: Parameters<typeof buildRewriteMap>[0]
      }
      rewriteCache.loaded = buildRewriteMap(parsed.missing_business_references ?? [], args.legacyCosDomain)
    } else if (process.env.URL_REWRITE_JSON) {
      // Container runs cannot mount host files; the operator passes the audit
      // JSON inline via URL_REWRITE_JSON instead.
      const parsed = JSON.parse(process.env.URL_REWRITE_JSON) as {
        missing_business_references?: Parameters<typeof buildRewriteMap>[0]
      }
      rewriteCache.loaded = buildRewriteMap(parsed.missing_business_references ?? [], args.legacyCosDomain)
    } else {
      rewriteCache.loaded = { byRow: new Map(), plan: [] }
    }
  }
  return rewriteCache.loaded
}

const rewriteVideosColumn = (
  args: Args,
  ctx: ImportContext,
  table: string,
  legacyId: string,
  column: unknown,
): { value: unknown; rewritten: number } => {
  const loaded = loadRewrites(args)
  const { value, applied } = applyRewrites(loaded, table, legacyId, column)
  if (applied.length > 0) {
    ctx.note(`URL rewrite ${table}/${legacyId}: ${applied.map((entry) => `${entry.field} → ${entry.to}`).join('; ')}`)
  }
  return { value, rewritten: applied.length }
}

type TableImporter = (ctx: ImportContext) => Promise<void>

const buildImporters = (legacy: LegacyClient, args: Args, batchId: string | null, db: Prisma.TransactionClient): Array<[string, TableImporter]> => {
  const write = true // All modes build the identical validated, write-free plan.
  const track = async (entity: string, legacyId: string, newId: string): Promise<void> => {
    if (write && batchId) {
      await db.legacyImportIdMap.upsert({
        where: { entity_legacyId: { entity, legacyId } },
        update: { newId, batchId },
        create: { entity, legacyId, newId, batchId },
      })
    }
  }

  const importers: Array<[string, TableImporter]> = [
    // Resolve the circular users/teacher_codes foreign keys in two passes.
    ['users', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM users ORDER BY created_at')
      for (const row of rows) {
        const role = String(row.role)
        if (role === 'ADMIN' && !args.approvedAdmins.has(String(row.username))) throw new Error('Explicit administrator mapping is required')
        if (role === 'TEACHER' && !args.approveTeachers) throw new Error('Explicit teacher approval policy is required')
        const data = {
          id: String(row.id),
          username: String(row.username),
          passwordHash: String(row.password_hash),
          role: role as 'STUDENT' | 'TEACHER' | 'ADMIN',
          platformRole: (role === 'ADMIN' ? 'SYSTEM_ADMIN' : 'STANDARD') as 'SYSTEM_ADMIN' | 'STANDARD',
          nickname: (row.nickname as string | null) ?? null,
          avatarUrl: (row.avatar_url as string | null) ?? null,
          phone: (row.phone as string | null) ?? null,
          isActive: Boolean(row.is_active),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          // teacher_code_id is restored in a second pass after teacher_codes
          // exist (legacy users.teacher_code_id → teacher_codes.created_by is
          // a circular FK pair).
          expiresAt: asDate(row.expires_at),
          isFrozen: Boolean(row.is_frozen),
          teacherApproved: role !== 'STUDENT',
          tokenVersion: 0,
          mustChangePassword: false,
        }
        if (write) {
          await db.user.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('user', data.id, data.id)
        }
      }
      ctx.note(`platformRole: ${rows.filter((row) => row.role === 'ADMIN').map((row) => `${String(row.username)}→SYSTEM_ADMIN`).join(', ') || '(no admins)'}; all legacy teachers teacherApproved=true`)
      ctx.tally('users', rows.length, rows.length)
    }],

    ['teacher-codes', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM teacher_codes ORDER BY created_at')
      for (const row of rows) {
        // Historic codes are archived inactive: they must not grant new registrations.
        const data = {
          id: String(row.id),
          code: String(row.code),
          createdBy: String(row.created_by),
          maxUses: legacyNumber(row.max_uses) ?? 1,
          usedCount: legacyNumber(row.used_count) ?? 0,
          expiresAt: asDate(row.expires_at),
          isActive: false,
          createdAt: asDateRequired(row.created_at),
        }
        if (write) {
          await db.teacherCode.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('teacher_code', data.id, data.id)
        }
      }
      ctx.note('teacher_codes imported as isActive=false (historic records).')
      ctx.tally('teacher_codes', rows.length, rows.length)
    }],

    // Second pass: restore users.teacher_code_id now that teacher_codes exist.
    ['user-teacher-code-links', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT id, teacher_code_id, updated_at FROM users WHERE teacher_code_id IS NOT NULL')
      for (const row of rows) {
        if (write) {
          await db.user.update({
            where: { id: String(row.id) },
            data: { teacherCodeId: String(row.teacher_code_id), updatedAt: asDateRequired(row.updated_at) },
          })
          await track('user_teacher_code_link', String(row.id), String(row.id))
        }
      }
      ctx.tally('user_teacher_code_links', rows.length, rows.length)
    }],

    ['courses', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM courses ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          title: String(row.title),
          description: (row.description as string | null) ?? null,
          coverUrl: (row.cover_url as string | null) ?? null,
          status: String(row.status) as 'DRAFT' | 'PUBLISHED' | 'COMPLETED',
          courseCode: String(row.course_code),
          creatorId: String(row.creator_id),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          endedAt: asDate(row.ended_at),
          isRecruiting: Boolean(row.is_recruiting),
          isLibrary: false,
        }
        if (write) {
          await db.course.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('course', data.id, data.id)
        }
      }
      ctx.tally('courses', rows.length, rows.length)
    }],

    ['course-students', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM course_students ORDER BY joined_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          courseId: String(row.course_id),
          studentId: String(row.student_id),
          status: String(row.status) as 'PENDING' | 'APPROVED' | 'ACTIVE',
          joinedAt: asDateRequired(row.joined_at),
        }
        if (write) {
          await db.courseStudent.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('course_student', data.id, data.id)
        }
      }
      ctx.tally('course_students', rows.length, rows.length)
    }],

    ['assignments', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM assignments ORDER BY created_at')
      let rewritten = 0
      for (const row of rows) {
        const videosResult = rewriteVideosColumn(args, ctx, 'assignments', String(row.id), row.videos)
        rewritten += videosResult.rewritten
        const data = {
          id: String(row.id),
          courseId: String(row.course_id),
          title: String(row.title),
          description: (row.description as string | null) ?? null,
          deadline: asDate(row.deadline),
          status: String(row.status) as 'DRAFT' | 'PUBLISHED',
          questions: asJson(row.questions),
          videos: asJson(videosResult.value),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          content: (row.content as string | null) ?? null,
          images: asJson(row.images),
          documents: asJson(row.documents),
          tags: (row.tags as string[] | null) ?? [],
        }
        if (write) {
          await db.assignment.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('assignment', data.id, data.id)
        }
      }
      ctx.tally('assignments', rows.length, rows.length, rewritten)
    }],

    ['submissions', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM submissions ORDER BY submitted_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          assignmentId: String(row.assignment_id),
          studentId: String(row.student_id),
          content: (row.content as string | null) ?? null,
          answers: asJson(row.answers),
          comment: (row.comment as string | null) ?? null,
          status: String(row.status) as 'DRAFT' | 'SUBMITTED' | 'GRADED',
          submittedAt: asDateRequired(row.submitted_at),
          reviewedAt: asDate(row.reviewed_at),
          revision: 1,
        }
        if (write) {
          await db.submission.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('submission', data.id, data.id)
        }
      }
      ctx.tally('submissions', rows.length, rows.length)
    }],

    ['submission-histories', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM submission_histories ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          submissionId: String(row.submission_id),
          content: (row.content as string | null) ?? null,
          answers: asJson(row.answers),
          version: legacyNumber(row.version) ?? 1,
          createdAt: asDateRequired(row.created_at),
        }
        if (write) {
          await db.submissionHistory.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('submission_history', data.id, data.id)
        }
      }
      ctx.tally('submission_histories', rows.length, rows.length)
    }],

    ['checkins', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM checkins ORDER BY created_at')
      let rewritten = 0
      for (const row of rows) {
        const videosResult = rewriteVideosColumn(args, ctx, 'checkins', String(row.id), row.videos)
        rewritten += videosResult.rewritten
        const data = {
          id: String(row.id),
          courseId: String(row.course_id),
          title: String(row.title),
          description: (row.description as string | null) ?? null,
          creatorId: String(row.creator_id),
          createdAt: asDateRequired(row.created_at),
          content: (row.content as string | null) ?? null,
          images: asJson(row.images),
          documents: asJson(row.documents),
          videos: asJson(videosResult.value),
          allowViewOthers: Boolean(row.allow_view_others),
          endTime: asDate(row.end_time),
          updatedAt: asDateRequired(row.updated_at),
          tags: (row.tags as string[] | null) ?? [],
          allowAnonymous: Boolean(row.allow_anonymous),
        }
        if (write) {
          await db.checkin.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('checkin', data.id, data.id)
        }
      }
      ctx.tally('checkins', rows.length, rows.length, rewritten)
    }],

    ['checkin-access-tokens', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM checkin_access_tokens ORDER BY created_at')
      for (const row of rows) {
        const legacyToken = String(row.token)
        const data = {
          id: String(row.id),
          checkinId: String(row.checkin_id),
          token: null,
          tokenHash: hashToken(legacyToken),
          tokenEncrypted: encryptToken(legacyToken),
          createdBy: String(row.created_by),
          expiresAt: asDateRequired(row.expires_at),
          maxUses: legacyNumber(row.max_uses) ?? 0,
          usedCount: legacyNumber(row.used_count) ?? 0,
          isActive: Boolean(row.is_active),
          createdAt: asDateRequired(row.created_at),
        }
        if (write) {
          await db.checkinAccessToken.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('checkin_access_token', data.id, data.id)
        }
      }
      ctx.note('checkin_access_tokens: plaintext token → hash + encrypted (new key); token column NULL per token_must_be_null constraint.')
      ctx.tally('checkin_access_tokens', rows.length, rows.length)
    }],

    ['checkin-submissions', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM checkin_submissions ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          checkinId: String(row.checkin_id),
          studentId: (row.student_id as string | null) ?? null,
          content: (row.content as string | null) ?? null,
          images: asJson(row.images),
          createdAt: asDateRequired(row.created_at),
          isAnonymous: Boolean(row.is_anonymous),
          sessionId: (row.session_id as string | null) ?? null,
          tokenId: (row.token_id as string | null) ?? null,
          revision: 1,
        }
        if (write) {
          await db.checkinSubmission.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('checkin_submission', data.id, data.id)
        }
      }
      ctx.tally('checkin_submissions', rows.length, rows.length)
    }],

    ['questionnaires', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM questionnaires ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          code: String(row.code),
          name: String(row.name),
          description: (row.description as string | null) ?? null,
          instruction: (row.instruction as string | null) ?? null,
          status: String(row.status) as 'DRAFT' | 'PUBLISHED' | 'DEPRECATED',
          type: String(row.type) as 'COURSE' | 'GENERAL',
          visibility: String(row.visibility) as 'HIDDEN' | 'COURSE' | 'PUBLIC',
          estimatedTime: legacyNumber(row.estimated_time),
          creatorId: String(row.creator_id),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
        }
        if (write) {
          await db.questionnaire.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('questionnaire', data.id, data.id)
          // One default form section per questionnaire; legacy items attach to it.
          const sectionId = `legacy-section-${data.id}`
          await db.questionnaireFormSection.upsert({
            where: { id: sectionId },
            update: {},
            create: {
              id: sectionId,
              questionnaireId: data.id,
              title: '表单（旧系统迁移）',
              position: 0,
              contextSection: false,
            },
          })
          await track('form_section', data.id, sectionId)
        }
      }
      ctx.tally('questionnaires', rows.length, rows.length)
    }],

    ['questionnaire-form-items', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM questionnaire_form_items ORDER BY questionnaire_id, position, created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          questionnaireId: String(row.questionnaire_id),
          type: String(row.type),
          label: String(row.label),
          placeholder: (row.placeholder as string | null) ?? null,
          required: Boolean(row.required),
          position: legacyNumber(row.position) ?? 0,
          sectionId: write ? `legacy-section-${String(row.questionnaire_id)}` : null,
          sectionPosition: legacyNumber(row.position) ?? 0,
          options: asJson(row.options),
          contextKey: (row.context_key as string | null) ?? null,
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
        }
        if (write) {
          await db.questionnaireFormItem.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('questionnaire_form_item', data.id, data.id)
        }
      }
      ctx.tally('questionnaire_form_items', rows.length, rows.length)
    }],

    ['course-questionnaires', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM course_questionnaires ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          courseId: String(row.course_id),
          questionnaireId: String(row.questionnaire_id),
          createdAt: asDateRequired(row.created_at),
        }
        if (write) {
          await db.courseQuestionnaire.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('course_questionnaire', data.id, data.id)
        }
      }
      ctx.tally('course_questionnaires', rows.length, rows.length)
    }],

    ['scales', async (ctx) => {
      const scaleRows = await legacy.query<Record<string, unknown>>('SELECT * FROM scales ORDER BY created_at')
      const itemRows = await legacy.query<Record<string, unknown>>('SELECT * FROM scale_items ORDER BY scale_id, sort_order')
      const dimensionRows = await legacy.query<Record<string, unknown>>('SELECT * FROM dimensions')
      const linkRows = await legacy.query<Record<string, unknown>>(`
        SELECT id.item_id, id.dimension_id, id.weight, id.reverse, si.item_code, si.scale_id
        FROM item_dimensions id JOIN scale_items si ON si.id = id.item_id`)
      for (const row of scaleRows) {
        const scaleId = String(row.id)
        const items = itemRows
          .filter((item) => String(item.scale_id) === scaleId)
          .map((item) => ({
            item_code: String(item.item_code),
            content: String(item.content),
            type: String(item.type ?? 'single'),
            reverse: Boolean(item.reverse),
            required: Boolean(item.required),
            weight: (item.weight as string | number) ?? 1,
            sort_order: legacyNumber(item.sort_order) ?? 0,
            options: asJson(item.options),
            randomize_options: Boolean(item.randomize_options),
          })) as LegacyScaleItemRow[]
        const dimensions = dimensionRows
          .filter((dimension) => String(dimension.scale_id) === scaleId)
          .map((dimension) => ({
            id: String(dimension.id),
            code: String(dimension.code),
            name: String(dimension.name),
            description: (dimension.description as string | null),
            scoring_method: (dimension.scoring_method as string | null),
            weight: (dimension.weight as string | number) ?? 1,
          })) as LegacyDimensionRow[]
        const itemDimensions = linkRows
          .filter((link) => String(link.scale_id) === scaleId)
          .map((link) => ({
            item_id: String(link.item_id),
            dimension_id: String(link.dimension_id),
            weight: (link.weight as string | number) ?? 1,
            reverse: Boolean(link.reverse),
            item_code: String(link.item_code),
          })) as (LegacyItemDimensionRow & { item_code: string })[]
        const definition = convertLegacyScaleDefinition({
          scale: {
            id: scaleId,
            code: String(row.code),
            name: String(row.name),
            description: (row.description as string | null),
            config: (row.config as Record<string, unknown> | null),
            estimated_time: legacyNumber(row.estimated_time),
            instruction: (row.instruction as string | null),
            tags: (row.tags as string[] | null),
          },
          items,
          dimensions,
          itemDimensions,
        })
        const validation = validateScaleDefinition(definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE', forPublish: false })
        ctx.note('scale ' + scaleId + ': imported as DRAFT; definition review issues=' + validation.issues.filter(issue => issue.severity === 'error').length)
        const data = {
          id: scaleId,
          code: String(row.code),
          name: String(row.name),
          description: (row.description as string | null) ?? null,
          status: 'DRAFT' as const, // Legacy scoring and publication rights require separate review.
          visibility: String(row.visibility) as 'HIDDEN' | 'COURSE' | 'PUBLIC',
          instrumentClass: 'CUSTOM_DESCRIPTIVE' as const,
          instrumentVersion: '2.0.0',
          definition: asJson(definition),
          definitionHash: hashScaleDefinition(definition as never),
          itemCount: items.length,
          dimensionCount: dimensions.length,
          estimatedTime: legacyNumber(row.estimated_time),
          instruction: (row.instruction as string | null) ?? null,
          creatorId: String(row.creator_id),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          tags: (row.tags as string[] | null) ?? [],
        }
        if (write) {
          await db.scale.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('scale', data.id, data.id)
        }
      }
      ctx.note(`scales: definitions converted to V2 (${itemRows.length} items, ${dimensionRows.length} dimensions across ${scaleRows.length} scales). Historical assessment results stay in the legacy archive and are never re-scored.`)
      ctx.tally('scales', scaleRows.length, scaleRows.length)
    }],

    ['course-scales', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM course_scales ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          courseId: String(row.course_id),
          scaleId: String(row.scale_id),
          createdAt: asDateRequired(row.created_at),
        }
        if (write) {
          await db.courseScale.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('course_scale', data.id, data.id)
        }
      }
      ctx.tally('course_scales', rows.length, rows.length)
    }],

    ['videos', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM videos ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          title: String(row.title),
          filePath: String(row.file_path),
          fileName: String(row.file_name),
          fileSize: legacyNumber(row.file_size) ?? 0,
          mimeType: String(row.mime_type ?? 'video/mp4'),
          teacherId: String(row.teacher_id),
          usageCount: legacyNumber(row.usage_count) ?? 0,
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          deletedAt: asDate(row.deleted_at),
          isDeleted: Boolean(row.is_deleted),
          tags: (row.tags as string[] | null) ?? [],
          duration: legacyNumber(row.duration),
          errorMessage: (row.error_message as string | null) ?? null,
          originalUrl: (row.original_url as string | null) ?? null,
          originalCosUrl: (row.original_cos_url as string | null) ?? null,
          originalCosKey: (row.original_cos_key as string | null) ?? null,
          processedAt: asDate(row.processed_at),
          processedUrl: (row.processed_url as string | null) ?? null,
          resolution: (row.resolution as string | null) ?? null,
          status: String(row.status) as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
          thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
        }
        if (write) {
          await db.video.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('video', data.id, data.id)
        }
      }
      ctx.note('videos: StoredAsset/AssetReference registration happens in the separate asset-migration flow; assetId columns stay NULL until then.')
      ctx.tally('videos', rows.length, rows.length)
    }],

    ['documents', async (ctx) => {
      const rows = await legacy.query<Record<string, unknown>>('SELECT * FROM documents ORDER BY created_at')
      for (const row of rows) {
        const data = {
          id: String(row.id),
          title: String(row.title),
          filePath: String(row.file_path),
          fileName: String(row.file_name),
          fileSize: legacyNumber(row.file_size) ?? 0,
          mimeType: String(row.mime_type ?? 'application/octet-stream'),
          teacherId: String(row.teacher_id),
          usageCount: legacyNumber(row.usage_count) ?? 0,
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
          deletedAt: asDate(row.deleted_at),
          isDeleted: Boolean(row.is_deleted),
          tags: (row.tags as string[] | null) ?? [],
          pageCount: legacyNumber(row.page_count),
          cosUrl: (row.cos_url as string | null) ?? null,
          cosKey: (row.cos_key as string | null) ?? null,
        }
        if (write) {
          await db.document.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('document', data.id, data.id)
        }
      }
      ctx.tally('documents', rows.length, rows.length)
    }],

    ['classrooms', async (ctx) => {
      const classroomRows = await legacy.query<Record<string, unknown>>('SELECT * FROM classrooms ORDER BY created_at')
      const questionRows = await legacy.query<Record<string, unknown>>('SELECT * FROM classroom_questions ORDER BY question_index')
      const answerRows = await legacy.query<Record<string, unknown>>('SELECT * FROM classroom_answers ORDER BY submitted_at')
      const sessionRows = await legacy.query<Record<string, unknown>>('SELECT * FROM classroom_sessions ORDER BY joined_at')
      for (const row of classroomRows) {
        const data = {
          id: String(row.id),
          code: String(row.code),
          name: String(row.name),
          courseId: String(row.course_id),
          status: String(row.status) as 'PREPARING' | 'ACTIVE' | 'ENDED',
          questionnaireId: (row.questionnaire_id as string | null) ?? null,
          creatorId: String(row.creator_id),
          startedAt: asDate(row.started_at),
          endedAt: asDate(row.ended_at),
          createdAt: asDateRequired(row.created_at),
          updatedAt: asDateRequired(row.updated_at),
        }
        if (write) {
          await db.classroom.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('classroom', data.id, data.id)
        }
      }
      for (const row of questionRows) {
        const data = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          formItemId: (row.form_item_id as string | null) ?? null,
          questionIndex: legacyNumber(row.question_index) ?? 0,
          questionContent: asJson(row.questionContent),
          timeLimit: legacyNumber(row.time_limit),
          startedAt: asDate(row.started_at),
          endedAt: asDate(row.ended_at),
        }
        if (write) {
          await db.classroomQuestion.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('classroom_question', data.id, data.id)
        }
      }
      for (const row of sessionRows) {
        const data = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          studentId: String(row.student_id),
          joinedAt: asDateRequired(row.joined_at),
          leftAt: asDate(row.left_at),
          isTemporary: Boolean(row.is_temporary),
        }
        if (write) {
          await db.classroomSession.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('classroom_session', data.id, data.id)
        }
      }
      for (const row of answerRows) {
        const data = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          questionId: String(row.question_id),
          sessionId: String(row.session_id),
          answer: asJson(row.answer),
          submittedAt: asDateRequired(row.submitted_at),
        }
        if (write) {
          await db.classroomAnswer.upsert({ where: { id: data.id }, update: {}, create: data })
          await track('classroom_answer', data.id, data.id)
        }
      }
      ctx.tally('classrooms(+questions/answers/sessions)', classroomRows.length + questionRows.length + answerRows.length + sessionRows.length, classroomRows.length + questionRows.length + answerRows.length + sessionRows.length)
    }],
  ]
  return importers
}

export async function runLegacyImport(): Promise<void> {
  const args = parseArgs()
  if (!Number.isSafeInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 500) throw new Error('--batch-size must be 1..500')
  if (args.mode === 'apply' && !args.confirmApply) throw new Error('apply requires --confirm-apply')
  const legacyUrl = process.env.DATABASE_URL_LEGACY
  const targetUrl = process.env.DATABASE_URL
  if (!legacyUrl || !targetUrl) throw new Error('Both legacy and target database connections are required')
  const identity = (value: string) => { const url = new URL(value); return url.hostname + ':' + (url.port || '5432') + url.pathname }
  if (identity(legacyUrl) === identity(targetUrl) || new URL(targetUrl).pathname === '/ptool') throw new Error('Legacy and target databases must be isolated')
  const legacy = new LegacyClient(legacyUrl)
  const report = new ImportContext()
  const actions: ImportAction[] = []
  let batchId: string | undefined
  try {
    await legacy.beginSnapshot()
    const planner = createImportPlanner(actions)
    for (const [name, importer] of buildImporters(legacy, args, 'plan', planner)) {
      if (args.only.size > 0 && !args.only.has(name)) continue
      if (args.skip.has(name)) continue
      await importer(report)
    }
    for (const table of ['course_shares', 'questionnaire_scales', 'questionnaire_access_tokens']) {
      const rows = await legacy.query<{ count: string }>('SELECT count(*)::text AS count FROM ' + table)
      if (Number(rows[0].count) !== 0) throw new Error('Unmapped nonempty legacy table: ' + table)
    }
    const loaded = loadRewrites(args)
    const rewritten = Object.values(report.counts).reduce((sum, value) => sum + value.rewritten, 0)
    if (loaded.plan.length !== rewritten) throw new Error('Not all audited URL rewrites were applied')
    const preview = await inspectImportPlan(prisma, actions)
    const sourceHash = importPlanHash(actions)
    const batch = await prisma.legacyImportBatch.create({ data: { mode: args.mode, status: 'RUNNING', summary: { sourceHash, preview, planned: actions.length } } })
    batchId = batch.id
    let verification: { checked: number; mappingCount: number } | undefined
    if (args.mode === 'apply') {
      await applyImportPlan(prisma, actions, batch.id, args.batchSize)
      verification = await verifyImportPlan(prisma, actions)
    } else if (args.mode === 'verify') {
      verification = await verifyImportPlan(prisma, actions)
    }
    await prisma.legacyImportBatch.update({ where: { id: batch.id }, data: { status: 'DONE', finishedAt: new Date(), counts: report.counts as never, summary: { sourceHash, preview, planned: actions.length, verification, notes: report.notes } as never } })
    process.stdout.write(JSON.stringify({ mode: args.mode, batchId: batch.id, sourceHash, preview, counts: report.counts, verification, notes: report.notes }, null, 2) + '\n')
  } catch (error) {
    if (batchId) await prisma.legacyImportBatch.update({ where: { id: batchId }, data: { status: 'FAILED', finishedAt: new Date(), error: 'Legacy import failed; inspect restricted operator evidence', counts: report.counts as never } })
    throw error
  } finally {
    await legacy.close()
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  runLegacyImport().catch(error => {
    // Prisma error stacks can include complete records, hashes and private fields.
    const message = error instanceof Prisma.PrismaClientKnownRequestError
      ? 'Legacy import database constraint failure (' + error.code + ')'
      : error instanceof Prisma.PrismaClientValidationError
        ? 'Legacy import payload validation failure'
        : error instanceof Error ? error.message : 'Legacy import failed'
    process.stderr.write(message + '\n')
    process.exit(1)
  })
}
