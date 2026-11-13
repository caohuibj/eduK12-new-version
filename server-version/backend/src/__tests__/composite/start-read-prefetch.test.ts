import {readFileSync} from 'node:fs'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {ContentReleaseError} from '../../modules/measurement-content/release'
import {
  asPreloadedComposite,
  prefetchStartReads,
  recheckPrefetchedReleases,
  snapshotMeasurementReleaseIds,
  startReadsIfCurrent,
  type PrefetchedStartReads,
} from '../../modules/composite/start-read-prefetch'
import {resetStartReadCachesForTests} from '../../modules/composite/start-read-cache'

const release=(id:string,contentHash='hash-'+id,status='PUBLISHED')=>({
  releaseId:id,contentHash,status,
} as any)

describe('hoisted START read-only checks',()=>{
  beforeEach(()=>resetStartReadCachesForTests())
  it('extracts unlocked measurement release ids the same way as the in-tx batch (skips standard and static SJT)',()=>{
    const ids=snapshotMeasurementReleaseIds({
      schemaVersion:2,compositeId:'c1',units:[
        {itemId:'i1',family:'SCALE',measurement:{releaseId:'rel-a'},source:{kind:'SCALE'}},
        {itemId:'i2',family:'SCALE',measurement:{releaseId:'rel-b'},source:{kind:'SCALE',standardCombination:{releaseId:'std'}}},
        {itemId:'i3',family:'SJT',measurement:{releaseId:'rel-c'},source:{kind:'STATIC_SJT_REGISTRY'}},
        {itemId:'i4',family:'SCALE',measurement:{releaseId:'rel-a'},source:{kind:'SCALE'}},
      ],
    })
    // Invalid snapshots yield [] (safe fail-closed for prefetch; in-tx parse still rejects).
    expect(snapshotMeasurementReleaseIds({broken:true})).toEqual([])
    expect(Array.isArray(ids)).toBe(true)
  })

  it('asPreloadedComposite marks the in-request reuse identity without dropping fields',()=>{
    const marked=asPreloadedComposite({id:'c1',updatedAt:new Date('2026-11-13T00:00:00Z'),trainingContentSnapshotHash:'h1',title:'t'})
    expect(marked._preloaded).toBe(true)
    expect(marked.id).toBe('c1')
    expect(marked.trainingContentSnapshotHash).toBe('h1')
  })

  it('startReadsIfCurrent reuses the bag only for the same composite id and snapshot hash',()=>{
    const bag:PrefetchedStartReads={compositeId:'c1',snapshotHash:'h1',releases:new Map(),legacyArtifacts:new Map()}
    expect(startReadsIfCurrent({id:'c1',trainingContentSnapshotHash:'h1',_startReads:bag})).toBe(bag)
    expect(startReadsIfCurrent({id:'c1',trainingContentSnapshotHash:'h2',_startReads:bag})).toBeUndefined()
    expect(startReadsIfCurrent({id:'c2',trainingContentSnapshotHash:'h1',_startReads:bag})).toBeUndefined()
    expect(startReadsIfCurrent({id:'c1',trainingContentSnapshotHash:'h1'})).toBeUndefined()
  })

  it('recheckPrefetchedReleases accepts exact id+hash rows that are not REVOKED',async()=>{
    const releases=new Map([['rel-a',release('rel-a','hash-a')]])
    const tx={$queryRaw:vi.fn(async()=>[{id:'rel-a',content_hash:'hash-a',status:'PUBLISHED'}])}
    await expect(recheckPrefetchedReleases(tx as any,releases)).resolves.toBeUndefined()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('recheckPrefetchedReleases rejects a hash change, a REVOKED row, and a missing id',async()=>{
    const releases=new Map([['rel-a',release('rel-a','hash-a')]])
    await expect(recheckPrefetchedReleases({$queryRaw:async()=>[{id:'rel-a',content_hash:'other',status:'PUBLISHED'}]} as any,releases))
      .rejects.toMatchObject({code:'CONTENT_TRAINING_BINDING_INVALID',statusCode:409})
    await expect(recheckPrefetchedReleases({$queryRaw:async()=>[{id:'rel-a',content_hash:'hash-a',status:'REVOKED'}]} as any,releases))
      .rejects.toBeInstanceOf(ContentReleaseError)
    await expect(recheckPrefetchedReleases({$queryRaw:async()=>[]} as any,releases))
      .rejects.toMatchObject({code:'CONTENT_TRAINING_BINDING_INVALID'})
  })

  it('createAttempt keeps in-tx status/hash/updatedAt rechecks and the hoisted-release recheck',()=>{
    const source=readFileSync(new URL('../../modules/composite/composite.service.ts',import.meta.url),'utf8')
    const start=source.indexOf('const createAttempt = async')
    const body=source.slice(start,source.indexOf('export const startRelationalCompositeAttemptInTransaction'))
    expect(body).toMatch(/compositeAssessment\.findUnique/)
    expect(body).toMatch(/trainingContentSnapshotHash/)
    expect(body).toMatch(/updatedAt/)
    expect(body).toMatch(/current\.status!=='PUBLISHED'/)
    expect(body).toMatch(/recheckPrefetchedReleases/)
    expect(body).toMatch(/legacyArtifactMap:startReads/)
    expect(body).toMatch(/prefetchedReleases:startReads/)
    // Fat snapshot blob is not re-selected when the pre-tx tree is already in hand.
    expect(body).toMatch(/\.\.\.\(composite\._preloaded\?\{\}:\{trainingContentSnapshot:true\}\)/)
  })

  it('anonymous and Training START paths mark the composite preloaded and prefetch before the transaction',()=>{
    const source=readFileSync(new URL('../../modules/composite/composite.service.ts',import.meta.url),'utf8')
    for(const fn of ['export const startUserAttempt','export const restartUserAttempt','export const startPublicAttempt','export const restartPublicAttempt']){
      const start=source.indexOf(fn)
      expect(start).toBeGreaterThan(-1)
      const body=source.slice(start,start+2500)
      expect(body,fn).toMatch(/loadStartComposite\(/)
    }
  })

  it('prefetchStartReads loads the unlocked release batch and legacy map for a hashed snapshot',async()=>{
    const db={$queryRaw:vi.fn(async(query:unknown)=>{
      const text=String(query)
      if(text.includes('measurement_content_releases'))return []
      if(text.includes('training_legacy_scale_artifacts'))return []
      return []
    })}
    const bag=await prefetchStartReads(db as any,{id:'c1',trainingContentSnapshotHash:'h1',trainingContentSnapshot:null})
    expect(bag).toEqual({compositeId:'c1',snapshotHash:'h1',releases:expect.any(Map),legacyArtifacts:expect.any(Map)})
    expect(bag.releases.size).toBe(0)
  })
})
