import type {Prisma} from '@prisma/client'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPackageKey,type EducationPackageReference,type EducationPackageUse} from './package-reference.contracts'
import {nativePackageSupportsEntry,packageHeaderSupportsEntry} from './package-reference.catalog'
import {readEducationPackageHeaders} from './package-reference.headers'
import {readEducationWholePackageSource} from './package-reference.source'
import {privateToolFail} from './private-tool.contracts'
import {authorizePrivateTool} from './private-tool.access'

type Scope={product:'SCHOOL'|'TEACHER';organizationId:string;actorId:string}
/** Current use at preparation/publication/NEW_USE/NEW_START only. Continued
 * attempts and historical feedback retain the original frozen execution. */
export async function readEducationPackageUse(tx:Prisma.TransactionClient,c:Scope,sourceRef:EducationPackageReference,pinned?:EducationPackageUse){
 const key=educationPackageKey(sourceRef)
 const use=(await readEducationPublicUse(tx,{entry:c.product,organizationId:c.organizationId,
  principal:{userId:c.actorId,accountDomain:'SCHOOL'}},[key],true)).get(key)
 if(!use||pinned&&(pinned.grantId!==use.grantId||pinned.grantVersion!==use.grantVersion))privateToolFail('EDUCATION_PACKAGE_USE_REQUIRED',403)
 return {use:{sourceRef,grantId:use.grantId,grantVersion:use.grantVersion}}
}
export async function assertEducationPackageUseCurrent(tx:Prisma.TransactionClient,c:Scope,pinned:EducationPackageUse){
 await authorizePrivateTool(tx,{entry:c.product,organizationId:c.organizationId,principal:{userId:c.actorId,accountDomain:'SCHOOL'}})
 await readEducationPackageUse(tx,c,pinned.sourceRef,pinned)
 // The native START already checks signed publication and dependencies. This
 // connection needs only current U/lifecycle; do not load/compile it twice.
 const header=(await readEducationPackageHeaders(tx,[pinned.sourceRef],true)).get(educationPackageKey(pinned.sourceRef))
 if(!header)privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',409)
 if(header.family!=='NATIVE_BUNDLE'||!packageHeaderSupportsEntry(header,c.product))privateToolFail('EDUCATION_PACKAGE_ADMINISTRATION_UNSUPPORTED',400)
}
export async function readEducationPackageForUse(tx:Prisma.TransactionClient,sourceRef:EducationPackageReference,product:'SCHOOL'|'TEACHER'){
 try{
  const source=await readEducationWholePackageSource(tx,sourceRef)
  if(source.kind!=='NATIVE_BUNDLE'||!nativePackageSupportsEntry(source.entry.definition,product))privateToolFail('EDUCATION_PACKAGE_ADMINISTRATION_UNSUPPORTED',400)
  return source
 }catch(error){
  if(error instanceof Error&&/^BUNDLE_[A-Z_]+$/.test(error.message))privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',409)
  throw error
 }
}
