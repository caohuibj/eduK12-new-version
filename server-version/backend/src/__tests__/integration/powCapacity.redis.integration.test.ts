import {createHash} from 'node:crypto'
import {createClient,type RedisClientType} from 'redis'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
const clients=vi.hoisted(()=>[] as Array<{isOpen:boolean;quit():Promise<unknown>}>)
// Capture actual clients solely to close fixture connections; Lua is evaluated
// by a real isolated Redis instance, never emulated by JavaScript mocks.
vi.mock('redis',async importOriginal=>{
  const actual=await importOriginal<typeof import('redis')>()
  return {...actual,createClient:(options:Parameters<typeof actual.createClient>[0])=>{
    const client=actual.createClient(options);clients.push(client);return client
  }}
})
const url=process.env.POW_INTEGRATION_REDIS_URL
const suite=url?describe:describe.skip
const inventory='pow:active:v1'
let redis:RedisClientType
let ownsFixture=false
let service:typeof import('../../services/powService')['powService']
const issued=new Set<string>()
async function issue(difficulty=1){
  const challenge=await service.generateChallenge(difficulty)
  issued.add('pow:'+challenge.challenge)
  return challenge
}
function proof(challenge:string,valid=true){
  for(let i=0;;i++){
    const candidate=String(i)
    if(createHash('sha256').update(challenge+candidate).digest('hex').startsWith('0')===valid)
      return candidate
  }
}
suite('PoW real Redis atomic inventory capacity',()=>{
  beforeAll(async()=>{
    const target=new URL(url!)
    if(!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/15')
      throw new Error('PoW integration requires an isolated loopback Redis DB 15')
    redis=createClient({url:url!}) as RedisClientType
    await redis.connect()
    if(await redis.dbSize()!==0)throw new Error('PoW fixture Redis DB must be empty')
    ownsFixture=true
    vi.stubEnv('NODE_ENV','production')
    vi.stubEnv('REDIS_URL',url!)
    service=(await import('../../services/powService')).powService
  })
  beforeEach(async()=>{
    await redis.del([inventory,...issued,...await redis.keys('pow-issue:*')]);issued.clear()
    vi.stubEnv('POW_MAX_ACTIVE_CHALLENGES','3')
  })
  afterAll(async()=>{
    if(ownsFixture&&redis?.isOpen)await redis.del([inventory,...issued,...await redis.keys('pow-issue:*')])
    await Promise.all(clients.filter(client=>client.isOpen).map(client=>client.quit()))
    vi.unstubAllEnvs()
  })
  it('caps concurrent issuance and creates no challenge keys when exhausted',async()=>{
    const results=await Promise.allSettled(Array.from({length:30},()=>issue()))
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(3)
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(27)
    expect(await redis.zCard(inventory)).toBe(3)
    const before=(await redis.keys('pow:*')).sort()
    expect(before).toHaveLength(4)
    await expect(issue()).rejects.toMatchObject({name:'POWCapacityError'})
    expect((await redis.keys('pow:*')).sort()).toEqual(before)
  })
  it('releases a consumed slot atomically, retains difficulty, and consumes exactly once',async()=>{
    const first=await issue();await issue();await issue()
    expect(await service.verifyPOW(first.challenge,proof(first.challenge,false),1)).toBe(false)
    expect(await redis.zCard(inventory)).toBe(3)
    const accepted=await Promise.all([
      service.verifyPOW(first.challenge,proof(first.challenge),1),
      service.verifyPOW(first.challenge,proof(first.challenge),1),
    ])
    expect(accepted.sort()).toEqual([false,true])
    expect(await redis.exists('pow:'+first.challenge)).toBe(0)
    expect(await redis.zCard(inventory)).toBe(2)
    const next=await issue(4)
    expect((await service.getChallenge(next.challenge))?.difficulty).toBe(4)
    expect(await redis.zCard(inventory)).toBe(3)
  })
  it('uses 300-second TTLs and reclaims an expired member before issuing another key',async()=>{
    const first=await issue();await issue();await issue()
    expect(await redis.ttl('pow:'+first.challenge)).toBeGreaterThanOrEqual(299)
    expect(await redis.ttl('pow:'+first.challenge)).toBeLessThanOrEqual(300)
    expect(await redis.ttl(inventory)).toBeGreaterThanOrEqual(299)
    // Age only this fixture pair rather than delaying the suite five minutes.
    await redis.pExpire('pow:'+first.challenge,1)
    await redis.zAdd(inventory,{score:Date.now()-10_000,value:first.challenge})
    await new Promise(resolve=>setTimeout(resolve,20))
    expect(await service.getChallenge(first.challenge)).toBeUndefined()
    await issue()
    expect(await redis.zCard(inventory)).toBe(3)
    expect(await redis.exists('pow:'+first.challenge)).toBe(0)
  })
  it('consumes a pre-inventory historical challenge without changing its difficulty or lifetime',async()=>{
    const challenge='L'.repeat(32)
    const key='pow:'+challenge
    issued.add(key)
    await redis.setEx(key,300,JSON.stringify({challenge,difficulty:1,timestamp:Date.now()}))
    expect(await redis.zCard(inventory)).toBe(0)
    expect((await service.getChallenge(challenge))?.difficulty).toBe(1)
    expect(await service.verifyPOW(challenge,proof(challenge),1)).toBe(true)
    expect(await service.verifyPOW(challenge,proof(challenge),1)).toBe(false)
    expect(await redis.exists(key)).toBe(0)
    expect(await redis.zCard(inventory)).toBe(0)
  })
  it('fails closed on a Redis script error without issuing an untracked key',async()=>{
    await redis.set(inventory,'isolated corrupt inventory fixture')
    await expect(issue()).rejects.toThrow()
    expect(await redis.dbSize()).toBe(3)
    expect(service.getStats().totalChallenges).toBe(0)
  })
  it('limits per-IP issuance separately and rejects without allocating more keys', async () => {
    vi.stubEnv('POW_MAX_ACTIVE_CHALLENGES', '12000')
    const allowed = await Promise.allSettled(Array.from({ length: 1250 }, () => issue()))
    expect(allowed.filter(result => result.status === 'fulfilled')).toHaveLength(1200)
    expect(await redis.zCard(inventory)).toBe(1200)
    const size = await redis.dbSize()
    await expect(issue()).rejects.toMatchObject({ name: 'POWCapacityError', retryAfterSeconds: 60 })
    expect(await redis.dbSize()).toBe(size)
  })
  it('accepts a classroom burst within the default global budget without per-IP keys',async()=>{
    vi.stubEnv('POW_MAX_ACTIVE_CHALLENGES','12000')
    await Promise.all(Array.from({length:200},()=>issue()))
    expect(await redis.zCard(inventory)).toBe(200)
    expect(await redis.dbSize()).toBe(203)
  })
})
