import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('../client', () => ({ default: { get: mockGet } }))

import { getScaleLibrary, getScaleLibraryEntry } from '../scaleLibrary'

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
})
