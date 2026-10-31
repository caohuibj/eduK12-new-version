import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {materialSchema} from '../assessment-media/material'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationLibrarySourceUses} from './library-source.catalog'
import {educationPublicScaleDisplaySql} from './public-source.scale-display'
import {educationCompositionAdministrationForEntry} from './private-tool.composition-contracts'
import {readFrozenExpertApplicability,supportsExpertSource,isNativeExpertObserver,type FrozenExpertApplicability} from './expert-observation.contract'

/** One selected approved leaf only. Current author + original U precede body
 * access; fixed content is read-only and never projected as a private editor. */
export async function readEducationLibraryScalePreview(c:PrivateToolContext,versionId:string,contentHash:string,responseMode:unknown='SELF',targetKind?:unknown){
 const administration=educationCompositionAdministrationForEntry(c.entry,responseMode,targetKind)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  if(!(await readEducationLibrarySourceUses(tx,c,[versionId])).has(versionId))privateToolFail('LIBRARY_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{title:string;instruction:string|null;definition:unknown;expert?:FrozenExpertApplicability;nativeRespondentType?:string}>>(Prisma.sql`SELECT s.snapshot->>'title' AS title,
   s.snapshot->>'instruction' AS instruction,${educationPublicScaleDisplaySql(Prisma.sql`s.snapshot->'compiledDefinition'`)} AS definition,
   s.snapshot#>>'{compiledDefinition,respondentType}' AS "nativeRespondentType",jsonb_strip_nulls(jsonb_build_object('educationExpertApplicability',s.snapshot->'educationExpertApplicability',
    'educationExpertApplicabilityHash',s.snapshot->'educationExpertApplicabilityHash','educationExpertApplicabilityCompilerVersion',s.snapshot->'educationExpertApplicabilityCompilerVersion')) AS expert
   FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
   JOIN measurement_content_releases m ON m.id=e.release_id AND m.status='PUBLISHED'
   WHERE e.id=${versionId} AND e.status='ACTIVE' AND s.snapshot_hash=${contentHash}
    AND (${administration.responseMode}='EXPERT_REPORT' OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.snapshot#>'{educationApplicability,administrations}') a
     WHERE a->>'population'=${administration.population} AND a->>'responseMode'=${administration.responseMode}))`)
  if(!row)privateToolFail('LIBRARY_SOURCE_UNAVAILABLE',404)
  if(administration.responseMode==='EXPERT_REPORT'&&(administration.targetKind!=='PERSON'||!isNativeExpertObserver(row.nativeRespondentType)
   ||!supportsExpertSource(readFrozenExpertApplicability(row.expert??{})?.declaration,administration)))privateToolFail('LIBRARY_SOURCE_EXPERT_DECLARATION_REQUIRED',400)
  return {id:versionId,kind:'SCALE' as const,title:row.title,contentHash,definition:row.definition,
   ...(row.instruction?{instruction:row.instruction}:{}),previewOnly:true,canEditOriginal:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

/** Tiny approved stimulus identity + actual shared retention. Report assets are
 * excluded by the M membership, and no whole source is rehashed for media GET. */
export async function readEducationLibraryPreviewAsset(c:PrivateToolContext,versionId:string,contentHash:string,assetId:string){
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  if(!(await readEducationLibrarySourceUses(tx,c,[versionId])).has(versionId))privateToolFail('LIBRARY_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{reference:unknown}>>(Prisma.sql`SELECT jsonb_build_object('assetId',ref->>'assetId','contentHash',ref->>'sha256','mimeType',ref->>'mediaType') AS reference
   FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id AND s.status='APPROVED'
   JOIN measurement_content_releases m ON m.id=e.release_id AND m.status='PUBLISHED'
   CROSS JOIN LATERAL jsonb_array_elements(m.asset_refs) ref
   JOIN scale_library_media media ON media.entry_id=e.id AND media.asset_id=ref->>'assetId' AND media.state='READY'
    AND media.manifest_hash=s.snapshot#>>'{mediaManifest,manifestHash}'
   WHERE e.id=${versionId} AND e.status='ACTIVE' AND s.snapshot_hash=${contentHash} AND ref->>'assetId'=${assetId}
    AND EXISTS(SELECT 1 FROM asset_references pin WHERE pin.entity_type='ScaleLibraryMedia' AND pin.entity_id=e.id AND pin.field='media' AND pin.asset_id=${assetId}) LIMIT 1`)
  if(!row)privateToolFail('LIBRARY_SOURCE_ASSET_NOT_FOUND',404)
  return materialSchema.shape.asset.parse(row.reference)
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
