import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import {readEducationPublicSourceHeaders} from './public-source.headers'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPublicSourceKey} from './public-source.identity'
import {educationCognitiveProfileSchema} from './native-source.contracts'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'

/** Metadata only. A selected config/profile is compiled at freeze, while task
 * stimuli and native results are served exclusively through the admitted host. */
export async function readEducationNativePreview(c:PrivateToolContext,input:{provider:'COGNITIVE_CONFIG'|'SJT_RELEASE';versionId:string;contentHash:string;profile?:unknown;responseMode?:string}){
 if((input.responseMode??'SELF')!=='SELF')privateToolFail('EDUCATION_NATIVE_SELF_REQUIRED',400)
 const profile=input.provider==='COGNITIVE_CONFIG'?educationCognitiveProfileSchema.parse(input.profile):undefined
 if(input.provider==='SJT_RELEASE'&&input.profile!==undefined)privateToolFail('EDUCATION_NATIVE_INPUT_INVALID',400)
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  const source={kind:input.provider,id:input.versionId,hash:input.contentHash},key=educationPublicSourceKey(source)
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  const header=(await readEducationPublicSourceHeaders(tx,[source])).get(key)
  if(!header)privateToolFail('EDUCATION_NATIVE_SOURCE_UNAVAILABLE',404)
  if(input.provider==='COGNITIVE_CONFIG'){
   const [original]=await tx.$queryRaw<Array<{allowed:boolean;instruction:string|null;profiles:string[]}>>(Prisma.sql`SELECT c.instruction,
    (c.access_policy='OPEN' OR EXISTS(SELECT 1 FROM material_grants WHERE teacher_id=${c.principal.userId} AND resource_type='COGNITIVE_CONFIG' AND resource_id=c.id)) AS allowed,
    ARRAY(SELECT jsonb_object_keys(m.content#>'{executable,profiles}')) AS profiles
    FROM cognitive_test_configs c JOIN measurement_content_releases m ON m.id=c.measurement_release_id WHERE c.id=${input.versionId}`)
   if(!original?.allowed)privateToolFail('EDUCATION_COGNITIVE_ORIGINAL_AUTHORITY_REQUIRED',403)
   if(!original.profiles.includes(profile!))privateToolFail('EDUCATION_COGNITIVE_PROFILE_REQUIRED',400)
   return {id:input.versionId,contentHash:input.contentHash,title:header.title,kind:'COGNITIVE',profile,instruction:original.instruction??'',previewOnly:true,canEditOriginal:false}
  }
  return {id:input.versionId,contentHash:input.contentHash,title:header.title,kind:'SJT',instrumentVersion:header.versions.content,previewOnly:true,canEditOriginal:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
