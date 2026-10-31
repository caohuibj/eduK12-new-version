import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {createCodeBundleDefinitionProvider} from '../bundle-product/code-catalog'
import {type EducationPackageReference,educationPackageKey} from './package-reference.contracts'

export type EducationPackageHeader={key:string;provider:EducationPackageReference['provider'];id:string;hash:string;title:string;toolKey:string;toolVersion:string;
 family:'NATIVE_BUNDLE'|'BUNDLE'|'COMBINATION';memberCount:number;reportVersion:string|null;educationApplicability:unknown;
 nativeRespondentTypes:string[]|null;nativeInitiationModes:string[]|null;population:unknown}
const codeProvider=createCodeBundleDefinitionProvider()
// Immutable code metadata is indexed once at process initialization. This is
// content identity, never a cached author, grant or admission permission.
const codePackages=new Map(codeProvider.list().filter(entry=>!entry.declarativePackage).map(entry=>{
 const d=entry.definition,hash=canonicalHash(entry),source:EducationPackageReference={provider:'CODE_BUNDLE',bundleKey:d.bundleKey,bundleVersion:d.bundleVersion,contentHash:hash}
 return [educationPackageKey(source),{entry,header:{key:educationPackageKey(source),provider:'CODE_BUNDLE' as const,id:d.bundleKey+'@'+d.bundleVersion,hash,title:d.name,
  toolKey:d.bundleKey,toolVersion:d.bundleVersion,family:'NATIVE_BUNDLE' as const,memberCount:d.slots.length,reportVersion:d.reportDefinitionVersion,
  educationApplicability:null,nativeRespondentTypes:d.respondentTypes,nativeInitiationModes:d.initiationModes,population:d.population}}] as const
}))
export function readPublishedCodePackage(source:Extract<EducationPackageReference,{provider:'CODE_BUNDLE'}>){
 const known=codePackages.get(educationPackageKey(source))
 return known?.entry.definition.status==='PUBLISHED'&&codeProvider.publicationBlockers(source.bundleKey,source.bundleVersion).length===0?structuredClone(known.entry):null
}
export const educationCodePackageHeaders=[...codePackages.values()].filter(known=>known.entry.definition.status==='PUBLISHED'
 &&codeProvider.publicationBlockers(known.header.toolKey,known.header.toolVersion).length===0).map(known=>known.header)
export const educationNativePackageHeaderColumns=Prisma.sql`'education-package:NATIVE_RELEASE:'||p.id||':'||p."contentHash" AS key,'NATIVE_RELEASE' AS provider,p.id,p."contentHash" AS hash,
 p.content#>>'{manifest,definition,name}' AS title,p."bundleKey" AS "toolKey",p."bundleVersion" AS "toolVersion",'NATIVE_BUNDLE' AS family,
 jsonb_array_length(p.content#>'{manifest,definition,slots}') AS "memberCount",p.content#>>'{report,version}' AS "reportVersion",NULL::jsonb AS "educationApplicability",
 ARRAY(SELECT jsonb_array_elements_text(p.content#>'{manifest,definition,respondentTypes}')) AS "nativeRespondentTypes",
 ARRAY(SELECT jsonb_array_elements_text(p.content#>'{manifest,definition,initiationModes}')) AS "nativeInitiationModes",p.content#>'{manifest,definition,population}' AS population`
export const educationGovernedPackageHeaderColumns=Prisma.sql`'education-package:GOVERNED_PACKAGE:'||t.id||':'||t.snapshot_hash AS key,'GOVERNED_PACKAGE' AS provider,t.id,t.snapshot_hash AS hash,
 t.title,t.tool_key AS "toolKey",t.tool_version AS "toolVersion",t.family,
 jsonb_array_length(t.snapshot->'components') AS "memberCount",t.snapshot#>>'{packageReport,version}' AS "reportVersion",
 t.snapshot#>'{reference,metadata,annotations,educationApplicability}' AS "educationApplicability",NULL::text[] AS "nativeRespondentTypes",NULL::text[] AS "nativeInitiationModes",NULL::jsonb AS population`

/** Bounded exact source metadata only. Issuance/preview do not confer source
 * publishing rights. Body/engine/dependency validation belongs to consumption. */
export async function readEducationPackageHeaders(tx:Prisma.TransactionClient,sources:readonly EducationPackageReference[],lock=false){
 const unique=new Map(sources.map(source=>[educationPackageKey(source),source])),rows:EducationPackageHeader[]=[]
 const native=[...unique.values()].filter(s=>s.provider==='NATIVE_RELEASE'),governed=[...unique.values()].filter(s=>s.provider==='GOVERNED_PACKAGE')
 if(native.length)rows.push(...await tx.$queryRaw<EducationPackageHeader[]>(Prisma.sql`SELECT ${educationNativePackageHeaderColumns}
  FROM bundle_package_releases p WHERE (p.id,p."contentHash") IN (${Prisma.join(native.map(s=>Prisma.sql`(${s.versionId},${s.contentHash})`))})
   AND p.status='PUBLISHED' ORDER BY p.id ${lock?Prisma.sql`FOR SHARE OF p`:Prisma.empty}`))
 if(governed.length)rows.push(...await tx.$queryRaw<EducationPackageHeader[]>(Prisma.sql`SELECT ${educationGovernedPackageHeaderColumns}
  FROM survey_governed_tools t WHERE (t.id,t.snapshot_hash) IN (${Prisma.join(governed.map(s=>Prisma.sql`(${s.versionId},${s.contentHash})`))})
   AND t.family IN ('BUNDLE','COMBINATION') AND t.state='ONLINE' ORDER BY t.id ${lock?Prisma.sql`FOR SHARE OF t`:Prisma.empty}`))
 for(const source of unique.values())if(source.provider==='CODE_BUNDLE'){
  const known=codePackages.get(educationPackageKey(source));if(known&&educationCodePackageHeaders.includes(known.header))rows.push(structuredClone(known.header))
 }
 return new Map(rows.map(row=>[row.key,row]))
}
