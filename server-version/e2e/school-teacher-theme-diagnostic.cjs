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

async function waitParticipantComplete(page,entry){
 if(entry==='school'){
  const status=page.locator('.hs-runner .hs-message[role="status"]')
  await status.getByRole('heading',{name:'合成表单演示已完成',exact:true}).waitFor()
  await status.getByText('这不是正式提交，没有产生 FINAL。',{exact:true}).waitFor()
  await status.getByRole('button',{name:'返回合成表单',exact:true}).waitFor()
 }else await page.getByText('合成表单演示已完成。这不是正式提交，没有产生 FINAL。',{exact:true}).waitFor()
}

async function run(){
 assert(allowed(process.env,JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))),'Diagnostic context refused')
 const repo=path.resolve(__dirname,'../..'),dist=path.join(repo,'server-version/frontend/theme-diagnostic-dist'),out=path.join(repo,'school-theme-diagnostic-evidence');fs.mkdirSync(out,{recursive:true})
 const report={schemaVersion:1,acceptance:false,expectedObservations:8,selectedScope:{entries:['school'],states:['complete'],widths:[320,390],motions:['reduce','no-preference'],modes:['light','dark']},scope:'8 missing School synthetic completion observations; other 136 unchanged observations passed in run 39941778702; no FINAL qualification',source:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,observations:[],console:[],pageErrors:[],unexpected:[],errors:[]}
 let browser,server,phase='preflight'
 try{
  const chrome=require('./school-teacher-chrome.cjs'),{settleThemeTransitions,classifyThemeFailure}=require('./school-teacher-ui.cjs')
  report.chrome=chrome.preflightChrome({repo,diagnostics:true});assert.equal(report.chrome.ok,true)
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'}
  server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),decoded=decodeURIComponent(u.pathname);assert.equal(req.method,'GET');assert(!decoded.includes('\\')&&!decoded.includes('\0'));const file=path.resolve(dist,'.'+(decoded==='/'?'/index.html':decoded));assert(file.startsWith(dist+path.sep)&&fs.realpathSync(file).startsWith(dist+path.sep));res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end('Not found')}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
  const {chromium}=require(path.join(repo,'.github/release-tools/node_modules/playwright-core'));browser=await chromium.launch(chrome.CHROME_LAUNCH_OPTIONS);report.sandbox=await chrome.verifyChromeSandbox(browser);assert.equal(report.sandbox.ok,true)
  const axe=fs.readFileSync(path.join(repo,'.github/release-tools/node_modules/axe-core/axe.min.js'),'utf8')
  for(const entry of ['school'])for(const motion of ['reduce','no-preference'])for(const width of [320,390])for(const state of ['complete']){
   const editorState='participant'
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:motion,serviceWorkers:'block'})
   try{
    await context.routeWebSocket('**/*',ws=>{report.unexpected.push({phase,kind:'websocket'});ws.close()})
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&route.request().method()==='GET'&&!u.pathname.startsWith('/api/'))return route.continue();report.unexpected.push({phase,kind:'network'});return route.abort()})
    await context.addInitScript(installAnimationProbe);const page=await context.newPage();page.setDefaultTimeout(10000);page.on('console',m=>{if(m.type()==='error'&&report.console.length<50)report.console.push({phase,hash:hash(m.text())})});page.on('pageerror',e=>{if(report.pageErrors.length<30)report.pageErrors.push({phase,hash:hash(e.message)})})
    phase=[entry,motion,width,state,editorState].join(':');const participantState=['error','save-error','complete'].includes(state)?state:'form';await page.goto(origin+'/?view=participant&entry='+entry+'&participantState='+participantState);await page.locator('[data-theme-diagnostic-ready]').waitFor();await page.evaluate(()=>document.fonts.ready)
    if(['conditional','multiple','matrix','matrix-refusal','page-two'].includes(state)){
     await page.getByRole('radio',{name:'合成选项甲',exact:true}).check();await page.getByRole('button',{name:'下一字段',exact:true}).click()
     await page.getByRole('textbox',{name:/合成条件拒答题/}).waitFor()
     if(state!=='conditional'){
      await page.getByRole('checkbox',{name:'我选择不回答这一题',exact:true}).check();await page.getByRole('button',{name:'下一字段',exact:true}).click()
      await page.getByRole('checkbox',{name:'合成选项甲',exact:true}).waitFor()
      if(state!=='multiple'){
       await page.getByRole('checkbox',{name:'合成选项甲',exact:true}).check();await page.getByRole('button',{name:'下一字段',exact:true}).click()
       const first=page.getByRole('group',{name:'合成矩阵第一行',exact:true}),second=page.getByRole('group',{name:'合成矩阵第二行',exact:true});await first.waitFor()
       if(state!=='matrix'){
        await first.getByRole('checkbox',{name:'不愿回答本行',exact:true}).check();await second.getByRole('radio',{name:'合成选项乙',exact:true}).check()
        if(state==='page-two'){await page.getByRole('button',{name:'提交整个区段',exact:true}).click();await page.getByRole('textbox',{name:/合成分节确认题/}).waitFor()}
       }
      }
     }
    }
    if(state==='complete')await waitParticipantComplete(page,entry)
    const selector=entry==='school'?'.hs-app':'.ht-app',label=entry==='school'?'School 外观':'Teacher 外观'
    for(const mode of ['light','dark']){
     const row={entry,motion,width,state,editorState,mode};report.observations.push(row);phase=[entry,motion,width,state,editorState,mode].join(':')
     await page.getByRole('combobox',{name:label,exact:true}).selectOption(mode);await page.locator(selector+'[data-theme="'+mode+'"]').waitFor();await page.waitForLoadState('networkidle');row.before=await page.evaluate(animationFacts,selector)
     try{row.transitions=await page.evaluate(settleThemeTransitions,selector)}catch(e){row.transitionFailure=classifyThemeFailure(e);row.errorHash=hash(e)}finally{row.after=await page.evaluate(animationFacts,selector)}
     await page.addScriptTag({content:axe});row.axe=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'rule',values:['color-contrast']}});return result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,30).map(n=>({target:n.target,data:n.any.map(c=>c.data).filter(Boolean)}))}))})
     row.stylesheets=await page.evaluate(()=>[...document.querySelectorAll('link[rel=stylesheet]')].map(el=>new URL(el.href).pathname));row.formPanels=await page.locator('.form-player,[data-participant-local-save],[data-assessment-shell-header],[data-assessment-shell-navigation]').evaluateAll(nodes=>nodes.slice(0,20).map(el=>{const c=getComputedStyle(el);return {tag:el.tagName,background:c.backgroundColor,color:c.color,subtle:c.getPropertyValue('--survey-brand-subtle'),muted:c.getPropertyValue('--survey-brand-muted')}}));row.layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));row.palette=await page.locator('.assessment-material-picker,.assessment-material-display').evaluateAll(nodes=>nodes.slice(0,12).map(el=>{const c=getComputedStyle(el);return{background:c.backgroundColor,color:c.color,muted:c.getPropertyValue('--material-muted')}}))
     if(row.transitionFailure||row.axe.length||row.layout.scrollWidth>width+1)await page.screenshot({path:path.join(out,phase.replace(/:/g,'-')+'.png'),fullPage:true})
     if(mode==='dark'&&state!=='complete')row.localSaveComparison=await page.locator('[data-participant-local-save]').evaluate(el=>{const original=el.getAttribute('class'),current=getComputedStyle(el).color;let legacy;try{el.classList.remove('assessment-local-save-status');legacy=getComputedStyle(el).color}finally{if(original===null)el.removeAttribute('class');else el.setAttribute('class',original)}return {current,legacy,scope:'class-only regression probe after all acceptance observations; original class restored'}})
    }
   }catch(e){report.errors.push({phase,hash:hash(e)})}finally{await context.close()}
  }
 }catch(e){report.errors.push({phase,hash:hash(e)})}finally{
  if(browser)try{await browser.close()}catch(e){report.errors.push({phase:'browser-close',hash:hash(e)})}
  if(server)await new Promise(resolve=>server.close(resolve))
  report.status=report.observations.length!==report.expectedObservations||report.errors.length||report.console.length||report.pageErrors.length||report.unexpected.length||report.observations.some(r=>r.transitionFailure||r.axe?.length||r.layout?.scrollWidth>r.width+1)?'FAILED':'DIAGNOSTIC_PASSED'
  fs.writeFileSync(path.join(out,'theme-diagnostic.json'),JSON.stringify(report,null,2)+'\n');if(report.status==='FAILED')process.exitCode=1
 }
}
module.exports={allowed,animationFacts,installAnimationProbe,waitParticipantComplete}
if(require.main===module)run().catch(e=>{console.error('Diagnostic refused: '+hash(e));process.exitCode=1})
