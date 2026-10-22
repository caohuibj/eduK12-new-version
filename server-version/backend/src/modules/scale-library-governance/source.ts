import {educationSubmissionSource} from './education-source'
import type {FrozenEducationApplicability} from './education-applicability'
import type {LibraryMediaManifest} from './media'
import {Prisma} from '@prisma/client'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {scaleMeasurementRelease,scopedScaleKey} from '../measurement-content/scale'
import {hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compileResearchScale} from '../survey/builder.compiler'
import {assertSurveyDraft} from '../survey/builder.definition'
import {fail,librarySourceProduct,type LibrarySourceProduct} from './contracts'
export type LibrarySnapshot=FrozenEducationApplicability & {title:string;product:LibrarySourceProduct;instrumentClass:'CUSTOM_DESCRIPTIVE';definition:unknown;compiledDefinition:ScaleDefinitionV2;snapshotOrigin?:'PUBLISHED_PROVENANCE'|'APPLICATION_CAPTURE';definitionHash?:string;mediaManifest?:LibraryMediaManifest;educationSource?:{toolId:string;versionId:string;entry:'SCHOOL'|'TEACHER';organizationId:string;contentHash:string}}
export async function submissionSource(tx:Prisma.TransactionClient,actorId:string,product:LibrarySourceProduct,releaseId:string){
  librarySourceProduct.parse(product)
  const release=await getContentRelease(tx,releaseId,true)
  if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status!=='PUBLISHED'||release.scope.kind!=='PRIVATE'||
    release.scope.ownerId!==actorId||release.scope.product!==product)fail('只能提交本人独立编制的精确已发布量表版本',403)
  let sourceId=release.key.split(':').slice(-1)[0]
  const stored=release.provenance.authoringSnapshot as Partial<LibrarySnapshot>|undefined
  let snapshot:LibrarySnapshot
  if(product==='TRAINING'){
    const [row]=await tx.$queryRaw<Array<{name:string;definition:ScaleDefinitionV2;definition_hash:string;instrument_class:string;instrument_version:string;measurement_release_id:string}>>(Prisma.sql`
      SELECT name,definition,definition_hash,instrument_class::text,instrument_version,measurement_release_id FROM scales
      WHERE id=${sourceId} AND creator_id=${actorId} AND status='PUBLISHED' FOR SHARE`)
    if(!row||row.instrument_class!=='CUSTOM_DESCRIPTIVE'||row.measurement_release_id!==releaseId||hashScaleDefinition(row.definition)!==row.definition_hash)
      fail('量表来源与已发布版本不一致')
    const expected=prepareRelease(scaleMeasurementRelease({localId:sourceId,version:release.version,instrumentVersion:row.instrument_version,
      definition:row.definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:release.scope}))
    if(expected.contentHash!==release.contentHash)fail('量表来源与已发布版本不一致')
    // This is an explicit new application snapshot, not a rewrite/backfill of the
    // old release. The published Training definition is verified above.
    snapshot={title:stored?.title??row.name,product,instrumentClass:'CUSTOM_DESCRIPTIVE',definition:stored?.definition??row.definition,
      compiledDefinition:(stored?.definition??row.definition) as ScaleDefinitionV2}
    if(canonicalHash(snapshot.compiledDefinition)!==canonicalHash(row.definition))fail('量表不可变编制快照不一致')
  }else if(product==='SURVEY'){
    if(!stored||stored.product!=='SURVEY'||stored.instrumentClass!=='CUSTOM_DESCRIPTIVE'||!stored.definition||!stored.title)
      fail('SCALE_LIBRARY_EXPLICIT_NEW_PUBLICATION_REQUIRED')
    const definition=assertSurveyDraft('SCALE',stored.definition,true)
    const compiled=compileResearchScale(stored.title,definition)
    snapshot={title:stored.title,product,instrumentClass:'CUSTOM_DESCRIPTIVE',definition,compiledDefinition:compiled}
    const expected=prepareRelease(scaleMeasurementRelease({localId:sourceId,version:release.version,
      instrumentVersion:release.content.instrumentVersion,definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:release.scope,
      presentationMode:(definition as {presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'}).presentationMode??'ALL_AT_ONCE'}))
    if(expected.contentHash!==release.contentHash)fail('量表不可变编制快照不一致')
    if(release.provenance.authoringSource==='SURVEY_TOOL_TEMPLATE'){
      // Only the server's standalone publication path emits this namespace.
      // Historic snapshots are checked against their immutable release, not today's draft.
      if(release.scope.resourceId!==sourceId||release.key!==scopedScaleKey(release.scope,sourceId))fail('工具发布来源不一致',403)
      const [tool]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_tool_templates WHERE id=${sourceId} AND owner_user_id=${actorId} AND kind='SCALE' FOR SHARE`)
      if(!tool)fail('无权提交该工具集量表',403)
    }else{
      const [project]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM survey_projects WHERE id=${release.scope.resourceId} AND owner_user_id=${actorId} FOR SHARE`)
      if(!project)fail('无权提交该研究项目量表',403)
    }
  }else if(product==='SCHOOL'||product==='TEACHER'){
    const education=await educationSubmissionSource(tx,actorId,product,release)
    sourceId=education.sourceId;snapshot=education.snapshot
  }else fail('SCALE_LIBRARY_SOURCE_ADAPTER_NOT_READY',409)
  snapshot.snapshotOrigin=stored?'PUBLISHED_PROVENANCE':'APPLICATION_CAPTURE'
  snapshot.definitionHash=canonicalHash(snapshot.definition)
  if(snapshot.compiledDefinition.license.status!=='self_authored'||snapshot.compiledDefinition.license.redistribution!=='allowed')fail('SCALE_LIBRARY_REDISTRIBUTION_RIGHTS_REQUIRED',400)
  if(release.provenance.sourceMeasurementRelease||release.provenance.presentationOnly)fail('共用库授权仅可使用，不允许改编后重新入库',403)
  // Media are confirmed as an exact manifest by the submission service.
  return {release,sourceId,snapshot}
}
export async function validateLibraryDependencies(tx:Prisma.TransactionClient,actorId:string,measurement:StoredRelease,ids:string[]){
  const dependencies:StoredRelease[]=[]
  for(const id of [...ids].sort()){
    const release=await getContentRelease(tx,id,true)
    if(!release||release.family!=='SCALE'||release.layer==='MEASUREMENT'||release.status!=='PUBLISHED'||release.scope.kind!=='PRIVATE'||release.scope.ownerId!==actorId)
      fail('依赖版本必须是本人有权共享的已发布参考或报告版本',403)
    const bindings=release.layer==='REFERENCE'?[release.content.measurement]:release.content.measurements
    if(bindings.length!==1||bindings[0].releaseId!==measurement.releaseId||bindings[0].contentHash!==measurement.contentHash)
      fail('参考和报告必须绑定申请中的精确量表版本')
    dependencies.push(release)
  }
  return dependencies
}
