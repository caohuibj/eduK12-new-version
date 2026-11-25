import {Prisma} from '@prisma/client'
import {describe,it,expect,vi} from 'vitest'
import {captureFinalAuthorityReads,DynamicFinalAuthorityRead} from '../../modules/assessment-runtime/prepared-final-authority'
describe('prepared FINAL authority read set',()=>{
 it('runs projection once and repeats only its live reads, preserving nested planner controls',async()=>{
  const db:any={$queryRaw:vi.fn().mockResolvedValue([{id:'r',status:'PUBLISHED'}]),$executeRaw:vi.fn().mockResolvedValue(1)}
  db.$transaction=vi.fn(async(work:any)=>work(db))
  const compute=vi.fn(async(read:any)=>read.$transaction(async(tx:any)=>{await tx.$executeRaw`SELECT set_config('plan_cache_mode','force_custom_plan',true)`;return (await tx.$queryRaw`SELECT id,status FROM releases`)[0]}))
  const prepared=await captureFinalAuthorityReads(db,compute)
  expect(prepared.value.status).toBe('PUBLISHED');expect(db.$transaction).toHaveBeenCalledOnce()
  await prepared.verify(db);expect(compute).toHaveBeenCalledOnce();expect(db.$queryRaw).toHaveBeenCalledTimes(2)
 })
 it('rejects a revocation or deletion instead of committing prepared feedback',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{id:'r',status:'PUBLISHED'}])}
  const prepared=await captureFinalAuthorityReads(db,read=>read.$queryRaw`SELECT id,status FROM releases`)
  db.$queryRaw.mockResolvedValue([{id:'r',status:'REVOKED'}])
  await expect(prepared.verify(db)).rejects.toMatchObject({code:'STALE_ATTEMPT',statusCode:409})
 })
 it('snapshots model arguments before a caller changes them',async()=>{
  const db={grant:{findMany:vi.fn(async(args:any)=>[{actor:args.where.actor,allowed:true}])}}
  const args={where:{actor:'A'}}
  const prepared=await captureFinalAuthorityReads(db,read=>read.grant.findMany(args))
  args.where.actor='B';await prepared.verify(db)
  expect(db.grant.findMany.mock.calls.map(call=>call[0].where.actor)).toEqual(['A','A'])
 })
 it('keeps moving-clock authority on the original transaction path',async()=>{
  const db:any={$queryRaw:vi.fn()}
  await expect(captureFinalAuthorityReads(db,read=>read.$queryRaw`SELECT clock_timestamp() AS now`)).rejects.toBeInstanceOf(DynamicFinalAuthorityRead)
  expect(db.$queryRaw).not.toHaveBeenCalled()
 })
 it.each([new Date('2026-11-25T00:00:00Z'),'2026-11-25T00:00:00.000Z'])('keeps date-bound grant predicates on the original transaction path (%s)',async date=>{
  const db:any={grant:{findMany:vi.fn()}}
  await expect(captureFinalAuthorityReads(db,read=>read.grant.findMany({where:{expiresAt:{gt:date}}}))).rejects.toBeInstanceOf(DynamicFinalAuthorityRead)
  expect(db.grant.findMany).not.toHaveBeenCalled()
 })
 it('does not invent nested transactions on a real transaction client',async()=>{
  const db:any={$queryRaw:vi.fn(async()=>[{allowed:true}])}
  const prepared=await captureFinalAuthorityReads(db,async read=>{
   expect(read.$transaction).toBeUndefined()
   return read.$queryRaw`SELECT allowed FROM authority`
  })
  await prepared.verify(db)
 })
 it('reuses preparation reads across attempts but always repeats the live transaction checks',async()=>{
  const db:any={$queryRaw:vi.fn(async()=>[{status:'PUBLISHED',content:{frozen:'scientific content'}}])}
  const calculate=vi.fn(async(read:any)=>({source:await read.$queryRaw`SELECT status,content FROM releases`,personalResult:calculate.mock.calls.length}))
  const first=await captureFinalAuthorityReads(db,calculate)
  await first.verify(db)
  const second=await captureFinalAuthorityReads(db,calculate)
  expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  expect(second.value.personalResult).not.toBe(first.value.personalResult)
  await second.verify(db)
  expect(db.$queryRaw).toHaveBeenCalledTimes(3)
  db.$queryRaw.mockResolvedValue([{status:'REVOKED',content:{frozen:'scientific content'}}])
  await expect(second.verify(db)).rejects.toMatchObject({statusCode:409})
  const fresh=await captureFinalAuthorityReads(db,read=>read.$queryRaw`SELECT status,content FROM releases`)
  expect(fresh.value[0].status).toBe('REVOKED')
  expect(db.$queryRaw).toHaveBeenCalledTimes(5)
 })
 it('does not let a projection mutate shared preparation results',async()=>{
  const db:any={$queryRaw:vi.fn(async()=>[{flags:['ACTIVE']}])}
  await captureFinalAuthorityReads(db,async read=>{const rows=await read.$queryRaw`SELECT flags FROM authority`;rows[0].flags.push('LOCAL')})
  const second=await captureFinalAuthorityReads(db,read=>read.$queryRaw`SELECT flags FROM authority`)
  expect(second.value).toEqual([{flags:['ACTIVE']}])
  expect(db.$queryRaw).toHaveBeenCalledOnce()
  await second.verify(db)
 })
 it('isolates decimal values and rejects actor-scoped session controls',async()=>{
  const db:any={$queryRaw:vi.fn(async()=>[{quota:new Prisma.Decimal('1.5')}]),$executeRaw:vi.fn()}
  await captureFinalAuthorityReads(db,async read=>{const rows=await read.$queryRaw`SELECT quota FROM authority`;rows[0].quota.d[0]=9})
  const second=await captureFinalAuthorityReads(db,read=>read.$queryRaw`SELECT quota FROM authority`)
  expect(second.value[0].quota.toString()).toBe('1.5')
  await second.verify(db)
  await expect(captureFinalAuthorityReads(db,read=>read.$executeRaw`SELECT set_config('app.actor_id','A',true)`)).rejects.toBeInstanceOf(DynamicFinalAuthorityRead)
 })
 it('verifies concurrent preparation reads in their original lock order',async()=>{
  let release!:()=>void
  const wait=new Promise<void>(r=>release=r),seen:string[]=[]
  const sql=(q:any)=>Array.from(q.strings??q).join('?')
  const db:any={$queryRaw:vi.fn(async(q:any)=>{const first=sql(q).includes('first_authority');if(first)await wait;return [{id:first?'first':'second'}]})}
  const preparing=captureFinalAuthorityReads(db,read=>Promise.all([read.$queryRaw`SELECT id FROM first_authority FOR SHARE`,read.$queryRaw`SELECT id FROM second_authority FOR SHARE`]))
  await Promise.resolve();release()
  const prepared=await preparing
  const tx:any={$queryRaw:async(q:any)=>{const id=sql(q).includes('first_authority')?'first':'second';seen.push(id);return [{id}]}}
  await prepared.verify(tx)
  expect(seen).toEqual(['first','second'])
 })
 it('rejects an expiry crossed during preparation even when the database row is unchanged',async()=>{
  vi.useFakeTimers()
  try {
   vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
   const db:any={grant:{findMany:vi.fn(async()=>[{expiresAt:new Date('2026-11-25T00:00:01Z'),active:true}])}}
   const prepared=await captureFinalAuthorityReads(db,read=>read.grant.findMany({where:{owner:'A'}}))
   vi.setSystemTime(new Date('2026-11-25T00:00:02Z'))
   await expect(prepared.verify(db)).rejects.toMatchObject({code:'STALE_ATTEMPT',statusCode:409})
  } finally {vi.useRealTimers()}
 })
 it('never permits writes during preparation',async()=>{
  const db:any={grant:{update:vi.fn()},$queryRaw:vi.fn()}
  await expect(captureFinalAuthorityReads(db,read=>read.grant.update({}))).rejects.toThrow('READ_ONLY')
  await expect(captureFinalAuthorityReads(db,read=>read.$queryRaw`DELETE FROM grants`)).rejects.toThrow('READ_ONLY')
  expect(db.grant.update).not.toHaveBeenCalled();expect(db.$queryRaw).not.toHaveBeenCalled()
 })
})
