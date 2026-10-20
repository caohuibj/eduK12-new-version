import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateScaleProductDefinition } from '../scale/product-definition-readiness'
import { assessmentVideoPresentationAssetReferences } from '../assessment-media/assessment-video'
import { ContentReleaseError, type ReleaseInput } from './release'
import { publishContentRelease } from './repository'

/** Namespace is server-derived from the authorized workspace, never a title. */
export const scopedScaleKey = (scope: ReleaseInput['scope'], localId: string): string =>
  `scale:${canonicalHash(scope)}:${localId}`

export interface ScaleReleaseSource {
  localId: string
  version: string
  instrumentVersion: string
  definition: unknown
  instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  scope: ReleaseInput['scope']
  sourceReleaseId?: string | null
  provenance?: Record<string,unknown>
  presentationMode?: 'ONE_BY_ONE' | 'ALL_AT_ONCE' | 'RUNNER_DEFAULT'
}
/** Training definitions and Survey's existing compileResearchScale both enter here.
 * Import format stays with each workbench; this does not add a second scorer.
 */
export function scaleMeasurementRelease(input: ScaleReleaseSource): ReleaseInput {
  const checked = validateScaleProductDefinition(input.definition,input.instrumentClass)
  if (!checked.valid || !checked.definition) throw new ContentReleaseError('CONTENT_SCALE_DEFINITION_INVALID')
  const d = checked.definition
  // Deliberate new projection, never relabel hashScaleDefinition's legacy bytes.
  // All runtime measurement content remains; report/reference/rights/catalog do not.
  const executable = JSON.parse(JSON.stringify({
    schemaVersion:d.schemaVersion,respondentType:d.respondentType,display:d.display,
    presentationMode:input.presentationMode??'RUNNER_DEFAULT',
    responseSets:d.responseSets,items:d.items,scoring:d.scoring,
    ...(d.versionAxes ? {versionAxes:d.versionAxes}:{}),
  })) as Record<string,unknown>
  const refs = d.items.flatMap(item=>[
    ...(item.images??[]).map(image=>image.asset),
    ...(item.video?assessmentVideoPresentationAssetReferences(item.video):[]),
  ])
  const assets = new Map<string,{assetId:string;sha256:string;mediaType:string}>()
  for(const ref of refs){
    const asset={assetId:ref.assetId,sha256:ref.contentHash,mediaType:ref.mimeType}
    const prior=assets.get(ref.assetId)
    if(prior&&canonicalHash(prior)!==canonicalHash(asset))throw new ContentReleaseError('CONTENT_ASSET_CONFLICT')
    assets.set(ref.assetId,asset)
  }
  return {
    layer:'MEASUREMENT',family:'SCALE',key:scopedScaleKey(input.scope,input.localId),version:input.version,
    scope:input.scope,provenance:input.provenance??{},sourceReleaseId:input.sourceReleaseId??null,assetRefs:[...assets.values()],
    content:{projectionVersion:1,instrumentVersion:input.instrumentVersion,
      measurementHash:canonicalHash(executable),measurementHashScheme:'SCALE_MEASUREMENT_PROJECTION_V1',
      scoringVersion:d.scoring.scoringVersion,runnerKey:'scale-definition-v2',runnerVersion:'2',
      locale:d.versionAxes?.locale??'und',localizationVersion:d.versionAxes?.localizationVersion??'unversioned',
      metrics:d.scoring.scores.map(score=>({metricKey:score.key,unit:'points',direction:score.direction})),executable},
  }
}
export async function publishScaleMeasurement(db:Prisma.TransactionClient,input:ScaleReleaseSource,actorId:string){
  const release = await publishContentRelease(db,scaleMeasurementRelease(input),actorId)
  if (release.layer !== 'MEASUREMENT') throw new ContentReleaseError('CONTENT_SCALE_LAYER_MISMATCH')
  return release
}

/** Catalog source version is not the private draft's edit revision. */
export function surveyScaleReleaseContext(unit:{draftRevision:number;sourceProvenance?:Record<string,unknown>;displayDefinition:unknown}):{instrumentVersion:string;presentationMode:'ONE_BY_ONE'|'ALL_AT_ONCE'}{
  const source=unit.sourceProvenance?.source as {sourceVersion?:unknown}|undefined
  if(unit.sourceProvenance&&(!source||typeof source.sourceVersion!=='string'||!source.sourceVersion.trim())){
    throw new ContentReleaseError('CONTENT_SOURCE_VERSION_MISSING')
  }
  const display=unit.displayDefinition as {presentationMode?:unknown}
  const mode=display.presentationMode??'ALL_AT_ONCE'
  if(mode!=='ONE_BY_ONE'&&mode!=='ALL_AT_ONCE')throw new ContentReleaseError('CONTENT_SCALE_PRESENTATION_INVALID')
  return {instrumentVersion:(source?.sourceVersion as string | undefined) ?? String(unit.draftRevision),presentationMode:mode}
}
