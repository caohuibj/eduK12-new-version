import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { createImportPlanner, validateMappedData, contentEqual, importPlanHash, verifyImportPlan, applyImportPlan, type ImportAction } from '../../scripts/migration/import-plan'
import { applyRewrites, buildRewriteMap } from '../../scripts/migration/url-rewrite'
import { encryptToken } from '../../services/checkinTokenCrypto'
import { convertLegacyScaleDefinition } from '../../scripts/migration/legacy-scale-converter'

const rowAction = (): ImportAction => ({ model: 'classroomQuestion', operation: 'upsert',
  args: { where: { id: 'q1' }, create: { id: 'q1', classroomId: 'c1', questionIndex: 0, questionContent: { question: 'Synthetic' } } },
  mapping: { entity: 'classroom_question', legacyId: 'q1', newId: 'q1' } })
describe('legacy import safeguards', () => {
  it('dry-run rejects the actual missing classroom questionContent regression', async () => {
    const actions: ImportAction[] = []
    const planner = createImportPlanner(actions)
    await expect(planner.classroomQuestion.upsert({ where: { id: 'q1' }, update: {}, create: {
      id: 'q1', classroomId: 'c1', questionIndex: 0, questionContent: undefined as never,
    } })).rejects.toThrow('questionContent is missing')
    expect(actions).toEqual([])
  })
  it('validates required fields, enums and timestamps before applying', () => {
    expect(() => validateMappedData('classroomQuestion', rowAction().args.create!)).not.toThrow()
    expect(() => validateMappedData('classroomQuestion', { ...rowAction().args.create, questionIndex: '0' })).toThrow('questionIndex')
    expect(() => validateMappedData('course', { id: 'c1', status: 'UNKNOWN' }, true)).toThrow('status')
    expect(() => validateMappedData('course', { createdAt: new Date('invalid') }, true)).toThrow('createdAt')
    expect(contentEqual(Prisma.JsonNull, null)).toBe(true)
    expect(contentEqual({ b: 1, a: [2] }, { a: [2], b: 1 })).toBe(true)
  })
  it('rewrites only the audited nested URL without mutating the source snapshot', () => {
    const input = [{ url: '/uploads/videos/missing.mp4', caption: 'keep' }]
    const map = buildRewriteMap([{ source_table: 'assignments', source_id: 'a1', field: 'videos.0.url', reference: input[0].url, available_alternatives: [{ cos_key: 'videos/existing.mp4' }] }], 'https://cdn.example.test')
    expect(applyRewrites(map, 'assignments', 'a1', input).value).toEqual([{ url: 'https://cdn.example.test/videos/existing.mp4', caption: 'keep' }])
    expect(input[0].url).toBe('/uploads/videos/missing.mp4')
    expect(() => applyRewrites(map, 'assignments', 'a1', [{ url: 'different' }])).toThrow('does not match')
    expect(() => buildRewriteMap([{ source_table: 'assignments', source_id: 'a1', field: 'videos.0.url', reference: 'old', available_alternatives: [{ cos_key: 'backups/private' }] }], 'https://cdn.example.test')).toThrow()
  })
  it('hashes randomized token ciphertext by protected plaintext semantics', () => {
    process.env.DATA_ENCRYPTION_KEY = '12'.repeat(32)
    const a = rowAction(), b = rowAction()
    a.model = 'checkinAccessToken'
    a.args.create!.tokenEncrypted = encryptToken('synthetic-token')
    b.model = 'checkinAccessToken'
    b.args.create!.tokenEncrypted = encryptToken('synthetic-token')
    expect(a.args.create!.tokenEncrypted).not.toBe(b.args.create!.tokenEncrypted)
    expect(importPlanHash([a])).toBe(importPlanHash([b]))
  })
  it('reconciliation fails on content mismatch and missing mapping', async () => {
    const action = rowAction()
    const client: any = { classroomQuestion: { findUnique: vi.fn().mockResolvedValue({ ...action.args.create, questionContent: { question: 'changed' } }) },
      legacyImportIdMap: { findUnique: vi.fn() } }
    await expect(verifyImportPlan(client, [action])).rejects.toThrow('content mismatch')
    client.classroomQuestion.findUnique.mockResolvedValue(action.args.create)
    client.legacyImportIdMap.findUnique.mockResolvedValue(null)
    await expect(verifyImportPlan(client, [action])).rejects.toThrow('ID mapping mismatch')
  })
  it('pairs each business row and its ID map inside the same chunk transaction', async () => {
    const writes: string[] = []
    const tx: any = { classroomQuestion: { findUnique: async () => null, upsert: async () => { writes.push('row') } },
      legacyImportIdMap: { upsert: async () => { writes.push('map') } } }
    const client: any = { $transaction: async (callback: any) => { writes.push('begin'); await callback(tx); writes.push('commit') },
      legacyImportBatch: { update: async () => writes.push('checkpoint') } }
    expect(await applyImportPlan(client, [rowAction()], 'b1', 50)).toBe(1)
    expect(writes).toEqual(['begin', 'row', 'map', 'commit', 'checkpoint'])
  })
  it('does not overwrite an existing non-imported business record', async () => {
    const tx: any = { classroomQuestion: { findUnique: async () => rowAction().args.create, upsert: vi.fn() },
      legacyImportIdMap: { findUnique: async () => null } }
    const client: any = { $transaction: (callback: any) => callback(tx) }
    await expect(applyImportPlan(client, [rowAction()], 'b1', 50)).rejects.toThrow('conflicts')
    expect(tx.classroomQuestion.upsert).not.toHaveBeenCalled()
  })
  it('retains linked dimension content without claiming publication rights', () => {
    const result: any = convertLegacyScaleDefinition({
      scale: { id: 's1', code: 'SYN', name: 'Synthetic', description: null, config: { labels: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }] }, estimated_time: null, instruction: null, tags: [] },
      items: [{ item_code: 'Q1', content: 'Synthetic item', type: 'single', reverse: true, required: true, weight: 1, sort_order: 0, options: null, randomize_options: false }],
      dimensions: [{ id: 'd1', code: 'D1', name: 'Synthetic dimension', description: null, scoring_method: 'sum', weight: 1 }],
      itemDimensions: [{ item_id: 'i1', item_code: 'Q1', dimension_id: 'd1', weight: 2, reverse: false }],
    })
    expect(result.license.status).toBe('unknown')
    expect(result.scoring.scores[1].source.items).toEqual([{ itemCode: 'Q1', weight: 2 }])
  })
})
