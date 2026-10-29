/* Cloud-only native content HTTP slice. Auth/START/FINAL/report/DB/archive route are real;
 * uploader is the explicitly synthetic service in native-mot-http-review.cjs. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),front=path.join(root,'server-version/frontend');
const ant=process.argv.includes('--ant'),setupOnly=process.argv.includes('--ant-setup-only');
const out=path.join(root,'docs/cognitive-library/onboarding-content-20261028/batch-3',setupOnly?'ant-browser-setup':ant?'ant-browser':'browser');
const backend=process.env.MOT_HTTP_REVIEW_ORIGIN||'http://127.0.0.1:18855';
let server,browser,temp;
const report={kind:'REAL_NATIVE_FRONTEND_HTTP_SLICE_SYNTHETIC_CLOCK_AND_COS_UPLOADER',startedAt:new Date().toISOString(),api:[],pageErrors:[],checks:[],notVerified:['External COS credentials/upload','Physical timing/refresh validity','Full product auth shell','Public/Survey/composite native delivery']};
(async()=>{try{
 fs.mkdirSync(out,{recursive:true});temp=fs.mkdtempSync(path.join(front,'.native-content-client-review-'));
 const relative='/'+path.basename(temp)+'/app.tsx';
 fs.writeFileSync(path.join(temp,'app.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Runner from '../src/modules/cognitive/pages/CognitiveRunner';import Result from '../src/modules/cognitive/pages/CognitiveResult';import{LearnerNavigationContext}from'../src/training/learnerNavigation';import '../src/index.css';document.title='SYNTHETIC CLOCK / FAKE COS — REAL NATIVE HTTP';createRoot(document.getElementById('root')!).render(<LearnerNavigationContext.Provider value={true}><BrowserRouter><Routes><Route path='/student/cognitive/sessions/:sessionId' element={<Runner/>}/><Route path='/student/cognitive/sessions/:sessionId/result' element={<Result/>}/></Routes></BrowserRouter></LearnerNavigationContext.Provider>);`);
 const {createServer}=await import(path.join(front,'node_modules/vite/dist/node/index.js'));
 server=await createServer({configFile:path.join(front,'vite.config.ts'),root:front,plugins:[{name:'native-content-http-review-entry',configureServer(v){v.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/student/cognitive/sessions/'))return next();res.setHeader('Content-Type','text/html');res.end(await v.transformIndexHtml(req.url,`<!doctype html><html lang='zh'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><div id='root'></div><script type='module' src='${relative}'></script></html>`))})}}],server:{host:'127.0.0.1',port:5198,strictPort:true,proxy:{'/api':{target:backend,changeOrigin:true},'/__review':{target:backend,changeOrigin:true}}}});
 await server.listen();
 const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,headless:true,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const base='http://127.0.0.1:5198';
 let response=await context.request.get(base+'/__review/login?actor=student');if(!response.ok())throw Error('Review cookie handoff failed '+response.status());
 const fixture=await (await context.request.get(base+'/__review/context')).json();
 response=await context.request.post(base+'/api/cognitive/sessions',{data:{assignmentId:fixture.assignmentId}});const started=await response.json();
 if(!response.ok()||started.code!==0||!started.data?.sessionId)throw Error('Real START failed '+response.status()+' '+String(started.message));
 const session=started.data;report.identity={sessionId:session.sessionId,attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,protocolSignature:session.protocolSignature,profile:session.profile};
 if(!session.nativeTask||session.config.totalTrials!==(ant?48:32)||session.config.profile!=='experience')throw Error('Unexpected frozen native profile');
 await context.request.post(base+'/__review/archive-mode',{data:{failUploads:1}});
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/api/'))report.api.push({method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()})});
 await page.clock.install();
 await page.goto(base+'/student/cognitive/sessions/'+session.sessionId);
 await page.getByRole('button',{name:'开始测评',exact:true}).click();
 if(ant){
  await page.getByRole('button',{name:'校准屏幕',exact:true}).click();
  await page.getByLabel('眼睛到屏幕的距离（毫米）').fill('350');await page.getByRole('checkbox').check();
  await page.screenshot({path:path.join(out,'calibration-390.png'),fullPage:true});
  await page.getByRole('button',{name:'确认校准',exact:true}).click();
  await page.getByRole('heading',{name:'看中间箭头，判断它的方向',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'instructions-390.png'),fullPage:true});
  await page.getByRole('button',{name:'开始练习',exact:true}).click();
  if(setupOnly){for(let j=0;j<100;j++){if(await page.locator('[data-ant-paint="target"]').count())break;await page.clock.runFor(32)}await page.locator('[data-ant-paint="target"]').waitFor();await page.screenshot({path:path.join(out,'target-390.png'),fullPage:true});report.status='PASS';report.checks.push({name:'calibration_styled_and_actual_first_practice_target_software_clock',passed:true});return}
  const respond=async()=>{
   for(let j=0;j<150;j++){
    if(await page.locator('[data-ant-paint="target"]').count()){
     const direction=await page.locator('[data-ant-paint="target"]').evaluate(svg=>{
      const cx=Number(svg.getAttribute('viewBox').split(' ')[2])/2;
      const polygons=[...svg.querySelectorAll('polygon')],p=polygons.reduce((a,b)=>{const middle=e=>e.getAttribute('points').split(' ').map(v=>Number(v.split(',')[0])).reduce((s,x)=>s+x,0)/3;return Math.abs(middle(a)-cx)<Math.abs(middle(b)-cx)?a:b});
      const x=p.getAttribute('points').split(' ').map(v=>Number(v.split(',')[0]));return x[0]>x[1]?'ArrowRight':'ArrowLeft';
     });
     await page.clock.runFor(250);await page.keyboard.press(direction);await page.clock.runFor(80);return;
    }
    await page.clock.runFor(32);
   }
   throw Error('ANT target never appeared');
  };
  for(let i=0;i<8;i++){
   await respond();await page.clock.runFor(6500);
   await page.getByRole('heading',{name:i===7?'练习已通过':'练习答案',exact:true}).waitFor();
   if(i<7)await page.getByRole('button',{name:'下一题',exact:true}).click();
  }
  await page.getByRole('button',{name:'开始正式作答',exact:true}).click();
  for(let i=0;i<48;i++){
   await respond();
   if(i===0)await page.screenshot({path:path.join(out,'stimulus-390.png'),fullPage:true});
   // Wait through the remaining hold; stop before the next target, polling actual paints.
   if(i<47){for(let j=0;j<150;j++){if(await page.locator('[data-ant-paint="fixation"]').count())break;await page.clock.runFor(32);}}
  }
  await page.clock.runFor(4500);
 }else{
 await page.getByRole('heading',{name:'先看图形，再看它在哪一边',exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'instructions-390.png'),fullPage:true});
 await page.getByRole('button',{name:'准备练习',exact:true}).click();
 await page.getByRole('button',{name:'开始',exact:true}).click();
 for(let i=0;i<8;i++){
  await page.clock.runFor(50);
  const field=page.getByRole('img');await field.waitFor();
  const label=await field.getAttribute('aria-label');
  if(!/^(心|花)在(左|右)$/.test(label||''))throw Error('No actual HF stimulus label: '+label);
  const key=label.includes('心')?(label.includes('左')?'ArrowLeft':'ArrowRight'):(label.includes('左')?'ArrowRight':'ArrowLeft');
  await page.clock.runFor(250);await page.keyboard.press(key);await page.clock.runFor(1100);
  await page.getByRole('heading',{name:'练习解释',exact:true}).waitFor();
  if(i<7)await page.getByRole('button',{name:'下一题练习',exact:true}).click();
 }
 await page.getByRole('button',{name:'准备正式任务',exact:true}).click();
 await page.getByRole('button',{name:'开始',exact:true}).click();await page.clock.runFor(350);
 await page.keyboard.press('ArrowLeft');await page.clock.runFor(1100);
 await page.getByRole('button',{name:'结束本次记录',exact:true}).click();
 }
 await page.waitForURL('**/result');
 await page.getByText('完整记录仍保留在本设备，归档尚未确认。',{exact:false}).waitFor();
 await page.getByRole('button',{name:'保存完整记录',exact:true}).waitFor();
 await page.waitForFunction(()=>document.body.innerText.includes('完整记录仍保留在本设备')&&!document.querySelector('button[disabled]'));
 const readDraft=()=>page.evaluate(async id=>{
  const req=indexedDB.open('eduk12-final-drafts-v1');const db=await new Promise((r,j)=>{req.onsuccess=()=>r(req.result);req.onerror=()=>j(req.error)});
  const names=Array.from(db.objectStoreNames);const metaName=names.find(n=>n.toLowerCase().includes('meta'));if(!metaName)return {stores:names,error:'meta store missing'};
  const tx=db.transaction(metaName,'readonly'),q=tx.objectStore(metaName).get('cognitive:'+id);const meta=await new Promise((r,j)=>{q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();
  const raw=meta?.cognitiveRawArchive,detail=raw?.rawPayload;return meta?{status:meta.status,submissionId:meta.submissionId,coreSealed:Boolean(meta.sealedSubmission),raw:raw?{coreSaved:raw.coreSaved,archiveConfirmed:raw.archiveConfirmed,rawSha256:raw.rawSha256,formal:detail.records.filter(r=>r.phase==='test').length,practice:detail.records.filter(r=>r.phase==='practice').length,termination:detail.claim.termination,inputs:[...new Set(detail.records.flatMap(r=>(r.raw.events??r.raw.core.events).filter(e=>e.kind==='down'||e.direction).map(e=>e.input)))]}:null}:null;
 },session.sessionId);
 report.afterFailedArchive=await readDraft();report.archiveAfterFailure=await(await context.request.get(base+'/__review/archive-state')).json();
 if(report.afterFailedArchive?.raw?.formal!==(ant?48:2)||report.afterFailedArchive?.raw?.practice!==8||report.afterFailedArchive?.raw?.archiveConfirmed!==false)throw Error('Unconfirmed raw was not durably retained');
 if(!report.afterFailedArchive.raw.inputs.includes('keyboard'))throw Error('Actual keyboard input not retained');
 await page.evaluate(()=>{const label=document.createElement('p');label.id='synthetic-review-label';label.textContent='合成联调示例：软件时钟；COS为测试替身，未访问外部存储';label.style.cssText='margin:0;padding:12px;background:#fff3cd;color:#332600;font:14px/1.6 system-ui;overflow-wrap:anywhere';document.body.prepend(label)});
 report.reportBeforeArchive=await page.locator('body').innerText();
 await page.screenshot({path:path.join(out,'report-core-saved-archive-pending-390.png'),fullPage:true});
 await page.getByRole('button',{name:'保存完整记录',exact:true}).click();await page.getByText('完整记录已归档。',{exact:true}).waitFor();
 report.afterConfirmedArchive=await readDraft();report.archiveAfterRetry=await(await context.request.get(base+'/__review/archive-state')).json();
 if(report.afterConfirmedArchive!==null)throw Error('Confirmed generic draft not cleared');
 await page.screenshot({path:path.join(out,'report-archive-confirmed-390.png'),fullPage:true});
 await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(out,'report-archive-confirmed-820.png'),fullPage:true});
 await page.evaluate(()=>document.documentElement.style.zoom='2');await page.screenshot({path:path.join(out,'report-200-percent.png'),fullPage:true});
 report.reportOverflow200=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 if(report.reportOverflow200.scroll>report.reportOverflow200.client+1)throw Error('Report overflows at 200%');
 if(!(report.reportBeforeArchive.includes('本次')||report.reportBeforeArchive.includes('这次'))||!report.reportBeforeArchive.includes('EDUK12.TOP'))throw Error('Native saved report was not rendered');
 if(report.pageErrors.length)throw Error('Browser page errors: '+report.pageErrors.join('; '));
 if(report.api.filter(r=>r.path.endsWith('/submit')&&r.method==='POST').length!==1)throw Error('FINAL repeated unexpectedly');
 fs.writeFileSync(path.join(out,'archived-fixture.json'),JSON.stringify(await(await context.request.get(base+'/__review/archived-fixture')).json(),null,2)+'\n');
 report.status='PASS';report.checks.push({name:ant?'8_practice_48_formal_software_clock_actual_UI_keyboard_real_START_FINAL_report':'8_practice_1_formal_and_1_interrupted_software_clock_actual_UI_keyboard_real_START_FINAL_report',passed:true},{name:'core_report_visible_before_fake_COS_confirmation_raw_retained_then_retry_confirmed',passed:true});
 }catch(error){report.status='FAIL';report.error=String(error?.stack||error);if(browser){try{const p=browser.contexts()[0]?.pages()[0];if(p){report.failurePageText=await p.locator('body').innerText();await p.screenshot({path:path.join(out,'failure.png'),fullPage:true})}}catch{}}process.exitCode=1}
 finally{report.finishedAt=new Date().toISOString();report.scriptSha256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');if(temp)fs.rmSync(temp,{recursive:true,force:true});if(browser)await browser.close();if(server)await server.close();fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error?.split('\n')[0],out}));}
})();
