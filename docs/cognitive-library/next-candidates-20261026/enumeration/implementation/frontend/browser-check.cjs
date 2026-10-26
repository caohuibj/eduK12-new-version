/** Cloud-only scoped candidate bundle and headless Chromium review. Not a product route or production host port. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const root='/workspace/eduK12-new-version',front=path.join(root,'server-version/frontend')
const out=__dirname,scratch='/workspace/scratch/cognitive-plan-enumeration/frontend'
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const esbuild=require(path.join(front,'node_modules/esbuild'))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
fs.mkdirSync(scratch,{recursive:true})
const harness=String.raw`
import React from 'react'
import {createRoot} from 'react-dom/client'
import {EnumerationTask} from './src/modules/cognitive/tasks/enumeration/EnumerationTask'
import {enumerationFixtureContext} from './src/modules/cognitive/tasks/enumeration/fixtures.test-support'
import {enumerationDigest} from './src/modules/cognitive/tasks/enumeration/display'
const w=window as any,params=new URLSearchParams(location.search),prefix='enumeration-cloud-internal-fixture:'
const context=enumerationFixtureContext(innerWidth,innerHeight)
context.attemptId=params.get('attempt')||'explicit-synthetic-attempt'
context.contextId=context.attemptId+':context'
context.language=params.get('lang')==='en'?'en':'zh'
context.calibration!.devicePixelRatio=devicePixelRatio
context.calibration!.visualViewportScale=visualViewport?.scale??1
const read=(key:string)=>JSON.parse(localStorage.getItem(prefix+key)||'null')
const write=(key:string,value:unknown)=>localStorage.setItem(prefix+key,JSON.stringify(value))
const probe=prefix+'probe';localStorage.setItem(probe,'cloud-fixture-durable-probe')
if(localStorage.getItem(probe)!=='cloud-fixture-durable-probe')throw Error('Fixture localStorage durability probe failed')
localStorage.removeItem(probe)
w.fixture={context,calls:[],stages:[],records:[],artifacts:[],failNextRetain:false,delayFinal:true,releaseFinal:null}
const receipt=(value:any)=>({contextId:value.record.contextId,exposureId:value.record.exposureId,recordHash:value.recordHash,accepted:true as const})
const markerKey=(value:any)=>'marker:'+context.attemptId+':'+value.phase+':'+value.trialIndex+':'+value.exposureOrdinal
const port={id:'explicit-cloud-localStorage-port',durability:{kind:'host_verified_browser_durable' as const,verificationId:'cloud-fixture-write-read-probe-v1'},
 async openAttempt(value:any){const key='realm:'+value.attemptId,old=read(key);w.fixture.calls.push(['open',value])
  if(old&&(old.ended||enumerationDigest(old.pageOrigin)!==enumerationDigest(value.pageOrigin)))return {...value,state:'ended' as const}
  if(!old)write(key,{pageOrigin:value.pageOrigin,ended:false});return {...value,state:'bound' as const}},
 endAttempt(value:any){const key='realm:'+value.attemptId,old=read(key);write(key,{...old,ended:true,reason:value.reason});w.fixture.calls.push(['end',value])},
 async retainArtifact(artifact:any){write('artifact:'+artifact.artifactHash,artifact);w.fixture.artifacts.push(artifact)
  return {contextId:artifact.context.contextId,artifactHash:artifact.artifactHash,retained:true as const}},
 async reserve(value:any){const key=markerKey(value),old=read(key);w.fixture.calls.push(['reserve',value])
  if(old||read('realm:'+value.attemptId)?.ended)return {...value,state:'unresolved_exposure' as const}
  write(key,{...value,state:'reserved'});return {...value,state:'new' as const}},
 async retain(value:any){write('record:'+value.record.exposureId,value);w.fixture.calls.push(['retain',value.recordHash])
  if(w.fixture.failNextRetain){w.fixture.failNextRetain=false;throw Error('Synthetic first retention ACK failure after durable staging')}
  return receipt(value)},
 async onPracticeComplete(value:any){write(markerKey({phase:value.record.core.phase,trialIndex:value.record.core.plan.trialIndex,exposureOrdinal:value.record.exposureOrdinal}),{exposureId:value.record.exposureId,state:'confirmed'});w.fixture.records.push(value);return receipt(value)},
 async onTrialComplete(core:any,value:any){if(enumerationDigest(core)!==enumerationDigest(value.record.core))throw Error('Core/raw mismatch');write(markerKey({phase:core.phase,trialIndex:core.plan.trialIndex,exposureOrdinal:value.record.exposureOrdinal}),{exposureId:value.record.exposureId,state:'confirmed'});w.fixture.records.push(value);return receipt(value)},
 async complete(value:any){write('final:'+value.attemptId,value);w.fixture.finalRequest=value
  if(w.fixture.delayFinal)await new Promise<void>(resolve=>{w.fixture.releaseFinal=resolve})
  return {...value,confirmed:true as const}},
}
createRoot(document.getElementById('root')!).render(<EnumerationTask context={context} persistence={port}/>)
let previous=''
new MutationObserver(()=>{const el=document.querySelector('[data-stage]') as HTMLElement,stage=el?.dataset.stage
 if(!stage||stage===previous)return;previous=stage
 const c=el.querySelector('canvas') as HTMLCanvasElement
 if(c&&['fixation','stimulus','mask','response'].includes(stage)){const r=c.getBoundingClientRect()
  w.fixture.stages.push({stage,progress:el.querySelector('.enum-progress')?.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height},png:c.toDataURL('image/png'),atPerfMs:performance.now()})}
}).observe(document.getElementById('root')!,{subtree:true,attributes:true,attributeFilter:['data-stage']})
`
fs.writeFileSync(path.join(scratch,'harness.tsx'),harness)
const evidence={scope:'actual React candidate, synthetic explicit localStorage host and calibration/recipe; real headless rAF APIs, no physical display timing proof',startedAt:new Date().toISOString(),checks:[],screenshots:[],sources:{},errors:[],networkBlocked:[]}
const assert=(name,condition,detail)=>{evidence.checks.push({name,pass:!!condition,detail});if(!condition)throw Error(name+': '+JSON.stringify(detail))}
const sourceDir=path.join(front,'src/modules/cognitive/tasks/enumeration')
function inputs(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())inputs(p);else evidence.sources[path.relative(root,p)]=sha(p)}}
inputs(sourceDir);evidence.sources[path.relative(root,__filename)]=sha(__filename)
async function main(){
 await esbuild.build({stdin:{contents:harness,resolveDir:front,sourcefile:'explicit-cloud-only-harness.tsx',loader:'tsx'},bundle:true,minify:true,platform:'browser',format:'iife',outfile:path.join(scratch,'preview.js'),define:{'process.env.NODE_ENV':'"production"'}})
 fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><style>html,body{margin:0;background:#F8FAFC}</style></head><body><div id="root"></div><script src="/preview.js"></script></body></html>')
 const server=http.createServer((req,res)=>{const request=new URL(req.url,'http://localhost').pathname,name=request==='/'?'index.html':request.slice(1);if(!['index.html','preview.js','preview.css'].includes(name)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(scratch,name)))})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,args:['--disable-dev-shm-usage']})
 evidence.browser=browser.version();evidence.chromiumSandbox=true;evidence.buildArtifacts={js:sha(path.join(scratch,'preview.js')),css:sha(path.join(scratch,'preview.css')),harness:sha(path.join(scratch,'harness.tsx'))}
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true})
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();evidence.networkBlocked.push(url.origin);return route.abort()})
 const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message))
 const shot=async(name)=>{const p=path.join(out,name+'.png');await page.screenshot({path:p,fullPage:true});evidence.screenshots.push({file:path.basename(p),sha256:sha(p)})}
 const fits=async(name)=>{const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(name,size.scroll<=size.width+1,size)}
 const ready=async()=>{await page.getByRole('button',{name:'查看准备状态'}).click();await page.getByRole('button',{name:'开始练习'}).waitFor()}
 const response=async()=>{await page.waitForFunction(()=>document.querySelector('[data-stage="response"]'),{timeout:10000})}
 const confirm=async()=>{await page.getByRole('button',{name:'确认',exact:true}).tap()}
 try {
  await page.goto(base+'/?attempt=phone-guide');await page.getByRole('heading',{name:'刚才有几个点？'}).waitFor();await fits('phone guide no horizontal overflow');await shot('phone-intro')
  await page.evaluate(()=>document.documentElement.style.zoom='2');await fits('phone guide 200% no horizontal overflow');await shot('phone-intro-200pct')
  await page.setViewportSize({width:820,height:1180});await page.goto(base+'/?attempt=tablet-guide');await page.getByRole('heading',{name:'刚才有几个点？'}).waitFor();await fits('tablet guide no horizontal overflow');await shot('tablet-intro')
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/?attempt=phone-actual-sequence');await ready();await shot('phone-ready')
  await page.getByRole('button',{name:'开始练习'}).click();await page.waitForFunction(()=>document.querySelector('[data-stage="fixation"]'));await shot('phone-fixation')
  await page.waitForFunction(()=>document.querySelector('[data-stage="stimulus"]'));await shot('phone-practice-stimulus')
  await page.waitForFunction(()=>document.querySelector('[data-stage="mask"]'));await shot('phone-mask')
  await response();const slider=page.getByRole('slider');await slider.press('Home');assert('slider Home=1',(await slider.inputValue())==='1')
  await slider.press('End');assert('slider End=15',(await slider.inputValue())==='15');await slider.press('ArrowLeft');assert('slider ArrowLeft=14',(await slider.inputValue())==='14')
  await fits('phone answer no horizontal overflow');await shot('phone-response')
  await page.evaluate(()=>{window.fixture.failNextRetain=true});await confirm();await page.getByRole('button',{name:'重试保存'}).waitFor();await shot('phone-save-unconfirmed')
  const beforeRetry=await page.evaluate(()=>window.fixture.calls.filter(c=>c[0]==='reserve').length)
  await page.getByRole('button',{name:'重试保存'}).click();await page.getByRole('heading',{name:'练习记录'}).waitFor()
  assert('retry did not reserve/expose again',await page.evaluate(()=>window.fixture.calls.filter(c=>c[0]==='reserve').length)===beforeRetry)
  for(let i=1;i<3;i++){await page.getByRole('button',{name:'下一次练习'}).click();await page.getByRole('button',{name:'开始练习'}).click();await response();await confirm();await page.getByRole('heading',{name:'练习记录'}).waitFor()}
  await page.getByRole('button',{name:'准备候选正式序列'}).click();console.log('actual rAF practices completed; running 25 explicitly started candidate formal records')
  for(let i=0;i<25;i++){
   await page.getByRole('button',{name:'开始候选正式轮'}).click();await response();await confirm()
   if(i<24)await page.getByRole('button',{name:'开始候选正式轮'}).waitFor()
  }
  await page.getByRole('status').waitFor();await shot('phone-final-awaiting-ack')
  assert('report absent before final host ACK',await page.getByRole('heading',{name:'这次的候选记录'}).count()===0)
  await page.evaluate(()=>window.fixture.releaseFinal());await page.getByRole('heading',{name:'本次不提供表现结论'}).waitFor();await fits('phone report no horizontal overflow');await shot('phone-report-invalid')
  const data=await page.evaluate(()=>{const {context,calls,records,artifacts,stages,finalRequest}=window.fixture;return {context,calls,records,artifacts,stages,finalRequest}})
  fs.writeFileSync(path.join(out,'browser-captured-raw.json'),JSON.stringify(data,null,2)+'\n')
  assert('actual three practice and 25 formal ACK records',data.records.filter(r=>r.record.core.phase==='practice').length===3&&data.records.filter(r=>r.record.core.phase==='test').length===25)
  assert('single fixed artifact',data.artifacts.length===1&&data.artifacts[0].maskBits.length===2304)
  const first=data.stages.slice(0,4),rects=first.map(x=>JSON.stringify(x.rect))
  assert('phone actual fixation/stimulus/mask/answer field rect equal',rects.length===4&&new Set(rects).size===1,first.map(({stage,rect})=>({stage,rect})))
  const formalStim=data.stages.find(x=>x.stage==='stimulus'&&x.progress.includes('候选正式'))
  if(formalStim){const p=path.join(out,'phone-formal-stimulus-canvas.png');fs.writeFileSync(p,Buffer.from(formalStim.png.split(',')[1],'base64'));evidence.screenshots.push({file:path.basename(p),sha256:sha(p),scope:'actual canvas snapshot taken by stage MutationObserver; no full-page timing claim'})}
  assert('input actual touch confirmation retained',data.records.some(r=>r.record.core.responseInput==='touch'))
  assert('report remains invalid',await page.locator('[data-report-state="invalid"]').count()===1)
  await page.evaluate(()=>document.documentElement.style.zoom='2');await fits('phone report 200% no horizontal overflow');await shot('phone-report-200pct')
  await page.evaluate(()=>document.documentElement.style.zoom='1');await page.setViewportSize({width:820,height:1180});await fits('tablet report read-only no horizontal overflow');await shot('tablet-report-invalid')
  await page.reload();await ready();await page.getByRole('button',{name:'开始练习'}).click();await page.getByRole('alert').waitFor()
  assert('new page realm refuses the same stable attempt',await page.getByRole('button',{name:'确认',exact:true}).count()===0&&await page.locator('[data-enumeration-view="error"]').count()===1)
  await page.goto(base+'/?attempt=tablet-actual');await ready();await page.getByRole('button',{name:'开始练习'}).click();await response();await fits('tablet actual answer no horizontal overflow');await shot('tablet-response')
  const tabletStages=await page.evaluate(()=>window.fixture.stages.slice(0,4).map(({stage,rect})=>({stage,rect})))
  assert('tablet actual stage rectangles equal',tabletStages.length===4&&new Set(tabletStages.map(x=>JSON.stringify(x.rect))).size===1,tabletStages)
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.getByRole('heading',{name:'练习记录'}).waitFor()
  assert('pagehide interruption gives no pass and prohibits more exposures',await page.getByRole('button',{name:'重新做这轮练习'}).isDisabled()&&(await page.getByText('这轮练习中断了，不判断对错，也不算作已完成练习。').count())===1)
  await shot('tablet-interrupted-practice')
  await page.goto(base+'/?attempt=english-guide&lang=en');await page.getByRole('heading',{name:'How many dots did you see?'}).waitFor();await page.evaluate(()=>document.documentElement.style.zoom='2');await fits('English guide 200% no horizontal overflow');await shot('tablet-en-intro-200pct')
  assert('no page errors',evidence.errors.length===0,evidence.errors);assert('no external requests',evidence.networkBlocked.length===0,evidence.networkBlocked)
  evidence.success=true
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));evidence.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-evidence-run1.json'),JSON.stringify(evidence,null,2)+'\n')}
}
main().catch(error=>{evidence.success=false;evidence.failure=error.stack;fs.writeFileSync(path.join(out,'browser-evidence-run1.json'),JSON.stringify(evidence,null,2)+'\n');console.error(error);process.exitCode=1})
