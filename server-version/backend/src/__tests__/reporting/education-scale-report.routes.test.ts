import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ reader: vi.fn(), status: vi.fn(), deliver: vi.fn() }))
vi.mock('../../middleware/auth', () => {
  const auth = (role: string) => (req: any, res: any, next: any) => {
    if (!req.headers['x-test-user']) return res.status(401).end()
    req.user = { userId: req.headers['x-test-user'], role: req.headers['x-test-role'] ?? role }; next()
  }
  return { authenticateSchool: auth('STUDENT'), authenticateHuiteacher: auth('TEACHER') }
})
vi.mock('../../modules/campus/admission.service', () => ({ readCampusStudentStatus: m.status }))
vi.mock('../../modules/reporting/education-scale-personal-report.service', () => ({ readEducationRespondentScaleReport: m.reader }))
// The projected-image selector remains real; only external asset transport is mocked.
vi.mock('../../modules/assessment-media/assessment-image-delivery', () => ({ serveAssessmentImageContent: m.deliver }))
import { educationSchoolScaleReportRouter, educationTeacherScaleReportRouter } from '../../modules/reporting/education-scale-report.routes'
const execution = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reference = { assetId: 'report-asset', contentHash: 'a'.repeat(64), mimeType: 'image/png' }
let server: Server, base: string
beforeAll(async () => {
  const app = express(); app.use('/school', educationSchoolScaleReportRouter); app.use('/teacher', educationTeacherScaleReportRouter)
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode ?? 500).json({ code: error.code ?? 'ERROR' }))
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => {
  vi.resetAllMocks(); m.status.mockResolvedValue({ status: 'APPROVED' })
  m.reader.mockResolvedValue({ schemaVersion: 1, kind: 'EDUCATION_SCALE_PERSONAL_REPORT', state: 'READY', mode: 'INDIVIDUAL_SUMMARY',
    unitReports: [{ type: 'SCALE', rawScoreFeedback: [{ scoreKey: 'score', rangeKey: 'range', text: 'Feedback',
      images: [{ asset: reference, altText: 'Feedback illustration', order: 0 }] }] }] })
  m.deliver.mockImplementation(async ({ res }) => res.type('image/png').send('mock-image'))
})
const url = (product: string, image?: string) => `${base}/${product}/library-scale/executions/${execution}/report${image ? '/images/' + image : ''}`
const headers = { 'x-test-user': 'owner' }
describe('education personal report JSON and authorized image routes', () => {
  it('returns the scoped JSON DTO with private caching', async () => {
    const response = await fetch(url('school'), { headers })
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store')
    expect((await response.json()).data.state).toBe('READY')
    expect(m.reader).toHaveBeenCalledWith({ actorUserId: 'owner', executionId: execution, product: 'SCHOOL' })
  })
  it('only delivers a hit image from a fresh authorized report', async () => {
    const response = await fetch(url('teacher', 'report-asset'), { headers })
    expect(response.status).toBe(200); expect(await response.text()).toBe('mock-image')
    expect(m.deliver).toHaveBeenCalledWith(expect.objectContaining({ reference }))
    expect(m.reader).toHaveBeenCalledWith({ actorUserId: 'owner', executionId: execution, product: 'TEACHER' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('cannot fetch an unprojected image or reuse an image after report access is removed', async () => {
    expect((await fetch(url('teacher', 'other-asset'), { headers })).status).toBe(404)
    m.reader.mockResolvedValueOnce(null)
    expect((await fetch(url('teacher', 'report-asset'), { headers })).status).toBe(404)
    m.reader.mockResolvedValueOnce({ state: 'WITHHELD', mode: 'NONE' })
    expect((await fetch(url('teacher', 'report-asset'), { headers })).status).toBe(404)
    expect(m.deliver).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated and unapproved School access before reading reports', async () => {
    expect((await fetch(url('teacher'))).status).toBe(401)
    m.status.mockResolvedValue({ status: 'PENDING' })
    expect((await fetch(url('school'), { headers })).status).toBe(404)
    expect(m.reader).not.toHaveBeenCalled()
  })
})
