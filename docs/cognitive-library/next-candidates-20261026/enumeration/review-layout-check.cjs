const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='/workspace/eduK12-new-version/docs/cognitive-library/next-candidates-20261026/enumeration',html=fs.readFileSync(path.join(root,'preview.html'),'utf8');
const old=JSON.parse(fs.readFileSync(path.join(root,'evidence.json'),'utf8'));
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'zh-CN',timezoneId:'UTC'});await context.route('**/*',r=>r.abort());
 const page=await context.newPage(),errors=[],measurements=[],shots=[];page.on('pageerror',e=>errors.push(e.message));
 async function shot(name){await page.evaluate(()=>document.fonts.ready);const file=path.join(root,name+'.png');await page.screenshot({path:file,fullPage:true});shots.push({file:name+'.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})}
 await page.setContent(html);await page.waitForFunction(()=>Boolean(window.designPreview));
 for(const state of ['fixation','stimulus','mask']){
  await page.evaluate(state=>window.designPreview.setState(state),state);
  const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,field:document.querySelector('.field').getBoundingClientRect().toJSON(),notice:{client:document.querySelector('.notice').clientHeight,scroll:document.querySelector('.notice').scrollHeight}}));
  if(m.scrollWidth>390||m.notice.scroll>m.notice.client)throw Error('Mobile phase content overflow '+state);
  measurements.push({state,width:390,...m});await shot(state+'-390');
 }
 const rects=measurements.map(x=>[x.field.x,x.field.y,x.field.width,x.field.height]);if(new Set(rects.map(JSON.stringify)).size!==1)throw Error('Phase field rect drift remains');
 await page.setViewportSize({width:1280,height:1310});await page.goto('about:blank');
 await page.setContent('<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf1f5;color:#1F2937;font-family:system-ui,sans-serif}h1{font-size:24px;margin:0 0 8px}p{font-size:13px;color:#4B5563;margin:0}.grid{display:flex;gap:18px;margin-top:20px}.column{width:394px;flex:none}.label{font-size:15px;margin:0 0 10px}.frame{width:390px;height:1200px;overflow:hidden;border:1px solid #CBD5E1;border-radius:9px;background:white}.frame iframe{width:390px;height:1200px;border:0}</style><h1>短时点数判断 · 设计待确认</h1><p>静态草案，不是运行测验；白点/中灰为论文描述的名义RGB候选，5°尚未校准，50ms尚未实现；三阶段刺激槽位置一致。</p><div class="grid"><div class="column"><div class="label">指导 · 25/100双版本提案</div><div class="frame"><iframe title="guide"></iframe></div></div><div class="column"><div class="label">呈现定格 · 论文极性候选</div><div class="frame"><iframe title="stimulus"></iframe></div></div><div class="column"><div class="label">作答 · 保留1–15整数范围</div><div class="frame"><iframe title="answer"></iframe></div></div></div>');
 for(let i=0;i<3;i++){const handle=await page.locator('iframe').nth(i).elementHandle(),frame=await handle.contentFrame();await frame.setContent(html);await frame.waitForFunction(()=>Boolean(window.designPreview));await frame.evaluate(state=>window.designPreview.setState(state),['guide','stimulus','answer'][i]);await frame.evaluate(()=>document.fonts.ready)}await shot('review');
 if(errors.length)throw Error(JSON.stringify(errors));
 old.layoutRevision={reason:'Mobile review text wrapping previously moved stimulus/mask 23.4 CSS px. Reserved review-text slots now keep the phase field fixed.',previousMobilePhaseRects:old.checks.layouts.filter(x=>x.width===390&&['fixation','stimulus','mask'].includes(x.state)),currentMobilePhaseRects:measurements,rectanglesEqual:true,experimentTimingValidated:false,otherChecksReexecuted:false};
 old.retainedEvidenceSourceBindings=old.sourceBindings;old.sourceBindings=['README.md','design.json','preview.html'].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
 old.checks.layouts=old.checks.layouts.map(x=>measurements.find(m=>m.width===x.width&&m.state===x.state)??x);
 for(const shot of shots){old.screenshots=old.screenshots.filter(s=>s.file!==shot.file);old.screenshots.push(shot)}
 old.errors=[];fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(old,null,2)+'\n');
 console.log(JSON.stringify({mobilePhaseRects:rects,equal:true,updatedScreenshots:shots.map(x=>x.file)}));
 }finally{await browser?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
