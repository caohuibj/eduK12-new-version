import type {ScaleInstrumentSourceV1} from './types'
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
