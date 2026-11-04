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

/** Exact server-derived key reused by entry admission, never a client visibility claim.
 * Registry sources are static per instrument key/version (one object per key),
 * so the canonical fingerprint is computed once per source object. The cache is
 * keyed by object identity: any other or rebuilt source object is hashed anew. */
const policyIdentityCache=new WeakMap<ScaleInstrumentSourceV1,{resourceKey:string,fingerprint:string}>()
export function scaleSourcePolicyIdentity(source:ScaleInstrumentSourceV1){
 let identity=policyIdentityCache.get(source)
 if(!identity){
  identity={resourceKey:`standard:${source.identity.instrumentKey}:${source.identity.instrumentVersion}`,fingerprint:canonicalHash(snapshotScaleInstrumentSource(source))}
  policyIdentityCache.set(source,identity)
 }
 return {...identity}
}
