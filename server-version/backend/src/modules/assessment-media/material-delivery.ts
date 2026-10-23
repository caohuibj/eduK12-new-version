import type {Response} from 'express'
import {Readable} from 'node:stream'
import {prisma} from '../../config/database'
import {serveStoredAssetContent,type AssetDatabase} from '../../services/assetStorage'
import {assetStorageKey} from '../../services/assetStorageKey'
import {getCOSSignedUrl} from '../../utils/cos'
import {streamResponse} from '../../utils/streamResponse'
import {materialSchema,materialLimits,type AssessmentMaterial} from './material'

/** Callers must authorize the exact reference before invoking delivery. */
export async function serveAssessmentMaterial(reference:AssessmentMaterial['asset'],res:Response,db:AssetDatabase=prisma){
  const ref=materialSchema.shape.asset.parse(reference)
  const asset=await db.storedAsset.findUnique({where:{id:ref.assetId}})
  if(!asset||asset.deletedAt||asset.sha256!==ref.contentHash||asset.mimeType!==ref.mimeType||asset.sizeBytes<=0||asset.sizeBytes>materialLimits[ref.mimeType])throw Object.assign(new Error('素材不可用'),{statusCode:404})
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('X-Content-Type-Options','nosniff')
  if(asset.provider==='local')return serveStoredAssetContent(asset,res)
  if(asset.provider!=='cos')throw Object.assign(new Error('素材不可用'),{statusCode:404})
  const upstream=await fetch(await getCOSSignedUrl(assetStorageKey(asset)),{signal:AbortSignal.timeout(30000),redirect:'error'})
  if(!upstream.ok||!upstream.body)throw Object.assign(new Error('素材暂不可用'),{statusCode:404})
  res.setHeader('Content-Type',asset.mimeType)
  res.setHeader('Content-Length',String(asset.sizeBytes))
  return streamResponse(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),res)
}
