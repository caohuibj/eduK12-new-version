import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { standardCombinationHash } from '../../modules/measurement-content/standard-combination'
import { ids, tid, trainingSourceHarness } from '../measurement-content/training-standard-source.fixture'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(), expanded: vi.fn(), authorize: vi.fn(), verify: vi.fn(), content: vi.fn(), attach: vi.fn(),
  rights: vi.fn(), materials: vi.fn(), recheck: vi.fn(),
  db: {
    $queryRaw: vi.fn(), $transaction: vi.fn(),
    compositeAssessment: { findUnique: vi.fn(), update: vi.fn() },
    course: { findUnique: vi.fn() },
  },
}))
vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../modules/tool-licensing/runtime', () => ({
  isToolLicensingEnabled: mocks.enabled, authorizeToolPublication: mocks.authorize,
  isExpandedToolLicensingEnabled: mocks.expanded,
  ToolLicenseAccessError: class extends Error { readonly statusCode = 409 },
}))
vi.mock('../../modules/composite/training-standard-combination', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/composite/training-standard-combination')>(),
  verifyStoredTrainingStandardItem: mocks.verify,
}))
vi.mock('../../modules/composite/training-content-binding', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/composite/training-content-binding')>(),
  prepareTrainingContentSnapshot: mocks.content, attachPublishedScaleArtifacts: mocks.attach,
}))
vi.mock('../../modules/scale/scale-publication-guard', () => ({ assertScalePublicationRights: mocks.rights }))
vi.mock('../../modules/assessment-media/training-materials', async importOriginal => ({
  ...await importOriginal<typeof import('../../modules/assessment-media/training-materials')>(),
  assertTrainingMaterialsUsable: mocks.materials,
}))
import { ToolLicenseAccessError } from '../../modules/tool-licensing/runtime'
import { authorizeTrainingStandardPublication } from '../../modules/composite/training-tool-licensing'
import { prepareCompositePublication, publishComposite } from '../../modules/composite/composite.service'

function source(itemId = ids.item, toolKey = 'who5', releaseId = ids.combo) {
  const axes = {
    CONTENT: { version: '1.0.0', axisHash: 'a'.repeat(64), sourceVersion: '1.0.0' },
    PARAMETERS: { version: '1.0.0', axisHash: 'b'.repeat(64), sourceVersion: '1.0.0' },
    REPORT: { version: '2.0.0', axisHash: 'c'.repeat(64), sourceVersion: '2.0.0' },
  }
  const reference = {
    schemaVersion: 1, compositeId: ids.composite, itemId, ownerId: ids.owner, scaleId: ids.scale,
    combination: { releaseId, toolKey, instrumentVersion: '1.0.0', axes,
      combinationHash: standardCombinationHash(toolKey, { CONTENT: axes.CONTENT.axisHash, PARAMETERS: axes.PARAMETERS.axisHash, REPORT: axes.REPORT.axisHash }) },
    measurement: { releaseId: ids.measurement, contentHash: 'd'.repeat(64), measurementHash: 'e'.repeat(64) },
    authority: { useGrantId: ids.leaf, useGrantVersion: 1, authorityGrantId: ids.root, issuerId: ids.issuer },
    reportDisclosure: 'EXISTING_TRAINING_POLICY',
  }
  return { reference, referenceHash: canonicalHash(reference) }
}
let publication: ReturnType<typeof makePublication>
function makePublication() {
  const { h } = trainingSourceHarness()
  return {
    id: ids.composite, createdBy: ids.owner, status: 'DRAFT', productKind: 'QUESTIONNAIRE',
    questionnaireType: 'COURSE', deliveryMode: 'FINAL_ONLY', publicEnabled: false, expiresAt: null,
    courseId: null, questionnaireCourses: [{ courseId: ids.course }], formSections: [],
    items: [{ id: ids.item, type: 'SCALE', scaleId: ids.scale, scale: h.scale,
      required: true, position: 0, standardCombinationSource: source() }],
  }
}
const db = () => mocks.db as unknown as Parameters<typeof authorizeTrainingStandardPublication>[0]

beforeEach(() => {
  vi.resetAllMocks(); publication = makePublication()
  mocks.enabled.mockReturnValue(true); mocks.authorize.mockResolvedValue(undefined)
  mocks.db.$transaction.mockImplementation((fn: (tx: typeof mocks.db) => Promise<unknown>) => fn(mocks.db))
  mocks.db.$queryRaw.mockResolvedValue([])
  mocks.db.compositeAssessment.findUnique.mockImplementation(async () => publication)
  mocks.db.compositeAssessment.update.mockImplementation(async ({ data }) => ({ ...publication, ...data }))
  mocks.content.mockResolvedValue({ snapshot: { schemaVersion: 1, compositeId: ids.composite, units: [] }, snapshotHash: 'f'.repeat(64), recheckSourceLicenses: mocks.recheck })
  mocks.attach.mockResolvedValue({})
})
afterEach(() => vi.unstubAllEnvs())

describe('Training standard publication license adapter', () => {
  it('returns before reading a task or querying when its flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const unreadable = { get productKind(): never { throw new Error('not read') } }
    await authorizeTrainingStandardPublication(db(), unreadable as unknown as typeof publication)
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('uses the sealed stable key and owner for both exact versions, without extra SQL', async () => {
    publication.items.push({ ...publication.items[0], id: tid(40), standardCombinationSource: source(tid(40), 'who5', tid(41)) })
    await authorizeTrainingStandardPublication(db(), publication)
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.db, {
      product: 'TRAINING', subjectId: ids.owner, publicationId: ids.composite, toolKeys: ['SCALE:who5'],
    })
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
  })
  it('supports the same sealed source in an anonymous GENERAL task', async () => {
    publication.questionnaireType = 'GENERAL'; publication.questionnaireCourses = []
    await authorizeTrainingStandardPublication(db(), publication)
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ toolKeys: ['SCALE:who5'] }))
  })
  it('resolves expanded Training tools in one batched read of frozen measurement identities', async () => {
    mocks.expanded.mockReturnValue(true)
    const measurement = { releaseId: ids.measurement, contentHash: 'd'.repeat(64), measurementHash: 'e'.repeat(64) }
    const snapshot = { schemaVersion: 1, compositeId: publication.id, units: [
      { itemId: tid(40), family: 'SCALE', measurement, source: { kind: 'SCALE', id: ids.scale, ownerId: ids.owner, libraryEntryId: tid(48) } },
      { itemId: tid(41), family: 'SJT', measurement, source: { kind: 'STATIC_SJT_REGISTRY', id: tid(50), instrumentKey: 'public-sjt', instrumentVersion: '1' } },
      { itemId: tid(42), family: 'SJT', measurement, source: { kind: 'SJT_AUTHOR_RELEASE', id: tid(51), ownerId: ids.owner, instrumentKey: 'private-sjt', instrumentVersion: '1' } },
      { itemId: tid(43), family: 'COGNITIVE', measurement, source: {
        kind: 'COGNITIVE_CONFIG', id: tid(52), ownerId: ids.owner, assignmentId: tid(53),
        cognitiveProfile: { schemaVersion: 1, artifactHash: 'a'.repeat(64), selectedBinding: {
          bindingHash: 'b'.repeat(64), configurationHash: 'c'.repeat(64), authorizationId: ids.leaf, authorizationRevision: 1,
        } },
      } },
      { itemId: tid(44), family: 'SCALE', measurement, source: { kind: 'SCALE', id: tid(54), ownerId: ids.owner, privateVersionId: tid(55) } },
    ] }
    mocks.db.$queryRaw.mockResolvedValueOnce([
      { family: 'SCALE', key: 'SCALE:library-scoped' }, { family: 'SJT', key: 'public-sjt' },
      { family: 'SJT', key: null }, { family: 'COGNITIVE', key: 'reaction' },
    ])
    await authorizeTrainingStandardPublication(db(), publication, snapshot)
    expect(mocks.db.$queryRaw).toHaveBeenCalledTimes(1)
    const query = mocks.db.$queryRaw.mock.calls[0][0]
    expect(query.text).toContain("m.scope->>'kind'='PLATFORM'")
    expect(query.values).not.toContain(tid(54))
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.db, {
      product: 'TRAINING', subjectId: ids.owner, publicationId: ids.composite,
      toolKeys: ['COGNITIVE:reaction', 'SCALE:library-scoped', 'SCALE:who5', 'SJT:public-sjt'],
    })
    await expect(authorizeTrainingStandardPublication(db(), publication, { ...snapshot, compositeId: tid(90) })).rejects.toThrow('冻结来源身份无效')
  })
  it('leaves private/legacy scales, other families, education and already-published tasks unchanged', async () => {
    const task = { ...publication, items: [
      { id: ids.item, type: 'SCALE', scaleId: ids.scale },
      { id: tid(40), type: 'COGNITIVE', standardCombinationSource: source() },
    ] }
    await authorizeTrainingStandardPublication(db(), task)
    await authorizeTrainingStandardPublication(db(), { ...publication, productKind: 'ORGANIZATION_RESOURCE' })
    await authorizeTrainingStandardPublication(db(), { ...publication, productKind: 'ASSESSMENT_BUNDLE' })
    await authorizeTrainingStandardPublication(db(), { ...publication, status: 'PUBLISHED' })
    await authorizeTrainingStandardPublication(db(), { ...publication, status: 'ARCHIVED' })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
  })
  it('rejects a changed reference hash or a reference belonging to another task/owner', async () => {
    const tampered = makePublication()
    tampered.items[0].standardCombinationSource.reference.combination.toolKey = 'another-key'
    await expect(authorizeTrainingStandardPublication(db(), tampered)).rejects.toThrow('REFERENCE_HASH_MISMATCH')
    await expect(authorizeTrainingStandardPublication(db(), { ...publication, id: tid(80) })).rejects.toThrow('BINDING_IDENTITY_MISMATCH')
    await expect(authorizeTrainingStandardPublication(db(), { ...publication, createdBy: tid(81) })).rejects.toThrow('BINDING_IDENTITY_MISMATCH')
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('preserves the Composite error contract on denial and unexpected errors unchanged', async () => {
    mocks.authorize.mockRejectedValueOnce(new ToolLicenseAccessError('quota exhausted'))
    await expect(authorizeTrainingStandardPublication(db(), publication)).rejects.toMatchObject({ statusCode: 409, name: 'CompositeServiceError', message: 'quota exhausted' })
    const error = new Error('unexpected')
    mocks.authorize.mockRejectedValueOnce(error)
    await expect(authorizeTrainingStandardPublication(db(), publication)).rejects.toBe(error)
  })
})

describe('Training actual publish transaction licensing insertion (source checks doubled)', () => {
  it('checks the task owner after existing exact source validation and before PUBLISHED, including an ADMIN acting for the owner', async () => {
    await publishComposite(ids.system, UserRole.ADMIN, ids.composite)
    expect(mocks.verify).toHaveBeenCalledWith(mocks.db, publication, publication.items[0])
    expect(mocks.verify.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0])
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.db, {
      product: 'TRAINING', subjectId: ids.owner, publicationId: ids.composite, toolKeys: ['SCALE:who5'],
    })
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.compositeAssessment.update.mock.invocationCallOrder[0])
    expect(mocks.db.compositeAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }))
  })
  it('keeps preview and already-published retries outside license access', async () => {
    await prepareCompositePublication(ids.owner, UserRole.TEACHER, ids.composite)
    expect(mocks.enabled).not.toHaveBeenCalled()
    publication.status = 'PUBLISHED'
    await expect(publishComposite(ids.owner, UserRole.TEACHER, ids.composite)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('rejects the transaction before its publication mutation if the license denies', async () => {
    mocks.authorize.mockRejectedValueOnce(new ToolLicenseAccessError('quota exhausted'))
    await expect(publishComposite(ids.owner, UserRole.TEACHER, ids.composite)).rejects.toMatchObject({ statusCode: 409, message: 'quota exhausted' })
    expect(mocks.db.compositeAssessment.update).not.toHaveBeenCalled()
  })
  it('keeps the flag-off publish path free of new licensing queries or authorization', async () => {
    mocks.enabled.mockReturnValue(false)
    await publishComposite(ids.owner, UserRole.TEACHER, ids.composite)
    expect(mocks.db.$queryRaw).toHaveBeenCalledTimes(1) // Original publication row lock only.
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.db.compositeAssessment.update).toHaveBeenCalledOnce()
  })
})
