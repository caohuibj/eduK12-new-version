import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {authorizedProject} from '../../modules/survey/builder.service'
describe('Survey project authorization after lock acquisition',()=>{
 it('uses one materialized locked projection and rejects expiry crossed while waiting',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'p',status:'ACTIVE',expires_at:new Date('2026-10-20T04:00:01Z'),checked_at:new Date('2026-10-20T04:00:02Z')}])}
  await expect(authorizedProject(tx as never,'u','p',true)).rejects.toMatchObject({statusCode:404})
  const sql=tx.$queryRaw.mock.calls[0][0].join(' ? ')
  expect(sql).toContain('WITH locked AS MATERIALIZED');expect(sql).toContain('FOR SHARE OF p,u,g,m')
  expect(sql).toContain('SELECT locked.*,clock_timestamp() AS checked_at FROM locked')
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('allows unexpired and nonexpiring accounts after locks',async()=>{
  for(const expires_at of [null,new Date('2026-10-20T04:00:03Z')]){
   const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'p',status:'ACTIVE',expires_at,checked_at:new Date('2026-10-20T04:00:02Z')}])}
   await expect(authorizedProject(tx as never,'u','p',true)).resolves.toMatchObject({id:'p'})
  }
 })
})
