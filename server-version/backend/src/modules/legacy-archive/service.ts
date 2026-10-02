import { Pool } from 'pg'
import { decodeLegacyField } from './crypto'

export type ArchiveKind = 'assessments' | 'questionnaire-assessments'
export type ArchiveFilter = { page: number; studentId?: string; instrumentId?: string; status?: string }
export type ArchiveQuery = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
export const provenance = { source: 'ptool_legacy', readOnly: true, rescored: false, label: '旧系统原样，未重新计分' }

const specs = {
  assessments: { table: 'assessments', instrument: 'scales', column: 'scale_id' },
  'questionnaire-assessments': { table: 'questionnaire_assessments', instrument: 'questionnaires', column: 'questionnaire_id' },
} as const
const metadata = (column: string) => `a.id, a.user_id AS "studentId", COALESCE(u.username,'匿名历史记录') AS username, u.nickname,
 a.${column} AS "instrumentId", i.name AS "instrumentName", a.status::text AS status,
 a.progress, a.started_at AT TIME ZONE 'UTC' AS "startedAt", a.completed_at AT TIME ZONE 'UTC' AS "completedAt", a.total_time AS "totalTime"`

export function createArchiveService(query: ArchiveQuery) {
  return {
    async overview() {
      const result = await query(`SELECT (SELECT count(*)::int FROM assessments) AS assessments,
        (SELECT count(*)::int FROM questionnaire_assessments) AS "questionnaireAssessments",
        (SELECT count(*)::int FROM questionnaire_form_answers) AS "formAnswers",
        (SELECT min(started_at) AT TIME ZONE 'UTC' FROM assessments) AS "firstAssessmentAt",
        (SELECT max(started_at) AT TIME ZONE 'UTC' FROM assessments) AS "lastAssessmentAt"`)
      return { ...result.rows[0], provenance }
    },
    async list(kind: ArchiveKind, filter: ArchiveFilter) {
      const spec = specs[kind]
      const values: unknown[] = []
      const conditions: string[] = []
      const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql + '$' + values.length) }
      if (filter.studentId) add('a.user_id = ', filter.studentId)
      if (filter.instrumentId) add('a.' + spec.column + ' = ', filter.instrumentId)
      if (filter.status) add('a.status::text = ', filter.status)
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
      // List queries deliberately exclude answers, scores, feedback and tokens.
      const count = await query('SELECT count(*)::int AS total FROM ' + spec.table + ' a' + where, values)
      const rows = await query(`SELECT ${metadata(spec.column)} FROM ${spec.table} a
        LEFT JOIN users u ON u.id=a.user_id JOIN ${spec.instrument} i ON i.id=a.${spec.column}
        ${where} ORDER BY a.started_at DESC, a.id DESC LIMIT 25 OFFSET $${values.length + 1}`,
        [...values, (filter.page - 1) * 25])
      return { list: rows.rows, total: count.rows[0].total, page: filter.page, pageSize: 25, provenance }
    },
    async detail(kind: ArchiveKind, id: string) {
      const spec = specs[kind]
      const fields = kind === 'assessments'
        ? 'a.answers, a.scores, a.feedback, a.questionnaire_assessment_id AS "questionnaireAssessmentId"'
        : 'a.aggregate_report AS "aggregateReport", a.completed_scales AS "completedScales", a.completed_forms AS "completedForms"'
      const result = await query(`SELECT ${metadata(spec.column)}, ${fields}
        FROM ${spec.table} a LEFT JOIN users u ON u.id=a.user_id JOIN ${spec.instrument} i ON i.id=a.${spec.column} WHERE a.id=$1`, [id])
      const row = result.rows[0]
      if (!row) return null
      if (kind === 'assessments') {
        for (const field of ['answers', 'scores', 'feedback']) row[field] = decodeLegacyField(row[field])
      } else {
        // The legacy aggregate report is plaintext JSON; preserve it exactly.
        const answers = await query(`SELECT fa.id, fa.form_item_id AS "formItemId", fi.label, fi.type, fa.value,
          fa.created_at AT TIME ZONE 'UTC' AS "createdAt"
          FROM questionnaire_form_answers fa JOIN questionnaire_form_items fi ON fi.id=fa.form_item_id
          WHERE fa.questionnaire_assessment_id=$1 ORDER BY fi.position,fa.id LIMIT 501`, [id])
        const scales = await query(`SELECT a.id, a.scale_id AS "scaleId", s.name AS "scaleName", a.status::text AS status
          FROM assessments a JOIN scales s ON s.id=a.scale_id WHERE a.questionnaire_assessment_id=$1 ORDER BY a.id LIMIT 501`, [id])
        if (answers.rows.length > 500 || scales.rows.length > 500) throw new Error('Archive detail exceeds read limit')
        row.formAnswers = answers.rows.map(answer => ({ ...answer, value: decodeLegacyField(answer.value) }))
        row.assessments = scales.rows
      }
      return { ...row, provenance }
    },
  }
}

let runtimeService: ReturnType<typeof createArchiveService> | undefined
export function getArchiveService() {
  if (runtimeService) return runtimeService
  const connectionString = process.env.DATABASE_URL_LEGACY
  if (!connectionString || !/^\/ptool_legacy(?:_[a-z0-9]+)?$/i.test(new URL(connectionString).pathname)) throw new Error('Archive connection unavailable')
  const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 3000,
    statement_timeout: 5000, query_timeout: 6000, options: '-c default_transaction_read_only=on' })
  pool.on('error', () => { /* No sensitive connection details in logs. Next request returns a generic 503. */ })
  let checked: Promise<void> | undefined
  const check = () => checked ??= (async () => {
    const result = await pool.query(`SELECT rolsuper, rolcreaterole, rolcreatedb,
      has_table_privilege(current_user,'assessments','INSERT,UPDATE,DELETE,TRUNCATE') AS writable
      FROM pg_roles WHERE rolname=current_user`)
    if (!result.rows[0] || result.rows[0].rolsuper || result.rows[0].rolcreaterole || result.rows[0].rolcreatedb || result.rows[0].writable) {
      throw new Error('Archive requires a restricted SELECT-only role')
    }
  })()
  runtimeService = createArchiveService(async (sql, values) => { await check(); return pool.query(sql, values) })
  return runtimeService
}
