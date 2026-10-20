import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(), $executeRaw: vi.fn(),
    storedAsset: { findMany: vi.fn() }, surveyEvent: { create: vi.fn() },
  }
  return { tx, transaction: vi.fn(), authorize: vi.fn(), getRelease: vi.fn(), publish: vi.fn(), retain: vi.fn() }
})
vi.mock('../../config/database', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('../../modules/survey/builder.service', () => ({
  authorizedProject: mocks.authorize,
  SurveyBuilderError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../../modules/measurement-content/repository', () => ({ getContentRelease: mocks.getRelease, publishContentRelease: mocks.publish }))
vi.mock('../../modules/assessment-media/assessment-asset', () => ({ retainAssessmentAssetReferences: mocks.retain }))
vi.mock('../../modules/survey/media.references', () => ({ surveyMimeTypes: ['image/png'], surveyMaxImageBytes: 2 * 1024 * 1024 }))
import {
  createSurveyReportInput, createSurveyReportDraft, editSurveyReportDraft, getSurveyReportDraft,
  listSurveyReportDrafts, listSurveyReportMeasurements, previewSurveyReportDraft, publishSurveyReportDraft,
} from '../../modules/survey/report-drafts.service'
import { releaseInputSchema } from '../../modules/measurement-content/release'

const measurementId = '11111111-1111-4111-8111-111111111111'
const draftId = '22222222-2222-4222-8222-222222222222'
const publishedId = '33333333-3333-4333-8333-333333333333'
const payload = () => ({ measurementReleaseId: measurementId, metricKeys: ['effort'], audience: 'researcher' as const, language: 'zh-CN',
  template: { blocks: [
    { type: 'METRIC' as const, metricKey: 'effort', display: 'RAW' as const },
    { type: 'REFERENCE_BAND' as const, metricKey: 'effort', referenceKind: 'descriptive_sample' as const, bandKey: 'observed', text: 'Synthetic reference text', guidance: [] },
  ], limitations: [] }, assets: [] as Array<{ assetId: string; sha256: string; mediaType: string; rightsStatus: 'self_authored'; rightsNote: string }>,
})
const measurement = () => ({ releaseId: measurementId, layer: 'MEASUREMENT', family: 'SCALE', status: 'PUBLISHED',
  scope: { kind: 'PRIVATE', product: 'SURVEY', resourceId: 'project1', ownerId: 'owner' }, provenance: {},
  contentHash: 'a'.repeat(64), content: { metrics: [{ metricKey: 'effort', unit: 'points', direction: 'higher' }] },
})
const draft = () => ({ id: draftId, project_id: 'project1', owner_id: 'owner', report_key: 'feedback', version: '1',
  revision: 0, payload: payload(), state: 'DRAFT', published_release_id: null as string | null })
const createInput = () => ({ requestId: draftId, reportKey: 'feedback', version: '1', payload: payload() })
const publishInput = { revision: 0, publicationNote: 'Reviewed descriptive wording and scope' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation((fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
  mocks.authorize.mockResolvedValue({ id: 'project1', ownerId: 'owner' })
  mocks.getRelease.mockResolvedValue(measurement())
  mocks.tx.$queryRaw.mockResolvedValue([draft()])
  mocks.tx.$executeRaw.mockResolvedValue(1)
  mocks.tx.storedAsset.findMany.mockResolvedValue([])
  mocks.tx.surveyEvent.create.mockResolvedValue({})
  mocks.publish.mockResolvedValue({ releaseId: publishedId, contentHash: 'b'.repeat(64) })
  mocks.retain.mockResolvedValue(undefined)
})

describe('Survey private report transaction service', () => {
  it.each([
    ['measurement list', () => listSurveyReportMeasurements('owner','project1')],
    ['draft list', () => listSurveyReportDrafts('owner','project1',1)],
    ['get', () => getSurveyReportDraft('owner','project1',draftId)],
    ['create', () => createSurveyReportDraft('owner','project1',createInput())],
    ['edit', () => editSurveyReportDraft('owner','project1',draftId,{revision:0,payload:payload()})],
    ['preview', () => previewSurveyReportDraft('owner','project1',draftId,'INTERPRETABLE')],
    ['publish', () => publishSurveyReportDraft('owner','project1',draftId,publishInput)],
  ])('%s checks owner/project authorization before reading or changing content', async (_name, operation) => {
    mocks.authorize.mockRejectedValueOnce(new Error('PROJECT_DENIED'))
    await expect(operation()).rejects.toThrow('PROJECT_DENIED')
    expect(mocks.authorize).toHaveBeenCalledWith(mocks.tx,'owner','project1',expect.any(Boolean))
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    expect(mocks.getRelease).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.retain).not.toHaveBeenCalled()
  })
  it.each([
    ['foreign project', { ...measurement(), scope: { ...measurement().scope, resourceId: 'project2' } }],
    ['foreign owner', { ...measurement(), scope: { ...measurement().scope, ownerId: 'other' } }],
    ['other product', { ...measurement(), scope: { ...measurement().scope, product: 'TRAINING' } }],
    ['platform content', { ...measurement(), scope: { kind: 'PLATFORM' } }],
    ['catalog provenance', { ...measurement(), provenance: { source: { instrumentKey: 'licensed' } } }],
    ['revoked measurement', { ...measurement(), status: 'REVOKED' }],
  ])('rejects %s before storing a private draft', async (_name, release) => {
    mocks.getRelease.mockResolvedValueOnce(release)
    await expect(createSurveyReportDraft('owner','project1',createInput())).rejects.toThrow()
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('bounds local report keys to the 168 characters left by the server namespace',()=>{
    expect(()=>createSurveyReportInput.parse({...createInput(),reportKey:'a'.repeat(168)})).not.toThrow()
    expect(()=>createSurveyReportInput.parse({...createInput(),reportKey:'a'.repeat(169)})).toThrow()
  })
  it('synthetic preview reads only the authorized draft and precise measurement, never a sample reader', async () => {
    const result = await previewSurveyReportDraft('owner','project1',draftId,'INTERPRETABLE')
    expect(result).toMatchObject({ synthetic:true, scenario:'INTERPRETABLE', revision:0 })
    expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'METRIC',value:1,unit:'points'}))
    expect(result.report.blocks).toContainEqual(expect.objectContaining({type:'REFERENCE_BAND'}))
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.calls[0][0].sql).toContain('FROM survey_report_drafts')
    expect(mocks.getRelease).toHaveBeenCalledExactlyOnceWith(mocks.tx,measurementId,true)
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    expect(mocks.tx.storedAsset.findMany).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.tx.surveyEvent.create).not.toHaveBeenCalled()
  })
  it.each(['NO_REFERENCE','INVALID'] as const)('%s synthetic preview suppresses reference interpretation', async scenario => {
    const result = await previewSurveyReportDraft('owner','project1',draftId,scenario)
    expect(result.report.blocks.some((b: unknown) => (b as {type:string}).type === 'REFERENCE_BAND')).toBe(false)
    expect(result.report.blocks[0]).toMatchObject({value:scenario === 'INVALID' ? null : 1})
  })
  it('rejects published drafts and stale revisions before editing or revalidating content', async () => {
    for (const row of [{...draft(),state:'PUBLISHED',published_release_id:publishedId},{...draft(),revision:1}]) {
      mocks.tx.$queryRaw.mockResolvedValueOnce([row])
      await expect(editSurveyReportDraft('owner','project1',draftId,{revision:0,payload:payload()})).rejects.toMatchObject({statusCode:409})
    }
    expect(mocks.getRelease).not.toHaveBeenCalled()
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2)
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('publishes, retains exact assets, transitions draft and writes audit using the same transaction', async () => {
    const row=draft(),asset={assetId:'asset1',sha256:'c'.repeat(64),mediaType:'image/png',rightsStatus:'self_authored' as const,rightsNote:'Project illustration'}
    row.payload.assets=[asset]
    mocks.tx.$queryRaw.mockResolvedValueOnce([row])
    mocks.tx.storedAsset.findMany.mockResolvedValueOnce([{id:asset.assetId,sha256:asset.sha256,mimeType:asset.mediaType,sizeBytes:100}])
    const result=await publishSurveyReportDraft('owner','project1',draftId,publishInput)
    expect(result).toMatchObject({draftId,releaseId:publishedId,idempotent:false})
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.$queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE')
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(mocks.tx,expect.objectContaining({layer:'REPORT',
      scope:measurement().scope,provenance:expect.objectContaining({draftId,draftRevision:0,publicationNote:publishInput.publicationNote})}),'owner','HISTORICAL_INTERPRETATION')
    expect(() => releaseInputSchema.parse(mocks.publish.mock.calls[0][1])).not.toThrow()
    expect(mocks.publish.mock.calls[0][1]).not.toHaveProperty('hashScheme')
    expect(mocks.publish.mock.calls[0][1]).not.toHaveProperty('contentHash')
    expect(mocks.retain).toHaveBeenCalledExactlyOnceWith({owner:{entityType:'MeasurementReportRelease',entityId:publishedId,field:'media'},
      references:[{assetId:asset.assetId,contentHash:asset.sha256,mimeType:asset.mediaType}],db:mocks.tx})
    expect(mocks.tx.$executeRaw.mock.calls[0][0].sql).toContain("SET state='PUBLISHED'")
    expect(mocks.tx.surveyEvent.create).toHaveBeenCalledExactlyOnceWith({data:{id:expect.any(String),actorUserId:'owner',projectId:'project1',
      action:'PRIVATE_REPORT_PUBLISHED',metadata:{draftId,releaseId:publishedId,revision:0}}})
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(mocks.retain.mock.invocationCallOrder[0])
    expect(mocks.retain.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.surveyEvent.create.mock.invocationCallOrder[0])
  })
  it.each(['SUPERSEDED','RETIRED'])('permits %s measurement for a historical correction with server-selected purpose', async status => {
    mocks.getRelease.mockResolvedValueOnce({...measurement(),status})
    await expect(publishSurveyReportDraft('owner','project1',draftId,publishInput)).resolves.toMatchObject({releaseId:publishedId,idempotent:false})
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(mocks.tx,expect.objectContaining({layer:'REPORT'}),'owner','HISTORICAL_INTERPRETATION')
  })
  it('published retry reuses the persisted release and does not duplicate publish, retention or audit', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([{...draft(),state:'PUBLISHED',published_release_id:publishedId}])
    await expect(publishSurveyReportDraft('owner','project1',draftId,publishInput)).resolves.toEqual({draftId,releaseId:publishedId,idempotent:true})
    expect(mocks.getRelease).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.retain).not.toHaveBeenCalled()
    expect(mocks.tx.surveyEvent.create).not.toHaveBeenCalled()
  })
  it('identical create retries reuse the draft after an advisory lock and conflicting payloads fail', async () => {
    await expect(createSurveyReportDraft('owner','project1',createInput())).resolves.toEqual(draft())
    expect(mocks.tx.$executeRaw.mock.calls[0][0].sql).toContain('pg_advisory_xact_lock')
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1)
    const changed=createInput(); changed.payload.language='en'
    await expect(createSurveyReportDraft('owner','project1',changed)).rejects.toMatchObject({statusCode:409})
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('create cannot reuse another project or owner request ID', async () => {
    for (const row of [{...draft(),project_id:'project2'},{...draft(),owner_id:'other'}]) {
      mocks.tx.$queryRaw.mockResolvedValueOnce([row])
      await expect(createSurveyReportDraft('owner','project1',createInput())).rejects.toMatchObject({statusCode:409})
    }
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('new draft insert occurs after authorization and release validation, with no publication side effects', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([draft()])
    await expect(createSurveyReportDraft('owner','project1',createInput())).resolves.toEqual(draft())
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.getRelease.mock.invocationCallOrder[0])
    expect(mocks.tx.$queryRaw.mock.calls[1][0].sql).toContain('INSERT INTO survey_report_drafts')
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.retain).not.toHaveBeenCalled()
  })
})
