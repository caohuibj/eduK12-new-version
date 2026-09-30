#!/usr/bin/env node
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
const exec = promisify(execFile)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const at = (value, path) => path.split('.').reduce((v, key) => v?.[key], value)
const quantiles = values => {
  const sorted = [...values].sort((a,b) => a-b)
  return Object.fromEntries([50,95,99].map(p => [`p${p}`, sorted.length ? sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*p/100)-1)] : null]))
}
const matches = (response, expectation) => response.status === expectation.status && (!expectation.path || at(response.body, expectation.path) === expectation.equals) && (!expectation.minBytes || response.bytes >= expectation.minBytes)
const positive = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max
export function validateFixture(fixture) {
  const origin = new URL(fixture.baseUrl)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid base URL')
  if (!Array.isArray(fixture.operations) || !fixture.operations.length || fixture.operations.length > 10000) throw new Error('Provide 1..10000 independent logical operations')
  const ids = new Set()
  for (const op of fixture.operations) {
    if (typeof op.id !== 'string' || ids.has(op.id)) throw new Error('Logical operation IDs must be distinct')
    ids.add(op.id)
    if (!/^[a-z0-9-]{1,60}$/.test(op.category)) throw new Error('Category must be a non-sensitive fixed label')
    if (!Array.isArray(op.steps) || !op.steps.length || op.steps.length > 20) throw new Error('Provide 1..20 steps')
    for (const step of op.steps) {
      for (const request of [step, ...(step.confirm ? [step.confirm] : [])]) {
        const url = new URL(request.path, origin)
        if (url.origin !== origin.origin || url.username || url.password) throw new Error('Requests must stay on the fixture origin')
        if (!request.expect || !positive(request.expect.status, 599) || request.expect.status < 100) throw new Error('Every request needs an explicit status expectation')
        if (request.expect.status >= 200 && request.expect.status < 300 && !request.expect.path && !positive(request.expect.minBytes, 104857600)) throw new Error('Success requires an application-level assertion, not HTTP acknowledgement alone')
      }
      if (step.retrySafe !== true && (step.discardFirstResponse || step.confirm)) throw new Error('Recovery scenarios require a replay-safe frozen request')
    }
  }
  return fixture
}
async function boundedJson(response, binary=false) {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks = []; let size = 0
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break
      size += value.byteLength
      if (size > (binary ? 104857600 : 1048576)) throw new Error('response-limit')
      if (!binary) chunks.push(value)
    }
    return binary ? {bytes:size} : {body:JSON.parse(Buffer.concat(chunks).toString('utf8')),bytes:size}
  } finally { await reader.cancel().catch(() => {}) }
}
async function resourceSample(options) {
  const result = {elapsedMs: Math.round(performance.now()-options.started), docker: null, metrics: null}
  if (options.containers.length) {
    try {
      const {stdout} = await exec('docker', ['stats','--no-stream','--format','{{json .}}', ...options.containers], {timeout: 5000, maxBuffer: 1048576})
      result.docker = stdout.trim().split('\n').filter(Boolean).map(line => {
        const row=JSON.parse(line)
        return {name:row.Name, cpu:row.CPUPerc, memory:row.MemUsage, memoryPercent:row.MemPerc, pids:row.PIDs}
      })
    } catch { result.docker = {available:false} }
  }
  if (options.metricsUrl) {
    try {
      const response = await fetch(options.metricsUrl, {signal:AbortSignal.timeout(3000)})
      if (!response.ok) throw new Error('unavailable')
      const content = await response.text()
      // Retain only fixed resource labels, never arbitrary routes, models or URLs.
      result.metrics = content.split('\n').flatMap(line => {
        const match = /^(ptool_[a-zA-Z0-9_]+|process_[a-zA-Z0-9_]+|prisma_[a-zA-Z0-9_]+)(?:\{[^\n]*\})?\s+([\d.eE+-]+)$/.exec(line)
        if(!match || !Number.isFinite(Number(match[2])))return []
        const labels={}
        const safeValues=new Set(['unit_submit','aggregate_finalization','questionnaire_completion','registration','multipart_upload','login_password_verify','login_account_failure','export','image','video','ready','degraded','failed','waiting','active','delayed'])
        for(const label of line.matchAll(/(gate|queue|state)="([^"]+)"/g))if(safeValues.has(label[2]))labels[label[1]]=label[2]
        return [{name:match[1],labels,value:Number(match[2])}]
      })
    } catch { result.metrics = {available:false} }
  }
  return result
}
export async function runMixedLoad(input, supplied = {}) {
  const fixture = validateFixture(input)
  const options = {concurrency:100, timeoutMs:15000, deadlineMs:600000, maxAttempts:60, containers:[], sampleMs:5000, ...supplied}
  for (const [key,max] of [['concurrency',1000],['timeoutMs',120000],['deadlineMs',3600000],['maxAttempts',1000],['sampleMs',60000]]) if (!positive(options[key],max)) throw new Error(`Invalid ${key}`)
  if (options.containers.some(name => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(name))) throw new Error('Invalid container name')
  options.started=performance.now()
  const end = options.started + options.deadlineMs
  const attemptLatency=[]; const logicalLatency=[]; const categories={}; const statusCounts={}; const samples=[]
  let cursor=0, complete=0, unexpected5xx=0, intendedBusy503=0, networkErrors=0, discardedResponses=0, failure=0, fixtureErrors=0, expectedDependency503=0
  let confirmationPollAttempts=0, retryAttempts=0
  let stopped=false
  const sampling = (options.containers.length || options.metricsUrl) ? (async () => {
    while (!stopped) {
      samples.push(await resourceSample(options))
      // Wake promptly after load completion; do not prolong the drain by a whole sample period.
      for(let waited=0;!stopped && waited<options.sampleMs;waited+=100) await delay(Math.min(100,options.sampleMs-waited))
    }
  })() : Promise.resolve()
  async function requestUntil(request, retrySafe, discard=false, poll=false) {
    const url = new URL(request.path, fixture.baseUrl)
    let body
    try {
      body = request.body === undefined ? undefined : JSON.stringify(request.body)
      if (request.bodyFile) {
        const stat=await fs.stat(request.bodyFile); if(stat.size>20971520) throw new Error('upload-fixture-limit')
        if(!Object.keys(request.headers || {}).some(key=>key.toLowerCase()==='content-type'))throw new Error('multipart-content-type-required')
        body=await fs.readFile(request.bodyFile)
      }
    } catch { fixtureErrors++; return false }
    // These exact bytes/headers are reused; this harness never invents new idempotency keys.
    const headers = {...request.headers}; if(body && !request.bodyFile && !Object.keys(headers).some(key=>key.toLowerCase()==='content-type')) headers['Content-Type']='application/json'
    let responseDiscarded=false
    for(let attempt=0;attempt<options.maxAttempts && performance.now()<end;attempt++) {
      if(poll)confirmationPollAttempts++;else if(attempt>0)retryAttempts++
      const started=performance.now(); let response; let waitMs=100
      try {
        const raw = await fetch(url,{method:request.method || 'GET', headers, body, redirect:'error', signal:AbortSignal.timeout(Math.max(1,Math.min(options.timeoutMs,Math.ceil(end-performance.now()))))})
        statusCounts[raw.status]=(statusCounts[raw.status] || 0)+1
        const retryHeader=raw.headers.get('retry-after')
        if(retryHeader) {
          const seconds=Number(retryHeader)
          waitMs=Number.isFinite(seconds) ? Math.max(100,seconds*1000) : Math.max(100,Date.parse(retryHeader)-Date.now())
        }
        response={status:raw.status,...await boundedJson(raw,Boolean(request.expect.minBytes) && raw.status===request.expect.status)}
        const busy=raw.status === 503 && request.busy && at(response.body,request.busy.path) === request.busy.equals && Boolean(retryHeader)
        const dependency=raw.status===503 && request.unavailable && at(response.body,request.unavailable.path)===request.unavailable.equals && Boolean(retryHeader)
        if(raw.status===503 && busy) intendedBusy503++
        else if(dependency)expectedDependency503++
        else if(raw.status>=500) unexpected5xx++
        if(discard && !responseDiscarded && matches(response,request.expect)) { discardedResponses++; responseDiscarded=true; response=null }
        else if(matches(response,request.expect)) return true
        else if(poll && raw.status>=200 && raw.status<300 && request.pending && at(response.body,request.pending.path)===request.pending.equals) { /* status not completed yet */ }
        else if(!retrySafe || (raw.status!==429 && !busy && !dependency)) return false
      } catch { networkErrors++; if(!retrySafe) return false }
      finally { attemptLatency.push(performance.now()-started) }
      if (!retrySafe) return false
      const remaining=end-performance.now(); if(remaining<=0) break
      await delay(Math.min(waitMs*Math.min(5,1+attempt/10),30000,remaining))
    }
    return false
  }
  await Promise.all(Array.from({length:Math.min(options.concurrency,fixture.operations.length)},async()=>{
    while(cursor<fixture.operations.length) {
      const op=fixture.operations[cursor++]; const started=performance.now(); let ok=true
      const category=categories[op.category] ||= {logical:0, completed:0, failed:0}
      category.logical++
      for(const step of op.steps) {
        if(!await requestUntil(step,step.retrySafe===true,step.discardFirstResponse===true)) {ok=false;break}
        if(step.confirm && !await requestUntil(step.confirm,true,false,true)) {ok=false;break}
      }
      if(ok) {complete++;category.completed++} else {failure++;category.failed++}
      logicalLatency.push(performance.now()-started)
    }
  }))
  stopped=true; await sampling
  return {version:1, targetLabel:options.targetLabel || 'unspecified', capacityCertified:false,
    concurrency:options.concurrency, logicalTotal:fixture.operations.length, logicalCompleted:complete, logicalFailed:failure,
    eventualSuccessRate:complete/fixture.operations.length, attempts:attemptLatency.length,
    confirmationPollAttempts,retryAttempts,
    retryAmplification:(attemptLatency.length-confirmationPollAttempts)/fixture.operations.reduce((n,op)=>n+op.steps.length,0),
    statusCounts,intendedBusy503,expectedDependency503,unexpected5xx,networkErrors,discardedResponses,fixtureErrors,
    attemptLatencyMs:quantiles(attemptLatency),logicalLatencyMs:quantiles(logicalLatency),
    elapsedAndDrainMs:performance.now()-options.started,categories,resources:samples,
    unavailableMetrics:['Worker/child Prisma pools unless separately instrumented','per-query SQL timing unless separately sampled']}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2)
    const read=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;const value=args[i+1];if(!value || value.startsWith('--'))throw new Error(`${key} needs a value`);return value}
    if(args.includes('--help')) {console.log('node prelaunch-mixed-load.mjs --fixture private.json --output result.json [--concurrency 100 --deadline-ms 600000 --metrics-url INTERNAL_URL --containers NAME,NAME --target-label isolated-4C4G]');process.exit(0)}
    const fixture=JSON.parse(await fs.readFile(read('--fixture'),'utf8'))
    const report=await runMixedLoad(fixture,{concurrency:Number(read('--concurrency',100)),deadlineMs:Number(read('--deadline-ms',600000)), timeoutMs:Number(read('--timeout-ms',15000)), containers:read('--containers','').split(',').filter(Boolean),metricsUrl:read('--metrics-url'),targetLabel:read('--target-label')})
    await fs.writeFile(read('--output',`/tmp/huisurvey-mixed-${Date.now()}.json`),JSON.stringify(report,null,2),{mode:0o600})
    console.log(JSON.stringify({logicalCompleted:report.logicalCompleted,logicalTotal:report.logicalTotal,eventualSuccessRate:report.eventualSuccessRate,capacityCertified:false}))
    if(report.logicalFailed || report.unexpected5xx)process.exitCode=1
  } catch {console.error('Mixed-load validation failed; check the private fixture and runbook. No credentials or response data were retained.');process.exitCode=1}
}
