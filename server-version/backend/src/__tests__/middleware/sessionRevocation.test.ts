import {beforeEach,describe,expect,it,vi} from 'vitest'

const {cache,verify}=vi.hoisted(()=>({
  cache:{readSessionRevocation:vi.fn(),recordSessionRevocation:vi.fn()},
  verify:vi.fn(),
}))
vi.mock('../../services/cacheService',()=>({cacheService:cache}))
vi.mock('../../utils/jwt',()=>({verifyToken:verify}))
import {sessionRevocationKey,isSessionRevoked,revokeCurrentSession} from '../../utils/sessionRevocation'

describe('bounded exact-session logout',()=>{
  beforeEach(()=>{
    vi.resetAllMocks()
    verify.mockReturnValue({userId:'user-1',exp:Math.ceil(Date.now()/1000)+3600})
    cache.readSessionRevocation.mockResolvedValue(false)
    cache.recordSessionRevocation.mockResolvedValue(true)
  })
  it('stores only fingerprinted, token-scoped markers',async()=>{
    const teacher='signed-teacher-session'
    const school='signed-school-session'
    const a=sessionRevocationKey(teacher),b=sessionRevocationKey(school)
    expect(a).toMatch(/^auth:logout:v1:[a-f0-9]{64}$/)
    expect(a).not.toContain(teacher)
    expect(a).not.toBe(b)
    expect(await revokeCurrentSession(teacher)).toBe(true)
    const [key,ttl]=cache.recordSessionRevocation.mock.calls[0]
    expect(key).toBe(a)
    expect(ttl).toBeGreaterThan(3500)
    expect(ttl).toBeLessThan(3700)
    expect(await isSessionRevoked(school)).toBe(false)
    expect(cache.readSessionRevocation).toHaveBeenCalledWith(b)
  })
  it('cannot declare successful logout without durable Redis write',async()=>{
    cache.recordSessionRevocation.mockResolvedValue(false)
    expect(await revokeCurrentSession('active-session')).toBe(false)
    verify.mockReturnValue(null)
    expect(await revokeCurrentSession('bad-session')).toBe(false)
    expect(await revokeCurrentSession(null)).toBe(false)
    expect(cache.recordSessionRevocation).toHaveBeenCalledTimes(1)
  })
  it('refuses non-expiring/expired credentials instead of creating unbounded markers',async()=>{
    verify.mockReturnValue({userId:'user-1'})
    expect(await revokeCurrentSession('missing-expiry')).toBe(false)
    verify.mockReturnValue({exp:0})
    expect(await revokeCurrentSession('expired-session')).toBe(false)
    expect(cache.recordSessionRevocation).not.toHaveBeenCalled()
  })
  it('keeps revocation unavailable distinct from active',async()=>{
    cache.readSessionRevocation.mockResolvedValue(null)
    expect(await isSessionRevoked('a-session')).toBeNull()
    cache.readSessionRevocation.mockResolvedValue(true)
    expect(await isSessionRevoked('a-session')).toBe(true)
  })
})
