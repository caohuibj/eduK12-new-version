import type {Response} from 'express'
import {materialSchema} from '../assessment-media/material'
import {serveAssessmentMaterial} from '../assessment-media/material-delivery'
import type {LibraryMediaManifest} from '../scale-library-governance/media'
import {fail} from '../scale-library-governance/contracts'

/** Manifest membership is authority only after the scoped source/submission
 * reader has authenticated the request. No public URL or independent reuse. */
export async function servePrivateScaleSharingImage(res:Response,manifest:LibraryMediaManifest,assetId:string){
 const item=manifest.items.find(row=>row.assetId===assetId)
 if(!item)fail('SCALE_LIBRARY_MEDIA_NOT_IN_APPROVED_MANIFEST',404)
 const reference=materialSchema.shape.asset.parse({assetId:item.assetId,contentHash:item.contentHash,mimeType:item.mimeType})
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer')
 return serveAssessmentMaterial(reference,res)
}
