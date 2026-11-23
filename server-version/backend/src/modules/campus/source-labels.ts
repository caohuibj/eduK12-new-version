import {Prisma} from '@prisma/client'

type Source={organizationId:string;key:string;family?:string}
type Label={title:string;versionLabel:string;metricLabels:Record<string,string>}
const families:Record<string,string>={SCALE:'量表',FORM:'表单',BUNDLE:'组合测评',COGNITIVE:'认知任务',SITUATIONAL:'情境任务'}
const fixed=(key:string)=>{
 const match=/^(?:private-(scale|form):SCHOOL:|education-(composition):SCHOOL:|education-private-(scale|form):)([0-9a-f-]{36})(?::|$)/i.exec(key)
 return match?{id:match[4],kind:(match[1]??match[2]??match[3]).toUpperCase()}:null
}
export const campusSourceLabelKey=(source:Pick<Source,'organizationId'|'key'>)=>source.organizationId+'\0'+source.key
/** Presentation only, after the caller's task/report authorization. Read exact
 * immutable versions; never current drafts, respondent identities or answers. */
export async function readCampusSourceLabels(db:Pick<Prisma.TransactionClient,'$queryRaw'>,sources:Source[]){
 const refs=sources.map(source=>({...source,fixed:fixed(source.key)}))
 const ids=[...new Set(refs.flatMap(row=>row.fixed?[row.fixed.id]:[]))]
 const organizations=[...new Set(sources.map(row=>row.organizationId))]
 const rows=ids.length?await db.$queryRaw<Array<{id:string;organizationId:string;kind:string;title:string;revision:number;scores:Prisma.JsonValue}>>(Prisma.sql`
  SELECT id,organization_id AS "organizationId",kind,title,source_revision AS revision,definition#>'{scoring,scores}' AS scores
  FROM education_private_tool_versions WHERE entry='SCHOOL'
   AND id IN (${Prisma.join(ids)}) AND organization_id IN (${Prisma.join(organizations)})`):[]
 return new Map(refs.map(row=>{
  const version=rows.find(v=>v.id===row.fixed?.id&&v.organizationId===row.organizationId&&v.kind===row.fixed?.kind)
  const scores=(Array.isArray(version?.scores)?version.scores:[]) as Array<{key?:string;label?:string}>
  const label:Label={title:version?.title??families[row.family??'']??'测评工具',versionLabel:version?'修订 '+version.revision:'固定版本',
   metricLabels:Object.fromEntries(scores.filter(s=>typeof s.key==='string'&&typeof s.label==='string').map(s=>[s.key!,s.label!]))}
  return [campusSourceLabelKey(row),label]
 }))
}
