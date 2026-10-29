import {readFrozenEducationApplicability} from './education-applicability'
import {EDUCATION_LIBRARY_ADAPTER_NOT_READY,fail,type EducationLibraryProduct} from './contracts'
import {isSupportedEducationLibraryVariant} from './education-supported-variants'
import type {LibrarySnapshot} from './source'
import {readFrozenExpertApplicability,isNativeExpertObserver} from '../education-tools/expert-observation.contract'

// Public distribution uses the same reviewed adapter and current authority checks.
// This is not an environment toggle, request flag, or additional authorization role.
export const educationPublicDistributionEnabled:boolean=true
export function assertEducationPublicDistributionReady(){
 if(!educationPublicDistributionEnabled)fail(EDUCATION_LIBRARY_ADAPTER_NOT_READY,409)
}
export function educationContentCompatibility(snapshot:LibrarySnapshot,product:EducationLibraryProduct,context?:{approved:boolean;dependencyReleaseIds:string[]}){
 let applicability:ReturnType<typeof readFrozenEducationApplicability>
 let expert:ReturnType<typeof readFrozenExpertApplicability>
 try{applicability=readFrozenEducationApplicability(snapshot);expert=readFrozenExpertApplicability(snapshot);if(!applicability&&!expert)return {contentCompatible:false,reason:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'}}
 catch{return {contentCompatible:false,reason:'EDUCATION_APPLICABILITY_FROZEN_CONTRACT_MISMATCH'}}
 if(!context?.approved)return {contentCompatible:false,reason:'EDUCATION_LIBRARY_APPROVAL_REQUIRED'}
 if(context.dependencyReleaseIds.length||snapshot.compiledDefinition.referencePolicy.type!=='none')
  return {contentCompatible:false,reason:'EDUCATION_LIBRARY_DEPENDENCY_ADAPTER_NOT_READY'}
 const expertCompatible=product==='TEACHER'&&expert&&isNativeExpertObserver(snapshot.compiledDefinition.respondentType)&&expert.declaration.administrations.every(a=>a.targetKind==='PERSON')
 if(!expertCompatible&&!applicability?.variants.some(variant=>isSupportedEducationLibraryVariant(product,variant.variantKey)))
  return {contentCompatible:false,reason:'EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY'}
 return {contentCompatible:true,reason:null}
}
function productReadiness(snapshot:LibrarySnapshot,product:EducationLibraryProduct,context?:{approved:boolean;dependencyReleaseIds:string[]}){
 const compatibility=educationContentCompatibility(snapshot,product,context)
 const canDistribute=educationPublicDistributionEnabled&&compatibility.contentCompatible
 return {...compatibility,status:canDistribute?'READY' as const:'NOT_READY' as const,canDistribute,
  reason:compatibility.reason??(canDistribute?null:EDUCATION_LIBRARY_ADAPTER_NOT_READY)}
}
export function educationDistributionReadiness(snapshot:LibrarySnapshot,context?:{approved:boolean;dependencyReleaseIds:string[]}){
 const products={SCHOOL:productReadiness(snapshot,'SCHOOL',context),TEACHER:productReadiness(snapshot,'TEACHER',context)}
 // Aggregate retained for older consumers; product-specific actions MUST use
 // products[product] and supportedEntrypoints, never infer both from this any.
 const aggregate=products.SCHOOL.canDistribute?products.SCHOOL:products.TEACHER.canDistribute?products.TEACHER:
  products.SCHOOL.contentCompatible?products.SCHOOL:products.TEACHER.contentCompatible?products.TEACHER:products.SCHOOL
 return {...aggregate,products}
}
