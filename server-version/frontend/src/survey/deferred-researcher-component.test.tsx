import {useState} from 'react'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {deferredResearcherComponent} from './deferred-researcher-component'
afterEach(cleanup)
describe('optional researcher code loading',()=>{
  it('retains the parent draft on failure and retries only after a deliberate click',async()=>{
    const load=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(({value}:{value:string})=><p>Editor {value}</p>)
    const Editor=deferredResearcherComponent<{value:string}>(load,'测试编辑器')
    function Parent(){const [draft,setDraft]=useState('saved');return <><input aria-label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><Editor value={draft}/></>}
    render(<Parent/>);fireEvent.change(screen.getByLabelText('Draft'),{target:{value:'unsaved'}})
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Draft')).toHaveValue('unsaved');expect(load).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button',{name:'重试测试编辑器'}))
    await screen.findByText('Editor unsaved');expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Draft')).toHaveValue('unsaved')
  })
  it('shares a pending code import and never resurrects a closed child',async()=>{
    let finish!:(component:({value}:{value:string})=>React.ReactNode)=>void
    const load=vi.fn(()=>new Promise<({value}:{value:string})=>React.ReactNode>(resolve=>{finish=resolve}))
    const Editor=deferredResearcherComponent<{value:string}>(load,'测试编辑器')
    const view=render(<><Editor value="first"/><Editor value="second"/></>)
    expect(load).toHaveBeenCalledOnce()
    view.rerender(<Editor value="latest"/>)
    await act(async()=>finish(({value})=><p>{value}</p>))
    expect(screen.getByText('latest')).toBeInTheDocument()
    expect(screen.queryByText('second')).not.toBeInTheDocument();expect(load).toHaveBeenCalledOnce()
  })
})
