import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicDeliveryAdapter } from '../publicDelivery'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}))
vi.mock('../client',()=>({default:api,sessionFetch:vi.fn()}))
afterEach(()=>vi.restoreAllMocks())
const now=Date.parse('2026-10-19T00:00:00Z')
const policy={schemaVersion:1 as const,timeZone:'Asia/Shanghai'}
const window={opensAt:new Date(now).toISOString(),closesAt:new Date(now+3600000).toISOString()}
const row={id:'link',token:'real/opaque+credential',roundId:'c9ed825a-30d7-4da0-82dd-c6d314c13580',groupIpWindow:window,createdAt:null,expiresAt:window.closesAt,maxUses:0,usedCount:0,isActive:true}
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);api.get.mockResolvedValue({code:0,data:{list:[{...row,token:null}]}});api.post.mockResolvedValue({code:0,data:row})})
it('preserves the server round/window across create, list and reveal, copying the real token',async()=>{
 const adapter=publicDeliveryAdapter('COMPOSITE','task')
 const input={expiresAt:window.closesAt,maxUses:0,groupIpPolicy:policy}
 expect(await adapter.createLink(input)).toEqual(row)
 expect(api.post).toHaveBeenCalledWith('/composite-assessments/task/public-tokens',input)
 expect(await adapter.listLinks()).toEqual([{...row,token:null}])
 expect(await adapter.revealLink('link')).toEqual(row)
 expect(adapter.getPublicEntry(row)).toBe(`${globalThis.window.location.origin}/public/composite/real%2Fopaque%2Bcredential`)
 expect(adapter.getPublicEntry({...row,token:null})).toBeNull()
})
it('passes an explicit existing round without deriving it from a query hint',async()=>{
 const input={expiresAt:window.closesAt,maxUses:0,roundId:row.roundId}
 await publicDeliveryAdapter('COMPOSITE','task').createLink(input)
 expect(api.post).toHaveBeenCalledWith('/composite-assessments/task/public-tokens',input)
})
it('rejects invalid policy, over-48-hour and mixed round requests before sending',async()=>{
 const adapter=publicDeliveryAdapter('COMPOSITE','task')
 for(const extra of [{groupIpPolicy:{...policy,timeZone:'Not/AZone'}},{groupIpPolicy:policy,roundId:row.roundId},{groupIpPolicy:policy,expiresAt:new Date(now+48*3600000+1).toISOString()}]) {
  await expect(adapter.createLink({expiresAt:window.closesAt,maxUses:0,...extra})).rejects.toThrow()
 }
 await expect(publicDeliveryAdapter('QUESTIONNAIRE','task').createLink({expiresAt:window.closesAt,maxUses:0,groupIpPolicy:policy})).rejects.toThrow()
 expect(api.post).not.toHaveBeenCalled()
})
it('accepts exactly 48 hours and leaves ordinary long-lived links unchanged',async()=>{
 const adapter=publicDeliveryAdapter('COMPOSITE','task')
 await adapter.createLink({expiresAt:new Date(now+48*3600000).toISOString(),maxUses:0,groupIpPolicy:policy})
 await adapter.createLink({expiresAt:'2099-01-01T00:00:00Z',maxUses:0})
 expect(api.post).toHaveBeenCalledTimes(2)
})
