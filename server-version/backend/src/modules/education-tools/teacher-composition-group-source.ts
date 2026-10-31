import {Prisma} from '@prisma/client'
import type {EducationPublicSourceHeader} from './public-source.headers'

/** Called only inside existing Teacher product-administrator authoring and
 * exact source-use validation. This is a deliberate new aggregate version,
 * matching the native publisher's explicit per-unit GROUP selection; it is
 * never inferred when reading an old personal version. Library/standard
 * sources keep their separate approved aggregate contract lifecycle. */
export function teacherCompositionGroupChoice(version:{id:string;title:string;contentHash:string},source:{
 provider:string;kind:string;metricKeys:string[];license?:{status:string;redistribution:string}|null
}){
 const original=source.provider==='PRIVATE_VERSION'&&source.kind==='SCALE'
  &&source.license?.status==='self_authored'&&source.license.redistribution==='allowed'
 const native=source.provider==='COGNITIVE_CONFIG'&&source.kind==='COGNITIVE'
  ||source.provider==='SJT_RELEASE'&&source.kind==='SJT'
 const keys=[...new Set(source.metricKeys)]
 if(!original&&!native||!keys.length)return null
 return {versionId:version.id,contentHash:version.contentHash,title:version.title,minimumRespondents:10,
  metrics:keys.map(key=>({key,label:key})),audiences:{PROFESSIONAL:[] as string[],TEACHER:[] as string[],ORGANIZATION:keys}}
}

/** Metadata for this already authorized composition reference set only.
 * Questions, trials, scores and report prose are never selected. Freeze still
 * validates the actual protocol/profile through the existing native compiler. */
export async function readTeacherCompositionNativeGroupChoices(tx:Prisma.TransactionClient,headers:ReadonlyArray<EducationPublicSourceHeader>){
 const native=headers.filter(h=>['COGNITIVE_CONFIG','COGNITIVE_PROFILE','SJT_RELEASE'].includes(h.kind))
 const hashes=[...new Set(native.map(h=>h.versions.measurementHash??h.hash))]
 const result=new Map<string,NonNullable<ReturnType<typeof teacherCompositionGroupChoice>>>()
 if(!hashes.length)return result
 const rows=await tx.$queryRaw<Array<{hash:string;family:string;metricKeys:string[]}>>(Prisma.sql`
  SELECT content_hash AS hash,family,ARRAY(SELECT m->>'metricKey' FROM jsonb_array_elements(content->'metrics') m) AS "metricKeys"
  FROM measurement_content_releases WHERE content_hash=ANY(${hashes}::text[]) AND layer='MEASUREMENT'
   AND family IN ('COGNITIVE','SJT') AND status='PUBLISHED' AND scope->>'kind'='PLATFORM'`)
 for(const header of native){
  const kind=header.kind==='SJT_RELEASE'?'SJT':'COGNITIVE'
  const row=rows.find(row=>row.hash===(header.versions.measurementHash??header.hash)&&row.family===kind)
  const choice=row?teacherCompositionGroupChoice({id:header.id,title:header.title,contentHash:header.hash},
   {provider:kind==='SJT'?'SJT_RELEASE':'COGNITIVE_CONFIG',kind,metricKeys:row.metricKeys}):null
  if(choice)result.set(header.key,choice)
 }
 return result
}
