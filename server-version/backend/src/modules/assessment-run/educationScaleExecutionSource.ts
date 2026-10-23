import type {Prisma} from '@prisma/client'
import {readEducationLibraryRegisteredSource} from '../scale-library-governance/education-runtime-resources'
import {readPrivateScaleRuntimeResource} from '../education-tools/private-tool.runtime-resources'
import {privateToolFail} from '../education-tools/private-tool.contracts'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'

/** Exact immutable content identity only. Callers separately establish current
 * task/actor/report authority. A participant never needs the author's editing
 * permission or a library-use grant. HISTORY is not collection authorization. */
export async function readEducationScaleExecutionSource(db:Prisma.TransactionClient,input:{
 product:'SCHOOL'|'TEACHER';organizationId:string;resourceKey:string;resourceVersion:string;
 purpose:'EXISTING_EXECUTION'|'HISTORY'
}){
 if(input.resourceKey.startsWith('library-scale:')){
  const source=await readEducationLibraryRegisteredSource(db,{product:input.product,resourceKey:input.resourceKey,
   resourceVersion:input.resourceVersion,purpose:input.purpose})
  return {...source,sourceKind:'LIBRARY' as const}
 }
 if(!input.resourceKey.startsWith('private-scale:')||input.resourceVersion!=='1.0.0')privateToolFail('PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID')
 const source=await readPrivateScaleRuntimeResource(db,{key:input.resourceKey,version:'1.0.0',purpose:input.purpose})
 if(source.origin.entry!==input.product||source.origin.organizationId!==input.organizationId)
  privateToolFail('PRIVATE_TOOL_RUNTIME_EXECUTION_SCOPE_MISMATCH',403)
 if(input.purpose==='EXISTING_EXECUTION')await assertScaleLibraryCollectionAllowed(db,[source.origin.releaseId],[source.scaleId])
 return {...source,sourceKind:'AUTHOR_PRIVATE' as const,variantKey:source.origin.variantKey,
  resultDisclosure:source.resourceEntry.resultDisclosure!}
}
export type EducationScaleExecutionSource=Awaited<ReturnType<typeof readEducationScaleExecutionSource>>
