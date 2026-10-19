import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  lock: vi.fn(), retainImages: vi.fn(), retainVideos: vi.fn(), retainScale: vi.fn(),
  questionnaire: { findFirst: vi.fn(), update: vi.fn() }, assessment: { findMany: vi.fn() },
  sections: vi.fn(), units: vi.fn(), canManage: vi.fn(), canManageGeneral: vi.fn(), transaction: vi.fn(),
}))
vi.mock('../../services/assetStorage', () => ({ lockStoredAssetRows: mocks.lock,
  inAssetTransaction: async (db: unknown, run: (tx: unknown) => unknown) => run(db) }))
vi.mock('../../services/legacyQuestionnaireDatabase', () => ({ legacyQuestionnaireDb: { questionnaire: mocks.questionnaire, $transaction: mocks.transaction } }))
vi.mock('../../modules/assessment-context', () => ({ validateContextFormItems: () => [] }))
vi.mock('../../modules/assessment-runtime/attempt-runtime', () => ({ formSectionIdentityHash: (section: { id: string }) => section.id }))
vi.mock('../../modules/assessment-runtime/runtime-snapshot', () => ({ loadFrozenScaleRuntimeSnapshot: vi.fn() }))
vi.mock('../../modules/assessment-runtime/form-admission.service', () => ({ ensureQuestionnaireFormAdmissionAtDelivery: vi.fn() }))
vi.mock('../../modules/assessment-runtime/form-image.adapter', () => ({
  publishedFormMediaOwner: (_kind: string, id: string, hash: string) => ({ entityType: 'AssessmentPublishedDefinition', entityId: `${id}:${hash}`, field: 'media' }),
  questionnaireFormSectionImageReferences: (section: { images: unknown[] }) => section.images,
  retainFormSectionImages: mocks.retainImages, serveFrozenFormSectionImage: vi.fn(),
}))
vi.mock('../../modules/assessment-runtime/form-video.adapter', () => ({
  questionnaireFormSectionVideoPresentations: (section: { videos: unknown[] }) => section.videos,
  retainFormSectionVideos: mocks.retainVideos,
}))
vi.mock('../../modules/scale/scale-image.adapter', () => ({ serveFrozenScaleAssessmentImage: vi.fn() }))
vi.mock('../../services/questionnaire-form-section.service', () => ({ readQuestionnaireFormSections: mocks.sections, listQuestionnaireContentUnits: mocks.units }))
vi.mock('../../services/questionnaireAuthorizationService', () => ({ questionnaireAuthorizationService: { canManage: mocks.canManage, canManageGeneral: mocks.canManageGeneral } }))
vi.mock('../../services/cacheService', () => ({ cacheService: { clearQuestionnaireCache: vi.fn() } }))
vi.mock('../../modules/scale/scale-image-retention', () => ({ retainFrozenScaleAssessmentImages: mocks.retainScale,
  scaleAssessmentMediaReferences: (definition: { media: unknown[] }) => definition.media }))
import { generalQuestionnaireImageController } from '../../controllers/generalQuestionnaireImageController'
import { questionnaireImageController } from '../../controllers/questionnaireImageController'
import { retainQuestionnaireScaleAssessmentImages } from '../../modules/scale/questionnaire-scale-image-retention'
const asset = (assetId: string, mimeType = 'image/png') => ({ assetId, contentHash: 'a'.repeat(64), mimeType })
const video = { schemaVersion: 1, video: asset('video', 'video/mp4'), poster: asset('poster'),
  captions: [{ asset: asset('caption', 'text/vtt'), kind: 'captions', srcLang: 'zh', label: '字幕' }] }
const tx = { questionnaire: mocks.questionnaire, assessment: mocks.assessment }
const response = () => {
  const res: any = { statusCode: 200 }
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}
describe('parent media lock sets cover every section, snapshot and media kind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canManage.mockResolvedValue(true); mocks.canManageGeneral.mockResolvedValue(true)
    mocks.questionnaire.findFirst.mockResolvedValue({ id: 'q', creatorId: 'owner', questionnaireScales: [], formItems: [{ id: 'i1' }, { id: 'i2' }] })
    mocks.questionnaire.update.mockResolvedValue({ status: 'PUBLISHED' })
    mocks.sections.mockResolvedValue([{ id: 's1', position: 0, items: [{ id: 'i1' }], images: [asset('b')], videos: [video] },
      { id: 's2', position: 1, items: [{ id: 'i2' }], images: [asset('a')], videos: [] }])
    mocks.units.mockResolvedValue([{ type: 'form-section', id: 's1', position: 0 }, { type: 'form-section', id: 's2', position: 1 }])
    mocks.transaction.mockImplementation(async run => run(tx))
  })
  for (const [name, controller] of [['GENERAL', generalQuestionnaireImageController], ['COURSE', questionnaireImageController]] as const) {
    it(`${name} prelocks all image/video/poster/caption IDs before any section retain`, async () => {
      const res = response()
      await controller.publish({ params: { id: 'q' }, user: { userId: 'owner', role: 'TEACHER' } } as never, res)
      expect(res.body.code).toBe(0)
      expect(mocks.lock).toHaveBeenCalledTimes(1)
      expect(new Set(mocks.lock.mock.calls[0][1])).toEqual(new Set(['a', 'b', 'video', 'poster', 'caption']))
      expect(mocks.lock.mock.calls[0][0]).toBe(tx)
      expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.retainImages.mock.invocationCallOrder[0])
      expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.retainVideos.mock.invocationCallOrder[0])
      expect(mocks.retainImages).toHaveBeenCalledTimes(2); expect(mocks.retainVideos).toHaveBeenCalledTimes(2)
    })
    it(`${name} keeps authorization before locks and writes`, async () => {
      mocks.canManage.mockResolvedValue(false); mocks.canManageGeneral.mockResolvedValue(false)
      const res = response()
      await controller.publish({ params: { id: 'q' }, user: { userId: 'foreign', role: 'TEACHER' } } as never, res)
      expect(res.statusCode).toBe(403); expect(mocks.lock).not.toHaveBeenCalled(); expect(mocks.questionnaire.update).not.toHaveBeenCalled()
    })
  }
  it('prelocks every matched Scale child snapshot before the first child retain', async () => {
    mocks.assessment.findMany.mockResolvedValue([{ id: 'child-b', scaleId: 'b' }, { id: 'child-a', scaleId: 'a' }])
    await retainQuestionnaireScaleAssessmentImages({ questionnaireAssessmentId: 'parent', db: tx as never,
      snapshots: [{ scaleId: 'a', snapshot: { definition: { media: [asset('a'), asset('video', 'video/mp4')] } } },
        { scaleId: 'b', snapshot: { definition: { media: [asset('b'), asset('caption', 'text/vtt')] } } }] as never })
    expect(new Set(mocks.lock.mock.calls[0][1])).toEqual(new Set(['a', 'b', 'video', 'caption']))
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.retainScale.mock.invocationCallOrder[0])
    expect(mocks.retainScale).toHaveBeenCalledTimes(2)
  })
  it('rejects count and identity mismatches before any child retention', async () => {
    const input = { questionnaireAssessmentId: 'parent', db: tx as never,
      snapshots: [{ scaleId: 'a', snapshot: { definition: { media: [asset('a')] } } }] as never }
    mocks.assessment.findMany.mockResolvedValue([])
    await expect(retainQuestionnaireScaleAssessmentImages(input)).rejects.toThrow('do not match')
    mocks.assessment.findMany.mockResolvedValue([{ id: 'foreign-child', scaleId: 'b' }])
    await expect(retainQuestionnaireScaleAssessmentImages(input)).rejects.toThrow('does not match')
    expect(mocks.lock).not.toHaveBeenCalled(); expect(mocks.retainScale).not.toHaveBeenCalled()
  })
})
