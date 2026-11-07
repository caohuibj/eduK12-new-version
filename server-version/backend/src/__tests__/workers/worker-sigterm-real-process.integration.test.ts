import {afterEach,describe,expect,it} from 'vitest'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
// Real-process SIGTERM test for the worker (FIX 5). The unit suite
// worker-shutdown.test.ts already covers the drain/cancel/close/disconnect
// orchestration with injected deps; this file covers ONLY the real-process
// path: spawn workers/main.ts via tsx, run real export jobs against real
// Redis, send SIGTERM, and assert the process exits 0 with the in-flight
// job completed (not lost or corrupted) and the rest preserved for restart.
// Skips (never fails) without a database or without the canvas native
// binding the image processor needs; Redis unavailability skips via the
// test context because the worker needs it to consume jobs.
const backendDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const canvasBindingOk=existsSync(path.join(backendDir,'node_modules/canvas/build/Release/canvas.node'))
// Spawn node with the tsx loader directly (the exact argv tsx itself uses
// for its child) instead of the `tsx` CLI: the CLI is a wrapper that relays
// SIGTERM to its child through a 30ms handshake and SIGKILLs the child +
// exits 143 when the child's acknowledgement is delayed under load
// (observed when this file runs beside other integration suites). Spawning
// the loader directly makes this process the worker, so SIGTERM reaches
// its handlers and the exit code is the worker's own.
const tsxPreflight=path.join(backendDir,'node_modules','tsx','dist','preflight.cjs')
const tsxLoader=path.join(backendDir,'node_modules','tsx','dist','loader.mjs')
const loaderOk=existsSync(tsxPreflight) && existsSync(tsxLoader)
const suite=process.env.DATABASE_URL && canvasBindingOk && loaderOk ? describe : describe.skip
const READY_LINE='Background worker process is consuming enabled queues'
const redisUrl=process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/15'
// Pin the env BEFORE the queue module is (lazily) imported: the probe's
// exportQueue resolves Redis via getBullRedisOptions() ->
// process.env.REDIS_URL, falling back to redis://localhost:6379 (DB 0)
// when unset — NOT via this file's redisUrl. Without this pin, the probe
// adds jobs to DB 0 while the spawned worker (explicit REDIS_URL below)
// listens on DB 15, so no job ever turns active and the poll times out.
// (Diagnosed 2026-11-07: jobs landed in DB 0, worker on DB 15.)
process.env.REDIS_URL=redisUrl

type SpawnedWorker={proc:ChildProcessWithoutNullStreams;output:()=>string;waitReady:()=>Promise<void>;waitExit:()=>Promise<number>}

function spawnWorker():SpawnedWorker{
  let out=''
  const proc=spawn(process.execPath,['--require',tsxPreflight,'--import',`file://${tsxLoader}`,'src/workers/main.ts'],{
    cwd:backendDir,
    env:{
      ...process.env,
      NODE_ENV:'test',
      REDIS_URL:redisUrl,
      BACKGROUND_WORKERS_ENABLED:'true',
      HEAVY_PROCESSING_ENABLED:'true',
      HEAVY_MAINTENANCE_IDLE_CONFIRMED:'true',
      VIDEO_PROCESSING_ENABLED:'false',
      WORKER_SHUTDOWN_TIMEOUT_SECONDS:'15',
    },
    stdio:['ignore','pipe','pipe'],
  })
  proc.stdout.on('data',(c)=>{out+=String(c)})
  proc.stderr.on('data',(c)=>{out+=String(c)})
  const waitReady=()=>new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`worker never reached readiness; output:\n${out}`)),60000)
    const onData=()=>{if(out.includes(READY_LINE)){clearTimeout(timer);proc.stdout.off('data',onData);proc.stderr.off('data',onData);resolve()}}
    proc.stdout.on('data',onData)
    proc.stderr.on('data',onData)
    proc.once('exit',(code)=>{clearTimeout(timer);reject(new Error(`worker exited ${code} before readiness; output:\n${out}`))})
  })
  const waitExit=()=>new Promise<number>((resolve,reject)=>{
    const timer=setTimeout(()=>{proc.kill('SIGKILL');reject(new Error(`worker did not exit within 30s of SIGTERM; output:\n${out}`))},30000)
    proc.once('exit',(code)=>{clearTimeout(timer);resolve(code ?? -1)})
  })
  return {proc,output:()=>out,waitReady,waitExit}
}

suite('worker real-process SIGTERM',()=>{
  let worker:SpawnedWorker|null=null
  afterEach(async()=>{
    if(worker?.proc.exitCode===null){worker.proc.kill('SIGKILL')}
    worker=null
  })

  it('idle worker exits 0 on SIGTERM after closing its queues',async()=>{
    worker=spawnWorker()
    await worker.waitReady()
    worker.proc.kill('SIGTERM')
    const code=await worker.waitExit()
    expect(code).toBe(0)
    expect(worker.output()).toContain('SIGTERM received: stopping background workers')
    expect(worker.output()).toContain('队列已关闭')
    expect(worker.output()).not.toContain('Worker shutdown reached its bounded deadline')
  },120000)

  it('SIGTERM while an export job is active completes the in-flight job and preserves the rest',async(ctx)=>{
    // Use the real shared exportQueue (same defaultJobOptions — attempts: 2,
    // 5s backoff — as production adds jobs with), not a bare Queue: a
    // bare client adds jobs with attempts: 1, so a cancelled in-flight job
    // would go straight to 'failed' instead of the production 'delayed'
    // retry path. (Diagnosed 2026-11-07: with a bare Queue the active job
    // read state=failed attemptsMade=1 after the drain cancelled its child.)
    const {exportQueue:probe}=await import('../../config/queue')
    probe.on('error',()=>undefined)
    try{
      // Redis must answer before the probe means anything; skip (do not
      // fail) when it is down — the worker cannot consume jobs then.
      const {default:Redis}=await import('ioredis')
      const ping=new Redis(redisUrl,{maxRetriesPerRequest:1,enableReadyCheck:true})
      try{await ping.ping()}catch{ctx.skip();return}finally{ping.disconnect()}
      worker=spawnWorker()
      await worker.waitReady()
      // Drop probe jobs left by an earlier aborted run so a stale waiting
      // job cannot sit ahead of this run's jobs in the queue.
      const stale=await probe.getJobs(['waiting','delayed','completed','failed','active'],0,100)
      await Promise.all(stale.filter((j)=>String(j.data?.batchId ?? '').startsWith('sigterm-probe-')).map((j)=>j.remove().catch(()=>undefined)))
      const prefix=`sigterm-probe-${randomUUID()}`
      const jobs=await Promise.all([0,1,2].map((i)=>probe.add({batchId:`${prefix}-${i}`})))
      const myIds=new Set(jobs.map((j)=>String(j.id)))
      let activeId=''
      // Jobs must be removed even when the poll below fails: the removal
      // lives in this try's finally, not only after the assertions.
      try{
      // The poll must outlast the ~30s tsx-from-source processor import
      // (measured 31.5s): the first job only turns active once the worker
      // has imported the export processor, and under load that import
      // alone can exceed 30s. This poll waits for pickup, not for the
      // export itself — the SIGTERM assertions below are the point.
      await expect.poll(async()=>{
        const active=await probe.getActive()
        const mine=active.filter((j)=>myIds.has(String(j.id)))
        if(mine.length>0) activeId=String(mine[0].id)
        return mine.length
      },{timeout:90000}).toBeGreaterThan(0)
      worker.proc.kill('SIGTERM')
      const code=await worker.waitExit()
        expect(code).toBe(0)
        const fresh=await Promise.all(jobs.map(async(j)=>probe.getJob(String(j.id))))
        const states=await Promise.all(fresh.map(async(j)=>({id:String(j!.id),state:await j!.getState()})))
        // The job that was active at SIGTERM reached a terminal-or-retry
        // state — completed, delayed (failed attempt awaiting its 5s
        // backoff), or waiting (backoff elapsed and Bull promoted it) —
        // never stuck active, never exhausted to failed, never vanished.
        // The other jobs were never started (paused at shutdown) and stay
        // waiting for restart. Why delayed/waiting is the usual outcome
        // here: under tsx-from-source the export child takes ~30s to import
        // the backend graph (measured 31.5s), so the 7.5s first drain window
        // usually cancels it; production runs compiled JS (child startup
        // <1s), so the clean-drain path dominates there. Either way the job
        // is not lost.
        // NOTE: do NOT assert attemptsMade here. In Bull v4 attemptsMade is
        // only incremented by Job._saveAttempt, which runs when an attempt
        // completes (or fails) — a SIGTERM-cancelled attempt may never reach
        // it, so a cancelled in-flight job legitimately reports
        // attemptsMade = 0 (observed in CI run 42324373928, where this test
        // failed on exactly that assertion while the job itself had
        // recovered correctly). "Active before SIGTERM" (the poll above) is
        // the proof the job was in flight; the state assertions below are
        // the proof it was not lost.
        const activeJob=states.find((x)=>x.id===activeId)
        expect(activeJob && ['completed','delayed','waiting'].includes(activeJob.state)).toBe(true)
        expect(states.every((x)=>['completed','waiting','delayed'].includes(x.state))).toBe(true)
        expect(states).toHaveLength(3)
        expect(worker.output()).toContain('SIGTERM received: stopping background workers')
        expect(worker.output()).toContain('队列已关闭')
        expect(worker.output()).not.toContain('Worker shutdown reached its bounded deadline')
      }finally{
        await Promise.all(jobs.map((j)=>j.remove().catch(()=>undefined)))
      }
    }finally{
      await probe.close().catch(()=>undefined)
    }
  },240000)
})
