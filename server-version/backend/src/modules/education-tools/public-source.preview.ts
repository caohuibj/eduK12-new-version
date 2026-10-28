import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPublicSourceKey} from './public-source.identity'
import {materialSchema} from '../assessment-media/material'
import {educationApplicabilitySchema} from '../scale-library-governance/education-applicability'
import type {FormDraft} from '../assessment-core/form/definition'

/** One explicitly selected immutable leaf only. No saved draft/latest lookup,
 * whole-questionnaire preview, runtime materialization or writable public copy. */
export async function readEducationPublicFormPreview(c:PrivateToolContext,versionId:string,contentHash:string){
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
  if(!declared.data.administrations.some(a=>a.population===(c.entry==='SCHOOL'?'STUDENT':'TEACHER')&&a.responseMode==='SELF'))privateToolFail('PUBLIC_FORM_VARIANT_UNSUPPORTED',400)
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
