import {beforeEach,describe,expect,it,vi} from 'vitest'
const query=vi.hoisted(()=>vi.fn())
vi.mock('../../config/database',()=>({prisma:{$queryRaw:query}}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{getAttempt:vi.fn(),submitFinalFormSection:vi.fn()}}))
import {listOwnTeacherPrivateFormTaskPage,listOwnTeacherPrivateFormTasks} from '../../modules/huiteacher/privateFormRuntime.routes'
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const rows=Array.from({length:102},(_,index)=>({executionId:'33333333-3333-4333-8333-'+String(102-index).padStart(12,'0'),
 cursorCreatedAt:'2026-10-22T10:00:00.123456Z',formTitle:'Form '+index,status:index===101?'ASSIGNED':'COMPLETED'}))
beforeEach(()=>{query.mockReset()})
describe('Teacher private Form bounded actor-scoped keyset pages',()=>{
 it('keeps all 102 tasks across bounded pages with precise timestamp and stable ID tie-breaker',async()=>{
  query.mockResolvedValueOnce(rows.slice(0,51)).mockResolvedValueOnce(rows.slice(50,101)).mockResolvedValueOnce(rows.slice(100))
  const first=await listOwnTeacherPrivateFormTaskPage(actor)
  const second=await listOwnTeacherPrivateFormTaskPage(actor,{cursor:first.nextCursor,pageSize:'50'})
  const third=await listOwnTeacherPrivateFormTaskPage(actor,{cursor:second.nextCursor})
  expect([first.list.length,second.list.length,third.list.length]).toEqual([50,50,2])
  expect(third.nextCursor).toBeNull()
  expect([...first.list,...second.list,...third.list].map(row=>row.executionId)).toEqual(rows.map(row=>row.executionId))
  expect(third.list[1].status).toBe('ASSIGNED')
  expect(first.list[0]).not.toHaveProperty('cursorCreatedAt')
  const secondQuery=query.mock.calls[1][0]
  expect(secondQuery.sql).toContain('(e.created_at,e.id)<(')
  expect(secondQuery.sql).toContain('ORDER BY e.created_at DESC,e.id DESC LIMIT')
  expect(secondQuery.sql).toContain('a.respondent_user_id=')
  expect(secondQuery.sql).toContain('organization_access_denies')
  expect(secondQuery.values).toEqual(expect.arrayContaining([actor,'2026-10-22T10:00:00.123456Z',rows[49].executionId,51]))
 })
 it('rejects a foreign actor cursor and malformed/unbounded requests before reading tasks',async()=>{
  query.mockResolvedValueOnce(rows.slice(0,51))
  const {nextCursor}=await listOwnTeacherPrivateFormTaskPage(actor)
  query.mockClear()
  for(const [user,input] of [[other,{cursor:nextCursor}],[actor,{cursor:'not-a-cursor'}],[actor,{pageSize:101}],[actor,{pageSize:0}],[actor,{cursor:['one','two']}]] as const){
   await expect(listOwnTeacherPrivateFormTaskPage(user,input)).rejects.toMatchObject({name:'ZodError'})
  }
  expect(query).not.toHaveBeenCalled()
 })
 it('preserves the existing exact execution lookup array contract',async()=>{
  query.mockResolvedValueOnce([rows[101]])
  expect(await listOwnTeacherPrivateFormTasks(actor,{executionId:rows[101].executionId})).toEqual([expect.objectContaining({executionId:rows[101].executionId})])
  expect(query.mock.calls[0][0].values).toContain(rows[101].executionId)
 })
})
