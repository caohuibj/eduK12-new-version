import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('../client', () => ({ default: { get: mockGet }, sessionFetch: vi.fn() }))

import { getScaleLibrary, getScaleLibraryEntry } from '../scaleLibrary'
import { governanceApi } from '../scaleLibraryGovernance'

afterEach(() => vi.unstubAllGlobals())

describe('scale library API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ code: 0, message: 'ok', data: { entries: [] } })
  })

  it('uses the read-only list endpoint and omits empty filters', async () => {
    await getScaleLibrary({ locale: 'zh-CN', respondent: 'PARENT', keyword: '' })
    expect(mockGet).toHaveBeenCalledWith('/scale-library', {
      params: { locale: 'zh-CN', respondent: 'PARENT' },
    })
  })

  it('encodes catalog identity on the detail endpoint', async () => {
    await getScaleLibraryEntry('sdq_parent_zh_cn', '1.0.0', { locale: 'zh-CN', territory: 'CN' })
    expect(mockGet).toHaveBeenCalledWith('/scale-library/sdq_parent_zh_cn/1.0.0', {
      params: { locale: 'zh-CN', territory: 'CN' },
    })
  })

  it('passes combined classification filters to the legacy read-only endpoint', async () => {
    await getScaleLibrary({ constructDomain: 'WELL_BEING', overlapTag: 'stress/perceived & coping' })
    expect(mockGet).toHaveBeenCalledWith('/scale-library', {
      params: { constructDomain: 'WELL_BEING', overlapTag: 'stress/perceived & coping' },
    })
  })

  it.each(['TRAINING', 'SURVEY'] as const)('encodes exact classification filters for the %s catalog without changing its read-only transport', async product => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: { list: [] } }) })
    vi.stubGlobal('fetch', fetcher)
    await governanceApi(product).catalog(2, 25, { constructDomain: 'WELL_BEING', overlapTag: 'stress/perceived & coping' })
    const path = `/${product.toLowerCase()}/scale-library-governance/catalog?page=2&pageSize=25&constructDomain=WELL_BEING&overlapTag=stress%2Fperceived+%26+coping`
    if (product === 'TRAINING') {
      expect(mockGet).toHaveBeenLastCalledWith(path)
      expect(fetcher).not.toHaveBeenCalled()
    } else {
      expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api' + path, { method: 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
      expect(mockGet).not.toHaveBeenCalled()
    }
  })

  it('omits empty classification filters and retains default governance pagination', async () => {
    await governanceApi('TRAINING').catalog(undefined, undefined, { constructDomain: '', overlapTag: '' })
    expect(mockGet).toHaveBeenLastCalledWith('/training/scale-library-governance/catalog?page=1&pageSize=25')
  })
})
