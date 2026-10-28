/** Targeted copy review only. Saving/report start in explicitly injected UI states; no full3+25 repeat. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const root='/workspace/eduK12-new-version',front=path.join(root,'server-version/frontend'),out=__dirname,scratch='/workspace/scratch/cognitive-plan-enumeration/copy-review'
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const esbuild=require(path.join(front,'node_modules/esbuild'))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
fs.mkdirSync(scratch,{recursive:true})
const sourceFile=path.join(front,'src/modules/cognitive/tasks/enumeration/EnumerationTask.tsx'),source=fs.readFileSync(sourceFile,'utf8')
const initial=" >('intro')".trim(),instrumented=source.replace(">('intro')", ">((globalThis as any).__enumerationCopyView ?? 'intro')")
if(instrumented===source)throw Error('Synthetic UI-state injection marker missing')
const harness=String.raw`
import React from 'react'
import {createRoot} from 'react-dom/client'
import {EnumerationTask} from './src/modules/cognitive/tasks/enumeration/EnumerationTask'
import {enumerationFixtureContext} from './src/modules/cognitive/tasks/enumeration/fixtures.test-support'
import {enumerationDigest} from './src/modules/cognitive/tasks/enumeration/display'
const w=window as any,p=new URLSearchParams(location.search),mode=p.get('mode')||'intro',lang=p.get('lang')==='en'?'en':'zh'
w.__enumerationCopyView=['report','saving'].includes(mode)?mode:'intro'
const c=enumerationFixtureContext(innerWidth,innerHeight);c.language=lang;c.attemptId='copy-state-'+mode+'-'+lang;c.contextId=c.attemptId
c.calibration!.devicePixelRatio=devicePixelRatio;c.calibration!.visualViewportScale=visualViewport?.scale??1
if(mode==='missingCalibration')c.calibration=null
if(mode==='missingRecipe')c.recipe=null
if(mode==='displayChanged')c.calibration!.viewportWidthCssPx+=1
if(mode==='doesNotFit')c.calibration!.referenceCssPx=1000
const prefix='enumeration-targeted-copy:'+c.attemptId+':',read=(key:string)=>JSON.parse(localStorage.getItem(prefix+key)||'null'),write=(key:string,v:any)=>localStorage.setItem(prefix+key,JSON.stringify(v))
w.copyFixture={calls:[],mode,syntheticInitialView:['report','saving'].includes(mode)}
const ack=(v:any)=>({contextId:v.record.contextId,exposureId:v.record.exposureId,recordHash:v.recordHash,accepted:true as const})
const port={id:'copy-state-explicit-localStorage-fixture',durability:{kind:'host_verified_browser_durable' as const,verificationId:'targeted-copy-fixture'},
 async openAttempt(v:any){const old=read('realm');if(old&&(old.ended||enumerationDigest(old.pageOrigin)!==enumerationDigest(v.pageOrigin)))return {...v,state:'ended' as const};write('realm',{pageOrigin:v.pageOrigin,ended:false});return {...v,state:'bound' as const}},
 endAttempt(v:any){write('realm',{...read('realm'),ended:true,reason:v.reason});w.copyFixture.calls.push('end')},
 async retainArtifact(a:any){write('artifact',a);return {contextId:a.context.contextId,artifactHash:a.artifactHash,retained:true as const}},
 async reserve(v:any){w.copyFixture.calls.push('reserve');if(mode==='prepareError')return {...v,state:'unresolved_exposure' as const};const key='marker:'+v.phase+':'+v.trialIndex+':'+v.exposureOrdinal;if(read(key))return {...v,state:'unresolved_exposure' as const};write(key,v);return {...v,state:'new' as const}},
 async retain(v:any){write('record:'+v.record.exposureId,v);w.copyFixture.calls.push('retain');if(mode==='saveError')throw Error('Synthetic targeted ACK failure');return ack(v)},
 async onPracticeComplete(v:any){return ack(v)},async onTrialComplete(core:any,v:any){return ack(v)},
 async complete(v:any){return {...v,confirmed:true as const}},
}
createRoot(document.getElementById('root')!).render(<EnumerationTask context={c} persistence={port} result={{quality:{state:'interpretable',flags:{},reasons:['internal_reason_code']},metrics:{overallAccuracy:0.873456}}}/>)
`
const evidence={scope:'Targeted participant-copy/state rendering; saving/report use synthetic initial-view injection in cloud-only bundle. No full3+25 or backend replay. Two single synthetic practices only exercise changed save/interruption wording.',sourceBase:'94152032885d5cbaf149a15ec03d5a0c72ea2c67',taskSourceSha256:sha(sourceFile),instrumentedBundleSourceSha256:crypto.createHash('sha256').update(instrumented).digest('hex'),checks:[],screenshots:[],errors:[]}
const check=(name,pass,detail)=>{evidence.checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail))}
const forbidden=/主机|宿主|配方|端口|回执|\bhost\b|\bfixture\b|\bcore\b|\bCOS\b|\brender\b|onTrialComplete|Research metrics/i
async function main(){
 await esbuild.build({stdin:{contents:harness,resolveDir:front,sourcefile:'targeted-copy-state-harness.tsx',loader:'tsx'},plugins:[{name:'synthetic-initial-view-only',setup(build){build.onLoad({filter:/EnumerationTask\.tsx$/},()=>({contents:instrumented,loader:'tsx'}))}}],bundle:true,minify:true,platform:'browser',format:'iife',outfile:path.join(scratch,'preview.js'),define:{'process.env.NODE_ENV':'"production"'}})
 fs.writeFileSync(path.join(scratch,'index.html'),'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><style>body{margin:0;background:#F8FAFC}</style><div id="root"></div><script src="/preview.js"></script>')
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','preview.js','preview.css'].includes(name)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(scratch,name)))})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,args:['--disable-dev-shm-usage']});evidence.browser=b.version();evidence.chromiumSandbox=true
 try{const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:1});await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await ctx.newPage();page.on('pageerror',e=>evidence.errors.push(e.message))
 const shot=async name=>{const file=name+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});evidence.screenshots.push({file,sha256:sha(path.join(out,file))})}
 const visible=async(name)=>{const text=await page.locator('.enumeration-candidate').innerText();check(name+' has no implementation terms',!forbidden.test(text),text);check(name+' retains internal/synthetic marker',/内部审阅|Internal review/.test(text)&&/合成|Synthetic/.test(text));const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));check(name+' no horizontal overflow',size.scroll<=size.width+1,size)}
 for(const lang of ['zh','en']){
  await page.setViewportSize(lang==='zh'?{width:390,height:844}:{width:820,height:1180})
  for(const mode of ['intro','missingCalibration','missingRecipe','displayChanged','doesNotFit','prepareError','saving','saveError','interrupted','report']){
   await page.goto(base+'/?lang='+lang+'&mode='+mode);await page.locator('.enumeration-candidate').waitFor()
   if(['missingCalibration','missingRecipe','displayChanged','doesNotFit','prepareError','saveError','interrupted'].includes(mode)){
    await page.getByRole('button',{name:lang==='zh'?'查看准备状态':'Review readiness'}).click()
    if(['prepareError','saveError','interrupted'].includes(mode)){
     await page.getByRole('button',{name:lang==='zh'?'开始练习':'Start practice',exact:true}).click()
     if(mode==='prepareError')await page.getByRole('alert').waitFor()
     else if(mode==='saveError'){await page.waitForFunction(()=>document.querySelector('[data-stage="response"]'));await page.getByRole('button',{name:lang==='zh'?'确认':'Confirm',exact:true}).tap();await page.getByRole('button',{name:lang==='zh'?'重试提交':'Retry submission'}).waitFor()}
     else {await page.waitForFunction(()=>document.querySelector('[data-stage="fixation"]'));await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.getByRole('heading',{name:lang==='zh'?'练习记录':'Practice record'}).waitFor()}
    }else{await page.getByRole('alert').waitFor();check(lang+' '+mode+' start remains disabled',await page.getByRole('button',{name:lang==='zh'?'开始练习':'Start practice'}).isDisabled())}
   }
   await visible(lang+' '+mode)
   if(mode==='report'){check(lang+' report remains invalid',await page.locator('[data-report-state="invalid"]').count()===1);check(lang+' report hides forged metrics',!(await page.locator('.enumeration-candidate').innerText()).includes('0.873456'))}
   if(lang==='zh'||['missingRecipe','saveError','report'].includes(mode))await shot(lang+'-'+mode)
   if(['intro','report'].includes(mode)){await page.evaluate(()=>document.documentElement.style.zoom='2');await visible(lang+' '+mode+' 200%');await shot(lang+'-'+mode+'-200pct')}
  }
 }
 check('no browser page errors',evidence.errors.length===0,evidence.errors);evidence.success=true
 }finally{await b.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'copy-state-evidence.json'),JSON.stringify(evidence,null,2)+'\n')}
}
main().catch(e=>{evidence.success=false;evidence.failure=e.stack;fs.writeFileSync(path.join(out,'copy-state-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.error(e);process.exitCode=1})
