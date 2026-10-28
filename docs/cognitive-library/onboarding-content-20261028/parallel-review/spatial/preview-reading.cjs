const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../../../..'),front=path.join(root,'server-version/frontend'),temp=fs.mkdtempSync(path.join(root,'.spatial-reading-')),out=path.join(__dirname,process.env.PREVIEW_ONLY?'screens-final':'screens')
fs.mkdirSync(out,{recursive:true})
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {SpatialInstructions} from '../server-version/frontend/src/modules/cognitive/tasks/precision-working-memory/SpatialInstructions';
import {SpatialReport} from '../server-version/frontend/src/modules/cognitive/tasks/precision-working-memory/SpatialReport';
import '../server-version/frontend/src/modules/cognitive/tasks/precision-working-memory/spatial.css';
import records from '../docs/cognitive-library/onboarding-content-20261028/parallel-review/spatial/representative-records.json';
const q=new URLSearchParams(location.search),language=q.get('lang')==='en'?'en':'zh';
createRoot(document.getElementById('root')!).render(<><p style={{font:'14px sans-serif'}}>SYNTHETIC PREVIEW / 合成预览 · 未发布</p>{q.has('intro')?<main className="spatial-task spatial-reading"><SpatialInstructions language={language} profile="experience"/></main>:<SpatialReport language={language} report={records.report as any}/>}</>);`
fs.writeFileSync(path.join(temp,'entry.tsx'),entry)
require(path.join(front,'node_modules/esbuild')).buildSync({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,outdir:temp,format:'iife',jsx:'automatic',nodePaths:[path.join(front,'node_modules')],logLevel:'silent'})
fs.writeFileSync(path.join(temp,'index.html'),'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="entry.css"><div id="root"></div><script src="entry.js"></script>')
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async()=>{let server,browser;const results=[],errors=[];try{
  server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','entry.js','entry.css'].includes(name)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(temp,name)))}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']})
  for(const c of [{name:'intro-zh-phone',intro:true,lang:'zh',width:390,height:844,zoom:1},{name:'intro-en-tablet',intro:true,lang:'en',width:820,height:1000,zoom:1},{name:'report-zh-phone',intro:false,lang:'zh',width:390,height:844,zoom:1},{name:'report-en-200pct',intro:false,lang:'en',width:780,height:1000,zoom:2}]){
    if(process.env.PREVIEW_ONLY&&!c.name.includes(process.env.PREVIEW_ONLY))continue
    const context=await browser.newContext({viewport:{width:c.width,height:c.height}})
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
    const page=await context.newPage();page.on('pageerror',e=>errors.push({name:c.name,message:e.message}))
    await page.goto('http://127.0.0.1:'+server.address().port+'/?lang='+c.lang+(c.intro?'&intro':''));await page.locator('h1').waitFor()
    await page.evaluate(zoom=>{document.documentElement.style.zoom=String(zoom);document.querySelectorAll('details').forEach(d=>d.open=true)},c.zoom)
    await page.evaluate(()=>document.fonts.ready)
    const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,containsUnitExplanation:document.body.textContent.includes('观看距离校准的视角')||document.body.textContent.includes('visual angle calibrated from your viewing distance'),chartCount:document.querySelectorAll('figure').length}))
    const file=path.join(out,c.name+'.png');await page.screenshot({path:file,fullPage:true})
    results.push({...c,layout,file:path.relative(root,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),success:layout.scrollWidth<=c.width+1&&layout.containsUnitExplanation});await context.close()
  }
  const report={syntheticComponentPreviews:true,sandbox:true,cssZoomNotNativeDeviceEquivalence:true,results,errors,success:results.every(r=>r.success)&&errors.length===0}
  fs.writeFileSync(path.join(__dirname,'browser-reading.json'),JSON.stringify(report,null,2)+'\n');if(!report.success)throw Error('Affected reading preview failed')
}finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());fs.rmSync(temp,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1})
