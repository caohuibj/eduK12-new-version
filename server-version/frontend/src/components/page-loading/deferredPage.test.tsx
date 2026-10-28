import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {useEffect} from 'react'
import {deferredPage,KeepMountedOnVisit} from './deferredPage'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('loads only on first visit and preserves the mounted draft on hide/revisit',async()=>{
 const mounted=vi.fn()
 function Page(){useEffect(mounted,[]);return <input aria-label="草稿" defaultValue=""/>}
 const load=vi.fn(async()=>({default:Page}));const PageView=deferredPage(load)
 const view=render(<KeepMountedOnVisit active={false}><PageView/></KeepMountedOnVisit>)
 expect(load).not.toHaveBeenCalled()
 view.rerender(<KeepMountedOnVisit active><PageView/></KeepMountedOnVisit>)
 fireEvent.change(await screen.findByLabelText('草稿'),{target:{value:'保留输入'}})
 view.rerender(<KeepMountedOnVisit active={false}><PageView/></KeepMountedOnVisit>)
 view.rerender(<KeepMountedOnVisit active><PageView/></KeepMountedOnVisit>)
 expect(screen.getByLabelText('草稿')).toHaveValue('保留输入');expect(load).toHaveBeenCalledTimes(1);expect(mounted).toHaveBeenCalledTimes(1)
})
it('keeps surrounding navigation available and retries a rejected chunk without reloading the app',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{})
 let attempts=0
 const PageView=deferredPage(async()=>{if(++attempts===1)throw Error('offline');return {default:()=> <p>页面已恢复</p>}})
 const view=render(<><input aria-label="外部草稿" defaultValue="不能丢失"/><a href="#home">返回首页</a><PageView/></>)
 await screen.findByRole('alert')
 expect(screen.getByRole('link',{name:'返回首页'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'重试页面内容'}))
 await screen.findByText('页面已恢复');expect(screen.getByLabelText('外部草稿')).toHaveValue('不能丢失');expect(attempts).toBe(2)
 view.unmount();render(<PageView/>);await screen.findByText('页面已恢复');expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(attempts).toBe(2)
})
it('does not mount a pending page after its owner navigates away',async()=>{
 let resolve!:(module:{default:()=>React.ReactNode})=>void
 const mounted=vi.fn();const PageView=deferredPage(()=>new Promise<{default:()=>React.ReactNode}>(done=>{resolve=done}))
 const view=render(<PageView/>);expect(screen.getByRole('status')).toBeInTheDocument();await act(async()=>{await Promise.resolve()});view.unmount()
 await act(async()=>resolve({default:()=>{mounted();return <p>过期页面</p>}}))
 expect(mounted).not.toHaveBeenCalled();expect(screen.queryByText('过期页面')).not.toBeInTheDocument()
})

it('offers optional cancellation while pending but not after the page has loaded',async()=>{
 let resolve!:(module:{default:(props:{onExit:()=>void})=>React.ReactNode})=>void
 const cancel=vi.fn(),PageView=deferredPage(()=>new Promise<{default:(props:{onExit:()=>void})=>React.ReactNode}>(done=>{resolve=done}),{label:'取消打开',run:props=>props.onExit()})
 render(<PageView onExit={cancel}/>)
 fireEvent.click(screen.getByRole('button',{name:'取消打开'}));expect(cancel).toHaveBeenCalledTimes(1)
 await act(async()=>{await Promise.resolve();resolve({default:()=> <p>可保存的作答页面</p>})})
 await screen.findByText('可保存的作答页面')
 expect(screen.queryByRole('button',{name:'取消打开'})).not.toBeInTheDocument()
})
it('keeps optional cancellation available after a failed chunk without replacing its retry',async()=>{
 const cancel=vi.fn()
 const PageView=deferredPage<{onExit:()=>void}>(async()=>{throw Error('synthetic offline')},{label:'取消打开',run:props=>props.onExit()})
 render(<PageView onExit={cancel}/>)
 await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'重试页面内容'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'取消打开'}));expect(cancel).toHaveBeenCalledTimes(1)
})
