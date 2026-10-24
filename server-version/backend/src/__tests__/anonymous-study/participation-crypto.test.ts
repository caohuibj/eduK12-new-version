import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHmac,scryptSync} from 'node:crypto'
import * as survey from '../../modules/survey/memorable-code.crypto'
import * as training from '../../modules/anonymous-study/participation.crypto'
import {createParticipationCodeCrypto} from '../../modules/participation/code-crypto'
beforeEach(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','12'.repeat(32))})
afterEach(()=>vi.unstubAllEnvs())
describe('shared participation crypto with product-specific authority',()=>{
 it('preserves Survey persisted derivation bytes exactly',async()=>{
  const key=createHmac('sha256',Buffer.from('12'.repeat(32),'hex')).update('SURVEY_MEMORABLE_V1\0project:3').digest()
  expect(await survey.memorableCredential('project','００１'.normalize('NFKC'),'SKY7',3)).toBe(scryptSync('001-SKY7',key,32,{N:16384,r:8,p:1,maxmem:32*1024*1024}).toString('base64url'))
 })
 it('isolates product, scope and reset generation for the same human code',async()=>{
  const a=await training.memorableCredential('same','001','SKY7',0)
  expect(await survey.memorableCredential('same','001','SKY7',0)).not.toBe(a)
  expect(await training.memorableCredential('other','001','SKY7',0)).not.toBe(a)
  expect(await training.memorableCredential('same','001','SKY7',1)).not.toBe(a)
 })
 it('uses one normalization contract and rejects short-number-only authentication',()=>{
  expect(training.parseMemorableCode('００１-sky7')).toEqual({prefix:'001',suffix:'SKY7'})
  expect(training.parseMemorableCode('001')).toBeNull()
  expect(training.parseMemorableCode('001-abc')).toBeNull()
  expect(training.validShortCode('班级01')).toBe(true)
 })
 it('generates independent 100-bit portable formats without accepting the other product',()=>{
  const a=training.generateStudyCode(),b=survey.generateStudyCode()
  expect(a).toMatch(/^HT2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
  expect(b).toMatch(/^HS2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
  expect(training.normalizeGeneratedCode(a.toLowerCase().replaceAll('-',''))).toBe(a)
  expect(training.normalizeGeneratedCode(b)).toBeNull();expect(survey.normalizeGeneratedCode(a)).toBeNull()
  expect(training.generatedCodeLookup('a',a)).not.toBe(training.generatedCodeLookup('b',a))
 })
 it('keeps reset proofs product/scoped and fails closed without key',()=>{
  expect(training.resetCodeHash('same','001-RESET')).not.toBe(survey.resetCodeHash('same','001-RESET'))
  vi.stubEnv('DATA_ENCRYPTION_KEY','')
  expect(()=>createParticipationCodeCrypto('TEST','TST','T','test').codeKey('a')).toThrow('unavailable')
 })
})
