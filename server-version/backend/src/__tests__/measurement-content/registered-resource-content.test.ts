import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ release: vi.fn() }))
vi.mock('../../modules/measurement-content/repository', () => ({ getContentRelease: mocks.release }))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { scaleMeasurementRelease } from '../../modules/measurement-content/scale'
import { prepareRelease } from '../../modules/measurement-content/release'
import { prepareRegisteredResourceContentSnapshot } from '../../modules/assessment-run/registeredResourceContent'
import { prepareTrainingContentAttemptBinding } from '../../modules/composite/training-content-binding'
import { freezeTrainingReferenceBinding } from '../../modules/composite/training-reference-binding'
import { prepareTrainingFinalReceipt, decodeTrainingFinalReceipt } from '../../modules/composite/training-content-final'
import { createCanonicalUnitResultEnvelope, projectScaleCanonicalUnitResult } from '../../modules/assessment-runtime/unit-result'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'

const releaseId = '11111111-1111-4111-8111-111111111111'
const definition = () => compileResearchScale('Registered descriptive source', {
  schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
  responseOptions: [{ optionKey: 'low', label: '少', score: 1 }, { optionKey: 'high', label: '多', score: 2 }],
  dimensions: [{ dimensionKey: 'effort', label: '投入', direction: 'descriptive' }],
  items: [{ itemKey: 'one', prompt: '我愿意尝试', required: true, reverse: false, dimensionKeys: ['effort'] }],
})
const scale = () => ({
  id: 'scale', code: 'scale-code', instrumentVersion: '1', instrumentClass: 'CUSTOM_DESCRIPTIVE',
  creatorId: 'original-author', status: 'PUBLISHED', measurementReleaseId: releaseId,
  definition: definition(), definitionHash: hashScaleDefinition(definition()),
})
const release = () => ({
  ...prepareRelease(scaleMeasurementRelease({
    localId: 'scale', version: '1', instrumentVersion: '1', definition: definition(), instrumentClass: 'CUSTOM_DESCRIPTIVE',
    scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId: 'original-author', resourceId: 'scale' },
  })),
  releaseId, status: 'PUBLISHED',
})
const target = () => ({
  id: 'composite', productKind: 'ORGANIZATION_RESOURCE', status: 'DRAFT',
  trainingContentSnapshot: null as unknown, trainingContentSnapshotHash: null as string | null,
  items: [{ id: 'item', type: 'SCALE', scaleId: 'scale' }],
})
const db = {
  $queryRaw: vi.fn(),
  compositeAssessment: { findUnique: vi.fn() },
  compositeAssessmentAttempt: { updateMany: vi.fn() },
}
const prepare = (purpose: 'REGISTER' | 'PUBLISH' = 'REGISTER', value: any = scale()) =>
  prepareRegisteredResourceContentSnapshot(db as never, { compositeId: 'composite', scale: value, purpose })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
  db.$queryRaw.mockResolvedValue([{ now: new Date('2026-10-20T00:00:00Z') }])
  db.compositeAssessment.findUnique.mockResolvedValue(target())
  db.compositeAssessmentAttempt.updateMany.mockResolvedValue({ count: 1 })
  mocks.release.mockResolvedValue(release())
})
afterEach(() => vi.unstubAllEnvs())
describe('School/Teacher registered descriptive consumption', () => {
  it('freezes original source identity with empty candidates and no private staff report', async () => {
    const content = await prepare()
    expect(content.snapshotHash).toBe(canonicalHash(content.snapshot))
    expect(content.snapshot.units).toEqual([{
      itemId: 'item', family: 'SCALE', source: { kind: 'SCALE', id: 'scale', ownerId: 'original-author' },
      measurement: { releaseId, contentHash: release().contentHash, measurementHash: (release().content as any).measurementHash },
      referencePolicy: { policyVersion: 'EXACT_POPULATION_PRIORITY_V1', measurementReleaseId: releaseId, choices: [] },
    }])
    expect(JSON.stringify(content.snapshot)).not.toMatch(/"report"|"template"|"responseSets"/)
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(db, releaseId, true)
  })
  it('rechecks the identical frozen selection for review and publication, never rewrites it', async () => {
    const content = await prepare(), stored = {
      ...target(), trainingContentSnapshot: content.snapshot, trainingContentSnapshotHash: content.snapshotHash,
    }
    db.compositeAssessment.findUnique.mockResolvedValue(stored)
    await expect(prepare('PUBLISH')).resolves.toEqual(content)
    await expect(prepare()).rejects.toMatchObject({ code: 'RESOURCE_CONTENT_ALREADY_FROZEN' })
    stored.trainingContentSnapshotHash = 'f'.repeat(64)
    await expect(prepare('PUBLISH')).rejects.toMatchObject({ code: 'RESOURCE_CONTENT_SOURCE_CHANGED' })
  })
  it('requires explicit source publication and re-registration of old unbound drafts', async () => {
    await expect(prepare('REGISTER', { ...scale(), measurementReleaseId: null }))
      .rejects.toMatchObject({ code: 'RESOURCE_CONTENT_SOURCE_RELEASE_REQUIRED', statusCode: 409 })
    await expect(prepare('PUBLISH')).rejects.toMatchObject({ code: 'RESOURCE_CONTENT_REREGISTRATION_REQUIRED', statusCode: 409 })
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('rejects source identity, license, content, scope and lifecycle substitutions', async () => {
    for (const patch of [{ status: 'RETIRED' }, { status: 'REVOKED' }, { layer: 'REPORT' },
      { scope: { kind: 'PRIVATE', product: 'SURVEY', ownerId: 'original-author', resourceId: 'scale' } },
      { scope: { kind: 'PRIVATE', product: 'TRAINING', ownerId: 'other', resourceId: 'scale' } },
      { contentHash: 'f'.repeat(64) }]) {
      mocks.release.mockResolvedValueOnce({ ...release(), ...patch })
      await expect(prepare()).rejects.toMatchObject({ code: 'RESOURCE_CONTENT_SOURCE_INVALID' })
    }
    const restricted = scale(); restricted.definition.license.redistribution = 'restricted'
    restricted.definitionHash = hashScaleDefinition(restricted.definition)
    // Redistribution licensing is reference-only metadata now; it no longer
    // gates registered content preparation.
    await expect(prepare('REGISTER', restricted)).resolves.toBeDefined()
  })
  it('rejects wrong runtime target, extra items and partial prior freeze before source reads', async () => {
    for (const patch of [{ productKind: 'QUESTIONNAIRE' }, { status: 'PUBLISHED' },
      { items: [{ id: 'item', type: 'SCALE', scaleId: 'other' }] },
      { items: [...target().items, ...target().items] },
      { trainingContentSnapshotHash: 'f'.repeat(64) }]) {
      db.compositeAssessment.findUnique.mockResolvedValueOnce({ ...target(), ...patch })
      await expect(prepare()).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('carries explicit empty selection into shared START without changing legacy null/null', async () => {
    const content = await prepare()
    const composite = { id: 'composite', createdBy: 'registration-admin', items: [{ id: 'item', type: 'SCALE', scale: scale() }] }
    const start = (snapshot: unknown, snapshotHash: string | null) => prepareTrainingContentAttemptBinding(db as never, {
      compositeId: composite.id, attemptId: 'attempt', epoch: 1, snapshot, snapshotHash,
      composite, resolvedSituational: new Map(),
    })
    const bound = (await start(content.snapshot, content.snapshotHash))!
    expect(bound.binding.units).toEqual(content.snapshot.units)
    const parent = {
      id: 'attempt', attemptEpoch: 1, compositeAssessmentId: 'composite', compositeAssessment: { createdBy: 'registration-admin' },
      trainingContentBinding: bound.binding, trainingContentBindingHash: bound.bindingHash,
    }
    const selected = await freezeTrainingReferenceBinding(db as never, parent)
    expect(selected?.units).toEqual([{ itemId: 'item', references: [] }])
    const hash = 'a'.repeat(64), completedAt = '2026-10-20T00:00:00.000Z'
    const runtime: any = {
      schemaVersion: 1, compilerVersion: 'fixture', instrumentType: 'SCALE', instrumentKey: 'scale-code',
      instrumentVersion: '1', sourceDefinitionHash: hash, compiledRuntimeHash: hash,
      scorerKey: 'scale', scorerVersion: '1', metricDefinitions: { effort: { unit: 'points' } },
      aggregateProjection: { allowedMetricKeys: ['effort'], allowedFactKeys: [], allowedReferenceClassifications: [] },
    }
    const envelope = createCanonicalUnitResultEnvelope({
      core: projectScaleCanonicalUnitResult({ runtime, contextHash: null,
        result: { quality: { status: 'interpretable', flags: [] }, scores: [{ key: 'effort', value: 2, status: 'calculated' }], references: [] } as any }),
      completedAt, persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'child' },
    })
    const finalParent = {
      ...parent, compositeAssessment: { id: 'composite', createdBy: 'registration-admin' },
      trainingReferenceBinding: selected, trainingReferenceBindingHash: canonicalHash(selected),
    }
    const final = (await prepareTrainingFinalReceipt(db as never, {
      parent: finalParent, aggregateInputHash: hash, completedAt,
      verifiedPayloads: [{ header: { slotKey: compositeItemSlotKey('item', 'SCALE') }, envelope }],
    }))!
    expect(final.receipt.sources).toEqual([{ itemId: 'item', resultHash: envelope.resultHash }])
    expect(final.receipt.interpretation.units).toEqual([{
      instrumentKey: 'item', status: 'NOT_SELECTED', references: [], report: { status: 'NOT_SELECTED' },
    }])
    expect(decodeTrainingFinalReceipt({ ...finalParent, aggregateInputHash: hash,
      trainingContentInterpretationEncrypted: final.encrypted, trainingContentInterpretationHash: final.hash })).toEqual(final.receipt)
    mocks.release.mockClear()
    expect(await start(null, null)).toBeNull()
    expect(mocks.release).not.toHaveBeenCalled()
  })
})
