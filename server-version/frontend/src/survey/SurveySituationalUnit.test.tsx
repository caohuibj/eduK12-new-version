import { render,screen,waitFor,fireEvent,cleanup } from '@testing-library/react'
import { afterEach,describe,it,expect,vi } from 'vitest'
import { SurveySituationalUnit } from './SurveySituationalUnit'
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:({host}:{host:{onCompleted:()=>void}})=><button type="button" onClick={host.onCompleted}>共享 runner 完成回调</button>}))
const reference={protocol:'SITUATIONAL_NATIVE_V1' as const,attemptId:'11111111-1111-4111-8111-111111111111',submissionId:'22222222-2222-4222-8222-222222222222',payloadHash:'a'.repeat(64)}
const props={publicId:'project',attemptId:'parent',slotKey:'staged',title:'Staged tool',accessCredential:'x'.repeat(43)}
const reply=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,message:'ok',data})} as Response)
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Survey shared native SJT host adapter',()=>{
  it('restores only a server accepted receipt without exposing proof in URL',async()=>{
    const fetch=vi.fn((_url:RequestInfo|URL,_options?:RequestInit)=>reply({attempt:{id:reference.attemptId,status:'COMPLETED'},receipt:reference}));vi.stubGlobal('fetch',fetch)
    const onCommitted=vi.fn();render(<SurveySituationalUnit {...props} onCommitted={onCommitted}/>)
    await screen.findByText(/已可靠保存/)
    expect(onCommitted).toHaveBeenCalledWith(reference)
    expect(fetch.mock.calls[0][0]).not.toContain(props.accessCredential)
    expect(JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({accessCredential:props.accessCredential})
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not treat a runner completion callback as server completion',async()=>{
    const fetch=vi.fn((_url:RequestInfo|URL,_options?:RequestInit)=>reply({attempt:{id:reference.attemptId,status:'IN_PROGRESS'}}));vi.stubGlobal('fetch',fetch)
    const onCommitted=vi.fn();render(<SurveySituationalUnit {...props} onCommitted={onCommitted}/>)
    fireEvent.click(await screen.findByRole('button',{name:'共享 runner 完成回调'}))
    await screen.findByText(/尚未核实正式保存回执/)
    expect(onCommitted).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('discards an old-proof asynchronous response after changing the host',async()=>{
    let resolve!:(response:Response)=>void
    const pending=new Promise<Response>(done=>{resolve=done})
    const fetch=vi.fn().mockReturnValueOnce(pending).mockImplementation(()=>reply({attempt:{id:'new-child',status:'IN_PROGRESS'}}));vi.stubGlobal('fetch',fetch)
    const onCommitted=vi.fn();const view=render(<SurveySituationalUnit {...props} onCommitted={onCommitted}/>)
    view.rerender(<SurveySituationalUnit {...props} attemptId="new-parent" accessCredential={'y'.repeat(43)} onCommitted={onCommitted}/>)
    await screen.findByRole('button',{name:'共享 runner 完成回调'})
    resolve(await reply({attempt:{id:reference.attemptId,status:'COMPLETED'},receipt:reference}))
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
    expect(onCommitted).not.toHaveBeenCalled()
    expect(screen.queryByText(/已可靠保存/)).toBeNull()
  })
})
