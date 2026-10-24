import {Component,useState,type ReactNode} from 'react'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {createRetryableLazy} from '../RetryableLazy'

describe('retryable presentation chunks',()=>{
  it('loads only when mounted, keeps parent draft on rejection and retries only code',async()=>{
    let reject!:(reason:Error)=>void
    const load=vi.fn().mockImplementationOnce(()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise})).mockResolvedValueOnce({default:()=> <p>已加载管理内容</p>})
    const Feature=createRetryableLazy(load,'可选管理')
    function Parent(){const [open,setOpen]=useState(false),[draft,setDraft]=useState('');return <><input aria-label="保留的检索" value={draft} onChange={event=>setDraft(event.target.value)}/><button onClick={()=>setOpen(true)}>展开</button>{open&&<Feature/>}</>}
    render(<Parent/>);expect(load).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('保留的检索'),{target:{value:'draft'}})
    fireEvent.click(screen.getByText('展开'))
    await waitFor(()=>expect(load).toHaveBeenCalledTimes(1))
    await act(async()=>reject(new Error('synthetic chunk failure')))
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败')
    expect(screen.getByLabelText('保留的检索')).toHaveValue('draft')
    fireEvent.click(screen.getByText('重试可选管理'))
    expect(await screen.findByText('已加载管理内容')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('保留的检索')).toHaveValue('draft')
  })
  it('allows cancellation while pending and ignores a late resolution',async()=>{
    let resolve!:(value:{default:()=>ReactNode})=>void
    const load=vi.fn(()=>new Promise<{default:()=>ReactNode}>(done=>{resolve=done}))
    const Feature=createRetryableLazy<{onClose:()=>void}>(load,'账号操作',{label:'取消账号操作',run:props=>props.onClose()})
    function Parent(){const [open,setOpen]=useState(true);return <>{open&&<Feature onClose={()=>setOpen(false)}/>}<p>账号列表保留</p></>}
    render(<Parent/>);await waitFor(()=>expect(load).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('取消账号操作'))
    await act(async()=>resolve({default:()=> <p>迟到的管理弹窗</p>}))
    expect(screen.queryByText('迟到的管理弹窗')).not.toBeInTheDocument()
    expect(screen.getByText('账号列表保留')).toBeInTheDocument()
  })
  it('reopens a cancelled pending feature with the new selection after late code arrives',async()=>{
    type Props={name:string;onClose:()=>void}
    let resolve!:(value:{default:(props:Props)=>ReactNode})=>void
    const load=vi.fn(()=>new Promise<{default:(props:Props)=>ReactNode}>(done=>{resolve=done}))
    const Feature=createRetryableLazy(load,'账号管理',{label:'取消管理',run:props=>props.onClose()})
    function Parent(){const [name,setName]=useState<string|null>('原培训师');return <><input aria-label="账号检索草稿" defaultValue="保留检索"/><button onClick={()=>setName('新培训师')}>管理另一培训师</button>{name&&<Feature name={name} onClose={()=>setName(null)}/>}</>}
    render(<Parent/>);await waitFor(()=>expect(load).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('取消管理'))
    await act(async()=>resolve({default:props=><p>{props.name}</p>}))
    expect(screen.queryByText('原培训师')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('管理另一培训师'))
    expect(screen.getByText('新培训师')).toBeInTheDocument()
    expect(screen.queryByText('原培训师')).not.toBeInTheDocument()
    expect(screen.getByLabelText('账号检索草稿')).toHaveValue('保留检索')
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('shares loaded code without sharing props or mounted state',async()=>{
    const load=vi.fn(async()=>({default:({name}:{name:string})=><p>{name}</p>}))
    const Feature=createRetryableLazy(load,'管理')
    const first=render(<Feature name="第一账号"/>);await screen.findByText('第一账号');first.unmount()
    render(<Feature name="第二账号"/>);expect(screen.getByText('第二账号')).toBeInTheDocument();expect(load).toHaveBeenCalledTimes(1)
  })
  it('does not mislabel child render errors as chunk download failures',async()=>{
    class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}};render(){return this.state.failed?<p>真实渲染错误</p>:this.props.children}}
    const Feature=createRetryableLazy(async()=>({default:()=>{throw Error('synthetic render failure')}}),'管理')
    const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{})
    try{render(<Boundary><Feature/></Boundary>);expect(await screen.findByText('真实渲染错误')).toBeInTheDocument();expect(screen.queryByText('重试管理')).not.toBeInTheDocument()}finally{consoleError.mockRestore()}
  })
})
