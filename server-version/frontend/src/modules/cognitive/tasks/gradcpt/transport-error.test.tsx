import React from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
vi.mock('./asset-loader',()=>({loadGradAssets:async()=>({urls:Object.fromEntries(['scrambled.png',...Array.from({length:10},(_,i)=>`city${i+1}.png`),...Array.from({length:10},(_,i)=>`mountain${i+1}.png`)].map(name=>[name,'/synthetic/'+name])),release:()=>{}})}))
import {createGradSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/gradcpt/package'
import {GRAD_PROTOCOL,gradPlan,gradPracticePlans} from './generated/protocol'
import {digest,type GradContext,type GradDraft,type GradPorts} from './contracts'
import {GradCptTask} from './GradCptTask'
import {GradTransportError,gradTransportFailureMessage} from './transport-error'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('shows only the safe transport reason and retries the identical sealed claim without replay or exposing unknown errors',async()=>{
 const snapshot={...createGradSnapshot('experience'),protocol:GRAD_PROTOCOL},randomSeed='grad-safe-save-failure',context:GradContext={contextKey:'grad-safe-save-review',snapshot,randomSeed,manifestHash:digest(gradPlan(snapshot.config,randomSeed))},records:GradDraft[]=[]
 const ports:GradPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:async r=>{records.push(structuredClone(r));return {retained:true,contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest}},finalize:vi.fn(async()=>{throw new GradTransportError('COMPRESSION_UNAVAILABLE')})}
 let now=100,next=0;const frames=new Map<number,FrameRequestCallback>()
 vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
 const frame=async(at:number)=>{now=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const callback of callbacks)callback(at);await flush()})}
 render(<GradCptTask context={context} ports={ports} language="en"/> )
 fireEvent.click(screen.getByRole('button',{name:'Prepare practice'}));await screen.findByRole('button',{name:'Start'});fireEvent.click(screen.getByRole('button',{name:'Start'}));await frame(now)
 for(const [index,plan] of gradPracticePlans(snapshot.config,randomSeed,0).entries()){
  for(const slot of plan){const start=now;if(slot.kind==='city'){await frame(start+slot.durationMs*.9);now++;fireEvent.keyDown(window,{code:'Space',key:' '});now++;fireEvent.keyUp(window,{code:'Space',key:' '})}await frame(start+slot.durationMs)}
  if(index<7)fireEvent.click(screen.getByRole('button',{name:'Next practice picture'}))
 }
 fireEvent.click(screen.getByRole('button',{name:'Prepare formal sequence'}));fireEvent.click(screen.getByRole('button',{name:'Start'}));await frame(now)
 now++;fireEvent.blur(window);await act(async()=>flush())
 expect(screen.getByText(gradTransportFailureMessage('COMPRESSION_UNAVAILABLE','en'))).toBeTruthy()
 expect(gradTransportFailureMessage('COMPRESSION_UNAVAILABLE','zh')).toContain('原件仍保留')
 expect(screen.queryByRole('img')).toBeNull();const retained=structuredClone(records)
 vi.mocked(ports.finalize).mockRejectedValue(new Error('PRIVATE_BACKEND_DETAIL_DO_NOT_DISPLAY'))
 fireEvent.click(screen.getByRole('button',{name:'Retry saving'}));await act(async()=>flush())
 expect(screen.queryByText(/PRIVATE_BACKEND_DETAIL/)).toBeNull();expect(screen.queryByText(gradTransportFailureMessage('COMPRESSION_UNAVAILABLE','en'))).toBeNull()
 expect(screen.getByText(/Keep this page open and retry saving the same records/)).toBeTruthy()
 expect(vi.mocked(ports.finalize).mock.calls[1][0]).toEqual(vi.mocked(ports.finalize).mock.calls[0][0]);expect(records).toEqual(retained);expect(ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
})
