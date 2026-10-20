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
const sourceSchema=z.object({kind:z.enum(['SCALE','COGNITIVE_CONFIG','SJT_AUTHOR_RELEASE']),id:text,ownerId:text,
  assignmentId:text.optional(),instrumentKey:text.optional(),instrumentVersion:text.optional()}).strict()
const unitSchema=z.object({itemId:text,family:z.enum(['SCALE','COGNITIVE','SJT']),source:sourceSchema,
  measurement:z.object({releaseId:z.string().uuid(),contentHash:digest,measurementHash:digest}).strict()}).strict()
export const trainingContentSnapshotSchema=z.object({schemaVersion:z.literal(1),compositeId:text,units:z.array(unitSchema).max(1000)}).strict()
export type TrainingContentSnapshot=z.infer<typeof trainingContentSnapshotSchema>
type Unit=TrainingContentSnapshot['units'][number]
type Stored=NonNullable<Awaited<ReturnType<typeof getContentRelease>>>
type SourceRow={kind:Unit['source']['kind'];id:string;owner_id:string|null;measurement_release_id:string|null;instrument_key:string|null;instrument_version:string|null}
class TrainingContentError extends ContentReleaseError { readonly statusCode=409 }
function fail(code:string):never { throw new TrainingContentError('CONTENT_TRAINING_'+code) }

/** Only server-loaded composite items are accepted. Caller must complete existing
 * source access/license/material gates before calling. Existing material grants
 * authorize attachment; their revocation does not invalidate an attached draft. */
export async function prepareTrainingContentSnapshot(db:Prisma.TransactionClient,composite:{id:string;items:any[]},
  resolvedSituational:Map<string,ResolvedSituationalRelease>,purpose:'NEW_ADMINISTRATION'|'HISTORICAL_INTERPRETATION'='NEW_ADMINISTRATION'){
  if(!composite.id||!Array.isArray(composite.items)||composite.items.length>1000)fail('SNAPSHOT_INVALID')
  const items=composite.items.filter(item=>item.type!=='FORM')
  if(items.some(item=>!['SCALE','COGNITIVE','SITUATIONAL'].includes(item.type))||new Set(items.map(item=>item.id)).size!==items.length)fail('SOURCE_INVALID')
  const scaleIds=[...new Set<string>(items.filter(item=>item.type==='SCALE').map(item=>item.scale?.id))]
  const configIds=[...new Set<string>(items.filter(item=>item.type==='COGNITIVE').map(item=>item.cognitiveAssignment?.config?.id))]
  const sjt=items.filter(item=>item.type==='SITUATIONAL').map(item=>({instrumentKey:item.situationalInstrumentKey,instrumentVersion:item.situationalInstrumentVersion}))
  // The existing resolver prioritizes installed package keys over author rows.
  // Do not invent an author-release identity for a static registry package.
  const staticSjtKeys=new Set(sjt.length?listSituationPackages().map(pkg=>pkg.key):[])
  if(sjt.some(identity=>staticSjtKeys.has(identity.instrumentKey)))fail('RELEASE_REQUIRED')
  if([...scaleIds,...configIds].some(id=>typeof id!=='string'||!id)||sjt.some(identity=>!identity.instrumentKey||!identity.instrumentVersion))fail('SOURCE_INVALID')
  // One bounded source-pointer query. CTEs lock the actual source rows before
  // release locks; no client pointer or default registry selection is consulted.
  const rows=items.length?await db.$queryRaw<SourceRow[]>(Prisma.sql`
    WITH scale_sources AS (SELECT id,creator_id,measurement_release_id FROM scales
      WHERE id IN (${Prisma.join(scaleIds.length?scaleIds:[''])}) ORDER BY id FOR SHARE),
    cognitive_sources AS (SELECT id,measurement_release_id FROM cognitive_test_configs
      WHERE id IN (${Prisma.join(configIds.length?configIds:[''])}) ORDER BY id FOR SHARE),
    sjt_sources AS (SELECT id,author_id,measurement_release_id,instrument_key,instrument_version FROM sjt_author_releases
      WHERE ${sjt.length?Prisma.join(sjt.map(identity=>Prisma.sql`(instrument_key=${identity.instrumentKey} AND instrument_version=${identity.instrumentVersion})`),' OR '):Prisma.sql`FALSE`}
      ORDER BY id FOR SHARE)
    SELECT 'SCALE' AS kind,id,creator_id AS owner_id,measurement_release_id,NULL::text AS instrument_key,NULL::text AS instrument_version FROM scale_sources
    UNION ALL SELECT 'COGNITIVE_CONFIG',id,NULL::text,measurement_release_id,NULL::text,NULL::text FROM cognitive_sources
    UNION ALL SELECT 'SJT_AUTHOR_RELEASE',id,author_id,measurement_release_id,instrument_key,instrument_version FROM sjt_sources`):[]
  const bySource=new Map(rows.map(row=>[`${row.kind}:${row.id}`,row]))
  const bySjt=new Map(rows.filter(row=>row.kind==='SJT_AUTHOR_RELEASE').map(row=>[situationalReleaseKey({instrumentKey:row.instrument_key!,instrumentVersion:row.instrument_version!}),row]))
  const releases=new Map<string,Stored>()
  const read=async(id:string)=>{
    let release=releases.get(id)
    if(!release){const loaded=await getContentRelease(db,id,true);if(!loaded)fail('RELEASE_REQUIRED');release=loaded;releases.set(id,release)}
    return release
  }
  const units:Unit[]=[]
  for(const item of items){
    const identity=item.type==='SITUATIONAL'?{instrumentKey:item.situationalInstrumentKey,instrumentVersion:item.situationalInstrumentVersion}:null
    const row=item.type==='SCALE'?bySource.get(`SCALE:${item.scale.id}`):item.type==='COGNITIVE'
      ?bySource.get(`COGNITIVE_CONFIG:${item.cognitiveAssignment.config.id}`):bySjt.get(situationalReleaseKey(identity!))
    if(!row?.measurement_release_id)fail('RELEASE_REQUIRED')
    if(item.type==='SCALE'&&row.owner_id!==item.scale.creatorId)fail('SOURCE_MISMATCH')
    const release=await read(row.measurement_release_id)
    if(release.layer!=='MEASUREMENT'||release.status==='REVOKED'||purpose==='NEW_ADMINISTRATION'&&release.status!=='PUBLISHED')fail('RELEASE_NOT_PUBLISHED')
    const source:Unit['source']={kind:row.kind,id:row.id,ownerId:row.owner_id??item.cognitiveAssignment?.createdBy,
      ...(item.type==='COGNITIVE'?{assignmentId:item.cognitiveAssignment.id}:{}),
      ...(identity?{instrumentKey:identity.instrumentKey,instrumentVersion:identity.instrumentVersion}:{})}
    assertScope(release,source)
    const expected=projectActualMeasurement(item,release,resolvedSituational)
    const projected=prepareRelease(expected)
    if(release.family!==expected.family||projected.contentHash!==release.contentHash
      ||canonicalHash(expected.content)!==canonicalHash(release.content))fail('SOURCE_MISMATCH')
    units.push({itemId:item.id,family:release.family,source,measurement:{releaseId:release.releaseId,
      contentHash:release.contentHash,measurementHash:release.content.measurementHash}})
  }
  const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:composite.id,units})
  return {snapshot,snapshotHash:canonicalHash(snapshot),releases}
}
function projectActualMeasurement(item:any,release:Stored,resolvedSituational:Map<string,ResolvedSituationalRelease>):ReleaseInput{
  let expected:ReleaseInput
    try{
      if(item.type==='SCALE')expected=scaleMeasurementRelease({localId:item.scale.code,version:release.version,
        instrumentVersion:item.scale.instrumentVersion,definition:frozenDatabaseScaleDefinition(item.scale),
        instrumentClass:item.scale.instrumentClass,scope:release.scope})
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
function assertScope(release:Stored,source:Unit['source']){
  const scope=release.scope
  if(scope.kind==='SHARED'||!source.ownerId)fail('SCOPE_DENIED')
  // Config rows have no creator. A private cognitive source must therefore be
  // scoped to the actual owned assignment, never infer ownership of a config.
  const resourceId=source.kind==='COGNITIVE_CONFIG'?source.assignmentId:source.id
  if(scope.kind==='PRIVATE'&&(scope.product!=='TRAINING'||scope.ownerId!==source.ownerId||scope.resourceId!==resourceId))fail('SCOPE_DENIED')
}

/** New START binds exact publication pointers. Historical null/null remains
 * legacy; recovery uses the already stored attempt binding, never this selector. */
export async function prepareTrainingContentAttemptBinding(db:Prisma.TransactionClient,input:{compositeId:string;attemptId:string;epoch:number;snapshot:unknown;snapshotHash:string|null|undefined;composite:{id:string;items:any[]};resolvedSituational:Map<string,ResolvedSituationalRelease>}){
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
  const releases=new Map<string,Stored>()
  for(const unit of snapshot.units){
    const item=itemsById.get(unit.itemId)
    if(!item||({SCALE:'SCALE',COGNITIVE:'COGNITIVE',SITUATIONAL:'SJT'} as Record<string,string>)[item.type]!==unit.family)fail('SOURCE_MISMATCH')
    if(item.type==='SCALE'&&(unit.source.kind!=='SCALE'||unit.source.id!==item.scale?.id||unit.source.ownerId!==item.scale?.creatorId))fail('SOURCE_MISMATCH')
    if(item.type==='COGNITIVE'&&(unit.source.kind!=='COGNITIVE_CONFIG'||unit.source.id!==item.cognitiveAssignment?.config?.id
      ||unit.source.assignmentId!==item.cognitiveAssignment?.id||unit.source.ownerId!==item.cognitiveAssignment?.createdBy))fail('SOURCE_MISMATCH')
    if(item.type==='SITUATIONAL'&&(unit.source.kind!=='SJT_AUTHOR_RELEASE'||unit.source.instrumentKey!==item.situationalInstrumentKey
      ||unit.source.instrumentVersion!==item.situationalInstrumentVersion))fail('SOURCE_MISMATCH')
    let release=releases.get(unit.measurement.releaseId)
    if(!release){const loaded=await getContentRelease(db,unit.measurement.releaseId,true);if(!loaded)fail('RELEASE_REQUIRED');release=loaded;releases.set(release.releaseId,release)}
    if(release.layer!=='MEASUREMENT'||release.family!==unit.family||release.status==='REVOKED'
      ||release.contentHash!==unit.measurement.contentHash||release.content.measurementHash!==unit.measurement.measurementHash)fail('BINDING_INVALID')
    assertScope(release,unit.source)
    const expected=projectActualMeasurement(item,release,input.resolvedSituational)
    if(expected.family!==unit.family||prepareRelease(expected).contentHash!==unit.measurement.contentHash
      ||canonicalHash(expected.content)!==canonicalHash(release.content))fail('SOURCE_MISMATCH')
  }
  const binding={schemaVersion:1 as const,compositeId:input.compositeId,attemptId:input.attemptId,epoch:input.epoch,
    publicationHash:input.snapshotHash,units:snapshot.units}
  return {binding,bindingHash:canonicalHash(binding)}
}
