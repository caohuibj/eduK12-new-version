import React from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react'
vi.mock('./font-loader',()=>({loadBlinkFont:vi.fn(async()=>({release:vi.fn()}))}))
import {createBlinkSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/attentional-blink/package'
import {reviewBlink} from '../../../../../../backend/src/modules/cognitive/content-candidates/attentional-blink/analysis'
import {AttentionalBlinkTask} from './AttentionalBlinkTask'
import {NativeContentReport} from './NativeBlinkRunner'
import {BLINK_IDENTITY,BLINK_PROTOCOL,blinkPlan} from './generated/protocol'
import {isBlinkReport,type BlinkReport as Report} from './generated/report'
import {digest,type BlinkContext,type BlinkDraft,type BlinkPorts} from './contracts'
import type {NativePublicReportSnapshot} from '../../types'
import records from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/attentional-blink/representative-records.json'
import prior from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/batch-2/evidence/report-public-fixtures.json'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
const report=(value:unknown):Report=>{if(!isBlinkReport(value))throw Error('Invalid synthetic blink report');return value}
const native=(r:Report):NativePublicReportSnapshot=>({schemaVersion:1,...r,configVersion:'0.1.0',report:r})
describe('blink reviewed native consumers',()=>{
 it('uses conditional lag denominators, keeps true zero distinct from missing, and hides invalid performance',()=>{
  const view=render(<NativeContentReport snapshot={native(report(records.reports.partial))}/> )
  expect(screen.getByText(/本次第一个目标认对3\/6个有效轮次/)).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAccessibleDescription(/间隔10位：0\/1个第一目标正确轮次/)
  expect(within(screen.getByRole('img')).getByText('0%')).toBeInTheDocument()
  expect(within(screen.getByRole('img')).getAllByText('—')).toHaveLength(2)
  expect(screen.getByText(/全部有效轮次的第二目标精确正确/)).toHaveTextContent('3 / 6')
  view.rerender(<NativeContentReport snapshot={native(report(records.reports.invalid))}/> )
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByText(/全部有效轮次的第二目标精确正确/)).toBeNull()
  view.rerender(<NativeContentReport snapshot={native(report(prior.blink.complete))}/> )
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('先认对第一个时')
 })
 it('runs one real keyboard practice item with early held input and focused-button activation',async()=>{
  const snapshot=createBlinkSnapshot('experience'),randomSeed='blink-keyboard-review',context:BlinkContext={contextKey:'blink-keyboard-review',randomSeed,snapshot:{schemaVersion:1,...BLINK_IDENTITY,config:snapshot.config,protocol:BLINK_PROTOCOL,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},manifestHash:digest(blinkPlan(snapshot.config,randomSeed))}
  const stored:BlinkDraft[]=[],ports:BlinkPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async r=>{stored.push(structuredClone(r));return {retained:true as const,contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest}}),finalize:vi.fn()}
  let now=100,next=0;const frames=new Map<number,FrameRequestCallback>()
  vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await Promise.resolve()})}
  render(<AttentionalBlinkTask context={context} ports={ports}/> )
  fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'})
  fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(100)
  now=101;fireEvent.keyDown(window,{code:'KeyA',key:'a'})
  await frame(200);await frame(1000)
  const targets:string[]=[]
  for(let i=0;i<12;i++){
   if(document.querySelector('.blink-field circle'))targets.push(document.querySelector('.blink-field text')!.textContent!)
   await frame(1000+i*250+150);await frame(1000+(i+1)*250)
  }
  now++;fireEvent.keyDown(window,{code:'KeyA',key:'a',repeat:true})
  expect(screen.getByRole('button',{name:'确认两个回答'})).toBeDisabled()
  now++;fireEvent.keyUp(window,{code:'KeyA',key:'a'})
  now++;fireEvent.keyDown(window,{code:'Key'+targets[0],key:targets[0].toLowerCase()})
  const second=screen.getByRole('button',{name:'字母 '+targets[1]})
  now++;fireEvent.keyDown(second,{code:'Space',key:' '});now++;fireEvent.keyUp(second,{code:'Space',key:' '})
  const confirm=screen.getByRole('button',{name:'确认两个回答'})
  await act(async()=>{now++;fireEvent.keyDown(confirm,{code:'Enter',key:'Enter'});now++;fireEvent.keyUp(confirm,{code:'Enter',key:'Enter'});await Promise.resolve()})
  expect(stored).toHaveLength(1)
  expect(stored[0].raw.ignored).toMatchObject({early:1,repeat:1})
  expect(stored[0].raw.actions.map(a=>a.key)).toEqual(['Key'+targets[0],'Space','Enter'])
  expect(reviewBlink(stored[0].raw,stored[0].raw.plan,snapshot.config)).toMatchObject({valid:true,both:true})
  expect(screen.getByRole('status')).toHaveTextContent('两个字母和顺序都答对了')
  expect(ports.finalize).not.toHaveBeenCalled()
 })
})
