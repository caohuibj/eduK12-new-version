import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mock=vi.hoisted(()=>({find:vi.fn(),compare:vi.fn(),state:vi.fn(),consume:vi.fn(),gate:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{user:{findUnique:mock.find}}}))
vi.mock('../../utils/password',()=>({comparePassword:mock.compare,hashPassword:vi.fn()}))
vi.mock('../../middleware/loginRateLimit',()=>({withLoginPasswordVerification:mock.gate}))
vi.mock('../../services/cacheService',()=>({cacheService:{getRateLimitState:mock.state,consumeRateLimit:mock.consume}}))
vi.mock('../../modules/survey/mfa.service',()=>({beginSurveyMfaChallenge:vi.fn()}))
import { authorizeAdmin } from '../../modules/survey/governance.service'

const actor='server-admin-id',password='synthetic-password',key='auth:survey:admin-password:'+createHash('sha256').update(actor).digest('hex')
describe('Survey current admin password failure budget',()=>{
 beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.clearAllMocks()
  mock.find.mockResolvedValue({isActive:true,isFrozen:false,platformRole:'SYSTEM_ADMIN',passwordHash:'synthetic-hash'})
  mock.compare.mockResolvedValue(true);mock.state.mockResolvedValue({count:0,retryAfterSeconds:0})
  mock.consume.mockResolvedValue({allowed:true,remaining:14,retryAfterSeconds:900})
  mock.gate.mockImplementation(async(operation:()=>Promise<unknown>)=>operation())
 })
 afterEach(()=>vi.unstubAllEnvs())
 it('correct passwords do not consume or reset a failure window',async()=>{
  mock.state.mockResolvedValue({count:7,retryAfterSeconds:400})
  await authorizeAdmin(actor,password);await authorizeAdmin(actor,password)
  expect(mock.state).toHaveBeenCalledWith(key);expect(mock.consume).not.toHaveBeenCalled()
 })
 it('only incorrect passwords atomically consume the server identity budget',async()=>{
  mock.compare.mockResolvedValue(false)
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:403})
  expect(mock.consume).toHaveBeenCalledExactlyOnceWith(key,15,900)
 })
 it('rejects exhausted budget before bcrypt and returns actual retry TTL',async()=>{
  mock.state.mockResolvedValue({count:15,retryAfterSeconds:321})
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:429,retryAfterSeconds:321})
  expect(mock.compare).not.toHaveBeenCalled();expect(mock.consume).not.toHaveBeenCalled()
 })
 it('a concurrently exhausted failure increment is rejected with429',async()=>{
  mock.compare.mockResolvedValue(false);mock.consume.mockResolvedValue({allowed:false,remaining:0,retryAfterSeconds:251})
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:429,retryAfterSeconds:251})
 })
 it.each([null,{isActive:false,platformRole:'SYSTEM_ADMIN'},{isActive:true,isFrozen:true,platformRole:'SYSTEM_ADMIN'},{isActive:true,isFrozen:false,platformRole:'STANDARD'}])('rejects current non-administrators before budget/password lookup (%j)',async(row)=>{
  mock.find.mockResolvedValue(row)
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:403})
  expect(mock.state).not.toHaveBeenCalled();expect(mock.compare).not.toHaveBeenCalled();expect(mock.consume).not.toHaveBeenCalled()
 })
 it('fails closed when the budget cannot be read',async()=>{
  mock.state.mockResolvedValue(null)
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:503})
  expect(mock.compare).not.toHaveBeenCalled()
 })
 it('fails closed when a wrong password cannot be recorded',async()=>{
  mock.compare.mockResolvedValue(false);mock.consume.mockResolvedValue(null)
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:503})
 })
 it('checks the latest budget after admission, never while queued',async()=>{
  let operation:(()=>Promise<unknown>)|undefined,release:(()=>void)|undefined
  mock.gate.mockImplementation(async(fn:()=>Promise<unknown>)=>{operation=fn;await new Promise<void>(r=>{release=r});return fn()})
  const result=authorizeAdmin(actor,password);const rejection=expect(result).rejects.toMatchObject({statusCode:429})
  expect(operation).toBeDefined();expect(mock.state).not.toHaveBeenCalled()
  mock.state.mockResolvedValue({count:15,retryAfterSeconds:900});release!();await rejection
  expect(mock.compare).not.toHaveBeenCalled()
 })
 it('retains existing test/development bypass without relaxing current role or password',async()=>{
  vi.stubEnv('NODE_ENV','test');mock.compare.mockResolvedValue(false)
  await expect(authorizeAdmin(actor,password)).rejects.toMatchObject({statusCode:403})
  expect(mock.state).not.toHaveBeenCalled();expect(mock.consume).not.toHaveBeenCalled()
 })
})
