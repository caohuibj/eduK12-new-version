import {resolveAudienceDisclosure} from '../scale/policy/disclosure'
import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {assertExactStandardCombinationFacts,type ExactStandardCombination} from '../measurement-content/standard-combination-source'
import {prepareRelease} from '../measurement-content/release'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {privateToolFail} from './private-tool.contracts'
import {educationStandardSourceSchema} from './private-tool.composition-contracts'

/** Content adapter only. The caller checks current author/U before this bounded
 * body read. No Training grant, single-tool Composite or approval is created. */
export async function readEducationStandardSources(tx:Prisma.TransactionClient,sources:readonly {versionId:string;contentHash:string}[],mode:'SEAL'|'SEALED_START'='SEAL'){
 const ids=[...new Set(sources.map(source=>source.versionId))]
 if(!ids.length)return new Map<string,EducationStandardLeaf>()
 const rows=await tx.$queryRaw<ExactStandardCombination[]>(Prisma.sql`SELECT * FROM survey_standard_releases
  WHERE id IN (${Prisma.join(ids)}) AND state='ONLINE' ORDER BY id FOR SHARE`)
 const measurements=await getContentReleaseBatch(tx,rows.flatMap(row=>row.measurement_release?[row.measurement_release.releaseId]:[]),true)
 const scales=await tx.scale.findMany({where:{code:{in:[...new Set(rows.map(row=>row.snapshot.toolKey))]}}})
 const result=new Map<string,EducationStandardLeaf>()
 for(const source of sources){
  const row=rows.find(row=>row.id===source.versionId&&row.combination_hash===source.contentHash)
  if(!row||!row.measurement_release)privateToolFail('PUBLIC_STANDARD_SOURCE_UNAVAILABLE',404)
  if(result.has(source.versionId))continue
  const measurement=measurements.get(row.measurement_release.releaseId)
  if(mode==='SEAL')assertExactStandardCombinationFacts(row,measurement)
  else if(!measurement||measurement.contentHash!==row.measurement_release.contentHash||measurement.status!=='PUBLISHED')privateToolFail('PUBLIC_STANDARD_MEASUREMENT_INVALID')
  if(!measurement||measurement.layer!=='MEASUREMENT')privateToolFail('PUBLIC_STANDARD_MEASUREMENT_INVALID')
  const scale=scales.find(scale=>scale.code===row.snapshot.toolKey&&scale.instrumentVersion===row.snapshot.instrumentVersion)
  if(!scale||scale.status!=='PUBLISHED'||scale.instrumentClass!=='STANDARD'||scale.libraryEntryId)privateToolFail('PUBLIC_STANDARD_NATIVE_UNAVAILABLE')
  // Installed C and selected P/R are distinct identities. The existing native
  // freezer receives the approved definition, rather than installed/default P/R.
  if(mode==='SEAL'){
  const installed=prepareRelease(scaleMeasurementRelease({localId:scale.code,version:measurement.version,
   instrumentVersion:scale.instrumentVersion,definition:frozenDatabaseScaleDefinition(scale),instrumentClass:'STANDARD',scope:measurement.scope}))
  if(installed.contentHash!==measurement.contentHash)privateToolFail('PUBLIC_STANDARD_NATIVE_CONTENT_MISMATCH')
  }
  const applicability=row.snapshot.parts.CONTENT.reference.metadata.applicability as {respondentTypes?:string[]}|undefined
  if(!applicability?.respondentTypes?.includes('SELF'))privateToolFail('PUBLIC_STANDARD_VARIANT_UNSUPPORTED',400)
  const descriptor=educationStandardSourceSchema.parse({releaseId:row.id,combinationHash:row.combination_hash,toolKey:row.snapshot.toolKey,
   instrumentVersion:row.snapshot.instrumentVersion,nativeDefinitionHash:canonicalHash(row.snapshot.definition),
   parametersAxisHash:row.snapshot.parts.PARAMETERS.hash,reportAxisHash:row.snapshot.parts.REPORT.hash,
   respondentDisclosure:resolveAudienceDisclosure(row.snapshot.parts.CONTENT.reference.metadata.disclosure as Parameters<typeof resolveAudienceDisclosure>[0],'respondent'),
   reportAudience:row.snapshot.definition.report.audienceContract?.audience??'teacher'})
  result.set(row.id,{row,measurement,scale,descriptor})
 }
 return result
}
export type EducationStandardLeaf={row:ExactStandardCombination;measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>;
 scale:Scale;descriptor:import('./private-tool.composition-contracts').EducationStandardSource}
