'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http')
const {createHash}=require('node:crypto')
const BRANCH='ci/school-teacher-console-20261023',REPO='caohuibj/eduK12-new-version'
function allowed(env,event){return env.CI==='true'&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_JOB==='launch-diagnostic'&&env.GITHUB_REPOSITORY===REPO&&env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF==='refs/heads/'+BRANCH&&event?.deleted===false&&event?.repository?.full_name===REPO&&event?.after===env.GITHUB_SHA&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')}
const hash=x=>createHash('sha256').update(String(x)).digest('hex')
function installAnimationProbe(){
 const ids=new WeakMap();let next=1;const events={run:0,start:0,end:0,cancel:0};
 for(const name of Object.keys(events))document.addEventListener('transition'+name,()=>{events[name]=Math.min(100000,events[name]+1)},true)
 window.__themeAnimationProbe={ids,id:a=>{if(!ids.has(a))ids.set(a,next++);return ids.get(a)},events}
}
function animationFacts(selector){
 const root=document.querySelector(selector),probe=window.__themeAnimationProbe,num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
 return {visibility:document.visibilityState,activeTag:document.activeElement?.tagName||null,events:{...probe?.events},animations:root?[...root.getAnimations({subtree:true})].filter(a=>a instanceof CSSTransition).slice(0,40).map(a=>{const t=a.effect?.getComputedTiming(),el=a.effect?.target,r=el?.getBoundingClientRect();return{id:probe?.id(a)||null,property:a.transitionProperty,playState:a.playState,pending:a.pending,startTime:num(a.startTime),timelineTime:num(a.timeline?.currentTime),playbackRate:num(a.playbackRate),currentTime:num(a.currentTime),endTime:num(t?.endTime),duration:num(t?.duration),connected:el?.isConnected===true,tag:el?.tagName||null,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null}}):[]}
}

async function run(){
 assert(allowed(process.env,JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))),'Diagnostic context refused')
 const repo=path.resolve(__dirname,'../..'),dist=path.join(repo,'server-version/frontend/theme-diagnostic-dist'),out=path.join(repo,'school-theme-diagnostic-evidence');fs.mkdirSync(out,{recursive:true})
 const report={schemaVersion:1,acceptance:false,scope:'synthetic real-component theme diagnostic; no backend/authentication qualification',source:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,observations:[],console:[],pageErrors:[],unexpected:[],errors:[]}
 let browser,server,phase='preflight'
 try{
  const chrome=require('./school-teacher-chrome.cjs'),{settleThemeTransitions,classifyThemeFailure}=require('./school-teacher-ui.cjs')
  report.chrome=chrome.preflightChrome({repo,diagnostics:true});assert.equal(report.chrome.ok,true)
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'}
  server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),decoded=decodeURIComponent(u.pathname);assert.equal(req.method,'GET');assert(!decoded.includes('\\')&&!decoded.includes('\0'));const file=path.resolve(dist,'.'+(decoded==='/'?'/index.html':decoded));assert(file.startsWith(dist+path.sep)&&fs.realpathSync(file).startsWith(dist+path.sep));res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end('Not found')}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
  const {chromium}=require(path.join(repo,'.github/release-tools/node_modules/playwright-core'));browser=await chromium.launch(chrome.CHROME_LAUNCH_OPTIONS);report.sandbox=await chrome.verifyChromeSandbox(browser);assert.equal(report.sandbox.ok,true)
  const axe=fs.readFileSync(path.join(repo,'.github/release-tools/node_modules/axe-core/axe.min.js'),'utf8')
  for(const entry of ['school','teacher'])for(const motion of ['reduce','no-preference'])for(const width of [320,390])for(const state of ['empty','selected','error','disabled','display-error'])for(const editorState of (state==='disabled'?['readonly']:['matrix','bulk','condition'])){
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:motion,serviceWorkers:'block'})
   try{
    await context.routeWebSocket('**/*',ws=>{report.unexpected.push({phase,kind:'websocket'});ws.close()})
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&route.request().method()==='GET'&&!u.pathname.startsWith('/api/'))return route.continue();report.unexpected.push({phase,kind:'network'});return route.abort()})
    await context.addInitScript(installAnimationProbe);const page=await context.newPage();page.setDefaultTimeout(10000);page.on('console',m=>{if(m.type()==='error'&&report.console.length<50)report.console.push({phase,hash:hash(m.text())})});page.on('pageerror',e=>{if(report.pageErrors.length<30)report.pageErrors.push({phase,hash:hash(e.message)})})
    phase=[entry,motion,width,state,editorState].join(':');await page.goto(origin+'/?entry='+entry+'&state='+state);await page.locator('[data-theme-diagnostic-ready]').waitFor();await page.evaluate(()=>document.fonts.ready)
    if(state!=='disabled'){
     await page.getByRole('button',{name:'编辑题目：'+(editorState==='condition'?'合成条件拒答题':'合成矩阵题'),exact:true}).click()
     if(editorState==='condition'){await page.getByRole('combobox',{name:'依据哪道题',exact:true}).waitFor();await page.getByRole('combobox',{name:'选中哪个选项',exact:true}).waitFor()}
     if(editorState==='bulk')for(const kind of ['选项','矩阵行']){
      await page.locator('details.survey-form-bulk-lines > summary').filter({hasText:'批量编辑'+kind}).click()
      await page.getByRole('button',{name:'载入现有'+kind,exact:true}).click()
      await page.getByRole('list',{name:kind+'粘贴预览',exact:true}).waitFor()
     }
    }
    if(state==='empty'||state==='error'||state==='selected')await page.getByRole('button',{name:'从素材库添加',exact:true}).click()
    if(state==='selected'||state==='display-error'){await page.getByText('修改展示文字与说明',{exact:true}).first().click();await page.getByRole('button',{name:'查看图片',exact:true}).first().click();if(state==='display-error')await page.getByRole('button',{name:'重新加载素材',exact:true}).first().waitFor()}
    const selector=entry==='school'?'.hs-app':'.ht-app',label=entry==='school'?'School 外观':'Teacher 外观'
    for(const mode of ['light','dark']){
     const row={entry,motion,width,state,editorState,mode};report.observations.push(row);phase=[entry,motion,width,state,editorState,mode].join(':')
     await page.getByRole('combobox',{name:label,exact:true}).selectOption(mode);await page.locator(selector+'[data-theme="'+mode+'"]').waitFor();await page.waitForLoadState('networkidle');row.before=await page.evaluate(animationFacts,selector)
     try{row.transitions=await page.evaluate(settleThemeTransitions,selector)}catch(e){row.transitionFailure=classifyThemeFailure(e);row.errorHash=hash(e)}finally{row.after=await page.evaluate(animationFacts,selector)}
     await page.addScriptTag({content:axe});row.axe=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}});return result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,30).map(n=>({target:n.target,data:n.any.map(c=>c.data).filter(Boolean)}))}))})
     row.stylesheets=await page.evaluate(()=>[...document.querySelectorAll('link[rel=stylesheet]')].map(el=>new URL(el.href).pathname));row.formPanels=await page.locator('.survey-form-options,.survey-form-bulk-preview,.survey-form-setting-note').evaluateAll(nodes=>nodes.slice(0,20).map(el=>{const c=getComputedStyle(el);return {tag:el.tagName,background:c.backgroundColor,color:c.color,subtle:c.getPropertyValue('--survey-brand-subtle'),muted:c.getPropertyValue('--survey-brand-muted')}}));row.layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));row.palette=await page.locator('.assessment-material-picker,.assessment-material-display').evaluateAll(nodes=>nodes.slice(0,12).map(el=>{const c=getComputedStyle(el);return{background:c.backgroundColor,color:c.color,muted:c.getPropertyValue('--material-muted')}}))
     if(row.transitionFailure||row.axe.length||row.layout.scrollWidth>width+1)await page.screenshot({path:path.join(out,phase.replace(/:/g,'-')+'.png'),fullPage:true})
    }
   }catch(e){report.errors.push({phase,hash:hash(e)})}finally{await context.close()}
  }
 }catch(e){report.errors.push({phase,hash:hash(e)})}finally{
  if(browser)try{await browser.close()}catch(e){report.errors.push({phase:'browser-close',hash:hash(e)})}
  if(server)await new Promise(resolve=>server.close(resolve))
  report.status=report.errors.length||report.console.length||report.pageErrors.length||report.unexpected.length||report.observations.some(r=>r.transitionFailure||r.axe?.length||r.layout?.scrollWidth>r.width+1)?'FAILED':'DIAGNOSTIC_PASSED'
  fs.writeFileSync(path.join(out,'theme-diagnostic.json'),JSON.stringify(report,null,2)+'\n');if(report.status==='FAILED')process.exitCode=1
 }
}
module.exports={allowed,animationFacts,installAnimationProbe}
if(require.main===module)run().catch(e=>{console.error('Diagnostic refused: '+hash(e));process.exitCode=1})
