import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {AssessmentImageField,AssessmentImagePreview,type ImageAuthoringAdapter} from '../AssessmentImageField'
const asset={assetId:'image-a',contentHash:'a'.repeat(64),mimeType:'image/png' as const}
const file=()=>new File(['png'],'feedback.png',{type:'image/png'})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
const adapter=(scopeKey='scope-a'):ImageAuthoringAdapter=>({scopeKey,upload:vi.fn().mockResolvedValue(asset),loadPreview:vi.fn().mockResolvedValue('blob:preview')})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('scoped assessment image authoring',()=>{
 it('rejects unsupported, empty and oversized files without invoking transport',()=>{
  const transport=adapter();const change=vi.fn()
  render(<AssessmentImageField adapter={transport} disabled={false} onChange={change}/>)
  for(const invalid of [new File(['gif'],'animated.gif',{type:'image/gif'}),new File([],'empty.png',{type:'image/png'}),new File([new Uint8Array(2*1024*1024+1)],'large.png',{type:'image/png'})]){
   fireEvent.change(screen.getByLabelText('上传反馈图片'),{target:{files:[invalid]}})
  }
  expect(screen.getByRole('alert')).toHaveTextContent('不超过 2MB')
  expect(transport.upload).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled()
 })
 it('locks pending uploads and attaches only immutable identity once complete',async()=>{
  const pending=deferred<typeof asset>();const transport={...adapter(),upload:vi.fn(()=>pending.promise)}
  const change=vi.fn(),busy=vi.fn()
  render(<AssessmentImageField adapter={transport} disabled={false} onChange={change} onBusy={busy}/>)
  const input=screen.getByLabelText('上传反馈图片')
  fireEvent.change(input,{target:{files:[file()]}})
  fireEvent.change(input,{target:{files:[file()]}})
  expect(transport.upload).toHaveBeenCalledTimes(1)
  expect(input).toBeDisabled();expect(busy).toHaveBeenCalledWith(true)
  await act(async()=>pending.resolve({...asset,url:'https://not-persisted.example'} as typeof asset))
  expect(change).toHaveBeenCalledExactlyOnceWith([{asset,altText:'feedback',order:0}])
  expect(JSON.stringify(change.mock.calls)).not.toContain('https:')
  expect(busy).toHaveBeenLastCalledWith(false)
 })
 it('discards late upload results after the actor or tool scope changes',async()=>{
  const pending=deferred<typeof asset>(),change=vi.fn()
  const old={...adapter('actor-a:tool-a'),upload:vi.fn(()=>pending.promise)}
  const next=adapter('actor-b:tool-a')
  const {rerender}=render(<AssessmentImageField adapter={old} disabled={false} onChange={change}/>)
  fireEvent.change(screen.getByLabelText('上传反馈图片'),{target:{files:[file()]}})
  rerender(<AssessmentImageField adapter={next} disabled={false} onChange={change}/>)
  await act(async()=>pending.resolve(asset))
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByLabelText('上传反馈图片')).toBeEnabled()
 })
 it('does not attach an upload after unmount or an explicit disabled state',async()=>{
  const pending=deferred<typeof asset>(),change=vi.fn()
  const transport={...adapter(),upload:vi.fn(()=>pending.promise)}
  const {rerender,unmount}=render(<AssessmentImageField adapter={transport} disabled={false} onChange={change}/>)
  fireEvent.change(screen.getByLabelText('上传反馈图片'),{target:{files:[file()]}})
  rerender(<AssessmentImageField adapter={transport} disabled onChange={change}/>)
  await act(async()=>pending.resolve(asset))
  expect(change).not.toHaveBeenCalled()
  unmount()
 })
 it('ignores stale previews and revokes generated object URLs on replacement and unmount',async()=>{
  const create=vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
  const revoke=vi.fn()
  vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke})
  const pending=deferred<Blob>()
  const old={...adapter('old'),loadPreview:vi.fn(()=>pending.promise)}
  const current={...adapter('new'),loadPreview:vi.fn().mockResolvedValue(new Blob(['png'],{type:'image/png'}))}
  const image={asset,altText:'预览图'}
  const {rerender,unmount}=render(<AssessmentImagePreview adapter={old} image={image}/>)
  rerender(<AssessmentImagePreview adapter={current} image={image}/>)
  await waitFor(()=>expect(screen.getByRole('img')).toHaveAttribute('src','blob:first'))
  await act(async()=>pending.resolve(new Blob(['old'],{type:'image/png'})))
  expect(create).toHaveBeenCalledTimes(1)
  rerender(<AssessmentImagePreview adapter={current} image={{...image,asset:{...asset,contentHash:'b'.repeat(64)}}}/>)
  await waitFor(()=>expect(screen.getByRole('img')).toHaveAttribute('src','blob:second'))
  expect(revoke).toHaveBeenCalledWith('blob:first')
  unmount();expect(revoke).toHaveBeenCalledWith('blob:second')
 })
})
