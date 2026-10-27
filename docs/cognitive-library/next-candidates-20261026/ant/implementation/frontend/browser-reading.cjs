const fs=require('node:fs'),path=require('node:path')
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true});try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true})
 const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)))
 for(const [state,language,zoom,file] of [
 ['interpretable','zh',1,'phone-report-interpretable-responsive.png'],['limited','zh',1,'phone-report-limited-responsive.png'],
 ['invalid','zh',1,'phone-report-invalid-responsive.png'],['interpretable','en',2,'phone-report-en-200-responsive.png']]){
  await page.goto(`http://127.0.0.1:8531/?view=report&state=${state}&lang=${language}&zoom=${zoom}`)
  await page.locator(`[data-ant-report-state="${state}"]`).waitFor()
  await page.screenshot({path:path.join(__dirname,file),fullPage:true})
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   rowHeaders:[...document.querySelectorAll('th[scope="row"]')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width})),
   tables:document.querySelectorAll('table').length,overall:document.querySelectorAll('.ant-big').length,
   cardRows:[...document.querySelectorAll('tbody tr')].map(e=>getComputedStyle(e).display)}))
  if(dimensions.scrollWidth>dimensions.viewport+1)throw Error('Responsive report overflow')
  if(state==='invalid'&&(dimensions.tables||dimensions.overall))throw Error('Invalid report leaked values')
  if(state==='limited'&&dimensions.overall)throw Error('Limited report leaked headline')
  if(state!=='invalid'&&await page.getByRole('rowheader').count()!==dimensions.rowHeaders.length)throw Error('Row header accessibility lost')
  checks.push({state,language,zoom,file,...dimensions})
 }
 if(errors.length)throw Error('Page errors '+errors.join(';'))
 fs.writeFileSync(path.join(__dirname,'browser-reading-result.json'),JSON.stringify({status:'PASS',scope:'Only changed narrow report presentation',checks,errors,zoom:'CSS200% reading proxy, not physical calibration'},null,2)+'\n')
 console.log(JSON.stringify({status:'PASS',checks:checks.length,pageErrors:errors.length}))
}finally{await browser.close()}})().catch(error=>{fs.writeFileSync(path.join(__dirname,'browser-reading-failure-'+Date.now()+'.json'),JSON.stringify({status:'FAILED',message:String(error)},null,2));console.error(error);process.exitCode=1})
