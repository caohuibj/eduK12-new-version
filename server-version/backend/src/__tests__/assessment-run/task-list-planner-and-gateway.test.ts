import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  findFirstProject: vi.fn(),
  findFirstEntryToken: vi.fn(),
  startRunExecution: vi.fn(),
  readSnapshot: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: dbMocks.queryRaw,
    $executeRaw: dbMocks.executeRaw,
    $transaction: dbMocks.transaction,
    surveyProject: { findFirst: dbMocks.findFirstProject },
    surveyEntryToken: { findFirst: dbMocks.findFirstEntryToken },
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../modules/assessment-run/startExecution', () => ({
  startAssessmentRunExecution: dbMocks.startRunExecution,
}))

vi.mock('../../modules/organization/educationProductAccess', () => ({
  resolveEducationProductMemberScope: vi.fn(async () => ({ membershipId: 'm-1' })),
}))

vi.mock('../../modules/assessment-run/educationPrivateFormExecution', () => ({
  readPrivateFormExecutionSource: vi.fn(async () => ({})),
}))

vi.mock('../../modules/cognitive-analysis', async () => {
  const actual = await vi.importActual<typeof import('../../modules/cognitive-analysis')>('../../modules/cognitive-analysis')
  return {
    ...actual,
    readFrozenReportPackageSnapshot: dbMocks.readSnapshot,
  }
})

import { withBoundedPlannerRead } from '../../modules/assessment-run/plannerBound'
import { listAssignedRunTasks, listSchoolStudentRunTasks } from '../../modules/assessment-run/productRead'
import { checkCampusCompositeAccessAuthority } from '../../modules/campus/campus-composite-authority'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import teacherScaleRouter, { listOwnTeacherScaleTasks } from '../../modules/huiteacher/scaleRuntime.routes'
import teacherPrivateFormRouter from '../../modules/huiteacher/privateFormRuntime.routes'
import teacherFormRouter from '../../modules/huiteacher/formRuntime.routes'
import { errorHandler } from '../../middleware/errorHandler'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { AssessmentStartBusyError } from '../../modules/composite/start-transient'
import {
  getFrozenPackageSlotLabels,
  resetFrozenPackageSlotLabelCacheForTests,
} from '../../modules/composite/report-package-label'
import {
  getPublicResearchInfo,
  resetSurveyPublicationCachesForTests,
} from '../../modules/survey/admission.service'
import { listCampusStudentTasks } from '../../modules/campus/activity.tasks'
import { reconcileRunExecutionByRuntimeBinding } from '../../modules/assessment-run/reconcile'
import { cloneCachedStartComposite, loadStartComposite } from '../../modules/composite/composite.service'
import { resetStartReadCachesForTests } from '../../modules/composite/start-read-cache'
import { hasImmutableCanonicalValue } from '../../modules/assessment-runtime/canonical'
import { projectRelationalUnitFinalResponse } from '../../modules/assessment-relational/result-authority'
import { logger } from '../../utils/logger'

const EXEC_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PUBLIC_ID = '33333333-3333-4333-8333-333333333333'

function isPrismaSqlObject(value: unknown): value is { strings: ReadonlyArray<string>; values: ReadonlyArray<unknown> } {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray((value as any).strings)
    && Array.isArray((value as any).values),
  )
}

function renderInterpolatedSql(strings: ReadonlyArray<string>, values: ReadonlyArray<unknown>): string {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    const val = values[i]
    out += isPrismaSqlObject(val) ? renderInterpolatedSql(val.strings, val.values) : '?'
    out += strings[i + 1] ?? ''
  }
  return out
}

function flattenQueryRawCall(call: ReadonlyArray<unknown>): string {
  const first = call[0]
  if (Array.isArray(first) && 'raw' in first) {
    return renderInterpolatedSql(first as unknown as ReadonlyArray<string>, call.slice(1))
  }
  if (isPrismaSqlObject(first)) {
    return renderInterpolatedSql(first.strings, first.values)
  }
  return sqlText(first)
}

function sqlText(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (Array.isArray(arg)) return arg.map(item => sqlText(item)).join('?')
  const obj = arg as { sql?: string; strings?: ReadonlyArray<string>; values?: ReadonlyArray<unknown> }
  if (typeof obj?.sql === 'string') {
    const nested = Array.isArray(obj.values) ? obj.values.filter(v => typeof (v as any)?.sql === 'string').map(sqlText).join(' ') : ''
    return nested ? `${obj.sql} ${nested}` : obj.sql
  }
  if (Array.isArray(obj?.strings)) return obj.strings.join('?')
  return String(arg)
}

async function invokeStartRoute(router: any, path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path)
  const handler = layer.route.stack.at(-1).handle
  const req: any = {
    user: { userId: USER_ID, role: 'TEACHER', accountDomain: 'SCHOOL' },
    params: { executionId: EXEC_ID },
    query: {},
    body: {},
  }
  return await new Promise<any>((resolvePromise, rejectPromise) => {
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as unknown,
      setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value },
      status(code: number) { this.statusCode = code; return this },
      json(payload: unknown) { this.body = payload; resolvePromise(this); return this },
    }
    const next = (err?: unknown) => {
      if (!err) { resolvePromise(res); return }
      try {
        errorHandler(err, req, res, vi.fn())
      } catch (caught) {
        rejectPromise(caught)
      }
    }
    try {
      Promise.resolve(handler(req, res, next)).catch(rejectPromise)
    } catch (caught) {
      rejectPromise(caught)
    }
  })
}

describe('Task-list planner bounds, 503 resource-gate transport, info caches, and gateway routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetFrozenPackageSlotLabelCacheForTests()
    resetSurveyPublicationCachesForTests()
    dbMocks.executeRaw.mockResolvedValue(0)
    dbMocks.transaction.mockImplementation(async (fn: any) => fn({
      $queryRaw: dbMocks.queryRaw,
      $executeRaw: dbMocks.executeRaw,
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('applies transaction-local join/from collapse and custom-plan bounds and falls back cleanly for bare mocks', async () => {
    dbMocks.queryRaw.mockResolvedValueOnce(['bounded'])
    const result = await withBoundedPlannerRead(
      {
        $queryRaw: dbMocks.queryRaw as any,
        $executeRaw: dbMocks.executeRaw as any,
        $transaction: dbMocks.transaction as any,
      },
      client => client.$queryRaw`SELECT 1`,
    )
    expect(result).toEqual(['bounded'])
    expect(dbMocks.executeRaw.mock.calls.map(call => sqlText(call[0]))).toEqual([
      "SELECT set_config('join_collapse_limit', '1', true), set_config('from_collapse_limit', '1', true), set_config('plan_cache_mode', 'force_custom_plan', true)",
    ])

    const bareQuery = vi.fn().mockResolvedValueOnce(['bare'])
    const bareResult = await withBoundedPlannerRead(
      { $queryRaw: bareQuery as any },
      client => client.$queryRaw`SELECT 1`,
    )
    expect(bareResult).toEqual(['bare'])
    expect(bareQuery).toHaveBeenCalledTimes(1)
  })

  it('scopes listAssignedRunTasks via fixed-arity text[] parameters and expands boundCompositeContinuationSql only once', async () => {
    expect(await listAssignedRunTasks(USER_ID, { organizationIds: [] })).toEqual({
      list: [],
      truncated: false,
      nextCursor: null,
    })
    expect(dbMocks.queryRaw).not.toHaveBeenCalled()

    dbMocks.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await listAssignedRunTasks(USER_ID, {
      organizationIds: ['org-school-1'],
      runIds: ['run-1'],
      executionIds: ['exec-1'],
      preserveBoundSchoolContinuation: true,
    })
    await listAssignedRunTasks(USER_ID, {
      organizationIds: ['org-school-1', 'org-school-2', 'org-school-3'],
      runIds: ['run-1', 'run-2', 'run-3', 'run-4'],
      executionIds: ['exec-1', 'exec-2', 'exec-3'],
      preserveBoundSchoolContinuation: true,
    })

    expect(dbMocks.executeRaw).toHaveBeenCalledTimes(2)
    const firstSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[0])
    const secondSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[1])
    // Varying array cardinalities MUST produce the exact same prepared SQL template.
    expect(secondSql).toBe(firstSql)
    expect(firstSql).toContain('unnest(?::text[])')
    expect(firstSql).toContain('respondent."run_id" = ANY(?::text[])')
    expect(firstSql).toContain('r."id" = ANY(?::text[])')
    expect(firstSql).toContain('e."id" = ANY(?::text[])')
    // Previously expanded 3 times across SELECT, CASE WHEN, and WHERE; now materialized once via LATERAL.
    expect(firstSql.match(/FROM "assessment_run_executions" bound_execution/g)).toHaveLength(1)
    // Short-circuit 8-table continuation join unless row is STARTED COMPOSITE with binding.
    expect(firstSql).toContain('e."status" = \'STARTED\'')
    expect(firstSql).toContain('e."runtime_binding_ref" IS NOT NULL')
  })

  it('omits unused subject and claim joins only from School student task reads', async () => {
    dbMocks.queryRaw.mockResolvedValue([])
    const options = { organizationIds: ['org-school-1'], runIds: ['run-1'],
      preserveBoundSchoolContinuation: true, populationProductScope: 'CAMPUS_ONLY' as const }
    await listSchoolStudentRunTasks(USER_ID, options)
    await listAssignedRunTasks(USER_ID, options)
    const studentSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[0])
    const generalSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[1])
    expect(studentSql).not.toContain('JOIN "users" subject_user')
    expect(studentSql).not.toContain('LEFT JOIN "assessment_run_execution_start_claims" c')
    expect(generalSql).toContain('JOIN "users" subject_user')
    expect(generalSql).toContain('LEFT JOIN "assessment_run_execution_start_claims" c')
    expect(studentSql).toContain('assessment_run_relationship_snapshots')
  })

  it('bounds checkCampusCompositeAccessAuthority and standalone readRespondentRunSummary while preserving supplied tx db', async () => {
    dbMocks.queryRaw.mockResolvedValueOnce([{
      executionId: EXEC_ID, orgStatus: 'ACTIVE', orgProductDomain: 'SCHOOL',
      relationshipKind: 'PARENT_CHILD',
    }]).mockResolvedValueOnce([{ allowed: true }])
    await expect(checkCampusCompositeAccessAuthority({ attemptId: 'att-1', userId: USER_ID })).resolves.toBe(true)
    // Non-SELF shapes still use bounded-planner full population validation.
    expect(dbMocks.executeRaw).toHaveBeenCalledTimes(1)
    expect(dbMocks.queryRaw).toHaveBeenCalledTimes(2)

    dbMocks.executeRaw.mockClear()
    dbMocks.queryRaw.mockResolvedValueOnce([])
    await expect(readRespondentRunSummary(USER_ID, EXEC_ID)).rejects.toMatchObject({ statusCode: 404 })
    expect(dbMocks.executeRaw).toHaveBeenCalledTimes(1)

    dbMocks.executeRaw.mockClear()
    const suppliedTxQuery = vi.fn().mockResolvedValueOnce([])
    await expect(
      readRespondentRunSummary(USER_ID, EXEC_ID, { disclosureOnly: true, db: { $queryRaw: suppliedTxQuery } as any }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(suppliedTxQuery).toHaveBeenCalledTimes(1)
    expect(dbMocks.executeRaw).not.toHaveBeenCalled()
  })

  it('drives listOwnTeacherScaleTasks from live actor memberships into flat population-scoped SQL', async () => {
    dbMocks.queryRaw.mockResolvedValueOnce([{
      organizationId: 'school', membershipId: 'teacher-member', personaGrantId: 'teacher-grant',
      usableForPopulation: true, hasRunStartDeny: false, hasReportReadDeny: false,
    }]).mockResolvedValueOnce([])
    await listOwnTeacherScaleTasks(USER_ID)

    expect(dbMocks.executeRaw).not.toHaveBeenCalled()
    expect(dbMocks.queryRaw).toHaveBeenCalledTimes(2)
    const membershipSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[0])
    const taskSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[1])
    expect(membershipSql).toContain('FROM "users" current_actor')
    expect(membershipSql).toContain('"organization_persona_grants" persona')
    expect(membershipSql).toContain('organization_access_denies')
    expect(taskSql).toContain('WITH candidate_execs AS MATERIALIZED')
    expect(taskSql).toContain('FROM candidate_execs e')
    expect(taskSql).toContain('JOIN "assessment_run_executions" e')
    expect(taskSql).toContain('"collectionTupleOk"')
    expect(taskSql).toContain('"reportTupleOk"')
    expect(taskSql).not.toContain('SELECT 1 FROM assessment_run_executions x JOIN organizations org')
  })

  it('maps START resource-gate 503 errors with Retry-After in errorHandler and all Teacher START routes', async () => {
    const cpuGateError = Object.assign(
      new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙，请稍后重试', 503),
      { preferredRetryAfterSeconds: 3 },
    )

    const directRes: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
    directRes.status.mockReturnValue(directRes)
    errorHandler(cpuGateError, {} as any, directRes, vi.fn())
    expect(directRes.status).toHaveBeenCalledWith(503)
    expect(directRes.setHeader).toHaveBeenCalledWith('Retry-After', '3')
    expect(directRes.json).toHaveBeenCalledWith({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      message: '系统繁忙，请稍后重试',
      data: null,
    })
    expect(logger.error).not.toHaveBeenCalled()

    // Malformed preferredRetryAfterSeconds falls back to 10s
    const fallbackRes: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
    fallbackRes.status.mockReturnValue(fallbackRes)
    errorHandler(
      Object.assign(new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '内存保护中', 503), { preferredRetryAfterSeconds: 0 }),
      {} as any,
      fallbackRes,
      vi.fn(),
    )
    expect(fallbackRes.setHeader).toHaveBeenCalledWith('Retry-After', '10')

    dbMocks.startRunExecution.mockRejectedValue(cpuGateError)
    dbMocks.queryRaw.mockResolvedValue([{
      allowed: true, orgStatus: 'ACTIVE', orgProductDomain: 'SCHOOL',
      relationshipKind: 'PARENT_CHILD',
      executionId: EXEC_ID,
      organizationId: 'org-1',
      runId: 'run-1',
      attemptId: null,
      assignmentId: 'assign-1',
      resourceKey: 'teacher-scale:demo:INDIVIDUAL',
      resourceVersion: '1.0.0',
      eventId: 'ev-1',
      eventTitle: 'Event',
      eventStatus: 'OPEN',
      formTitle: 'Form',
      status: 'ASSIGNED',
      runStatus: 'PUBLISHED',
      runtimeBindingKind: null,
      runtimeBindingRef: null,
      cursorCreatedAt: '2026-11-18T00:00:00.000000Z',
      runtimeKind: 'HUITEACHER_FORM_V2',
    }])

    for (const [router, path] of [
      [teacherScaleRouter, '/run-executions/:executionId/start-scale'],
      [teacherPrivateFormRouter, '/run-executions/:executionId/start-private-form'],
      [teacherFormRouter, '/run-executions/:executionId/start'],
    ] as const) {
      const res = await invokeStartRoute(router, path)
      expect(res.statusCode).toBe(503)
      expect(res.headers['retry-after']).toBe('3')
      expect(res.body).toEqual({
        code: 'INSTRUMENT_NOT_AVAILABLE',
        message: '系统繁忙，请稍后重试',
        data: null,
      })
    }

    const busyError = new AssessmentStartBusyError('P2024', 2, 'pool timeout')
    dbMocks.startRunExecution.mockRejectedValueOnce(busyError)
    const privateBusyRes = await invokeStartRoute(teacherPrivateFormRouter, '/run-executions/:executionId/start-private-form')
    expect(privateBusyRes.statusCode).toBe(503)
    expect(privateBusyRes.headers['retry-after']).toBe('2')
    expect(privateBusyRes.body).toMatchObject({ code: busyError.code, data: null })
  })

  it('caches decrypted frozen report-package slot labels per ciphertext and isolates caller mutations', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    dbMocks.readSnapshot.mockImplementation((cipher: string) => ({
      packageKey: 'pkg-1',
      packageVersion: '1.0.0',
      packageDefinition: {
        slots: [{ position: 0, label: cipher === 'cipher-v1' ? '专注力' : '工作记忆' }],
      },
    }))

    const first = getFrozenPackageSlotLabels({
      reportPackageKey: 'pkg-1',
      reportPackageVersion: '1.0.0',
      reportPackageSnapshotEncrypted: 'cipher-v1',
    })
    expect(first.get(0)).toBe('专注力')
    first.set(0, 'mutated-by-caller')

    const second = getFrozenPackageSlotLabels({
      reportPackageKey: 'pkg-1',
      reportPackageVersion: '1.0.0',
      reportPackageSnapshotEncrypted: 'cipher-v1',
    })
    expect(second.get(0)).toBe('专注力')
    expect(dbMocks.readSnapshot).toHaveBeenCalledTimes(1)

    const updated = getFrozenPackageSlotLabels({
      reportPackageKey: 'pkg-1',
      reportPackageVersion: '1.0.0',
      reportPackageSnapshotEncrypted: 'cipher-v2',
    })
    expect(updated.get(0)).toBe('工作记忆')
    expect(dbMocks.readSnapshot).toHaveBeenCalledTimes(2)
  })

  it('reads Survey public info without interactive transactions and caches measurementNotice by publicationId', async () => {
    vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
    vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
    dbMocks.findFirstProject.mockResolvedValue({
      id: 'proj-1',
      title: '调研项目',
      description: '说明',
      collectionMode: 'ANONYMOUS',
      status: 'ACTIVE',
      participantIdentityMode: 'ANONYMOUS',
      participantCodeLabel: null,
      participantCodeInstructions: null,
    })
    const waveRow = {
      id: 'wave-1',
      title: '第一波',
      ordinal: 1,
      status: 'OPEN',
      consentText: '知情同意正文',
      consentVersion: 1,
      opensAt: null,
      closesAt: null,
      allowNewParticipants: true,
      groupIpPolicy: null,
      groupIpActivatedAt: null,
      publicationId: 'pub-immutable-1',
    }
    dbMocks.queryRaw
      .mockResolvedValueOnce([waveRow])
      .mockResolvedValueOnce([{ id: 'pub-immutable-1', measurementNotice: null }])
      .mockResolvedValueOnce([waveRow])

    const first = await getPublicResearchInfo(PUBLIC_ID)
    expect(first.waves).toHaveLength(1)
    expect(first.waves[0]).not.toHaveProperty('publicationId')
    expect(dbMocks.transaction).not.toHaveBeenCalled()
    expect(dbMocks.queryRaw).toHaveBeenCalledTimes(2)

    const second = await getPublicResearchInfo(PUBLIC_ID)
    expect(second.waves).toHaveLength(1)
    expect(dbMocks.transaction).not.toHaveBeenCalled()
    // Warm publicationId skips survey_publications TOAST lookup completely.
    expect(dbMocks.queryRaw).toHaveBeenCalledTimes(3)
  })

  it('routes all product logins and whole-delivery endpoints in nginx.conf and disables PG JIT in compose', () => {
    const nginxConf = readFileSync(resolve(process.cwd(), '../frontend/nginx.conf'), 'utf8')
    const wholeMatch = /location ~ (\^\/api\/[^\s]+)\s*\{[^{}]*?proxy_pass http:\/\/eduk12_whole_apis;[^{}]*?proxy_next_upstream off;/.exec(nginxConf)
    const loginMatch = /location ~ (\^\/api\/[^\s]+)\s*\{[^{}]*?proxy_pass http:\/\/eduk12_login_api;/.exec(nginxConf)
    expect(wholeMatch).not.toBeNull()
    expect(loginMatch).not.toBeNull()

    const wholeRegex = new RegExp(wholeMatch![1])
    const loginRegex = new RegExp(loginMatch![1])

    for (const loginPath of [
      '/api/auth/training-login',
      '/api/auth/login',
      '/api/campus/auth/login',
      '/api/huiteacher/auth/login',
      '/api/survey/auth/login',
    ]) {
      expect(loginRegex.test(loginPath), loginPath).toBe(true)
    }
    expect(loginRegex.test('/api/campus/auth/me')).toBe(false)

    for (const wholePath of [
      '/api/composite-assessments/attempts/att-1/whole/definition',
      '/api/public/composite-assessments/attempts/att-1/whole/template/abc123',
      '/api/public/composite-assessments/attempts/att-1/whole/submit',
      '/api/public/composite-assessments/attempts/att-1/report-status',
      '/api/campus/composite-attempts/att-1/whole',
      '/api/campus/composite-attempts/att-1/whole/definition',
      '/api/campus/composite-attempts/att-1/whole/template/abc123',
      '/api/campus/composite-attempts/att-1/whole/submit',
      '/api/campus/composite-attempts/att-1/whole/receipt',
      '/api/huiteacher/assessment-composite-attempts/att-1/whole',
      '/api/huiteacher/assessment-composite-attempts/att-1/whole/submit',
      '/api/huiteacher/student-assessments/assessment-composite-attempts/att-1/whole',
      '/api/huiteacher/student-assessments/assessment-composite-attempts/att-1/whole/submit',
      '/api/survey/public/r/proj-1/attempts/att-1/final',
    ]) {
      expect(wholeRegex.test(wholePath), wholePath).toBe(true)
    }
    expect(wholeRegex.test('/api/campus/student/tasks')).toBe(false)

    const baseCompose = readFileSync(resolve(process.cwd(), '../docker-compose.yml'), 'utf8')
    const prodOverride = readFileSync(resolve(process.cwd(), '../docker-compose.prod-override.example.yml'), 'utf8')
    expect(baseCompose).toContain('jit=off')
    expect(baseCompose).not.toContain('plan_cache_mode=force_custom_plan')
    expect(prodOverride).toContain('jit=off')
    expect(prodOverride).not.toContain('plan_cache_mode=force_custom_plan')
    const scopedPlanner = readFileSync(resolve(process.cwd(), 'src/modules/assessment-run/plannerBound.ts'), 'utf8')
    expect(scopedPlanner).toContain("set_config('plan_cache_mode', 'force_custom_plan', true)")
  })

  it('coalesces School listCampusStudentTasks activities and linked_runs into one CTE query with actor_grants materialization', async () => {
    const queries: string[] = []
    dbMocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
      const sql = flattenQueryRawCall(args)
      queries.push(sql)
      if (sql.includes('WITH actor_grants AS MATERIALIZED')) {
        return [{
          organizationId: 'org-1',
          membershipId: 'mem-1',
          personaGrantId: 'pg-1',
          accountNotExpired: true,
        }]
      }
      if (sql.includes('WITH activities AS MATERIALIZED') && sql.includes('linked_runs AS MATERIALIZED')) {
        return [{
          activities: [{
            courseId: 'course-1',
            organizationId: 'org-1',
            title: 'Activity 1',
            membershipIds: ['mem-1'],
          }],
          linkedRuns: [{
            courseId: 'course-1',
            runId: 'run-1',
            organizationId: 'org-1',
            hasHuiteacherLink: false,
          }],
          assignments: [{
            id: 'asg-1',
            courseId: 'course-1',
            title: 'Assignment 1',
            deadline: '2026-12-01T00:00:00.000Z',
            tags: [],
            complete: false,
          }],
          checkins: [],
        }]
      }
      return []
    })

    const result = await listCampusStudentTasks(
      { userId: USER_ID, role: 'STUDENT' as any, accountDomain: 'SCHOOL' as any } as any,
      { page: 1, pageSize: 20 },
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0]?.id).toBe('asg-1')
    expect(queries.some(q => q.includes('WITH actor_grants AS MATERIALIZED'))).toBe(true)
    expect(queries.some(q => q.includes('WITH activities AS MATERIALIZED') && q.includes('linked_runs AS MATERIALIZED') && q.includes('activity_assignments AS MATERIALIZED'))).toBe(true)
  })

  it('coalesces reconcileRunExecutionByRuntimeBinding lock and dual completion updates into 3 queries instead of 5', async () => {
    const completedAt = new Date('2026-11-20T00:00:00.000Z')
    const queries: string[] = []
    dbMocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
      const sql = flattenQueryRawCall(args)
      queries.push(sql)
      if (sql.includes('FROM "assessment_run_executions"') && sql.includes('FOR UPDATE')) {
        return [{
          id: EXEC_ID,
          status: 'IN_PROGRESS',
          completedAt: null,
          relationalAssignmentId: 'rel-1',
          runtimeBindingKind: 'COMPOSITE',
          runtimeBindingRef: 'att-1',
        }]
      }
      if (sql.includes('FROM "composite_assessment_attempts"') && sql.includes('FOR UPDATE')) {
        return [{
          status: 'COMPLETED',
          completedAt,
          assignmentRef: 'rel-1',
        }]
      }
      if (sql.includes('WITH valid_rel AS') && sql.includes('updated_exec AS') && sql.includes('updated_rel AS')) {
        return [{ changed: 1 }]
      }
      return []
    })

    const res = await reconcileRunExecutionByRuntimeBinding({
      runtimeBindingKind: 'COMPOSITE',
      runtimeBindingRef: 'att-1',
    })
    expect(res).toEqual({ state: 'COMPLETED', completedAt, replayed: false })
    expect(queries).toHaveLength(3)
    expect(queries[2]).toContain('WITH valid_rel AS')
    expect(queries[2]).toContain('updated_exec AS')
    expect(queries[2]).toContain('updated_rel AS')
    expect(queries[2]).toContain('EXISTS (SELECT 1 FROM valid_rel)')

    // When valid_rel fails (e.g. relational assignment missing, wrong status, or mismatched completed_at),
    // updated_exec updates 0 rows and reconcileRunExecutionByRuntimeBinding rejects with RUN_RECONCILIATION_CONFLICT.
    dbMocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
      const sql = flattenQueryRawCall(args)
      if (sql.includes('FROM "assessment_run_executions"') && sql.includes('FOR UPDATE')) {
        return [{
          id: EXEC_ID,
          status: 'IN_PROGRESS',
          completedAt: null,
          relationalAssignmentId: 'rel-invalid',
          runtimeBindingKind: 'COMPOSITE',
          runtimeBindingRef: 'att-1',
        }]
      }
      if (sql.includes('FROM "composite_assessment_attempts"') && sql.includes('FOR UPDATE')) {
        return [{
          status: 'COMPLETED',
          completedAt,
          assignmentRef: 'rel-invalid',
        }]
      }
      if (sql.includes('WITH valid_rel AS')) {
        return [{ changed: 0 }]
      }
      return []
    })
    await expect(
      reconcileRunExecutionByRuntimeBinding({
        runtimeBindingKind: 'COMPOSITE',
        runtimeBindingRef: 'att-1',
      }),
    ).rejects.toMatchObject({ code: 'RUN_RECONCILIATION_CONFLICT', statusCode: 409 })
  })

  it('freezes and retains inner scale definitions on loadStartComposite while isolating outer envelope and all non-frozen nested JSON mutations in cloneCachedStartComposite', async () => {
    resetStartReadCachesForTests()
    const updatedAt = new Date('2026-11-20T00:00:00.000Z')
    const scaleDefinition = {
      schemaVersion: 2,
      respondentType: 'SELF',
      display: {},
      responseSets: [{ key: 'rs1', options: [{ value: 1, label: 'A', score: 1 }, { value: 2, label: 'B', score: 2 }] }],
      items: [{ itemCode: 'q1', content: 'Q1', type: 'single', required: true, sortOrder: 1, responseSetKey: 'rs1', randomizeOptions: false }],
      scoring: { itemRules: [], scores: [] },
    }
    const snapshot = { schemaVersion: 2, compositeId: 'comp-1', units: [] }
    const db = {
      $queryRaw: vi.fn(async () => []),
      compositeAssessment: {
        findUnique: vi.fn(async () => ({
          id: 'comp-1',
          updatedAt,
          trainingContentSnapshotHash: 'hash-1',
          trainingContentSnapshot: snapshot,
          personalTracking: null,
          trainingVariantFrozen: { groups: [{ weight: 100, selectedItemIds: ['item-1'] }] },
          questionnaireCourses: [{ courseId: 'c-1', course: { id: 'c-1', title: 'Course 1' } }],
          creator: { id: 'u-1', role: 'TEACHER' },
          course: { id: 'c-1', title: 'Course 1', courseCode: 'C1', isLibrary: false },
          items: [{
            id: 'item-1',
            type: 'SCALE',
            scale: {
              id: 'scale-1',
              code: 'S1',
              definition: scaleDefinition,
            },
            cognitiveAssignment: {
              id: 'ca-1',
              config: { id: 'cfg-1', parameters: { trials: 20, nested: { speed: 1 } } },
            },
          }],
          formSections: [{ id: 'sec-1', items: [{ id: 'fi-1', formOptions: ['opt-a', 'opt-b'] }] }],
        })),
      },
    }

    const first: any = await loadStartComposite('comp-1', db as any, {
      updatedAt,
      trainingContentSnapshotHash: 'hash-1',
    })
    const second: any = await loadStartComposite('comp-1', db as any, {
      updatedAt,
      trainingContentSnapshotHash: 'hash-1',
    })

    expect(db.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
    // Inner immutable ASTs are registered with retainImmutableCanonicalValue and shared by reference
    expect(hasImmutableCanonicalValue(first.items[0].scale.definition)).toBe(true)
    expect(Object.isFrozen(first.items[0].scale.definition)).toBe(true)
    expect(first.items[0].scale.definition).toBe(second.items[0].scale.definition)
    expect(first.trainingContentSnapshot).toBe(second.trainingContentSnapshot)
    // Outer mutable envelopes and all non-frozen nested JSON trees are deep-isolated per request
    expect(first).not.toBe(second)
    expect(first.items).not.toBe(second.items)
    expect(first.items[0]).not.toBe(second.items[0])
    expect(first.items[0].scale).not.toBe(second.items[0].scale)
    first.deliveryCourseId = 'mutated-course'
    first.trainingVariantFrozen.groups[0].weight = 50
    first.items[0].cognitiveAssignment.config.parameters.trials = 999
    first.items[0].cognitiveAssignment.config.parameters.nested.speed = 99
    first.formSections[0].items[0].formOptions.push('mutated-opt')

    expect(second.deliveryCourseId).toBeUndefined()
    expect(second.trainingVariantFrozen.groups[0].weight).toBe(100)
    expect(second.items[0].cognitiveAssignment.config.parameters.trials).toBe(20)
    expect(second.items[0].cognitiveAssignment.config.parameters.nested.speed).toBe(1)
    expect(second.formSections[0].items[0].formOptions).toEqual(['opt-a', 'opt-b'])

    // Verify personalTracking and fallback isolation when scale.definition or trainingContentSnapshot
    // is NOT frozen (e.g., if canonical encoding threw due to non-canonical NaN/undefined)
    const unfrozenFallback = {
      personalTracking: { rules: [{ weight: 1 }] },
      trainingContentSnapshot: { nonCanonical: Number.NaN, nested: { a: 1 } },
      items: [{ scale: { definition: { nonCanonical: Number.NaN, nested: { b: 2 } } } }],
    }
    const fallbackA = cloneCachedStartComposite(unfrozenFallback)
    const fallbackB = cloneCachedStartComposite(unfrozenFallback)
    fallbackA.personalTracking.rules[0].weight = 2
    fallbackA.trainingContentSnapshot.nested.a = 99
    fallbackA.items[0].scale.definition.nested.b = 88
    expect(fallbackB.personalTracking.rules[0].weight).toBe(1)
    expect(fallbackB.trainingContentSnapshot.nested.a).toBe(1)
    expect(fallbackB.items[0].scale.definition.nested.b).toBe(2)
    expect(cloneCachedStartComposite(null)).toBeNull()
  })

  it('anchors checkCampusCompositeAccessDetails with WITH target_exec AS MATERIALIZED and skips redundant feedback context reads on preloaded non-receipt Teacher submits', async () => {
    dbMocks.queryRaw.mockResolvedValueOnce([{
      executionId: EXEC_ID,
      orgStatus: 'ACTIVE',
      orgProductDomain: 'SCHOOL',
      relationshipKind: 'PARENT_CHILD',
    }]).mockResolvedValueOnce([{ allowed: true }])
    await expect(checkCampusCompositeAccessAuthority({ attemptId: 'att-1', userId: USER_ID })).resolves.toBe(true)
    const accessSql = flattenQueryRawCall(dbMocks.queryRaw.mock.calls[0])
    expect(accessSql).toContain('WITH target_exec AS MATERIALIZED')

    // Non-receipt Teacher scale submit with _preloadedRelationalFeedbackParent
    // only queries relational_assessment_assignments once (skipping composite_assessment_attempts & composite_report_jobs).
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        perspective: 'SELF_REPORT',
        analysisMode: 'INDIVIDUAL_ONLY',
      }]),
      compositeAssessmentAttempt: { findUnique: vi.fn() },
      compositeReportJob: { findUnique: vi.fn() },
    }
    const payload: Record<string, unknown> = {
      submissionId: 'sub-1',
      payloadHash: 'hash-1',
      replayed: false,
      completed: true,
      result: { totalScore: 10 },
    }
    Object.defineProperty(payload, '_preloadedRelationalFeedbackParent', {
      value: { assignmentRef: 'rel-1', respondentType: 'TEACHER' },
    })
    const projected = await projectRelationalUnitFinalResponse('att-teacher-1', payload, mockDb)
    expect(projected).toBe(payload)
    expect(mockDb.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
    expect(mockDb.compositeReportJob.findUnique).not.toHaveBeenCalled()
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1)
  })
})
