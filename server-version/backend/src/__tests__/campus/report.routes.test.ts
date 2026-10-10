import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentPortalError } from '../../modules/parent-portal/contracts'

const state = vi.hoisted(() => ({
  config: { campusParentReportEnabled: true },
  parent: {
    children: vi.fn(), reports: vi.fn(), readReport: vi.fn(),
    studentReportOptions: vi.fn(), reportConsentPreview: vi.fn(),
    acceptReportConsent: vi.fn(), grantReport: vi.fn(), revokeReport: vi.fn(),
    disclosureConsents: vi.fn(),
  },
  publisher: { list: vi.fn(), templates: vi.fn(), preview: vi.fn(), publish: vi.fn() },
  studentStatus: vi.fn(),
  participant: { list: vi.fn(), read: vi.fn() },
  professional: { list: vi.fn(), read: vi.fn() },
  respondentSummary: vi.fn(),
  group: {catalog:vi.fn(),generate:vi.fn(),read:vi.fn()},
  protectedStudio: {catalog:vi.fn(),generate:vi.fn()},
  longitudinal: {catalog:vi.fn(),sources:vi.fn(),generate:vi.fn()},
}))
vi.mock('../../config', () => ({ config: state.config }))
vi.mock('../../modules/parent-portal/service', () => ({ parentPortalService: state.parent }))
vi.mock('../../modules/parent-portal/publisher', () => ({ parentPublisher: state.publisher }))
vi.mock('../../modules/campus/admission.service', () => ({ readCampusStudentStatus: state.studentStatus }))
vi.mock('../../modules/reporting/participantService', () => ({
  listParticipantLongitudinal: state.participant.list,
  readParticipantLongitudinal: state.participant.read,
}))
vi.mock('../../modules/reporting/respondentSummary', () => ({ readRespondentRunSummary: state.respondentSummary }))
vi.mock('../../modules/campus/student-feedback', () => ({ readCampusStudentFeedback: state.respondentSummary }))
vi.mock('../../modules/campus/group-reports',()=>({
  listCampusGroupReportCatalog:state.group.catalog,
  generateCampusGroupReport:state.group.generate,
  readCampusGroupReport:state.group.read,
}))
vi.mock('../../modules/campus/individual-longitudinal-studio',()=>({
  listCampusIndividualLongitudinalCatalog:state.longitudinal.catalog,
  listCampusIndividualLongitudinalSources:state.longitudinal.sources,
  generateCampusIndividualLongitudinal:state.longitudinal.generate,
}))
vi.mock('../../modules/campus/protected-report-studio',()=>({
  listCampusProtectedReportCatalog:state.protectedStudio.catalog,
  generateCampusProtectedReport:state.protectedStudio.generate,
}))
vi.mock('../../modules/campus/professional-reports', () => ({
  listCampusProfessionalReports: state.professional.list,
  readCampusProfessionalReport: state.professional.read,
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
    state.config.campusParentReportEnabled = true
    state.parent.children.mockResolvedValue({ list: [] })
    state.parent.reports.mockResolvedValue({ list: [] })
    state.parent.readReport.mockResolvedValue({ audience: 'PARENT', mode: 'COMPLETION_ONLY', blocks: [] })
    state.parent.studentReportOptions.mockResolvedValue({ list: [] })
    state.parent.reportConsentPreview.mockResolvedValue({ canConsent: false })
    state.studentStatus.mockResolvedValue({ status: 'APPROVED' })
    state.participant.list.mockResolvedValue({ list: [] })
    state.participant.read.mockResolvedValue({ metrics: {} })
    state.professional.list.mockResolvedValue({ list: [] })
    state.professional.read.mockResolvedValue({ projection:{kind:'PROTECTED_FEEDBACK',state:'suppressed'} })
    state.respondentSummary.mockResolvedValue({ schemaVersion:1, mode:'COMPLETION_ONLY', state:'COMPLETED' })
    state.group.catalog.mockResolvedValue({specs:[],sources:[],truncated:false})
    state.group.generate.mockResolvedValue({artifactId:ARTIFACT,kind:'SCHOOL_GROUP',state:'WITHHELD',metrics:{},limitations:[]})
    state.group.read.mockResolvedValue({artifactId:ARTIFACT,kind:'SCHOOL_GROUP',state:'WITHHELD',metrics:{},limitations:[]})
    state.protectedStudio.catalog.mockResolvedValue({specs:[],sources:[],truncated:false})
    state.protectedStudio.generate.mockResolvedValue({artifactId:ARTIFACT,subjectReference:'林-123456789ABC',status:'WITHHELD'})
    state.longitudinal.catalog.mockResolvedValue({subjects:[],specs:[],truncated:false})
    state.longitudinal.sources.mockResolvedValue({sources:[],truncated:false})
    state.longitudinal.generate.mockResolvedValue({artifactId:ARTIFACT,subjectReference:'林-ABCDEF123456',status:'AVAILABLE',note:'已生成'})
  })

  it('reports feature availability without leaking a parent report when disabled',async()=>{
    state.config.campusParentReportEnabled=false
    const disabled=await request('/reports/availability')
    expect(disabled.status).toBe(200)
    expect((await disabled.json()).data).toEqual({parentReportsEnabled:false})
    expect(disabled.headers.get('cache-control')).toBe('no-store')
    state.config.campusParentReportEnabled=true
    const enabled=await request('/reports/availability')
    expect((await enabled.json()).data).toEqual({parentReportsEnabled:true})
    expect(state.parent.children).not.toHaveBeenCalled()
  })
  it('never accepts a legacy/training credential as a campus session', async () => {
    const response = await request('/reports/parent/children', 'GET', undefined, { 'x-school-user': '', 'x-training-user': 'training-parent' })
    expect(response.status).toBe(401)
    expect(state.parent.children).not.toHaveBeenCalled()
  })
  it('remains closed while the reviewed parent portal feature is disabled', async () => {
    state.config.campusParentReportEnabled = false
    const response = await request('/reports/parent/children')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(state.parent.children).not.toHaveBeenCalled()
  })
  it('never exposes a child internal account alias in the SCHOOL parent DTO', async () => {
    state.parent.children.mockResolvedValue({
      list:[{childId:CHILD,relationshipId:LINK,displayName:'internal-private-login'}],
      page:1,pageSize:20,hasMore:false,
    })
    const response = await request('/reports/parent/children')
    expect(response.status).toBe(200)
    const data=(await response.json()).data
    expect(data.list).toEqual([{childId:CHILD,relationshipId:LINK}])
    expect(JSON.stringify(data)).not.toMatch(/internal-private-login|displayName|username/)
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
  it('allows an approved campus student to read only their own contracted FINAL summary', async () => {
    const response = await request('/reports/student/executions/'+ARTIFACT,
      'GET', undefined, { 'x-school-role':'STUDENT' })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ mode:'COMPLETION_ONLY', state:'COMPLETED' })
    expect(state.respondentSummary).toHaveBeenCalledWith('school-parent', ARTIFACT)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('does not invoke a FINAL respondent result for a pending student', async () => {
    state.studentStatus.mockResolvedValue({ status:'PENDING_CLASS_APPROVAL' })
    const response = await request('/reports/student/executions/'+ARTIFACT,
      'GET', undefined, { 'x-school-role':'STUDENT' })
    expect(response.status).toBe(404)
    expect(state.respondentSummary).not.toHaveBeenCalled()
  })
  it('preserves an authority revocation when the source result is no longer readable', async () => {
    state.respondentSummary.mockRejectedValue(new ParentPortalError('PARENT_RESOURCE_NOT_FOUND',404))
    const response = await request('/reports/student/executions/'+ARTIFACT,
      'GET', undefined, { 'x-school-role':'STUDENT' })
    expect(response.status).toBe(404)
    expect((await response.json()).data).toBeNull()
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
  it('requires the live counselor relationship on every professional detail read', async () => {
    state.professional.read.mockRejectedValue(new ParentPortalError('CAMPUS_REPORT_NOT_FOUND',404))
    const response = await request('/reports/professional/organizations/'+CHILD+'/artifacts/'+ARTIFACT,'GET',undefined,{'x-school-role':'TEACHER'})
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({data:null})
    expect(state.professional.read).toHaveBeenCalledWith(expect.objectContaining({
      userId:'school-parent',accountDomain:'SCHOOL',
    }),CHILD,ARTIFACT)
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
  it('does not permit TRAINING or unauthenticated group reporting',async()=>{
    const response=await request('/reports/groups/catalog?organizationId='+CHILD,
      'GET',undefined,{'x-school-user':'','x-training-user':'training-admin'})
    expect(response.status).toBe(401)
    expect(state.group.catalog).not.toHaveBeenCalled()
  })
  it('denies school group generation without recent TOTP or matching CSRF',async()=>{
    const body={organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,specId:LINK}
    const missing=await request('/reports/groups','POST',body,{'x-school-role':'ADMIN'})
    expect(missing.status).toBe(403)
    const forged=await request('/reports/groups','POST',body,{
      'x-school-role':'ADMIN','x-recent-school-mfa':'true','X-CSRF-Token':'wrong',
    })
    expect(forged.status).toBe(403)
    expect(state.group.generate).not.toHaveBeenCalled()
  })
  it('disallows arbitrary membership selection and subject-targeted filters in school aggregate POST',async()=>{
    const response=await request('/reports/groups','POST',{
      organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,specId:LINK,
      cohortSelector:{schemaVersion:2,clauses:[{kind:'MEMBERSHIP_IDS',membershipIds:[CHILD]}],combine:'ALL'},
    },{'x-school-role':'ADMIN','x-recent-school-mfa':'true'})
    expect(response.status).toBe(400)
    expect(state.group.generate).not.toHaveBeenCalled()
  })
  it('accepts only whole-source arguments in the authorized school report path',async()=>{
    const body={organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,specId:LINK}
    const response=await request('/reports/groups','POST',body,{
      'x-school-role':'ADMIN','x-recent-school-mfa':'true',
    })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({state:'WITHHELD',metrics:{}})
    expect(state.group.generate).toHaveBeenCalledWith({
      actor:expect.objectContaining({accountDomain:'SCHOOL',role:'ADMIN'}),
      ...body,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('reads an old group artifact only through fresh current school authorization',async()=>{
    const response=await request('/reports/groups/'+CHILD+'/'+ARTIFACT,'GET',
      undefined,{'x-school-role':'ADMIN'})
    expect(response.status).toBe(200)
    expect(state.group.read).toHaveBeenCalledWith({
      actor:expect.objectContaining({accountDomain:'SCHOOL',role:'ADMIN'}),
      organizationId:CHILD,artifactId:ARTIFACT,
    })
  })

  it('does not expose protected case discovery to an unauthenticated/training identity',async()=>{
    const response=await request('/reports/protected/catalog?organizationId='+CHILD,
      'GET',undefined,{'x-school-user':'','x-training-user':'training-therapist'})
    expect(response.status).toBe(401)
    expect(state.protectedStudio.catalog).not.toHaveBeenCalled()
  })
  it('requires SCHOOL step-up and exact CSRF for pseudonymous professional generation',async()=>{
    const body={organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,
      subjectReference:'林-123456789ABC',relationshipKind:'CLASS_TEACHER_STUDENT',
      perspective:'OBSERVER_REPORT',specId:LINK}
    expect((await request('/reports/protected','POST',body,
      {'x-school-role':'TEACHER'})).status).toBe(403)
    expect((await request('/reports/protected','POST',body,{
      'x-school-role':'TEACHER','x-recent-school-mfa':'true',
      'X-CSRF-Token':'wrong',
    })).status).toBe(403)
    expect(state.protectedStudio.generate).not.toHaveBeenCalled()
  })
  it('rejects exact student IDs, arbitrary metrics or unauthorized audience in request',async()=>{
    const body={organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,
      subjectReference:'林-123456789ABC',relationshipKind:'CLASS_TEACHER_STUDENT',
      perspective:'OBSERVER_REPORT',specId:LINK}
    const headers={'x-school-role':'TEACHER','x-recent-school-mfa':'true'}
    const bad=await request('/reports/protected','POST',{
      ...body,subjectUserId:'student-private-id',
    },headers)
    expect(bad.status).toBe(400)
    const badRef=await request('/reports/protected','POST',{
      ...body,subjectReference:'student-private-id',
    },headers)
    expect(badRef.status).toBe(400)
    const badAudience=await request('/reports/protected','POST',{
      ...body,audience:'PARENT',
    },headers)
    expect(badAudience.status).toBe(400)
    expect(state.protectedStudio.generate).not.toHaveBeenCalled()
  })
  it('passes only a school-scoped subject reference to the authoritative professional generator',async()=>{
    const body={organizationId:CHILD,runId:CHILD,trackId:ARTIFACT,
      subjectReference:'林-123456789ABC',relationshipKind:'CLASS_TEACHER_STUDENT',
      perspective:'OBSERVER_REPORT',specId:LINK}
    const response=await request('/reports/protected','POST',body,
      {'x-school-role':'TEACHER','x-recent-school-mfa':'true'})
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({
      subjectReference:'林-123456789ABC',status:'WITHHELD',
    })
    expect(state.protectedStudio.generate).toHaveBeenCalledWith({
      actor:expect.objectContaining({accountDomain:'SCHOOL',role:'TEACHER'}),...body,
    })
  })

  it('protects clinical longitudinal generation with school MFA and CSRF',async()=>{
    const body={organizationId:CHILD,subjectReference:'林-ABCDEF123456',
      specId:ARTIFACT,sources:[{runId:CHILD,trackId:ARTIFACT},{runId:LINK,trackId:CHILD}]}
    const without=await request('/reports/longitudinal','POST',body,
      {'x-school-role':'TEACHER'})
    expect(without.status).toBe(403)
    const forged=await request('/reports/longitudinal','POST',body,
      {'x-school-role':'TEACHER','x-recent-school-mfa':'true',
        'X-CSRF-Token':'not-school-token'})
    expect(forged.status).toBe(403)
    expect(state.longitudinal.generate).not.toHaveBeenCalled()
  })
  it('rejects extraneous subjectUserId, age claims or browser-supplied scoring data',async()=>{
    const body={organizationId:CHILD,subjectReference:'林-ABCDEF123456',specId:ARTIFACT,
      sources:[{runId:CHILD,trackId:ARTIFACT},{runId:LINK,trackId:CHILD}]}
    const header={'x-school-role':'TEACHER','x-recent-school-mfa':'true'}
    for(const invalid of [
      {...body,subjectUserId:'hidden-student'},
      {...body,sourceScores:{metric:3}},
      {...body,sources:[{runId:CHILD,trackId:ARTIFACT}]},
      {...body,subjectReference:'school_login_name'},
    ]){
      expect((await request('/reports/longitudinal','POST',invalid,header)).status).toBe(400)
    }
    expect(state.longitudinal.generate).not.toHaveBeenCalled()
  })
  it('passes valid pseudonym-only longitudinal request to server-authoritative scope',async()=>{
    const body={organizationId:CHILD,subjectReference:'林-ABCDEF123456',specId:ARTIFACT,
      sources:[{runId:CHILD,trackId:ARTIFACT},{runId:LINK,trackId:CHILD}]}
    const result=await request('/reports/longitudinal','POST',body,
      {'x-school-role':'TEACHER','x-recent-school-mfa':'true'})
    expect(result.status).toBe(200)
    expect((await result.json()).data).toMatchObject({
      status:'AVAILABLE',subjectReference:'林-ABCDEF123456'})
    expect(state.longitudinal.generate).toHaveBeenCalledWith({
      actor:expect.objectContaining({accountDomain:'SCHOOL',role:'TEACHER'}),...body,
    })
    expect(result.headers.get('cache-control')).toBe('no-store')
  })

})
