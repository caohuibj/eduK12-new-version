import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFormItems, mockQuestionnaireScales } = vi.hoisted(() => ({
  mockFormItems: vi.fn(),
  mockQuestionnaireScales: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    questionnaireFormItem: { findMany: mockFormItems },
    questionnaireScale: { findMany: mockQuestionnaireScales },
  },
}))

import { cacheService } from '../../services/cacheService'

describe('questionnaire start content cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('coalesces a concurrent cold-start read into one pair of origin queries', async () => {
    let releaseFormItems!: () => void
    let releaseScales!: () => void
    const formItemsReady = new Promise<void>((resolve) => { releaseFormItems = resolve })
    const scalesReady = new Promise<void>((resolve) => { releaseScales = resolve })

    mockFormItems.mockImplementation(async () => {
      await formItemsReady
      return [{ id: 'form-1', position: 0 }]
    })
    mockQuestionnaireScales.mockImplementation(async () => {
      await scalesReady
      return [{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 1 }]
    })

    const requests = Array.from({ length: 32 }, () => (
      cacheService.getQuestionnaireStartContent('cold-start-questionnaire')
    ))

    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(mockFormItems).toHaveBeenCalledTimes(1)
    expect(mockQuestionnaireScales).toHaveBeenCalledTimes(1)

    releaseFormItems()
    releaseScales()
    const values = await Promise.all(requests)

    expect(values).toHaveLength(32)
    expect(values[0]).toEqual({
      formItems: [{ id: 'form-1', position: 0 }],
      questionnaireScales: [{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 1 }],
    })
    expect(values.every((value) => value === values[0])).toBe(true)
  })

  it('does not retain a rejected origin read', async () => {
    mockFormItems.mockRejectedValueOnce(new Error('temporary database error'))
    mockQuestionnaireScales.mockResolvedValueOnce([])

    await expect(cacheService.getQuestionnaireStartContent('retry-questionnaire')).rejects.toThrow('temporary database error')

    mockFormItems.mockResolvedValueOnce([])
    mockQuestionnaireScales.mockResolvedValueOnce([])
    await expect(cacheService.getQuestionnaireStartContent('retry-questionnaire')).resolves.toEqual({
      formItems: [],
      questionnaireScales: [],
    })
    expect(mockFormItems).toHaveBeenCalledTimes(2)
    expect(mockQuestionnaireScales).toHaveBeenCalledTimes(2)
  })

  it('does not repopulate a stale origin read after invalidation', async () => {
    const service = cacheService as any
    const originalClient = service.client
    const originalConnected = service.isConnected
    const client = {
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      del: vi.fn(),
    }
    service.client = client
    service.isConnected = true

    let release!: () => void
    const originReady = new Promise<void>((resolve) => { release = resolve })
    mockFormItems.mockImplementation(async () => {
      await originReady
      return []
    })
    mockQuestionnaireScales.mockResolvedValue([])

    try {
      const request = cacheService.getQuestionnaireStartContent('race-questionnaire')
      await new Promise<void>((resolve) => setImmediate(resolve))
      await cacheService.clearQuestionnaireCache('race-questionnaire')
      release()
      await expect(request).resolves.toEqual({ formItems: [], questionnaireScales: [] })
      expect(client.setEx).not.toHaveBeenCalled()
    } finally {
      service.client = originalClient
      service.isConnected = originalConnected
    }
  })
})
