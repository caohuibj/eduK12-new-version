import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({use:vi.fn(),collection:vi.fn()}))
vi.mock('../../services/materialGrant',()=>({canUseScale:m.use}))
vi.mock('../../modules/scale/scale-collection-guard',()=>({assertTrainingScaleCollectionAllowed:m.collection}))
import {assertScalePublicationRights} from '../../modules/scale/scale-publication-guard'
describe('publication revalidates source rights in its write transaction',()=>{
 beforeEach(()=>vi.resetAllMocks())
 it('passes the authenticated actor and exact persisted sources to the same transaction',async()=>{
  const source={id:'s',creatorId:'owner',status:'PUBLISHED'},tx={scale:{findMany:vi.fn().mockResolvedValue([source])}}
  m.use.mockResolvedValue(true)
  await assertScalePublicationRights(tx as never,'actor','TEACHER',['s'])
  expect(m.collection).toHaveBeenCalledWith(tx,['s'])
  expect(m.use).toHaveBeenCalledWith('actor','TEACHER',source,tx)
 })
 it('rejects revoked rights rather than granting publication from an earlier draft attachment',async()=>{
  const tx={scale:{findMany:vi.fn().mockResolvedValue([{id:'s',creatorId:'owner',status:'PUBLISHED'}])}}
  m.use.mockResolvedValue(false)
  await expect(assertScalePublicationRights(tx as never,'actor','TEACHER',['s'])).rejects.toMatchObject({statusCode:403})
 })
 it('does not acquire new rights or write when the exact source is emergency-stopped',async()=>{
  const tx={scale:{findMany:vi.fn()}}
  m.collection.mockRejectedValue(new Error('emergency'))
  await expect(assertScalePublicationRights(tx as never,'actor','TEACHER',['s'])).rejects.toThrow('emergency')
  expect(tx.scale.findMany).not.toHaveBeenCalled();expect(m.use).not.toHaveBeenCalled()
 })
})
