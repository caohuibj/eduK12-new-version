import { describe, expect, it, vi } from 'vitest'
vi.mock('../../config/database', () => ({ prisma: {} }))
import { createCustomScaleDefinition } from '../../modules/scale/scale-definition'
import { scaleAssessmentImageReferences, scaleAssessmentMediaReferences, assertScaleReportImagesOwned } from '../../modules/scale/scale-image-retention'
import { previewScaleRawScoreFeedback } from '../../modules/scale/raw-score-feedback-preview'
import { assertSurveyMediaOwned, surveyImageRefs } from '../../modules/survey/media.references'
import { rawParticipantFeedback } from '../../modules/survey/participant-feedback'
const image = { asset: { assetId: '00000000-0000-4000-8000-000000000001', contentHash: 'a'.repeat(64), mimeType: 'image/png' as const }, altText: 'Feedback image', order: 0 }
const config = { schemaVersion: 1 as const, rules: [{ scoreKey: 'total', ranges: [{ key: 'first', min: 0, max: 3, includeMax: true, text: 'Saved feedback', images: [image] }] }] }
function definition() {
  const d = createCustomScaleDefinition()
  d.items = [{ itemCode: 'q1', content: 'Question', type: 'single', required: true, sortOrder: 0, responseSetKey: 'default', randomizeOptions: false }]
  d.scoring.itemRules = [{ itemCode: 'q1', transform: { type: 'identity' } }]
  d.scoring.scores = [{ key: 'total', type: 'total', label: 'Total', direction: 'higher_is_more', canonical: true, displayPrecision: 1,
    source: { type: 'items', items: [{ itemCode: 'q1', weight: 1 }], aggregation: 'sum' } }]
  d.report.rawScoreFeedback = config
  return d
}
describe('raw feedback media isolation and author simulation', () => {
  it('pins report media without admitting it to either stimulus image allowlist', () => {
    expect(scaleAssessmentMediaReferences(definition())).toEqual([image.asset])
    expect(scaleAssessmentImageReferences(definition())).toEqual([])
    expect(surveyImageRefs([{ kind: 'SCALE', definition: { rawScoreFeedback: config } }])).toEqual([])
  })
  it('requires Training author ownership before accepting a report image', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    await expect(assertScaleReportImagesOwned(definition(), 'author', { storedAsset: { findMany } } as never)).rejects.toThrow('作者')
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'author', deletedAt: null, accessScope: 'PRIVATE' }) }))
  })
  it('checks Survey project ownership and immutable identity for report media', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: image.asset.assetId, mimeType: 'image/png', sha256: 'a'.repeat(64), sizeBytes: 120 }])
    const query=vi.fn().mockResolvedValue([{id:image.asset.assetId}])
    const db = { $queryRaw:query,storedAsset: { findMany } } as never
    await expect(assertSurveyMediaOwned(db, 'owner', 'project', [{ kind: 'SCALE', definition: { rawScoreFeedback: config } }])).resolves.toEqual([image.asset])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'owner', id:{in:[image.asset.assetId]}, accessScope: 'PRIVATE' }) }))
    expect(query).toHaveBeenCalled()
    findMany.mockResolvedValue([{ id: image.asset.assetId, mimeType: 'image/png', sha256: 'b'.repeat(64), sizeBytes: 120 }])
    await expect(assertSurveyMediaOwned(db, 'owner', 'project', [{ kind: 'SCALE', definition: { rawScoreFeedback: config } }])).rejects.toThrow('摘要')
  })
  it('simulates only finite known scores inside the theoretical range without scoring answers', () => {
    expect(previewScaleRawScoreFeedback(definition(), { total: 2 })).toMatchObject({ previewOnly: true, rawScoreFeedback: [{ rangeKey: 'first', images: [image] }] })
    for (const scores of [{ unknown: 2 }, { total: Infinity }, { total: -100 }, { total: 100 }]) expect(() => previewScaleRawScoreFeedback(definition(), scores)).toThrow()
  })
  it('releases saved images only with selected metrics and existing disclosure timing', () => {
    const unit: any = { instrumentKey: 'scale', kind: 'SCALE', title: 'Scale', sourceDigest: 'source', scoringDigest: 'score',
      measurementRelease: { releaseId: 'release' }, compiledDefinition: { scoring: { scores: [{ key: 'total' }] } },
      participantFeedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['total'], release: 'AFTER_COLLECTION' } }
    const stored: any = { instrumentKey: 'scale', kind: 'SCALE', sourceDigest: 'source', scoringDigest: 'score', privateScoring: {
      scores: [{ key: 'total', value: 2, status: 'calculated' }], quality: { status: 'interpretable' }, rawScoreFeedback: [
        { scoreKey: 'total', rangeKey: 'first', text: 'Saved feedback', images: [image] },
        { scoreKey: 'private', rangeKey: 'secret', text: 'Hidden', images: [image] },
      ],
    } }
    expect(rawParticipantFeedback(unit, stored, false)).toEqual({ pending: true })
    expect(rawParticipantFeedback(unit, stored, true)).toMatchObject({ rawScoreFeedback: [{ scoreKey: 'total', text: 'Saved feedback', images: [image] }] })
    unit.participantFeedback.mode = 'GENERAL'; unit.participantFeedback.metricKeys = []
    expect(rawParticipantFeedback(unit, stored, true)).toBeNull()
  })
})

import { projectedReportImage, serveProjectedReportImage } from '../../modules/reporting/report-image-delivery'
import { readFileSync } from 'node:fs'
describe('collection report image disclosure', () => {
  it('uses only projected SCALE feedback and refuses internal/unreleased/other-unit payloads', async () => {
    const feedback = [{ scoreKey: 'total', rangeKey: 'first', text: 'Saved', images: [image] }]
    for (const report of [null, {}, {scaleReports:[{rawScoreFeedback:feedback}]},
      {unitReports:[{type:'SCALE',status:'COMPLETION'}]}, {unitReports:[{type:'FORM',rawScoreFeedback:feedback}]}]) {
      expect(projectedReportImage(report, image.asset.assetId)).toBeUndefined()
      const res:any = {setHeader:vi.fn(),status:vi.fn().mockReturnThis(),end:vi.fn()}
      await serveProjectedReportImage(report, image.asset.assetId, res)
      expect(res.status).toHaveBeenCalledWith(404)
    }
    const report = { unitReports:[{type:'SCALE',rawScoreFeedback:feedback}] }
    expect(projectedReportImage(report,image.asset.assetId)).toEqual(image.asset)
    expect(projectedReportImage(report,'different')).toBeUndefined()
  })
  it('reuses identical report authorization middleware for every collection image route', () => {
    for (const name of ['routes/public.ts','routes/questionnaires.ts','modules/composite/composite.routes.ts','modules/composite/composite.public.routes.ts']) {
      const lines=readFileSync('src/'+name,'utf8').split('\n')
      const originals=lines.filter(line=>line.includes('router.get(')&&line.includes("/report',"))
      expect(originals.length).toBeGreaterThan(0)
      for(const line of originals)expect(lines).toContain(line.replace("/report',","/report/assets/:assetId',"))
    }
  })
})
