import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFrozenActiveSlotSet, decryptFrozenActiveSlotSet, encryptFrozenActiveSlotSet, getFrozenActiveSlot, frozenSlotPlanCacheStats } from '../../modules/assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { vi } from 'vitest'
const fixture=()=>createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'scale:'+randomUUID(),unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'synthetic',version:'1.0.0',hash:'d'.repeat(64)},sourceBinding:{scaleCode:'synthetic',compiledRuntimeHash:'c'.repeat(64)}}]})
beforeEach(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')})
afterEach(()=>vi.unstubAllEnvs())
describe('authenticated bounded frozen slot plans',()=>{
 it('reuses a deeply immutable plan across authenticated ciphertexts with identical content',()=>{
  const plan=fixture(),a=encryptFrozenActiveSlotSet(plan),b=encryptFrozenActiveSlotSet(plan),first=decryptFrozenActiveSlotSet(a)
  expect(a).not.toBe(b);expect(first).toEqual(plan);expect(decryptFrozenActiveSlotSet(a)).toBe(first);expect(decryptFrozenActiveSlotSet(b)).toBe(first)
  expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.slots)).toBe(true);expect(Object.isFrozen(first.slots[0].sourceBinding)).toBe(true)
  expect(()=>first.slots.push(first.slots[0])).toThrow();expect(()=>{first.slots[0].required=false}).toThrow()
 })
 it('performs the stored hash, epoch and requested-slot checks after every cache hit',()=>{
  const plan=fixture(),encrypted=encryptFrozenActiveSlotSet(plan),input={encrypted,storedHash:plan.snapshotHash,attemptEpoch:1,slotKey:plan.slots[0].slotKey}
  expect(getFrozenActiveSlot(input)).toEqual(plan.slots[0]);expect(()=>getFrozenActiveSlot({...input,storedHash:'e'.repeat(64)})).toThrow('database hash mismatch')
  expect(()=>getFrozenActiveSlot({...input,attemptEpoch:2})).toThrow('epoch mismatch');expect(()=>getFrozenActiveSlot({...input,slotKey:'other'})).toThrow('is missing')
 })
 it('cannot reuse warm plaintext when ciphertext is corrupted or not encrypted',()=>{
  const plan=fixture(),encrypted=encryptFrozenActiveSlotSet(plan);decryptFrozenActiveSlotSet(encrypted)
  const changed=encrypted.slice(0,-5)+(encrypted.at(-5)==='A'?'B':'A')+encrypted.slice(-4)
  expect(()=>decryptFrozenActiveSlotSet(changed)).toThrow();expect(()=>decryptFrozenActiveSlotSet(JSON.stringify(plan))).toThrow()
 })
 it('does not satisfy a changed or missing encryption key from a previous verification',()=>{
  const encrypted=encryptFrozenActiveSlotSet(fixture());decryptFrozenActiveSlotSet(encrypted)
  vi.stubEnv('DATA_ENCRYPTION_KEY','b'.repeat(64));expect(()=>decryptFrozenActiveSlotSet(encrypted)).toThrow()
  vi.stubEnv('DATA_ENCRYPTION_KEY','');expect(()=>decryptFrozenActiveSlotSet(encrypted)).toThrow()
 })
 it('continues to read legacy ciphertext and supports turning reuse off',()=>{
  const plan=fixture();vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false');const encrypted=encryptFrozenActiveSlotSet(plan)
  expect(decryptFrozenActiveSlotSet(encrypted)).toEqual(plan);vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true');expect(decryptFrozenActiveSlotSet(encrypted)).toEqual(plan)
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false');expect(decryptFrozenActiveSlotSet(encrypted)).toEqual(plan)
 })
 it('rejects unknown fields, duplicate slots, invalid identities and mismatched content hashes',()=>{
  const plan=fixture();decryptFrozenActiveSlotSet(encryptFrozenActiveSlotSet(plan))
  for(const invalid of [{...plan,extra:'no'},{...plan,slots:[...plan.slots,...plan.slots]},{...plan,snapshotHash:'f'.repeat(64)},
   {...plan,slots:[{...plan.slots[0],unitType:'SITUATIONAL'}]}])expect(()=>decryptFrozenActiveSlotSet(encryptUnifiedRuntimePayload(invalid))).toThrow()
 })
 it('evicts under both bounds and still reconstructs an older valid plan',()=>{
  const first=fixture(),encrypted=encryptFrozenActiveSlotSet(first);decryptFrozenActiveSlotSet(encrypted)
  for(let i=0;i<150;i++)decryptFrozenActiveSlotSet(encryptFrozenActiveSlotSet(fixture()))
  for(let i=0;i<550;i++)decryptFrozenActiveSlotSet(encryptFrozenActiveSlotSet(first))
  const stats=frozenSlotPlanCacheStats();expect(stats.plans.entries).toBeLessThanOrEqual(128);expect(stats.plans.bytes).toBeLessThanOrEqual(stats.plans.maxBytes)
  expect(stats.ciphers.entries).toBeLessThanOrEqual(512);expect(stats.ciphers.bytes).toBeLessThanOrEqual(stats.ciphers.maxBytes);expect(decryptFrozenActiveSlotSet(encrypted)).toEqual(first)
 })
})
