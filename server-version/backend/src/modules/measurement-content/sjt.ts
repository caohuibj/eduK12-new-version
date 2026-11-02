import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { validateSituationRuntimeDefinition } from '../situational/situation-runtime-definition'
import { assertSituationalScorerAvailable } from '../situational/situation-model-resolver'
import { situationalAssetReferences } from '../situational/situation-definition'
import { validateSjtOnlineMetadata } from '../situational/authoring/online'
import { ContentReleaseError, type ReleaseInput } from './release'

/** Existing V1/V2 SJT only. Expert keys remain measurement/scoring, not report text. */
export function sjtMeasurementRelease(input:{localId:string;version:string;instrumentVersion:string;definition:unknown;
  scope:ReleaseInput['scope'];provenance?:Record<string,unknown>;onlineProtocol?:unknown;displayProtocol?:unknown}):ReleaseInput{
  const checked=validateSituationRuntimeDefinition(input.definition,{allowMeasurementBundle:true})
  if(!checked.definition||checked.issues.some(i=>i.severity==='error'))throw new ContentReleaseError('CONTENT_SJT_DEFINITION_INVALID')
  const d=checked.definition
  assertSituationalScorerAvailable(d)
  const {report:_report,referencePolicy:_reference,source:_source,license:_license,...measurement}=d
  let onlineProtocol:Record<string,unknown>|null=null
  if(input.onlineProtocol){
    const online=validateSjtOnlineMetadata(input.onlineProtocol,d)
    onlineProtocol={responseProtocol:online.responseProtocol,compilerVersion:online.compilerVersion,
      display:measurementDisplay(online.display)}
  }
  const displayProtocol=input.displayProtocol?measurementDisplay(input.displayProtocol):null
  canonicalJsonString({measurement,onlineProtocol,displayProtocol})
  const executable=JSON.parse(JSON.stringify({...measurement,onlineProtocol,displayProtocol})) as Record<string,unknown>
  const assets=new Map<string,{assetId:string;sha256:string;mediaType:string}>()
  for(const scene of d.scenes)for(const ref of situationalAssetReferences(scene.stimulus)){
    const asset={assetId:ref.assetId,sha256:ref.contentHash,mediaType:ref.mimeType},prior=assets.get(ref.assetId)
    if(prior&&canonicalHash(prior)!==canonicalHash(asset))throw new ContentReleaseError('CONTENT_ASSET_CONFLICT')
    assets.set(ref.assetId,asset)
  }
  return {layer:'MEASUREMENT',family:'SJT',key:`sjt:${canonicalHash(input.scope)}:${input.localId}`,version:input.version,
    scope:input.scope,sourceReleaseId:null,provenance:input.provenance??{},assetRefs:[...assets.values()],
    content:{projectionVersion:1,instrumentVersion:input.instrumentVersion,measurementHash:canonicalHash(executable),
      ...(d.scoring.mode === 'UNSCORED' ? { resultMode: 'UNSCORED' as const } : {}),
      measurementHashScheme:'SJT_MEASUREMENT_PROJECTION_V1',scoringVersion:d.scoring.scoringVersion,
      runnerKey:`situational-v${d.schemaVersion}`,runnerVersion:String(d.schemaVersion),locale:'und',localizationVersion:'unversioned',
      metrics:d.scoring.publishedMetrics.map(m=>({metricKey:m.key,unit:'score',direction:m.direction})),executable}}
}

function measurementDisplay(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentReleaseError('CONTENT_SJT_PROTOCOL_INVALID')
  const {author:_author,sourceNote:_source,licenseStatus:_license,redistribution:_redistribution,...display}=value as Record<string,unknown>
  if(display.scoring&&typeof display.scoring==='object'){
    const {sourceNote:_note,...scoring}=display.scoring as Record<string,unknown>
    display.scoring=scoring
  }
  return display
}
