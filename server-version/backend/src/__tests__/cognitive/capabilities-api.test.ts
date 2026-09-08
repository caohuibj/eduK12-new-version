import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config', () => ({
  config: { cognitiveModuleEnabled: true },
}))

import { capabilityController } from '../../controllers/capabilityController'

describe('runtime capability API', () => {
  it('exposes the backend cognitive capability as the source of truth', () => {
    const res: any = {
      json: vi.fn((body: unknown) => body),
    }

    capabilityController.getCapabilities({} as any, res)

    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: '操作成功',
      data: {
        cognitive: true,
        situational: {
          standalone: true,
          supported: true,
          embedded: false,
          aggregateEligible: false,
          collectionFacts: false,
        },
      },
    })
  })
})
