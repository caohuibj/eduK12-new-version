import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({releaseBatch:vi.fn(),mediaBatch:vi.fn(),collection:vi.fn(),prefetch:vi.fn(),policy:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({
 getContentRelease:async()=>{throw new Error('singular getContentRelease must not be used on the batch path')},
 getContentReleaseBatch:mocks.releaseBatch,
}))
vi.mock('../../modules/scale-library-governance/media',()=>({
 assertLibraryMediaReady:async()=>{throw new Error('singular Ready must not be used on the batch path')},
 assertLibraryMediaReadyBatch:mocks.mediaBatch,
}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:mocks.collection}))
vi.mock('../../modules/assessment-governance/tool-entry-policy',()=>({
 assertToolEntryPolicy:mocks.policy,
 prefetchToolPolicyAdmission:mocks.prefetch,
}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {prepareRelease} from '../../modules/measurement-content/release'
import {readLibraryScaleMeasurementSources} from '../../modules/scale-library-governance/training-source'
import {assertLibraryUseGrantsCurrent,assertLibraryUseGrantCurrent} from '../../modules/scale-library-governance/usage'

const definition=compileResearchScale('Batch library fixture',{schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'one',label:'One',score:1},{optionKey:'two',label:'Two',score:2}],
 dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'one',prompt:'Synthetic item',required:true,reverse:false,dimensionKeys:['total']}]})
const releaseA={...prepareRelease(scaleMeasurementRelease({localId:'a',version:'v1',instrumentVersion:'1',definition,instrumentClass:'CUSTOM_DESCRIPTIVE',
 scope:{kind:'PRIVATE',product:'SURVEY',ownerId:'author',resourceId:'project'},presentationMode:'ALL_AT_ONCE'})),releaseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'PUBLISHED' as const}
const releaseB={...prepareRelease(scaleMeasurementRelease({localId:'b',version:'v1',instrumentVersion:'1',definition,instrumentClass:'CUSTOM_DESCRIPTIVE',
 scope:{kind:'PRIVATE',product:'SURVEY',ownerId:'author',resourceId:'project'},presentationMode:'ALL_AT_ONCE'})),releaseId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:'PUBLISHED' as const}
const media={schemaVersion:1 as const,manifestHash:'a'.repeat(64),items:[],releaseIds:[releaseA.releaseId]}
const snapshot=(releaseId:string)=>({title:'Batch library fixture',product:'SURVEY',instrumentClass:'CUSTOM_DESCRIPTIVE',compiledDefinition:definition,definition:{},mediaManifest:{...media,releaseIds:[releaseId]}})
const entryA='11111111-1111-4111-8111-111111111111',entryB='22222222-2222-4222-8222-222222222222'
function wrapper(id:string,entryId:string,releaseId:string){
 return {id,code:'library:'+entryId,name:'Batch library fixture',creatorId:'author',libraryEntryId:entryId,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',
  instrumentVersion:'1',definition,definitionHash:hashScaleDefinition(definition),measurementReleaseId:releaseId} as any
}
function entryRow(id:string,releaseId:string,status='ACTIVE'){
 return {id,release_id:releaseId,status,snapshot:snapshot(releaseId),snapshot_hash:canonicalHash(snapshot(releaseId)),author_id:'author'}
}

beforeEach(()=>{
 vi.resetAllMocks()
 mocks.releaseBatch.mockImplementation(async(_db:any,ids:string[])=>{
  const out=new Map<string,any>()
  for(const id of ids){if(id===releaseA.releaseId)out.set(id,releaseA);if(id===releaseB.releaseId)out.set(id,releaseB)}
  return out
 })
 mocks.mediaBatch.mockResolvedValue(undefined)
 mocks.collection.mockResolvedValue(undefined)
 mocks.prefetch.mockResolvedValue(undefined)
 mocks.policy.mockResolvedValue(undefined)
})

describe('batch library measurement sources',()=>{
 it('loads many wrappers with one entry query, one release batch and one media batch',async()=>{
  const rows=[entryRow(entryA,releaseA.releaseId),entryRow(entryB,releaseB.releaseId)]
  const tx={$queryRaw:vi.fn(async()=>rows)}
  const scales=[wrapper('sA',entryA,releaseA.releaseId),wrapper('sB',entryB,releaseB.releaseId)]
  const got=await readLibraryScaleMeasurementSources(tx as never,scales,'NEW_USE')
  expect([...got.keys()].sort()).toEqual(['sA','sB'])
  expect(got.get('sA')!.release.releaseId).toBe(releaseA.releaseId)
  expect(got.get('sB')!.release.releaseId).toBe(releaseB.releaseId)
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  expect(mocks.releaseBatch).toHaveBeenCalledTimes(1)
  expect(mocks.mediaBatch).toHaveBeenCalledTimes(1)
  expect(mocks.mediaBatch.mock.calls[0][1].map((i:any)=>i.entryId).sort()).toEqual([entryA,entryB])
 })
 it('fails closed when one wrapper drifts without admitting the others',async()=>{
  const rows=[entryRow(entryA,releaseA.releaseId),entryRow(entryB,releaseB.releaseId)]
  const tx={$queryRaw:vi.fn(async()=>rows)}
  const bad={...wrapper('sB',entryB,releaseB.releaseId),definition:{...definition,respondentType:'changed'}}
  await expect(readLibraryScaleMeasurementSources(tx as never,[wrapper('sA',entryA,releaseA.releaseId),bad],'NEW_USE'))
   .rejects.toThrow('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')
  expect(mocks.releaseBatch).not.toHaveBeenCalled()
  expect(mocks.mediaBatch).not.toHaveBeenCalled()
 })
 it('singular wrapper reuses the batch path',async()=>{
  const rows=[entryRow(entryA,releaseA.releaseId)]
  const tx={$queryRaw:vi.fn(async()=>rows)}
  const {readLibraryScaleMeasurementSource}=await import('../../modules/scale-library-governance/training-source')
  const got=await readLibraryScaleMeasurementSource(tx as never,wrapper('sA',entryA,releaseA.releaseId),'NEW_USE')
  expect(got.release.releaseId).toBe(releaseA.releaseId)
  expect(mocks.mediaBatch).toHaveBeenCalledTimes(1)
 })
})

describe('batch library use grants',()=>{
 function grant(entryId:string,id:string){
  return {id,entry_id:entryId,user_id:'owner',scope_kind:'USER',organization_id:null,product:'TRAINING',issuer_id:'issuer',
   authority_grant_id:null,material_grant_id:'mat-'+id,survey_tool_grant_id:null,status:'ACTIVE',version:1,reason:null,created_at:new Date(),revoked_at:null}
 }
 it('checks many entries with set-based reads and preserves lock order release→entry→policy→grant',async()=>{
  const calls:string[]=[]
  const headers=[grant(entryA,'gA'),grant(entryB,'gB')]
  const entries=[{id:entryA,release_id:releaseA.releaseId,status:'ACTIVE',content_hash:releaseA.contentHash},
   {id:entryB,release_id:releaseB.releaseId,status:'ACTIVE',content_hash:releaseB.contentHash}]
  const tx={
   $queryRaw:vi.fn(async(query:any)=>{
    const sql=String(query.sql??query.strings?.join('?')??query)
    if(sql.includes('FROM scale_library_use_grants')&&sql.includes('entry_id')){calls.push('headers');return headers}
    if(sql.includes('FROM scale_library_entries e JOIN measurement_content_releases')){calls.push('entries');return entries}
    if(sql.includes('FROM scale_library_entries')&&sql.includes('FOR SHARE')){calls.push('lock-entries');return entries.map(e=>({id:e.id,status:e.status}))}
    if(sql.includes('FROM scale_library_use_grants')&&sql.includes('FOR SHARE')){calls.push('lock-grants');return headers}
    throw new Error('unexpected sql '+sql)
   }),
   materialGrant:{findMany:vi.fn(async({where}:{where:{id:{in:string[]}}})=>{calls.push('materials');return where.id.in.map(id=>({id}))})},
  }
  mocks.collection.mockImplementation(async()=>{calls.push('collection')})
  mocks.prefetch.mockImplementation(async()=>{calls.push('prefetch')})
  mocks.policy.mockImplementation(async()=>{calls.push('policy')})
  const got=await assertLibraryUseGrantsCurrent(tx as never,{entryIds:[entryB,entryA,entryA],userId:'owner',product:'TRAINING'})
  expect([...got.keys()].sort()).toEqual([entryA,entryB])
  expect(calls.slice(0,6)).toEqual(['headers','entries','collection','lock-entries','prefetch','policy'])
  expect(calls).toContain('lock-grants')
  expect(calls).toContain('materials')
  expect(mocks.collection).toHaveBeenCalledTimes(1)
  expect(mocks.prefetch).toHaveBeenCalledTimes(1)
  expect(mocks.policy).toHaveBeenCalledTimes(2)
 })
 it('fails closed when any requested entry lacks an ACTIVE use grant',async()=>{
  const tx={$queryRaw:vi.fn(async()=>[grant(entryA,'gA')])}
  await expect(assertLibraryUseGrantsCurrent(tx as never,{entryIds:[entryA,entryB],userId:'owner',product:'TRAINING'}))
   .rejects.toThrow('共用库使用授权已撤销')
  expect(mocks.collection).not.toHaveBeenCalled()
 })
 it('singular grant reuses the batch path',async()=>{
  const headers=[grant(entryA,'gA')]
  const entries=[{id:entryA,release_id:releaseA.releaseId,status:'ACTIVE',content_hash:releaseA.contentHash}]
  const tx={
   $queryRaw:vi.fn(async(query:any)=>{
    const sql=String(query.sql??query.strings?.join('?')??query)
    if(sql.includes('FROM scale_library_use_grants')&&sql.includes('entry_id'))return headers
    if(sql.includes('FROM scale_library_entries e JOIN'))return entries
    if(sql.includes('FROM scale_library_entries')&&sql.includes('FOR SHARE'))return [{id:entryA,status:'ACTIVE'}]
    if(sql.includes('FROM scale_library_use_grants')&&sql.includes('FOR SHARE'))return headers
    return []
   }),
   materialGrant:{findMany:vi.fn(async()=>[{id:'mat-gA'}])},
  }
  await expect(assertLibraryUseGrantCurrent(tx as never,{entryId:entryA,userId:'owner',product:'TRAINING'})).resolves.toMatchObject({id:'gA'})
 })
})

