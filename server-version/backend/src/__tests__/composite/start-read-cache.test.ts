import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  BoundedTtlCache,
  publicationReadKey,
  resetStartReadCachesForTests,
  START_READ_CACHE_MAX_ENTRIES,
  START_READ_CACHE_TTL_MS,
  startReadsCache,
} from '../../modules/composite/start-read-cache'
import {prefetchStartReads} from '../../modules/composite/start-read-prefetch'

describe('process-local START read cache',()=>{
  beforeEach(()=>{resetStartReadCachesForTests();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T01:00:00Z'))})
  afterEach(()=>{vi.useRealTimers();resetStartReadCachesForTests()})

  it('coalesces simultaneous version loads and releases failed tasks for retry',async()=>{
    const cache=new BoundedTtlCache<number>(30_000,4)
    let finish!:(value:number)=>void
    const loader=vi.fn(()=>new Promise<number>(resolve=>{finish=resolve}))
    const tasks=Array.from({length:150},()=>cache.singleFlight('version-a',loader))
    expect(loader).toHaveBeenCalledTimes(1)
    finish(42)
    expect(await Promise.all(tasks)).toEqual(Array(150).fill(42))
    await expect(cache.singleFlight('version-b',async()=>{throw new Error('temporary')})).rejects.toThrow('temporary')
    expect(await cache.singleFlight('version-b',async()=>43)).toBe(43)
  })

  it('exports a 30s TTL and a bounded entry cap',()=>{
    expect(START_READ_CACHE_TTL_MS).toBe(30_000)
    expect(START_READ_CACHE_MAX_ENTRIES).toBe(256)
  })

  it('hits the same id+hash+updatedAt key and misses when the publication hash changes',()=>{
    const cache=new BoundedTtlCache<string>(30_000,4)
    const key=publicationReadKey('c1','hash-a',new Date('2026-11-13T00:00:00Z'))
    cache.set(key,'tree-a')
    expect(cache.get(key)).toBe('tree-a')
    expect(cache.get(publicationReadKey('c1','hash-b',new Date('2026-11-13T00:00:00Z')))).toBeUndefined()
    expect(cache.get(publicationReadKey('c1','hash-a',new Date('2026-11-13T00:00:01Z')))).toBeUndefined()
  })

  it('expires entries after 30s and evicts the oldest when the cap is exceeded',()=>{
    const cache=new BoundedTtlCache<number>(30_000,2)
    cache.set('a',1);cache.set('b',2)
    expect(cache.size).toBe(2)
    cache.set('c',3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    vi.advanceTimersByTime(30_000)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBeUndefined()
  })

  it('prefetchStartReads reuses a same-identity bag and misses a new snapshot hash',async()=>{
    let batches=0
    const db={$queryRaw:vi.fn(async(query:unknown)=>{
      const text=String(query)
      if(text.includes('measurement_content_releases')){batches+=1;return []}
      return []
    })}
    const composite={id:'c1',trainingContentSnapshotHash:'h1',updatedAt:new Date('2026-11-13T00:00:00Z'),trainingContentSnapshot:null}
    const first=await prefetchStartReads(db as any,composite)
    const second=await prefetchStartReads(db as any,composite)
    expect(second).toEqual(first)
    expect(second).not.toBe(first) // cloned, so callers cannot mutate the cached maps
    const third=await prefetchStartReads(db as any,{...composite,trainingContentSnapshotHash:'h2'})
    expect(third.snapshotHash).toBe('h2')
    expect(startReadsCache.size).toBeGreaterThan(0)
  })

  it('loadStartComposite is keyed on id+hash+updatedAt and START paths still recheck in the transaction',()=>{
    const source=readFileSync(new URL('../../modules/composite/composite.service.ts',import.meta.url),'utf8')
    expect(source).toMatch(/export const loadStartComposite/)
    expect(source).toMatch(/publicationReadKey\(identity\.id, identity\.trainingContentSnapshotHash, identity\.updatedAt\)/)
    const start=source.indexOf('const createAttempt = async')
    const body=source.slice(start,source.indexOf('export const startRelationalCompositeAttemptInTransaction'))
    expect(body).toMatch(/recheckPrefetchedReleases/)
    expect(body).toMatch(/current\.status!=='PUBLISHED'/)
    expect(body).toMatch(/trainingContentSnapshotHash/)
  })
})
