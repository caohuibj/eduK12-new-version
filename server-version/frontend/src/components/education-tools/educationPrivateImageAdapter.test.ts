import {describe,expect,it,vi} from 'vitest'
import {createEducationPrivateImageAdapter} from './educationPrivateImageAdapter'
import type {PrivateToolApi} from './privateToolClient'
const asset={assetId:'asset/a',contentHash:'a'.repeat(64),mimeType:'image/png' as const}
const options={entry:'SCHOOL' as const,organizationId:'org/a',toolId:'tool/a',actorId:'author-a'}
const image=()=>new File(['png'],'example.png',{type:'image/png'})
describe('education private image transport',()=>{
 it('uses only the injected organization and draft scoped multipart and content API',async()=>{
  const blob=new Blob(['png'],{type:'image/png'})
  const api=vi.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce(blob)
  const adapter=createEducationPrivateImageAdapter({...options,api:api as PrivateToolApi})
  expect(await adapter.upload(image())).toEqual(asset)
  expect(api).toHaveBeenNthCalledWith(1,'/organizations/org%2Fa/private-tools/tool%2Fa/assets/images','POST',expect.any(FormData))
  expect((api.mock.calls[0][2] as FormData).get('image')).toBeInstanceOf(File)
  expect(await adapter.loadPreview(asset)).toBe(blob)
  expect(api).toHaveBeenNthCalledWith(2,'/organizations/org%2Fa/private-tools/tool%2Fa/assets/asset%2Fa/content','GET',undefined,{responseType:'blob'})
  expect(api.mock.calls.every(([path])=>String(path).startsWith('/organizations/org%2Fa/private-tools/tool%2Fa/assets/'))).toBe(true)
 })
 it('separates scopes by entry, actor, school and private tool',()=>{
  const api=vi.fn() as PrivateToolApi
  const original=createEducationPrivateImageAdapter({...options,api}).scopeKey
  for(const override of [{entry:'TEACHER' as const},{actorId:'author-b'},{organizationId:'org-b'},{toolId:'tool-b'}]){
   expect(createEducationPrivateImageAdapter({...options,...override,api}).scopeKey).not.toBe(original)
  }
 })
 it('rejects invalid files before transport and invalid returned identities',async()=>{
  const api=vi.fn().mockResolvedValue({assetId:'bad',mimeType:'image/png'})
  const adapter=createEducationPrivateImageAdapter({...options,api:api as PrivateToolApi})
  await expect(adapter.upload(new File(['gif'],'a.gif',{type:'image/gif'}))).rejects.toThrow('静态图片')
  expect(api).not.toHaveBeenCalled()
  await expect(adapter.upload(image())).rejects.toThrow('图片身份')
 })
 it.each([new Blob(['jpeg'],{type:'image/jpeg'}),new Blob([],{type:'image/png'}),'https://external.example/image'])('rejects invalid preview payloads without exposing an external URL',async(payload)=>{
  const api=vi.fn().mockResolvedValue(payload)
  const adapter=createEducationPrivateImageAdapter({...options,api:api as PrivateToolApi})
  await expect(adapter.loadPreview(asset)).rejects.toThrow('图片内容暂不可用')
 })
})
