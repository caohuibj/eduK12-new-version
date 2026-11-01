import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import { CogestTaskV11 as Task } from '../CogestTaskV11'
const context={sessionId:'test',testType:'cogest',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',attemptNo:1,randomSeed:'audit',config:{totalTrials:1,stimulusSetVersion:'cogest-zh-v1.1.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'1.1.0',referenceMode:'none' as const}}}
beforeEach(()=>{vi.useFakeTimers()})
afterEach(()=>{cleanup();vi.useRealTimers()})
const options=()=>screen.getAllByRole('button').filter(x=>x.className.includes('btn-secondary'))
const tick=async(ms:number)=>act(async()=>{vi.advanceTimersByTime(ms)})
const mount=async(cb=vi.fn().mockResolvedValue(true),done=vi.fn().mockResolvedValue(undefined))=>{
 render(<Task taskContext={context} trialIndex={0} onTrialComplete={cb} onTaskComplete={done}/>);
 fireEvent.click(screen.getByText('开始练习'));await tick(400);return {cb,done}
}
const formal=async(cb=vi.fn().mockResolvedValue(true),done=vi.fn().mockResolvedValue(undefined))=>{
 const r=await mount(cb,done);fireEvent.pointerDown(options()[1]);fireEvent.click(screen.getByText('开始正式测评'));await tick(400);return r
}
it('practice wrong response requires full instructions and cannot write formal data',async()=>{
 const {cb}=await mount();fireEvent.pointerDown(options()[0]);expect(screen.queryByText('开始正式测评')).toBe(null);
 fireEvent.click(screen.getByText('重新阅读说明'));expect(screen.getByText('开始练习')).toBeTruthy();expect(cb).not.toHaveBeenCalled()
})
it('correct practice unlocks formal; timeout is null and leaves completion to the parent',async()=>{
 const {cb,done}=await formal();expect(cb).not.toHaveBeenCalled();await tick(15000);
 expect(cb).toHaveBeenCalledTimes(1);expect(cb.mock.calls[0][0]).toMatchObject({responseIndex:null,rtMs:null});expect(done).not.toHaveBeenCalled()
})
it('repeated key is ignored and a normal key records an actual zero-based option',async()=>{
 const {cb}=await formal();fireEvent.keyDown(window,{key:'1',repeat:true});expect(cb).not.toHaveBeenCalled();
 fireEvent.keyDown(window,{key:'1',repeat:false});await act(async()=>{});expect(cb).toHaveBeenCalledTimes(1);expect(cb.mock.calls[0][0].responseIndex).toBe(0)
})
it('a persisted final trial leaves submission confirmation to the parent',async()=>{
 const cb=vi.fn().mockResolvedValue(true),done=vi.fn().mockRejectedValue(new Error('offline'));await formal(cb,done);
 fireEvent.keyDown(window,{key:'2'});await act(async()=>{});expect(done).not.toHaveBeenCalled();expect(screen.getByText('已记录，下一题准备中')).toBeTruthy();
 fireEvent.keyDown(window,{key:'2'});expect(cb).toHaveBeenCalledTimes(1)
})

it('failed persistence waits for explicit retry and preserves original response facts',async()=>{
 const cb=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);const {done}=await formal(cb);
 fireEvent.keyDown(window,{key:'1'});await act(async()=>{});const original=cb.mock.calls[0][0];
 await tick(60000);expect(cb).toHaveBeenCalledTimes(1);expect(done).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('重试保存本题'));await act(async()=>{});expect(cb).toHaveBeenCalledTimes(2);expect(cb.mock.calls[1][0]).toEqual(original);expect(done).not.toHaveBeenCalled();
})

it('supports native option button activation through practice and formal response',async()=>{
 const {cb}=await mount();fireEvent.click(options()[1]);fireEvent.click(screen.getByText('开始正式测评'));await tick(400);
 fireEvent.click(options()[0]);await act(async()=>{});expect(cb).toHaveBeenCalledTimes(1);expect(cb.mock.calls[0][0].responseIndex).toBe(0)
})
