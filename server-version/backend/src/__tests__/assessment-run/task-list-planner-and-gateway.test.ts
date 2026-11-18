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
import { listAssignedRunTasks } from '../../modules/assessment-run/productRead'
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
import { logger } from '../../utils/logger'

const EXEC_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PUBLIC_ID = '33333333-3333-4333-8333-333333333333'

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

  it('applies transaction-local join/from collapse bounds and falls back cleanly for bare mocks', async () => {
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
      'SET LOCAL join_collapse_limit = 1',
      'SET LOCAL from_collapse_limit = 1',
    ])

    const bareQuery = vi.fn().mockResolvedValueOnce(['bare'])
    const bareResult = await withBoundedPlannerRead(
      { $queryRaw: bareQuery as any },
      client => client.$queryRaw`SELECT 1`,
    )
    expect(bareResult).toEqual(['bare'])
    expect(bareQuery).toHaveBeenCalledTimes(1)
  })

  it('scopes listAssignedRunTasks by organizationIds and expands boundCompositeContinuationSql only once', async () => {
    expect(await listAssignedRunTasks(USER_ID, { organizationIds: [] })).toEqual({
      list: [],
      truncated: false,
      nextCursor: null,
    })
    expect(dbMocks.queryRaw).not.toHaveBeenCalled()

    dbMocks.queryRaw.mockResolvedValueOnce([])
    await listAssignedRunTasks(USER_ID, {
      organizationIds: ['org-school-1'],
      runIds: ['run-1'],
      preserveBoundSchoolContinuation: true,
    })

    expect(dbMocks.executeRaw).toHaveBeenCalledTimes(2)
    const callSql = dbMocks.queryRaw.mock.calls[0].map(sqlText).join(' ')
    expect(callSql).toContain('unnest(ARRAY[')
    expect(callSql).toContain('respondent."run_id" IN (')
    // Previously expanded 3 times across SELECT, CASE WHEN, and WHERE; now materialized once via LATERAL.
    expect(callSql.match(/FROM "assessment_run_executions" bound_execution/g)).toHaveLength(1)
  })

  it('drives listOwnTeacherScaleTasks from actor memberships and deduplicates collection population SQL', async () => {
    dbMocks.queryRaw.mockResolvedValueOnce([])
    await listOwnTeacherScaleTasks(USER_ID)

    expect(dbMocks.executeRaw).toHaveBeenCalledTimes(2)
    const sql = sqlText(dbMocks.queryRaw.mock.calls[0][0])
    expect(sql.indexOf('FROM "users" current_actor')).toBeLessThan(sql.indexOf('JOIN "assessment_run_executions" e'))
    // Previously expanded 3 times (2 COLLECTION + 1 REPORT_READ); now 1 COLLECTION via LATERAL + 1 REPORT_READ.
    expect(sql.match(/SELECT 1 FROM assessment_run_executions x JOIN organizations org/g)).toHaveLength(2)
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
      '/api/campus/composite-attempts/att-1/whole/definition',
      '/api/campus/composite-attempts/att-1/whole/template/abc123',
      '/api/campus/composite-attempts/att-1/whole/submit',
      '/api/campus/composite-attempts/att-1/whole/receipt',
      '/api/huiteacher/assessment-composite-attempts/att-1/whole/submit',
      '/api/huiteacher/student-assessments/assessment-composite-attempts/att-1/whole/submit',
      '/api/survey/public/r/proj-1/attempts/att-1/final',
    ]) {
      expect(wholeRegex.test(wholePath), wholePath).toBe(true)
    }
    expect(wholeRegex.test('/api/campus/student/tasks')).toBe(false)

    const baseCompose = readFileSync(resolve(process.cwd(), '../docker-compose.yml'), 'utf8')
    const prodOverride = readFileSync(resolve(process.cwd(), '../docker-compose.prod-override.example.yml'), 'utf8')
    expect(baseCompose).toContain('jit=off')
    expect(prodOverride).toContain('jit=off')
  })
})
