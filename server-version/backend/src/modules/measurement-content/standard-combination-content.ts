import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import {publishContentRelease,requirePublishedContentRelease,type StoredRelease} from './repository'
import {ContentReleaseError,prepareRelease,type ReleaseInput} from './release'
import {referenceEntryKey} from './reference-candidate'
import {DECLARATIVE_REPORT_GENERATOR} from './report-renderer'
import type {FrozenReferencePolicy} from './reference-policy'
import type {ExactStandardCombination} from './standard-combination-source'

type Measurement=Extract<StoredRelease,{layer:'MEASUREMENT'}>
type Pointer={releaseId:string;contentHash:string}
export function standardCombinationContentInputs(row:ExactStandardCombination,measurement:Measurement,audience:'teacher'|'student'|'parent'='teacher'){
 const t=row.snapshot,pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
 const base={family:'SCALE' as const,scope:measurement.scope,sourceReleaseId:null,assetRefs:[]}
 const provenance={standardCombinationId:row.id,combinationHash:row.combination_hash,parametersAxisHash:t.parts.PARAMETERS.hash,reportAxisHash:t.parts.REPORT.hash}
 const references=t.references.map(set=>{
  const entries=set.entries.map(entry=>({...entry,...(entry.governance?{governance:{...entry.governance,measurementHash:measurement.content.measurementHash}}:{})}))
  const input:ReleaseInput={...base,layer:'REFERENCE',key:'standard-combination-parameters:'+row.id+':'+canonicalHash(set.referenceVersion).slice(0,16),version:t.parts.PARAMETERS.hash,
   provenance:{...provenance,sourceReferenceVersion:set.referenceVersion},
   content:{projectionVersion:1,measurement:pointer,entries:entries.map(entry=>({metricKey:entry.scoreKey,referenceKind:entry.referenceKind,definition:entry as unknown as Record<string,unknown>})),
    evidence:{sourceVersion:set.referenceVersion,parameterVersion:t.parts.PARAMETERS.version}}}
  return {input,entries,sourceVersion:set.referenceVersion}
 })
 const report:ReleaseInput|null=t.template===null?null:{...base,layer:'REPORT',key:'standard-combination-report:'+row.id+(audience==='teacher'?'':':'+audience),
  version:canonicalHash({parameters:t.parts.PARAMETERS.hash,report:t.parts.REPORT.hash}),provenance,
  content:{projectionVersion:1,measurements:[pointer],metricKeys:t.definition.scoring.scores.map(s=>s.key),audience,
   language:t.definition.versionAxes?.locale??'und',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:t.template}}
 return {references,report}
}

/** Mechanical derivation from the locked approved source, once in the shared
 * immutable release store. No new approval, new authorship or private copy. */
export async function materializeStandardCombinationContent(tx:Prisma.TransactionClient,row:ExactStandardCombination,measurement:Measurement,actorId:string,audience:'teacher'|'student'|'parent'='teacher'){
 const inputs=standardCombinationContentInputs(row,measurement,audience),releases=new Map<string,StoredRelease>()
 const referencePolicy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}
 for(const source of inputs.references){
  const release=await publishContentRelease(tx,source.input,actorId)
  if(release.status!=='PUBLISHED')throw new ContentReleaseError('CONTENT_STANDARD_PARAMETERS_NOT_PUBLISHED')
  releases.set(release.releaseId,release)
  for(const entry of source.entries)if(row.snapshot.definition.referencePolicy.type==='declared'
   &&row.snapshot.definition.referencePolicy.selections.some(s=>s.referenceVersion===source.sourceVersion&&s.scoreKey===entry.scoreKey&&s.referenceKind===entry.referenceKind))
   referencePolicy.choices.push({releaseId:release.releaseId,contentHash:release.contentHash,entryKey:referenceEntryKey(entry),metricKey:entry.scoreKey,referenceKind:entry.referenceKind,priority:0})
 }
 let report:Pointer|undefined
 if(inputs.report){
  const release=await publishContentRelease(tx,inputs.report,actorId)
  if(release.status!=='PUBLISHED')throw new ContentReleaseError('CONTENT_STANDARD_REPORT_NOT_PUBLISHED')
  releases.set(release.releaseId,release);report={releaseId:release.releaseId,contentHash:release.contentHash}
 }
 return {referencePolicy,...(report?{report}:{}),releases}
}

/** Preflight stays read-only. Missing mechanical projections are created inside
 * the real publication transaction, without introducing another admin step. */
export async function previewStandardCombinationContent(tx:Prisma.TransactionClient,row:ExactStandardCombination,measurement:Measurement){
 const inputs=standardCombinationContentInputs(row,measurement),releases=new Map<string,StoredRelease>()
 const referencePolicy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}
 let report:Pointer|undefined
 const read=async(input:ReleaseInput)=>{
  try{return await requirePublishedContentRelease(tx,input)}catch(e){if(e instanceof ContentReleaseError&&e.code==='CONTENT_RELEASE_NOT_PUBLISHED')return null;throw e}
 }
 for(const source of inputs.references){
  const release=await read(source.input)
  if(!release)continue
  releases.set(release.releaseId,release)
  for(const entry of source.entries)if(row.snapshot.definition.referencePolicy.type==='declared'
   &&row.snapshot.definition.referencePolicy.selections.some(s=>s.referenceVersion===source.sourceVersion&&s.scoreKey===entry.scoreKey&&s.referenceKind===entry.referenceKind))
   referencePolicy.choices.push({releaseId:release.releaseId,contentHash:release.contentHash,entryKey:referenceEntryKey(entry),metricKey:entry.scoreKey,referenceKind:entry.referenceKind,priority:0})
 }
 if(inputs.report){const release=await read(inputs.report);if(release){releases.set(release.releaseId,release);report={releaseId:release.releaseId,contentHash:release.contentHash}}}
 return {referencePolicy,...(report?{report}:{}),releases}
}

/** A narrow approved-combination identity branch, never a PLATFORM-label bypass
 * of the existing formal-norm or private Training report contracts. */
export function assertStandardCombinationDerivedRelease(row:ExactStandardCombination,measurement:Measurement,release:StoredRelease){
 const inputs=standardCombinationContentInputs(row,measurement)
 const candidates=release.layer==='REFERENCE'?inputs.references.map(r=>r.input):release.layer==='REPORT'&&inputs.report?[inputs.report]:[]
 const expected=candidates.find(raw=>{const input=prepareRelease(raw);return input.key===release.key&&input.version===release.version
  &&input.contentHash===release.contentHash&&canonicalHash(input.scope)===canonicalHash(release.scope)
  &&canonicalHash(input.provenance)===canonicalHash(release.provenance)&&canonicalHash(input.assetRefs)===canonicalHash(release.assetRefs)
  &&input.sourceReleaseId===release.sourceReleaseId})
 if(!expected)throw new ContentReleaseError('CONTENT_STANDARD_DERIVED_RELEASE_IDENTITY_MISMATCH')
 return release.layer==='REFERENCE'?release.content.entries.map(e=>e.definition as unknown as AssessmentReferenceEntry):[]
}
