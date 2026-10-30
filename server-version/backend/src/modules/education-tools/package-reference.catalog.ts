import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import type {PrivateToolContext} from './private-tool.contracts'
import {educationPackageKey,parseEducationPackageKey,supportsGovernedPackageSelf} from './package-reference.contracts'
import {educationCodePackageHeaders,educationNativePackageHeaderColumns,educationGovernedPackageHeaderColumns,type EducationPackageHeader} from './package-reference.headers'
import type {AdminSessionProof} from '../admin-permissions/proof'

export const educationPackageCatalogQuery=z.object({cursor:z.string().max(240).refine(value=>parseEducationPackageKey(value)!==null).optional(),q:z.string().trim().max(160).optional()}).strict()
export function nativePackageSupportsEntry(definition:{respondentTypes:readonly string[];initiationModes:readonly string[];population:unknown},entry:'SCHOOL'|'TEACHER'){
 return definition.respondentTypes.length===1&&definition.respondentTypes[0]==='SELF'
  &&definition.initiationModes.some(mode=>mode==='TEACHER_ASSIGNMENT'||entry==='SCHOOL'&&mode==='STUDENT_COURSE')
  &&!(entry==='TEACHER'&&(definition.population as {subjectPopulation?:string}|null)?.subjectPopulation==='youth')
}
export function packageHeaderSupportsEntry(header:EducationPackageHeader,entry:'SCHOOL'|'TEACHER'){
 return header.provider==='GOVERNED_PACKAGE'?supportsGovernedPackageSelf(header.educationApplicability,entry):
  nativePackageSupportsEntry({respondentTypes:header.nativeRespondentTypes??[],initiationModes:header.nativeInitiationModes??[],population:header.population},entry)
}
export function educationPackageHeaderView(header:EducationPackageHeader,entry:'SCHOOL'|'TEACHER'){
 const sourceRef=parseEducationPackageKey(header.key)!
 return {sourceRef,catalogKey:educationPackageKey(sourceRef),title:header.title,kind:'PACKAGE_REFERENCE' as const,sourceProvider:header.provider,
  family:header.family,toolKey:header.toolKey,contentVersion:header.toolVersion,reportVersion:header.reportVersion,memberCount:header.memberCount,
  population:header.population,allowedActions:packageHeaderSupportsEntry(header,entry)?['PREVIEW_WHOLE_PACKAGE',...(header.family==='NATIVE_BUNDLE'?['REGISTER_WHOLE_PACKAGE']:[])]:[],
  ...(!packageHeaderSupportsEntry(header,entry)?{unavailableReason:'该固定整包未声明适用于当前对象的本人作答。'}:{}),
  canEditOriginal:false as const,canSplit:false as const,canMix:false as const}
}
/** One current author check and one bounded authorized metadata query. No
 * executable bodies, report content, native compiler or per-card full hashes.
 */
export async function listEducationPackageSources(c:PrivateToolContext,raw:unknown){
 const input=educationPackageCatalogQuery.parse(raw)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const rows=await tx.$queryRaw<EducationPackageHeader[]>(Prisma.sql`WITH authorized_keys AS (
   SELECT DISTINCT k.key FROM content_capability_grants g CROSS JOIN LATERAL unnest(g.resource_keys) k(key)
   WHERE g.subject_id=${c.principal.userId} AND g.product=${c.entry} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${c.organizationId}
    AND g.resource_kind='material' AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL
    AND g.ancestry=ARRAY[g.id]::text[] AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[]
    AND g.revoked_at IS NULL AND g.valid_from<=statement_timestamp() AND g.expires_at>statement_timestamp()
  ), sources AS (
   SELECT ${educationNativePackageHeaderColumns} FROM authorized_keys k JOIN bundle_package_releases p
    ON k.key='education-package:NATIVE_RELEASE:'||p.id||':'||p."contentHash" WHERE p.status='PUBLISHED'
   UNION ALL
   SELECT ${educationGovernedPackageHeaderColumns} FROM authorized_keys k JOIN survey_governed_tools t
    ON k.key='education-package:GOVERNED_PACKAGE:'||t.id||':'||t.snapshot_hash WHERE t.state='ONLINE' AND t.family IN ('BUNDLE','COMBINATION')
   UNION ALL
   SELECT code.* FROM authorized_keys k JOIN jsonb_to_recordset(${JSON.stringify(educationCodePackageHeaders)}::jsonb) AS code(
    key text,provider text,id text,hash text,title text,"toolKey" text,"toolVersion" text,family text,"memberCount" integer,"reportVersion" text,
    "educationApplicability" jsonb,"nativeRespondentTypes" text[],"nativeInitiationModes" text[],population jsonb) ON code.key=k.key
  ) SELECT * FROM sources WHERE (${input.cursor??null}::text IS NULL OR key COLLATE "C">${input.cursor??null} COLLATE "C")
   AND (${input.q??''}='' OR strpos(lower(title),lower(${input.q??''}))>0) ORDER BY key COLLATE "C" LIMIT 41`)
  return {list:rows.slice(0,40).map(header=>educationPackageHeaderView(header,c.entry)),nextCursor:rows.length>40?rows[39].key:null}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}

/** Strong system management uses this metadata picker with the existing
 * content-grants issuer. Enumeration confers no tool or participant access. */
export async function listAdminEducationPackageSources(actorId:string,proof:AdminSessionProof,raw:unknown){
 const input=educationPackageCatalogQuery.extend({entry:z.enum(['SCHOOL','TEACHER'])}).parse(raw)
 return prisma.$transaction(async tx=>{
  const {lockCurrentContentSystemActor}=await import('../measurement-content/admin-authority.service')
  await lockCurrentContentSystemActor(tx,actorId,proof)
  const rows=await tx.$queryRaw<EducationPackageHeader[]>(Prisma.sql`SELECT ${educationNativePackageHeaderColumns}
   FROM bundle_package_releases p WHERE p.status='PUBLISHED'
    AND (${input.cursor??null}::text IS NULL OR 'education-package:NATIVE_RELEASE:'||p.id||':'||p."contentHash" COLLATE "C">${input.cursor??null} COLLATE "C")
    AND (${input.q??''}='' OR strpos(lower(p.content#>>'{manifest,definition,name}'),lower(${input.q??''}))>0)
   ORDER BY ('education-package:NATIVE_RELEASE:'||p.id||':'||p."contentHash") COLLATE "C" LIMIT 41`)
  return {list:rows.slice(0,40).map(header=>educationPackageHeaderView(header,input.entry)),nextCursor:rows.length>40?rows[39].key:null}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
