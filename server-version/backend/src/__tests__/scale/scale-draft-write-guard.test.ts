import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { $executeRaw:vi.fn(async()=>1), scale: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn() } }))
vi.mock('../../modules/measurement-content/scale',()=>({publishScaleMeasurement:vi.fn(async()=>({releaseId:'synthetic-release'}))}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/scale/scale-image.adapter', () => ({ retainScaleAssessmentImages: vi.fn(), publishedScaleMediaOwner: vi.fn(() => ({})), retainFrozenScaleAssessmentImages: vi.fn() }))
import { scaleController } from '../../controllers/scaleController'
import { scaleImageController } from '../../controllers/scaleImageController'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'
const definition = scaleDefinitionFor(3, 'TR')
const draft = { id: 'scale', creatorId: 'owner', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', updatedAt: new Date('2026-10-17T00:00:00Z'), definitionHash: 'draft-hash', definition }
const response = () => { const r: any = { statusCode: 200 }; r.status = vi.fn((code) => { r.statusCode = code; return r }); r.json = vi.fn((value) => { r.value = value; return r }); return r }
const request = (body: unknown) => ({ params: { id: 'scale' }, user: { userId: 'owner', role: 'TEACHER' }, body }) as any
beforeEach(() => { vi.clearAllMocks(); db.scale.findUnique.mockResolvedValue(draft); db.scale.update.mockResolvedValue(draft); db.$transaction.mockImplementation(async (fn) => fn(db)) })
describe('Scale draft mutation atomic guards', () => {
  it.each(['definition', 'metadata'])('binds %s write to the current DRAFT and custom class', async (kind) => { const r = response(); if (kind === 'definition') await scaleController.updateDefinition(request({ definition }), r); else await scaleController.update(request({ name: 'Updated' }), r); expect(r.statusCode).toBe(200); expect(db.scale.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scale', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE' } })) })
  it.each(['definition', 'metadata'])('maps a publish race during %s save to 409', async (kind) => { db.scale.update.mockRejectedValue(Object.assign(new Error('guard'), { code: 'P2025' })); const r = response(); if (kind === 'definition') await scaleController.updateDefinition(request({ definition }), r); else await scaleController.update(request({ name: 'Updated' }), r); expect(r.statusCode).toBe(409); expect(r.value.data).toBeNull() })
  it.each(['definition', 'metadata'])('reports an already-published %s draft as 409', async (kind) => { db.scale.findUnique.mockResolvedValue({ ...draft, status: 'PUBLISHED' }); const r = response(); if (kind === 'definition') await scaleController.updateDefinition(request({ definition }), r); else await scaleController.update(request({ name: 'Changed' }), r); expect(r.statusCode).toBe(409); expect(db.scale.update).not.toHaveBeenCalled() })
  it.each(['DRAFT', 'PUBLISHED'])('rejects STANDARD metadata writes in %s', async (status) => { db.scale.findUnique.mockResolvedValue({ ...draft, status, instrumentClass: 'STANDARD' }); const r = response(); await scaleController.update(request({ name: 'Changed' }), r); expect(r.statusCode).toBe(400); expect(db.scale.update).not.toHaveBeenCalled() })
  it('publishes only the exact validated draft snapshot', async () => { const r = response(); await scaleImageController.publish(request({}), r); expect(r.statusCode).toBe(200); expect(db.scale.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scale', status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definitionHash: draft.definitionHash, updatedAt: draft.updatedAt } })) })
  it('rejects a stale publication instead of reverting a concurrent edit', async () => { db.scale.update.mockRejectedValue(Object.assign(new Error('guard'), { code: 'P2025' })); const r = response(); await scaleImageController.publish(request({}), r); expect(r.statusCode).toBe(409) })
})
