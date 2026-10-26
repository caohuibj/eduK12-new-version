import {describe,it,expect,vi} from 'vitest'
import {createMotSaveGate} from './save-gate'
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(ok=>{resolve=ok});return{promise,resolve}}
describe('MOT persistence concurrency',()=>{
 it('shares one in-flight save for repeated retries of a captured trial',async()=>{
  const gate=createMotSaveGate(),wait=deferred(),save=vi.fn(()=>wait.promise)
  const first=gate.run('formal:8',save),second=gate.run('formal:8',save)
  expect(second).toBe(first);await Promise.resolve();expect(save).toHaveBeenCalledTimes(1);wait.resolve();await first
 })
 it('refuses interleaving a different record',async()=>{
  const gate=createMotSaveGate(),wait=deferred(),other=vi.fn(async()=>{})
  const first=gate.run('formal:0',()=>wait.promise)
  await expect(gate.run('formal:1',other)).rejects.toThrow('different MOT record')
  expect(other).not.toHaveBeenCalled();wait.resolve();await first
 })
 it('allows an actual retry after failure',async()=>{
  const gate=createMotSaveGate(),save=vi.fn().mockRejectedValueOnce(new Error('unconfirmed')).mockResolvedValue(undefined)
  await expect(gate.run('practice:0',save)).rejects.toThrow('unconfirmed')
  await gate.run('practice:0',save);expect(save).toHaveBeenCalledTimes(2)
 })
 it('releases after synchronous failure and successful completion',async()=>{
  const gate=createMotSaveGate()
  await expect(gate.run('a',()=>{throw new Error('sync')})).rejects.toThrow('sync')
  await gate.run('a',async()=>{});await expect(gate.run('b',async()=>{})).resolves.toBeUndefined()
 })
})
