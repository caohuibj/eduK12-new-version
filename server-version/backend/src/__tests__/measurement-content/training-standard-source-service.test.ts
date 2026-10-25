import {beforeEach,describe,expect,it,vi} from 'vitest'
const transaction=vi.hoisted(()=>({db:undefined as any,options:undefined as unknown}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(work:(db:any)=>unknown,options:unknown)=>{
  transaction.options=options
  return work(transaction.db)
}}}))
import {previewTrainingStandardSource} from '../../modules/questionnaire-product/standard-source.service'
import {ids,tid,trainingSourceHarness} from './training-standard-source.fixture'

beforeEach(()=>{transaction.db=undefined;transaction.options=undefined})
describe('Training exact-source preflight service',()=>{
  it('returns a guarded reference with explicit non-persistence and non-publication in one lock-bearing transaction',async()=>{
    const f=trainingSourceHarness();transaction.db=f.db
    const result=await previewTrainingStandardSource({userId:ids.owner},ids.composite,f.input)
    expect(result).toMatchObject({persisted:false,publicationReady:false,reference:{ownerId:ids.owner,
      combination:{releaseId:ids.combo,combinationHash:f.h.row.combination_hash},reportDisclosure:'EXISTING_TRAINING_POLICY'}})
    expect(transaction.options).toEqual({isolationLevel:'ReadCommitted',maxWait:5000,timeout:10000})
    expect(f.h.writes).toEqual([]);expect(f.h.scale.visibility).toBe('HIDDEN')
    expect(f.h.composite.status).toBe('DRAFT');expect(f.h.grants).toHaveLength(2)
    expect(f.h.calls.some(sql=>sql.includes('JOIN "admin_entry_grants"'))).toBe(true)
  })
  it('propagates current entry rejection instead of converting ONLINE into a ready response',async()=>{
    const f=trainingSourceHarness();transaction.db=f.db;f.h.entryActive=false
    await expect(previewTrainingStandardSource({userId:ids.owner},ids.composite,f.input)).rejects.toMatchObject({statusCode:403,message:'缺少当前入口管理授权'})
    expect(f.h.writes).toEqual([])
  })
  it('uses the authenticated actor and retains the owned-project check',async()=>{
    const f=trainingSourceHarness();transaction.db=f.db
    await expect(previewTrainingStandardSource({userId:tid(99)},ids.composite,f.input)).rejects.toMatchObject({statusCode:404})
    expect(f.h.calls).toHaveLength(1);expect(f.h.writes).toEqual([])
  })
  it('refuses a client-supplied owner before any source, authority or deployment read',async()=>{
    const f=trainingSourceHarness();transaction.db=f.db
    await expect(previewTrainingStandardSource({userId:ids.owner},ids.composite,{...f.input,ownerId:ids.owner})).rejects.toMatchObject({name:'ZodError'})
    expect(f.h.calls).toEqual([]);expect(f.h.writes).toEqual([])
  })
})
