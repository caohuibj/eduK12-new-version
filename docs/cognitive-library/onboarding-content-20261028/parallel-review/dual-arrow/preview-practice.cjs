const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../../..'),front=path.join(root,'server-version/frontend'),temp=fs.mkdtempSync('/tmp/dual-practice-preview-'),screens=path.join(__dirname,'screens');fs.mkdirSync(screens,{recursive:true});
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'representative-inputs.json'))).inputs.inactiveSingle;
fs.writeFileSync(path.join(temp,'fixture.json'),JSON.stringify(raw));
const task=path.join(front,'src/modules/cognitive/tasks/dual-arrow');
fs.writeFileSync(path.join(temp,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {DualArrowTask} from '${task}/DualArrowTask';import {dualPlan} from '${task}/generated/protocol';import {digest} from '${task}/contracts';import raw from './fixture.json';
const snapshot=raw.session,randomSeed=raw.randomSeed,context={contextKey:'synthetic-dual-browser-review',snapshot,randomSeed,manifestHash:digest(dualPlan(snapshot.config,randomSeed))},records=[];
const ports={prepareLocalAttempt:async(c,manifest,realm)=>({fresh:true,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})}),persistLocalDraft:async record=>{records.push(structuredClone(record));window.reviewRecords=records;return {retained:true,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}},finalize:async()=>{throw Error('Preview does not submit a formal attempt')}};
createRoot(document.getElementById('root')).render(<><p style={{padding:'8px',font:'14px sans-serif'}}>SYNTHETIC PREVIEW / 合成预览 · 未发布</p><DualArrowTask context={context} ports={ports} language={new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'}/></>);`);
require(path.join(front,'node_modules/esbuild')).buildSync({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,outdir:temp,format:'iife',jsx:'automatic',nodePaths:[path.join(front,'node_modules')],logLevel:'silent'});
fs.writeFileSync(path.join(temp,'index.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="entry.css"><div id="root"></div><script src="entry.js"></script>');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{let browser,server;const results=[],errors=[];try{
 server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['entry.js','entry.css','index.html'].includes(name)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(temp,name)))}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']});
 for(const language of ['zh','en']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/?lang='+language);
  await page.getByRole('button',{name:language==='en'?'Prepare practice':'准备练习',exact:true}).click();await page.getByRole('button',{name:language==='en'?'Start':'开始',exact:true}).click();
  await page.locator('[data-dual-view="running"]').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.getByRole('heading',{name:language==='en'?'This practice trial was not completed':'这轮练习尚未完成',exact:true}).waitFor();
  const capture=async name=>{const file=path.join(screens,name+'.png'),layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('h1,h2')].map(h=>h.textContent),saved:window.reviewRecords?.map(r=>({key:r.recordKey,status:r.raw.status,reason:r.raw.stopReason}))}));await page.screenshot({path:file,fullPage:true});results.push({name,language,layout,file:path.relative(root,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});if(layout.scroll>layout.viewport+1)throw Error('Preview overflow: '+name)};
  await capture('interrupted-'+language+'-phone');
  await page.getByRole('button',{name:language==='en'?'Read instructions and examples again':'重新查看说明与例子',exact:true}).click();await page.getByRole('region',{name:language==='en'?'Instructions and examples':'操作说明与例子'}).waitFor();await capture('reread-'+language+'-phone');
  await page.getByRole('button',{name:language==='en'?'Start next practice round':'开始下一组练习',exact:true}).click();await page.locator('[data-dual-view="running"]').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.getByRole('heading',{name:language==='en'?'This practice trial was not completed':'这轮练习尚未完成',exact:true}).waitFor();
  const keys=await page.evaluate(()=>window.reviewRecords.map(r=>r.recordKey));if(JSON.stringify(keys)!==JSON.stringify(['practice:0:0','practice:1:0']))throw Error('Practice group identity drift');results.push({language,newGroupRecordKeys:keys});await context.close();
 }
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(path.join(__dirname,'browser-practice.json'),JSON.stringify({success:true,componentPreviewOnly:true,synthetic:true,node:process.version,results,errors},null,2));
}catch(error){fs.writeFileSync(path.join(__dirname,'browser-practice-failure.json'),JSON.stringify({success:false,error:String(error),results,errors},null,2));throw error}finally{await browser?.close();server?.close();fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
