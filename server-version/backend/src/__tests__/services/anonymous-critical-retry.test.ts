import {afterEach,describe,expect,it,vi} from 'vitest'

vi.mock('node:fs',async original=>{
  const actual=await original<typeof import('node:fs')>()
  return {...actual,readFileSync:(path:any,...args:any[])=>{
    if(path==='/proc/meminfo')return 'MemAvailable: 614400 kB\n'
    if(path==='/proc/stat')return 'cpu 100 0 0 900 0 0 0 0\n'
    return (actual.readFileSync as any)(path,...args)
  }}
})

describe('anonymous early guard retry configuration',()=>{
  afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
  it('uses the configured host-memory hint for its 503',async()=>{
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED','true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED','true')
    vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS','8')
    vi.resetModules()
    const {assertAnonymousStartCriticalMemory}=await import('../../services/assessmentResourceProtection')
    expect(()=>assertAnonymousStartCriticalMemory()).toThrow(expect.objectContaining({
      code:'INSTRUMENT_NOT_AVAILABLE',statusCode:503,preferredRetryAfterSeconds:8,
    }))
  })
})
