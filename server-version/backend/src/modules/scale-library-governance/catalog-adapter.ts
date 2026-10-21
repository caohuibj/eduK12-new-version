import {canonicalHash} from '../assessment-runtime/canonical'
import {adaptCatalogScale,CATALOG_ADAPTER_VERSION,type CatalogSourceSnapshot} from '../survey/catalog.sources'
import type {LibrarySnapshot} from './source'
import type {LibraryProduct} from './contracts'
export function libraryCatalogSnapshot(entryId:string,release:{releaseId:string;version:string;contentHash:string},snapshot:LibrarySnapshot):CatalogSourceSnapshot{
  const ref={kind:'SCALE' as const,sourceId:'library:'+entryId,sourceVersion:release.version}
  const native:CatalogSourceSnapshot=snapshot.product==='TRAINING'?adaptCatalogScale(ref,snapshot.title,snapshot.compiledDefinition,{instrumentClass:'CUSTOM_DESCRIPTIVE'}):{
    ref,title:snapshot.title,displayDefinition:snapshot.definition,compiledDefinition:snapshot.compiledDefinition,
    definitionDigest:canonicalHash(snapshot.definition),scoringDigest:canonicalHash(snapshot.compiledDefinition.scoring),
    adapterVersion:CATALOG_ADAPTER_VERSION,provenance:{license:snapshot.compiledDefinition.license},
  }
  return {...native,provenance:{...native.provenance,libraryEntryId:entryId,instrumentClass:'CUSTOM_DESCRIPTIVE',
    sourceMeasurementRelease:{releaseId:release.releaseId,contentHash:release.contentHash},
    libraryUseOnly:true,reportDescriptionSource:'APPROVED_EXACT_VERSION'}}
}
export function libraryCompatibility(snapshot:LibrarySnapshot){
  const supportedEntrypoints:LibraryProduct[]=['TRAINING']
  const compatibilityReasons:Partial<Record<LibraryProduct,string>>={}
  try{libraryCatalogSnapshot('preview',{releaseId:'preview',version:'preview',contentHash:'preview'},snapshot);supportedEntrypoints.push('SURVEY')}
  catch(e){compatibilityReasons.SURVEY=e instanceof Error?e.message:'当前 Survey 适配器不支持此呈现结构'}
  return {supportedEntrypoints,compatibilityReasons}
}
