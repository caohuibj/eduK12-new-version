import {afterEach,describe,expect,it,vi} from 'vitest'

const state=vi.hoisted(()=>({now:0,availableKiB:649*1024,missing:false}))
vi.mock('node:fs',async original=>{
  const actual=await original<typeof import('node:fs')>()
  return {...actual,readFileSync:(path:any,...args:any[])=>{
    if(path==='/proc/meminfo'){
      if(state.missing)throw new Error('synthetic unavailable sample')
      return `MemAvailable: ${state.availableKiB} kB\n`
    }
    if(path==='/proc/stat')return 'cpu 100 0 0 900 0 0 0 0\n'
    return (actual.readFileSync as any)(path,...args)
  }}
})
vi.mock('node:perf_hooks',async original=>{
  const actual=await original<typeof import('node:perf_hooks')>()
  const performance=new Proxy(actual.performance,{get(target,key){
    if(key==='now')return ()=>state.now
    const value=Reflect.get(target,key,target)
    return typeof value==='function'?value.bind(target):value
  }})
  return {...actual,performance}
})
import {assertAnonymousStartCriticalMemory} from '../../services/assessmentResourceProtection'

describe('optional anonymous memory guard',()=>{
  afterEach(()=>{vi.unstubAllEnvs();state.now+=2000;state.missing=false})
  it('is disabled by default even when the resource guard is enabled',()=>{
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED','true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED','')
    state.missing=true
    expect(()=>assertAnonymousStartCriticalMemory()).not.toThrow()
  })
  it('rejects below 650 MiB and allows the exact threshold',()=>{
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED','true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED','true')
    state.availableKiB=649*1024
    expect(()=>assertAnonymousStartCriticalMemory()).toThrow(expect.objectContaining({code:'INSTRUMENT_NOT_AVAILABLE',statusCode:503,preferredRetryAfterSeconds:10}))
    state.now+=2000;state.availableKiB=650*1024
    expect(()=>assertAnonymousStartCriticalMemory()).not.toThrow()
  })
  it('fails closed when the memory sample is missing',()=>{
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED','true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED','true')
    state.missing=true
    expect(()=>assertAnonymousStartCriticalMemory()).toThrow(expect.objectContaining({code:'INSTRUMENT_NOT_AVAILABLE',statusCode:503}))
  })
})
