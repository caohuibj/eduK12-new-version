/* Presentation-only continuation against a retained synthetic aggregate.
 * Actual HTTP/PG generation/read is covered by group-longitudinal.postgres.integration.test.ts. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const backend=path.resolve(__dirname,'../backend'),frontend=path.resolve(__dirname,'../frontend')
const {build}=require(require.resolve('esbuild',{paths:[backend]})),express=require(require.resolve('express',{paths:[backend]})),{chromium}=require(require.resolve('playwright-core',{paths:[backend]}))
async function main(){
 const fixture=process.env.GROUP_LONGITUDINAL_AGGREGATE_FIXTURE,out=process.env.GROUP_LONGITUDINAL_VISUAL_OUT
 if(!fixture||!out)throw Error('Explicit retained synthetic aggregate fixture and output directory required')
 const artifact=JSON.parse(await fs.readFile(fixture,'utf8'));await fs.mkdir(out,{recursive:true})
 await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{GroupLongitudinalReport}from'./src/modules/reporting/GroupLongitudinalReport';createRoot(document.getElementById('root')).render(<GroupLongitudinalReport artifact={${JSON.stringify(artifact)}}/>);`,resolveDir:frontend,loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(out,'report.js'),define:{'process.env.NODE_ENV':'"production"'}})
 const app=express();app.use('/assets',express.static(out));app.get('/',(_q,r)=>r.send('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/report.css"><div id="root"></div><script src="/assets/report.js"></script></html>'))
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:'+server.address().port)
  await page.waitForSelector('svg');await page.screenshot({path:path.join(out,'report-1280.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.waitForFunction(()=>{const canvas=document.querySelector('.report-trend-chart__canvas svg');return canvas&&canvas.getBoundingClientRect().width<390})
  const layout=await page.evaluate(()=>{const el=document.querySelector('.group-longitudinal-report__scroll');el.scrollLeft=100;return{viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,tableScrollable:el.scrollWidth>el.clientWidth,tableScrollLeft:el.scrollLeft}})
  assert.ok(layout.documentWidth<=layout.viewport);assert.ok(layout.tableScrollable);assert.ok(layout.tableScrollLeft>0)
  await page.evaluate(()=>{document.querySelector('.group-longitudinal-report__scroll').scrollLeft=0})
  await page.screenshot({path:path.join(out,'report-390.png'),fullPage:true});await fs.writeFile(path.join(out,'result.json'),JSON.stringify({synthetic:true,scope:'retained aggregate presentation only; no repeated backend/FINAL checks',...layout},null,2))
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
