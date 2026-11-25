import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getContentReleaseBatch: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  readFrozenCompositionIdentity: vi.fn(),
  loadFrozenActiveSlotSet: vi.fn(),
  readOrdinaryDeclaredFeedback: vi.fn(),
  tryReadPreMaterializedDeclaredFeedback: vi.fn(),
  tryReadPreMaterializedNativeScaleFeedback: vi.fn(),
  readOrdinaryNativeFeedback: vi.fn(),
  readNativeEducationScaleFeedback: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}))
vi.mock('../../modules/assessment-run/educationCompositionExecution', () => ({
  schoolSelfGroupAssignmentSql: () => ({ strings: ['FALSE'], values: [] }),
  readFrozenCompositionIdentity: mocks.readFrozenCompositionIdentity,
}))
vi.mock('../../modules/assessment-runtime/slot-set', () => ({
  loadFrozenActiveSlotSet: mocks.loadFrozenActiveSlotSet,
}))
vi.mock('../../modules/reporting/education-ordinary-declared-feedback', () => ({
  readOrdinaryDeclaredFeedback: mocks.readOrdinaryDeclaredFeedback,
  tryReadPreMaterializedDeclaredFeedback: mocks.tryReadPreMaterializedDeclaredFeedback,
  tryReadPreMaterializedNativeScaleFeedback: mocks.tryReadPreMaterializedNativeScaleFeedback,
}))
vi.mock('../../modules/reporting/education-ordinary-native-feedback', () => ({
  readOrdinaryNativeFeedback: mocks.readOrdinaryNativeFeedback,
}))
vi.mock('../../modules/reporting/education-native-scale-feedback', () => ({
  readNativeEducationScaleFeedback: mocks.readNativeEducationScaleFeedback,
}))

vi.mock('../../modules/measurement-content/repository', () => ({getContentReleaseBatch:mocks.getContentReleaseBatch}))
import { encryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { readSchoolOrdinaryFeedback } from '../../modules/reporting/education-ordinary-feedback.service'

describe('education-ordinary-feedback single-read without held interactive transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (fn: any) => fn({
      $queryRaw: mocks.queryRaw,
      $executeRaw: mocks.executeRaw,
    }))
  })

  it('reads V2 feedback in the authority query and rechecks live release revocation', async () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64))
    const dto={schemaVersion:1,kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'READY',title:'Frozen own feedback',units:[]}
    const own={organizationId:'org',policyHash:'b'.repeat(64),status:'COMPLETED',subjectUserId:'user-1',respondentUserId:'user-1',
      subjectRole:'STUDENT',respondentRole:'STUDENT',relationshipKind:'SELF',perspective:'SELF_REPORT',receiptOnly:false,
      parentId:'parent',parentStatus:'COMPLETED',attemptEpoch:1,publicationHash:'a'.repeat(64),contentState:null,
      finalFeedbackCipher:encryptCompactField({...dto,_v2Verify:{policyHash:'b'.repeat(64),manifestHash:'c'.repeat(64),releaseIds:['release']}})}
    mocks.queryRaw.mockResolvedValue([own])
    mocks.readFrozenCompositionIdentity.mockResolvedValue({title:dto.title,origin:{entry:'SCHOOL',variantKey:'STUDENT:SELF'},
      manifest:[],units:[],binding:{manifestHash:'c'.repeat(64),unitReports:[]}})
    mocks.getContentReleaseBatch.mockResolvedValue(new Map([['release',{status:'PUBLISHED'}]]))
    expect(await readSchoolOrdinaryFeedback({executionId:'exec',actorUserId:'user-1'})).toEqual(dto)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    const sql=mocks.queryRaw.mock.calls[0][0].strings.join('?')
    expect(sql).toContain('final.feedback_cipher')
    expect(sql).toContain('p.publication_hash IS NULL AND j.attempt_id=p.id')
    expect(mocks.readNativeEducationScaleFeedback).not.toHaveBeenCalled()
    mocks.getContentReleaseBatch.mockResolvedValue(new Map([['release',{status:'REVOKED'}]]))
    expect((await readSchoolOrdinaryFeedback({executionId:'exec',actorUserId:'user-1'})).state).toBe('COMPLETION_ONLY')
    expect(mocks.getContentReleaseBatch).toHaveBeenCalledTimes(2)
    vi.unstubAllEnvs()
  })

  it('runs readOwn once and projects READY declared feedback outside any interactive transaction', async () => {
    const blockId = '00000000-0000-4000-8000-000000000001'
    const itemId = '00000000-0000-4000-8000-000000000002'
    const versionId = '00000000-0000-4000-8000-000000000003'
    const contentHash = 'a'.repeat(64)
    const ownRow = {
      organizationId: 'org-1',
      key: 'education-composition:SCHOOL:test:STUDENT:SELF:1.0.0',
      version: '1.0.0',
      policy: {},
      policyHash: 'b'.repeat(64),
      status: 'COMPLETED',
      subjectUserId: 'user-1',
      respondentUserId: 'user-1',
      subjectRole: 'STUDENT',
      respondentRole: 'STUDENT',
      relationshipKind: 'SELF',
      perspective: 'SELF_REPORT',
      receiptOnly: false,
      contentState: {
        trainingContentBinding: {},
        trainingContentBindingHash: 'c'.repeat(64),
        trainingReferenceBinding: null,
        trainingReferenceBindingHash: null,
        trainingContentInterpretationEncrypted: 'enc',
        trainingContentInterpretationHash: 'd'.repeat(64),
        aggregateInputHash: 'e'.repeat(64),
      },
      parentId: 'parent-1',
      parentStatus: 'COMPLETED',
      attemptEpoch: 1,
      contextSnapshotHash: null,
      frozenSlots: 'enc-slots',
      frozenSlotsHash: 'f'.repeat(64),
    }

    mocks.queryRaw.mockResolvedValue([ownRow])
    mocks.readFrozenCompositionIdentity.mockResolvedValue({
      compositeId: 'comp-1',
      title: 'Test Composition',
      origin: { entry: 'SCHOOL', variantKey: 'STUDENT:SELF', ownerUserId: 'owner-1' },
      manifest: [{
        blockId,
        kind: 'SCALE',
        versionId,
        contentHash,
        sourceProvider: 'STANDARD_SCALE',
        itemIds: [itemId],
        sectionIds: [],
        title: 'Scale 1',
      }],
      units: [],
      binding: {
        manifestHash: '1'.repeat(64),
        unitReports: [{
          blockId,
          versionId,
          contentHash,
          respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['total'], longitudinalMetricKeys: [] },
        }],
      },
    })
    mocks.loadFrozenActiveSlotSet.mockResolvedValue({
      attemptEpoch: 1,
      snapshotHash: ownRow.frozenSlotsHash,
      slots: [],
    })
    mocks.readOrdinaryDeclaredFeedback.mockResolvedValue(new Map([
      [itemId, { status: 'READY', rendered: { title: 'Scale 1 Report', sections: [] } }],
    ]))
    mocks.tryReadPreMaterializedDeclaredFeedback.mockResolvedValue(null)

    const result = await readSchoolOrdinaryFeedback({ executionId: 'exec-1', actorUserId: 'user-1' })
    expect(result.state).toBe('READY')
    expect(result.units).toHaveLength(1)
    expect(result.units[0]).toMatchObject({ blockId, state: 'READY' })
    // Exactly 1 bounded-planner transaction for readOwn — zero second transaction during projection
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.readFrozenCompositionIdentity).toHaveBeenCalledTimes(1)
    // Declared feedback runs on root prisma, not an interactive tx
    expect(mocks.readOrdinaryDeclaredFeedback).toHaveBeenCalledTimes(1)
    expect('$transaction' in mocks.readOrdinaryDeclaredFeedback.mock.calls[0][0]).toBe(true)
  })

  it('uses pre-materialized declared feedback without loading slots or re-projecting when available', async () => {
    const blockId = '00000000-0000-4000-8000-000000000001'
    const itemId = '00000000-0000-4000-8000-000000000002'
    const versionId = '00000000-0000-4000-8000-000000000003'
    const contentHash = 'a'.repeat(64)
    mocks.queryRaw.mockResolvedValue([{
      organizationId: 'org-1',
      key: 'education-composition:SCHOOL:test:STUDENT:SELF:1.0.0',
      version: '1.0.0',
      policy: {},
      policyHash: 'b'.repeat(64),
      status: 'COMPLETED',
      subjectUserId: 'user-1',
      respondentUserId: 'user-1',
      subjectRole: 'STUDENT',
      respondentRole: 'STUDENT',
      relationshipKind: 'SELF',
      perspective: 'SELF_REPORT',
      receiptOnly: false,
      preMaterializedReport: 'ekc1:prematerialized',
      contentState: {
        trainingContentBinding: {},
        trainingContentBindingHash: 'c'.repeat(64),
        trainingReferenceBinding: null,
        trainingReferenceBindingHash: null,
        trainingContentInterpretationEncrypted: 'enc',
        trainingContentInterpretationHash: 'd'.repeat(64),
        aggregateInputHash: 'e'.repeat(64),
      },
      parentId: 'parent-1',
      parentStatus: 'COMPLETED',
      attemptEpoch: 1,
      contextSnapshotHash: null,
      frozenSlots: 'enc-slots',
      frozenSlotsHash: 'f'.repeat(64),
    }])
    mocks.readFrozenCompositionIdentity.mockResolvedValue({
      compositeId: 'comp-1',
      title: 'Test Composition',
      origin: { entry: 'SCHOOL', variantKey: 'STUDENT:SELF', ownerUserId: 'owner-1' },
      manifest: [{
        blockId,
        kind: 'SCALE',
        versionId,
        contentHash,
        sourceProvider: 'STANDARD_SCALE',
        itemIds: [itemId],
        sectionIds: [],
        title: 'Scale 1',
      }],
      units: [],
      binding: {
        manifestHash: '1'.repeat(64),
        unitReports: [{
          blockId,
          versionId,
          contentHash,
          respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['total'], longitudinalMetricKeys: [] },
        }],
      },
    })
    mocks.tryReadPreMaterializedDeclaredFeedback.mockResolvedValue(new Map([
      [itemId, { status: 'READY', rendered: { title: 'Pre-Materialized Report', sections: [] } }],
    ]))

    const result = await readSchoolOrdinaryFeedback({ executionId: 'exec-1', actorUserId: 'user-1' })
    expect(result.state).toBe('READY')
    expect(result.units[0]).toMatchObject({ blockId, state: 'READY', declaredReport: { title: 'Pre-Materialized Report' } })
    expect(mocks.loadFrozenActiveSlotSet).not.toHaveBeenCalled()
    expect(mocks.readOrdinaryDeclaredFeedback).not.toHaveBeenCalled()
  })

  it('uses pre-materialized native scale feedback without loading slots, hydrating TOAST columns, or re-projecting', async () => {
    const blockId = '00000000-0000-4000-8000-000000000001'
    const itemId = '00000000-0000-4000-8000-000000000002'
    const versionId = '00000000-0000-4000-8000-000000000003'
    const contentHash = 'a'.repeat(64)
    mocks.queryRaw.mockResolvedValue([{
      organizationId: 'org-1',
      key: 'education-composition:SCHOOL:test:STUDENT:SELF:1.0.0',
      version: '1.0.0',
      policy: {},
      policyHash: 'b'.repeat(64),
      status: 'COMPLETED',
      subjectUserId: 'user-1',
      respondentUserId: 'user-1',
      subjectRole: 'STUDENT',
      respondentRole: 'STUDENT',
      relationshipKind: 'SELF',
      perspective: 'SELF_REPORT',
      receiptOnly: false,
      preMaterializedReport: 'ekc1:prematerialized-native',
      contentState: {
        trainingContentBinding: null,
        trainingContentBindingHash: 'c'.repeat(64),
        trainingReferenceBinding: null,
        trainingReferenceBindingHash: null,
        trainingContentInterpretationEncrypted: null,
        trainingContentInterpretationHash: 'd'.repeat(64),
        aggregateInputHash: 'e'.repeat(64),
      },
      parentId: 'parent-1',
      parentStatus: 'COMPLETED',
      attemptEpoch: 1,
      contextSnapshotHash: null,
      frozenSlots: null,
      frozenSlotsHash: 'f'.repeat(64),
    }])
    mocks.readFrozenCompositionIdentity.mockResolvedValue({
      compositeId: 'comp-1',
      title: 'Private Scale Composition',
      origin: { entry: 'SCHOOL', variantKey: 'STUDENT:SELF', ownerUserId: 'owner-1' },
      manifest: [{
        blockId,
        kind: 'SCALE',
        versionId,
        contentHash,
        sourceProvider: 'PRIVATE_VERSION',
        itemIds: [itemId],
        sectionIds: [],
        title: 'Private Scale 1',
      }],
      units: [{ itemId, versionId, family: 'SCALE', scaleId: 'scale-1', definitionHash: contentHash }],
      binding: {
        manifestHash: '1'.repeat(64),
        unitReports: [{
          blockId,
          versionId,
          contentHash,
          respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['total'], longitudinalMetricKeys: [] },
        }],
      },
    })
    mocks.tryReadPreMaterializedNativeScaleFeedback.mockReturnValue(new Map([
      [itemId, { state: 'PROJECTED', unitReports: [{ itemId, title: 'Private Scale 1' }] }],
    ]))

    const result = await readSchoolOrdinaryFeedback({ executionId: 'exec-1', actorUserId: 'user-1' })
    expect(result.state).toBe('READY')
    expect(result.units[0]).toMatchObject({ blockId, state: 'READY', title: 'Private Scale 1' })
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.loadFrozenActiveSlotSet).not.toHaveBeenCalled()
    expect(mocks.readNativeEducationScaleFeedback).not.toHaveBeenCalled()
  })

  it('lazily hydrates deferred TOAST columns by PK when pre-materialized native feedback misses', async () => {
    const blockId = '00000000-0000-4000-8000-000000000001'
    const itemId = '00000000-0000-4000-8000-000000000002'
    const versionId = '00000000-0000-4000-8000-000000000003'
    const contentHash = 'a'.repeat(64)
    mocks.queryRaw
      .mockResolvedValueOnce([{
        organizationId: 'org-1',
        key: 'education-composition:SCHOOL:test:STUDENT:SELF:1.0.0',
        version: '1.0.0',
        policy: {},
        policyHash: 'b'.repeat(64),
        status: 'COMPLETED',
        subjectUserId: 'user-1',
        respondentUserId: 'user-1',
        subjectRole: 'STUDENT',
        respondentRole: 'STUDENT',
        relationshipKind: 'SELF',
        perspective: 'SELF_REPORT',
        receiptOnly: false,
        preMaterializedReport: 'ekc1:stale-native',
        contentState: {
          trainingContentBinding: null,
          trainingContentBindingHash: 'c'.repeat(64),
          trainingReferenceBinding: null,
          trainingReferenceBindingHash: null,
          trainingContentInterpretationEncrypted: null,
          trainingContentInterpretationHash: 'd'.repeat(64),
          aggregateInputHash: 'e'.repeat(64),
        },
        parentId: 'parent-1',
        parentStatus: 'COMPLETED',
        attemptEpoch: 1,
        contextSnapshotHash: null,
        frozenSlots: null,
        frozenSlotsHash: 'f'.repeat(64),
      }])
      .mockResolvedValueOnce([{
        frozenSlots: 'hydrated-slots',
        trainingContentBinding: { units: [] },
        trainingReferenceBinding: null,
        trainingContentInterpretationEncrypted: 'hydrated-interp',
      }])
    mocks.readFrozenCompositionIdentity.mockResolvedValue({
      compositeId: 'comp-1',
      title: 'Private Scale Composition',
      origin: { entry: 'SCHOOL', variantKey: 'STUDENT:SELF', ownerUserId: 'owner-1' },
      manifest: [{
        blockId,
        kind: 'SCALE',
        versionId,
        contentHash,
        sourceProvider: 'PRIVATE_VERSION',
        itemIds: [itemId],
        sectionIds: [],
        title: 'Private Scale 1',
      }],
      units: [{ itemId, versionId, family: 'SCALE', scaleId: 'scale-1', definitionHash: contentHash }],
      binding: {
        manifestHash: '1'.repeat(64),
        unitReports: [{
          blockId,
          versionId,
          contentHash,
          respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['total'], longitudinalMetricKeys: [] },
        }],
      },
    })
    mocks.tryReadPreMaterializedNativeScaleFeedback.mockReturnValue(null)
    mocks.loadFrozenActiveSlotSet.mockResolvedValue({ attemptEpoch: 1, snapshotHash: 'f'.repeat(64), slots: [] })
    mocks.readNativeEducationScaleFeedback.mockResolvedValue(new Map([
      [itemId, { state: 'PROJECTED', unitReports: [{ itemId, title: 'Private Scale 1' }] }],
    ]))

    const result = await readSchoolOrdinaryFeedback({ executionId: 'exec-1', actorUserId: 'user-1' })
    expect(result.state).toBe('READY')
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2)
    expect(mocks.loadFrozenActiveSlotSet).toHaveBeenCalledWith('hydrated-slots', expect.anything())
    expect(mocks.readNativeEducationScaleFeedback).toHaveBeenCalledTimes(1)
  })

  it('hides receiptOnly attempts without projecting feedback', async () => {
    mocks.queryRaw.mockResolvedValue([{ receiptOnly: true }])
    await expect(readSchoolOrdinaryFeedback({ executionId: 'exec-1', actorUserId: 'user-1' }))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.readOrdinaryDeclaredFeedback).not.toHaveBeenCalled()
  })
})
