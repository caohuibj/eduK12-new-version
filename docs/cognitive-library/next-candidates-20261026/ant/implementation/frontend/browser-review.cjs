const fs=require('node:fs'),path=require('node:path')
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const out=__dirname,url='http://127.0.0.1:8531/'
let activeBrowser
;(async()=>{
 const browser=activeBrowser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true})
 const checks=[],errors=[],screenshots=[]
 const shot=async(page,file)=>{await page.screenshot({path:path.join(out,file),fullPage:true});screenshots.push(file)}
 const measure=async(page,name)=>{
  const m=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
   text:document.body.innerText.slice(0,500),fields:[...document.querySelectorAll('.ant-field')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
   buttons:[...document.querySelectorAll('.ant-responses button')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}))
  if(m.scrollWidth>m.innerWidth+1)throw Error(name+' horizontal overflow '+JSON.stringify(m))
  checks.push({name,...m})
 }
 for(const [device,width,height] of [['phone',390,844],['tablet',820,1180]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true})
  const page=await context.newPage();page.on('pageerror',e=>errors.push({device,message:String(e)}))
  const id='ant-cloud-'+device+'-'+Date.now()
  await page.goto(url+'?context='+id);await page.getByRole('heading',{name:'看中间箭头，判断它的方向'}).waitFor()
  await shot(page,device+'-intro.png');await measure(page,device+' intro')
  await page.getByRole('button',{name:'核验设置并开始练习'}).click()
  await page.waitForFunction(()=>document.querySelector('[data-ant-paint]')?.getAttribute('data-ant-paint')==='cue',null,{polling:'raf',timeout:6000})
  await shot(page,device+'-cue.png')
  await page.locator('[data-ant-paint="target"]').waitFor({timeout:4000})
  await shot(page,device+'-target.png');await measure(page,device+' target')
  await page.getByRole('button',{name:'向左回应'}).tap()
  await page.waitForFunction(()=>window.__ANT_REVIEW__.saveCalls.length>0,null,{timeout:6000})
  const saved=await page.evaluate(()=>window.__ANT_REVIEW__.saveCalls[0])
  if(saved.record.core.events[0]?.input!=='touch')throw Error('Actual touch source missing')
  if(saved.record.core.cueOnsetPerfMs===null||saved.record.core.targetOnsetPerfMs===null)throw Error('Actual paint clocks missing')
  checks.push({name:device+' actual touch/raw',key:saved.key,digest:saved.digest,input:saved.record.core.events[0].input,
   cueOnset:saved.record.core.cueOnsetPerfMs,targetOnset:saved.record.core.targetOnsetPerfMs,targetOffset:saved.record.core.targetOffsetPerfMs,
   duration:saved.record.core.endedAtPerfMs-saved.record.core.startedAtPerfMs,origin:saved.record.core.recordOrigin,fixture:saved.record.raw.fixture})
  await page.reload();await page.getByRole('button',{name:'核验设置并开始练习'}).click()
  await page.getByRole('alert').waitFor();if(!(await page.getByRole('alert').innerText()).includes('fresh_durable_attempt_marker_required'))throw Error('Refresh marker was bypassed')
  checks.push({name:device+' refresh marker blocks re-exposure',passed:true})
  if(device==='phone')await shot(page,'phone-refresh-blocked.png')
  for(const state of ['interpretable','limited','invalid']){
   await page.goto(url+'?view=report&state='+state)
   await page.locator('[data-ant-report-state="'+state+'"]').waitFor()
   await shot(page,device+'-report-'+state+'.png');await measure(page,device+' report '+state)
   const counts=await page.evaluate(()=>({tables:document.querySelectorAll('table').length,overall:document.querySelectorAll('.ant-big').length,rows:document.querySelectorAll('tbody tr').length,images:document.querySelectorAll('article img,article svg').length}))
   if(state==='invalid'&&(counts.tables||counts.overall||counts.rows))throw Error('Invalid report leaked performance')
   if(state==='limited'&&counts.overall)throw Error('Limited report leaked overall')
   if(counts.images>1)throw Error('Too many report images')
   checks.push({name:device+' report gate '+state,...counts})
  }
  await page.goto(url+'?view=report&lang=en&zoom=2')
  await page.getByRole('heading',{name:'Your cue and arrow record'}).waitFor()
  await shot(page,device+'-report-en-200.png');await measure(page,device+' English report CSS zoom200 reading proxy')
  await context.close()
 }
 const failContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})
 const failPage=await failContext.newPage();failPage.on('pageerror',e=>errors.push({device:'failure-case',message:String(e)}))
 await failPage.goto(url+'?fail=1&context=ant-fail-'+Date.now())
 await failPage.getByRole('button',{name:'核验设置并开始练习'}).click()
 await failPage.getByRole('heading',{name:'本次作答已停止'}).waitFor({timeout:7000})
 await shot(failPage,'phone-save-failure.png')
 const before=await failPage.evaluate(()=>window.__ANT_REVIEW__.saveCalls.map(r=>({key:r.key,digest:r.digest})))
 await failPage.getByRole('button',{name:'重试保存缓存记录'}).click()
 await failPage.getByRole('button',{name:'提交本次受限记录'}).waitFor()
 const after=await failPage.evaluate(()=>window.__ANT_REVIEW__.saveCalls.map(r=>({key:r.key,digest:r.digest})))
 if(before[0].key!==after[1].key||before[0].digest!==after[1].digest)throw Error('Save retry changed the cached record')
 if(await failPage.locator('[data-ant-view="running"]').count())throw Error('Retry exposed new content')
 checks.push({name:'save failure/retry preserves exact sealed record and ends stream',before,after,serverSaved:false})
 await shot(failPage,'phone-after-retry.png')
 await failPage.getByRole('button',{name:'提交本次受限记录'}).click()
 await failPage.getByRole('status').filter({hasText:'服务器保存尚未确认'}).waitFor()
 const completion=await failPage.evaluate(()=>window.__ANT_REVIEW__.completion)
 if(!completion?.requestDigest||!completion?.localRecordSetDigest||completion.status!=='limited')throw Error('Final limited request is not sealed')
 checks.push({name:'host null server receipt remains unconfirmed',status:completion.status,requestDigest:completion.requestDigest,recordSetDigest:completion.localRecordSetDigest})
 await failContext.close();await browser.close()
 const result={status:'PASS',browser:'cloud headless /usr/bin/chromium sandbox=true',fixtureOnly:true,
  physicalOnsetVerified:false,readingZoom:'CSS zoom 200% proxy, no physical display calibration',checks,errors,screenshots}
 if(errors.length)throw Error('Browser page errors: '+JSON.stringify(errors))
 fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify({status:'PASS',checks:checks.length,screenshots:screenshots.length,pageErrors:errors.length}))
})().catch(async error=>{if(activeBrowser)await activeBrowser.close();fs.writeFileSync(path.join(out,'browser-failure-'+Date.now()+'.json'),JSON.stringify({status:'FAILED',message:String(error),stack:error.stack},null,2)+'\n');console.error(error);process.exitCode=1})
