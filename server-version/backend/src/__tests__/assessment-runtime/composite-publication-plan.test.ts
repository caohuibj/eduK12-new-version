import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildFourFamilyTestSlots } from './phase2-test-fixtures'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import {
  buildCompositePublicationPlan,
  clearCompositePublicationPlanCacheForTests,
  generateCompositeUnitSeeds,
  loadCompositePublicationPlan,
  projectWholeV2Template,
  saveCompositePublicationPlan,
} from '../../modules/assessment-runtime/composite-publication-plan'
import { decodeCompositeUnitSeeds } from '../../modules/assessment-runtime/composite-final.codec'
import {
  issueCompositeSlotVideoCapabilities,
  serveCompositeSlotImage,
} from '../../modules/assessment-runtime/composite-slot-media.service'

function makeTemplateStore() {
  const rows = new Map<string, PublicTemplateRow>()
  const repo = {
    read: vi.fn(async (hashes: string[]) => hashes.flatMap(h => (rows.has(h) ? [rows.get(h)!] : []))),
    append: vi.fn(async (rs: PublicTemplateRow[]) => { for (const r of rs) rows.set(r.templateHash, r) }),
  }
  return { rows, repo, store: createPublicTemplateStore(repo) }
}

describe('composite-publication-plan & composite-slot-media', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    clearCompositePublicationPlanCacheForTests()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('builds, persists, reloads, projects runner-safe template, and issues Cognitive-only unit seeds', async () => {
    const { store, repo } = makeTemplateStore()
    const fixture = buildFourFamilyTestSlots()
    const compositeId = randomUUID()

    const plan = buildCompositePublicationPlan({
      compositeId,
      title: '四合一综合测评',
      description: '包含表单+量表+SJT+认知测验',
      slots: fixture.slots,
    })
    expect(plan.publicationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.slotSetHash).toMatch(/^[a-f0-9]{64}$/)

    const savedHash = await saveCompositePublicationPlan(plan, store)
    expect(savedHash).toBe(plan.publicationHash)
    expect(repo.append).toHaveBeenCalledTimes(1)

    clearCompositePublicationPlanCacheForTests()
    const loaded = await loadCompositePublicationPlan(plan.publicationHash, store)
    expect(loaded.publicationHash).toBe(plan.publicationHash)
    expect(loaded.slots).toHaveLength(4)

    const template = projectWholeV2Template(loaded)
    expect(template.publicationHash).toBe(plan.publicationHash)
    const scaleSlot = template.units.find(s => s.unitType === 'SCALE') as any
    expect(scaleSlot.definition.scoring).toBeUndefined()
    expect(scaleSlot.definition.report).toBeUndefined()
    const sjtSlot = template.units.find(s => s.unitType === 'SITUATIONAL') as any
    expect(sjtSlot.definition.scoring).toBeUndefined()
    const cogSlot = template.units.find(s => s.unitType === 'COGNITIVE') as any
    expect(cogSlot.profile).toBe('standard')
    expect(cogSlot.config.totalTrials).toBe(8)

    const attemptId = randomUUID()
    const generated = generateCompositeUnitSeeds(loaded, attemptId, 1)!
    expect(Object.keys(generated.seeds)).toEqual([`cognitive:${fixture.cogItemId}`])
    const decoded = decodeCompositeUnitSeeds(generated.encrypted)
    expect(decoded).toEqual({
      schemaVersion: 1,
      attemptId,
      attemptEpoch: 1,
      seeds: generated.seeds,
    })

    const nonCogPlan = buildCompositePublicationPlan({
      compositeId,
      title: '纯量表',
      slots: fixture.slots.filter(s => s.unitType !== 'COGNITIVE'),
    })
    expect(generateCompositeUnitSeeds(nonCogPlan, attemptId, 1)).toBeNull()
  })

  it('fails closed (404) when media asset or video does not belong to frozen slot', async () => {
    const fixture = buildFourFamilyTestSlots()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '媒体鉴权测试',
      slots: fixture.slots,
    })

    await expect(serveCompositeSlotImage({
      plan,
      slotKey: 'nonexistent:slot',
      assetId: randomUUID(),
      res: {} as any,
    })).rejects.toMatchObject({ statusCode: 404, code: 'INSTRUMENT_NOT_AVAILABLE' })

    await expect(serveCompositeSlotImage({
      plan,
      slotKey: `scale:${fixture.scaleItemId}`,
      assetId: randomUUID(),
      res: {} as any,
    })).rejects.toMatchObject({ statusCode: 404, code: 'INSTRUMENT_NOT_AVAILABLE' })

    await expect(issueCompositeSlotVideoCapabilities({
      plan,
      attemptId: randomUUID(),
      slotKey: `situational:${fixture.sjtItemId}`,
      videoKey: 'unknown-video',
      audience: 'authenticated',
    })).rejects.toMatchObject({ statusCode: 404, code: 'INSTRUMENT_NOT_AVAILABLE' })
  })
})
