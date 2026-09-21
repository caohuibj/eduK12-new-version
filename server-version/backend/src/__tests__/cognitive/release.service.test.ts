import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockEvaluateReadiness, mockGetDefinition } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveTestConfig: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mockEvaluateReadiness: vi.fn(),
  mockGetDefinition: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../modules/cognitive/library/product-readiness', () => ({
  evaluateCognitiveProductReadiness: mockEvaluateReadiness,
}))
vi.mock('../../modules/cognitive/v2/registry', () => ({
  getCognitiveV2TaskDefinition: mockGetDefinition,
}))

import {
  publishCognitiveConfig,
  retireCognitiveConfig,
} from '../../modules/cognitive/release.service'

const updatedAt = new Date('2026-09-21T00:00:00.000Z')
const draftConfig = {
  id: 'config-1',
  testType: 'reaction',
  configVersion: '1.1.0',
  name: 'Reaction 1.1',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  status: 'DRAFT',
  accessPolicy: 'OPEN',
  config: { totalTrials: 20 },
  updatedAt,
  publishedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDefinition.mockReturnValue({ testType: 'reaction' })
  mockEvaluateReadiness.mockReturnValue({ ready: true, blockers: [] })
})

describe('Cognitive release service', () => {
  it('publishes only the exact DRAFT snapshot that passed readiness and records publishedAt', async () => {
    const published = { ...draftConfig, status: 'PUBLISHED', publishedAt: new Date('2026-09-21T01:00:00.000Z') }
    mockPrisma.cognitiveTestConfig.findUnique
      .mockResolvedValueOnce(draftConfig)
      .mockResolvedValueOnce(published)
    mockPrisma.cognitiveTestConfig.updateMany.mockResolvedValue({ count: 1 })

    await expect(publishCognitiveConfig('config-1')).resolves.toMatchObject({ status: 'PUBLISHED' })
    expect(mockEvaluateReadiness).toHaveBeenCalledWith(expect.anything(), draftConfig.config)
    expect(mockPrisma.cognitiveTestConfig.updateMany).toHaveBeenCalledWith({
      where: { id: 'config-1', status: 'DRAFT', updatedAt },
      data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
    })
  })

  it('does not write when Product Readiness fails', async () => {
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(draftConfig)
    mockEvaluateReadiness.mockReturnValue({
      ready: false,
      blockers: [{ stage: 'DEFINITION', code: 'NOT_READY', message: 'fixture blocker' }],
    })

    await expect(publishCognitiveConfig('config-1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('NOT_READY'),
    })
    expect(mockPrisma.cognitiveTestConfig.updateMany).not.toHaveBeenCalled()
  })

  it('fails closed when the DRAFT row changes after readiness evaluation', async () => {
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue(draftConfig)
    mockPrisma.cognitiveTestConfig.updateMany.mockResolvedValue({ count: 0 })

    await expect(publishCognitiveConfig('config-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.cognitiveTestConfig.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'config-1', status: 'DRAFT', updatedAt },
    }))
  })

  it('rejects publishing from a non-DRAFT lifecycle state before readiness', async () => {
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ ...draftConfig, status: 'PUBLISHED' })

    await expect(publishCognitiveConfig('config-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(mockEvaluateReadiness).not.toHaveBeenCalled()
    expect(mockPrisma.cognitiveTestConfig.updateMany).not.toHaveBeenCalled()
  })

  it('retires only an unchanged PUBLISHED snapshot', async () => {
    const published = { ...draftConfig, status: 'PUBLISHED', publishedAt: new Date('2026-09-21T01:00:00.000Z') }
    const retired = { ...published, status: 'RETIRED' }
    mockPrisma.cognitiveTestConfig.findUnique
      .mockResolvedValueOnce(published)
      .mockResolvedValueOnce(retired)
    mockPrisma.cognitiveTestConfig.updateMany.mockResolvedValue({ count: 1 })

    await expect(retireCognitiveConfig('config-1')).resolves.toMatchObject({ status: 'RETIRED' })
    expect(mockPrisma.cognitiveTestConfig.updateMany).toHaveBeenCalledWith({
      where: { id: 'config-1', status: 'PUBLISHED', updatedAt },
      data: { status: 'RETIRED' },
    })
  })
})
