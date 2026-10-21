import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({release:vi.fn(),media:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
vi.mock('../../modules/scale-library-governance/media',()=>({assertLibraryMediaReady:mocks.media}))
import {prepareTrainingContentSnapshot,prepareTrainingContentAttemptBinding,trainingMeasurementSourceScopeMatchesForConsumer} from '../../modules/composite/training-content-binding'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
const entryId='11111111-1111-4111-8111-111111111111',releaseId='22222222-2222-4222-8222-222222222222'
const definition=compileResearchScale('Exact library fixture',{schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'One',score:1},{optionKey:'two',label:'Two',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'one',prompt:'Synthetic item',required:true,reverse:false,dimensionKeys:['total']}]})
const release={...prepareRelease(scaleMeasurementRelease({localId:'original-draft',version:'v1',instrumentVersion:'1',definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',product:'SURVEY',ownerId:'historical-author',resourceId:'original-project'},presentationMode:'ALL_AT_ONCE'})),releaseId,status:'PUBLISHED' as const,publishedBy:'historical-author',publishedAt:new Date(0)}
const snapshot={title:'Exact library fixture',product:'SURVEY',instrumentClass:'CUSTOM_DESCRIPTIVE',compiledDefinition:definition,definition:{},mediaManifest:{schemaVersion:1,manifestHash:'a'.repeat(64),items:[],releaseIds:[releaseId]}}
let wrapper:any,row:any
const db={$queryRaw:vi.fn(),scale:{findUnique:vi.fn()}}
const composite=()=>({id:'composite',items:[{id:'item',type:'SCALE',scale:wrapper}]})
const prepare=()=>prepareTrainingContentSnapshot(db as never,composite(),new Map())
const start=(publication:any)=>prepareTrainingContentAttemptBinding(db as never,{compositeId:'composite',attemptId:'attempt',epoch:1,snapshot:publication.snapshot,snapshotHash:publication.snapshotHash,composite:composite(),resolvedSituational:new Map()})
beforeEach(()=>{
 vi.resetAllMocks();mocks.release.mockResolvedValue(release);mocks.media.mockResolvedValue(undefined)
 wrapper={id:'wrapper',code:'library:'+entryId,name:snapshot.title,creatorId:'historical-author',libraryEntryId:entryId,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1',definition,definitionHash:hashScaleDefinition(definition),measurementReleaseId:releaseId}
 row={release_id:releaseId,status:'ACTIVE',snapshot,snapshot_hash:canonicalHash(snapshot),author_id:'historical-author'}
 db.scale.findUnique.mockImplementation(async()=>wrapper)
 db.$queryRaw.mockImplementation(async(query:{strings:string[]})=>query.strings.join('').includes('WITH scale_sources')?[{kind:'SCALE',id:'wrapper',owner_id:'historical-author',measurement_release_id:releaseId,library_entry_id:entryId}]:[row])
})
describe('approved library wrapper through real Training content binding',()=>{
 it('binds the original SURVEY release and ALL_AT_ONCE hash without widening private scope',async()=>{
  const publication=await prepare(),unit=publication.snapshot.units[0]
  expect(unit.source).toEqual({kind:'SCALE',id:'wrapper',ownerId:'historical-author',libraryEntryId:entryId})
  expect(unit.measurement.contentHash).toBe(release.contentHash)
  expect((await start(publication))?.binding.units[0]).toEqual(unit)
  expect(await trainingMeasurementSourceScopeMatchesForConsumer(db as never,release,unit.source)).toBe(true)
  expect(await trainingMeasurementSourceScopeMatchesForConsumer(db as never,release,{kind:'SCALE',id:'original-draft',ownerId:'historical-author'})).toBe(false)
 })
 it('ordinary withdrawal blocks publication but not exact already-frozen identity',async()=>{
  const publication=await prepare();row.status='WITHDRAWN'
  await expect(prepare()).rejects.toThrow('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')
  await expect(start(publication)).resolves.toHaveProperty('binding')
 })
 it('rejects a forged entry marker and a nonwrapper private Scale',async()=>{
  const publication=await prepare(),source=publication.snapshot.units[0].source
  await expect(trainingMeasurementSourceScopeMatchesForConsumer(db as never,release,{...source,libraryEntryId:'33333333-3333-4333-8333-333333333333'})).rejects.toThrow('CONTENT_TRAINING_SCOPE_DENIED')
  wrapper={...wrapper,libraryEntryId:null}
  await expect(start(publication)).rejects.toThrow('CONTENT_TRAINING_SCOPE_DENIED')
 })
 it('rejects source release substitution, snapshot tampering and compiled-definition tampering',async()=>{
  const publication=await prepare(),source=publication.snapshot.units[0].source
  await expect(trainingMeasurementSourceScopeMatchesForConsumer(db as never,{...release,releaseId:'33333333-3333-4333-8333-333333333333'},source)).rejects.toThrow('CONTENT_TRAINING_SOURCE_MISMATCH')
  row.snapshot_hash='f'.repeat(64)
  await expect(start(publication)).rejects.toThrow('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')
  row.snapshot_hash=canonicalHash(snapshot);wrapper={...wrapper,definition:{...definition,respondentType:'changed'}}
  await expect(start(publication)).rejects.toThrow('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')
 })
})
