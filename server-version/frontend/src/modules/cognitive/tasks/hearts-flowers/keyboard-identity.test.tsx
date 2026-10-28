import React from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {createHFSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/hearts-flowers/package'
import {correctSide,hfPlan,HF_PROTOCOL} from './generated/protocol'
import {digest,hfManifest,type HFContext,type HFDraft,type HFPorts} from './contracts'
import {HeartsFlowersTask} from './HeartsFlowersTask'
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Actual HeartsFlowersTask keyboard sources',()=>{
 it.each(['arrow','focused'] as const)('records the canonical held token for the %s source',async kind=>{
  const snapshot={...createHFSnapshot('experience'),protocol:HF_PROTOCOL},randomSeed='hf-ui-keyboard-identity',base={contextKey:'hf-ui-keyboard-review',randomSeed,snapshot,administration:{language:'zh' as const,deviceClass:'UNKNOWN' as const,viewportCss:null,dpr:null,displayCalibration:null}},context:HFContext={...base,manifestHash:digest(hfManifest(base))},records:HFDraft[]=[]
  const ports:HFPorts={prepareLocalAttempt:async(c,manifest,realm)=>({fresh:true,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})}),persistLocalDraft:async r=>{records.push(structuredClone(r));return {retained:true,contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest}},finalize:vi.fn(async()=>{throw Error('No formal record expected')})}
  let now=100,next=0;const frames=new Map<number,FrameRequestCallback>()
  vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const callback of callbacks)callback(at);await flush()})}
  render(<HeartsFlowersTask context={context} ports={ports}/> )
  fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'})
  fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(101);await frame(102)
  const plan=hfPlan(snapshot.config,randomSeed,'practice')[0],side=correctSide(plan.shape,plan.side),key=kind==='arrow'?(side==='left'?'ArrowLeft':'ArrowRight'):`focus:${side}:NumpadEnter`,button=screen.getByRole('button',{name:side==='left'?'左':'右'}),target=kind==='arrow'?window:button
  now=103;fireEvent.keyDown(target,{key:kind==='arrow'?key:'Enter',code:kind==='arrow'?key:'NumpadEnter'})
  now=104;fireEvent.keyUp(target,{key:kind==='arrow'?key:'Enter',code:kind==='arrow'?key:'NumpadEnter'})
  await frame(1103)
  expect(records).toHaveLength(1);expect(records[0].raw.state.response).toMatchObject({side,input:'keyboard',key,token:'key:'+key})
  expect(records[0].raw.state.held).toEqual([]);expect(records[0].recordKey).toBe('practice:0:0')
  expect(ports.finalize).not.toHaveBeenCalled()
 })
})
