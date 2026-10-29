import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), verify: vi.fn(), tools: vi.fn(), create: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  $queryRaw: m.query,
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: m.query, educationPrivateTool: { findMany: m.tools, create: m.create } }),
} }))
vi.mock('../../utils/jwt', async original => ({ ...await original<Record<string, unknown>>(), verifyToken: m.verify }))
// Exercise the real routers and authority SQL. Authentication itself has its
// own tests; these distinct stubs establish which product middleware is wired.
vi.mock('../../middleware/auth', () => ({
  authenticateSchool: (req: any, res: any, next: any) => {
    if (req.headers['x-session-entry'] !== 'SCHOOL') return res.status(401).json({ data: null })
    req.user = { userId: 'actor', accountDomain: 'SCHOOL' }; next()
  },
  authenticateHuiteacher: (req: any, res: any, next: any) => {
    if (req.headers['x-session-entry'] !== 'TEACHER') return res.status(401).json({ data: null })
    req.user = { userId: 'actor', accountDomain: 'SCHOOL' }; next()
  },
}))
vi.mock('../../modules/organization/organization.controller', () => ({ organizationController: {
  listAccessible: vi.fn(), readContext: vi.fn(), grantCapability: vi.fn(), revokeCapability: vi.fn(),
} }))
vi.mock('../../modules/organization/organization.admin.controller', () => ({ organizationAdminController: {
  listUnits: vi.fn(), createUnit: vi.fn(), deleteUnit: vi.fn(), listStaffClassAssignments: vi.fn(),
  assignStaff: vi.fn(), endStaffAssignment: vi.fn(), listStudentClassAssignments: vi.fn(),
  assignStudent: vi.fn(), endStudentAssignment: vi.fn(),
} }))
vi.mock('../../modules/organization/access', () => ({ requireOrganizationGovernance: vi.fn() }))
vi.mock('../../modules/campus/mfa.middleware', () => ({ requireRecentSchoolMfa: vi.fn() }))
vi.mock('../../modules/campus/capabilityGuard', () => ({ guardCampusCapabilityGrant: vi.fn() }))
vi.mock('../../modules/campus/classRead.middleware', () => ({ requireCampusClassRead: vi.fn() }))
vi.mock('../../modules/campus/admission.service', () => ({ CampusAdmissionError: class extends Error {} }))
vi.mock('../../modules/campus/relationships.service', () => ({
  readCampusRelationshipDirectory: vi.fn(), appointCampusCounselorClient: vi.fn(),
  endCampusCounselorClient: vi.fn(), assignCampusStaffClass: vi.fn(), endCampusStaffClass: vi.fn(),
}))

import schoolRoutes from '../../modules/campus/organization.routes'
import teacherRoutes from '../../modules/huiteacher/organization.routes'

const org = '00000000-0000-4000-8000-000000000001'
let server: Server, origin: string
const row = { organizationId: org, organizationName: 'Private name', membershipId: 'private-member', orgRole: 'MEMBER', productAdmin: false }
const endpoints = [['SCHOOL', 'campus', 'HUISCHOOL'], ['TEACHER', 'huiteacher', 'HUITEACHER']] as const
const request = (prefix: string, entry?: string, id = org, query = '') => fetch(`${origin}/${prefix}/organizations/${id}/tool-authoring-capabilities${query}`, {
  headers: entry ? { 'x-session-entry': entry, cookie: 'huiteacher_session=fixture' } : {},
})

describe('School/Teacher read-only tool authoring capability routes', () => {
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/campus', schoolRoutes)
    app.use('/huiteacher', teacherRoutes)
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ code: 'INTERNAL_ERROR', data: null })
    })
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('missing test port')
    origin = 'http://127.0.0.1:' + address.port
  })
  afterAll(async () => {
    server?.closeAllConnections()
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  })
  beforeEach(() => {
    vi.clearAllMocks(); m.query.mockResolvedValue([row]); m.tools.mockResolvedValue([])
    // Routine authoring accepts an existing administrative MFA login; it
    // must not introduce a fresh five-minute challenge on every save.
    m.verify.mockReturnValue({ userId: 'actor', accountDomain: 'SCHOOL', sessionProduct: 'HUITEACHER', mfaVerifiedAt: Math.floor(Date.now() / 1000) - 600 })
  })
  it.each(endpoints)('%s selects its own authentication and fixed product despite forged query', async (entry, prefix, product) => {
    const other = entry === 'SCHOOL' ? 'TEACHER' : 'SCHOOL'
    expect((await request(prefix)).status).toBe(401)
    expect((await request(prefix, other)).status).toBe(401)
    expect(m.query).not.toHaveBeenCalled()
    m.query.mockResolvedValue([{ ...row, productAdmin: entry === 'TEACHER' }])
    const response = await request(prefix, entry, org, `?entry=${other}&product=TRAINING&organizationId=other&userId=other&canAuthor=true`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).data).toEqual({ canAuthor: true, authorableToolKinds: ['SCALE', 'FORM', 'COMPOSITION'] })
    expect(m.query).toHaveBeenCalledTimes(1)
    const sql = m.query.mock.calls[0][0]
    expect(sql.values).toContain(product)
    expect(sql.values).toContain(org)
    expect(sql.values).toContain('actor')
    expect(sql.values).not.toContain('TRAINING')
    expect(sql.values).not.toContain('other')
  })
  it('does not grant Teacher authoring to a member or psychology teacher without product administration', async () => {
    const hint = await request('huiteacher', 'TEACHER')
    expect((await hint.json()).data).toEqual({ canAuthor: false, authorableToolKinds: [] })
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${origin}/huiteacher/organizations/${org}/private-tools`, {
        method, headers: { 'x-session-entry': 'TEACHER', cookie: 'huiteacher_session=fixture', 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ kind: 'FORM', title: 'Must not create' }) } : {}),
      })
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('PRIVATE_TOOL_AUTHOR_REQUIRED')
    }
    expect(m.tools).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })
  it('blocks password-only or foreign Teacher admin sessions before private data access or capability SQL', async () => {
    for (const claims of [
      { userId: 'actor', accountDomain: 'SCHOOL', sessionProduct: 'HUITEACHER' },
      { userId: 'other', accountDomain: 'SCHOOL', sessionProduct: 'HUITEACHER', mfaVerifiedAt: 1 },
      { userId: 'actor', accountDomain: 'SCHOOL', sessionProduct: 'HUISCHOOL', mfaVerifiedAt: 1 },
      { userId: 'actor', accountDomain: 'SCHOOL', sessionProduct: 'HUITEACHER', mfaVerifiedAt: Math.floor(Date.now() / 1000) + 600 },
    ]) {
      m.verify.mockReturnValue(claims)
      expect((await request('huiteacher', 'TEACHER')).status).toBe(403)
      expect((await fetch(`${origin}/huiteacher/organizations/${org}/private-tools`, {
        headers: { 'x-session-entry': 'TEACHER', cookie: 'huiteacher_session=fixture' },
      })).status).toBe(403)
    }
    expect(m.query).not.toHaveBeenCalled()
    expect(m.tools).not.toHaveBeenCalled()
  })
  it('lists a current Teacher administrator’s own tools with one authority query and no fresh MFA step-up', async () => {
    m.query.mockResolvedValue([{ ...row, productAdmin: true }])
    const response = await fetch(`${origin}/huiteacher/organizations/${org}/private-tools`, {
      headers: { 'x-session-entry': 'TEACHER', cookie: 'huiteacher_session=fixture' },
    })
    expect(response.status).toBe(200)
    expect(m.query).toHaveBeenCalledTimes(1)
    expect(m.tools).toHaveBeenCalledWith(expect.objectContaining({ where: { entry: 'TEACHER', organizationId: org, ownerUserId: 'actor', kind: { in: ['SCALE', 'FORM'] } }, take: 51 }))
    expect((await response.json()).data.list).toEqual([])
    const questionnaire = await fetch(`${origin}/huiteacher/organizations/${org}/private-tools?kind=COMPOSITION`, {
      headers: { 'x-session-entry': 'TEACHER', cookie: 'huiteacher_session=fixture' },
    })
    expect(questionnaire.status).toBe(200)
    expect(m.query).toHaveBeenCalledTimes(2) // one current authority read per request
    expect(m.tools).toHaveBeenLastCalledWith(expect.objectContaining({ where: { entry: 'TEACHER', organizationId: org, ownerUserId: 'actor', kind: 'COMPOSITION' }, take: 51 }))
    expect((await questionnaire.json()).data.list).toEqual([])
  })
  it.each(endpoints)('%s rejects invalid IDs before SQL and does not swallow database failures', async (entry, prefix) => {
    expect((await request(prefix, entry, 'invalid')).status).toBe(400)
    expect(m.query).not.toHaveBeenCalled()
    m.query.mockRejectedValue(new Error('database unavailable'))
    const response = await request(prefix, entry)
    expect(response.status).toBe(500)
    expect((await response.json()).data).toBeNull()
  })
  it.each(endpoints)('%s returns the same minimal false hint for absent authority', async (entry, prefix) => {
    m.query.mockResolvedValue([])
    const response = await request(prefix, entry)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).data).toEqual({ canAuthor: false, authorableToolKinds: [] })
    expect(m.query).toHaveBeenCalledTimes(1)
  })
})
