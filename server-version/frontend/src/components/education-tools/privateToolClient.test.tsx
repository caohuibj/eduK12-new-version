import {act,renderHook,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {privateToolBase,privateToolError,usePrivateToolCapability,type PrivateToolApi} from './privateToolClient'

function deferred<T>(){
 let resolve!:(value:T)=>void
 let reject!:(error:unknown)=>void
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
const granted={canAuthor:true,authorableToolKinds:['SCALE','FORM']}

describe('education private tool capability gate',()=>{
 it('uses the server capability, not a generic teacher or administrator identity',async()=>{
  const call=vi.fn().mockResolvedValue({canAuthor:false,authorableToolKinds:[]})
  const {result}=renderHook(()=>usePrivateToolCapability(call as PrivateToolApi,'school a','admin-user'))
  await waitFor(()=>expect(call).toHaveBeenCalledWith('/organizations/school%20a/tool-authoring-capabilities'))
  expect(result.current).toBe(false)
  expect(privateToolBase('school/a')).toBe('/organizations/school%2Fa/private-tools')
 })
 it('immediately closes the previous school and ignores its late permission response',async()=>{
  const old=deferred<typeof granted>()
  const current=deferred<typeof granted>()
  const call=vi.fn((path:string)=>path.includes('/a/')?old.promise:current.promise)
  const {result,rerender}=renderHook(({org})=>usePrivateToolCapability(call as PrivateToolApi,org,'psych'),{initialProps:{org:'a'}})
  rerender({org:'b'})
  expect(result.current).toBe(false)
  await act(async()=>old.resolve(granted))
  expect(result.current).toBe(false)
  await act(async()=>current.resolve(granted))
  expect(result.current).toBe(true)
  rerender({org:''})
  expect(result.current).toBe(false)
 })
 it('fails closed for request errors, incomplete capabilities, and absent authenticated users',async()=>{
  const call=vi.fn().mockResolvedValueOnce({canAuthor:true,authorableToolKinds:['SCALE']}).mockRejectedValueOnce(Error('offline'))
  const {result,rerender}=renderHook(({org,user})=>usePrivateToolCapability(call as PrivateToolApi,org,user),{initialProps:{org:'a',user:'psych'}})
  await waitFor(()=>expect(call).toHaveBeenCalledTimes(1))
  expect(result.current).toBe(false)
  rerender({org:'b',user:'psych'})
  await waitFor(()=>expect(call).toHaveBeenCalledTimes(2))
  expect(result.current).toBe(false)
  rerender({org:'b',user:''})
  expect(result.current).toBe(false)
  expect(call).toHaveBeenCalledTimes(2)
 })
})

// This copy-only contract keeps the recovery guidance visible without replaying workflow suites.
describe('private tool recovery messages',()=>{
 it('maps all known backend codes to Chinese guidance and preserves draft/conflict recovery',()=>{
  for(const code of ['PRIVATE_TOOL_REVISION_CONFLICT','PRIVATE_TOOL_FREEZE_CONFLICT','PRIVATE_TOOL_AUTHOR_REQUIRED','PRIVATE_TOOL_SCOPED_MEDIA_NOT_READY','PRIVATE_TOOL_DEFINITION_INCOMPLETE','PRIVATE_TOOL_DEFINITION_INVALID','PRIVATE_TOOL_DEFINITION_TOO_LARGE','PRIVATE_TOOL_INPUT_INVALID','PRIVATE_TOOL_PREVIEW_INPUT_INVALID','PRIVATE_TOOL_FORM_UNSCORED','PRIVATE_TOOL_CONCURRENT_CHANGE','PRIVATE_TOOL_NOT_FOUND','PRIVATE_TOOL_VERSION_NOT_FOUND','PRIVATE_TOOL_HASH_MISMATCH']){
   expect(privateToolError({code})).toMatch(/[\u4e00-\u9fff]/)
   expect(privateToolError({code})).not.toContain('PRIVATE_TOOL_')
   expect(privateToolError({message:code})).toBe(privateToolError({code}))
  }
  expect(privateToolError({code:'PRIVATE_TOOL_REVISION_CONFLICT'})).toContain('本页内容仍保留')
  expect(privateToolError({code:'PRIVATE_TOOL_NOT_FOUND'})).toContain('重新读取列表')
  expect(privateToolError({code:'PRIVATE_TOOL_HASH_MISMATCH'})).toContain('不要反复提交')
  expect(privateToolError(null)).toBe('操作未完成，请稍后重试。')
 })
})
