import {Prisma,type PrismaClient} from '@prisma/client'
import {z} from 'zod'
import {AdminPermissionError} from '../admin-permissions/service'
import {eligibleStandards} from '../measurement-content/eligible-standard'
import {educationCognitiveProfileHeaderJoins} from '../education-tools/public-source.headers'
import {trainingGovernedDirectoryFilter} from '../questionnaire-product/training-governed-definition'
import {toolLicenseKeySchema,toolLicenseProductSchema,type ToolLicenseProduct,type ToolLicenseFamily} from './contracts'

type Db=PrismaClient|Prisma.TransactionClient
export type LicenseSubject={id:string;label:string;description?:string}
export type LicenseToolFamily=ToolLicenseFamily
export type LicenseTool={key:string;name:string;family:LicenseToolFamily}
const productSchema=toolLicenseProductSchema
const pageSchema=z.object({q:z.string().trim().max(160).default(''),page:z.number().int().min(1).max(10000).default(1)}).strict()
const subjectId=z.string().guid()
const toolPageSchema=pageSchema.extend({key:toolLicenseKeySchema.optional()})
const PAGE_SIZE=25
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{
 const result=schema.safeParse(raw)
 if(!result.success)throw new AdminPermissionError(400,'工具授权目录参数无效')
 return result.data
}

/** Metadata only. The caller must enforce system administration; a directory
 * row never supplies entry administration, exact use or private-data access. */
function subjects(product:ToolLicenseProduct,ids?:readonly string[],lock=false){
 const scoped=ids?Prisma.sql`AND o.id=ANY(${ids}::text[]) ORDER BY o.id`:Prisma.empty
 if(product==='SCHOOL'||product==='TEACHER')return Prisma.sql`
  SELECT o.id,o.name AS label,${product==='SCHOOL'?'School 已开通学校':'Teacher 已开通学校'}::text AS description
  FROM organizations o JOIN education_product_entitlements e ON e.organization_id=o.id
    AND e.product=${product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'} AND e.status='ACTIVE'
  WHERE o.product_domain='SCHOOL' AND o.status='ACTIVE'
  ${scoped} ${lock?Prisma.sql`FOR SHARE OF o,e`:Prisma.empty}`
 const qualification=product==='TRAINING'
  ?Prisma.sql`u.account_domain IN ('TRAINING','LEGACY') AND u.role='TEACHER' AND u.teacher_approved`
  :Prisma.sql`u.account_domain='SURVEY' AND g.status='ACTIVE' AND m.enabled`
 const accounts=Prisma.sql`
  SELECT u.id,CASE WHEN NULLIF(btrim(u.nickname),'') IS NULL THEN u.username
   ELSE u.nickname||'（'||u.username||'）' END AS label,u.username AS description,u.expires_at
  FROM users u ${product==='SURVEY'?Prisma.sql`JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_mfa_credentials m ON m.user_id=u.id`:Prisma.empty}
  WHERE ${qualification} AND u.platform_role='STANDARD' AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
  ${ids?Prisma.sql`AND u.id=ANY(${ids}::text[]) ORDER BY u.id`:Prisma.empty}
  ${!lock?Prisma.empty:product==='SURVEY'?Prisma.sql`FOR SHARE OF u,g,m`:Prisma.sql`FOR SHARE OF u`}`
 // Read the clock after the row locks are acquired.
 return Prisma.sql`WITH accounts AS ${lock?Prisma.sql`MATERIALIZED`:Prisma.empty} (${accounts})
  SELECT id,label,description FROM accounts WHERE expires_at IS NULL OR expires_at>clock_timestamp()`
}

export async function eligibleBatchSubjects(db:Db,product:ToolLicenseProduct,ids:readonly string[],lock:boolean){
 const rows=await db.$queryRaw<LicenseSubject[]>(subjects(product,ids,lock))
 return new Map(rows.map(row=>[row.id,row]))
}

export async function listLicenseSubjects(db:Db,rawProduct:ToolLicenseProduct,raw:{q?:string;page?:number}={}){
 const product=parse(productSchema,rawProduct),input=parse(pageSchema,raw)
 const rows=await db.$queryRaw<LicenseSubject[]>(Prisma.sql`WITH eligible AS (${subjects(product)})
  SELECT id,label,description FROM eligible WHERE ${input.q}='' OR strpos(lower(label),lower(${input.q}))>0 OR strpos(lower(id),lower(${input.q}))>0
  ORDER BY label COLLATE "C",id LIMIT ${PAGE_SIZE+1} OFFSET ${(input.page-1)*PAGE_SIZE}`)
 return {list:rows.slice(0,PAGE_SIZE),hasMore:rows.length>PAGE_SIZE}
}
export async function requireLicenseSubject(db:Db,rawProduct:ToolLicenseProduct,rawId:string){
 const product=parse(productSchema,rawProduct),id=parse(subjectId,rawId)
 const [row]=await db.$queryRaw<LicenseSubject[]>(subjects(product,[id],true))
 if(!row)throw new AdminPermissionError(403,'授权对象当前资格或对应产品开通状态不可用')
 return row
}

const prefixed=(family:Prisma.Sql,key:Prisma.Sql)=>Prisma.sql`CASE WHEN ${key} LIKE ${family}||':%' THEN ${key} ELSE ${family}||':'||${key} END`
const approved=(product:ToolLicenseProduct,resource:Prisma.Sql,hash:Prisma.Sql)=>Prisma.sql`EXISTS(
 SELECT 1 FROM survey_tool_policies policy WHERE policy.product=${product} AND policy.resource_key=${resource}
  AND policy.fingerprint=${hash} AND policy.decision='APPROVED' AND NOT policy.paused)`
const releaseNotStopped=(release:Prisma.Sql)=>Prisma.sql`NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop
 WHERE stop.target_kind='RELEASE' AND stop.target_id=${release})`

/** Stable commercial identities, not exact release IDs. No private drafts or
 * source bodies leave this bounded projection. Consumers still validate their
 * exact versions, distributions and runtime prerequisites at publication/start.
 * Each entrance advertises only supported, approved execution sources. */
function tools(product:ToolLicenseProduct){
 const education=product==='SCHOOL'||product==='TEACHER'
 const sources:Prisma.Sql[]=[Prisma.sql`
  SELECT 'SCALE:'||s.tool_key AS key,COALESCE(NULLIF(s.snapshot->>'title',''),s.tool_key) AS name,'SCALE'::text AS family
  ${eligibleStandards(product)}`]

 // Exact approved profiles are the common public cognitive source. Survey's
 // metadata readiness mirrors its existing catalog, rather than counting an
 // approved but unadapted media/reference profile as a publishable candidate.
 sources.push(Prisma.sql`SELECT 'COGNITIVE:'||c.test_type AS key,c.name AS name,'COGNITIVE'::text AS family
  FROM (SELECT 1) anchor ${educationCognitiveProfileHeaderJoins(product)}
  WHERE ${releaseNotStopped(Prisma.sql`m.id`)}
   ${product==='SURVEY'?Prisma.sql`AND c.test_type IN ('reaction','gonogo')
    AND m.content#>'{executable,presentation}'='null'::jsonb
    AND e.metadata#>>'{executionRequirements,hasPresentation}'='false'
    AND e.metadata#>>'{executionRequirements,referenceCount}'='0'`:Prisma.empty}`)

 if(product==='SURVEY')sources.push(Prisma.sql`
  SELECT ${prefixed(Prisma.sql`t.family`,Prisma.sql`t.tool_key`)} AS key,t.title AS name,t.family
  FROM survey_governed_tools t WHERE t.state='ONLINE' AND t.family IN ('SCALE','FORM','COGNITIVE','SJT','COMBINATION','BUNDLE')
   AND ${approved(product,Prisma.sql`'governed-release:'||t.id`,Prisma.sql`t.snapshot_hash`)}
   AND (t.family IN ('FORM','COMBINATION','BUNDLE') OR EXISTS(SELECT 1 FROM measurement_content_releases m
    WHERE m.id=t.measurement_release->>'releaseId' AND m.content_hash=t.measurement_release->>'contentHash'
     AND m.layer='MEASUREMENT' AND m.status='PUBLISHED' AND ${releaseNotStopped(Prisma.sql`m.id`)}))`)

 if(product==='TRAINING')sources.push(Prisma.sql`
  SELECT ${prefixed(Prisma.sql`t.family`,Prisma.sql`t.tool_key`)} AS key,t.title AS name,t.family
  FROM survey_governed_tools t WHERE ${trainingGovernedDirectoryFilter()}`)

 if(education)sources.push(Prisma.sql`
  SELECT ${prefixed(Prisma.sql`'FORM'`,Prisma.sql`t.tool_key`)} AS key,t.title AS name,'FORM'::text AS family
  FROM survey_governed_tools t WHERE t.family='FORM' AND t.state='ONLINE'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.snapshot#>'{reference,metadata,annotations,educationApplicability,administrations}')='array'
    THEN t.snapshot#>'{reference,metadata,annotations,educationApplicability,administrations}' ELSE '[]'::jsonb END) administration
    WHERE administration->>'population'=${product==='SCHOOL'?'STUDENT':'TEACHER'}
     AND administration->>'responseMode' IN (${Prisma.join(product==='SCHOOL'?['SELF','PARENT_REPORT','TEACHER_REPORT']:['SELF','STUDENT_REPORT'])}))`)

 // Public native SJT sources retain their real publication/measurement policy;
 // private authors' versions are deliberately absent from a system-wide picker.
 if(product!=='SURVEY')sources.push(Prisma.sql`
  SELECT 'SJT:'||source.instrument_key AS key,source.title AS name,'SJT'::text AS family FROM (
   SELECT r.instrument_key,COALESCE(r.package#>>'{definition,source,title}',r.instrument_key) AS title,r.measurement_release_id,
    r.package#>>'{definition,respondentType}' AS respondent FROM sjt_author_releases r
    WHERE r.status='PUBLISHED' AND (r.authorization_policy IS NULL OR r.authorization_policy='COURSE_GRANT_V1')
   UNION ALL SELECT mapping.instrument_key,mapping.instrument_key,mapping.measurement_release_id,NULL::text
    FROM static_sjt_measurement_mappings mapping WHERE mapping.measurement_release_id IS NOT NULL AND mapping.deployment_hash IS NOT NULL
  ) source JOIN measurement_content_releases m ON m.id=source.measurement_release_id
  WHERE m.family='SJT' AND m.layer='MEASUREMENT' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
   AND ${releaseNotStopped(Prisma.sql`m.id`)}
   ${education?Prisma.sql`AND COALESCE(source.respondent,m.content#>>'{executable,respondentType}') IN ('participant_self_report',${product==='SCHOOL'?'student_self_report':'teacher_self_report'})`:Prisma.empty}`)

 // Library approval is a different identity from standard C/P/R. Its immutable
 // scoped content_key is stable across versions; it never aliases a release UUID.
 sources.push(Prisma.sql`
  SELECT ${prefixed(Prisma.sql`'SCALE'`,Prisma.sql`m.content_key`)} AS key,COALESCE(submission.metadata->>'title',submission.snapshot->>'title',m.content_key) AS name,'SCALE'::text AS family
  FROM scale_library_entries entry JOIN scale_library_submissions submission ON submission.id=entry.submission_id
   JOIN measurement_content_releases m ON m.id=entry.release_id
  WHERE entry.status='ACTIVE' AND submission.status='APPROVED' AND m.family='SCALE' AND m.layer='MEASUREMENT' AND m.status='PUBLISHED'
   AND ${releaseNotStopped(Prisma.sql`m.id`)}
   ${education?Prisma.sql`AND submission.dependency_release_ids=ARRAY[]::text[]
    AND submission.snapshot#>>'{compiledDefinition,referencePolicy,type}'='none'
    AND submission.snapshot->>'educationApplicabilityCompilerVersion'='EDUCATION_APPLICABILITY_V1'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(submission.snapshot#>'{educationApplicability,administrations}')='array'
     THEN submission.snapshot#>'{educationApplicability,administrations}' ELSE '[]'::jsonb END) administration
     WHERE administration->>'population'=${product==='SCHOOL'?'STUDENT':'TEACHER'}
      AND administration->>'responseMode' IN (${Prisma.join(product==='SCHOOL'?['SELF','PARENT_REPORT','TEACHER_REPORT']:['SELF'])}))`
    :Prisma.sql`AND ${approved(product,Prisma.sql`'release:'||m.id`,Prisma.sql`m.content_hash`)}`}`)

 // Native published bundles have a genuine Training/education execution adapter;
 // governed education COMBINATION/BUNDLE headers only permit preview.
 if(product!=='SURVEY'&&(education||process.env.BUNDLE_PRODUCTS_ENABLED==='true'))sources.push(Prisma.sql`
  SELECT ${prefixed(Prisma.sql`'BUNDLE'`,Prisma.sql`bundle."bundleKey"`)} AS key,bundle.content#>>'{manifest,definition,name}' AS name,'BUNDLE'::text AS family
  FROM bundle_package_releases bundle WHERE bundle.status='PUBLISHED'
   AND bundle.content#>'{manifest,definition,respondentTypes}'='["SELF"]'::jsonb
   AND (bundle.content#>'{manifest,definition,initiationModes}' ? 'TEACHER_ASSIGNMENT'
    ${product==='TEACHER'?Prisma.empty:Prisma.sql`OR bundle.content#>'{manifest,definition,initiationModes}' ? ${product==='SCHOOL'?'STUDENT_COURSE':'ANONYMOUS_SELF'}`})
   ${product==='TEACHER'?Prisma.sql`AND COALESCE(bundle.content#>>'{manifest,definition,population,subjectPopulation}','')<>'youth'`:Prisma.empty}`)
 return Prisma.join(sources,' UNION ALL ')
}

export function licenseToolDirectorySql(product:ToolLicenseProduct){
 return Prisma.sql`SELECT key,min(name COLLATE "C") AS name,family FROM (${tools(product)}) candidates
  WHERE key IS NOT NULL AND NULLIF(btrim(name),'') IS NOT NULL GROUP BY key,family`
}

async function toolRows(db:Db,product:ToolLicenseProduct,condition:Prisma.Sql,limit:number,offset=0){
 return db.$queryRaw<LicenseTool[]>(Prisma.sql`SELECT key,name,family FROM (${licenseToolDirectorySql(product)}) eligible
  WHERE ${condition} ORDER BY key COLLATE "C" LIMIT ${limit} OFFSET ${offset}`)
}
export async function listLicenseTools(db:Db,rawProduct:ToolLicenseProduct,raw:{q?:string;page?:number;key?:string}={}){
 const product=parse(productSchema,rawProduct),input=parse(toolPageSchema,raw)
 const condition=input.key?Prisma.sql`key=${input.key}`:Prisma.sql`${input.q}='' OR strpos(lower(name),lower(${input.q}))>0 OR strpos(lower(key),lower(${input.q}))>0`
 const rows=await toolRows(db,product,condition,PAGE_SIZE+1,(input.page-1)*PAGE_SIZE)
 return {list:rows.slice(0,PAGE_SIZE),hasMore:rows.length>PAGE_SIZE}
}
export async function listCurrentLicenseSet(db:Db,product:ToolLicenseProduct){
 const max=2000
 const list=await toolRows(db,product,Prisma.sql`TRUE`,max+1)
 if(list.length>max)throw new AdminPermissionError(409,'当前入口工具超过 2000 项，请按工具范围分批选择')
 return {list}
}
export async function requireLicenseTools(db:Db,rawProduct:ToolLicenseProduct,rawKeys:readonly string[]){
 const product=parse(productSchema,rawProduct),keys=parse(z.array(toolLicenseKeySchema).min(1).max(128).refine(value=>new Set(value).size===value.length),rawKeys)
 const rows=await toolRows(db,product,Prisma.sql`key=ANY(${keys}::text[])`,keys.length)
 const found=new Map(rows.map(row=>[row.key,row]))
 if(found.size!==keys.length)throw new AdminPermissionError(403,'所选工具当前未准入、已撤下或该入口没有可用执行来源')
 return keys.map(key=>found.get(key)!)
}
