'use strict';
// Real production Survey components, synthetic UI contracts only. No backend,
// database, authorization, persistence or production-domain acceptance claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const REQUIRED = Object.freeze([
  'researcher-1440', 'researcher-390', 'loading-error-empty',
  'participant-1440', 'participant-390', 'participant-media',
]);
const PUBLIC = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL = 'a'.repeat(43); // Synthetic, never logged or sent outside route mocks.
const ROOT = '/api/survey/projects/p1';
const ATTEMPT_ROOT = `/api/public/survey/r/${PUBLIC}/attempts/${ATTEMPT}`;
const project = { id:'p1', title:'合成学习研究', description:'仅供界面验收', collectionMode:'SINGLE_UNLINKED', status:'DRAFT', revision:1 };
const project2 = { ...project, id:'p2', title:'第二项合成研究' };
const form = { id:'tool1', projectId:'p1', instrumentKey:'tool1', kind:'FORM', title:'合成研究表单', status:'DRAFT', revision:1,
  definition:{ schemaVersion:2, pages:[{pageKey:'page', title:'第一页', questions:[{itemKey:'question', type:'SHORT_TEXT', prompt:'请描述学习体验', required:false, options:[], rows:[], allowRefusal:false}]}] } };
const wave = { id:'wave', projectId:'p1', title:'合成草稿波次', ordinal:1, status:'DRAFT', revision:1, instrumentIds:[], publicationId:null,
  consentText:'合成知情同意', generalText:'谢谢', consentVersion:1, linkageNoticeConfirmed:true, opensAt:null, closesAt:null, finishUntil:null,
  quotaStarts:null, startsCount:0, allowNewParticipants:false, hardStopAt:null };
const grants = ['学习动机','心理健康'].map((title,i)=>({id:'grant'+i,title,kind:'SCALE',status:'ACTIVE',sourceRef:{kind:'SCALE',sourceId:'synthetic'+i,sourceVersion:1}}));
function task(media=false) {
  const image = {asset:{assetId:'synthetic-image',contentHash:'b'.repeat(64),mimeType:'image/png'},altText:'合成蓝色图块'};
  const video = {schemaVersion:1,video:{assetId:'synthetic-video',contentHash:'c'.repeat(64),mimeType:'video/webm'},title:'合成静默短视频',transcript:{language:'zh',text:'蓝色背景逐渐变化，无语音。'}};
  return {attemptId:ATTEMPT,waveId:'wave',status:'STARTED',definitionDigest:'a'.repeat(64),reportMode:'GENERAL_ONLY',units:[{
    kind:'SCALE',instrumentKey:'scale',title:'合成逐题量表',presentationMode:'ONE_BY_ONE',
    items:[{itemKey:'q1',prompt:'第一题：学习安排清楚',required:true,...(media?{images:[image]}:{})},
      {itemKey:'q2',prompt:'第二题：我愿意继续学习',required:true,...(media?{video}:{})},
      {itemKey:'q3',prompt:'最后一题：我能够完成任务',required:true}],
    responseOptions:[{optionKey:'yes',label:'同意'},{optionKey:'no',label:'不同意'}],
  }]};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
async function eventually(fn,label){for(let i=0;i<160;i++){if(await fn())return;await delay(50);}throw Error(label);}
async function main(){
  assert.equal(process.env.GITHUB_ACTIONS,'true','Actions-only real browser qualification');
  assert.equal(process.version,'v24.21.0','Pinned Node required');
  const dist=fs.realpathSync(process.env.SURVEY_EXPERIENCE_DIST);
  const evidence=path.resolve(process.env.SURVEY_EXPERIENCE_EVIDENCE);
  const {chromium}=require(path.resolve(process.env.PLAYWRIGHT_MODULE));
  const axe=fs.readFileSync(process.env.AXE_SCRIPT,'utf8');
  fs.mkdirSync(path.join(evidence,'screenshots'),{recursive:true});
  assert.match(process.env.SURVEY_EXPERIENCE_DIST_MANIFEST_SHA256 || '',/^[a-f0-9]{64}$/);
  const report={sourceCommit:process.env.GITHUB_SHA,ciRunId:process.env.GITHUB_RUN_ID,runtimeManifestSha256:process.env.SURVEY_EXPERIENCE_DIST_MANIFEST_SHA256,secureContextFeatures:'not-tested',scope:'synthetic-production-frontend-ui-only',required:REQUIRED,checks:[],networkFailures:[],pageErrors:[],keyboardFocus:[],layouts:[],status:'running'};
  let phase='start', selector=null, browser, activePage, origin, videoBytes;
  const server=http.createServer((req,res)=>{
    // This server only serves the build. API requests must have been fulfilled by
    // the strict browser route; reaching this server with an API is a failure.
    const u=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'||u.pathname.startsWith('/api/')){res.writeHead(404);res.end();return;}
    let relative=decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if(relative===''||relative==='workspace'||relative===`r/${PUBLIC}`)relative='index.html';
    const target=path.resolve(dist,relative);
    if(!target.startsWith(dist+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
    const real=fs.realpathSync(target);if(!real.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);
  });
  async function layout(page,name,width){
    await page.evaluate(()=>document.fonts.ready);
    const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert.equal(geometry.overflow,false,name+' horizontal overflow');
    await page.addScriptTag({content:axe});
    const result=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {passes:r.passes.length,violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,data:Object.fromEntries(Object.entries(c.data||{}).filter(([k])=>['fgColor','bgColor','contrastRatio','expectedContrastRatio','fontSize','fontWeight'].includes(k)))}))}))}))};});
    report.layouts.push({name,width,...geometry,...result});
    await page.screenshot({path:path.join(evidence,'screenshots',name+'.png'),fullPage:true});
    assert.ok(result.passes>0,'axe actually executed');assert.deepEqual(result.violations,[],name+' axe violations');
  }
  async function visibleFocus(page,name,width){
    const result=await page.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {tag:el.tagName,focusVisible:el.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth};});
    report.keyboardFocus.push({name,width,...result});assert.equal(result.focusVisible,true);assert.notEqual(result.outlineStyle,'none');assert.ok(parseFloat(result.outlineWidth)>0);
  }
  // Wrap only locator calls for diagnostics. Forward arguments and results unchanged;
  // no retry, fallback selector, forced action or assertion suppression.
  const locatorFactories=new Set(['locator','getByRole','getByLabel','getByText','filter','first','last','nth']);
  const locatorActions=new Set(['click','fill','selectOption','check','focus','waitFor','count','inputValue','getAttribute','isChecked','isDisabled','evaluate']);
  function trackedLocator(locator){return new Proxy(locator,{get(target,key){
    const value=Reflect.get(target,key);if(typeof value!=='function')return value;
    return (...args)=>{
      if(locatorActions.has(key))selector={operation:String(key),locator:target.toString().slice(0,600)};
      const result=value.apply(target,args);return locatorFactories.has(key)?trackedLocator(result):result;
    };
  }});}
  function trackedPage(page){return new Proxy(page,{get(target,key){
    const value=Reflect.get(target,key);if(typeof value!=='function')return value;
    return (...args)=>{const result=value.apply(target,args);return locatorFactories.has(key)?trackedLocator(result):result;};
  }});}
  async function scene(width,{media=false}={}){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
    const state={requests:[],finals:[],exports:0,downloads:0,overviewMode:'ok',reportMode:'ok',overviewGate:null,reportGate:null,imageGate:media?deferred():null};
    // HTTP has no secure-context randomUUID. Supply only the standards-equivalent
    // ID primitive, not secure-context grants, permissions, app state or handlers.
    await context.addInitScript(()=>{if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}});});
    const page=trackedPage(await context.newPage());activePage=page;page.setDefaultTimeout(10000);
    page.on('pageerror',()=>report.pageErrors.push({phase,code:'PAGE_ERROR'}));
    await context.route('**/*',async route=>{
      const request=route.request(),u=new URL(request.url()),key=request.method()+' '+u.pathname+u.search;
      const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,data,message:status===200?'ok':'合成受控失败'})});
      try{
        assert.equal(u.origin,origin,'outside allowed synthetic origin');
        if(!u.pathname.startsWith('/api/')){
          assert.equal(request.method(),'GET');
          if(u.pathname==='/synthetic-video.webm'){assert.ok(videoBytes);return route.fulfill({contentType:'video/webm',body:videoBytes});}
          // Browser origin is the product selector only. Every resource is fetched
          // explicitly from loopback; never continue a request to a real domain.
          const local=await fetch(`http://127.0.0.1:${server.address().port}${u.pathname}${u.search}`,{redirect:'error'});
          assert.equal(local.status,200,'missing production asset');
          return route.fulfill({status:200,headers:{'content-type':local.headers.get('content-type')},body:Buffer.from(await local.arrayBuffer())});
        }
        state.requests.push({method:request.method(),path:u.pathname,status:'handled'});
        const body=request.postData()?request.postDataJSON():undefined;
        if(request.method()==='GET')assert.equal(body,undefined);
        if(key==='GET /api/survey/auth/me')return json({id:'synthetic-researcher',username:'合成研究者',mustChangePassword:false});
        if(key==='GET /api/survey/auth/capabilities')return json({analytics:true,publication:true});
        if(key==='GET /api/survey/auth/csrf')return json({csrfToken:'synthetic-csrf'});
        if(key==='POST /api/survey/auth/mfa/step-up'){assert.deepEqual(body,{code:'123456'});return json({verified:true});}
        if(key==='GET /api/survey/projects?page=1')return json({list:[project,project2]});
        if(key==='GET '+ROOT)return json(project);
        if(key==='GET '+ROOT+'/instruments?page=1')return json({list:[form]});
        if(key==='GET '+ROOT+'/instruments/tool1')return json(form);
        if(key==='GET '+ROOT+'/catalog?page=1')return json({list:grants});
        if(key==='GET '+ROOT+'/waves?page=1')return json({list:[wave]});
        if(key==='GET '+ROOT+'/waves/wave')return json(wave);
        if(key==='GET '+ROOT+'/assets')return json({assets:[]});
        if(key==='GET '+ROOT+'/report-drafts/measurements'){
          if(state.reportGate)await state.reportGate.promise;
          return json(state.reportMode==='error'?null:[],state.reportMode==='error'?503:200);
        }
        if(key==='GET '+ROOT+'/report-drafts?page=1')return json([]);
        if(key==='GET '+ROOT+'/analytics/overview'){
          if(state.overviewGate)await state.overviewGate.promise;
          return json(state.overviewMode==='error'?null:{projectId:'p1',collectionMode:'SINGLE_UNLINKED',waves:[]},state.overviewMode==='error'?503:200);
        }
        if(key==='GET '+ROOT+'/analytics/quality/attempts?page=1')return json({list:[]});
        if(key==='POST '+ROOT+'/exports'){
          assert.deepEqual(body,{format:'RAW_LONG',includeFreeText:false});state.exports++;
          return json({id:'ticket',format:'RAW_LONG',status:'READY',expiresAt:new Date(Date.now()+600000).toISOString(),pageNumber:1,nextCursor:null,manifest:{rowCount:1,columnCount:2,sourceProjectRevision:1,sourceCutOff:new Date().toISOString()}});
        }
        if(key==='GET '+ROOT+'/exports/ticket/download'){state.downloads++;return json({id:'ticket',format:'RAW_LONG',csv:'item,value\nsynthetic,1\n',codebook:{variables:[]},manifest:{rowCount:1,columnCount:2}});}
        if(key===`GET /api/public/survey/r/${PUBLIC}/info`)return json({project:{name:'合成参与者研究',description:'仅供界面验收',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE'},waves:[]});
        if(key==='POST '+ATTEMPT_ROOT+'/task'){assert.deepEqual(body,{accessCredential:CREDENTIAL});return json(task(media));}
        if(key==='POST '+ATTEMPT_ROOT+'/images/synthetic-image'){
          assert.deepEqual(body,{accessCredential:CREDENTIAL});await state.imageGate.promise;
          return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEl8AAAAASUVORK5CYII=','base64')});
        }
        if(key==='POST '+ATTEMPT_ROOT+'/scale-media/scale/q2/video-capabilities'){
          assert.deepEqual(body,{accessCredential:CREDENTIAL});return json({videoUrl:origin+'/synthetic-video.webm'});
        }
        if(key==='POST '+ATTEMPT_ROOT+'/final'){
          assert.equal(body.accessCredential,CREDENTIAL);assert.match(body.submissionId,/^[a-f0-9-]{36}$/i);
          assert.deepEqual(Object.keys(body).sort(),['accessCredential','answers','itemTimings','submissionId']);
          assert.deepEqual(body.answers,{scale:{q1:'no',q2:'yes',q3:'yes'}});
          state.finals.push(body);return json(null,503);
        }
        throw Error('UNKNOWN_CONTRACT');
      }catch{
        report.networkFailures.push({phase,method:request.method(),path:u.origin===origin?u.pathname:'[external blocked]',code:'UNEXPECTED_REQUEST_OR_CONTRACT'});
        return route.abort('blockedbyclient');
      }
    });
    return {page,state,context,close:async()=>{assert.deepEqual(report.networkFailures,[]);assert.deepEqual(report.pageErrors,[]);await context.close();}};
  }
  const click=(page,name)=>{selector={role:'button',name};return page.getByRole('button',{name,exact:true}).click();};
  const tab=(page,name)=>{selector={role:'tab',name};return page.getByRole('tab',{name,exact:true}).click();};
  async function openResearch(v){await v.page.goto(origin+'/workspace');await v.page.getByRole('button',{name:'查看/编辑',exact:true}).first().click();await v.page.getByRole('tab',{name:'研究设置',exact:true}).waitFor();await tab(v.page,'发布与采集');await v.page.getByText('整体研究状态：',{exact:false}).waitFor();await tab(v.page,'研究设置');}
  async function openParticipant(v){
    await v.context.addInitScript(({id,attempt,credential})=>sessionStorage.setItem('huisurvey:v1:single:'+id,JSON.stringify({attemptId:attempt,accessCredential:credential,createdAt:Date.now()})),{id:PUBLIC,attempt:ATTEMPT,credential:CREDENTIAL});
    await v.page.goto(origin+`/r/${PUBLIC}`);await click(v.page,'恢复本次作答／查看已完成回执');await v.page.locator('#survey-answer-scale-q1').waitFor();
  }
  async function check(name,fn){phase=name;await fn();report.checks.push({name,status:'passed'});}
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    origin=`http://survey.eduk12.top:${server.address().port}`;
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--host-resolver-rules=MAP survey.eduk12.top 127.0.0.1']});
    report.browserVersion=browser.version();report.originTransport='HTTP loopback; every resource fulfilled; no production traffic';report.randomUUID='HTTP-only standards polyfill using native getRandomValues';
    for(const width of [1440,390])await check('researcher-'+width,async()=>{
      const v=await scene(width),p=v.page;await openResearch(v);
      const title=p.getByLabel('研究名称',{exact:true});await title.fill('未保存的研究名称');
      let dismissed=0;p.on('dialog',async d=>{assert.equal(d.type(),'confirm');dismissed++;await d.dismiss();});
      await p.getByRole('button',{name:'查看/编辑',exact:true}).nth(1).click();assert.equal(dismissed,1);assert.equal(await title.inputValue(),'未保存的研究名称');
      assert.equal(v.state.requests.some(r=>r.path.includes('/p2')),false,'cancel must not load another project');
      await tab(p,'研究工具');await p.getByRole('button',{name:/合成研究表单/}).click();
      const filter=p.getByLabel('筛选当前页授权工具');await filter.fill('学习');await p.getByText('当前页显示 1 / 2 项；仅筛选已加载的本页，不搜索其他页。',{exact:true}).waitFor();
      assert.equal(await p.getByRole('button',{name:'导入此版本：心理健康',exact:true}).count(),0);
      const source=p.locator('summary').filter({hasText:'查看来源与使用限制：学习动机'});await source.click();await p.getByLabel('原版工具来源').waitFor();
      const summary=p.locator('summary').filter({hasText:'属性与题目导航（可收起）'});await summary.focus();await p.keyboard.press('Enter');assert.equal(await summary.locator('..').getAttribute('open'),null);await p.keyboard.press('Enter');
      const link=p.locator('aside[aria-label="研究工具属性与题目导航"] a[href="#survey-form-question"]');await link.click();assert.ok((await p.evaluate(()=>location.hash)).endsWith('survey-form-question'));
      await layout(p,'researcher-tools-'+width,width);
      const tools=p.getByRole('tab',{name:'研究工具',exact:true});await tools.focus();await p.keyboard.press('ArrowRight');await eventually(()=>p.getByRole('tab',{name:'私有报告',exact:true}).evaluate(el=>el===document.activeElement),'tab focus');await visibleFocus(p,'researcher-tabs',width);
      await tab(p,'研究设置');assert.equal(await title.inputValue(),'未保存的研究名称');
      await tab(p,'发布与采集');await p.getByRole('heading',{name:'当前阶段：尚未保存草稿',exact:true}).waitFor();await p.getByRole('button',{name:/T1 · 合成草稿波次/}).click();await p.getByRole('heading',{name:'当前阶段：草稿，尚未冻结',exact:true}).waitFor();
      await p.getByText('请先运行检查，通过后才能冻结。',{exact:true}).waitFor();
      await tab(p,'研究数据');await p.getByText('本项目暂无研究波次。请先在发布入口创建并保存波次。',{exact:true}).waitFor();
      const exportPanel=p.getByRole('heading',{name:'匿名科研数据导出',exact:true}).locator('..');const format=exportPanel.getByLabel(/^数据格式/);assert.equal(await format.count(),1,'one label-associated export format');await format.selectOption('RAW_LONG');assert.equal(await format.inputValue(),'RAW_LONG');
      assert.equal(v.state.exports,0);await exportPanel.getByLabel('最新 TOTP 动态验证码').fill('123456');await click(p,'完成五分钟内二次认证');await click(p,'创建受控导出');await p.getByRole('region',{name:'当前导出批次'}).waitFor();assert.equal(v.state.exports,1);assert.equal(v.state.downloads,0);
      const download=p.waitForEvent('download');await click(p,'下载 CSV');const file=await download;assert.equal(await file.failure(),null);await p.getByText('CSV：已发起，请核对保存',{exact:true}).waitFor();assert.equal(v.state.downloads,1);assert.equal(v.state.exports,1);
      await layout(p,'researcher-data-'+width,width);await v.close();
    });
    await check('loading-error-empty',async()=>{
      const v=await scene(1440),p=v.page;v.state.overviewGate=deferred();v.state.overviewMode='error';await openResearch(v);await tab(p,'研究数据');await p.getByText('正在加载完成进度…',{exact:true}).waitFor();assert.equal(await p.getByText('本项目暂无研究波次。请先在发布入口创建并保存波次。',{exact:true}).count(),0);
      v.state.overviewGate.resolve();await p.getByRole('alert').filter({hasText:'完成进度加载失败'}).waitFor();v.state.overviewGate=null;v.state.overviewMode='ok';await click(p,'刷新完成进度');await p.getByText('本项目暂无研究波次。请先在发布入口创建并保存波次。',{exact:true}).waitFor();
      v.state.reportGate=deferred();v.state.reportMode='error';await tab(p,'私有报告');await p.getByText('正在加载测量版本与报告，请稍候…',{exact:true}).waitFor();assert.equal(await p.getByText('暂无报告草稿',{exact:true}).count(),0);v.state.reportGate.resolve();await p.getByRole('region',{name:'项目私有报告'}).getByRole('alert').waitFor();
      v.state.reportGate=null;v.state.reportMode='ok';await click(p,'刷新报告与测量列表');await p.getByText('暂无报告草稿',{exact:true}).waitFor();await v.close();
    });
    for(const width of [1440,390])await check('participant-'+width,async()=>{
      const v=await scene(width),p=v.page;await openParticipant(v);
      await click(p,'提交本轮正式回答');await eventually(()=>p.locator('#survey-answer-scale-q1').evaluate(el=>el===document.activeElement),'missing required answer focused');assert.equal(v.state.finals.length,0);
      const first=p.getByRole('radio',{name:'同意',exact:true});await first.focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#survey-answer-scale-q1').count(),1);assert.equal(await p.getByRole('radio',{name:'不同意',exact:true}).isChecked(),true);
      await click(p,'下一题');await p.getByRole('radio',{name:'同意',exact:true}).focus();await p.keyboard.down('Space');await p.keyboard.up('Space');await p.locator('#survey-answer-scale-q3').waitFor();
      assert.equal(await p.locator('#survey-answer-scale-q3').evaluate(el=>el===document.activeElement),true,'focus follows auto-advance');await visibleFocus(p,'participant-auto-next',width);await p.keyboard.down('Space');await p.keyboard.down('Space');await p.keyboard.up('Space');assert.equal(await p.locator('input[type=radio]:checked').count(),0,'held Space must not answer next item');
      await p.getByRole('radio',{name:'同意',exact:true}).check();assert.equal(await p.locator('#survey-answer-scale-q3').count(),1);assert.equal(await p.getByRole('button',{name:'下一题',exact:true}).isDisabled(),true);
      await layout(p,'participant-'+width,width);await click(p,'提交本轮正式回答');await p.getByRole('button',{name:'重试原提交',exact:true}).waitFor();assert.equal(v.state.finals.length,1);assert.equal(await p.getByRole('radio',{name:'同意',exact:true}).isDisabled(),true);
      await click(p,'重试原提交');await eventually(()=>Promise.resolve(v.state.finals.length===2),'retry reaches synthetic API');assert.deepEqual(v.state.finals[1],v.state.finals[0],'whole sealed body including submissionId retained');await p.getByRole('button',{name:'重试原提交',exact:true}).waitFor();await v.close();
    });
    await check('participant-media',async()=>{
      // Generate a small local silent video with actual browser codecs. No camera,
      // microphone, external media, software install or fake media events.
      const fixture=await browser.newContext();const fp=await fixture.newPage();
      videoBytes=Buffer.from(await fp.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(10),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();let n=0;const timer=setInterval(()=>{ctx.fillStyle=`rgb(20,60,${100+n++})`;ctx.fillRect(0,0,32,32);},50);await new Promise(r=>setTimeout(r,1500));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));}));await fixture.close();assert.ok(videoBytes.length>100);
      const v=await scene(390,{media:true}),p=v.page;await openParticipant(v);assert.equal(await p.getByRole('radio',{name:'同意',exact:true}).isDisabled(),true);assert.equal(await p.getByRole('button',{name:'下一题',exact:true}).isDisabled(),true);
      v.state.imageGate.resolve();await eventually(async()=>!(await p.getByRole('radio',{name:'同意',exact:true}).isDisabled()),'actual image load enables answers');await p.getByRole('radio',{name:'同意',exact:true}).check();await p.locator('#survey-answer-scale-q2').waitFor();
      await p.getByRole('radio',{name:'同意',exact:true}).check();assert.equal(await p.locator('#survey-answer-scale-q2').count(),1,'incomplete video suppresses automatic next');
      await click(p,'播放视频');await p.getByText('视频已完整观看。',{exact:true}).waitFor();assert.equal(await p.locator('#survey-answer-scale-q2').count(),1,'video completion alone does not advance');
      await layout(p,'participant-media-390',390);await click(p,'下一题');await p.locator('#survey-answer-scale-q3').waitFor();await v.close();
    });
    assert.deepEqual(report.checks.map(x=>x.name),REQUIRED);report.status='passed';
  }catch(error){report.status='failed';report.failure={phase,selector,name:error.name,code:error.code||'ASSERTION_OR_BROWSER_FAILURE'};if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(evidence,'screenshots','failure.png'),fullPage:true}).catch(()=>{});throw error;
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(evidence,'browser.json'),JSON.stringify(report,null,2)+'\n');
  }
}
module.exports={REQUIRED,task};
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({status:'failed',name:error.name,code:error.code||'BROWSER_CHECK_FAILED'}));process.exitCode=1;});
