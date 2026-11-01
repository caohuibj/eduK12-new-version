import {standardNativeScaleJoin} from '../scale/component-import/native-source'
import {requiredScaleContextKeys} from '../scale/policy/context-preflight'
import {Prisma} from '@prisma/client'
import type {EducationPublicSource} from './public-source.identity'
import {educationPublicSourceKey} from './public-source.identity'

export type EducationPublicSourceHeader={
 key:string;kind:EducationPublicSource['kind'];id:string;hash:string;title:string;language:string|null
 versions:{content:string;parameters:string|null;report:string|null;profiles?:Array<'experience'|'standard'|'research'>;profile?:'experience'|'standard'|'research';measurementHash?:string};applicability:unknown;educationApplicability?:unknown;expertApplicability?:unknown;nativeRespondentType?:string|null;referenceContextKeys:string[];nativeAvailable:boolean
}
export const educationStandardHeaderColumns=Prisma.sql`'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash AS key,'STANDARD_SCALE' AS kind,s.id,s.combination_hash AS hash,s.snapshot->>'title' AS title,
 COALESCE(s.snapshot#>>'{parts,CONTENT,reference,metadata,executable,contentLocale}',s.snapshot#>>'{definition,versionAxes,locale}',s.snapshot#>>'{parts,CONTENT,reference,metadata,instruction,language}') AS language,s.snapshot#>'{parts,CONTENT,reference,metadata,applicability}' AS applicability,
 s.snapshot#>'{parts,CONTENT,reference,metadata,educationExpertApplicability}' AS "expertApplicability",
 s.snapshot#>'{parts,CONTENT,reference,metadata,educationApplicability}' AS "educationApplicability",
 s.snapshot#>>'{definition,respondentType}' AS "nativeRespondentType",
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
 t.reference#>>'{metadata,annotations,language}' AS language,t.snapshot#>'{reference,metadata,annotations,educationApplicability}' AS applicability,
 t.snapshot#>'{reference,metadata,annotations,educationExpertApplicability}' AS "expertApplicability",NULL::jsonb AS "educationApplicability",NULL::text AS "nativeRespondentType",ARRAY[]::text[] AS "referenceContextKeys",true AS "nativeAvailable",
 jsonb_build_object('content',t.snapshot#>>'{unit,ref,sourceVersion}','parameters',NULL,'report',NULL) AS versions`
export const educationCognitiveHeaderColumns=Prisma.sql`'education-source:COGNITIVE_CONFIG:'||c.id||':'||m.content_hash AS key,'COGNITIVE_CONFIG' AS kind,c.id,m.content_hash AS hash,c.name AS title,
 'und'::text AS language,NULL::jsonb AS applicability,NULL::jsonb AS "expertApplicability",NULL::jsonb AS "educationApplicability",'participant_self_report'::text AS "nativeRespondentType",
 ARRAY[]::text[] AS "referenceContextKeys",true AS "nativeAvailable",jsonb_build_object('content',c.config_version,'parameters',NULL,'report',NULL,
  'profiles',ARRAY(SELECT jsonb_object_keys(m.content#>'{executable,profiles}'))) AS versions`
// Approved profile headers only. No artifact decryption or live profile merge.
export const educationCognitiveProfileHeaderColumns=Prisma.sql`'education-source:COGNITIVE_PROFILE:'||c.id||':'||p.fingerprint AS key,'COGNITIVE_PROFILE' AS kind,c.id,p.fingerprint AS hash,
 c.name||' · '||CASE e.metadata#>>'{configuration,profile}' WHEN 'experience' THEN '体验配置' WHEN 'research' THEN '科研配置' ELSE '正式配置' END AS title,
 'und'::text AS language,NULL::jsonb AS applicability,NULL::jsonb AS "expertApplicability",NULL::jsonb AS "educationApplicability",'participant_self_report'::text AS "nativeRespondentType",
 ARRAY[]::text[] AS "referenceContextKeys",true AS "nativeAvailable",jsonb_build_object('content',c.config_version,'parameters',NULL,'report',e.metadata#>>'{configuration,reportDefinitionVersion}',
 'profile',e.metadata#>>'{configuration,profile}','measurementHash',m.content_hash) AS versions`
export const educationCognitiveProfileHeaderJoins=(product:string)=>Prisma.sql`JOIN survey_tool_policies p ON p.product=${product} AND p.resource_key LIKE 'cognitive-profile:%' AND p.decision='APPROVED' AND NOT p.paused
 JOIN LATERAL (SELECT metadata,resource_id FROM assessment_management_events approval WHERE approval.action='COGNITIVE_PROFILE_APPROVED'
  AND approval.metadata->>'artifactFormatVersion'='2' AND approval.metadata->>'artifactHash'=p.fingerprint
  AND p.resource_key='cognitive-profile:'||approval.resource_id||':'||(approval.metadata#>>'{configuration,profile}') ORDER BY approval.id LIMIT 1) e ON true
 JOIN cognitive_test_configs c ON c.id=e.resource_id AND c.status='PUBLISHED'
 JOIN measurement_content_releases m ON m.id=c.measurement_release_id AND m.id=e.metadata#>>'{configuration,measurement,releaseId}' AND m.content_hash=e.metadata#>>'{configuration,measurement,contentHash}'
  AND m.family='COGNITIVE' AND m.layer='MEASUREMENT' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
 JOIN assessment_public_templates t ON t.template_hash=p.fingerprint AND t.template_kind='COGNITIVE_PROFILE_CONFIGURATION'`
// sjt_source is a bounded metadata UNION over the two native source tables;
// neither a Survey delivery nor an existing Training assignment is required.
export const educationSjtHeaderSources=(ids:Prisma.Sql|readonly string[])=>Prisma.sql`(
 SELECT id,instrument_key,instrument_version,measurement_release_id,COALESCE(package#>>'{definition,source,title}',instrument_key) AS title,package#>>'{definition,respondentType}' AS respondent
 FROM sjt_author_releases WHERE id=ANY(${ids}::text[]) AND status='PUBLISHED' AND (authorization_policy IS NULL OR authorization_policy='COURSE_GRANT_V1')
 UNION ALL SELECT id,instrument_key,instrument_version,measurement_release_id,instrument_key AS title,NULL::text AS respondent
 FROM static_sjt_measurement_mappings WHERE id=ANY(${ids}::text[]) AND measurement_release_id IS NOT NULL AND deployment_hash IS NOT NULL) sjt_source`
export const educationSjtHeaderColumns=Prisma.sql`'education-source:SJT_RELEASE:'||sjt_source.id||':'||m.content_hash AS key,'SJT_RELEASE' AS kind,sjt_source.id,m.content_hash AS hash,sjt_source.title,
 'und'::text AS language,NULL::jsonb AS applicability,NULL::jsonb AS "expertApplicability",NULL::jsonb AS "educationApplicability",COALESCE(sjt_source.respondent,m.content#>>'{executable,respondentType}') AS "nativeRespondentType",
 ARRAY[]::text[] AS "referenceContextKeys",true AS "nativeAvailable",jsonb_build_object('content',sjt_source.instrument_version,'parameters',NULL,'report',NULL) AS versions`
/** Bounded discovery/action metadata. The source guards make approved contents
 * immutable; no source body/hash/compiler or runtime object is needed here.
 * Use SHARE for a new-use write so withdrawal serializes through its real row. */
export async function readEducationPublicSourceHeaders(tx:Prisma.TransactionClient,sources:readonly EducationPublicSource[],lock=false,product?:'SCHOOL'|'TEACHER'){
 const byKey=new Map(sources.map(source=>[educationPublicSourceKey(source),source]))
 const standard=[...byKey.values()].filter(s=>s.kind==='STANDARD_SCALE'),forms=[...byKey.values()].filter(s=>s.kind==='FORM')
 const rows:EducationPublicSourceHeader[]=[]
 if(standard.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`
  SELECT ${educationStandardHeaderColumns}
  FROM survey_standard_releases s JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
  LEFT JOIN scales native ON ${standardNativeScaleJoin('native','s')} AND native.status='PUBLISHED' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
  WHERE (s.id,s.combination_hash) IN (${Prisma.join(standard.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND s.state='ONLINE' AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
   AND m.content_hash=s.measurement_release->>'contentHash' ORDER BY s.id ${lock?Prisma.sql`FOR SHARE OF s,m`:Prisma.empty}`))
 if(forms.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`
  SELECT ${educationFormHeaderColumns}
  FROM survey_governed_tools t WHERE (t.id,t.snapshot_hash) IN (${Prisma.join(forms.map(s=>Prisma.sql`(${s.id},${s.hash})`))})
   AND t.family='FORM' AND t.state='ONLINE' ORDER BY t.id ${lock?Prisma.sql`FOR SHARE OF t`:Prisma.empty}`))
 const exactProfiles=[...byKey.values()].filter(source=>source.kind==='COGNITIVE_PROFILE')
 if(exactProfiles.length&&product)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`SELECT ${educationCognitiveProfileHeaderColumns} FROM (SELECT 1) anchor ${educationCognitiveProfileHeaderJoins(product)} WHERE (c.id,p.fingerprint) IN (${Prisma.join(exactProfiles.map(source=>Prisma.sql`(${source.id},${source.hash})`))}) ORDER BY c.id,p.fingerprint ${lock?Prisma.sql`FOR SHARE OF c,m,p,t`:Prisma.empty}`))
 const cognitive=[...byKey.values()].filter(source=>source.kind==='COGNITIVE_CONFIG'),sjt=[...byKey.values()].filter(source=>source.kind==='SJT_RELEASE')
 if(cognitive.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`SELECT ${educationCognitiveHeaderColumns}
  FROM cognitive_test_configs c JOIN measurement_content_releases m ON m.id=c.measurement_release_id
  WHERE (c.id,m.content_hash) IN (${Prisma.join(cognitive.map(source=>Prisma.sql`(${source.id},${source.hash})`))})
   AND c.status='PUBLISHED' AND m.layer='MEASUREMENT' AND m.family='COGNITIVE' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
  ORDER BY c.id ${lock?Prisma.sql`FOR SHARE OF c,m`:Prisma.empty}`))
 if(sjt.length&&lock){
  const ids=sjt.map(source=>source.id)
  await tx.$queryRaw(Prisma.sql`SELECT draft.id FROM sjt_author_drafts draft JOIN sjt_author_releases author ON author.source_draft_id=draft.id WHERE author.id=ANY(${ids}::text[]) ORDER BY draft.id FOR SHARE OF draft`)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sjt_author_releases WHERE id=ANY(${ids}::text[]) ORDER BY id FOR SHARE`)
  // Writers that require source advisory locks prelock mappings before Users.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM static_sjt_measurement_mappings WHERE id=ANY(${ids}::text[]) ORDER BY id FOR SHARE`)
 }
 if(sjt.length)rows.push(...await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`SELECT ${educationSjtHeaderColumns}
  FROM ${educationSjtHeaderSources(sjt.map(source=>source.id))} JOIN measurement_content_releases m ON m.id=sjt_source.measurement_release_id
  WHERE (sjt_source.id,m.content_hash) IN (${Prisma.join(sjt.map(source=>Prisma.sql`(${source.id},${source.hash})`))})
   AND m.layer='MEASUREMENT' AND m.family='SJT' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
  ORDER BY sjt_source.id ${lock?Prisma.sql`FOR SHARE OF m`:Prisma.empty}`))
 return new Map(rows.map(row=>[row.key,row]))
}

export function educationPublicRequiredContextKeys(header:EducationPublicSourceHeader){
 if(header.kind!=='STANDARD_SCALE'||!header.applicability)return []
 return requiredScaleContextKeys(header.applicability as Parameters<typeof requiredScaleContextKeys>[0])
}
