import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainingCheckpointPanel } from './TrainingCheckpointPanel'
import { assertCheckpointBinding, requestTrainingCheckpoint, type TrainingCheckpoint, type TrainingPersistence } from './training-checkpoint'
vi.mock('./training-checkpoint',async()=>({...await vi.importActual('./training-checkpoint'),requestTrainingCheckpoint:vi.fn()}))
const policy:TrainingPersistence={snapshotHash:'a'.repeat(64),attemptId:'attempt',attemptEpoch:2,courseId:'course',checkpoint:{enabled:true,ttlHours:24},localCognitive:null}
const hash='b'.repeat(64)
const base:TrainingCheckpoint={revision:3,successfulSaveCount:2,expiresAt:null,envelope:null,trainingPersistence:policy}
const saved={...base,envelope:{schemaVersion:1 as const,snapshotHash:policy.snapshotHash,definitionHash:hash,drafts:[{slotKey:'scale:a',answers:{q:{responseValue:2}}}],cognitiveResults:[]}}
const mock=vi.mocked(requestTrainingCheckpoint)
const props=()=>({policy,definitionHash:hash,disabled:false,getDrafts:vi.fn(async()=>[{slotKey:'scale:a',answers:{q:{responseValue:1}}}]),restore:vi.fn(async()=>{}),onBusy:vi.fn(),activeSlotKeys:['scale:a']})
beforeEach(()=>{vi.clearAllMocks();mock.mockResolvedValue(base)})
describe('explicit Training checkpoint recovery',()=>{
  it('does not fetch or render for legacy/off policy',()=>{const p=props();const view=render(<TrainingCheckpointPanel {...p} policy={undefined}/>);expect(mock).not.toHaveBeenCalled();expect(view.container.textContent).toBe('')})
  it('requires an explicit choice, never restores on read, and reads once across rerenders',async()=>{
    mock.mockResolvedValue(saved);const p=props();const view=render(<TrainingCheckpointPanel {...p}/>);await screen.findByText('继续使用本机草稿');expect(p.restore).not.toHaveBeenCalled();expect((screen.getByText('保存服务器草稿') as HTMLButtonElement).disabled).toBe(true)
    view.rerender(<TrainingCheckpointPanel {...p} getDrafts={vi.fn(async()=>[])}/>);expect(mock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('继续使用本机草稿'));expect(p.restore).not.toHaveBeenCalled();expect((screen.getByText('保存服务器草稿') as HTMLButtonElement).disabled).toBe(false)
  })
  it('restores only after explicit selection',async()=>{mock.mockResolvedValue(saved);const p=props();render(<TrainingCheckpointPanel {...p}/>);await screen.findByText('用服务器草稿替换本机未提交答案');fireEvent.click(screen.getByText('用服务器草稿替换本机未提交答案'));await waitFor(()=>expect(p.restore).toHaveBeenCalledWith(saved.envelope.drafts));expect(mock).toHaveBeenCalledTimes(1)})
  it('uses observed revision once for double click and preserves local on stale CAS',async()=>{
    const p=props();render(<TrainingCheckpointPanel {...p}/>);await screen.findByText(/已成功保存 2/)
    let reject!:(error:unknown)=>void;mock.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail}))
    fireEvent.click(screen.getByText('保存服务器草稿'));fireEvent.click(screen.getByText('保存服务器草稿'))
    await waitFor(()=>expect(mock).toHaveBeenCalledTimes(2));expect(mock.mock.calls[1][4]).toMatchObject({expectedRevision:3,attemptEpoch:2})
    await act(async()=>reject({status:409}));await screen.findByText(/服务器版本已改变/);expect(p.restore).not.toHaveBeenCalled();expect((screen.getByText('保存服务器草稿') as HTMLButtonElement).disabled).toBe(true)
  })
  it('clear uses CAS and reports cumulative count without deleting local',async()=>{const p=props();render(<TrainingCheckpointPanel {...p}/>);await screen.findByText(/已成功保存 2/);mock.mockResolvedValueOnce({...base,revision:4});fireEvent.click(screen.getByText('清除服务器草稿'));await screen.findByText('服务器草稿已清除，本机答案仍保留。');expect(mock.mock.calls[1].slice(3)).toEqual(['DELETE',{expectedRevision:3,attemptEpoch:2}]);expect(p.restore).not.toHaveBeenCalled()})
  it('rejects wrong immutable identity instead of trusting context hashes',()=>{expect(()=>assertCheckpointBinding({...base,trainingPersistence:{...policy,attemptEpoch:3}},policy,hash)).toThrow();expect(()=>assertCheckpointBinding({...saved,envelope:{...saved.envelope,definitionHash:'wrong'}},policy,hash)).toThrow()})
})

it('preserves other unfinished units when a single SJT panel saves',async()=>{
  const other={slotKey:'form:other',answers:{q:'keep'}}
  mock.mockResolvedValueOnce({...saved,envelope:{...saved.envelope,drafts:[...saved.envelope.drafts,other]}})
  const p=props();render(<TrainingCheckpointPanel {...p} preserveOtherDrafts/>)
  await screen.findByText('继续使用本机草稿')
  fireEvent.click(screen.getByText('继续使用本机草稿'))
  mock.mockResolvedValueOnce({...base,revision:4})
  fireEvent.click(screen.getByText('保存服务器草稿'))
  await screen.findByText('服务器已确认保存草稿；这不是正式交卷。')
  expect((mock.mock.calls[1][4] as {envelope:{drafts:unknown[]}}).envelope.drafts).toEqual([other,{slotKey:'scale:a',answers:{q:{responseValue:1}}}])
})
