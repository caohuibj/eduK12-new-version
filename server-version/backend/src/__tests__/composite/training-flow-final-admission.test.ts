import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ parent: vi.fn(), resolve: vi.fn(), child: vi.fn(), create: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { compositeAssessmentAttempt: { findUnique: mocks.parent }, compositeFormSectionAttempt: { findUnique: mocks.child, create: mocks.create } } }))
vi.mock('../../modules/composite/training-flow-scope', async importOriginal => ({ ...await importOriginal<any>(), resolveTrainingFlowScope: mocks.resolve }))
import { assertTrainingFormFinalPrincipal, lockTrainingFlowFinalAdmission, requiresTrainingFlowFinalLock } from '../../modules/composite/training-variant-child-scope'
import { submitUnifiedCompositeFormSectionFinal } from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'
const parentFixture = (flow = true): any => ({
  id: 'parent', userId: 'owner', recoveryTokenHash: null, attemptEpoch: 3, status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY',
  trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
  trainingFlowSnapshotEncrypted: flow ? 'frozen' : null, trainingFlowSnapshotHash: flow ? 'hash' : null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
  compositeAssessment: { trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    trainingFlowDraft: null, trainingFlowFrozen: flow ? { flowDigest: 'flow' } : null, trainingFlowDigest: flow ? 'flow' : null,
    items: [{ id: 'scale', type: 'SCALE' }, { id: 'cognitive', type: 'COGNITIVE' }, { id: 'sjt', type: 'SITUATIONAL' }, { id: 'future', type: 'SCALE' }, { id: 'skipped', type: 'SCALE' }], formSections: [{ id: 'form', items: [] }] },
})
const target = (parent = parentFixture()): any => ({ attemptId: 'parent', parent, attemptEpoch: 3, itemId: 'scale', sourceAttemptId: 'child', submissionId: 'submission' })
const scopeFixture = (key = 'item_scale', slot = 'scale:scale'): any => ({ path: { currentInstrumentKey: key }, terminal: false, reachedSlotKeys: new Set([slot]), executedSlotKeys: new Set(), snapshots: [] })
const transaction = (parent = parentFixture()) => ({ $queryRaw: vi.fn().mockResolvedValue([{ id: 'parent' }]), compositeAssessmentAttempt: { findUnique: vi.fn().mockResolvedValue(parent) } })
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(scopeFixture()) })

describe('C19 same-parent-lock FINAL admission', () => {
  it('keeps explicit-null and standalone FINAL paths at zero additional queries', async () => {
    const tx = transaction(), legacy = await lockTrainingFlowFinalAdmission(tx, target(parentFixture(false)))
    legacy(false); legacy(true)
    const standalone = await lockTrainingFlowFinalAdmission(tx, { ...target(), attemptId: null, parent: undefined }); standalone(false)
    expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(tx.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it.each(['trainingFlowSnapshotEncrypted', 'trainingFlowSnapshotHash', 'trainingFlowPathEncrypted', 'trainingFlowPathHash', 'trainingFlowDraft', 'trainingFlowFrozen', 'trainingFlowDigest'])('fails closed for missing marker %s', async field => {
    const parent = parentFixture(false), tx = transaction(); delete (field in parent ? parent : parent.compositeAssessment)[field]
    await expect(lockTrainingFlowFinalAdmission(tx, target(parent))).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it('rejects missing and mismatched preloaded parent identity', () => {
    expect(() => requiresTrainingFlowFinalLock('parent', undefined)).toThrow()
    expect(() => requiresTrainingFlowFinalLock('other', parentFixture())).toThrow()
  })
  it('locks parent before reloading the union and resolves facts in exactly that transaction', async () => {
    const stale = parentFixture(), fresh = parentFixture(), order: string[] = [], tx = transaction(fresh)
    stale.compositeAssessment.items = [{ id: 'stale', type: 'SCALE' }]
    tx.$queryRaw.mockImplementation(async () => { order.push('parent-lock'); return [{ id: 'parent' }] })
    tx.compositeAssessmentAttempt.findUnique.mockImplementation(async () => { order.push('fresh-graph'); return fresh })
    mocks.resolve.mockImplementation(async (parent, definition, options) => {
      order.push('same-tx-facts'); expect(parent).toBe(fresh); expect(definition).toBe(fresh.compositeAssessment); expect(options).toEqual({ db: tx }); return scopeFixture()
    })
    const admit = await lockTrainingFlowFinalAdmission(tx, target(stale)); admit(false)
    expect(order).toEqual(['parent-lock', 'fresh-graph', 'same-tx-facts'])
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE')
    expect(tx.compositeAssessmentAttempt.findUnique.mock.calls[0][0].include.compositeAssessment.include).toEqual({ items: true, formSections: { include: { items: true } } })
    expect(mocks.parent).not.toHaveBeenCalled()
  })
  it('waits for parent lock before checking the path advanced by a competing FINAL', async () => {
    const tx = transaction(), fresh = scopeFixture(); let release!: () => void
    tx.$queryRaw.mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve }); return [{ id: 'parent' }] })
    mocks.resolve.mockImplementation(async () => fresh)
    const pending = lockTrainingFlowFinalAdmission(tx, target()); await Promise.resolve()
    expect(tx.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
    fresh.path.currentInstrumentKey = 'item_cognitive'; fresh.reachedSlotKeys.add('cognitive:cognitive'); fresh.executedSlotKeys.add('scale:scale')
    fresh.snapshots.push({ slotKey: 'scale:scale', sourceAttemptId: 'child', sourceSubmissionId: 'submission' }); release()
    const admit = await pending
    expect(() => admit(false)).toThrow(/当前流程/); expect(() => admit(true)).not.toThrow()
  })
  it.each([['form', 'section_form', 'form-section:form'], ['scale', 'item_scale', 'scale:scale'], ['cognitive', 'item_cognitive', 'cognitive:cognitive'], ['sjt', 'item_sjt', 'situational:sjt']])('admits the current %s target', async (id, key, slot) => {
    mocks.resolve.mockResolvedValue(scopeFixture(key, slot))
    const admit = await lockTrainingFlowFinalAdmission(transaction(), { ...target(), ...(id === 'form' ? { itemId: undefined, sectionId: id } : { itemId: id }) })
    expect(() => admit(false)).not.toThrow(); expect(() => admit(true)).toThrow()
  })
  it.each(['future', 'skipped'])('rejects a %s child with a preexisting admission', async itemId => {
    const admit = await lockTrainingFlowFinalAdmission(transaction(), { ...target(), itemId })
    expect(() => admit(false)).toThrow(/当前流程/); expect(() => admit(true)).toThrow(/当前流程/)
  })
  it('allows only the exact accepted historical replay after END', async () => {
    const scope = scopeFixture(); scope.path.currentInstrumentKey = null; scope.terminal = true; scope.executedSlotKeys.add('scale:scale')
    scope.snapshots.push({ slotKey: 'scale:scale', sourceAttemptId: 'child', sourceSubmissionId: 'submission' }); mocks.resolve.mockResolvedValue(scope)
    const parent = parentFixture(); parent.status = 'COMPLETED'
    const tx = transaction(parent), admit = await lockTrainingFlowFinalAdmission(tx, target(parent))
    expect(() => admit(false)).toThrow(); expect(() => admit(true)).not.toThrow()
    for (const mismatch of [{ sourceAttemptId: 'other-child' }, { submissionId: 'new-submission' }]) {
      const other = await lockTrainingFlowFinalAdmission(tx, { ...target(parent), ...mismatch }); expect(() => other(true)).toThrow()
    }
  })
  it('reuses the SJT parent lock', async () => {
    const tx = transaction(), admit = await lockTrainingFlowFinalAdmission(tx, { ...target(), parentLocked: true }); admit(false)
    expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledOnce()
  })
  it('rejects deletion, epoch change, missing fresh markers and downgrade before facts', async () => {
    const missing = transaction(); missing.$queryRaw.mockResolvedValue([])
    await expect(lockTrainingFlowFinalAdmission(missing, target())).rejects.toMatchObject({ statusCode: 404 })
    for (const mutate of [(p: any) => { p.attemptEpoch++ }, (p: any) => { delete p.trainingFlowPathHash }, (p: any) => Object.assign(p, parentFixture(false))]) {
      const parent = parentFixture(); mutate(parent)
      await expect(lockTrainingFlowFinalAdmission(transaction(parent), target())).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
})
describe('C19 Form principal-before-facts', () => {
  const body: any = { attemptId: 'parent', sectionId: 'form', submissionId: 'c19-forged-submission', attemptEpoch: 3, definitionHash: 'a'.repeat(64), answers: [], userId: 'intruder' }
  it('rejects direct unified Form before resolving or decrypting facts', async () => {
    await expect(submitUnifiedCompositeFormSectionFinal(body, undefined, parentFixture())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.child).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects composite Form wrapper before its initial scope read', async () => {
    mocks.parent.mockResolvedValue(parentFixture())
    await expect(submitCompositeFormSectionFinal(body)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.child).not.toHaveBeenCalled()
    expect(mocks.parent.mock.calls[0][0].select).toMatchObject({ userId: true, recoveryTokenHash: true })
  })
  it('permits only owner or exact anonymous recovery', () => {
    expect(() => assertTrainingFormFinalPrincipal(parentFixture(), { userId: 'owner' })).not.toThrow()
    expect(() => assertTrainingFormFinalPrincipal({ ...parentFixture(), recoveryTokenHash: 'recovery' }, { recoveryTokenHash: 'recovery' })).toThrow()
    expect(() => assertTrainingFormFinalPrincipal({ ...parentFixture(), userId: null, recoveryTokenHash: 'recovery' }, { recoveryTokenHash: 'recovery' })).not.toThrow()
    expect(() => assertTrainingFormFinalPrincipal({ ...parentFixture(), userId: null, recoveryTokenHash: 'recovery' }, { recoveryTokenHash: 'forged' })).toThrow()
  })
})
describe('C19 four FINAL transaction wiring', () => {
  it.each([
    ['assessment-runtime/unified-form-section-final-submit.service.ts', 'withCompositeFormUnitTransaction(async (tx)', 'tx.compositeFormSectionAttempt.findUnique', 'persistCompositeFormSection(tx'],
    ['scale/unified-final-submit.service.ts', 'const committed = await withFinalOnlyCompletionTransaction', 'tx.assessment.findUnique', 'persistScaleFactRecords(tx'],
    ['cognitive/unified-final-submit.service.ts', 'const committed = await withFinalOnlyCompletionTransaction', 'tx.cognitiveSession.findUnique', 'tx.cognitiveRawSubmission.create'],
  ])('%s gates before child writes', (file, start, childRead, firstWrite) => {
    const source = readFileSync(`src/modules/${file}`, 'utf8').split(start)[1]
    expect(source.indexOf('lockTrainingFlowFinalAdmission(tx')).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('lockTrainingFlowFinalAdmission(tx')).toBeLessThan(source.indexOf(childRead))
    expect(source.indexOf('assertFlowFinal(false)')).toBeGreaterThan(source.indexOf(childRead))
    expect(source.indexOf('assertFlowFinal(false)')).toBeLessThan(source.indexOf(firstWrite))
    expect(source).toContain('assertFlowFinal(true)')
  })
  it('binds the SJT shared writer to the locked Training host and gates before writes',()=>{
    const source=readFileSync('src/modules/situational/situational-final-submit.service.ts','utf8')
    const tx=source.split('const committed = await withFinalOnlyCompletionTransaction')[1]
    expect(tx.indexOf('lockTrainingFlowFinalAdmission(tx')).toBeLessThan(tx.indexOf('return commitPreparedSituationalFinal(tx'))
    expect(tx).toContain('assertReplayAdmission: assertFlowFinal')
    const writer=source.split('export async function commitPreparedSituationalFinal')[1].split('const persistSituationalAttemptFinal')[0]
    expect(writer.indexOf('await lockSituationalAttempt')).toBeLessThan(writer.indexOf('host.assertReplayAdmission(false)'))
    expect(writer.indexOf('host.assertReplayAdmission(false)')).toBeLessThan(writer.indexOf('tx.situationalAttempt.updateMany'))
    expect(writer).toContain('host.assertReplayAdmission(true)')
  })
})
