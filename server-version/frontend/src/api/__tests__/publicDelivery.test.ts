import { beforeEach, expect, it, vi } from 'vitest'
import { publicDeliveryAdapter, publicLinkStatus, type PublicDeliveryFamily } from '../publicDelivery'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}))
vi.mock('../client',()=>({default:api,sessionFetch:vi.fn()}))
const hidden={id:'link',token:null,createdAt:null,expiresAt:'2099-01-01T00:00:00Z',maxUses:2,usedCount:1,isActive:true}
const revealed={...hidden,token:'opaque'}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:{list:[hidden]}});api.post.mockResolvedValue({code:0,data:revealed});api.delete.mockResolvedValue({code:0})})
it.each([
  ['QUESTIONNAIRE','/general-questionnaires/q/tokens','/public/questionnaire/'],
  ['COGNITIVE','/cognitive/assignments/q/public-tokens','/public/cognitive/assignments/'],
  ['COMPOSITE','/composite-assessments/q/public-tokens','/public/composite/'],
] as const)('routes %s management, exact reveal and participant entry to the existing service',async(family,path,entry)=>{
  const adapter=publicDeliveryAdapter(family as PublicDeliveryFamily,'q')
  expect(await adapter.listLinks()).toEqual([hidden])
  expect(api.get).toHaveBeenCalledWith(path)
  const input={expiresAt:hidden.expiresAt,maxUses:2}
  expect(await adapter.createLink(input)).toEqual(revealed)
  expect(api.post).toHaveBeenCalledWith(path,input)
  expect(await adapter.revealLink('link')).toEqual(revealed)
  expect(api.post).toHaveBeenCalledWith(path+'/link/reveal',{})
  await adapter.disableLink('link')
  expect(api.delete).toHaveBeenCalledWith(path+'/link')
  expect(adapter.getPublicEntry(revealed)).toBe(window.location.origin+entry+'opaque')
  expect(adapter.getPublicEntry(hidden)).toBeNull()
})
it('prioritizes closure state and rejects failed management responses',async()=>{
  expect(publicLinkStatus({...hidden,isActive:false})).toBe('已停用')
  expect(publicLinkStatus({...hidden,expiresAt:'2000-01-01T00:00:00Z'})).toBe('已过期')
  expect(publicLinkStatus({...hidden,usedCount:2})).toBe('已用尽')
  api.get.mockResolvedValue({code:-1,message:'Forbidden',data:{list:[hidden]}})
  await expect(publicDeliveryAdapter('QUESTIONNAIRE','q').listLinks()).rejects.toThrow('Forbidden')
})
