import {requiredScaleContextKeys} from '../scale/policy/context-preflight'
import {Prisma} from '@prisma/client'
import type {EducationPublicSource} from './public-source.identity'
import {educationPublicSourceKey} from './public-source.identity'

export type EducationPublicSourceHeader={
 key:string;kind:EducationPublicSource['kind'];id:string;hash:string;title:string;language:string|null
 versions:{content:string;parameters:string|null;report:string|null};applicability:unknown;referenceContextKeys:string[];nativeAvailable:boolean
}
export const educationStandardHeaderColumns=Prisma.sql`'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash AS key,'STANDARD_SCALE' AS kind,s.id,s.combination_hash AS hash,s.snapshot->>'title' AS title,
 s.snapshot#>>'{parts,CONTENT,reference,metadata,executable,contentLocale}' AS language,s.snapshot#>'{parts,CONTENT,reference,metadata,applicability}' AS applicability,
 ARRAY_REMOVE(ARRAY[
  CASE WHEN jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.ageBand') OR jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.minAgeMonthsInclusive') OR jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.maxAgeMonthsExclusive') THEN 'birthYearMonth' END,
  CASE WHEN jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.sexScope') OR jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.sexAtBirth') THEN 'sexAtBirth' END,
  CASE WHEN jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.gradeLevels') THEN 'gradeLevel' END,
  CASE WHEN jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.language') OR jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.primaryLanguages') THEN 'primaryLanguage' END,
  CASE WHEN jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.countryOrRegion') OR jsonb_path_exists(s.snapshot,'$.references[*].entries[*].population.match.countriesOrRegions') THEN 'countryOrRegion' END
 ],NULL) AS "referenceContextKeys",native.id IS NOT NULL AS "nativeAvailable",

 jsonb_build_object('content',s.snapshot#>>'{parts,CONTENT,version}',
  'parameters',CASE WHEN s.snapshot#>'{parts,PARAMETERS,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,PARAMETERS,version}' END,
  'report',CASE WHEN s.snapshot#>'{parts,REPORT,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,REPORT,version}' END) AS versions`
export const educationFormHeaderColumns=Prisma.sql`'education-source:FORM:'||t.id||':'||t.snapshot_hash AS key,'FORM' AS kind,t.id,t.snapshot_hash AS hash,t.title,
 t.reference#>>'{metadata,annotations,language}' AS language,t.snapshot#>'{reference,metadata,annotations,educationApplicability}' AS applicability,ARRAY[]::text[] AS "referenceContextKeys",true AS "nativeAvailable",
 jsonb_build_object('content',t.snapshot#>>'{unit,ref,sourceVersion}','parameters',NULL,'report',NULL) AS versions`
/** Bounded discovery/action metadata. The source guards make approved contents
 * immutable; no source body/hash/compiler or runtime object is needed here.
 * Use SHARE for a new-use write so withdrawal serializes through its real row. */
export async function readEducationPublicSourceHeaders(tx:Prisma.TransactionClient,sources:readonly EducationPublicSource[],lock=false){
 const byKey=new Map(sources.map(source=>[educationPublicSourceKey(source),source]))
 const standard=[...byKey.values()].filter(s=>s.kind==='STANDARD_SCALE'),forms=[...byKey.values()].filter(s=>s.kind==='FORM')
 const rows:EducationPublicSourceHeader[]=[]
 if(standard.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`
  SELECT ${educationStandardHeaderColumns}
  FROM survey_standard_releases s JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
  LEFT JOIN scales native ON native.code=s.snapshot->>'toolKey' AND native.instrument_version=s.snapshot->>'instrumentVersion' AND native.status='PUBLISHED' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
  WHERE (s.id,s.combination_hash) IN (${Prisma.join(standard.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND s.state='ONLINE' AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
   AND m.content_hash=s.measurement_release->>'contentHash' ORDER BY s.id ${lock?Prisma.sql`FOR SHARE OF s,m`:Prisma.empty}`))
 if(forms.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`
  SELECT ${educationFormHeaderColumns}
  FROM survey_governed_tools t WHERE (t.id,t.snapshot_hash) IN (${Prisma.join(forms.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND t.family='FORM' AND t.state='ONLINE' ORDER BY t.id ${lock?Prisma.sql`FOR SHARE OF t`:Prisma.empty}`))
 return new Map(rows.map(row=>[row.key,row]))
}

export function educationPublicRequiredContextKeys(header:EducationPublicSourceHeader){
 if(header.kind!=='STANDARD_SCALE'||!header.applicability)return []
 return requiredScaleContextKeys(header.applicability as Parameters<typeof requiredScaleContextKeys>[0])
}
