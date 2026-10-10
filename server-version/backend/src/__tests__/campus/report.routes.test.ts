import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentPortalError } from '../../modules/parent-portal/contracts'

const state = vi.hoisted(() => ({
  config: { parentPortalEnabled: true },
  parent: {
    children: vi.fn(), reports: vi.fn(), readReport: vi.fn(),
    studentReportOptions: vi.fn(), reportConsentPreview: vi.fn(),
    acceptReportConsent: vi.fn(), grantReport: vi.fn(), revokeReport: vi.fn(),
    disclosureConsents: vi.fn(),
  },
  publisher: { list: vi.fn(), templates: vi.fn(), preview: vi.fn(), publish: vi.fn() },
  studentStatus: vi.fn(),
  participant: { list: vi.fn(), read: vi.fn() },
}))
vi.mock('../../config', () => ({ config: state.config }))
vi.mock('../../modules/parent-portal/service', () => ({ parentPortalService: state.parent }))
vi.mock('../../modules/parent-portal/publisher', () => ({ parentPublisher: state.publisher }))
vi.mock('../../modules/campus/admission.service', () => ({ readCampusStudentStatus: state.studentStatus }))
vi.mock('../../modules/reporting/participantService', () => ({
  listParticipantLongitudinal: state.participant.list,
  readParticipantLongitudinal: state.participant.read,
}))
vi.mock('../../middleware/auth', () => ({
  authenticateSchool: (req: any, res: any, next: any) => {
    if (!req.headers['x-school-user']) return res.status(401).json({ code: 401, data: null })
    req.user = { userId: req.headers['x-school-user'], role: req.headers['x-school-role'] ?? 'PARENT', accountDomain: 'SCHOOL', platformRole: 'STANDARD' }
    next()
  },
}))
vi.mock('../../modules/campus/mfa.middleware', () => ({
  requireRecentSchoolMfa: (req: any, res: any, next: any) => {
    if (req.headers['x-recent-school-mfa'] !== 'true') return res.status(403).json({ code: 403, data: null })
    next()
  },
}))
vi.mock('../../middleware/redisRateLimit', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}))

import campusReportRoutes from '../../modules/campus/report.routes'
import { csrfProtection } from '../../middleware/csrf'

const CHILD = '00000000-0000-4000-8000-000000000001'
const ARTIFACT = '00000000-0000-4000-8000-000000000002'
const LINK = '00000000-0000-4000-8000-000000000003'
let server: Server, origin: string
const url = (path: string) => origin + '/api/campus' + path
async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return fetch(url(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-school-user': 'school-parent',
      'x-school-role': 'PARENT',
      'Cookie': 'huischool_csrf=school-token',
      'X-CSRF-Token': 'school-token',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('Huischool governed report HTTP surface', () => {
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api', csrfProtection)
    app.use('/api/campus', campusReportRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing test port')
    origin = 'http://127.0.0.1:' + address.port
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.parentPortalEnabled = true
    state.parent.children.mockResolvedValue({ list: [] })
    state.parent.reports.mockResolvedValue({ list: [] })
    state.parent.readReport.mockResolvedValue({ audience: 'PARENT', mode: 'COMPLETION_ONLY', blocks: [] })
    state.parent.studentReportOptions.mockResolvedValue({ list: [] })
    state.parent.reportConsentPreview.mockResolvedValue({ canConsent: false })
    state.studentStatus.mockResolvedValue({ status: 'APPROVED' })
    state.participant.list.mockResolvedValue({ list: [] })
    state.participant.read.mockResolvedValue({ metrics: {} })
  })

  it('never accepts a legacy/training credential as a campus session', async () => {
    const response = await request('/reports/parent/children', 'GET', undefined, { 'x-school-user': '', 'x-training-user': 'training-parent' })
    expect(response.status).toBe(401)
    expect(state.parent.children).not.toHaveBeenCalled()
  })
  it('remains closed while the reviewed parent portal feature is disabled', async () => {
    state.config.parentPortalEnabled = false
    const response = await request('/reports/parent/children')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(state.parent.children).not.toHaveBeenCalled()
  })
  it('passes authenticated SCHOOL parent identity to the existing per-grant read policy', async () => {
    const response = await request('/reports/parent/children/' + CHILD + '/reports/' + ARTIFACT)
    expect(response.status).toBe(200)
    expect(state.parent.readReport).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'school-parent', accountDomain: 'SCHOOL' }), CHILD, ARTIFACT,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('denies revoked or absent grants without returning report content', async () => {
    state.parent.readReport.mockRejectedValue(new ParentPortalError('PARENT_RESOURCE_NOT_FOUND', 404))
    const response = await request('/reports/parent/children/' + CHILD + '/reports/' + ARTIFACT)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ data: null })
  })
  it('does not show student feedback before class approval', async () => {
    state.studentStatus.mockResolvedValue({ status: 'PENDING_CLASS_APPROVAL' })
    const response = await request('/reports/student/longitudinal', 'GET', undefined, { 'x-school-role': 'STUDENT' })
    expect(response.status).toBe(404)
    expect(state.participant.list).not.toHaveBeenCalled()
  })
  it('refuses consent mutation without matching SCHOOL CSRF', async () => {
    const response = await request('/reports/relationships/' + LINK + '/artifacts/' + ARTIFACT + '/consent', 'POST', {
      consentVersion: 'v1', commandKey: '0123456789abcdef',
    }, { 'x-school-role': 'STUDENT', 'X-CSRF-Token': 'incorrect' })
    expect(response.status).toBe(403)
    expect(state.parent.acceptReportConsent).not.toHaveBeenCalled()
  })
  it('rejects caller-supplied parent identity and accepts only the fixed report binding', async () => {
    const response = await request('/reports/relationships/' + LINK + '/artifacts/' + ARTIFACT + '/consent', 'POST', {
      consentVersion: 'v1', commandKey: '0123456789abcdef', parentUserId: 'anyone',
    }, { 'x-school-role': 'STUDENT' })
    expect(response.status).toBe(400)
    expect(state.parent.acceptReportConsent).not.toHaveBeenCalled()
  })
  it('rejects officer disclosure grants without a recent CAMPUS TOTP step-up', async () => {
    const response = await request('/reports/relationships/' + LINK + '/artifacts/' + ARTIFACT + '/grants', 'POST', {
      commandKey:'0123456789abcdef', consentId:CHILD,
    }, { 'x-school-role':'TEACHER' })
    expect(response.status).toBe(403)
    expect(state.parent.grantReport).not.toHaveBeenCalled()
  })
  it('rejects report publication without a recent CAMPUS TOTP step-up', async () => {
    const response = await request('/reports/officer/artifacts/' + ARTIFACT + '/publish', 'POST', {
      templateKey:'parent-report-availability',templateVersion:'1.0.0',
      previewHash:'a'.repeat(64),expectedVersion:0,commandKey:'0123456789abcdef',
    }, { 'x-school-role':'ADMIN' })
    expect(response.status).toBe(403)
    expect(state.publisher.publish).not.toHaveBeenCalled()
  })
  it('preserves an officer source/permission denial on the school reporting endpoint', async () => {
    state.publisher.list.mockRejectedValue(new ParentPortalError('PARENT_RESOURCE_NOT_FOUND', 404))
    const response = await request('/reports/officer/artifacts?organizationId=' + CHILD, 'GET', undefined, { 'x-school-role': 'ADMIN' })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ data: null })
  })
})
