import {useState} from 'react'
import {act,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {EmbeddedfiguresTask} from '../EmbeddedfiguresTask'
import {embeddedfiguresItemV2} from '../generator.v2'
import type {CognitiveTaskProps} from '../../../core/runner.types'
const context={sessionId:'synthetic',testType:'embeddedfigures',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',attemptNo:1,randomSeed:'fixture',config:{totalTrials:1,stimulusSetVersion:'embeddedfigures-zh-v1.1.0',showTargetMs:3000,timeoutMs:15000,validRtFloorMs:400,report:{reportVersion:'1.1.0',referenceMode:'none'}}}
let now=1000
beforeEach(()=>{now=1000;vi.useFakeTimers();vi.spyOn(performance,'now').mockImplementation(()=>now)})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})
const advance=async(ms:number)=>{now+=ms;await act(async()=>{vi.advanceTimersByTime(ms)})}
const choice=(id:string)=>screen.getByRole('button',{name:'选择图块 '+(Number(id.slice(1))+1)})
async function formal(){fireEvent.click(screen.getByRole('button',{name:'开始练习'}));await advance(3000);fireEvent.click(choice(embeddedfiguresItemV2('fixture:practice',0).targetId));fireEvent.click(screen.getByRole('button',{name:'开始正式测评'}));await advance(3000)}
describe('corrected embedded figures runner',()=>{
 it('teaches only after a practice response and requires actual practice correctness',async()=>{
  const save=vi.fn();render(<EmbeddedfiguresTask taskContext={context as CognitiveTaskProps['taskContext']} trialIndex={0} onTrialComplete={save}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始练习'}));await advance(3000)
  const correct=embeddedfiguresItemV2('fixture:practice',0).targetId
  const wrong=correct==='s0'?'s1':'s0';fireEvent.click(choice(wrong))
  expect(screen.queryByRole('button',{name:'开始正式测评'})).not.toBeInTheDocument()
  expect(document.querySelector('.embedded-teaching-answer')).toBeTruthy();expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'重新阅读说明并练习'}));expect(screen.getByText(/形状、大小和方向保持不变/)).toBeVisible()
 })
 it('uses equal unhinted choices and preserves the first response on a rejected-save retry, including zero RT',async()=>{
  const save=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  render(<EmbeddedfiguresTask taskContext={context as CognitiveTaskProps['taskContext']} trialIndex={0} onTrialComplete={save}/>)
  await formal();expect(screen.getAllByRole('button',{name:/选择图块/})).toHaveLength(7)
  expect(document.querySelectorAll('polygon')).toHaveLength(0)
  expect(document.querySelectorAll('.embedded-choice svg')).toHaveLength(7)
  fireEvent.click(choice(embeddedfiguresItemV2('fixture',0).targetId));await act(async()=>{})
  expect(save.mock.calls[0][0]).toMatchObject({itemIndex:0,rtMs:0,interrupted:false})
  await advance(1000);fireEvent.click(screen.getByRole('button',{name:'重试保存本题'}));await act(async()=>{})
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0])
 })
 it('advances through real parent trial indexes and records timeout separately from a real choice',async()=>{
  const save=vi.fn(),complete=vi.fn()
  function Harness(){const [index,setIndex]=useState(0);return <EmbeddedfiguresTask taskContext={{...context,config:{...context.config,totalTrials:2}} as CognitiveTaskProps['taskContext']} trialIndex={index} onTrialComplete={async p=>{save(p);if(index===0)setIndex(1)}} onTaskComplete={complete}/>}
  render(<Harness/>);await formal();await advance(900);fireEvent.click(choice(embeddedfiguresItemV2('fixture',0).targetId));await act(async()=>{})
  expect(screen.getByText('第 2 / 2 题')).toBeVisible();expect(screen.getByText('记住目标的形状、大小和方向')).toBeVisible()
  await advance(3000);await advance(15000)
  expect(save.mock.calls[1][0]).toMatchObject({itemIndex:1,clickedShapeId:null,rtMs:null});expect(complete).toHaveBeenCalledTimes(1)
 })
})
