import {educationMarkerBindingSchema} from '../education-tools/assessment-resource.marker-contract'
import {readEducationMarkerSource} from '../education-tools/assessment-resource.marker'
import {readPrivateRuntimeScaleSource,assertPrivateRuntimeCompositeIdentity} from '../education-tools/private-tool.runtime-source'
import {readLibraryScaleMeasurementSource} from '../scale-library-governance/training-source'
import {trainingReferencePolicySchema} from './training-reference-selection'
import {trainingStandardItemSourceSchema,verifyStoredTrainingStandardItem} from './training-standard-combination'
import {readTrainingStandardContentIdentity} from './training-standard-content'
import {materializeStandardCombinationContent,previewStandardCombinationContent} from '../measurement-content/standard-combination-content'
import {readStaticSjtMeasurementForStart,recheckStaticSjtConsumerLicense} from '../situational/static-measurement-release'
import { validateTrainingReportPointer } from './training-report-selection'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getContentRelease } from '../measurement-content/repository'
import { ContentReleaseError, prepareRelease, type ReleaseInput } from '../measurement-content/release'
import { scaleMeasurementRelease } from '../measurement-content/scale'
import { cognitiveMeasurementRelease } from '../measurement-content/cognitive'
import { sjtMeasurementRelease } from '../measurement-content/sjt'
import { frozenDatabaseScaleDefinition } from '../scale/scale-workflow.service'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { hashResolvedConfig } from '../cognitive/profile-freeze'
import { listSituationPackages } from '../situational/situation-package.registry'
import { situationalReleaseKey, type ResolvedSituationalRelease } from '../situational/situational-release.service'

const text=z.string().min(1).max(240),digest=z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema=z.object({kind:z.enum(['SCALE','COGNITIVE_CONFIG','SJT_AUTHOR_RELEASE','STATIC_SJT_REGISTRY']),id:text,ownerId:text.optional(),
  educationBinding:educationMarkerBindingSchema.optional(),standardCombination:trainingStandardItemSourceSchema.optional(),libraryEntryId:z.string().guid().optional(),privateVersionId:z.string().guid().optional(),assignmentId:text.optional(),instrumentKey:text.optional(),instrumentVersion:text.optional()}).strict().superRefine((source,ctx)=>{
 if(source.standardCombination&&(source.kind!=='SCALE'||source.libraryEntryId||source.privateVersionId||source.id!==source.standardCombination.reference.scaleId))ctx.addIssue({code:'custom',message:'Standard combination must retain its installed Scale identity'})
 if(source.privateVersionId&&(source.kind!=='SCALE'||source.libraryEntryId!==undefined))ctx.addIssue({code:'custom',message:'Private Scale identity cannot alias library or other families'})
 if(source.libraryEntryId&&source.kind!=='SCALE')ctx.addIssue({code:'custom',message:'Library identity is only valid for Scale'})
 if(source.kind==='STATIC_SJT_REGISTRY'?(!z.string().guid().safeParse(source.id).success||source.ownerId!==undefined||!source.instrumentKey||!source.instrumentVersion||source.assignmentId!==undefined):!source.ownerId)
  ctx.addIssue({code:'custom',message:'Exact source identity required'})
})
const unitSchema=z.object({itemId:text,family:z.enum(['SCALE','COGNITIVE','SJT']),source:sourceSchema,
  measurement:z.object({releaseId:z.string().guid(),contentHash:digest,measurementHash:digest}).strict(),referencePolicy:trainingReferencePolicySchema.optional(),report:z.object({releaseId:z.string().guid(),contentHash:digest}).strict().optional()}).strict()
export const trainingContentSnapshotSchema=z.object({schemaVersion:z.literal(1),compositeId:text,units:z.array(unitSchema).max(1000)}).strict()
export type TrainingContentSnapshot=z.infer<typeof trainingContentSnapshotSchema>
type Unit=TrainingContentSnapshot['units'][number]
type Stored=NonNullable<Awaited<ReturnType<typeof getContentRelease>>>
type SourceRow={library_entry_id?:string|null;kind:Unit['source']['kind'];id:string;assignment_id:string|null;owner_id:string|null;measurement_release_id:string|null;instrument_key:string|null;instrument_version:string|null}
class TrainingContentError extends ContentReleaseError { readonly statusCode=409 }
function fail(code:string):never { throw new TrainingContentError('CONTENT_TRAINING_'+code) }

/** Only server-loaded composite items are accepted. Caller must complete existing
 * source access/license/material gates before calling. Existing material grants
 * authorize attachment; library grants are revalidated by the publishing caller. */
export async function prepareTrainingContentSnapshot(db:Prisma.TransactionClient,composite:{id:string;items:any[]},
  resolvedSituational:Map<string,ResolvedSituationalRelease>,purpose:'NEW_ADMINISTRATION'|'HISTORICAL_INTERPRETATION'='NEW_ADMINISTRATION',standardMode:'PREVIEW'|'PUBLISH'='PREVIEW'){
  if(!composite.id||!Array.isArray(composite.items)||composite.items.length>1000)fail('SNAPSHOT_INVALID')
  const items=composite.items.filter(item=>item.type!=='FORM')
  if(items.some(item=>!['SCALE','COGNITIVE','SITUATIONAL'].includes(item.type))||new Set(items.map(item=>item.id)).size!==items.length)fail('SOURCE_INVALID')
  const scaleIds=[...new Set<string>(items.filter(item=>item.type==='SCALE'&&item.standardCombinationSource==null).map(item=>item.scale?.id))]
  const configIds=[...new Set<string>(items.filter(item=>item.type==='COGNITIVE').map(item=>item.cognitiveAssignment?.config?.id))]
  const assignmentIds=[...new Set<string>(items.filter(item=>item.type==='COGNITIVE').map(item=>item.cognitiveAssignment?.id))]
  const sjt=items.filter(item=>item.type==='SITUATIONAL').map(item=>({instrumentKey:item.situationalInstrumentKey,instrumentVersion:item.situationalInstrumentVersion}))
  // The existing resolver prioritizes installed package keys over author rows.
  // Do not invent an author-release identity for a static registry package.
  const staticSjtKeys=new Set(sjt.length?listSituationPackages().map(pkg=>pkg.key):[])
  const staticSjt=new Map<string,Awaited<ReturnType<typeof readStaticSjtMeasurementForStart>>>()
  for(const identity of [...sjt].filter(identity=>staticSjtKeys.has(identity.instrumentKey)).sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b)))){
    const key=situationalReleaseKey(identity)
    if(!staticSjt.has(key))staticSjt.set(key,await readStaticSjtMeasurementForStart(db,identity,purpose==='NEW_ADMINISTRATION'?'PUBLISH':'HISTORY'))
  }
  const authorSjt=sjt.filter(identity=>!staticSjtKeys.has(identity.instrumentKey))
  if([...scaleIds,...configIds,...assignmentIds].some(id=>typeof id!=='string'||!id)||sjt.some(identity=>!identity.instrumentKey||!identity.instrumentVersion))fail('SOURCE_INVALID')
  // One bounded source-pointer query. CTEs lock the actual source rows before
  // release locks; no client pointer or default registry selection is consulted.
  const rows=items.length?await db.$queryRaw<SourceRow[]>(Prisma.sql`
    WITH scale_sources AS (SELECT id,creator_id,measurement_release_id,library_entry_id FROM scales
      WHERE id IN (${Prisma.join(scaleIds.length?scaleIds:[''])}) ORDER BY id FOR SHARE),
    cognitive_sources AS (SELECT c.id,a.id AS assignment_id,a.created_by,
        COALESCE(a.measurement_release_id,c.measurement_release_id) AS measurement_release_id
      FROM cognitive_assignments a JOIN cognitive_test_configs c ON c.id=a.config_id
      WHERE a.id IN (${Prisma.join(assignmentIds.length?assignmentIds:[''])})
        AND c.id IN (${Prisma.join(configIds.length?configIds:[''])}) ORDER BY a.id,c.id FOR SHARE OF a,c),
    sjt_sources AS (SELECT id,author_id,measurement_release_id,instrument_key,instrument_version FROM sjt_author_releases
      WHERE ${authorSjt.length?Prisma.join(authorSjt.map(identity=>Prisma.sql`(instrument_key=${identity.instrumentKey} AND instrument_version=${identity.instrumentVersion})`),' OR '):Prisma.sql`FALSE`}
      ORDER BY id FOR SHARE)
    SELECT 'SCALE' AS kind,id,creator_id AS owner_id,measurement_release_id,NULL::text AS instrument_key,NULL::text AS instrument_version,NULL::text AS assignment_id,library_entry_id FROM scale_sources
    UNION ALL SELECT 'COGNITIVE_CONFIG',id,created_by,measurement_release_id,NULL::text,NULL::text,assignment_id,NULL::text FROM cognitive_sources
    UNION ALL SELECT 'SJT_AUTHOR_RELEASE',id,author_id,measurement_release_id,instrument_key,instrument_version,NULL::text,NULL::text FROM sjt_sources`):[]
  const bySource=new Map(rows.map(row=>[`${row.kind}:${row.id}${row.kind==='COGNITIVE_CONFIG'?':'+row.assignment_id:''}`,row]))
  const bySjt=new Map(rows.filter(row=>row.kind==='SJT_AUTHOR_RELEASE').map(row=>[situationalReleaseKey({instrumentKey:row.instrument_key!,instrumentVersion:row.instrument_version!}),row]))
  const releases=new Map<string,Stored>()
  const read=async(id:string)=>{
    let release=releases.get(id)
    if(!release){const loaded=await getContentRelease(db,id,true);if(!loaded)fail('RELEASE_REQUIRED');release=loaded;releases.set(id,release)}
    return release
  }
  for(const {mapping,release} of staticSjt.values()){
    bySjt.set(situationalReleaseKey({instrumentKey:mapping.instrument_key,instrumentVersion:mapping.instrument_version}),
      {kind:'STATIC_SJT_REGISTRY',id:mapping.id,owner_id:null,measurement_release_id:release.releaseId,instrument_key:mapping.instrument_key,instrument_version:mapping.instrument_version,assignment_id:null})
    releases.set(release.releaseId,release)
  }
  const units:Unit[]=[]
  for(const item of items){
    if(item.standardCombinationSource!=null){
      const standard=await verifyStoredTrainingStandardItem(db,composite,item)
      const derived=standardMode==='PUBLISH'?await materializeStandardCombinationContent(db,standard.resolved.row,standard.resolved.measurement,standard.reference.ownerId)
        :await previewStandardCombinationContent(db,standard.resolved.row,standard.resolved.measurement)
      releases.set(standard.resolved.measurement.releaseId,standard.resolved.measurement)
      for(const [id,release] of derived.releases)releases.set(id,release)
      units.push({itemId:item.id,family:'SCALE',source:{kind:'SCALE',id:item.scaleId,ownerId:item.scale.creatorId,
        standardCombination:{reference:standard.reference,referenceHash:standard.referenceHash}},measurement:standard.reference.measurement,
        referencePolicy:derived.referencePolicy,...(derived.report?{report:derived.report}:{})})
      continue
    }
    const identity=item.type==='SITUATIONAL'?{instrumentKey:item.situationalInstrumentKey,instrumentVersion:item.situationalInstrumentVersion}:null
    const row=item.type==='SCALE'?bySource.get(`SCALE:${item.scale.id}`):item.type==='COGNITIVE'
      ?bySource.get(`COGNITIVE_CONFIG:${item.cognitiveAssignment.config.id}:${item.cognitiveAssignment.id}`):bySjt.get(situationalReleaseKey(identity!))
    if(!row?.measurement_release_id)fail('RELEASE_REQUIRED')
    if(item.type==='SCALE'&&row.owner_id!==item.scale.creatorId)fail('SOURCE_MISMATCH')
    if(item.type==='COGNITIVE'&&row.owner_id!==item.cognitiveAssignment.createdBy)fail('SOURCE_MISMATCH')
    const release=await read(row.measurement_release_id)
    if(release.layer!=='MEASUREMENT'||release.status==='REVOKED'||purpose==='NEW_ADMINISTRATION'&&release.status!=='PUBLISHED')fail('RELEASE_NOT_PUBLISHED')
    const source:Unit['source']={kind:row.kind,id:row.id,...(row.library_entry_id?{libraryEntryId:row.library_entry_id}:{}),...(row.kind==='STATIC_SJT_REGISTRY'?{}:{ownerId:row.owner_id??item.cognitiveAssignment?.createdBy}),
      ...(item.type==='COGNITIVE'?{assignmentId:item.cognitiveAssignment.id}:{}),
      ...(identity?{instrumentKey:identity.instrumentKey,instrumentVersion:identity.instrumentVersion}:{})}
    const original=trainingContentSnapshotSchema.safeParse((composite as any).trainingContentSnapshot)
    const privateId=original.success?original.data.units.find(unit=>unit.itemId===item.id)?.source.privateVersionId:undefined
    const privateSource=privateId?await readExactPrivateSource(db,release,{...source,privateVersionId:privateId}):null
    if(privateSource)source.privateVersionId=privateId
    const library=source.libraryEntryId?await readExactLibrarySource(db,release,source,'NEW_USE'):null
    if(!library&&!privateSource)assertScope(release,source)
    if(library&&canonicalHash(item.scale.definition)!==canonicalHash(library.definition))fail('SOURCE_MISMATCH')
    const expected=projectActualMeasurement(item,release,resolvedSituational,Boolean(library))
    const projected=prepareRelease(expected)
    if(release.family!==expected.family||projected.contentHash!==release.contentHash
      ||canonicalHash(expected.content)!==canonicalHash(release.content))fail('SOURCE_MISMATCH')
    units.push({itemId:item.id,family:release.family,source,measurement:{releaseId:release.releaseId,
      contentHash:release.contentHash,measurementHash:release.content.measurementHash}})
  }
  const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:composite.id,units})
  return {snapshot,snapshotHash:canonicalHash(snapshot),releases,recheckSourceLicenses:async()=>{for(const receipt of staticSjt.values())await recheckStaticSjtConsumerLicense(db,receipt)}}
}
function projectActualMeasurement(item:any,release:Stored,resolvedSituational:Map<string,ResolvedSituationalRelease>,library=false):ReleaseInput{
  let expected:ReleaseInput
    try{
      if(item.type==='SCALE')expected=scaleMeasurementRelease({localId:item.scale.code,version:release.version,
        instrumentVersion:item.scale.instrumentVersion,definition:frozenDatabaseScaleDefinition(item.scale),
        instrumentClass:item.scale.instrumentClass,scope:release.scope,...(library?{presentationMode:libraryPresentationMode(release)}:{})})
      else if(item.type==='COGNITIVE'){
        const assignment=item.cognitiveAssignment,config=assignment.config
        const entry=requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion)
        // Match createCognitiveChild's effective config, never its default profile.
        const effective=entry.configSchema.parse(assignment.resolvedConfigSnapshotEncrypted
          ?decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted):config.config)
        if(assignment.resolvedConfigSnapshotEncrypted&&(!assignment.resolvedConfigHash||hashResolvedConfig(effective)!==assignment.resolvedConfigHash))fail('COGNITIVE_PROFILE_INVALID')
        expected=cognitiveMeasurementRelease({localId:config.testType,version:release.version,testType:config.testType,
          configVersion:config.configVersion,engineVersion:config.engineVersion,scoringVersion:config.scoringVersion,
          config:effective,scope:release.scope})
      }else{
        const identity={instrumentKey:item.situationalInstrumentKey,instrumentVersion:item.situationalInstrumentVersion}
        const resolved=resolvedSituational.get(situationalReleaseKey(identity)),pkg=resolved?.situationPackage
        if(!pkg||pkg.key!==identity.instrumentKey||pkg.instrumentVersion!==identity.instrumentVersion)fail('SJT_SOURCE_INVALID')
        expected=sjtMeasurementRelease({localId:pkg.key,version:release.version,instrumentVersion:pkg.instrumentVersion,
          definition:pkg.definition,onlineProtocol:pkg.online,scope:release.scope})
      }
    }catch(error){if(error instanceof ContentReleaseError&&error.code.startsWith('CONTENT_TRAINING_'))throw error;fail('SOURCE_INVALID')}
  return expected
}
export function trainingMeasurementSourceScopeMatches(release:Stored,source:Unit['source']){
 if(source.libraryEntryId||source.standardCombination)return false // Requires the database-backed exact adapter below.
 const scope=release.scope
 if(release.provenance?.sourceKind==='STATIC_SJT_REGISTRY'&&source.kind!=='STATIC_SJT_REGISTRY')return false
 if(source.kind==='STATIC_SJT_REGISTRY')return release.layer==='MEASUREMENT'&&release.family==='SJT'&&scope.kind==='PLATFORM'&&scope.ownerId===undefined&&source.ownerId===undefined
  &&release.provenance.sourceKind==='STATIC_SJT_REGISTRY'&&release.provenance.mappingId===source.id
  &&release.provenance.instrumentKey===source.instrumentKey&&release.provenance.instrumentVersion===source.instrumentVersion
  &&release.content.instrumentVersion===source.instrumentVersion&&digest.safeParse(release.provenance.contentDigest).success
 if(scope.kind==='SHARED'||!source.ownerId)return false
 const resourceId=source.kind==='COGNITIVE_CONFIG'?source.assignmentId:source.id
 return scope.kind!=='PRIVATE'||scope.product==='TRAINING'&&scope.ownerId===source.ownerId&&scope.resourceId===resourceId
}
function libraryPresentationMode(release:Stored):'ALL_AT_ONCE'|'ONE_BY_ONE'|'RUNNER_DEFAULT'{
 if(release.layer!=='MEASUREMENT')fail('SOURCE_MISMATCH')
 const mode=release.content.executable.presentationMode
 if(mode!=='ALL_AT_ONCE'&&mode!=='ONE_BY_ONE'&&mode!=='RUNNER_DEFAULT')fail('SOURCE_MISMATCH')
 return mode
}
async function readExactLibrarySource(db:Prisma.TransactionClient,release:Stored,source:Unit['source'],purpose:'NEW_USE'|'FROZEN_IDENTITY'){
 if(source.kind!=='SCALE'||!source.libraryEntryId)fail('SCOPE_DENIED')
 const scale=await db.scale.findUnique({where:{id:source.id}})
 if(!scale||scale.libraryEntryId!==source.libraryEntryId||scale.creatorId!==source.ownerId)fail('SCOPE_DENIED')
 const exact=await readLibraryScaleMeasurementSource(db,scale,purpose)
 if(exact.release.releaseId!==release.releaseId||exact.release.contentHash!==release.contentHash
   ||canonicalHash(exact.release.scope)!==canonicalHash(release.scope))fail('SOURCE_MISMATCH')
 return exact
}
/** Frozen consumers validate the real platform wrapper, never a client-provided
 * entry marker or a widened PRIVATE scope. Their existing lifecycle/stop policy
 * remains at each collection or historical-report boundary. */
export async function trainingMeasurementSourceScopeMatchesForConsumer(db:Prisma.TransactionClient,release:Stored,source:Unit['source'],context?:{compositeId:string;ownerId:string;itemId:string}){
 if(source.standardCombination){
  if(!context||release.layer!=='MEASUREMENT')fail('SCOPE_DENIED')
  const exact=await readTrainingStandardContentIdentity(db,{itemId:context.itemId,family:'SCALE',source,measurement:{releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash}},context)
  return exact.measurement.releaseId===release.releaseId&&exact.measurement.contentHash===release.contentHash
 }
 if(source.privateVersionId){
  const exact=await readExactPrivateSource(db,release,source)
  if(source.educationBinding){
   if(!context)fail('SCOPE_DENIED')
   const proof=await readEducationMarkerSource(db,source.educationBinding,context)
   if(proof.binding.product!==exact.version.entry||proof.binding.organizationId!==exact.version.organizationId||proof.binding.ownerId!==exact.version.ownerUserId)fail('SCOPE_DENIED')
  }
  return true
 }
 if(!source.libraryEntryId)return trainingMeasurementSourceScopeMatches(release,source)
 await readExactLibrarySource(db,release,source,'FROZEN_IDENTITY')
 return true
}
async function readExactPrivateSource(db:Prisma.TransactionClient,release:Stored,source:Unit['source']){
 if(source.kind!=='SCALE'||!source.privateVersionId||source.libraryEntryId)fail('SCOPE_DENIED')
 const scale=await db.scale.findUnique({where:{id:source.id}})
 if(!scale||scale.creatorId!==source.ownerId)fail('SCOPE_DENIED')
 const identity=await readPrivateRuntimeScaleSource(db,scale,source.privateVersionId)
 if(identity.release.releaseId!==release.releaseId||identity.release.contentHash!==release.contentHash
  ||canonicalHash(identity.release.scope)!==canonicalHash(release.scope))fail('SOURCE_MISMATCH')
 return identity
}
function assertScope(release:Stored,source:Unit['source']){
 if(!trainingMeasurementSourceScopeMatches(release,source))fail('SCOPE_DENIED')
}

/** New START binds exact publication pointers. Historical null/null remains
 * legacy; recovery uses the already stored attempt binding, never this selector. */
export async function prepareTrainingContentAttemptBinding(db:Prisma.TransactionClient,input:{compositeId:string;attemptId:string;epoch:number;snapshot:unknown;snapshotHash:string|null|undefined;composite:{id:string;createdBy?:string|null;items:any[]};resolvedSituational:Map<string,ResolvedSituationalRelease>}){
  if(input.snapshot==null&&input.snapshotHash==null)return null
  if(!input.snapshot||!input.snapshotHash)fail('SNAPSHOT_INVALID')
  const parsed=trainingContentSnapshotSchema.safeParse(input.snapshot)
  if(!parsed.success)fail('SNAPSHOT_INVALID')
  const snapshot=parsed.data
  if(snapshot.compositeId!==input.compositeId||canonicalHash(snapshot)!==input.snapshotHash
    ||new Set(snapshot.units.map(unit=>unit.itemId)).size!==snapshot.units.length||!input.attemptId||!Number.isSafeInteger(input.epoch)||input.epoch<1)fail('SNAPSHOT_INVALID')
  if(input.composite.id!==input.compositeId||input.composite.items.length>1000)fail('SNAPSHOT_INVALID')
  const actualItems=input.composite.items.filter(item=>item.type!=='FORM')
  const itemsById=new Map<string,any>(actualItems.map(item=>[item.id,item]))
  if(actualItems.length!==snapshot.units.length||itemsById.size!==actualItems.length)fail('SOURCE_MISMATCH')
  const releases=new Map<string,Stored>(),staticReceipts:Array<Awaited<ReturnType<typeof readStaticSjtMeasurementForStart>>>=[]
  for(const unit of snapshot.units){
    const item=itemsById.get(unit.itemId)
    if(!item||({SCALE:'SCALE',COGNITIVE:'COGNITIVE',SITUATIONAL:'SJT'} as Record<string,string>)[item.type]!==unit.family)fail('SOURCE_MISMATCH')
    if(item.type==='SCALE'&&(unit.source.kind!=='SCALE'||unit.source.id!==item.scale?.id||unit.source.ownerId!==item.scale?.creatorId))fail('SOURCE_MISMATCH')
    if(item.type==='COGNITIVE'&&(unit.source.kind!=='COGNITIVE_CONFIG'||unit.source.id!==item.cognitiveAssignment?.config?.id
      ||unit.source.assignmentId!==item.cognitiveAssignment?.id||unit.source.ownerId!==item.cognitiveAssignment?.createdBy))fail('SOURCE_MISMATCH')
    if(item.type==='SITUATIONAL'&&(!['SJT_AUTHOR_RELEASE','STATIC_SJT_REGISTRY'].includes(unit.source.kind)||unit.source.instrumentKey!==item.situationalInstrumentKey
      ||unit.source.instrumentVersion!==item.situationalInstrumentVersion))fail('SOURCE_MISMATCH')
    if(unit.source.standardCombination){
      if(!item.standardCombinationSource||canonicalHash(item.standardCombinationSource)!==canonicalHash(unit.source.standardCombination))fail('SOURCE_MISMATCH')
      const standard=await verifyStoredTrainingStandardItem(db,input.composite,item,'COLLECTION')
      if(canonicalHash(standard.reference.measurement)!==canonicalHash(unit.measurement))fail('SOURCE_MISMATCH')
      releases.set(standard.resolved.measurement.releaseId,standard.resolved.measurement)
      continue
    }
    if(unit.source.kind==='STATIC_SJT_REGISTRY'&&!releases.has(unit.measurement.releaseId)){
      const current=await readStaticSjtMeasurementForStart(db,{instrumentKey:unit.source.instrumentKey!,instrumentVersion:unit.source.instrumentVersion!})
      if(current.mapping.id!==unit.source.id||current.release.releaseId!==unit.measurement.releaseId)fail('SOURCE_MISMATCH')
      releases.set(current.release.releaseId,current.release);staticReceipts.push(current)
    }
    let release=releases.get(unit.measurement.releaseId)
    if(!release){const loaded=await getContentRelease(db,unit.measurement.releaseId,true);if(!loaded)fail('RELEASE_REQUIRED');release=loaded;releases.set(release.releaseId,release)}
    if(release.layer!=='MEASUREMENT'||release.family!==unit.family||release.status==='REVOKED'
      ||release.contentHash!==unit.measurement.contentHash||release.content.measurementHash!==unit.measurement.measurementHash)fail('BINDING_INVALID')
    const library=unit.source.libraryEntryId?await readExactLibrarySource(db,release,unit.source,'FROZEN_IDENTITY'):null
    const privateSource=unit.source.privateVersionId?await readExactPrivateSource(db,release,unit.source):null
    if(privateSource){
      if(unit.source.educationBinding){
       const exact=await readEducationMarkerSource(db,unit.source.educationBinding,{compositeId:input.compositeId,itemId:unit.itemId,ownerId:input.composite.createdBy!},'NEW_USE')
       if(exact.binding.product!==privateSource.version.entry||exact.binding.organizationId!==privateSource.version.organizationId||exact.binding.ownerId!==privateSource.version.ownerUserId)fail('SCOPE_DENIED')
      }else await assertPrivateRuntimeCompositeIdentity(db,input.compositeId,unit.source.id,unit.source.privateVersionId!)
    }
    if(!library&&!privateSource)assertScope(release,unit.source)
    if((library||privateSource)&&canonicalHash(item.scale.definition)!==canonicalHash((library??privateSource)!.definition))fail('SOURCE_MISMATCH')
    const expected=projectActualMeasurement(item,release,input.resolvedSituational,Boolean(library||privateSource))
    if(expected.family!==unit.family||prepareRelease(expected).contentHash!==unit.measurement.contentHash
      ||canonicalHash(expected.content)!==canonicalHash(release.content))fail('SOURCE_MISMATCH')
  }
  for(const unit of snapshot.units)if(unit.report){
    if(!input.composite.createdBy)fail('REPORT_SELECTION_INVALID')
    await validateTrainingReportPointer(db,{unit,compositeId:input.compositeId,ownerId:input.composite.createdBy,
      reportReleaseId:unit.report.releaseId,contentHash:unit.report.contentHash,publication:false,releases})
  }
  const binding={schemaVersion:1 as const,compositeId:input.compositeId,attemptId:input.attemptId,epoch:input.epoch,
    publicationHash:input.snapshotHash,units:snapshot.units}
  return {binding,bindingHash:canonicalHash(binding),recheckSourceLicenses:async()=>{for(const receipt of staticReceipts)await recheckStaticSjtConsumerLicense(db,receipt)}}
}
