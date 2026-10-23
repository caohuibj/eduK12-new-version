import {beforeEach,describe,expect,it,vi} from 'vitest'
import {governanceApi} from './scaleLibraryGovernance'
const client=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('./client',()=>({default:client,sessionFetch:vi.fn()}))
beforeEach(()=>{vi.resetAllMocks();client.get.mockResolvedValue({code:0,data:{list:[]}});client.post.mockResolvedValue({code:0,data:{id:'grant'}})})
describe('education distribution API exact scope contract',()=>{
 it('encodes versioned USER recipient scope and delegated cursor query without using legacy paging',async()=>{
  const input={product:'TEACHER' as const,scopeKind:'USER' as const,organizationId:'org/a',releaseId:'release/a',contentHash:'hash+value',keyword:'张老师',cursor:'cursor/a',grantId:'grant/a'}
  await governanceApi('TRAINING').educationRecipients('entry/a',input)
  const url=new URL(client.get.mock.calls[0][0],'https://example.test')
  expect(url.pathname).toBe('/training/scale-library-governance/entries/entry%2Fa/recipients')
  expect(Object.fromEntries(url.searchParams)).toEqual(input)
  expect(url.searchParams.has('page')).toBe(false)
 })
 it.each(['ORGANIZATION','USER'] as const)('sends the complete %s grant body without changing legacy methods',async scopeKind=>{
  const common={product:'SCHOOL' as const,releaseId:'release',contentHash:'hash',organizationId:'org',requestId:'request',expectedGrantVersion:3,grantId:'delegate'}
  const body=scopeKind==='USER'?{...common,scopeKind,userId:'user'}:{...common,scopeKind,userId:null}
  const api=governanceApi('TRAINING');await api.educationGrant('entry/a',body)
  expect(client.post).toHaveBeenCalledWith('/training/scale-library-governance/entries/entry%2Fa/grants',body)
  await api.grant('old','user','SURVEY','old-request')
  expect(client.post).toHaveBeenLastCalledWith('/training/scale-library-governance/entries/old/grants',{userId:'user',product:'SURVEY',requestId:'old-request'})
 })
})
