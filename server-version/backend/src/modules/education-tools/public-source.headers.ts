import {Prisma} from '@prisma/client'
import type {EducationPublicSource} from './public-source.identity'
import {educationPublicSourceKey} from './public-source.identity'

export type EducationPublicSourceHeader={
 key:string;kind:EducationPublicSource['kind'];id:string;hash:string;title:string;language:string|null
 versions:{content:string;parameters:string|null;report:string|null};applicability:unknown
}
export const educationStandardHeaderColumns=Prisma.sql`'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash AS key,'STANDARD_SCALE' AS kind,s.id,s.combination_hash AS hash,s.snapshot->>'title' AS title,
 s.snapshot#>>'{parts,CONTENT,reference,metadata,executable,contentLocale}' AS language,NULL::jsonb AS applicability,
 jsonb_build_object('content',s.snapshot#>>'{parts,CONTENT,version}',
  'parameters',CASE WHEN s.snapshot#>'{parts,PARAMETERS,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,PARAMETERS,version}' END,
  'report',CASE WHEN s.snapshot#>'{parts,REPORT,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,REPORT,version}' END) AS versions`
export const educationFormHeaderColumns=Prisma.sql`'education-source:FORM:'||t.id||':'||t.snapshot_hash AS key,'FORM' AS kind,t.id,t.snapshot_hash AS hash,t.title,
 t.reference#>>'{metadata,annotations,language}' AS language,t.snapshot#>'{reference,metadata,annotations,educationApplicability}' AS applicability,
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
  WHERE (s.id,s.combination_hash) IN (${Prisma.join(standard.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND s.state='ONLINE' AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
   AND m.content_hash=s.measurement_release->>'contentHash' ORDER BY s.id ${lock?Prisma.sql`FOR SHARE OF s,m`:Prisma.empty}`))
 if(forms.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`
  SELECT ${educationFormHeaderColumns}
  FROM survey_governed_tools t WHERE (t.id,t.snapshot_hash) IN (${Prisma.join(forms.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND t.family='FORM' AND t.state='ONLINE' ORDER BY t.id ${lock?Prisma.sql`FOR SHARE OF t`:Prisma.empty}`))
 return new Map(rows.map(row=>[row.key,row]))
}
