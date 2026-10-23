import {materialSchema} from '../assessment-media/material'
import {serveAssessmentMaterial} from '../assessment-media/material-delivery'
import type { Response } from 'express'
import { assessmentImagePresentationSchema } from '../assessment-media/assessment-image-presentation'
import { serveAssessmentImageContent } from '../assessment-media/assessment-image-delivery'

/** Input MUST be the existing HTTP report projection, after current principal,
 * release and audience checks. Never pass internal stored reports or definitions. */
export function projectedReportImage(report: unknown, assetId: string) {
  if (!report || typeof report !== 'object') return undefined
  const units = (report as { unitReports?: unknown }).unitReports
  if (!Array.isArray(units)) return undefined
  for (const unit of units) {
    if (!unit || typeof unit !== 'object' || unit.type !== 'SCALE' || !Array.isArray(unit.rawScoreFeedback)) continue
    for (const feedback of unit.rawScoreFeedback) {
      if(!feedback)continue
      for(const material of feedback.materials??[]){const parsed=materialSchema.shape.asset.safeParse(material?.asset);if(parsed.success&&parsed.data.assetId===assetId)return parsed.data}
      if (!Array.isArray(feedback.images)) continue
      for (const image of feedback.images) {
        const parsed = assessmentImagePresentationSchema.safeParse(image)
        if (parsed.success && parsed.data.asset.assetId === assetId) return parsed.data.asset
      }
    }
  }
  return undefined
}
export async function serveProjectedReportImage(report: unknown, assetId: string, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const reference = projectedReportImage(report, assetId)
  if (!reference) return res.status(404).end()
  if(['video/mp4','video/webm','application/pdf'].includes(reference.mimeType))return serveAssessmentMaterial(materialSchema.shape.asset.parse(reference),res)
  return serveAssessmentImageContent({ reference:reference as Parameters<typeof serveAssessmentImageContent>[0]['reference'], res })
}
