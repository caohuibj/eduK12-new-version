import {Prisma} from '@prisma/client'
import type {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {TrainingContentSnapshot} from '../composite/training-content-binding'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {sjtMeasurementRelease} from '../measurement-content/sjt'
import {listSituationPackages} from '../situational/situation-package.registry'
import {situationalReleaseKey,type ResolvedSituationalRelease,type SituationalReleaseIdentity} from '../situational/situational-release.service'
import {readStaticSjtMeasurementForStart,recheckStaticSjtConsumerLicense} from '../situational/static-measurement-release'
import {resolveEducationAssessmentSituationalItems} from './assessment-resource.source'
import {educationSjtSourceSchema} from './native-source.contracts'
import {privateToolFail} from './private-tool.contracts'

type Input=z.infer<typeof educationSjtSourceSchema>
type SjtMeasurement=Extract<StoredRelease,{layer:'MEASUREMENT'}>&{family:'SJT'}
export type EducationSjtLeaf={id:string;title:string;contentHash:string;measurement:SjtMeasurement;
 source:TrainingContentSnapshot['units'][number]['source'];resolved:ResolvedSituationalRelease;
 instrumentKey:string;instrumentVersion:string}
export type EducationSjtSourceIdentity=SituationalReleaseIdentity&{id:string;kind:'SJT_AUTHOR_RELEASE'|'STATIC_SJT_REGISTRY'}
type Header=EducationSjtSourceIdentity&{measurementReleaseId:string|null;ownerId:string|null}

function inputs(sources:readonly Input[]){
 if(sources.length>50)privateToolFail('EDUCATION_SJT_SOURCE_LIMIT',400)
 const unique=new Map<string,Input>()
 for(const raw of sources){
  const source=educationSjtSourceSchema.parse(raw),previous=unique.get(source.versionId)
  if(previous&&previous.contentHash!==source.contentHash)privateToolFail('EDUCATION_SJT_SOURCE_CONFLICT',409)
  unique.set(source.versionId,source)
 }
 return [...unique.values()]
}
async function headers(tx:Prisma.TransactionClient,sources:readonly Input[]){
 const ids=sources.map(source=>source.versionId)
 if(!ids.length)return [] as Header[]
 const rows=await tx.$queryRaw<Header[]>(Prisma.sql`
  SELECT id,'SJT_AUTHOR_RELEASE'::text AS kind,instrument_key AS "instrumentKey",instrument_version AS "instrumentVersion",
   measurement_release_id AS "measurementReleaseId",author_id AS "ownerId" FROM sjt_author_releases WHERE id=ANY(${ids}::text[])
  UNION ALL
  SELECT id,'STATIC_SJT_REGISTRY'::text AS kind,instrument_key AS "instrumentKey",instrument_version AS "instrumentVersion",
   measurement_release_id AS "measurementReleaseId",NULL::text AS "ownerId" FROM static_sjt_measurement_mappings WHERE id=ANY(${ids}::text[])`)
 if(rows.length!==ids.length||new Set(rows.map(row=>row.id)).size!==ids.length
  ||rows.some(row=>!ids.includes(row.id)||!row.instrumentKey||!row.instrumentVersion||!row.measurementReleaseId
   ||(row.kind!=='SJT_AUTHOR_RELEASE'&&row.kind!=='STATIC_SJT_REGISTRY')
   ||(row.kind==='SJT_AUTHOR_RELEASE'?!row.ownerId:row.ownerId!==null))
  ||new Set(rows.map(situationalReleaseKey)).size!==rows.length)privateToolFail('EDUCATION_SJT_SOURCE_UNAVAILABLE',404)
 return rows.sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b)))
}

/** Plain bounded discovery only. The caller locks these exact source identities,
 * then static mapping rows, before its Org/User/grant locks. This grants no U. */
export async function readEducationSjtSourceIdentities(tx:Prisma.TransactionClient,sources:readonly Input[]):Promise<EducationSjtSourceIdentity[]>{
 return (await headers(tx,inputs(sources))).map(({id,kind,instrumentKey,instrumentVersion})=>({id,kind,instrumentKey,instrumentVersion}))
}

/** New SELF composition freezing only, after the caller's exact education U and
 * source/mapping prelocks. Never uses Training course grants or Survey D. The
 * static source helper re-enters the already held source lock; acquiring it for
 * the first time here, after Org/User locks, would reverse the global order. */
export async function readEducationSjtSources(tx:Prisma.TransactionClient,raw:readonly Input[],entry:'SCHOOL'|'TEACHER'):Promise<Map<string,EducationSjtLeaf>>{
 const sources=inputs(raw),result=new Map<string,EducationSjtLeaf>(),before=await headers(tx,sources)
 if(!sources.length)return result
 // The shared resolver prefers an installed package over an uploaded package.
 // A selected author UUID must never silently resolve to that other source.
 const installed=listSituationPackages()
 if(before.some(row=>row.kind==='SJT_AUTHOR_RELEASE'&&installed.some(pkg=>pkg.key===row.instrumentKey&&pkg.instrumentVersion===row.instrumentVersion)))
  privateToolFail('EDUCATION_SJT_SOURCE_IDENTITY_CONFLICT',409)
 const staticReads=new Map<string,Awaited<ReturnType<typeof readStaticSjtMeasurementForStart>>>()
 for(const row of before.filter(row=>row.kind==='STATIC_SJT_REGISTRY')){
  const receipt=await readStaticSjtMeasurementForStart(tx,row,'PUBLISH')
  if(receipt.mapping.id!==row.id||receipt.mapping.measurement_release_id!==row.measurementReleaseId)
   privateToolFail('EDUCATION_SJT_NATIVE_MISMATCH',409)
  staticReads.set(row.id,receipt)
 }
 // Author resolution retains draft -> author -> M SHARE locks and recompiles the
 // exact original document through readSjtEntryDistributionSource internally.
 const resolved=await resolveEducationAssessmentSituationalItems(tx,before,entry,false)
 const after=await headers(tx,sources)
 if(canonicalHash(after)!==canonicalHash(before))privateToolFail('EDUCATION_SJT_SOURCE_CHANGED',409)
 const authorMeasurements=await getContentReleaseBatch(tx,before.filter(row=>row.kind==='SJT_AUTHOR_RELEASE').map(row=>row.measurementReleaseId!),true)
 for(const selected of sources){
  const row=before.find(row=>row.id===selected.versionId)!,native=resolved.get(situationalReleaseKey(row))
  const measurement=staticReads.get(row.id)?.release??authorMeasurements.get(row.measurementReleaseId!)
  if(!native||!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!=='SJT'||measurement.status!=='PUBLISHED'
   ||measurement.scope.kind!=='PLATFORM'||measurement.contentHash!==selected.contentHash
   ||measurement.releaseId!==row.measurementReleaseId||measurement.content.instrumentVersion!==row.instrumentVersion
   ||(row.kind==='SJT_AUTHOR_RELEASE'&&(measurement.scope.ownerId!==row.ownerId||measurement.provenance.authorReleaseId!==row.id)))
   privateToolFail('EDUCATION_SJT_NATIVE_MISMATCH',409)
  const pkg=native.situationPackage,expected=prepareRelease(sjtMeasurementRelease({localId:row.instrumentKey,version:measurement.version,
   instrumentVersion:row.instrumentVersion,definition:pkg.definition,...(pkg.online?{onlineProtocol:pkg.online}:{}),
   scope:measurement.scope,provenance:measurement.provenance}))
  if(expected.contentHash!==measurement.contentHash)privateToolFail('EDUCATION_SJT_NATIVE_MISMATCH',409)
  const source:EducationSjtLeaf['source']=row.kind==='STATIC_SJT_REGISTRY'
   ?{kind:'STATIC_SJT_REGISTRY',id:row.id,instrumentKey:row.instrumentKey,instrumentVersion:row.instrumentVersion}
   :{kind:'SJT_AUTHOR_RELEASE',id:row.id,ownerId:row.ownerId!,instrumentKey:row.instrumentKey,instrumentVersion:row.instrumentVersion}
  result.set(row.id,{id:row.id,title:pkg.definition.source.title??row.instrumentKey,contentHash:measurement.contentHash,
   measurement:measurement as SjtMeasurement,source,resolved:native,instrumentKey:row.instrumentKey,instrumentVersion:row.instrumentVersion})
 }
 for(const receipt of staticReads.values())await recheckStaticSjtConsumerLicense(tx,receipt)
 return result
}
