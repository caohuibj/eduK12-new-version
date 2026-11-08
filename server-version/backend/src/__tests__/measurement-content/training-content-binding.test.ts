import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({release:vi.fn(),batch:vi.fn(),decrypt:vi.fn(),staticRead:vi.fn()}))
vi.mock('../../modules/situational/static-measurement-release',()=>({readStaticSjtMeasurementForStart:mocks.staticRead}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release,getContentReleaseBatch:mocks.batch}))
vi.mock('../../modules/scale/scale-workflow.service',()=>({frozenDatabaseScaleDefinition:(scale:any)=>scale.definition}))
vi.mock('../../modules/cognitive/cognitive.security',()=>({decryptCognitivePayload:mocks.decrypt,encryptCognitivePayload:vi.fn()}))
import {prepareTrainingContentSnapshot,prepareTrainingContentAttemptBinding} from '../../modules/composite/training-content-binding'
import {compileResearchScale,compileResearchSjt} from '../../modules/survey/builder.compiler'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {sjtMeasurementRelease} from '../../modules/measurement-content/sjt'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {hashResolvedConfig} from '../../modules/cognitive/profile-freeze'
import {SURVEY_GONOGO_CONFIG} from '../../modules/survey/cognitive.definition'
import {listSituationPackages} from '../../modules/situational/situation-package.registry'
import {situationalReleaseKey,type ResolvedSituationalRelease} from '../../modules/situational/situational-release.service'
const rid='11111111-1111-4111-8111-111111111111'
const scope={kind:'PRIVATE' as const,product:'TRAINING' as const,ownerId:'source-owner',resourceId:'scale'}
const definition=()=>compileResearchScale('Training fixture',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'low',label:'少',score:1},{optionKey:'high',label:'多',score:2}],dimensions:[{dimensionKey:'effort',label:'投入',direction:'descriptive'}],
 items:[{itemKey:'one',prompt:'我愿意尝试',required:true,reverse:false,dimensionKeys:['effort']}]})
const scale=()=>({id:'scale',code:'local',instrumentVersion:'1',instrumentClass:'CUSTOM_DESCRIPTIVE',creatorId:'source-owner',definition:definition()})
const composite=()=>({id:'composite',createdBy:'different-authorized-teacher',items:[{id:'item',type:'SCALE',scale:scale()}]})
const storedScale=()=>({...prepareRelease(scaleMeasurementRelease({localId:'local',version:'1',instrumentVersion:'1',definition:definition(),instrumentClass:'CUSTOM_DESCRIPTIVE',scope})),releaseId:rid,status:'PUBLISHED'})
const row={kind:'SCALE',id:'scale',owner_id:'source-owner',measurement_release_id:rid,instrument_key:null,instrument_version:null}
const db={$queryRaw:vi.fn()}
const empty=new Map<string,ResolvedSituationalRelease>()
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64));db.$queryRaw.mockResolvedValue([row]);mocks.release.mockResolvedValue(storedScale());mocks.staticRead.mockRejectedValue(new Error('CONTENT_STATIC_SJT_MAPPING_MISSING'))
 mocks.batch.mockImplementation(async(d:any,ids:string[])=>new Map(await Promise.all([...new Set(ids)].map(async id=>[id,await mocks.release(d,id,false)] as const))))})
const prepare=(value:any=composite(),resolved=empty)=>prepareTrainingContentSnapshot(db as never,value,resolved)
const start=(publication:any,value:any=composite(),resolved=empty)=>prepareTrainingContentAttemptBinding(db as never,{compositeId:'composite',attemptId:'attempt',epoch:2,
 snapshot:publication.snapshot,snapshotHash:publication.snapshotHash,composite:value,resolvedSituational:resolved})
describe('Training compact measurement publication and START binding',()=>{
 it('pins exact source-owner private content with one source query and one release read for repeated use',async()=>{
  const value=composite();value.items.push({...value.items[0],id:'second'})
  const result=await prepare(value)
  expect(result.snapshotHash).toBe(canonicalHash(result.snapshot));expect(result.snapshot.units).toHaveLength(2)
  expect(result.snapshot.units[0]).toEqual({itemId:'item',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'source-owner'},
   measurement:{releaseId:rid,contentHash:storedScale().contentHash,measurementHash:(storedScale().content as any).measurementHash}})
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);expect(mocks.release).toHaveBeenCalledExactlyOnceWith(db,rid,true)
  expect(JSON.stringify(result.snapshot)).not.toContain('responseSets')
 })
 it('fails closed for missing pointers, wrong scope and publication lifecycle',async()=>{
  db.$queryRaw.mockResolvedValueOnce([{...row,measurement_release_id:null}]);await expect(prepare()).rejects.toThrow('CONTENT_TRAINING_RELEASE_REQUIRED')
  for(const bad of [{...scope,product:'SURVEY'},{...scope,kind:'SHARED'},{...scope,ownerId:'different'},{...scope,resourceId:'different'}]){
   mocks.release.mockResolvedValueOnce({...storedScale(),scope:bad});await expect(prepare()).rejects.toThrow('CONTENT_TRAINING_SCOPE_DENIED')
  }
  mocks.release.mockResolvedValueOnce({...storedScale(),status:'SUPERSEDED'});await expect(prepare()).rejects.toThrow('CONTENT_TRAINING_RELEASE_NOT_PUBLISHED')
 })
 it('permits historical report authoring for retired content without allowing new administration',async()=>{
  mocks.release.mockResolvedValue({...storedScale(),status:'RETIRED'})
  await expect(prepareTrainingContentSnapshot(db as never,composite(),empty,'HISTORICAL_INTERPRETATION')).resolves.toHaveProperty('snapshot')
  await expect(prepare()).rejects.toThrow('CONTENT_TRAINING_RELEASE_NOT_PUBLISHED')
  mocks.release.mockResolvedValue({...storedScale(),status:'REVOKED'})
  await expect(prepareTrainingContentSnapshot(db as never,composite(),empty,'HISTORICAL_INTERPRETATION')).rejects.toThrow('CONTENT_TRAINING_RELEASE_NOT_PUBLISHED')
 })
 it('rebuilds actual measurement and rejects a pointer to a different scoring definition',async()=>{
  const value=composite();value.items[0].scale.definition.scoring.itemRules[0].transform={type:'reverse'}
  await expect(prepare(value)).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
 })
 it('START keeps frozen pointers across retirement and rejects revocation or changed actual runtime',async()=>{
  const publication=await prepare();db.$queryRaw.mockClear();mocks.release.mockClear()
  mocks.release.mockResolvedValue({...storedScale(),status:'RETIRED'})
  const result=await start(publication)
  expect(result!.bindingHash).toBe(canonicalHash(result!.binding))
  expect(result!.binding).toMatchObject({compositeId:'composite',attemptId:'attempt',epoch:2,publicationHash:publication.snapshotHash})
  expect(db.$queryRaw).not.toHaveBeenCalled()
  // Bind-by-digest START: one unlocked batch read; a RETIRED release never waits on/holds a release row lock.
  expect(mocks.batch).toHaveBeenCalledExactlyOnceWith(db,[rid],false)
  expect(mocks.release.mock.calls.every(call=>call[2]===false)).toBe(true)
  mocks.release.mockResolvedValueOnce({...storedScale(),status:'REVOKED'})
  await expect(start(publication)).rejects.toThrow('CONTENT_TRAINING_BINDING_INVALID')
  const changed=composite();changed.items[0].scale.definition.scoring.itemRules[0].transform={type:'reverse'}
  await expect(start(publication,changed)).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
 })
 it('preserves legacy null/null and rejects partial, forged or source-substituted bindings',async()=>{
  expect(await start({snapshot:null,snapshotHash:null})).toBeNull();expect(db.$queryRaw).not.toHaveBeenCalled();expect(mocks.release).not.toHaveBeenCalled()
  const publication=await prepare()
  await expect(start({...publication,snapshotHash:null})).rejects.toThrow('CONTENT_TRAINING_SNAPSHOT_INVALID')
  await expect(start({...publication,snapshotHash:'a'.repeat(64)})).rejects.toThrow('CONTENT_TRAINING_SNAPSHOT_INVALID')
  const changed=composite();changed.items[0].scale.id='another'
  await expect(start(publication,changed)).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
  await expect(start(publication,{...composite(),items:[]})).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
 })
 it('rejects a nonpositive epoch before reading releases with a controlled conflict',async()=>{
  const publication=await prepare();mocks.release.mockClear()
  await expect(prepareTrainingContentAttemptBinding(db as never,{compositeId:'composite',attemptId:'attempt',epoch:0,
   snapshot:publication.snapshot,snapshotHash:publication.snapshotHash,composite:composite(),resolvedSituational:empty}))
   .rejects.toMatchObject({statusCode:409,message:'CONTENT_TRAINING_SNAPSHOT_INVALID'})
  expect(mocks.release).not.toHaveBeenCalled()
 })
 it('uses the actual Cognitive profile config and never binds a default-config release to a different profile',async()=>{
  const base={localId:'gonogo',version:'1',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG,scope:{kind:'PLATFORM' as const}}
  const effective={...SURVEY_GONOGO_CONFIG,stimulusMs:900}
  const value={id:'composite',items:[{id:'cog',type:'COGNITIVE',cognitiveAssignment:{id:'assignment',createdBy:'source-owner',
   config:{...base,id:'config'},resolvedConfigSnapshotEncrypted:'encrypted',resolvedConfigHash:hashResolvedConfig(effective)}}]}
  db.$queryRaw.mockResolvedValue([{kind:'COGNITIVE_CONFIG',id:'config',assignment_id:'assignment',owner_id:'source-owner',measurement_release_id:rid}]);mocks.decrypt.mockReturnValue(effective)
  mocks.release.mockResolvedValue({...prepareRelease(cognitiveMeasurementRelease(base)),releaseId:rid,status:'PUBLISHED'})
  await expect(prepare(value)).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
  mocks.release.mockResolvedValue({...prepareRelease(cognitiveMeasurementRelease({...base,config:effective})),releaseId:rid,status:'PUBLISHED'})
  const publication=await prepare(value);expect(publication.snapshot.units[0].source).toMatchObject({id:'config',assignmentId:'assignment'})
  await expect(start(publication,value)).resolves.toHaveProperty('binding')
  value.items[0].cognitiveAssignment.resolvedConfigHash='f'.repeat(64)
  await expect(prepare(value)).rejects.toThrow('CONTENT_TRAINING_COGNITIVE_PROFILE_INVALID')
 })
 it('never substitutes an author row for a static SJT registry package',async()=>{
  const pkg=listSituationPackages()[0];expect(pkg).toBeDefined()
  await expect(prepare({id:'composite',items:[{id:'static',type:'SITUATIONAL',situationalInstrumentKey:pkg.key,situationalInstrumentVersion:pkg.instrumentVersion}]})).rejects.toThrow('CONTENT_STATIC_SJT_MAPPING_MISSING')
  expect(db.$queryRaw).not.toHaveBeenCalled();expect(mocks.release).not.toHaveBeenCalled()
 })
 it('requires an exact SJT author pointer and compares the resolved package instead of guessing a static ID',async()=>{
  const pkg=compileResearchSjt('test',{schemaVersion:1,respondentType:'student_self_report',scenarioKey:'classroom',title:'课堂',stimulus:'你想讨论。',
   author:'研究者',sourceNote:'自编',licenseStatus:'self_authored',redistribution:'allowed',metrics:[{metricKey:'effort',label:'投入',direction:'descriptive'}],
   questions:[{questionKey:'first',prompt:'怎么做？',options:[{optionKey:'try',label:'参与',contributions:{effort:2}},{optionKey:'wait',label:'等待',contributions:{effort:0}}]},
   {questionKey:'next',prompt:'接着？',options:[{optionKey:'try',label:'继续',contributions:{effort:2}},{optionKey:'wait',label:'离开',contributions:{effort:0}}]}]}).package
  const value={id:'composite',items:[{id:'sjt',type:'SITUATIONAL',situationalInstrumentKey:pkg.key,situationalInstrumentVersion:pkg.instrumentVersion}]}
  const resolved=new Map([[situationalReleaseKey({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}),{situationPackage:pkg} as ResolvedSituationalRelease]])
  db.$queryRaw.mockResolvedValue([]);await expect(prepare(value,resolved)).rejects.toThrow('CONTENT_TRAINING_RELEASE_REQUIRED')
  db.$queryRaw.mockResolvedValue([{kind:'SJT_AUTHOR_RELEASE',id:'author-release',owner_id:'source-owner',measurement_release_id:rid,instrument_key:pkg.key,instrument_version:pkg.instrumentVersion}])
  mocks.release.mockResolvedValue({...prepareRelease(sjtMeasurementRelease({localId:pkg.key,version:'1',instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,onlineProtocol:pkg.online,scope:{kind:'PLATFORM'}})),releaseId:rid,status:'PUBLISHED'})
  const publication=await prepare(value,resolved);expect(publication.snapshot.units[0].source.id).toBe('author-release')
  await expect(start(publication,value,resolved)).resolves.toHaveProperty('binding')
  await expect(start(publication,value,empty)).rejects.toThrow('CONTENT_TRAINING_SJT_SOURCE_INVALID')
 })
})

it('keeps two effective profile assignment pointers distinct for the same config',async()=>{
 const base={localId:'gonogo',version:'1',testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:SURVEY_GONOGO_CONFIG}
 const effective={...SURVEY_GONOGO_CONFIG,stimulusMs:900},second='22222222-2222-4222-8222-222222222222'
 const value={id:'composite',items:[{id:'first',type:'COGNITIVE',cognitiveAssignment:{id:'a1',createdBy:'teacher',config:{...base,id:'config'},resolvedConfigSnapshotEncrypted:null,resolvedConfigHash:null}},
  {id:'second',type:'COGNITIVE',cognitiveAssignment:{id:'a2',createdBy:'teacher',config:{...base,id:'config'},resolvedConfigSnapshotEncrypted:'profile',resolvedConfigHash:hashResolvedConfig(effective)}}]}
 db.$queryRaw.mockResolvedValue([{kind:'COGNITIVE_CONFIG',id:'config',assignment_id:'a1',owner_id:'teacher',measurement_release_id:rid},
  {kind:'COGNITIVE_CONFIG',id:'config',assignment_id:'a2',owner_id:'teacher',measurement_release_id:second}])
 mocks.decrypt.mockReturnValue(effective)
 mocks.release.mockImplementation(async(_db,id)=>({...prepareRelease(cognitiveMeasurementRelease({...base,config:id===rid?SURVEY_GONOGO_CONFIG:effective,
  scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:id===rid?'a1':'a2'}})),releaseId:id,status:'PUBLISHED'}))
 const result=await prepare(value)
 expect(result.snapshot.units.map(unit=>unit.measurement.releaseId)).toEqual([rid,second])
 expect(result.snapshot.units.map(unit=>unit.source.assignmentId)).toEqual(['a1','a2'])
 const query=db.$queryRaw.mock.calls[0][0].strings.join(' ')
 expect(query).toContain('COALESCE(a.measurement_release_id,c.measurement_release_id)');expect(query).toContain('FOR SHARE OF a,c')
 await expect(start(result,value)).resolves.toHaveProperty('binding')
})
it('START preserves the frozen private report even when revoked, with one read per release',async()=>{
 const publication=await prepare(),reportId='33333333-3333-4333-8333-333333333333'
 const measurement=storedScale(),metricKey=(measurement.content as any).metrics[0].metricKey
 const report={...prepareRelease({layer:'REPORT',family:'SCALE',key:'report',version:'1',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:composite().createdBy,resourceId:'composite'},assetRefs:[],sourceReleaseId:null,
 content:{projectionVersion:1,measurements:[{releaseId:rid,contentHash:measurement.contentHash}],metricKeys:[metricKey],audience:'teacher',language:'zh-CN',generatorVersion:'declarative-report-v1',template:{blocks:[{type:'METRIC',metricKey,display:'RAW'}],limitations:[]}}}),releaseId:reportId,status:'REVOKED'}
 publication.snapshot.units[0].report={releaseId:reportId,contentHash:report.contentHash}
 publication.snapshotHash=canonicalHash(publication.snapshot)
 mocks.release.mockClear();mocks.release.mockImplementation(async(_db,id)=>id===rid?measurement:report)
 const bound=await start(publication)
 expect(bound!.binding.units[0].report).toEqual(publication.snapshot.units[0].report)
 expect(mocks.release).toHaveBeenCalledTimes(2)
 mocks.release.mockImplementation(async(_db,id)=>id===rid?measurement:{...report,scope:{...report.scope,ownerId:'other'}})
 await expect(start(publication)).rejects.toThrow('REPORT_SELECTION_INVALID')
})

 it('binds a real static mapping without a fabricated owner, and START preserves its exact current licensed pointer',async()=>{
  const pkg=listSituationPackages().find(p=>p.key==='sjt-assertiveness-golden')!,mappingId='44444444-4444-4444-8444-444444444444'
  const value={id:'composite',items:[{id:'static',type:'SITUATIONAL',situationalInstrumentKey:pkg.key,situationalInstrumentVersion:pkg.instrumentVersion}]}
  const identity={instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}
  const resolved=new Map([[situationalReleaseKey(identity),{situationPackage:pkg} as ResolvedSituationalRelease]])
  const release={...prepareRelease(sjtMeasurementRelease({localId:pkg.key,version:'registry-v1',instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,scope:{kind:'PLATFORM'},
   provenance:{sourceKind:'STATIC_SJT_REGISTRY',mappingId,contentDigest:'a'.repeat(64),...identity}})),releaseId:rid,status:'PUBLISHED'}
  const mapping={id:mappingId,instrument_key:pkg.key,instrument_version:pkg.instrumentVersion}
  mocks.staticRead.mockResolvedValue({mapping,release});db.$queryRaw.mockResolvedValue([])
  const publication=await prepare(value,resolved)
  expect(publication.snapshot.units[0].source).toEqual({kind:'STATIC_SJT_REGISTRY',id:mappingId,...identity})
  expect(mocks.staticRead).toHaveBeenCalledWith(db,identity,'PUBLISH')
  await expect(start(publication,value,resolved)).resolves.toHaveProperty('binding')
  mocks.staticRead.mockResolvedValue({mapping:{...mapping,id:'other'},release})
  await expect(start(publication,value,resolved)).rejects.toThrow('SOURCE_MISMATCH')
  mocks.staticRead.mockResolvedValue({mapping,release:{...release,provenance:{...release.provenance,mappingId:'other'}}})
  await expect(start(publication,value,resolved)).rejects.toThrow('SCOPE_DENIED')
 })

 it('attaches and resolves legacy side-table scale artifacts for schemaVersion=1 education and standardCombination units',async()=>{
  const {attachLegacyScaleArtifactsForSnapshot,resolveTrainingScaleArtifacts}=await import('../../modules/composite/training-content-binding')
  const {getPublishedScaleArtifactHash}=await import('../../modules/assessment-runtime/published-scale-artifact')
  const publication=await prepare()
  const runtimeArtifacts=new Map<string,any>()
  const legacyRows:Array<{item_id:string;release_id:string;content_hash:string;artifact_hash:string}>=[]
  const tx={
   $queryRaw:vi.fn(async(query:any,...rest:any[])=>{
    const strings=Array.isArray(query)?query:query.strings
    const values=Array.isArray(query)?rest:query.values
    const sql=strings?.join(' ')??String(query)
    if(sql.includes('INSERT INTO assessment_runtime_artifacts')){
     const [artifactHash,formatVersion,plaintextBytes,payloadEncrypted]=values
     runtimeArtifacts.set(artifactHash,{artifactHash,formatVersion,plaintextBytes,payloadEncrypted})
     return [{artifact_hash:artifactHash}]
    }
    if(sql.includes('FROM assessment_runtime_artifacts')){
     return [...runtimeArtifacts.values()]
    }
    if(sql.includes('FROM training_legacy_scale_artifacts')){
     return legacyRows
    }
    return []
   }),
   $executeRaw:vi.fn(async(query:any,...rest:any[])=>{
    const values=Array.isArray(query)?rest:query.values
    const [compositeId,snapshotHash,itemId,artifactHash,releaseId,contentHash]=values
    expect(compositeId).toBe('composite')
    expect(snapshotHash).toBe(publication.snapshotHash)
    legacyRows.push({item_id:itemId,release_id:releaseId,content_hash:contentHash,artifact_hash:artifactHash})
    return 1
   }),
  }
  await attachLegacyScaleArtifactsForSnapshot(tx as never,composite(),publication.snapshot,publication.snapshotHash,publication.releases)
  expect(legacyRows).toHaveLength(1)
  expect(runtimeArtifacts.size).toBe(1)

  const resolvedMap=await resolveTrainingScaleArtifacts(tx as never,{
   compositeId:'composite',
   snapshot:publication.snapshot,
   snapshotHash:publication.snapshotHash,
   educationComposition:{compositeId:'composite',compositionId:'comp-1',versionId:'ver-1',snapshotHash:publication.snapshotHash} as any,
  })
  expect(resolvedMap.size).toBe(1)
  const resolvedArtifact=resolvedMap.get('item')!
  expect(resolvedArtifact.instrumentKey).toBe('local')
  expect(getPublishedScaleArtifactHash(resolvedArtifact)).toBe(legacyRows[0].artifact_hash)
 })

 it('fails closed when schemaVersion=2 snapshot has missing unit.artifact for eligible unit', async () => {
  const { resolveTrainingScaleArtifacts } = await import('../../modules/composite/training-content-binding')
  const publication = await prepare()
  const snapshotV2 = {
    ...publication.snapshot,
    schemaVersion: 2,
    units: publication.snapshot.units.map(u => ({ ...u, artifact: undefined })),
  }
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() }
  await expect(resolveTrainingScaleArtifacts(tx as never, {
    compositeId: 'composite',
    snapshot: snapshotV2,
    snapshotHash: 'some-hash',
    educationComposition: { compositeId: 'composite' } as any,
  })).rejects.toThrow('BINDING_INVALID')
 })

 it('fails closed when legacy side-table artifact rows are partially missing for schemaVersion=1 scale units', async () => {
  const { resolveTrainingScaleArtifacts } = await import('../../modules/composite/training-content-binding')
  const publication = await prepare()
  const unit1 = publication.snapshot.units[0]
  const unit2 = { ...unit1, itemId: 'item_2' }
  const multiSnapshot = {
    ...publication.snapshot,
    units: [unit1, unit2],
  }
  const partialRows = [{
    item_id: 'item',
    release_id: unit1.measurement.releaseId,
    content_hash: unit1.measurement.contentHash,
    artifact_hash: 'a'.repeat(64),
  }]
  const tx = {
    $queryRaw: vi.fn(async (query: any) => {
      const sql = String(Array.isArray(query) ? query.join(' ') : query?.strings?.join(' ') ?? query)
      if (sql.includes('FROM training_legacy_scale_artifacts')) return partialRows
      return []
    }),
    $executeRaw: vi.fn(),
  }
  await expect(resolveTrainingScaleArtifacts(tx as never, {
    compositeId: 'composite',
    snapshot: multiSnapshot,
    snapshotHash: 'multi-hash',
    educationComposition: { compositeId: 'composite' } as any,
  })).rejects.toThrow('BINDING_INVALID')
 })

 it('fails closed when artifactsRequired=true on schemaVersion=1 snapshot and all side-table records are missing', async () => {
  const { resolveTrainingScaleArtifacts } = await import('../../modules/composite/training-content-binding')
  const publication = await prepare()
  const requiredSnapshot = {
    ...publication.snapshot,
    artifactsRequired: true,
  }
  const tx = {
    $queryRaw: vi.fn(async (query: any) => {
      const sql = String(Array.isArray(query) ? query.join(' ') : query?.strings?.join(' ') ?? query)
      if (sql.includes('FROM training_legacy_scale_artifacts')) return []
      return []
    }),
    $executeRaw: vi.fn(),
  }
  await expect(resolveTrainingScaleArtifacts(tx as never, {
    compositeId: 'composite',
    snapshot: requiredSnapshot,
    snapshotHash: 'required-hash',
    educationComposition: { compositeId: 'composite' } as any,
  })).rejects.toThrow('BINDING_INVALID')
 })

 it('permits historical schemaVersion=1 snapshot without artifactsRequired to fall back when side-table has 0 rows', async () => {
  const { resolveTrainingScaleArtifacts } = await import('../../modules/composite/training-content-binding')
  const publication = await prepare()
  const historicalSnapshot = {
    ...publication.snapshot,
    artifactsRequired: undefined,
  }
  const tx = {
    $queryRaw: vi.fn(async (query: any) => {
      const sql = String(Array.isArray(query) ? query.join(' ') : query?.strings?.join(' ') ?? query)
      if (sql.includes('FROM training_legacy_scale_artifacts')) return []
      return []
    }),
    $executeRaw: vi.fn(),
  }
  const resolved = await resolveTrainingScaleArtifacts(tx as never, {
    compositeId: 'composite',
    snapshot: historicalSnapshot,
    snapshotHash: 'historical-hash',
    educationComposition: { compositeId: 'composite' } as any,
  })
  expect(resolved.size).toBe(0)
 })

 it('sets artifactsRequired=true on new publications in attachPublishedScaleArtifacts', async () => {
  const { attachPublishedScaleArtifacts } = await import('../../modules/composite/training-content-binding')
  const publication = await prepare()
  const tx = {
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 1),
  }
  const result = await attachPublishedScaleArtifacts(tx as never, composite(), publication)
  expect(result.snapshot.artifactsRequired).toBe(true)
 })
