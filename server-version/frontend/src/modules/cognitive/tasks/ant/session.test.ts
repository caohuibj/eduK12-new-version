import { describe,it,expect,vi } from 'vitest'
import { antRecordDigest } from './seal'
import { AntLocalQueue } from './local-save'
import { AntSession,type AntSessionOptions,type AntCompletion,type AntServerReceipt } from './session'
import { AntCapture } from './capture'
import { antConfig,antPlan } from './generated/protocol'
import { antFixtureDisplay } from './test-fixtures'
const display=antFixtureDisplay(),config=antConfig('experience'),seed='session-test'
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const raw=(index=0)=>{const c=new AntCapture(config,antPlan(config,seed)[index],display,'A',0,0);c.interrupt('runner_restart',1);return c.record()}
const receipt=(record:ReturnType<typeof raw>)=>({durable:true as const,contextId:record.contextId,key:record.key,recordDigest:antRecordDigest(record)})
const make=(patch:Partial<AntSessionOptions>={})=>{
  let now=0;const paint=vi.fn(),notify=vi.fn(),persist=vi.fn(async(r:ReturnType<typeof raw>)=>receipt(r)),server=vi.fn(async()=>null)
  const s=new AntSession({contextId:'A',config,seed,display,fixture:false,persistLocalDraft:persist,onTaskComplete:server,
    now:()=>now,timeOrigin:()=>0,paint,onChange:notify,...patch})
  s.authorizeExposure({contextId:patch.contextId??'A',durable:true,fresh:true,claimId:'synthetic-unit-claim'})
  return {s,paint,notify,persist,server,setNow:(n:number)=>{now=n}}
}
async function finishTrial(s:AntSession){
  const c=s.capture!,start=c.core.startedAtPerfMs,p=c.plan.plannedPreCueMs
  s.tick(start+p);s.tick(start+p+100);s.tick(start+p+500)
  c.input(c.plan.direction,'touch',start+p+900);s.tick(start+p+908);s.tick(start+4000)
  await s.queue.wait();await Promise.resolve()
}
async function finishPractice(s:AntSession){s.startPractice();s.tick(0);for(let i=0;i<24;i++)await finishTrial(s)}
describe('ANT serial durable-local draft and attempt isolation',()=>{
  it('requires a fresh durable context marker before the first exposure',()=>{
    const s=new AntSession({contextId:'A',config,seed,display,fixture:false,persistLocalDraft:async r=>receipt(r),onTaskComplete:async()=>null,now:()=>0,timeOrigin:()=>0,paint:()=>{},onChange:()=>{}})
    expect(()=>s.startPractice()).toThrow(/marker/)
    expect(()=>s.authorizeExposure({contextId:'A',durable:true,fresh:false,claimId:'stale'} as never)).toThrow(/marker/)
    s.authorizeExposure({contextId:'A',durable:true,fresh:true,claimId:'fresh'});s.startPractice();s.tick(0)
    expect(s.capture).not.toBeNull();s.close()
  })
  it('serializes writes, retries the exact cached record, and rejects false durability receipts',async()=>{
    const pending=deferred<ReturnType<typeof receipt>>(),seen:ReturnType<typeof raw>[]=[],fault=vi.fn()
    let attempts=0
    const queue=new AntLocalQueue('A',async record=>{seen.push(record);attempts++;if(attempts===1)return pending.promise;return receipt(record)},fault)
    queue.enqueue(raw(0));queue.enqueue(raw(1));await Promise.resolve();expect(seen).toHaveLength(1)
    pending.reject(Error('disk full'));await queue.wait();expect(queue.failed).toBe(true);expect(fault).toHaveBeenCalledOnce()
    expect(await queue.retry()).toBe(true);expect(seen).toHaveLength(3)
    expect(seen[1]).toEqual(seen[0]);expect(queue.durableCount).toBe(2)
    const bad=new AntLocalQueue('A',async()=>({durable:false} as never),vi.fn())
    bad.enqueue(raw());await bad.wait();expect(bad.failed).toBe(true)
  })
  it('bounds the queue, retains the overflow record and never invokes parallel writes',async()=>{
    const pending=deferred<ReturnType<typeof receipt>>(),fault=vi.fn(),persist=vi.fn(()=>pending.promise)
    const q=new AntLocalQueue('A',persist,fault,2)
    q.enqueue(raw(0));await Promise.resolve();q.enqueue(raw(1));q.enqueue(raw(2))
    expect(q.failed).toBe(true);expect(q.records()).toHaveLength(3);expect(persist).toHaveBeenCalledOnce()
    pending.resolve(receipt(raw(0)));await q.wait();expect(fault).toHaveBeenCalledWith('local_queue_overflow')
  })
  it('does not expose its cached original to callback mutation or accept a conflicting duplicate',async()=>{
    const q=new AntLocalQueue('A',async(r,seal)=>{r.raw.fixture=true;return {durable:true,...seal}},vi.fn())
    const original=raw();q.enqueue(original);original.raw.fixture=true;await q.wait()
    expect(q.records()[0].raw.fixture).toBe(false)
    const conflict=raw();conflict.core.endedAtPerfMs=2
    expect(()=>q.enqueue(conflict)).toThrow(/conflict/)
    expect(()=>q.enqueue({...raw(),contextId:'B'})).toThrow(/context/)
  })
  it('keeps 4-second starts continuous while the local write is pending',async()=>{
    const pending=deferred<ReturnType<typeof receipt>>()
    const {s}=make({persistLocalDraft:()=>pending.promise})
    s.startPractice();s.tick(0)
    const c=s.capture!,p=c.plan.plannedPreCueMs
    s.tick(p);s.tick(p+100);s.tick(p+500);c.input(c.plan.direction,'touch',p+900);s.tick(p+908);s.tick(4000)
    expect(s.capture!.core.startedAtPerfMs).toBe(4000);expect(s.index).toBe(1)
    expect(s.queue.pendingCount).toBe(1);expect(s.view).toBe('running')
    pending.resolve(receipt(s.records()[0]));await s.queue.wait();s.close()
  })
  it('completes 24 separate practice then 48 formal, final server ack remains distinct',async()=>{
    const server=vi.fn(async(completion:AntCompletion)=>({...completion,serverSaved:true,receiptId:'server-receipt-1'}))
    const {s}=make({onTaskComplete:server})
    await finishPractice(s);expect(s.view).toBe('practice-feedback')
    expect(s.records()).toHaveLength(24);expect(s.records().every(r=>r.phase==='practice')).toBe(true)
    s.startFormal();s.tick(100000)
    for(let i=0;i<48;i++)await finishTrial(s)
    await Promise.resolve();await Promise.resolve()
    expect(s.view).toBe('complete');expect(s.records()).toHaveLength(72)
    expect(s.records().filter(r=>r.phase==='test')).toHaveLength(48)
    expect(server).toHaveBeenCalledOnce();expect(s.serverSaved).toBe(true)
    expect(server.mock.calls[0][0]).toMatchObject({localDurableCount:72,status:'complete'})
    const starts=s.records().filter(r=>r.phase==='test').map(r=>r.core.startedAtPerfMs)
    expect(starts.slice(1).every((v,i)=>v-starts[i]===4000)).toBe(true)
  })
  it('interrupted practice cannot unlock formal or silently count as passed',async()=>{
    const {s,setNow}=make();s.startPractice();s.tick(0);setNow(30);s.stop('visibility_lost',30);await s.queue.wait()
    expect(s.view).toBe('terminated');expect(s.records()[0].phase).toBe('practice')
    expect(s.records()[0].core.interruptions[0].kind).toBe('visibility_lost')
    s.startFormal();expect(s.capture).toBeNull();expect(s.view).toBe('terminated')
  })
  it('missing actual stages after a stall terminates practice without progress',async()=>{
    const {s}=make();s.startPractice();s.tick(0);s.tick(4100);await s.queue.wait()
    expect(s.view).toBe('terminated');expect(s.index).toBe(0)
    expect(s.records()[0].core.targetOnsetPerfMs).toBeNull()
  })
  it('save failure interrupts the already-exposed trial; retry saves originals without restarting',async()=>{
    const pending=deferred<ReturnType<typeof receipt>>(),saved:ReturnType<typeof raw>[]=[],later=vi.fn(async(r:ReturnType<typeof raw>)=>receipt(r))
    let first=true
    const {s,setNow}=make({persistLocalDraft:async r=>{saved.push(structuredClone(r));if(first){first=false;return pending.promise}return later(r)}})
    s.startPractice();s.tick(0)
    const c=s.capture!,p=c.plan.plannedPreCueMs
    s.tick(p);s.tick(p+100);s.tick(p+500);c.input(c.plan.direction,'touch',p+900);s.tick(p+908);s.tick(4000)
    setNow(4050);pending.reject(Error('quota'));await s.queue.wait()
    expect(s.view).toBe('error');expect(s.capture).toBeNull();expect(s.records()).toHaveLength(2)
    expect(s.records()[1].core.endedAtPerfMs).toBe(4050)
    await s.retryLocal();expect(s.view).toBe('terminated');expect(saved[1]).toEqual(saved[0])
    s.tick(9000);s.startFormal();expect(s.capture).toBeNull();expect(s.records()).toHaveLength(2)
  })
  it('only resumes at the real research block boundary, preserving planned indices',async()=>{
    const {s}=make({config:antConfig('research')});await finishPractice(s);s.startFormal();s.tick(100000)
    for(let i=0;i<96;i++)await finishTrial(s)
    expect(s.view).toBe('break');expect(s.index).toBe(96)
    s.continueBlock();s.tick(600000)
    expect(s.capture!.plan.blockIndex).toBe(1);expect(s.capture!.plan.trialIndex).toBe(96)
    s.close();await s.queue.wait()
  })
  it('binds local receipt digest and final receipt to the exact frozen request',async()=>{
    const q=new AntLocalQueue('A',async(r,seal)=>({durable:true,...seal,recordDigest:'0'.repeat(64)}),vi.fn())
    q.enqueue(raw());await q.wait();expect(q.failed).toBe(true);expect(q.durableCount).toBe(0)
    for(const field of ['requestDigest','configHash','protocolSignature','localRecordSetDigest'] as const){
      const {s}=make({onTaskComplete:async completion=>({...completion,serverSaved:true,receiptId:'old-ack',[field]:'0'.repeat(64)})})
      s.startPractice();s.tick(0);s.stop('window_blur',10);await s.queue.wait();await s.finalize()
      expect(s.serverSaved).toBe(false)
    }
  })
  it('shares one final promise before local acknowledgement and rejects concurrent submission',async()=>{
    const local=deferred<ReturnType<typeof receipt>>(),server=deferred<AntServerReceipt|null>()
    const submit=vi.fn(()=>server.promise),{s}=make({persistLocalDraft:()=>local.promise,onTaskComplete:submit})
    s.startPractice();s.tick(0);s.stop('window_blur',10)
    const one=s.finalize(),two=s.finalize();expect(one).toBe(two);expect(submit).not.toHaveBeenCalled()
    local.resolve(receipt(s.records()[0]));await s.queue.wait();await Promise.resolve()
    expect(submit).toHaveBeenCalledOnce()
    const completion=submit.mock.calls[0][0] as AntCompletion
    server.resolve({...completion,serverSaved:true,receiptId:'new-ack'})
    await one;expect(s.serverSaved).toBe(true)
  })
  it('clones and freezes measurement config/display before the host mutates its objects',()=>{
    const mutableDisplay=structuredClone(display),mutableConfig=antConfig('experience'),{s}=make({display:mutableDisplay,config:mutableConfig})
    mutableDisplay.geometry.arrowWidthCssPx=100;mutableConfig.neutralVariant='dashes'
    expect(s.options.display.geometry.arrowWidthCssPx).toBe(28);expect(s.options.config.neutralVariant).toBe('absent')
    expect(Object.isFrozen(s.options.display.geometry)).toBe(true);expect(Object.isFrozen(s.options.config)).toBe(true)
  })
  it('closed contexts cannot finalize after a late durable callback or mutate another context',async()=>{
    const pending=deferred<ReturnType<typeof receipt>>(),oldServer=vi.fn(async()=>null)
    const {s:old,setNow}=make({persistLocalDraft:()=>pending.promise,onTaskComplete:oldServer})
    old.startPractice();old.tick(0);setNow(10);old.close()
    const newer=make({contextId:'B'}).s;expect(newer.view).toBe('intro')
    pending.resolve(receipt(old.records()[0]));await old.queue.wait();await old.finalize()
    expect(oldServer).not.toHaveBeenCalled();expect(newer.records()).toEqual([])
  })
})
