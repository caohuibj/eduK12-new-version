import {Prisma} from '@prisma/client'
import type {EducationPublicSourceHeader} from './public-source.headers'
import {canonicalHash} from '../assessment-runtime/canonical'
import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import type {CompositionGroupPolicyPointer} from './school-private-group-selection'

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

/** Reuse an actual independently approved library GROUP version. Catalog
 * defaults to the newest published approval; choosing it freezes its exact
 * pointer. Freeze/publication/history never substitute a newer version. */
export async function readTeacherCompositionLibraryGroupChoices(tx:Prisma.TransactionClient,sources:ReadonlyArray<{
 blockId?:string;versionId:string;contentHash:string;groupPolicy?:CompositionGroupPolicyPointer
}>,purpose:'CATALOG'|'NEW_USE'|'HISTORY'='CATALOG'){
 const result=new Map<string,{versionId:string;contentHash:string;title:string;minimumRespondents:number;
  metrics:Array<{key:string;label:string}>;audiences:{PROFESSIONAL:string[];TEACHER:string[];ORGANIZATION:string[]};groupPolicy:CompositionGroupPolicyPointer}>()
 const selected=purpose==='CATALOG'?sources:sources.filter(source=>source.groupPolicy)
 if(!selected.length)return result
 const {educationLibraryOriginSchema,educationLibraryResourceKey}=await import('../scale-library-governance/education-runtime-entry')
 const keys=[...new Set(selected.map(source=>'library-scale:'+source.versionId+':TEACHER:TEACHER:SELF:GROUP'))]
 type Row={key:string;version:string;entry:any;hash:string}
 const rows=purpose==='CATALOG'?await tx.$queryRaw<Row[]>(Prisma.sql`
  SELECT DISTINCT ON (r.resource_key) r.resource_key AS key,r.resource_version AS version,r.entry,r.entry_hash AS hash
  FROM registered_assessment_resources r WHERE r.resource_key=ANY(${keys}::text[]) AND r.status='PUBLISHED'
  ORDER BY r.resource_key,r.created_at DESC,r.id DESC`):[]
 // Request-local immutable content reuse, not an actor/authority cache. The
 // existing reader owns approval/C validation and its source-row lock once.
 const resolved=new Map<string,Row>()
 for(const source of selected){
  const key='library-scale:'+source.versionId+':TEACHER:TEACHER:SELF:GROUP'
  let row:Row|undefined
  if(purpose==='CATALOG')row=rows.find(row=>row.key===key&&isSelfGroupV2Entry(row.entry))
  else{
   const pointer=source.groupPolicy!
   if(pointer.resourceKey!==key)continue
   const identity=key+':'+pointer.resourceVersion
   row=resolved.get(identity)
   if(!row){
    const {readEducationLibraryRegisteredSource}=await import('../scale-library-governance/education-runtime-resources')
    const approved=await readEducationLibraryRegisteredSource(tx,{product:'TEACHER',resourceKey:key,resourceVersion:pointer.resourceVersion,purpose})
    row={key,version:pointer.resourceVersion,entry:approved.resourceEntry,hash:canonicalHash(approved.resourceEntry)}
    resolved.set(identity,row)
   }
   if(row.hash!==pointer.entryHash)continue
  }
  if(!row)continue
  const parsed=educationLibraryOriginSchema.safeParse(row.entry.libraryOrigin)
  if(!parsed.success)continue
  const origin=parsed.data,rule=row.entry.resultDisclosure.audiences.ORGANIZATION
  if(origin.product!=='TEACHER'||origin.variantKey!=='TEACHER:SELF'||origin.entryId!==source.versionId
   ||origin.approvedSnapshotHash!==source.contentHash||origin.adapterVersion!==row.version
   ||educationLibraryResourceKey(origin)!==row.key||!rule.mode.includes('AGGREGATE'))continue
  const metricKeys:string[]=rule.metricKeys
  if(!metricKeys.length)continue
  result.set(source.blockId??source.versionId,{versionId:source.versionId,contentHash:source.contentHash,
   title:row.entry.title+' · 政策 '+row.version,minimumRespondents:Math.max(10,row.entry.resultDisclosure.minimumRespondents),
   metrics:metricKeys.map(key=>({key,label:key})),audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:[...metricKeys]},
   groupPolicy:{resourceKey:row.key,resourceVersion:row.version,entryHash:row.hash}})
 }
 return result
}
