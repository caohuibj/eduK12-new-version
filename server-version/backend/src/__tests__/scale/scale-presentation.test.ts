import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ release: vi.fn(), use: vi.fn() }))
vi.mock('../../modules/measurement-content/repository', () => ({ getContentRelease: mocks.release }))
vi.mock('../../modules/scale-library-governance/usage', () => ({ assertLibraryUseGrantCurrent: mocks.use }))
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { scaleMeasurementRelease } from '../../modules/measurement-content/scale'
import { prepareRelease } from '../../modules/measurement-content/release'
import { freezeLibraryScalePresentation } from '../../modules/scale/scale-presentation'
import { createFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart, encryptFrozenScaleRuntimeSnapshot, hashFrozenScaleRuntimeSnapshot, parseFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { loadScaleAssessmentForResponse } from '../../modules/scale/scale-workflow.service'
import { canStartLibraryCourseScale } from '../../modules/scale/scale-access'
import { ScaleLibraryError } from '../../modules/scale-library-governance/contracts'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const definition = compileResearchScale('Test', { schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'sum',
  responseOptions: [{ optionKey: 'yes', label: 'Yes', score: 1 }, { optionKey: 'no', label: 'No', score: 0 }],
  dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
  items: [{ itemKey: 'one', prompt: 'Question', required: true, reverse: false, dimensionKeys: ['total'] }] })
const release = (presentationMode: 'ALL_AT_ONCE' | 'RUNNER_DEFAULT') => ({ ...prepareRelease(scaleMeasurementRelease({
  localId: 'draft', version: 'v1', instrumentVersion: '1', definition, instrumentClass: 'CUSTOM_DESCRIPTIVE',
  presentationMode, scope: { kind: 'PRIVATE', product: 'SURVEY', ownerId: 'owner', resourceId: 'project' },
})), releaseId: 'release', status: 'PUBLISHED' })
beforeEach(() => vi.clearAllMocks())
describe('exact frozen Scale presentation and course start', () => {
  it('binds the approved immutable mode without consulting live entry state', async () => {
    mocks.release.mockResolvedValue(release('ALL_AT_ONCE'))
    const binding = await freezeLibraryScalePresentation({} as never, { measurementReleaseId: 'release', instrumentVersion: '1' }, definition)
    expect(binding).toMatchObject({ releaseId: 'release', presentationMode: 'ALL_AT_ONCE' })
    const snapshot = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'library:test', instrumentVersion: '1', definition })
    snapshot.measurementPresentation = binding
    snapshot.snapshotHash = hashFrozenScaleRuntimeSnapshot(snapshot)
    expect(parseFrozenScaleRuntimeSnapshot(snapshot).measurementPresentation).toEqual(binding)
    expect(() => parseFrozenScaleRuntimeSnapshot({ ...snapshot, measurementPresentation: { ...binding, presentationMode: 'ONE_BY_ONE' } })).toThrow(/hash mismatch/)
    const projected = await loadScaleAssessmentForResponse({ id: 'attempt', status: 'IN_PROGRESS', answers: [],
      runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(snapshot) })
    expect(projected.presentationMode).toBe('ALL_AT_ONCE')
    expect(mocks.release).toHaveBeenCalledTimes(1) // Restore reads no mutable Scale or release.
  })
  it('writes the binding through the actual new-attempt freezer', async () => {
    mocks.release.mockResolvedValue(release('ALL_AT_ONCE'))
    const tx = { scale: { findUnique: vi.fn().mockResolvedValue({ id: 'wrapper', code: 'library:test',
      instrumentVersion: '1', instrumentClass: 'CUSTOM_DESCRIPTIVE', status: 'PUBLISHED', libraryEntryId: 'entry', measurementReleaseId: 'release' }) } }
    const snapshot = await freezeScaleRuntimeAtAttemptStart(tx as never, { instrumentKey: 'library:test', instrumentVersion: '1', definition })
    expect(snapshot.measurementPresentation?.presentationMode).toBe('ALL_AT_ONCE')
    expect(parseFrozenScaleRuntimeSnapshot(snapshot).measurementPresentation?.releaseId).toBe('release')
  })
  it('uses the sealed education presentation without another measurement read and rejects a different native entry, C or M',async()=>{
    const tx={scale:{findUnique:vi.fn().mockResolvedValue({id:'wrapper',code:'library:test',instrumentVersion:'1',instrumentClass:'CUSTOM_DESCRIPTIVE',
      status:'PUBLISHED',libraryEntryId:'entry',measurementReleaseId:'release'})}}
    const sealedLibraryPresentation={entryId:'entry',sourceDefinitionHash:canonicalHash(definition),presentation:{releaseId:'release',contentHash:'a'.repeat(64),presentationMode:'ALL_AT_ONCE' as const}}
    const input={instrumentKey:'library:test',instrumentVersion:'1',definition,sealedLibraryPresentation}
    expect((await freezeScaleRuntimeAtAttemptStart(tx as never,input)).measurementPresentation).toEqual(sealedLibraryPresentation.presentation)
    for(const invalid of [{...sealedLibraryPresentation,entryId:'another'},{...sealedLibraryPresentation,sourceDefinitionHash:'b'.repeat(64)},
      {...sealedLibraryPresentation,presentation:{...sealedLibraryPresentation.presentation,releaseId:'another'}}])
      await expect(freezeScaleRuntimeAtAttemptStart(tx as never,{...input,sealedLibraryPresentation:invalid})).rejects.toThrow(/identity mismatch/)
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('keeps historical snapshot bytes and defaults legacy/RUNNER_DEFAULT to Training one-by-one', async () => {
    const snapshot = createFrozenScaleRuntimeSnapshot({ instrumentKey: 'legacy', instrumentVersion: '1', definition })
    expect(parseFrozenScaleRuntimeSnapshot(snapshot)).toEqual(snapshot)
    const projected = await loadScaleAssessmentForResponse({ id: 'old', status: 'IN_PROGRESS', answers: [], runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(snapshot) })
    expect(projected.presentationMode).toBe('ONE_BY_ONE')
    mocks.release.mockResolvedValue(release('RUNNER_DEFAULT'))
    expect((await freezeLibraryScalePresentation({} as never, { measurementReleaseId: 'release', instrumentVersion: '1' }, definition)).presentationMode).toBe('ONE_BY_ONE')
  })
  it('does not accept a different executable definition under the release identity', async () => {
    mocks.release.mockResolvedValue(release('ALL_AT_ONCE'))
    const changed = structuredClone(definition); changed.items[0].content = 'Changed'
    await expect(freezeLibraryScalePresentation({} as never, { measurementReleaseId: 'release', instrumentVersion: '1' }, changed)).rejects.toThrow(/mismatch/)
  })
  it('requires current exact use permission of a linked course owner for NEW standalone starts', async () => {
    const tx = { courseStudent: { findMany: vi.fn().mockResolvedValue([{ course: { creatorId: 'teacher' } }]) } }
    const scale = { id: 'wrapper', libraryEntryId: 'entry', status: 'PUBLISHED', visibility: 'COURSE' }
    mocks.use.mockRejectedValueOnce(new ScaleLibraryError(403, 'revoked'))
    expect(await canStartLibraryCourseScale(scale, 'student', tx as never)).toBe(false)
    mocks.use.mockResolvedValueOnce({ id: 'current' })
    expect(await canStartLibraryCourseScale(scale, 'student', tx as never)).toBe(true)
    expect(mocks.use).toHaveBeenLastCalledWith(tx, { entryId: 'entry', userId: 'teacher', product: 'TRAINING' })
  })
})
