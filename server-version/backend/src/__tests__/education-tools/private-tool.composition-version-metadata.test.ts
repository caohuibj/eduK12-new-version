import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({authorize:vi.fn(),tool:vi.fn(),cursor:vi.fn(),versions:vi.fn(),query:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({$queryRaw:m.query,educationPrivateTool:{findFirst:m.tool},educationPrivateToolVersion:{findFirst:m.cursor,findMany:m.versions}})}}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize,privateToolScope:(c:any)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})}))
import {listPrivateToolVersions} from '../../modules/education-tools/private-tool.service'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const row=(n:number,responseMode='PARENT_REPORT')=>({id:id(n),sourceRevision:n,title:'Fixed '+n,contentHash:'a'.repeat(64),createdAt:new Date(0),administration:{population:'STUDENT',responseMode}})
beforeEach(()=>{vi.clearAllMocks();m.authorize.mockResolvedValue(undefined);m.tool.mockResolvedValue({id:id(3),kind:'COMPOSITION'});m.cursor.mockResolvedValue({id:id(9)});m.query.mockResolvedValue([row(10)])})
describe('immutable composition administration summaries',()=>{
 it.each(['PARENT_REPORT','TEACHER_REPORT'])('returns the fixed %s header without a question body or mutable draft lookup',async mode=>{
  m.query.mockResolvedValue([row(10,mode)])
  const page=await listPrivateToolVersions(context,id(3))
  expect(page.list[0]).toMatchObject({id:id(10),administration:{population:'STUDENT',responseMode:mode}})
  expect(page.list[0]).not.toHaveProperty('definition')
  expect(m.tool).toHaveBeenCalledWith({where:{id:id(3),entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2)},select:{id:true,kind:true}})
  const query=m.query.mock.calls[0][0]
  expect(query.sql).toContain("v.definition->'administration' AS administration")
  expect(query.sql).not.toMatch(/SELECT\s+\*|v\.definition\s*(,|FROM)/i)
  for(const scoped of [id(3),'SCHOOL',id(1),id(2)])expect(query.values).toContain(scoped)
  expect(m.versions).not.toHaveBeenCalled()
 })
 it('preserves Teacher SELF metadata on the shared version endpoint',async()=>{
  const teacher={...context,entry:'TEACHER' as const}
  m.query.mockResolvedValue([{...row(10),administration:{population:'TEACHER',responseMode:'SELF'}}])
  expect((await listPrivateToolVersions(teacher,id(3))).list[0]).toMatchObject({administration:{population:'TEACHER',responseMode:'SELF'}})
  expect(m.query.mock.calls[0][0].values).toEqual(expect.arrayContaining(['TEACHER',context.organizationId,context.principal.userId]))
 })
 it('keeps database microsecond cursor ordering and the bounded page, and rejects a foreign cursor before reading headers',async()=>{
  m.query.mockResolvedValue(Array.from({length:51},(_,n)=>row(100+n)))
  const page=await listPrivateToolVersions(context,id(3),id(9))
  expect(page.list).toHaveLength(50);expect(page.nextCursor).toBe(id(149))
  expect(m.query.mock.calls[0][0].sql).toContain('(v.created_at,v.id)<(SELECT created_at,id')
  expect(m.cursor).toHaveBeenCalledWith({where:{id:id(9),toolId:id(3),entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2)},select:{id:true}})
  m.query.mockClear();m.cursor.mockResolvedValue(null)
  await expect(listPrivateToolVersions(context,id(3),id(8))).rejects.toMatchObject({code:'PRIVATE_TOOL_CURSOR_INVALID'})
  expect(m.query).not.toHaveBeenCalled()
 })
 it('keeps Scale/Form summary reads unchanged and prevents author or owner failures from reading metadata',async()=>{
  m.tool.mockResolvedValue({id:id(3),kind:'FORM'});m.versions.mockResolvedValue([{...row(10),administration:undefined}])
  await listPrivateToolVersions(context,id(3));expect(m.query).not.toHaveBeenCalled()
  expect(m.versions.mock.calls[0][0].select).toEqual({id:true,sourceRevision:true,title:true,contentHash:true,createdAt:true})
  m.versions.mockClear();m.authorize.mockRejectedValueOnce(Error('author revoked'))
  await expect(listPrivateToolVersions(context,id(3))).rejects.toThrow('author revoked')
  expect(m.versions).not.toHaveBeenCalled()
  m.tool.mockResolvedValue(null)
  await expect(listPrivateToolVersions(context,id(3))).rejects.toMatchObject({code:'PRIVATE_TOOL_NOT_FOUND'})
  expect(m.query).not.toHaveBeenCalled()
 })
})
