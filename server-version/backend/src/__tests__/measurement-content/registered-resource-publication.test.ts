import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  tx: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), scale: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    compositeAssessment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
  content: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: { $transaction: (work: any) => work(mocks.tx) } }))
vi.mock('../../modules/assessment-run/registeredResourceContent', () => ({ prepareRegisteredResourceContentSnapshot: mocks.content }))
import { registerDescriptiveResource, transitionDescriptiveResource, descriptiveResourceEntry } from '../../modules/assessment-run/registeredResources'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const definition = compileResearchScale('Registered source', {
  schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
  responseOptions: [{ optionKey: 'low', label: '少', score: 1 }, { optionKey: 'high', label: '多', score: 2 }],
  dimensions: [{ dimensionKey: 'effort', label: '投入', direction: 'descriptive' }],
  items: [{ itemKey: 'one', prompt: '我愿意尝试', required: true, reverse: false, dimensionKeys: ['effort'] }],
})
const scale = { id: 'scale', name: 'Registered source', creatorId: 'source-author', instruction: '',
  status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition, definitionHash: hashScaleDefinition(definition) }
const actor = { userId: 'register-admin', platformRole: 'SYSTEM_ADMIN' }
const row = (status = 'PUBLISHED') => {
  const entry = descriptiveResourceEntry({ scaleId: scale.id, name: scale.name, definition,
    definitionHash: scale.definitionHash, compositeId: 'old-composite', version: '1.0.1', mode: 'INDIVIDUAL' })
  return { id: 'old-registration', resource_key: 'custom-scale:scale:INDIVIDUAL', resource_version: '1.0.1',
    scale_id: scale.id, definition_hash: scale.definitionHash, composite_id: 'old-composite',
    entry, entry_hash: canonicalHash(entry), status, created_by_user_id: actor.userId, reviewed_by_user_id: 'reviewer' }
}
let existing: ReturnType<typeof row>
const content = { snapshot: { schemaVersion: 1, compositeId: 'new-composite', units: [] }, snapshotHash: 'a'.repeat(64) }
beforeEach(() => {
  vi.resetAllMocks(); existing = row()
  mocks.tx.scale.findUnique.mockResolvedValue(scale); mocks.tx.scale.findUniqueOrThrow.mockResolvedValue(scale)
  mocks.tx.compositeAssessment.findUnique.mockResolvedValue({ trainingContentSnapshot: null, trainingContentSnapshotHash: null })
  mocks.tx.compositeAssessment.create.mockResolvedValue({ id: 'new-composite' })
  mocks.content.mockResolvedValue(content)
  mocks.tx.$queryRaw.mockImplementation(async (query: any) => {
    const text = (query.strings ?? query).join(' ')
    if (text.includes('SELECT COUNT(*)')) return [{ n: 1 }]
    if (text.includes('SELECT * FROM registered_assessment_resources')) return [existing]
    if (text.includes('INSERT INTO registered_assessment_resources')) return [{ ...existing, id: 'new-registration', composite_id: 'new-composite', status: 'DRAFT', resource_version: '1.0.2' }]
    if (text.includes('UPDATE registered_assessment_resources')) return [{ ...existing, status: 'PUBLISHED' }]
    return []
  })
})
describe('registered resource trusted publication callsites', () => {
  it.each(['DRAFT', 'REVIEWED', 'PUBLISHED'])('explicit re-registration of legacy %s creates a fresh version without touching old content', async status => {
    existing = row(status)
    const result = await registerDescriptiveResource(actor, scale.id)
    expect(result).toMatchObject({ id: 'new-registration', resource_version: '1.0.2' })
    expect(mocks.content).toHaveBeenCalledExactlyOnceWith(mocks.tx, { compositeId: 'new-composite', scale, purpose: 'REGISTER' })
    expect(mocks.tx.compositeAssessment.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'new-composite' }, data: { trainingContentSnapshot: content.snapshot, trainingContentSnapshotHash: content.snapshotHash },
    })
    expect(existing).toEqual(row(status))
  })
  it('reuses an already frozen registration without creating, publishing or regranting content', async () => {
    mocks.tx.compositeAssessment.findUnique.mockResolvedValue({ trainingContentSnapshot: content.snapshot, trainingContentSnapshotHash: content.snapshotHash })
    expect(await registerDescriptiveResource(actor, scale.id)).toEqual(existing)
    expect(mocks.tx.compositeAssessment.create).not.toHaveBeenCalled()
    expect(mocks.content).not.toHaveBeenCalled()
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('fails closed on a missing runtime target or partial freeze instead of treating it as legacy', async () => {
    for (const target of [null, { trainingContentSnapshot: null, trainingContentSnapshotHash: 'a'.repeat(64) }]) {
      mocks.tx.compositeAssessment.findUnique.mockResolvedValueOnce(target)
      await expect(registerDescriptiveResource(actor, scale.id)).rejects.toMatchObject({ code: 'RESOURCE_INTEGRITY' })
    }
    expect(mocks.tx.compositeAssessment.create).not.toHaveBeenCalled()
    expect(mocks.content).not.toHaveBeenCalled()
  })
  it('publishes only after independent review and frozen-content revalidation in the same transaction', async () => {
    existing = row('REVIEWED')
    await transitionDescriptiveResource(actor, existing.id, 'publish')
    expect(mocks.content).toHaveBeenCalledExactlyOnceWith(mocks.tx, { compositeId: existing.composite_id, scale, purpose: 'PUBLISH' })
    expect(mocks.tx.compositeAssessment.update).toHaveBeenCalledWith({
      where: { id: existing.composite_id }, data: {
        status: 'PUBLISHED', publishedAt: expect.any(Date),
        trainingContentSnapshot: content.snapshot, trainingContentSnapshotHash: content.snapshotHash,
      },
    })
  })
  it('does not publish or bypass review when legacy freeze or source verification fails', async () => {
    existing = row('REVIEWED')
    mocks.content.mockRejectedValue(Object.assign(new Error('Re-registration required'), { code: 'RESOURCE_CONTENT_REREGISTRATION_REQUIRED' }))
    await expect(transitionDescriptiveResource(actor, existing.id, 'publish'))
      .rejects.toMatchObject({ code: 'RESOURCE_CONTENT_REREGISTRATION_REQUIRED' })
    expect(mocks.tx.compositeAssessment.update).not.toHaveBeenCalled()
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    mocks.content.mockClear(); existing.reviewed_by_user_id = scale.creatorId
    await expect(transitionDescriptiveResource(actor, existing.id, 'publish'))
      .rejects.toMatchObject({ code: 'RESOURCE_INDEPENDENT_REVIEW_REQUIRED' })
    expect(mocks.content).not.toHaveBeenCalled()
  })
})
