import {canonicalHash} from '../../assessment-runtime/canonical'
import type {ScaleInstrumentSourceV1} from './types'
/** The existing C/P/R split, shared by registration and normal installation. */
export function scaleSourceAxisPayloads(source:ScaleInstrumentSourceV1){
 const executable=source.executable
 if(!executable)throw new Error('Scale source is not executable')
 const {report,referencePolicy,source:provenance,license,...content}=executable.definition
 return {content,parameters:{referencePolicy,references:executable.references},report,provenance,license}
}
/** The existing axis-snapshot contract binds plugin key/version, rather than
 * JavaScript function identity. All other source fields remain in the strict
 * canonical closure (content, scoring, reports, references, rights and policy).
 * Preserve absent plugins so function-free source fingerprints do not change. */
export function snapshotScaleInstrumentSource(source:ScaleInstrumentSourceV1){
 const executable=source.executable
 if(!executable?.scorerPlugins)return source
 return {...source,executable:{...executable,scorerPlugins:executable.scorerPlugins.map(plugin=>{
  if(!plugin.key||!plugin.version||typeof plugin.scorer!=='function')throw new Error('Versioned scorer implementation identity required')
  const {scorer:_,...identity}=plugin
  return identity
 })}}
}

/** Exact server-derived key reused by entry admission, never a client visibility claim. */
export function scaleSourcePolicyIdentity(source:ScaleInstrumentSourceV1){
 return {resourceKey:`standard:${source.identity.instrumentKey}:${source.identity.instrumentVersion}`,fingerprint:canonicalHash(snapshotScaleInstrumentSource(source))}
}
