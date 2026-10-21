import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialResourceType, UserRole } from '@prisma/client'

const globalDb = vi.hoisted(() => ({ materialGrant: { findUnique: vi.fn() } }))
vi.mock('../../config/database', () => ({ prisma: globalDb }))

import { config } from '../../config'
import { canUseScale, SCALE_USE_AUTHORIZATION_SELECT } from '../../services/materialGrant'

const fullScale = { id: 'frozen-scale', creatorId: 'scale-owner', status: 'PUBLISHED', name: 'Unneeded display name' }
const transaction = (grant: unknown = null) => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  scale: { findUnique: vi.fn(async ({ select }: { where: { id: string }; select: Record<string, boolean> }) => Object.fromEntries(
    Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, fullScale[key as keyof typeof fullScale]]),
  )) },
  materialGrant: { findUnique: vi.fn().mockResolvedValue(grant) },
})
const projectedScale = async (tx: ReturnType<typeof transaction>) => tx.scale.findUnique({
  where: { id: fullScale.id }, select: SCALE_USE_AUTHORIZATION_SELECT,
}) as Promise<Pick<typeof fullScale, 'id' | 'creatorId' | 'status'>>
let grantsEnabled: boolean
beforeEach(() => {
  vi.resetAllMocks()
  grantsEnabled = config.materialGrantsEnabled
  config.materialGrantsEnabled = true
  globalDb.materialGrant.findUnique.mockImplementation(() => { throw new Error('Authorization escaped its transaction') })
})
afterEach(() => {
  config.materialGrantsEnabled = grantsEnabled
  expect(globalDb.materialGrant.findUnique).not.toHaveBeenCalled()
})

describe('Scale-use authorization projection contract', () => {
  it('preserves owner identity in the exact select and admits without a grant query', async () => {
    const tx = transaction(), scale = await projectedScale(tx)
    expect(SCALE_USE_AUTHORIZATION_SELECT).toEqual({ id: true, creatorId: true, status: true })
    expect(scale).toEqual({ id: fullScale.id, creatorId: fullScale.creatorId, status: fullScale.status })
    expect(tx.scale.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: fullScale.id }, select: SCALE_USE_AUTHORIZATION_SELECT })
    expect(await canUseScale('scale-owner', UserRole.TEACHER, scale, tx as any)).toBe(true)
    expect(tx.materialGrant.findUnique).not.toHaveBeenCalled()
  })

  it('admits a nonowner only through the supplied transaction exact Scale grant', async () => {
    const tx = transaction({ id: 'matching-grant' }), scale = await projectedScale(tx)
    expect(await canUseScale('granted-teacher', UserRole.TEACHER, scale, tx as any)).toBe(true)
    expect(tx.materialGrant.findUnique).toHaveBeenCalledExactlyOnceWith({ where: {
      teacherId_resourceType_resourceId: { teacherId: 'granted-teacher', resourceType: MaterialResourceType.SCALE, resourceId: fullScale.id },
    } })
  })

  it('denies a nonowner with no matching grant in that transaction', async () => {
    const tx = transaction(), scale = await projectedScale(tx)
    expect(await canUseScale('ungranted-teacher', UserRole.TEACHER, scale, tx as any)).toBe(false)
    expect(tx.materialGrant.findUnique).toHaveBeenCalledExactlyOnceWith({ where: {
      teacherId_resourceType_resourceId: { teacherId: 'ungranted-teacher', resourceType: MaterialResourceType.SCALE, resourceId: fullScale.id },
    } })
  })

  it('reproduces the missing-creator projection regression without inferring ownership', async () => {
    const tx = transaction(), { creatorId: _missing, ...incomplete } = await projectedScale(tx)
    expect(await canUseScale('scale-owner', UserRole.TEACHER, incomplete as any, tx as any)).toBe(false)
    expect(tx.materialGrant.findUnique).toHaveBeenCalledOnce()
    expect(await canUseScale('scale-owner', UserRole.TEACHER, await projectedScale(tx), tx as any)).toBe(true)
    expect(tx.materialGrant.findUnique).toHaveBeenCalledOnce()
  })

  it('does not infer published status for an incomplete nonowner projection', async () => {
    const tx = transaction({ id: 'unused-grant' }), { status: _missing, ...incomplete } = await projectedScale(tx)
    expect(await canUseScale('granted-teacher', UserRole.TEACHER, incomplete as any, tx as any)).toBe(false)
    expect(tx.materialGrant.findUnique).not.toHaveBeenCalled()
  })

  it('wires the centralized authorization fields into the actual composite loader', () => {
    const source = readFileSync('src/modules/composite/composite.service.ts', 'utf8')
    const loader = source.slice(source.indexOf('const loadComposite ='), source.indexOf('const validateCourse ='))
    expect(loader).toMatch(/scale:\s*\{\s*select:\s*\{\s*\.\.\.SCALE_USE_AUTHORIZATION_SELECT,/)
  })
})
