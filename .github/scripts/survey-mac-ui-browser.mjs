// Synthetic frontend contracts against the one production runtime. WebKit is
// explicitly not native Safari. No API authority, scoring or real data claims.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {chromium,webkit} from '../release-tools/node_modules/playwright-core/index.mjs';
import {recheckSurveyMac} from './survey-mac-ui-scope.mjs';

assert.equal(process.env.GITHUB_ACTIONS,'true','Qualification is Actions-only after tools review');
const p=recheckSurveyMac(JSON.parse(process.env.PLAN));
const build=JSON.parse(readFileSync('survey-mac-ui-evidence/build.json','utf8'));
for(const key of ['head','sourceHead','tree','frontendTree','inputs'])assert.deepEqual(build[key],p[key]);
assert.equal(build.status,'success');
const engine=process.env.ENGINE;assert.ok(['chromium','webkit'].includes(engine));
const E='survey-mac-ui-evidence',tag=build.images.runtime.tag;
const docker=(...a)=>execFileSync('docker',a,{encoding:'utf8'}).trim();
assert.equal(docker('image','inspect','--format','{{.Id}}',tag),build.images.runtime.id);
const tls=mkdtempSync(tmpdir()+'/survey-mac-ui-'),container='survey-mac-ui-'+p.head.slice(0,12);
const survey='https://survey.eduk12.top',admin='https://training.eduk12.top';
const id='abcdef01-1111-4111-8111-111111111111',waveId='11111111-2222-4333-8444-555555555555';
const publicId='22222222-2222-4222-8222-222222222222',attemptId='33333333-3333-4333-8333-333333333333';
const prefix='/api/survey/projects/'+id;
const records=[],unknown=[],contexts=[];let browser,lastPage,lastState,lastLayout;
const axe=readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8');
mkdirSync(E+'/screenshots',{recursive:true});
const wave={id:waveId,projectId:id,title:'合成波次',ordinal:1,status:'OPEN',revision:7,instrumentIds:[],consentText:'仅供界面测试的合成知情同意。',generalText:'谢谢',consentVersion:1,allowNewParticipants:true,opensAt:null,closesAt:null};
const project={id,title:'合成研究',description:'合成测试，不含真实被试',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:7};
const form={id:'form',projectId:id,title:'合成表单',kind:'FORM',instrumentKey:'ci_form',revision:1,status:'DRAFT',definition:{schemaVersion:2,pages:[{pageKey:'main',title:'第一页',questions:[]}]},updatedAt:'2032-01-01T00:00:00Z'};
const csv='"trial","value"\r\n"1","合成数据"\r\n';
const emptyBody=(method,body)=>{assert.equal(method,'GET');assert.equal(body,undefined);};

async function scene(mode,width=1440,{recovery=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',ignoreHTTPSErrors:true,acceptDownloads:true});
 contexts.push(ctx);const page=await ctx.newPage();lastPage=page;
 if(recovery)await page.clock.install({time:new Date('2032-01-02T03:04:04.000Z')});
 page.setDefaultTimeout(12000);
 const s={calls:[],errors:[],posts:[],reads:[],downloads:[],events:[],onPostRegistered:null,tickets:new Map(),serial:0,readMode:null,postMode:null,delay:null,cutoff:'2031-12-31T23:59:59.000Z',revision:7};lastState=s;
 page.on('request',r=>{if(r.method()==='POST'&&r.url()===survey+prefix+'/exports')s.events.push({event:'export-request',index:s.events.filter(e=>e.event==='export-request').length+1});});
 page.on('pageerror',e=>s.errors.push(e.message));
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  let body;try{body=req.postData()?req.postDataJSON():undefined;}catch{body='NON_JSON';}
  const key=method+' '+u.pathname+u.search;
  const response=(data,status=200,headers={})=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,data,message:status===403?'需要最近五分钟的 TOTP 二次验证':status===200?'ok':'合成受控失败'})});
  try{
   assert.ok([survey,admin].includes(u.origin),'external request '+u.origin);
   if(u.pathname==='/survey-ci-axe.js'){emptyBody(method,body);return route.fulfill({contentType:'application/javascript',body:axe});}
   if(!u.pathname.startsWith('/api/'))return route.continue();
   s.calls.push({key,body});
   if(key==='GET /api/survey/auth/me'){emptyBody(method,body);return response(mode==='researcher'?{id:'synthetic-researcher',username:'合成研究者',mustChangePassword:false}:null,mode==='researcher'?200:401);}
   if(key==='GET /api/survey/auth/capabilities'){emptyBody(method,body);return response({analytics:true,publication:true});}
   if(key==='GET /api/survey/auth/csrf'){emptyBody(method,body);return response({csrfToken:'synthetic-csrf'});}
   if(key==='POST /api/survey/auth/mfa/step-up'){assert.deepEqual(body,{code:'123456'});return response({verified:true});}
   if(key==='GET /api/survey/projects?page=1'){emptyBody(method,body);return response({list:[project]});}
   if(key==='GET '+prefix){emptyBody(method,body);return response(project);}
   if(key==='GET '+prefix+'/instruments?page=1'){emptyBody(method,body);return response({list:[form]});}
   if(key==='GET '+prefix+'/catalog?page=1'){emptyBody(method,body);return response({list:[]});}
   if(key==='GET '+prefix+'/waves?page=1'){emptyBody(method,body);return response({list:[wave]});}
   if(key==='GET '+prefix+'/instruments/form'){emptyBody(method,body);return response(form);}
   if(key==='GET '+prefix+'/analytics/overview'){emptyBody(method,body);return response({projectId:id,collectionMode:'SINGLE_UNLINKED',source:'合成界面 DTO',note:'UI only',waves:[{...wave,starts:2,finalCompleted:2,analysisIncluded:2,qualityExcluded:0,uniqueLinkedCodes:null,excluded:0}]});}
   if(key==='GET '+prefix+'/analytics/quality/attempts?page=1'){emptyBody(method,body);return response({list:[]});}
   if(key==='POST '+prefix+'/exports'){
    const allowed=['format','waveId','completedFrom','completedBefore','cursor'];
    assert.ok(body&&Object.keys(body).every(k=>allowed.includes(k)));assert.equal(body.format,'COGNITIVE_TRIAL_LONG');assert.equal(body.waveId,waveId);
    if(body.cursor)assert.match(body.cursor,/^synthetic-incoming-[2-9]$/);
    if(body.completedFrom)assert.equal(body.completedFrom,'2031-06-01T09:00:00.000Z');
    s.posts.push(structuredClone(body));
    s.events.push({event:'export-post-registered',count:s.posts.length});s.onPostRegistered?.(s.posts.length);
    if(s.delay)await s.delay;
    if(s.postMode)return response(null,s.postMode);
    const pageNumber=body.cursor?Number(body.cursor.split('-').at(-1)):1;
    const now=await page.evaluate(()=>Date.now());
    if(!body.cursor)s.cutoff=new Date(now-1000).toISOString();
    const ticket={id:'synthetic-ticket-'+(++s.serial),format:body.format,status:'READY',expiresAt:new Date(now+600000).toISOString(),pageNumber,nextCursor:'synthetic-incoming-'+(pageNumber+1),
     manifest:{rowCount:1,columnCount:2,sourceCutOff:s.cutoff,sourceProjectRevision:s.revision,generatedAt:new Date(now).toISOString(),batch:{phase:'VERIFIED_FINAL',representation:'FINAL_BOUND_CHILD_TRIAL_ROWS'}}};
    s.tickets.set(ticket.id,ticket);return response(ticket);
   }
   if(method==='GET'&&u.search===''&&u.pathname.startsWith(prefix+'/exports/')&&u.pathname.endsWith('/download')){
    emptyBody(method,body);const ticket=s.tickets.get(u.pathname.split('/').at(-2));assert.ok(ticket,'unknown ticket');s.reads.push(ticket.id);
    if(s.readMode){const r=s.readMode;if(r.raw)return route.fulfill({status:r.status,headers:r.headers||{},contentType:'text/html',body:'<html>synthetic non-JSON failure</html>'});return response(null,r.status,r.headers);}
    return response({id:ticket.id,format:ticket.format,csv,codebook:{variables:[{key:'trial'},{key:'value'}]},manifest:ticket.manifest});
   }
   if(key==='GET /api/auth/me'){emptyBody(method,body);return response({id:1,username:'synthetic-admin',name:'合成管理员',role:'ADMIN',mustChangePassword:false});}
   if(key==='GET /api/capabilities'){emptyBody(method,body);return response({cognitive:true,parentPortal:false});}
   if(key==='GET /api/platform/survey/researchers?page=1'){emptyBody(method,body);return response({list:[{id:'r1',username:'合成研究者',status:'ACTIVE',createdAt:'2032-01-01T00:00:00Z'}]});}
   if(key==='GET /api/platform/survey/researcher-invitations?page=1'){emptyBody(method,body);return response({list:[]});}
   if(key==='GET /api/platform/survey/source-catalog?kind=SCALE&page=1'){emptyBody(method,body);return response({list:[],page:1,hasMore:false,terminalReason:'END_OF_CATALOG'});}
   if(key==='GET /api/public/survey/r/'+publicId+'/info'){
    emptyBody(method,body);return response({project:{name:'合成参与者页面',description:'仅供界面测试',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE'},waves:[wave]});
   }
   if(key==='POST /api/public/survey/r/'+publicId+'/attempts/'+attemptId+'/task'){
    assert.deepEqual(body,{accessCredential:'x'.repeat(43)});
    return response({attemptId,waveId,status:'STARTED',definitionDigest:'a'.repeat(64),reportMode:'GENERAL_ONLY',units:[{kind:'FORM',instrumentKey:'ci_form',title:'合成参与者表单',pages:[{pageKey:'main',title:'第一页',questions:[{itemKey:'q1',type:'SINGLE',prompt:'合成必答题',required:true,options:[{optionKey:'yes',label:'同意'},{optionKey:'no',label:'不同意'}]}]}]}]});
   }
   throw Error('Unknown DTO '+key);
  }catch(error){unknown.push({key,error:String(error)});return response(null,500);}
 });
 const close=async()=>{assert.deepEqual(s.errors,[]);assert.deepEqual(unknown,[]);await ctx.close();};
 return {ctx,page,s,close};
}
async function checkLayout(page,name,width){
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');
 await page.addScriptTag({url:new URL('/survey-ci-axe.js',page.url()).href});
 const result=await page.evaluate(async()=>{
  const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
  const check=c=>({id:c.id,impact:c.impact,message:c.message,data:Object.fromEntries(Object.entries(c.data??{}).filter(([key])=>['fgColor','bgColor','contrastRatio','expectedContrastRatio','fontSize','fontWeight','messageKey'].includes(key))),relatedNodes:(c.relatedNodes??[]).map(n=>({target:n.target}))});
  return{passes:r.passes.length,violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,impact:n.impact,failureSummary:n.failureSummary,any:n.any.map(check),all:n.all.map(check),none:n.none.map(check)}))}))};
 });
 const computed=await page.evaluate(violations=>violations.flatMap(v=>v.nodes.map(n=>{
  const el=typeof n.target[0]==='string'?document.querySelector(n.target[0]):null;if(!el)return{target:n.target,unresolved:true};
  const s=getComputedStyle(el),ancestors=[];for(let p=el;p;p=p.parentElement){const a=getComputedStyle(p);ancestors.push({tag:p.tagName,color:a.color,backgroundColor:a.backgroundColor,backgroundImage:a.backgroundImage,opacity:a.opacity});}
  return{target:n.target,color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,hover:el.matches(':hover'),focusVisible:el.matches(':focus-visible'),focused:document.activeElement===el,ancestors};
 })),result.violations);
 lastLayout={name,width,wcag:result,computed};
 await page.screenshot({path:`${E}/screenshots/${engine}-${name}-${width}.png`,fullPage:false});
 assert.ok(result.passes>0);assert.deepEqual(result.violations,[],name+' WCAG');
 records.push({name,width,wcag:result});
}
async function openResearch(width=1440,{recovery=false}={}){
 const v=await scene('researcher',width,{recovery});await v.page.goto(survey+'/workspace');
 await v.page.getByRole('button',{name:'查看/编辑',exact:true}).click();
 await v.page.getByRole('tab',{name:'研究数据',exact:true}).click();
 const exportPanel=v.page.getByRole('heading',{name:'匿名科研数据导出',exact:true}).locator('..');
 await exportPanel.waitFor({state:'visible'});
 assert.equal(await exportPanel.count(),1,'one heading-identified export panel');
 assert.equal(await exportPanel.getByLabel(/^波次/).count(),1,'one export wave selector');
 assert.equal(await exportPanel.getByLabel(/^数据格式/).count(),1,'one export format selector');
 await exportPanel.getByLabel(/^数据格式/).selectOption('COGNITIVE_TRIAL_LONG');
 await exportPanel.getByLabel(/^波次/).selectOption(waveId);
 assert.equal(await exportPanel.getByLabel(/^数据格式/).inputValue(),'COGNITIVE_TRIAL_LONG');
 assert.equal(await exportPanel.getByLabel(/^波次/).inputValue(),waveId);
 return v;
}
async function openRecovery(){
 const v=await openResearch(1440,{recovery:true});
 const now=await v.page.evaluate(()=>Date.now());
 await v.page.clock.pauseAt(new Date(Math.ceil((now+1000)/1000)*1000));
 return v;
}
const click=(page,name)=>page.getByRole('button',{name,exact:true}).click();
async function download(v,name){
 const pending=v.page.waitForEvent('download');await click(v.page,'下载 '+name);const file=await pending;
 const stream=await file.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);
 const bytes=Buffer.concat(chunks);assert.ok(bytes.length>0);assert.equal(await file.failure(),null);
 assert.ok(file.suggestedFilename().endsWith(name==='CSV'?'.csv':'_'+name.toLowerCase()+'.json'));
 const text=bytes.toString('utf8').replace(/^\uFEFF/,'');
 if(name==='CSV'){assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');assert.equal(text,csv);}
 else if(name==='Codebook')assert.deepEqual(JSON.parse(text),{variables:[{key:'trial'},{key:'value'}]});
 else {const manifest=JSON.parse(text);assert.equal(manifest.rowCount,1);assert.equal(manifest.columnCount,2);assert.equal(manifest.sourceProjectRevision,7);}
 v.s.downloads.push({name,filename:file.suggestedFilename(),bytes:bytes.length});
}
async function secondPage(){
 const v=await openRecovery();await v.page.getByLabel('完成时间起点（含）').fill('2031-06-01T09:00');
 await click(v.page,'创建受控导出');for(const n of ['CSV','Codebook','Manifest'])await download(v,n);
 await click(v.page,'生成下一批（请先核对本批文件）');
 await v.page.getByText(/第 2 批 ·/).waitFor();assert.equal(v.s.posts.length,2);return v;
}
const counts=v=>({posts:v.s.posts.length,reads:v.s.reads.length,downloads:v.s.downloads.length});
async function noAutomatic(v,ms){const before=counts(v);await v.page.clock.fastForward(ms);assert.deepEqual(counts(v),before);}
function saveContract(v,name){assert.deepEqual(v.s.errors,[]);assert.deepEqual(unknown,[]);records.push({name,requests:v.s.calls,counts:counts(v),downloads:v.s.downloads,events:v.s.events});}

try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=survey.eduk12.top','-addext','subjectAltName=DNS:survey.eduk12.top,DNS:training.eduk12.top','-keyout',tls+'/key.pem','-out',tls+'/cert.pem'],{stdio:'pipe'});
 writeFileSync(tls+'/nginx.conf',readFileSync('server-version/frontend/nginx.conf','utf8').replace('listen 80;','listen 80;\n    listen 443 ssl;\n    ssl_certificate /ci-tls/cert.pem;\n    ssl_certificate_key /ci-tls/key.pem;'));
 docker('run','-d','--name',container,'-p','127.0.0.1:443:443','-v',tls+':/ci-tls:ro','-v',tls+'/nginx.conf:/etc/nginx/conf.d/default.conf:ro',tag);
 browser=await ({chromium,webkit}[engine]).launch({headless:true});
 if(engine==='chromium')for(const width of [390,768,1440]){
  let v=await scene('public',width);await v.page.goto(survey+'/');await v.page.getByRole('heading',{level:1,name:/^风过有迹，\s*细微可察。$/}).waitFor();
  await v.page.keyboard.press('Tab');assert.equal(await v.page.evaluate(()=>document.activeElement.textContent),'跳至主要内容');
  assert.notEqual(await v.page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');await checkLayout(v.page,'public',width);
  for(const path of ['/login','/reset-password','/claim']){await v.page.goto(survey+path);await v.page.getByLabel('密码',{exact:false}).first().waitFor();await checkLayout(v.page,path.slice(1),width);}
  await v.close();
  v=await openResearch(width);await checkLayout(v.page,'researcher-data',width);
  await v.page.getByRole('tab',{name:'研究设置',exact:true}).click();const title=v.page.getByLabel('研究名称',{exact:true});
  await title.fill('保留的合成编辑');const calls=v.s.calls.length;
  await v.page.getByRole('tab',{name:'研究工具',exact:true}).click();await checkLayout(v.page,'researcher-tools',width);
  await v.page.getByRole('tab',{name:'研究设置',exact:true}).click();assert.equal(await title.inputValue(),'保留的合成编辑');assert.equal(v.s.calls.length,calls);
  const tab=v.page.getByRole('tab',{name:'研究设置',exact:true});await tab.focus();await v.page.keyboard.press('ArrowRight');assert.equal(await v.page.getByRole('tab',{name:'研究工具',exact:true}).getAttribute('aria-selected'),'true');await v.close();
  v=await scene('admin',width);await v.page.goto(admin+'/admin/survey-researchers');await v.page.getByRole('heading',{name:'合成研究者',exact:true}).waitFor();
  await checkLayout(v.page,'admin-researchers',width);const pass=v.page.getByLabel('当前管理员密码（敏感操作再次验证）');await pass.fill('synthetic-not-a-credential');const n=v.s.calls.length;
  await v.page.getByRole('tab',{name:/^邀请 /}).click();await checkLayout(v.page,'admin-invitations',width);assert.equal(await pass.inputValue(),'synthetic-not-a-credential');assert.equal(v.s.calls.length,n);await v.close();
  v=await scene('participant',width);await v.ctx.addInitScript(({publicId,attemptId})=>sessionStorage.setItem('huisurvey:v1:single:'+publicId,JSON.stringify({attemptId,accessCredential:'x'.repeat(43),createdAt:Date.now()})),{publicId,attemptId});
  await v.page.goto(survey+'/r/'+publicId);await v.page.getByRole('button',{name:/恢复本次作答/}).click();await v.page.getByRole('radio',{name:'同意',exact:true}).check();await checkLayout(v.page,'participant',width);await v.page.reload();await v.page.getByRole('button',{name:/恢复本次作答/}).click();assert.equal(await v.page.getByRole('radio',{name:'同意',exact:true}).isChecked(),true);await v.close();
 }
 // Both engines exercise each targeted recovery contract with explicit DTOs.
 {
  const v=await secondPage();await download(v,'CSV');v.s.readMode={status:429,headers:{'Retry-After':'900'}};
  await click(v.page,'下载 Codebook');await v.page.getByText(/剩余 900 秒/).waitFor();await noAutomatic(v,900001);v.s.readMode=null;
  const original=structuredClone(v.s.posts[1]);await click(v.page,'重新生成当前第 2 批');await v.page.getByText('CSV：尚未发起',{exact:true}).waitFor();assert.deepEqual(v.s.posts.at(-1),original);
  assert.equal(v.s.reads.length,5);for(const n of ['CSV','Codebook','Manifest'])await download(v,n);saveContract(v,'numeric-429-expiry-same-incoming-cursor-frozen-filter');await v.close();
 }
 {
  const v=await openRecovery();await click(v.page,'创建受控导出');const now=await v.page.evaluate(()=>Date.now());v.s.readMode={status:429,raw:true,headers:{'Retry-After':new Date(now+120000).toUTCString()}};
  await click(v.page,'下载 CSV');await v.page.getByText(/剩余 120 秒/).waitFor();await noAutomatic(v,120001);v.s.readMode=null;await download(v,'CSV');saveContract(v,'http-date-non-json-429-explicit-original-retry');await v.close();
 }
 {
  const v=await secondPage();v.s.readMode={status:404};
  const unexpectedDownloads=[];v.page.on('download',file=>{unexpectedDownloads.push(file.suggestedFilename());v.s.events.push({event:'unexpected-mfa-download',filename:file.suggestedFilename()});});
  await click(v.page,'下载 CSV');await v.page.getByRole('button',{name:'重新生成当前第 2 批',exact:true}).waitFor();v.s.readMode=null;v.s.postMode=403;
  await click(v.page,'重新生成当前第 2 批');await v.page.getByText(/需要最近五分钟的 TOTP 二次验证/).first().waitFor();const before=counts(v);
  assert.deepEqual(before,{posts:3,reads:4,downloads:3});
  await v.page.getByLabel('最新 TOTP 动态验证码').fill('123456');
  const stepped=v.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===survey+'/api/survey/auth/mfa/step-up'&&r.status()===200);
  await click(v.page,'完成五分钟内二次认证');const stepResponse=await stepped;await stepResponse.finished();assert.deepEqual((await stepResponse.json()).data,{verified:true});
  v.s.events.push({event:'mfa-success-response',status:stepResponse.status(),...counts(v)});
  await v.page.getByRole('status').filter({hasText:/^已完成最新 TOTP 二次认证；敏感导出仅在接下来的五分钟内有效。$/}).waitFor();
  assert.deepEqual(counts(v),before);assert.equal(unexpectedDownloads.length,0);v.s.events.push({event:'mfa-success-applied-no-automatic-export',unexpectedDownloads:unexpectedDownloads.length,...counts(v)});v.s.postMode=null;
  const original=structuredClone(v.s.posts[1]),registered=new Promise(resolve=>{v.s.onPostRegistered=resolve;});
  const recovered=v.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===survey+prefix+'/exports'&&r.status()===200);
  await click(v.page,'重新生成当前第 2 批');assert.equal(await registered,4);assert.equal(v.s.posts.length,4);assert.deepEqual(v.s.posts[3],original);
  v.s.events.push({event:'mfa-recovery-post-registered',...counts(v)});
  const recoveryResponse=await recovered;await recoveryResponse.finished();const receipt=(await recoveryResponse.json()).data;assert.equal(receipt.pageNumber,2);assert.equal(receipt.status,'READY');
  v.s.events.push({event:'mfa-recovery-200-response',status:recoveryResponse.status(),pageNumber:receipt.pageNumber,...counts(v)});
  await v.page.getByRole('status').filter({hasText:/^已重新生成当前第 2 批。/}).waitFor();
  await v.page.getByRole('button',{name:'重新生成当前第 2 批',exact:true}).waitFor({state:'detached'});
  for(const part of ['CSV','Codebook','Manifest']){const button=v.page.getByRole('button',{name:'下载 '+part,exact:true});await button.waitFor();assert.equal(await button.count(),1);assert.equal(await button.isEnabled(),true);}
  assert.deepEqual(counts(v),{posts:4,reads:4,downloads:3});assert.equal(v.s.events.filter(e=>e.event==='export-request').length,4);assert.equal(unexpectedDownloads.length,0);
  v.s.events.push({event:'mfa-recovery-receipt-applied-no-automatic-download',unexpectedDownloads:unexpectedDownloads.length,...counts(v)});saveContract(v,'expired-ticket-mfa-explicit-recovery');await v.close();
 }
 {
  const v=await secondPage();await noAutomatic(v,600001);v.s.revision=8;await click(v.page,'重新生成当前第 2 批');await v.page.getByText(/重建回执与原批次页号或冻结来源不一致/).first().waitFor();assert.equal(v.s.reads.length,3);saveContract(v,'recovered-revision-rejected');await v.close();
 }
 {
  const v=await openRecovery();await click(v.page,'创建受控导出');await download(v,'CSV');await noAutomatic(v,600001);
  const canceled=v.page.waitForEvent('dialog');const first=click(v.page,'重新开始完整导出（新水位）');const dialog=await canceled;assert.match(dialog.message(),/旧的部分文件不能与新导出混作同一批/);await dialog.dismiss();await first;assert.equal(v.s.posts.length,1);
  const accepted=v.page.waitForEvent('dialog');const second=click(v.page,'重新开始完整导出（新水位）');await (await accepted).accept();await second;await v.page.getByText('CSV：尚未发起',{exact:true}).waitFor();assert.equal(v.s.posts.length,2);assert.equal(v.s.posts.at(-1).cursor,undefined);assert.equal(v.s.reads.length,1);saveContract(v,'first-page-new-watermark-cancel-confirm-no-auto-download');await v.close();
 }
 {
  const v=await secondPage();await noAutomatic(v,600001);let release;v.s.delay=new Promise(r=>release=r);const n=v.s.posts.length;
  const registered=new Promise(resolve=>{v.s.onPostRegistered=resolve;});
  const posted=v.page.waitForRequest(r=>r.method()==='POST'&&r.url()===survey+prefix+'/exports');
  await v.page.getByRole('button',{name:'重新生成当前第 2 批',exact:true}).evaluate(button=>{button.click();button.click();});
  await posted;v.s.events.push({event:'request-wait-resolved',posts:v.s.posts.length});assert.equal(await registered,n+1);assert.equal(v.s.posts.length,n+1);v.s.events.push({event:'registration-wait-resolved',posts:v.s.posts.length});
  await v.page.getByRole('tab',{name:'研究设置',exact:true}).click();await click(v.page,'新建其他项目');
  v.s.events.push({event:'editor-unmounted',posts:v.s.posts.length});
  const completed=v.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===survey+prefix+'/exports');release();await completed;
  v.s.events.push({event:'delayed-response-completed',posts:v.s.posts.length});
  assert.equal(v.s.reads.length,3);assert.equal(v.s.downloads.length,3);assert.equal(await v.page.getByRole('region',{name:'当前导出批次'}).count(),0);assert.equal(v.s.posts.length,n+1);assert.equal(v.s.events.filter(e=>e.event==='export-request').length,n+1);saveContract(v,'duplicate-click-and-unmount-no-late-download');await v.close();
 }
 assert.deepEqual(unknown,[]);assert.ok(records.length>=6);
 writeFileSync(`${E}/browser-${engine}.json`,JSON.stringify({head:p.head,tree:p.tree,frontendTree:p.frontendTree,image:build.images.runtime.id,engine,records,unknown,status:'success',authority:'strict frontend DTO simulation on production runtime; WebKit is not native Safari; backend permission/scoring not revalidated'},null,2));
}catch(error){
 writeFileSync(`${E}/browser-${engine}-failure.json`,JSON.stringify({error:String(error),unknown,records,lastLayout,lastEvents:lastState?.events,lastCounts:lastState?{posts:lastState.posts.length,reads:lastState.reads.length,downloads:lastState.downloads.length}:null,status:'failure'},null,2));
 if(lastPage&&!lastPage.isClosed())await lastPage.screenshot({path:`${E}/screenshots/${engine}-failure.png`}).catch(()=>{});
 throw error;
}finally{
 for(const ctx of contexts)await ctx.close().catch(()=>{});if(browser)await browser.close();
 try{docker('rm','-f',container);}finally{rmSync(tls,{recursive:true,force:true});}
}
