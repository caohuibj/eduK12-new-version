import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPublicSourceKey} from './public-source.identity'
import {materialSchema} from '../assessment-media/material'
import {educationApplicabilitySchema} from '../scale-library-governance/education-applicability'
import type {FormDraft} from '../assessment-core/form/definition'
import {educationCompositionAdministrationForEntry} from './private-tool.composition-contracts'

/** One explicitly selected immutable leaf only. No saved draft/latest lookup,
 * whole-questionnaire preview, runtime materialization or writable public copy. */
export async function readEducationPublicFormPreview(c:PrivateToolContext,versionId:string,contentHash:string,responseMode:unknown='SELF'){
 const administration=educationCompositionAdministrationForEntry(c.entry,responseMode)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const key=educationPublicSourceKey({kind:'FORM',id:versionId,hash:contentHash})
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{title:string;definition:FormDraft;instruction:string|null;applicability:unknown}>>(Prisma.sql`
   SELECT title,snapshot#>'{unit,displayDefinition}' AS definition,snapshot#>>'{unit,instruction}' AS instruction,
    snapshot#>'{reference,metadata,annotations,educationApplicability}' AS applicability
   FROM survey_governed_tools WHERE id=${versionId} AND family='FORM' AND state='ONLINE' AND snapshot_hash=${contentHash}`)
  if(!row)privateToolFail('PUBLIC_FORM_SOURCE_UNAVAILABLE',404)
  const declared=educationApplicabilitySchema.safeParse(row.applicability)
  if(!declared.success)privateToolFail('PUBLIC_FORM_APPLICABILITY_REQUIRED',400)
  if(!declared.data.administrations.some(a=>a.population===administration.population&&a.responseMode===administration.responseMode))privateToolFail('PUBLIC_FORM_VARIANT_UNSUPPORTED',400)
  // Original approval + immutable source guard bind this fixed display body.
  // Preview does not run the full compiler/hash/media pass owned by freeze.
  return {id:versionId,kind:'FORM' as const,title:row.title,contentHash,definition:row.definition,
   ...(row.instruction?{instruction:row.instruction}:{}),previewOnly:true,canEditOriginal:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

/** Only this exact source's pinned, publisher-shared asset. Read its tiny
 * identity in SQL; a media GET never downloads/rehashes a complete Form body. */
export async function readEducationPublicFormPreviewAsset(c:PrivateToolContext,versionId:string,contentHash:string,assetId:string){
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const key=educationPublicSourceKey({kind:'FORM',id:versionId,hash:contentHash})
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{reference:unknown}>>(Prisma.sql`SELECT ref AS reference FROM survey_governed_tools t
   CROSS JOIN LATERAL jsonb_array_elements(t.snapshot#>'{unit,provenance,governedMedia,references}') ref
   WHERE t.id=${versionId} AND t.family='FORM' AND t.state='ONLINE' AND t.snapshot_hash=${contentHash} AND ref->>'assetId'=${assetId}
    AND EXISTS(SELECT 1 FROM asset_references pin WHERE pin.entity_type='SurveyGovernedTool' AND pin.entity_id=t.id AND pin.field='media' AND pin.asset_id=${assetId}) LIMIT 1`)
  if(!row)privateToolFail('PUBLIC_FORM_ASSET_NOT_FOUND',404)
  return materialSchema.shape.asset.parse(row.reference)
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

/** Fixed Standard display projection: items/options/instruction only. P/R and
 * scorer inputs remain internal; preview is never a freeze or use receipt. */
export async function readEducationPublicStandardPreview(c:PrivateToolContext,versionId:string,contentHash:string,responseMode:unknown='SELF'){
 const administration=educationCompositionAdministrationForEntry(c.entry,responseMode)
 const respondent=administration.responseMode==='SELF'?'SELF':administration.responseMode==='PARENT_REPORT'?'PARENT':'TEACHER'
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const key=educationPublicSourceKey({kind:'STANDARD_SCALE',id:versionId,hash:contentHash})
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{title:string;instruction:string|null;definition:unknown}>>(Prisma.sql`
   SELECT s.snapshot->>'title' AS title,s.snapshot#>>'{parts,CONTENT,reference,metadata,instruction,text}' AS instruction,
    jsonb_build_object('items',(SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('itemCode',q->>'itemCode','content',q->>'content',
      'type',q->>'type','required',q->'required','sortOrder',q->'sortOrder','responseSetKey',q->>'responseSetKey',
      'images',q->'images','materials',q->'materials','video',q->'video')) ORDER BY ordinal)
     FROM jsonb_array_elements(s.snapshot#>'{definition,items}') WITH ORDINALITY questions(q,ordinal)),
     'responseSets',(SELECT jsonb_agg(jsonb_build_object('key',rs->>'key','options',(SELECT jsonb_agg(jsonb_build_object('value',opt->'value','label',opt->>'label') ORDER BY ordinal)
       FROM jsonb_array_elements(rs->'options') WITH ORDINALITY options(opt,ordinal)))) FROM jsonb_array_elements(s.snapshot#>'{definition,responseSets}') rs)) AS definition
   FROM survey_standard_releases s JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
   WHERE s.id=${versionId} AND s.combination_hash=${contentHash} AND s.state='ONLINE' AND m.status='PUBLISHED'
    AND m.content_hash=s.measurement_release->>'contentHash' AND s.snapshot#>'{parts,CONTENT,reference,metadata,applicability,respondentTypes}' ? ${respondent}`)
  if(!row)privateToolFail('PUBLIC_STANDARD_SOURCE_UNAVAILABLE',404)
  return {id:versionId,kind:'SCALE' as const,title:row.title,contentHash,definition:row.definition,
   ...(row.instruction?{instruction:row.instruction}:{}),previewOnly:true,canEditOriginal:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

export async function readEducationPublicStandardPreviewAsset(c:PrivateToolContext,versionId:string,contentHash:string,assetId:string){
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const key=educationPublicSourceKey({kind:'STANDARD_SCALE',id:versionId,hash:contentHash})
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  const [row]=await tx.$queryRaw<Array<{reference:unknown}>>(Prisma.sql`SELECT jsonb_build_object('assetId',ref->>'assetId',
   'contentHash',ref->>'sha256','mimeType',ref->>'mediaType') AS reference FROM survey_standard_releases s
   JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
   CROSS JOIN LATERAL jsonb_array_elements(m.asset_refs) ref
   WHERE s.id=${versionId} AND s.combination_hash=${contentHash} AND s.state='ONLINE' AND m.status='PUBLISHED'
    AND m.content_hash=s.measurement_release->>'contentHash' AND ref->>'assetId'=${assetId} LIMIT 1`)
  if(!row)privateToolFail('PUBLIC_STANDARD_ASSET_NOT_FOUND',404)
  return materialSchema.shape.asset.parse(row.reference)
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
