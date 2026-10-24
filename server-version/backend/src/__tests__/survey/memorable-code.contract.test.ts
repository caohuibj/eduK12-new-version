import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {Request,Response} from 'express'
import {parseMemorableCode,normalizeShortCode,memorableCredential,generateStudyCode,normalizeGeneratedCode,generatedCodeLookup} from '../../modules/survey/memorable-code.crypto'
const consume=vi.hoisted(()=>vi.fn())
vi.mock('../../services/cacheService',()=>({cacheService:{consumeRateLimit:consume}}))
import {memorableCodeRateLimit} from '../../modules/survey/memorable-code.rate'
beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','12'.repeat(32)))
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
describe('one memorable participant code',()=>{
 it('keeps leading zeroes and accepts a school-defined prefix, case-insensitive private suffix',()=>{
  expect(normalizeShortCode('００１')).toBe('001')
  expect(parseMemorableCode(' ００１-sKy7 ')).toEqual({prefix:'001',suffix:'SKY7'})
  expect(parseMemorableCode('二班07-moon8')).toEqual({prefix:'二班07',suffix:'MOON8'})
  for(const invalid of ['001','001-abc','001-x'.repeat(80),'001-ab cd','001-ABCD-other','https://a.example'])expect(parseMemorableCode(invalid)).toBeNull()
 })
 it('derives a stable opaque proof but separates projects, suffixes and reset generations',async()=>{
  const a=await memorableCredential('study-a','001','SKY7',0)
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(await memorableCredential('study-a','001','SKY7',0)).toBe(a)
  const others=await Promise.all([memorableCredential('study-b','001','SKY7',0),memorableCredential('study-a','001','MOON8',0),memorableCredential('study-a','001','SKY7',1)])
  expect(others.every(value=>value!==a)).toBe(true)
 })
 it('issues 100-bit server-generated credentials with one canonical, project-specific lookup',()=>{
  const values=new Set(Array.from({length:200},()=>generateStudyCode()))
  expect(values.size).toBe(200)
  for(const value of values){
   expect(value).toMatch(/^HS2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
   expect(normalizeGeneratedCode(' '+value.toLowerCase()+' ')).toBe(value)
   expect(normalizeGeneratedCode(value.replaceAll('-',''))).toBe(value)
  }
  const value=[...values][0],lookup=generatedCodeLookup('study',value)
  expect(lookup).toMatch(/^S[0-9A-HJKMNP-TV-Z]{19}$/)
  expect(lookup).not.toBe(generatedCodeLookup('other',value))
  for(const invalid of ['蓝天白云78','123456','HS2-AAAAA-AAAAA-AAAAA-AAAAI','HS2-AAAAA-AAAAA-AAAAA-AAAAA-X','x'.repeat(65)])expect(normalizeGeneratedCode(invalid)).toBeNull()
 })
 it('fails closed when the server key is missing',async()=>{
  vi.stubEnv('DATA_ENCRYPTION_KEY','')
  await expect(memorableCredential('study','001','SKY7',0)).rejects.toThrow('key unavailable')
 })
})
function response(){const res={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res);return res as unknown as Response&typeof res}
describe('short-code guess limits are independent of shared classroom IPs',()=>{
 it('limits by study and short prefix, hiding both full code and suffix in cache keys',async()=>{
  consume.mockResolvedValue({allowed:true,remaining:10,retryAfterSeconds:900})
  const next=vi.fn(),res=response()
  const req=(fullCode:string,publicId='study')=>({params:{publicId},body:{fullCode},ip:'same-classroom'}) as unknown as Request
  await memorableCodeRateLimit(req('001-SKY7'),res,next)
  await memorableCodeRateLimit(req('001-WRONG'),res,next)
  await memorableCodeRateLimit(req('002-SKY7'),res,next)
  await memorableCodeRateLimit(req('001-SKY7','other-study'),res,next)
  const keys=consume.mock.calls.map(call=>call[0])
  expect(keys[0]).toBe(keys[1]);expect(new Set(keys)).toHaveProperty('size',3)
  expect(keys.every(key=>/^survey-code-attempt:[a-f0-9]{64}$/.test(key))).toBe(true)
  await memorableCodeRateLimit(req('HS2-ABCDE-FGHJK-MNPQR-STVWX'),res,next)
  await memorableCodeRateLimit(req('HS2-ABCDE-FGHJK-MNPQR-STVWY'),res,next)
  expect(consume.mock.calls[4][0]).not.toBe(consume.mock.calls[5][0])
  expect(consume.mock.calls[0].slice(1)).toEqual([12,900]);expect(next).toHaveBeenCalledTimes(6)
 })
 it.each([null,{allowed:false,retryAfterSeconds:500}])('rejects unavailable or exhausted rate admission: %j',async budget=>{
  consume.mockResolvedValue(budget)
  const next=vi.fn(),res=response()
  await memorableCodeRateLimit({params:{publicId:'study'},body:{fullCode:'001-SKY7'}} as unknown as Request,res,next)
  expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(budget?429:503)
 })
})
