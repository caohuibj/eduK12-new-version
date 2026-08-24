import { describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { compositeApi } from '../api'

describe('ReportPackage composite API', () => {
  it('lists the caller-visible package catalog', async () => {
    await compositeApi.listReportPackages()
    expect(mockClient.get).toHaveBeenCalledWith('/composite-assessments/report-packages')
  })

  it('uses explicit reportPackage selection for fixed instances', async () => {
    await compositeApi.setReportPackage('draft-1', { key: 'attention_stability_v1', version: '1.0.0', profile: 'standard' })
    expect(mockClient.put).toHaveBeenCalledWith('/composite-assessments/draft-1/report-package', {
      reportPackage: { key: 'attention_stability_v1', version: '1.0.0', profile: 'standard' },
    })
  })
})
