import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {educationCompositionOriginSchema} from './private-tool.composition-contracts'
import {readPrivateCompositionRunSources} from './private-tool.composition-source'
import {readPrivateScaleRuntimeResource} from './private-tool.runtime-resources'
import {privateToolFail} from './private-tool.contracts'

/** Internal exact-source adapter for the shared GROUP resolver. This confers
 * no report/actor right and never authorizes NEW_USE. The real report reader
 * must retain manager, source/leaf, cohort and current disclosure checks. */
export async function resolveSchoolPrivateGroupHistory(tx:Prisma.TransactionClient,ref:{
 resourceKind:string;resourceKey:string;resourceVersion:string;entryHash?:string
}){
 let entry
 if(ref.resourceKey.startsWith('private-scale:SCHOOL:')&&ref.resourceKind==='SCALE'&&ref.resourceVersion==='2.0.0'){
  const source=await readPrivateScaleRuntimeResource(tx,{key:ref.resourceKey,version:'2.0.0',purpose:'HISTORY'})
  if(source.origin.entry!=='SCHOOL'||source.origin.schemaVersion!==2)return null
  entry=source.resourceEntry
 }else if((ref.resourceKey.startsWith('education-composition:SCHOOL:')||ref.resourceKey.startsWith('education-composition:TEACHER:'))&&ref.resourceKind==='BUNDLE'&&ref.resourceVersion==='1.0.0'){
  const product=ref.resourceKey.startsWith('education-composition:TEACHER:')?'TEACHER':'SCHOOL'
  const [row]=await tx.$queryRaw<Array<{origin:unknown}>>(Prisma.sql`SELECT c.training_content_snapshot#>'{educationBinding,origin}' AS origin
   FROM composite_assessments c WHERE c.creation_key=${ref.resourceKey} AND c.status='PUBLISHED'
    AND EXISTS(SELECT 1 FROM education_private_tool_versions v WHERE v.id=c.training_content_snapshot#>>'{educationBinding,origin,versionId}'
     AND v.entry=${product} AND v.kind='COMPOSITION' AND v.definition->'groupReporting' IS NOT NULL AND v.definition->'groupReporting'<>'null'::jsonb)`)
  if(!row)return null
  const origin=educationCompositionOriginSchema.parse(row.origin)
  if(origin.entry!==product||origin.variantKey!==(product==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF'))return null
  const sources=await readPrivateCompositionRunSources(tx,{entry:product,organizationId:origin.organizationId,
   principal:{userId:origin.ownerUserId,accountDomain:'SCHOOL'}},[{family:ref.resourceKind,key:ref.resourceKey,version:ref.resourceVersion}],{historyGroup:true})
  entry=sources.get(ref.resourceKey)?.resourceEntry
 }else return null
 if(!entry)return null
 assertSelfGroupV2Entry(entry)
 if(ref.entryHash!==undefined&&canonicalHash(entry)!==ref.entryHash)privateToolFail('SCHOOL_PRIVATE_GROUP_SOURCE_CHANGED')
 return entry
}
