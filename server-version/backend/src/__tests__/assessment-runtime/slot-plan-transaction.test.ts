import {beforeEach,describe,expect,it,vi} from 'vitest'
const globalDb=vi.hoisted(()=>({$queryRaw:vi.fn(),$executeRaw:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:globalDb}))
import {createFrozenActiveSlotSet,storeFrozenActiveSlotSet,loadFrozenActiveSlotSet,loadFrozenActiveSlot} from '../../modules/assessment-runtime/slot-set'
import {loadSharedSlotPlan} from '../../modules/assessment-runtime/shared-control-records'
import {decryptUnifiedRuntimePayload,encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {encryptCompactField} from '../../modules/assessment-runtime/compact-field-codec'
import type {PublicTemplateRow} from '../../modules/assessment-runtime/public-templates'

const slots=(id:string)=>createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:3,slots:[{slotKey:'scale:'+id,unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:id,version:'1',hash:'a'.repeat(64)},sourceBinding:{compositeItemId:id}}]})
const values=(args:any[]):any[]=>args.flatMap(value=>value&&typeof value==='object'&&Array.isArray(value.values)?values(value.values):[value])
function transaction(rows=new Map<string,PublicTemplateRow>()){
 const db={$queryRaw:vi.fn(async(strings:TemplateStringsArray,...args:any[])=>{
  const sql=strings.join(''),fields=values(args)
  if(sql.includes('INSERT INTO assessment_public_templates')){
   for(let index=0;index<fields.length;index+=4){const [templateHash,templateKind,plaintextBytes,payloadEncrypted]=fields.slice(index,index+4);if(!rows.has(templateHash))rows.set(templateHash,{templateHash,templateKind,plaintextBytes,payloadEncrypted})}
   return fields.filter((_,index)=>index%4===0).map(template_hash=>({template_hash}))
  }
  if(sql.includes('FROM assessment_public_templates'))return fields.flatMap(hash=>rows.has(hash)?[rows.get(hash)!]:[])
  throw new Error('Unexpected test SQL')
 })}
 return {db:db as any,rows}
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','d'.repeat(64));vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true');vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true')
 globalDb.$queryRaw.mockResolvedValue([]);globalDb.$executeRaw.mockRejectedValue(new Error('Global connection must not be borrowed by the transaction'))
})
describe('frozen slot plans stay on the supplied transaction',()=>{
 it('appends and verifies through the same transaction without borrowing a global connection',async()=>{
  const tx=transaction(),snapshot=slots('write-local'),cipher=await storeFrozenActiveSlotSet(snapshot,tx.db)
  expect(cipher).toMatch(/^ekr1:/);expect(await loadFrozenActiveSlotSet(cipher,tx.db)).toEqual(snapshot)
  expect(tx.db.$queryRaw).toHaveBeenCalledTimes(2);expect(globalDb.$executeRaw).not.toHaveBeenCalled();expect(globalDb.$queryRaw).not.toHaveBeenCalled()
  expect((await loadFrozenActiveSlot({encrypted:cipher,storedHash:snapshot.snapshotHash,attemptEpoch:3,slotKey:'scale:write-local'},tx.db)).sourceBinding).toEqual({compositeItemId:'write-local'})
  await expect(loadFrozenActiveSlot({encrypted:cipher,storedHash:snapshot.snapshotHash,attemptEpoch:4,slotKey:'scale:write-local'},tx.db)).rejects.toThrow('binding mismatch')
 })
 it('does not leak a transaction-only plan into global or later-transaction caches after rollback',async()=>{
  const tx=transaction(),snapshot=slots('rollback-local'),cipher=await storeFrozenActiveSlotSet(snapshot,tx.db)
  expect(await loadFrozenActiveSlotSet(cipher,tx.db)).toEqual(snapshot)
  tx.rows.clear()
  await expect(loadFrozenActiveSlotSet(cipher)).rejects.toThrow('PUBLIC_TEMPLATE_UNAVAILABLE')
  const later=transaction();await expect(loadFrozenActiveSlotSet(cipher,later.db)).rejects.toThrow('PUBLIC_TEMPLATE_UNAVAILABLE')
  expect(globalDb.$queryRaw).toHaveBeenCalledTimes(1);expect(later.db.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('lets a fresh transaction reader see its own operation rows and still validates template integrity',async()=>{
  const write=transaction(),snapshot=slots('read-local'),cipher=await storeFrozenActiveSlotSet(snapshot,write.db)
  const read=transaction(write.rows)
  expect(await loadFrozenActiveSlotSet(cipher,read.db)).toEqual(snapshot);expect(read.db.$queryRaw).toHaveBeenCalledTimes(1)
  expect(await loadSharedSlotPlan(cipher,undefined,read.db)).toEqual(snapshot)
  const row=[...write.rows.values()][0];write.rows.set(row.templateHash,{...row,payloadEncrypted:encryptCompactField({version:1,kind:'FROZEN_SLOT_PLAN',value:{schemaVersion:99}})})
  await expect(loadFrozenActiveSlotSet(cipher,transaction(write.rows).db)).rejects.toThrow('integrity invalid')
  expect(globalDb.$queryRaw).not.toHaveBeenCalled();expect(globalDb.$executeRaw).not.toHaveBeenCalled()
 })
 it('retains the default committed global store and its existing frozen hash',async()=>{
  const rows=transaction(),snapshot=slots('default-committed')
  globalDb.$executeRaw.mockImplementation(rows.db.$queryRaw);globalDb.$queryRaw.mockImplementation(rows.db.$queryRaw)
  const cipher=await storeFrozenActiveSlotSet(snapshot)
  expect(await loadFrozenActiveSlotSet(cipher)).toEqual(snapshot);expect(globalDb.$executeRaw).toHaveBeenCalledTimes(1);expect(globalDb.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('retains inline legacy storage and rejects corrupted hashes without any database access',async()=>{
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','false');const tx=transaction(),snapshot=slots('legacy-inline'),cipher=await storeFrozenActiveSlotSet(snapshot,tx.db)
  expect(cipher).not.toMatch(/^ekr1:/);expect(decryptUnifiedRuntimePayload(cipher)).toEqual(snapshot);expect(await loadFrozenActiveSlotSet(cipher,tx.db)).toEqual(snapshot)
  await expect(loadFrozenActiveSlotSet(encryptUnifiedRuntimePayload({...snapshot,snapshotHash:'f'.repeat(64)}),tx.db)).rejects.toThrow('hash mismatch')
  expect(tx.db.$queryRaw).not.toHaveBeenCalled();expect(globalDb.$queryRaw).not.toHaveBeenCalled();expect(globalDb.$executeRaw).not.toHaveBeenCalled()
 })
})
