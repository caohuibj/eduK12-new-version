import {describe,it,expect,vi} from 'vitest'
import {lockInstrumentSourceIdentity,lockAuthorizationSource} from '../../modules/assessment-authorization/source-identity-lock'
import {PrismaAuthorizationRepository} from '../../modules/assessment-authorization/repository'
const identity={instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0'}
const sql=(q:any)=>q.strings.join(' ')
describe('exact source identity locking and retired copyright writers',()=>{
 it('uses the same parameterized exact-version advisory key for shared readers and writers',async()=>{
  const tx={$executeRaw:vi.fn()};await lockInstrumentSourceIdentity(tx as never,identity,'READ');await lockInstrumentSourceIdentity(tx as never,identity,'WRITE')
  expect(sql(tx.$executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock_shared')
  expect(sql(tx.$executeRaw.mock.calls[1][0])).toContain('pg_advisory_xact_lock(')
  expect(tx.$executeRaw.mock.calls[0][0].values).toEqual(tx.$executeRaw.mock.calls[1][0].values)
  expect(tx.$executeRaw.mock.calls[0][0].values).toEqual([JSON.stringify(['instrument-source-v1',identity.instrumentKey,identity.instrumentVersion])])
 })
 it('looks up immutable lineage identity before acquiring the writer lock',async()=>{
  const tx={$executeRaw:vi.fn(),instrumentAuthorization:{findFirst:vi.fn().mockResolvedValue(identity)}}
  await lockAuthorizationSource(tx as never,'authorization')
  expect(tx.instrumentAuthorization.findFirst.mock.invocationCallOrder[0]).toBeLessThan(tx.$executeRaw.mock.invocationCallOrder[0])
  expect(sql(tx.$executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock(')
 })
 it('rejects a new copyright lineage before opening a transaction, locking or writing',async()=>{
  const tx={$executeRaw:vi.fn(),instrumentAuthorization:{create:vi.fn()},instrumentAuthorizationAudit:{create:vi.fn()}}
  const db={$transaction:vi.fn(async fn=>fn(tx))},repo=new PrismaAuthorizationRepository(db as never)
  await expect(repo.createDraft({...identity,grantor:'Synthetic grantor',grantee:'Synthetic deployment',scope:{electronicAdministration:true,scoring:true,translation:false,display:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL'},
   validFrom:'2026-01-01T00:00:00.000Z',validTo:'2027-01-01T00:00:00.000Z',basis:'Synthetic only',createdByUserId:'actor',now:'2026-10-20T00:00:00.000Z'})).rejects.toMatchObject({code:'AUTHORIZATION_RECORDS_RETIRED'})
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(tx.$executeRaw).not.toHaveBeenCalled()
  expect(tx.instrumentAuthorization.create).not.toHaveBeenCalled();expect(tx.instrumentAuthorizationAudit.create).not.toHaveBeenCalled()
 })
})
