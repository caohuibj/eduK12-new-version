import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({many:vi.fn(),one:vi.fn(),authorize:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({educationPrivateToolVersion:{findMany:m.many,findFirst:m.one}})}}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize,privateToolScope:(c:any)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})}))
import {listPrivateFormRuntimeCandidates} from '../../modules/education-tools/private-tool.service'
import {formDraftSchema} from '../../modules/assessment-core/form/definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const c={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const good=formDraftSchema.parse({schemaVersion:2,pages:[{pageKey:'p',title:'Page',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'Question',required:false,options:[],rows:[]}]}]})
const bad=formDraftSchema.parse({schemaVersion:2,pages:[{pageKey:'p',title:'Empty original page',questions:[]},{...good.pages[0],pageKey:'second'}]})
const row=(n:number,definition:unknown)=>({id:id(n),toolId:id(4),title:'Frozen',sourceRevision:n,contentHash:'a'.repeat(64),createdAt:new Date(0),definition})
beforeEach(()=>{vi.clearAllMocks();m.authorize.mockResolvedValue(undefined);m.one.mockResolvedValue({id:id(3)});m.many.mockResolvedValue([])})
describe('Private FORM runtime candidates',()=>{
 it('returns scoped immutable metadata and explicit compatibility without definitions, fake resources or disclosure authority',async()=>{
  const before=canonicalHash([good,bad]);m.many.mockResolvedValue([row(100,good),row(101,bad)])
  const page=await listPrivateFormRuntimeCandidates(c)
  expect(page.list[0].compatibility).toEqual({compatible:true,code:null,issues:[]})
  expect(page.list[1].compatibility).toMatchObject({compatible:false,code:'PRIVATE_FORM_RUNTIME_UNSUPPORTED',issues:[{pageKey:'p',itemKey:null,reason:'EMPTY_PAGE_UNSUPPORTED'}]})
  expect(page.list[0]).not.toHaveProperty('definition');expect(page.list[0]).not.toHaveProperty('resource')
  expect(page.canPublish).toBe(false);expect(page.canReadParticipantReports).toBe(false)
  expect(m.many).toHaveBeenCalledWith(expect.objectContaining({where:{entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2),kind:'FORM'},take:51}))
  expect(canonicalHash([good,bad])).toBe(before)
 })
 it('keeps incompatible rows pageable and rejects a cursor outside exact FORM author scope',async()=>{
  m.many.mockResolvedValue(Array.from({length:51},(_,n)=>row(100+n,bad)))
  const page=await listPrivateFormRuntimeCandidates(c)
  expect(page.list).toHaveLength(50);expect(page.nextCursor).toBe(id(149))
  m.many.mockClear();m.one.mockResolvedValue(null)
  await expect(listPrivateFormRuntimeCandidates(c,id(3))).rejects.toThrow('CURSOR_INVALID')
  expect(m.one).toHaveBeenCalledWith({where:{id:id(3),entry:'SCHOOL',organizationId:id(1),ownerUserId:id(2),kind:'FORM'},select:{id:true}})
  expect(m.many).not.toHaveBeenCalled()
 })
 it('checks current author capability before accessing definitions',async()=>{
  m.authorize.mockRejectedValue(new Error('author revoked'))
  await expect(listPrivateFormRuntimeCandidates(c)).rejects.toThrow('author revoked')
  expect(m.many).not.toHaveBeenCalled()
 })
})
