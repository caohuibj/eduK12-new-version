import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {validateScaleProductDefinition} from '../scale/product-definition-readiness'
import {assertLibraryMediaReady} from '../scale-library-governance/media'
import {readFrozenEducationApplicability} from '../scale-library-governance/education-applicability'
import type {LibrarySnapshot} from '../scale-library-governance/source'
import {educationLibrarySourceSchema,type EducationLibrarySource,type PrivateCompositionDefinition} from './private-tool.composition-contracts'
import {privateToolFail} from './private-tool.contracts'

type Measurement=Extract<StoredRelease,{layer:'MEASUREMENT'}>
type Source={entryId:string;releaseId:string;authorId:string;snapshotHash:string;snapshot:LibrarySnapshot;dependencyIds:string[]}
export type EducationLibraryLeaf={row:Source;measurement:Measurement;definition:ScaleDefinitionV2;descriptor:EducationLibrarySource}

/** Original approved entry, not the legacy registered single-Scale resource.
 * Current receiver U/issuer locks precede this content-only bounded read. Full
 * C/presentation/native report/media correspondence is established once here;
 * the immutable seal, not a receipt supplied by a client, carries it forward. */
export async function readEducationLibrarySources(tx:Prisma.TransactionClient,sources:readonly {versionId:string;contentHash:string}[],administration:PrivateCompositionDefinition['administration']){
 const ids=[...new Set(sources.map(source=>source.versionId))],result=new Map<string,EducationLibraryLeaf>()
 if(!ids.length)return result
 const rows=await tx.$queryRaw<Source[]>(Prisma.sql`SELECT e.id AS "entryId",e.release_id AS "releaseId",s.author_id AS "authorId",
  s.snapshot_hash AS "snapshotHash",s.snapshot,s.dependency_release_ids AS "dependencyIds"
  FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id
  WHERE e.id IN (${Prisma.join(ids)}) AND e.status='ACTIVE' AND s.status='APPROVED' ORDER BY e.id FOR SHARE OF e,s`)
 const releases=await getContentReleaseBatch(tx,rows.map(row=>row.releaseId),true)
 for(const selected of sources){
  const row=rows.find(row=>row.entryId===selected.versionId&&row.snapshotHash===selected.contentHash)
  if(!row||canonicalHash(row.snapshot)!==selected.contentHash)privateToolFail('LIBRARY_SOURCE_UNAVAILABLE',404)
  if(result.has(row.entryId))continue
  const measurement=releases.get(row.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!=='SCALE'||measurement.status!=='PUBLISHED'
   ||measurement.scope.kind!=='PRIVATE'||measurement.scope.ownerId!==row.authorId||measurement.scope.product!==row.snapshot.product)
   privateToolFail('LIBRARY_SOURCE_MEASUREMENT_INVALID')
  const applicability=readFrozenEducationApplicability(row.snapshot)
  if(!applicability?.variants.some(variant=>variant.population===administration.population&&variant.responseMode===administration.responseMode))
   privateToolFail('LIBRARY_SOURCE_VARIANT_UNSUPPORTED',400)
  const checked=validateScaleProductDefinition(row.snapshot.compiledDefinition,'CUSTOM_DESCRIPTIVE')
  if(!checked.valid||!checked.definition)privateToolFail('LIBRARY_SOURCE_DEFINITION_INVALID')
  const definition=checked.definition
  // Preserve the existing native/external-P boundary until its exact adapter
  // lands. Never drop approved P/R or silently change a declared native policy.
  if(row.dependencyIds.length||definition.referencePolicy.type!=='none')privateToolFail('LIBRARY_SOURCE_DEPENDENCY_ADAPTER_PENDING',409)
  const mode=educationLibrarySourceSchema.shape.presentationMode.parse((measurement.content.executable as Record<string,unknown>).presentationMode)
  const expected=scaleMeasurementRelease({localId:'approved-library-content',version:measurement.version,
   instrumentVersion:measurement.content.instrumentVersion,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:measurement.scope,presentationMode:mode})
  if(canonicalHash(expected.content)!==canonicalHash(measurement.content)||canonicalHash(expected.assetRefs)!==canonicalHash(measurement.assetRefs))
   privateToolFail('LIBRARY_SOURCE_MEASUREMENT_INVALID')
  if(!row.snapshot.mediaManifest)privateToolFail('LIBRARY_SOURCE_MEDIA_UNAVAILABLE')
  await assertLibraryMediaReady(tx,row.entryId,row.snapshot.mediaManifest)
  result.set(row.entryId,{row,definition,measurement,descriptor:educationLibrarySourceSchema.parse({entryId:row.entryId,
   approvedSnapshotHash:row.snapshotHash,nativeDefinitionHash:canonicalHash(definition),presentationMode:mode,reportMode:'NATIVE'})})
 }
 return result
}

/** One shared native identity per approved entry, matching both existing
 * materializers' advisory key. No new private source or per-user leaf Composite. */
export async function materializeEducationLibraryScale(tx:Prisma.TransactionClient,leaf:EducationLibraryLeaf):Promise<Scale>{
 const {row,definition,measurement}=leaf
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'library-wrapper:'+row.entryId}))`)
 let scale=await tx.scale.findUnique({where:{libraryEntryId:row.entryId}})
 if(!scale)scale=await tx.scale.create({data:{code:'library:'+row.entryId,name:row.snapshot.title,description:'平台共用库精确版本，只读使用',
  status:'PUBLISHED',visibility:'COURSE',creatorId:row.authorId,instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:measurement.content.instrumentVersion,
  definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),itemCount:definition.items.length,
  dimensionCount:definition.scoring.scores.length,measurementReleaseId:measurement.releaseId,libraryEntryId:row.entryId}})
 if(scale.code!=='library:'+row.entryId||scale.creatorId!==row.authorId||scale.libraryEntryId!==row.entryId||scale.instrumentClass!=='CUSTOM_DESCRIPTIVE'
  ||scale.status!=='PUBLISHED'||scale.visibility!=='COURSE'||scale.instrumentVersion!==measurement.content.instrumentVersion
  ||scale.measurementReleaseId!==measurement.releaseId||scale.definitionHash!==hashScaleDefinition(definition)||canonicalHash(scale.definition)!==canonicalHash(definition))
  privateToolFail('LIBRARY_SOURCE_SCALE_INVALID')
 return scale
}
