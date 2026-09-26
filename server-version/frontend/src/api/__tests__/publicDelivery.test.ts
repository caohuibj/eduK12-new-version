import { beforeEach, expect, it, vi } from 'vitest'
import { publicDeliveryAdapter, publicLinkStatus, type PublicDeliveryFamily } from '../publicDelivery'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}))
vi.mock('../client',()=>({default:api,sessionFetch:vi.fn()}))
const row={id:'link',token:'opaque',createdAt:null,expiresAt:'2099-01-01T00:00:00Z',maxUses:2,usedCount:1,isActive:true}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:{list:[row]}});api.post.mockResolvedValue({code:0,data:row});api.delete.mockResolvedValue({code:0})})
it.each([
  ['QUESTIONNAIRE','/general-questionnaires/q/tokens','/public/questionnaire/'],
  ['COGNITIVE','/cognitive/assignments/q/public-tokens','/public/cognitive/assignments/'],
  ['COMPOSITE','/composite-assessments/q/public-tokens','/public/composite/'],
] as const)('routes %s management and participant entry to the existing service',async(family,path,entry)=>{
  const adapter=publicDeliveryAdapter(family as PublicDeliveryFamily,'q')
  expect(await adapter.listLinks()).toEqual([row])
  expect(api.get).toHaveBeenCalledWith(path)
  const input={expiresAt:row.expiresAt,maxUses:2}
  expect(await adapter.createLink(input)).toEqual(row)
  expect(api.post).toHaveBeenCalledWith(path,input)
  await adapter.disableLink('link')
  expect(api.delete).toHaveBeenCalledWith(path+'/link')
  expect(adapter.getPublicEntry(row)).toBe(window.location.origin+entry+'opaque')
  expect(adapter.getPublicEntry({...row,token:null})).toBeNull()
})
it('prioritizes closure state and rejects failed management responses',async()=>{
  expect(publicLinkStatus({...row,isActive:false})).toBe('已停用')
  expect(publicLinkStatus({...row,expiresAt:'2000-01-01T00:00:00Z'})).toBe('已过期')
  expect(publicLinkStatus({...row,usedCount:2})).toBe('已用尽')
  api.get.mockResolvedValue({code:-1,message:'Forbidden',data:{list:[row]}})
  await expect(publicDeliveryAdapter('QUESTIONNAIRE','q').listLinks()).rejects.toThrow('Forbidden')
})
