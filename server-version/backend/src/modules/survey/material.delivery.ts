import type {Response} from 'express'
import {Readable} from 'node:stream'
import {prisma} from '../../config/database'
import {serveStoredAssetContent} from '../../services/assetStorage'
import {assetStorageKey} from '../../services/assetStorageKey'
import {getCOSSignedUrl} from '../../utils/cos'
import {streamResponse} from '../../utils/streamResponse'
import {materialSchema,materialLimits,type AssessmentMaterial} from '../assessment-media/material'
import {SurveyMediaError} from './media.references'

/** Participant proofs stay in the same-origin POST body; never redirect them to storage. */
export async function serveSurveyMaterial(reference:AssessmentMaterial['asset'],res:Response){
  const ref=materialSchema.shape.asset.parse(reference)
  const asset=await prisma.storedAsset.findUnique({where:{id:ref.assetId}})
  if(!asset||asset.deletedAt||asset.sha256!==ref.contentHash||asset.mimeType!==ref.mimeType||
    asset.sizeBytes<=0||asset.sizeBytes>materialLimits[ref.mimeType])throw new SurveyMediaError(404,'素材不可用')
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('X-Content-Type-Options','nosniff')
  if(asset.provider==='local')return serveStoredAssetContent(asset,res)
  if(asset.provider!=='cos')throw new SurveyMediaError(404,'素材不可用')
  const upstream=await fetch(await getCOSSignedUrl(assetStorageKey(asset)),{signal:AbortSignal.timeout(30000),redirect:'error'})
  if(!upstream.ok||!upstream.body)throw new SurveyMediaError(404,'素材暂不可用')
  res.setHeader('Content-Type',asset.mimeType)
  res.setHeader('Content-Length',String(asset.sizeBytes))
  return streamResponse(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),res)
}
