import {Prisma,type PrismaClient} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {hashScaleDefinition,type ScaleDefinitionV2} from '../scale-definition'
import {toolReference} from '../../survey/tool-reference'
import {compileScalePolicy} from '../policy/compile'
import {activateScaleDeploymentRevision,readActiveScaleDeployment} from '../deployment/repository'
import type {ScaleInstrumentSourceV1} from '../onboarding/types'
import type {Part,Triplet} from '../../survey/standard-triplet.model'
import {emptyReport,type ComponentDraft} from './contract'
import {randomUUID} from 'node:crypto'

export const databaseSourceSchema=z.object({kind:z.literal('DB_IMPORTED'),scaleId:z.string().uuid(),toolKey:z.string().min(1),instrumentVersion:z.string().min(1),contentHash:z.string().regex(/^[a-f0-9]{64}$/),definitionDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const databaseContentSource=(part:Part)=>part.reference.metadata.databaseSource===undefined?null:databaseSourceSchema.parse(part.reference.metadata.databaseSource)
export function importedContentPart(toolKey:string,c:NonNullable<ComponentDraft['changedParts']['CONTENT']>):Part{
 const {report:_,referencePolicy:__,source,license,...content}=c.definition
 const payload={measurement:content,administration:{metadata:c.metadata,provenance:source,license}}
 const hash=canonicalHash(payload),id=canonicalHash({kind:'DB_IMPORTED_C',toolKey,version:c.version,hash}).slice(0,32)
 const scaleId=`${id.slice(0,8)}-${id.slice(8,12)}-4${id.slice(13,16)}-8${id.slice(17,20)}-${id.slice(20)}`
 const definition={...content,source,license,report:emptyReport(content.scoring.scores),referencePolicy:{type:'none' as const}}
 return {axis:'CONTENT',version:c.version+':'+content.scoring.scoringVersion,hash,payload,sourceVersion:c.version,
  reference:toolReference('SCALE',toolKey,{...c.metadata,identity:{instrumentKey:toolKey,instrumentVersion:c.version},originalProvenance:source,originalLicense:license,
   databaseSource:{kind:'DB_IMPORTED',scaleId,toolKey,instrumentVersion:c.version,contentHash:hash,definitionDigest:canonicalHash(definition)}})}
}
export function importedNativeDefinition(part:Part):ScaleDefinitionV2{
 const payload=part.payload as {measurement:Omit<ScaleDefinitionV2,'source'|'license'|'report'|'referencePolicy'>;administration:{metadata:NonNullable<ComponentDraft['changedParts']['CONTENT']>['metadata'];provenance:ScaleDefinitionV2['source'];license:ScaleDefinitionV2['license']}}
 const pointer=databaseContentSource(part)!,d=payload.measurement,a=payload.administration
 const expected={...a.metadata,identity:{instrumentKey:pointer.toolKey,instrumentVersion:pointer.instrumentVersion},originalProvenance:a.provenance,originalLicense:a.license,databaseSource:pointer}
 if(canonicalHash(expected)!==canonicalHash(part.reference.metadata))throw new Error('IMPORTED_ADMINISTRATION_SOURCE_MISMATCH')
 return {...d,source:a.provenance,license:a.license,report:emptyReport(d.scoring.scores),referencePolicy:{type:'none'}}
}
export const importedMeasurementPayload=(part:Part)=>databaseContentSource(part)?(part.payload as {measurement:unknown}).measurement:part.payload
/** Exact native C addressing shared by new-use consumers; internal code never
 * becomes a business instrument key or a parameter/combination identity. */
export function matchesStandardNativeScale(scale:{id:string;code:string;instrumentVersion:string;standardSourceKind?:string;standardToolKey?:string|null},triplet:Pick<Triplet,'toolKey'|'instrumentVersion'|'parts'>){
 const pointer=databaseContentSource(triplet.parts.CONTENT)
 return pointer?scale.standardSourceKind==='DB_IMPORTED'&&scale.id===pointer.scaleId&&scale.standardToolKey===triplet.toolKey&&pointer.toolKey===triplet.toolKey&&pointer.contentHash===triplet.parts.CONTENT.hash&&scale.instrumentVersion===triplet.instrumentVersion&&pointer.instrumentVersion===triplet.instrumentVersion
  :scale.standardSourceKind!=='DB_IMPORTED'&&scale.code===triplet.toolKey&&scale.instrumentVersion===triplet.instrumentVersion
}
export function standardNativeScaleJoin(scaleAlias:'s'|'native',releaseAlias:'r'|'s'='r'){
 const s=Prisma.raw(scaleAlias),r=Prisma.raw(releaseAlias)
 return Prisma.sql`(${s}.instrument_version=${r}.snapshot->>'instrumentVersion' AND (
  (${r}.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,kind}'='DB_IMPORTED'
   AND ${s}.standard_source_kind='DB_IMPORTED' AND ${s}.standard_tool_key=${r}.tool_key
   AND ${s}.id=${r}.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,scaleId}'
   AND ${r}.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,toolKey}'=${r}.tool_key
   AND ${r}.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,instrumentVersion}'=${s}.instrument_version
   AND ${r}.snapshot#>>'{parts,CONTENT,reference,metadata,databaseSource,contentHash}'=${r}.snapshot#>>'{parts,CONTENT,hash}')
  OR (${r}.snapshot#>'{parts,CONTENT,reference,metadata,databaseSource}' IS NULL AND ${s}.standard_source_kind='CODE_PACKAGE' AND ${s}.code=${r}.tool_key)))`
}
export function importedPolicySource(part:Part):ScaleInstrumentSourceV1{
 const pointer=databaseContentSource(part)!,meta=part.reference.metadata,definition=importedNativeDefinition(part)
 return {...meta,schemaVersion:1,identity:{instrumentKey:pointer.toolKey,instrumentVersion:pointer.instrumentVersion},
  executable:{releaseStatus:'PUBLISHED',contentLocale:definition.versionAxes?.locale??(meta.instruction as {language?:string}|undefined)?.language??'und',definition,references:[],goldenCases:[]}} as unknown as ScaleInstrumentSourceV1
}
export async function materializeImportedContent(tx:Prisma.TransactionClient,triplet:Triplet,actor:string){
 const part=triplet.parts.CONTENT,pointer=databaseContentSource(part)
 if(!pointer)return
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'db-imported-C:'+pointer.toolKey+':'+pointer.instrumentVersion}))`
 if(pointer.toolKey!==triplet.toolKey||pointer.instrumentVersion!==part.sourceVersion||pointer.contentHash!==part.hash||canonicalHash(part.reference.metadata)!==part.reference.metadataHash)throw new Error('IMPORTED_CONTENT_SOURCE_MISMATCH')
 const definition=importedNativeDefinition(part)
 if(canonicalHash(definition)!==pointer.definitionDigest)throw new Error('IMPORTED_NATIVE_DEFINITION_MISMATCH')
 // Publication readiness includes the existing runtime policy compiler; no
 // catalog/scientific/license approval is introduced for imported sources.
 compileScalePolicy(importedPolicySource(part))
 const prior=await tx.scale.findUnique({where:{id:pointer.scaleId}})
 if(prior){if(prior.standardSourceKind!=='DB_IMPORTED'||prior.standardToolKey!==triplet.toolKey||prior.instrumentVersion!==part.sourceVersion||canonicalHash(prior.definition)!==pointer.definitionDigest)throw new Error('IMPORTED_NATIVE_VERSION_CONFLICT');return}
 await tx.scale.create({data:{id:pointer.scaleId,code:'db-scale:'+pointer.scaleId,standardSourceKind:'DB_IMPORTED',standardToolKey:triplet.toolKey,name:triplet.title,
  instrumentClass:'STANDARD',instrumentVersion:part.sourceVersion,definition:definition as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(definition),
  status:'DRAFT',visibility:'HIDDEN',creatorId:actor,itemCount:definition.items.length,dimensionCount:definition.scoring.scores.filter(s=>s.type==='dimension').length,
  instruction:(part.reference.metadata.instruction as {text?:string}|undefined)?.text}})
}
export async function activateImportedContent(tx:Prisma.TransactionClient,triplet:Triplet,actor:string){
 const pointer=databaseContentSource(triplet.parts.CONTENT);if(!pointer)return
 const source=importedPolicySource(triplet.parts.CONTENT),policy=compileScalePolicy(source)
 const active=await readActiveScaleDeployment(tx,pointer.scaleId)
 if(!active)await activateScaleDeploymentRevision({db:tx,id:randomUUID(),scaleId:pointer.scaleId,createdByUserId:actor,
  policy:{schemaVersion:2,revision:1,locale:policy.contentLocale,territory:'ZZ',deploymentModes:['COMPOSITE','QUESTIONNAIRE','PUBLIC_QUESTIONNAIRE'],runtimePolicyHash:policy.runtimePolicyHash,
   ...(source.localization?{localizationVersion:source.localization.localizationVersion}:{}),inFlightCompletion:'FROZEN_DEADLINE'}})
 else if(active.policy.runtimePolicyHash!==policy.runtimePolicyHash)throw new Error('IMPORTED_RUNTIME_POLICY_CONFLICT')
 // The ONLINE row is written earlier in this same transaction. A failure here
 // rolls both transitions back; P/R updates leave an existing C unchanged.
 await tx.scale.updateMany({where:{id:pointer.scaleId,status:'DRAFT'},data:{status:'PUBLISHED'}})
 const scale=await tx.scale.findUnique({where:{id:pointer.scaleId}})
 if(!scale||scale.status!=='PUBLISHED')throw new Error('IMPORTED_NATIVE_NOT_RUNNABLE')
}
export async function readImportedPolicySource(db:PrismaClient|Prisma.TransactionClient,scaleId:string){
 if(typeof db.$queryRaw!=='function')return null
 const [native]=await db.$queryRaw<Array<{standard_source_kind:string;standard_tool_key:string;instrument_version:string;definition:unknown;definition_hash:string}>>`SELECT standard_source_kind,standard_tool_key,instrument_version,definition,definition_hash FROM scales WHERE id=${scaleId} FOR SHARE`
 if(!native||native.standard_source_kind!=='DB_IMPORTED')return null
 const [row]=await db.$queryRaw<Array<{axis:'CONTENT';version:string;content_hash:string;payload:unknown;source_version:string;reference:Part['reference']}>>`SELECT * FROM survey_standard_versions
  WHERE axis='CONTENT' AND reference#>>'{metadata,databaseSource,scaleId}'=${scaleId} LIMIT 1`
 if(!row)return null
 const part:Part={axis:'CONTENT',version:row.version,hash:row.content_hash,payload:row.payload,sourceVersion:row.source_version,reference:row.reference},pointer=databaseContentSource(part)!
 if(pointer.scaleId!==scaleId||pointer.toolKey!==native.standard_tool_key||pointer.instrumentVersion!==native.instrument_version||canonicalHash(native.definition)!==pointer.definitionDigest||hashScaleDefinition(native.definition as ScaleDefinitionV2)!==native.definition_hash||canonicalHash(part.payload)!==part.hash||pointer.contentHash!==part.hash||canonicalHash(part.reference.metadata)!==part.reference.metadataHash)throw new Error('IMPORTED_POLICY_SOURCE_INVALID')
 return importedPolicySource(part)
}
