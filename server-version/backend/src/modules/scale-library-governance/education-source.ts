import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {StoredRelease} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {authorizePrivateTool} from '../education-tools/private-tool.access'
import {readPrivateScaleVersionIdentity,privateScaleMeasurementInput} from '../education-tools/private-tool.runtime-source'
import {libraryActor} from './authority'
import {fail,type EducationLibraryProduct} from './contracts'
import type {LibrarySnapshot} from './source'

/** Real education origin, never a Training authoring alias. This checks new
 * author applications only; approved library use never rechecks author membership. */
export async function educationSubmissionSource(tx:Prisma.TransactionClient,actorId:string,entry:EducationLibraryProduct,release:StoredRelease){
 if(release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED'||release.scope.kind!=='PRIVATE'
  ||release.scope.product!==entry||release.scope.ownerId!==actorId||release.provenance.sourceKind!=='EDUCATION_PRIVATE_TOOL_VERSION')
  fail('EDUCATION_LIBRARY_SOURCE_INVALID',403)
 const versionId=release.provenance.versionId
 if(typeof versionId!=='string'||release.scope.resourceId!==versionId)fail('EDUCATION_LIBRARY_SOURCE_INVALID')
 const scoped=await tx.educationPrivateToolVersion.findFirst({where:{id:versionId,ownerUserId:actorId,entry,kind:'SCALE'}})
 if(!scoped)fail('EDUCATION_LIBRARY_SOURCE_INVALID',403)
 const actor=await libraryActor(tx,actorId)
 if(actor.account_domain!=='SCHOOL')fail('EDUCATION_LIBRARY_SOURCE_INVALID',403)
 await authorizePrivateTool(tx,{principal:{userId:actorId,accountDomain:'SCHOOL'},entry,organizationId:scoped.organizationId})
 const {version,definition}=await readPrivateScaleVersionIdentity(tx,versionId)
 const expected=prepareRelease(privateScaleMeasurementInput(version,definition))
 if(release.key!==expected.key||release.version!==expected.version||release.hashScheme!==expected.hashScheme
  ||release.contentHash!==expected.contentHash||release.sourceReleaseId!==expected.sourceReleaseId
  ||canonicalHash(release.scope)!==canonicalHash(expected.scope)||canonicalHash(release.provenance)!==canonicalHash(expected.provenance)
  ||canonicalHash(release.assetRefs)!==canonicalHash(expected.assetRefs))fail('EDUCATION_LIBRARY_SOURCE_IDENTITY_MISMATCH')
 const snapshot:LibrarySnapshot={title:version.title,product:entry,instrumentClass:'CUSTOM_DESCRIPTIVE',definition,
  compiledDefinition:definition,snapshotOrigin:'APPLICATION_CAPTURE',definitionHash:canonicalHash(definition),
  educationSource:{toolId:version.toolId,versionId:version.id,entry,organizationId:version.organizationId,contentHash:version.contentHash}}
 return {sourceId:version.toolId,snapshot}
}
