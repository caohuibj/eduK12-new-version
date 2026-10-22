import {educationDistributionReadiness} from './education-distribution-readiness'
import {canonicalHash} from '../assessment-runtime/canonical'
import {adaptCatalogScale,CATALOG_ADAPTER_VERSION,type CatalogSourceSnapshot} from '../survey/catalog.sources'
import type {LibrarySnapshot} from './source'
import {EDUCATION_LIBRARY_ADAPTER_NOT_READY,librarySourceProduct,fail,type LibraryProduct} from './contracts'
export function libraryCatalogSnapshot(entryId:string,release:{releaseId:string;version:string;contentHash:string},snapshot:LibrarySnapshot):CatalogSourceSnapshot{
  librarySourceProduct.parse(snapshot.product)
  const ref={kind:'SCALE' as const,sourceId:'library:'+entryId,sourceVersion:release.version}
  let native:CatalogSourceSnapshot
  switch(snapshot.product){
    case 'SCHOOL':
    case 'TEACHER':
    case 'TRAINING':
      native=adaptCatalogScale(ref,snapshot.title,snapshot.compiledDefinition,{instrumentClass:'CUSTOM_DESCRIPTIVE'})
      break
    case 'SURVEY':
      native={ref,title:snapshot.title,displayDefinition:snapshot.definition,compiledDefinition:snapshot.compiledDefinition,
        definitionDigest:canonicalHash(snapshot.definition),scoringDigest:canonicalHash(snapshot.compiledDefinition.scoring),
        adapterVersion:CATALOG_ADAPTER_VERSION,provenance:{license:snapshot.compiledDefinition.license}}
      break
    default:fail('SCALE_LIBRARY_SOURCE_ADAPTER_NOT_READY',409)
  }
  return {...native,provenance:{...native.provenance,libraryEntryId:entryId,instrumentClass:'CUSTOM_DESCRIPTIVE',
    sourceMeasurementRelease:{releaseId:release.releaseId,contentHash:release.contentHash},
    libraryUseOnly:true,reportDescriptionSource:'APPROVED_EXACT_VERSION'}}
}
export function libraryCompatibility(snapshot:LibrarySnapshot,context?:{approved:boolean;dependencyReleaseIds:string[]}){
  const supportedEntrypoints:LibraryProduct[]=['TRAINING']
  const compatibilityReasons:Partial<Record<LibraryProduct,string>>={SCHOOL:EDUCATION_LIBRARY_ADAPTER_NOT_READY,TEACHER:EDUCATION_LIBRARY_ADAPTER_NOT_READY}
  try{libraryCatalogSnapshot('preview',{releaseId:'preview',version:'preview',contentHash:'preview'},snapshot);supportedEntrypoints.push('SURVEY')}
  catch(e){compatibilityReasons.SURVEY=e instanceof Error?e.message:'当前 Survey 适配器不支持此呈现结构'}
  const educationDistribution=educationDistributionReadiness(snapshot,context)
  for(const product of ['SCHOOL','TEACHER'] as const){
   const readiness=educationDistribution.products[product]
   if(readiness.canDistribute){supportedEntrypoints.push(product);delete compatibilityReasons[product]}
   else compatibilityReasons[product]=readiness.reason!
  }
  return {supportedEntrypoints,compatibilityReasons,educationDistribution}
}
