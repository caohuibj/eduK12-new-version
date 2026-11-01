import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({many:vi.fn(),one:vi.fn(),authorize:vi.fn(),query:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({$queryRaw:m.query,educationPrivateToolVersion:{findMany:m.many,findFirst:m.one}})}}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize,privateToolScope:(c:any)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})}))
import {listPrivateScaleRuntimeCandidates} from '../../modules/education-tools/private-tool.service'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const c={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
beforeEach(()=>{vi.clearAllMocks();m.authorize.mockResolvedValue(undefined);m.one.mockResolvedValue({id:id(3)});m.many.mockResolvedValue([])
 m.query.mockImplementation(async(query:{sql:string;values:unknown[]})=>{
  if(query.sql.includes('FROM education_private_tool_versions v WHERE v.id=ANY(')&&query.sql.includes("AND v.kind='SCALE'")
   &&query.sql.includes('AS metadata')&&query.sql.includes('v.owner_user_id=')){
   expect(query.values).toEqual([Array.from({length:50},(_,n)=>id(100+n)),'SCHOOL',id(1),id(2)])
   return []
  }
  throw new Error('Unexpected runtime-candidate metadata query')
 })
})
describe('Author fixed-version runtime candidates',()=>{
 it('scopes and pages before bounded group metadata, without reading question bodies, preparing fake resources or including Form',async()=>{
  m.many.mockResolvedValue(Array.from({length:51},(_,n)=>({id:id(100+n),toolId:id(4),title:'Frozen',sourceRevision:n,contentHash:'a'.repeat(64),createdAt:new Date(0)})))
  const page=await listPrivateScaleRuntimeCandidates(c)
  expect(page.list).toHaveLength(50);expect(page.nextCursor).toBe(id(149));expect(page.canPublish).toBe(false)
  expect(page.list[0]).toMatchObject({versionId:id(100),toolId:id(4)})
  expect(page.list[0]).not.toHaveProperty('resource');expect(page.list[0]).not.toHaveProperty('definition')
  expect(m.many).toHaveBeenCalledWith(expect.objectContaining({where:{entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2),kind:'SCALE'},take:51,orderBy:[{createdAt:'desc'},{id:'desc'}]}))
  expect(m.authorize.mock.invocationCallOrder[0]).toBeLessThan(m.many.mock.invocationCallOrder[0])
  expect(m.query).toHaveBeenCalledTimes(1)
  expect(m.many.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[0])
 })
 it('rejects foreign/other-entry cursors before fetching a page',async()=>{
  m.one.mockResolvedValue(null)
  await expect(listPrivateScaleRuntimeCandidates(c,id(3))).rejects.toThrow('CURSOR_INVALID')
  expect(m.one).toHaveBeenCalledWith({where:{id:id(3),entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2),kind:'SCALE'},select:{id:true}})
  expect(m.many).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled()
 })
 it('requires current authoring rights without treating cursor possession as access',async()=>{
  m.authorize.mockRejectedValue(new Error('author revoked'))
  await expect(listPrivateScaleRuntimeCandidates(c,id(3))).rejects.toThrow('author revoked')
  expect(m.one).not.toHaveBeenCalled();expect(m.many).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled()
 })
})
