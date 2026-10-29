import React from 'react'
import '@testing-library/jest-dom/vitest'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MotTask} from './MotTask'
import {motConfig,motTrialPlan} from './generated/protocol'
import {motDraftKey,type MotDraftPort,type MotDraftRecord} from './draft'
const config=motConfig('experience'),seed='mot-practice-product-policy'
let testAttempt=0,clock=0,paint:FrameRequestCallback
const records:MotDraftRecord[]=[]
const makePort=():MotDraftPort=>({binding:{sessionId:'synthetic-practice-'+testAttempt,attemptNo:1,protocolKey:'mot/1.1.1/1.1.0',resolvedConfigHash:'synthetic-only',randomSeed:seed},pending:vi.fn(async()=>null),begin:vi.fn(async()=>{}),append:vi.fn(async()=>{}),
 records:vi.fn(async()=>[]),practices:vi.fn(async()=>records),appendPractice:vi.fn(async r=>{records.push(structuredClone(r))})})
async function setup(){const port=makePort();render(<MotTask config={config} randomSeed={seed} trialIndex={0} draft={port}
 onTrialComplete={vi.fn(async()=>true)} prepareFinalArchive={vi.fn(async()=>{})}/>);
 fireEvent.click(screen.getByRole('button',{name:'校准屏幕'}));fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'确认校准'}));return port}
async function start(){fireEvent.click(screen.getByRole('button',{name:/^开始$/}));await waitFor(()=>expect(document.querySelector('[data-mot-stage="fixation"]')).not.toBeNull())}
function toResponse(){const base=clock;for(const offset of[500,1500,9500,10000])act(()=>{clock=base+offset;paint(clock)})}
function choose(ids:number[]){const board=document.querySelector('.mot-board')!;for(const id of ids){(document.querySelector(`[data-mot-id="${id}"]`) as HTMLElement).focus();fireEvent.keyDown(board,{key:'Enter'})}}
beforeEach(()=>{testAttempt++;records.length=0;clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);
 vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{paint=cb;return 1}));vi.stubGlobal('cancelAnimationFrame',vi.fn())})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('keeps interrupted practice as an interrupted record and cannot advance to formal',async()=>{
 const port=await setup();await start();act(()=>{clock=100;window.dispatchEvent(new Event('blur'))});
 expect(await screen.findByRole('heading',{name:'练习已中断'})).toBeInTheDocument();
 expect(screen.queryByText('找回目标 0 / 5')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'再练习一次'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'进入正式作答'})).not.toBeInTheDocument();
 expect(port.appendPractice).toHaveBeenCalledTimes(1);expect(records[0].core.interruptions).toEqual(['window_blur']);expect(records[0].core.responses).toEqual([]);
 fireEvent.click(screen.getByRole('button',{name:'重试本次练习'}));await start();expect(records).toHaveLength(1)
})
it('allows a completed genuinely zero-hit practice to remain zero and advance',async()=>{
 await setup();await start();toResponse();const plan=motTrialPlan(config,seed,0,true);choose(plan.objects.filter(o=>!plan.targetIds.includes(o.id)).map(o=>o.id));
 expect(await screen.findByRole('heading',{name:'练习记录'})).toBeInTheDocument();expect(screen.getByText('找回目标 0 / 5')).toBeInTheDocument();
 expect(records[0].core.interruptions).toEqual([]);expect(records[0].core.responses).toHaveLength(5);expect(screen.getByRole('button',{name:'再练习一次'})).toBeInTheDocument()
})
it('does not let an interrupted second practice unlock formal trials',async()=>{
 await setup();await start();toResponse();choose(motTrialPlan(config,seed,0,true).targetIds);await screen.findByRole('heading',{name:'练习记录'});
 fireEvent.click(screen.getByRole('button',{name:'再练习一次'}));await start();act(()=>{window.dispatchEvent(new Event('blur'))});
 await screen.findByRole('heading',{name:'练习已中断'});expect(records).toHaveLength(2);expect(screen.queryByRole('button',{name:'进入正式作答'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'重试本次练习'})).toBeInTheDocument()
})

it('preserves old draft identity for reading without aliasing it into the new engine',()=>{
 const current=makePort().binding;const old={...current,protocolKey:'mot/1.1.0/1.1.0' as const};
 expect(motDraftKey(old)).not.toBe(motDraftKey(current));expect(JSON.parse(motDraftKey(old)).protocolKey).toBe('mot/1.1.0/1.1.0')
})
