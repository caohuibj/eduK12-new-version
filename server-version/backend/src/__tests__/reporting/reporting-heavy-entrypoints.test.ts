import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  group: vi.fn(), createExport: vi.fn(), downloadExport: vi.fn(), bindWave: vi.fn(), readArtifact: vi.fn(),
}))
vi.mock('../../modules/reporting/individualService', () => ({ generateIndividualLongitudinal: vi.fn() }))
vi.mock('../../modules/reporting/longitudinal-planner', () => ({ generateAutomaticLongitudinal: vi.fn() }))
vi.mock('../../modules/reporting/spec', () => ({
  createPlatformReportingSpec: vi.fn(), publishPlatformReportingSpec: vi.fn(), retirePlatformReportingSpec: vi.fn(), reviewPlatformReportingSpec: vi.fn(),
}))
vi.mock('../../modules/reporting/service', () => ({ generateOrganizationGroupAnalysis: service.group }))
vi.mock('../../modules/reporting/pr4Service', () => ({
  bindOrganizationReportingWave: service.bindWave, createOrganizationReportingSeries: vi.fn(),
  generateOrganizationLongitudinalAnalysis: vi.fn(), generateOrganizationProtectedFeedback: vi.fn(), readOrganizationReportingArtifact: service.readArtifact,
}))
vi.mock('../../modules/reporting/export', () => ({ createReportingExport: service.createExport, downloadReportingExport: service.downloadExport }))
vi.mock('../../modules/assessment-safety/organization-view', () => ({ readOrganizationSafetyCase: vi.fn() }))
vi.mock('../../modules/assessment-safety/organization-discovery', () => ({ listOrganizationSafetyCases: vi.fn() }))
vi.mock('../../services/cacheService', () => ({ cacheService: {} }))

import { reportingController } from '../../modules/reporting/reporting.controller'
import { reportingAnalysisExecutionAdmission } from '../../modules/reporting/runtimeLimit'
const id = '9e06a830-8086-45d5-a59f-c0943330861e'
const req = (body: unknown = {}) => ({ body, user: { userId: id, platformRole: 'STANDARD' }, params: { organizationId: id, seriesId: id, artifactId: id, exportId: id } }) as any
const res = () => {
  const value: any = new EventEmitter()
  value.setHeader = vi.fn()
  value.status = vi.fn((code: number) => { value.code = code; return value })
  value.type = vi.fn(() => value)
  value.send = vi.fn(() => value)
  value.json = vi.fn(() => value)
  return value
}
const cases = [
  ['createExport', { kind: 'AGGREGATE', artifactId: id }, 'createExport'],
  ['downloadExport', {}, 'downloadExport'],
  ['bindWave', { runId: id, trackId: id, waveKey: 'T1', ordinal: 1 }, 'bindWave'],
  ['readArtifact', {}, 'readArtifact'],
] as const
beforeEach(() => { vi.resetAllMocks() })

describe('all heavy Reporting HTTP entrypoints share one execution bound', () => {
  it.each(cases)('%s cannot bypass an active analysis after its client disconnects', async (method, body, mock) => {
    let finish!: (value: unknown) => void
    service.group.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const firstResponse = res()
    const pending = reportingController.analyze(req({ runId: id, trackId: id, specId: id }), firstResponse)
    await Promise.resolve()
    await Promise.resolve()
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(1)
    firstResponse.emit('close')
    const competing = res()
    try {
      await reportingController[method](req(body), competing)
      expect(competing.code).toBe(503)
      expect(service[mock]).not.toHaveBeenCalled()
      expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(1)
    } finally {
      finish({ artifactId: id, projection: {} })
      await pending
    }
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(0)
  })

  it.each(cases)('%s releases its own permit on an operation exception', async (method, body, mock) => {
    service[mock].mockRejectedValue(new Error('operation failed'))
    await expect(reportingController[method](req(body), res())).rejects.toThrow('operation failed')
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(0)
  })

  it('retains the permit through JSON serialization, not just through the last DB read', async () => {
    service.readArtifact.mockResolvedValue({ artifactId: id, projection: {} })
    const response = res()
    response.json.mockImplementation(() => {
      expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(1)
      return response
    })
    await reportingController.readArtifact(req(), response)
    expect(reportingAnalysisExecutionAdmission.getStats().active).toBe(0)
  })
})
