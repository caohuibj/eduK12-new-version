import { writeFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ parent: vi.fn(), sectionFind: vi.fn(), sectionCreate: vi.fn(), cognitive: vi.fn(), situational: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  compositeAssessmentAttempt: { findUnique: mocks.parent },
  compositeFormSectionAttempt: { findUnique: mocks.sectionFind, create: mocks.sectionCreate },
  cognitiveSession: { findUnique: mocks.cognitive },
  situationalAttempt: { findUnique: mocks.situational },
} }))
import { compileWeightedVariants, createWeightedVariantAllocation } from '../../modules/assessment-core/weighted-variants'
import { buildTrainingVariantUnion, resolveTrainingAttemptScope } from '../../modules/composite/training-variant-scope'
import { assertTrainingChildSelected, assertTrainingSectionSelected } from '../../modules/composite/training-variant-child-scope'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { activateCompositeFormAdmission, ensureCompositeSectionAttempt } from '../../modules/assessment-runtime/form-admission.service'
import { submitUnifiedCompositeFormSectionFinal } from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import { getSession, getPublicSession } from '../../modules/cognitive/session.service'
import { activateCognitiveAdmission } from '../../modules/cognitive/cognitive-admission.service'
import { activateScaleAdmission } from '../../modules/scale/scale-admission.service'
import { serveCognitiveSessionImage, servePublicCognitiveSessionImage } from '../../modules/cognitive/cognitive-image.service'
import { issueCognitiveSessionVideoCapabilities } from '../../modules/cognitive/cognitive-video.service'
import { loadSituationalAttemptRuntime, loadEmbeddedSituationalAttemptRuntime } from '../../modules/situational/situational-runtime.service'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { getParticipantKey } from '../../modules/assessment-runtime/participant-key'
import { hashRecoveryToken } from '../../services/anonymousAccess'
import { lockSession } from '../../modules/cognitive/session-lock'
import { freezeCompositeAttemptContext } from '../../services/assessmentContextService'

const fixture = () => {
  const form = (key: string, position: number) => ({ id: `form-${key}`, type: 'FORM', position, formSectionId: `section-${key}`, formSectionPosition: 0,
    formType: 'text_input', formLabel: `private ${key}`, formOptions: null, required: true, contextKey: null })
  const items = [form('a', 0), { id: 'scale-a', type: 'SCALE', position: 1, required: true, scaleId: 'scale-a' },
    { id: 'cognitive-a', type: 'COGNITIVE', position: 2, required: true, cognitiveAssignmentId: 'cognitive-a' },
    { id: 'sjt-a', type: 'SITUATIONAL', position: 3, required: true, situationalInstrumentKey: 'sjt-a', situationalInstrumentVersion: '1.0.0' },
    form('b', 4), { id: 'scale-b', type: 'SCALE', position: 5, required: true, scaleId: 'scale-b' },
    { id: 'cognitive-b', type: 'COGNITIVE', position: 6, required: true, cognitiveAssignmentId: 'cognitive-b' },
    { id: 'sjt-b', type: 'SITUATIONAL', position: 7, required: true, situationalInstrumentKey: 'sjt-b', situationalInstrumentVersion: '1.0.0' }]
  const composite: any = { id: 'composite', publishedAt: new Date('2026-10-18T08:00:00Z'), items,
    formSections: ['a', 'b'].map((key, i) => ({ id: `section-${key}`, title: `private section ${key}`, position: i * 4, contextSection: false, items: [items[i * 4]] })),
    trainingVariantDraft: null }
  const compiled = compileWeightedVariants({ schemaVersion: 1, groups: ['a', 'b'].map(key => ({ variantKey: `group_${key}`, label: `secret ${key}`, weight: 1,
    units: [{ type: 'FORM_SECTION', id: `section-${key}` }, ...['scale', 'cognitive', 'sjt'].map(type => ({ type: 'ITEM', id: `${type}-${key}` }))] })) }, buildTrainingVariantUnion(composite))
  composite.trainingVariantFrozen = compiled; composite.trainingVariantDigest = compiled.configDigest
  const allocation = createWeightedVariantAllocation(compiled, { compositeId: 'composite', attemptId: 'attempt', participantKey: 'participant', attemptEpoch: 1, publishedAt: composite.publishedAt.toISOString() }, { randomInt: () => 0 })
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    slots: [{ slotKey: 'form-section:section-a', unitType: 'FORM_SECTION', required: true, sourceDefinitionIdentity: { key: 'section-a', version: 'FORM_SECTION_V1', hash: canonicalHash(mapCompositeSection(composite.formSections[0])) }, sourceBinding: {} },
      ...(['SCALE', 'COGNITIVE', 'SITUATIONAL'] as const).map(type => ({ slotKey: `${type.toLowerCase()}:${type === 'SITUATIONAL' ? 'sjt' : type.toLowerCase()}-a`, unitType: type, required: true,
        sourceDefinitionIdentity: { key: `${type === 'SITUATIONAL' ? 'sjt' : type.toLowerCase()}-a`, version: '1.0.0', hash: 'a'.repeat(64) }, sourceBinding: {},
        ...(type === 'SITUATIONAL' ? { runtimeIdentity: { instrumentKey: 'sjt-a', instrumentVersion: '1.0.0', definitionHash: 'a'.repeat(64), compiledRuntimeHash: 'b'.repeat(64), scorerKey: 'sjt', scoringVersion: '1.0.0', runtimeGeneration: 'UNIFIED_V1' as const, deliveryMode: 'FINAL_ONLY' as const, frozenAt: '2026-10-18T08:00:00.000Z' } } : {}) }))] })
  return { id: 'attempt', userId: 'user', recoveryTokenHash: null, participantKey: 'participant', attemptEpoch: 1, status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY',
    compositeAssessment: composite, trainingVariantAllocationEncrypted: encryptUnifiedRuntimePayload(allocation), trainingVariantAllocationHash: allocation.allocationHash,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash }
}
beforeEach(() => { vi.resetAllMocks(); process.env.DATA_ENCRYPTION_KEY = '1'.repeat(64); process.env.DATA_PSEUDONYM_KEY = '2'.repeat(64) })

describe('C14 selected child scope enforcement', () => {
  it('projects the selected group without mutating the publication union and reuses one parent read', async () => {
    const parent = fixture(); mocks.parent.mockResolvedValue(parent)
    const projected = await assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'scale-a' })
    expect(projected.compositeAssessment.items.map((item: any) => item.id)).toEqual(['form-a', 'scale-a', 'cognitive-a', 'sjt-a'])
    expect(parent.compositeAssessment.items).toHaveLength(8)
    await assertTrainingSectionSelected('attempt', 'section-a', { parent: projected })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
    expect(await resolveTrainingAttemptScope(projected)).toBe(await resolveTrainingAttemptScope(parent))
  })
  it.each(['form-b', 'scale-b', 'cognitive-b', 'sjt-b', 'unknown'])('rejects unselected child %s', async id => {
    const parent = fixture()
    await expect(assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: id }, { parent })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.parent).not.toHaveBeenCalled()
  })
  it('reloads narrow caller parents rather than treating missing metadata as a legacy allocation', async () => {
    mocks.parent.mockResolvedValue(fixture())
    await expect(assertTrainingSectionSelected('attempt', 'section-b', { parent: { id: 'attempt', compositeAssessment: { formSections: [] } } })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
  })
  it.each(['allocation', 'digest', 'slotset', 'union'])('fails closed for tampered %s before child access', async corruption => {
    const parent = fixture()
    if (corruption === 'allocation') parent.trainingVariantAllocationHash = 'f'.repeat(64)
    if (corruption === 'digest') parent.compositeAssessment.trainingVariantDigest = 'f'.repeat(64)
    if (corruption === 'slotset') parent.frozenActiveSlotSetHash = 'f'.repeat(64)
    if (corruption === 'union') parent.compositeAssessment.formSections[1].title = 'tampered'
    await expect(assertTrainingSectionSelected('attempt', 'section-a', { parent })).rejects.toThrow(/冻结/)
  })
  it('preserves legacy null parent identity and standalone zero-read behavior', async () => {
    expect(await assertTrainingChildSelected({ compositeAttemptId: null })).toBeUndefined()
    const parent: any = { id: 'legacy', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null, items: [{ id: 'legacy-item' }], formSections: [] } }
    expect(await assertTrainingChildSelected({ compositeAttemptId: 'legacy', compositeItemId: 'legacy-item' }, { parent })).toBe(parent)
    expect(mocks.parent).not.toHaveBeenCalled()
  })
  it('keeps explicit-null child and section guards at zero additional queries or union bytes', async () => {
    const marker: any = { id: 'legacy', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } }
    const legacyUnion = { ...fixture(), ...marker, compositeAssessment: { ...fixture().compositeAssessment, ...marker.compositeAssessment } }
    for (const type of ['scale', 'cognitive', 'sjt']) {
      expect(await assertTrainingChildSelected({ compositeAttemptId: 'legacy', compositeItemId: `${type}-a`, compositeAttempt: marker })).toBe(marker)
    }
    expect(await assertTrainingSectionSelected('legacy', 'section-a', { parent: marker })).toBe(marker)
    expect(mocks.parent).not.toHaveBeenCalled()
    expect(marker.compositeAssessment).not.toHaveProperty('items')
    const diagnostic = {
      sample: 'two groups, four tools, null variant metadata', node: process.version,
      previousAdditionalPrismaParentCallsPerGuard: 1, currentAdditionalPrismaParentCallsPerGuard: mocks.parent.mock.calls.length,
      previousFullParentResultJsonBytes: Buffer.byteLength(JSON.stringify(legacyUnion)),
      currentAdditionalParentResultJsonBytes: 0,
      markerJsonBytesAddedToExistingOwnerRead: Buffer.byteLength(JSON.stringify(marker)),
      scope: 'Synthetic service-call/read-shape diagnostic only; not SQL wire bytes, physical SQL counts, or C26 capacity evidence',
    }
    if (process.env.C14_CHILD_READ_DIAGNOSTIC) writeFileSync(process.env.C14_CHILD_READ_DIAGNOSTIC, JSON.stringify(diagnostic, null, 2))
  })
  it('expands a configured marker once and reuses verified scope across child and section checks', async () => {
    const parent = fixture()
    const marker = { id: parent.id, trainingVariantAllocationEncrypted: parent.trainingVariantAllocationEncrypted,
      trainingVariantAllocationHash: parent.trainingVariantAllocationHash, compositeAssessment: {
        trainingVariantDraft: null, trainingVariantFrozen: parent.compositeAssessment.trainingVariantFrozen,
        trainingVariantDigest: parent.compositeAssessment.trainingVariantDigest,
      } }
    mocks.parent.mockResolvedValue(parent)
    const selected = await assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'scale-a', compositeAttempt: marker })
    await assertTrainingSectionSelected('attempt', 'section-a', { parent: marker })
    await assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'cognitive-a' }, { parent: selected })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
    expect(mocks.parent.mock.calls[0][0].include.compositeAssessment.include.items).toBe(true)
    expect(await resolveTrainingAttemptScope(selected)).toBe(await resolveTrainingAttemptScope(parent))
  })
  it('does not treat null allocation markers as legacy when the definition remains configured', async () => {
    const parent = fixture()
    parent.trainingVariantAllocationEncrypted = null as any
    parent.trainingVariantAllocationHash = null as any
    const marker = { id: parent.id, trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: parent.compositeAssessment.trainingVariantFrozen,
        trainingVariantDigest: parent.compositeAssessment.trainingVariantDigest } }
    mocks.parent.mockResolvedValue(parent)
    await expect(assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'scale-a', compositeAttempt: marker })).rejects.toThrow(/冻结/)
    expect(mocks.parent).toHaveBeenCalledTimes(1)
  })
  it('checks only narrow metadata when a legacy caller has not selected any variant fields', async () => {
    const marker = { id: 'legacy', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } }
    mocks.parent.mockResolvedValue(marker)
    await assertTrainingChildSelected({ compositeAttemptId: 'legacy', compositeItemId: 'old-item' })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
    expect(mocks.parent.mock.calls[0][0]).not.toHaveProperty('include')
    expect(mocks.parent.mock.calls[0][0].select.compositeAssessment.select).not.toHaveProperty('items')
  })
  it.each(['FORM', 'SCALE', 'COGNITIVE'])('keeps legacy %s stored-admission decoding free of added parent queries', async type => {
    const parent = { id: 'legacy', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } }
    const child: any = { id: 'legacy-child', compositeAttemptId: 'legacy', compositeItemId: 'old-item', compositeAttempt: parent,
      attemptEpoch: 1, frozenAdmissionSnapshotEncrypted: 'corrupt-snapshot', frozenAdmissionSnapshotHash: 'x' }
    const result = type === 'FORM'
      ? activateCompositeFormAdmission({ parent, sectionId: 'old-section', definition: {} as any, child } as any)
      : type === 'SCALE' ? activateScaleAdmission(child) : activateCognitiveAdmission(child)
    await expect(result).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.parent).not.toHaveBeenCalled()
  })
  it('carries null markers through the existing Cognitive row lock without an additional parent read', async () => {
    const marker = { id: 'legacy', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } }
    const tx: any = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'child', composite_attempt_id: 'legacy', composite_item_id: 'cognitive-a', training_variant_parent: marker }]) }
    const child = await lockSession(tx, 'child')
    expect(await assertTrainingChildSelected(child!, { db: tx })).toBe(marker)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    const query = tx.$queryRaw.mock.calls[0][0].sql
    expect(query).toContain('training_variant_parent')
    expect(query).toContain('FOR UPDATE')
    expect(mocks.parent).not.toHaveBeenCalled()
  })
  it('rejects a narrow marker read that still omits any required metadata', async () => {
    mocks.parent.mockResolvedValue({ id: 'attempt', trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantFrozen: null, trainingVariantDigest: null } })
    await expect(ensureCompositeSectionAttempt('attempt', 'section-a', 1)).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
    expect(mocks.parent.mock.calls[0][0]).not.toHaveProperty('include')
    expect(mocks.sectionFind).not.toHaveBeenCalled()
    expect(mocks.sectionCreate).not.toHaveBeenCalled()
  })
  it('reloads explicit undefined markers instead of bypassing as legacy', async () => {
    const supplied = { id: 'attempt', trainingVariantAllocationEncrypted: undefined, trainingVariantAllocationHash: null,
      compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null } }
    mocks.parent.mockResolvedValue(fixture())
    await expect(assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'scale-b', compositeAttempt: supplied })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
  })
  it('rejects incomplete metadata returned by the full graph fetch too', async () => {
    const parent = fixture(), marker = { id: parent.id, trainingVariantAllocationEncrypted: parent.trainingVariantAllocationEncrypted,
      trainingVariantAllocationHash: parent.trainingVariantAllocationHash, compositeAssessment: {
        trainingVariantDraft: null, trainingVariantFrozen: parent.compositeAssessment.trainingVariantFrozen,
        trainingVariantDigest: parent.compositeAssessment.trainingVariantDigest } }
    delete parent.compositeAssessment.trainingVariantDraft
    mocks.parent.mockResolvedValue(parent)
    await expect(assertTrainingChildSelected({ compositeAttemptId: 'attempt', compositeItemId: 'scale-a', compositeAttempt: marker })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    expect(mocks.parent).toHaveBeenCalledTimes(1)
  })
  it('rejects an unselected Form before creating or loading any section child', async () => {
    const parent = fixture(); mocks.parent.mockResolvedValue(parent)
    await expect(ensureCompositeSectionAttempt('attempt', 'section-b', 1)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.sectionFind).not.toHaveBeenCalled(); expect(mocks.sectionCreate).not.toHaveBeenCalled()
  })
  it('rejects direct Form FINAL before section creation or admission writes', async () => {
    mocks.parent.mockResolvedValue(fixture())
    await expect(submitUnifiedCompositeFormSectionFinal({ attemptId: 'attempt', sectionId: 'section-b', submissionId: 'forged-submission-0001', attemptEpoch: 1, definitionHash: 'a'.repeat(64), userId: 'user', answers: [] })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.sectionFind).not.toHaveBeenCalled(); expect(mocks.sectionCreate).not.toHaveBeenCalled()
  })
  it.each(['IN_PROGRESS', 'COMPLETED'])('rejects direct Cognitive %s state and result before decoding', async status => {
    mocks.parent.mockImplementation(async () => fixture())
    mocks.cognitive.mockResolvedValue({ id: 'child', userId: 'user', status, compositeAttemptId: 'attempt', compositeItemId: 'cognitive-b', configSnapshotEncrypted: 'must-not-decrypt', trials: [] })
    await expect(getSession('user', 'child')).rejects.toMatchObject({ statusCode: 404 })
    mocks.cognitive.mockResolvedValue({ id: 'child', userId: null, recoveryTokenHash: 'recovery', status, compositeAttemptId: 'attempt', compositeItemId: 'cognitive-b', configSnapshotEncrypted: 'must-not-decrypt', trials: [] })
    await expect(getPublicSession('recovery', 'child')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('does not let a preexisting frozen Form admission bypass selected section membership', async () => {
    await expect(activateCompositeFormAdmission({ parent: fixture(), sectionId: 'section-b', definition: {} as any,
      child: { id: 'forged', attemptEpoch: 1, frozenAdmissionSnapshotEncrypted: 'must-not-decrypt', frozenAdmissionSnapshotHash: 'x' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each(['SCALE', 'COGNITIVE'])('checks selection before stored %s admission decoding', async type => {
    const parent = fixture(), child: any = { compositeAttemptId: 'attempt', compositeItemId: `${type.toLowerCase()}-b`, frozenAdmissionSnapshotEncrypted: 'must-not-decrypt' }
    const call = type === 'SCALE' ? activateScaleAdmission(child, parent as any) : activateCognitiveAdmission(child, parent as any)
    await expect(call).rejects.toMatchObject({ statusCode: 404 })
  })
  it('blocks authenticated Cognitive images and video before decoding or looking up media', async () => {
    mocks.parent.mockImplementation(async () => fixture())
    mocks.cognitive.mockResolvedValue({ userId: 'user', compositeAttemptId: 'attempt', compositeItemId: 'cognitive-b', configSnapshotEncrypted: 'must-not-decrypt' })
    await expect(serveCognitiveSessionImage({ userId: 'user', sessionId: 'child', assetId: 'image', res: {} as any })).rejects.toMatchObject({ statusCode: 404 })
    await expect(issueCognitiveSessionVideoCapabilities({ userId: 'user', sessionId: 'child', videoKey: 'video' })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('blocks recovery-owned Cognitive media before decoding or looking up media', async () => {
    const recoveryToken = 'a'.repeat(64), recoveryTokenHash = hashRecoveryToken(recoveryToken)
    mocks.parent.mockResolvedValue(fixture())
    mocks.cognitive.mockResolvedValue({ userId: null, recoveryTokenHash, compositeAttemptId: 'attempt', compositeItemId: 'cognitive-b', configSnapshotEncrypted: 'must-not-decrypt' })
    await expect(servePublicCognitiveSessionImage({ recoveryToken, sessionId: 'child', assetId: 'image', res: {} as any })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('blocks direct and embedded SJT runtime before decoding its frozen content', async () => {
    const parent = fixture(), participantKey = getParticipantKey('user')
    mocks.parent.mockResolvedValue(parent)
    mocks.situational.mockResolvedValue({ userId: 'user', participantKey, compositeAttemptId: 'attempt', compositeItemId: 'sjt-b', compositeSlotKey: 'situational:sjt-b',
      compositeAttempt: { id: 'attempt', userId: 'user', status: 'IN_PROGRESS' }, runtimeSnapshotEncrypted: 'must-not-decrypt' })
    await expect(loadSituationalAttemptRuntime('child', 'user')).rejects.toMatchObject({ statusCode: 404 })
    await expect(loadEmbeddedSituationalAttemptRuntime('child', { userId: 'user', compositeAttemptId: 'attempt', compositeItemId: 'sjt-b', compositeSlotKey: 'situational:sjt-b', parent })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('validates allocation even when context was already frozen', async () => {
    const parent: any = fixture(); parent.trainingVariantAllocationHash = 'f'.repeat(64)
    parent.contextSnapshotEncrypted = 'must-not-decrypt'; parent.contextSnapshotHash = 'exists'; parent.formAnswers = []
    const tx: any = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'attempt' }]), compositeAssessmentAttempt: { findUnique: vi.fn().mockResolvedValue(parent), updateMany: vi.fn() } }
    await expect(freezeCompositeAttemptContext(tx, 'attempt')).rejects.toThrow(/冻结/)
    expect(tx.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled()
  })
})
