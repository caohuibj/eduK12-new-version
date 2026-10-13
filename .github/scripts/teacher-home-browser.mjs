import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import https from 'node:https';
import assert from 'node:assert/strict';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const plan=JSON.parse(readFileSync('teacher-home-plan.json','utf8'));
const checks=JSON.parse(readFileSync('teacher-home-evidence/checks.json','utf8'));
assert.equal(plan.head,checks.head);assert.deepEqual(plan.components,checks.components);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:4*1024*1024}).trim();
for(const c of plan.changed)assert.equal(docker('image','inspect','--format','{{.Id}}','eduk12-teacher-home-'+c+':'+plan.head),checks.images[c]);
const temp=mkdtempSync(join(tmpdir(),'teacher-home-')),network='teacher-home-'+plan.head.slice(0,12);
const resources=[],records=[],boundaries=[],externalRequests=[];
const base='https://teacher.eduk12.top',axe=readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8');
let browser,lastPage;
mkdirSync('teacher-home-evidence/screenshots',{recursive:true});
const env={
 NODE_ENV:'production',DATABASE_URL:'postgresql://ptool:synthetic-ci-only@postgres:5432/teacher_home_ci_test?schema=public',
 REDIS_URL:'redis://redis:6379',CORS_ORIGIN:base,COOKIE_SECURE:'true',TRUST_PROXY_HOPS:'1',
 JWT_SECRET:'synthetic-teacher-ci-jwt-not-production',ASSET_SIGNING_SECRET:'synthetic-teacher-ci-assets-not-production',
 DATA_ENCRYPTION_KEY:'42'.repeat(32),DATA_PSEUDONYM_KEY:'43'.repeat(32),
 CAMPUS_ELIGIBILITY_HMAC_KEY:'44'.repeat(32),CAMPUS_MFA_ENCRYPTION_KEY:'45'.repeat(32),
 ASSET_MIGRATION_COMPLETE:'true',BACKGROUND_WORKERS_ENABLED:'false',HUITEACHER_WORKSPACE_ENABLED:'true',
 SOCKET_REDIS_REQUIRED:'false',
};
const envArgs=Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]);
function start(name,alias,args){
 docker('run','-d','--name',name,'--network',network,'--network-alias',alias,...args);resources.push(name);
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let i=0;i<60;i++){
  // Only this loopback fixture uses a short-lived self-signed certificate.
  const code=await new Promise(resolve=>{
   const req=https.get('https://127.0.0.1/ready',{rejectUnauthorized:false,headers:{Host:'teacher.eduk12.top'},timeout:2000},res=>{res.resume();resolve(res.statusCode);});
   req.on('error',()=>resolve(0));req.on('timeout',()=>req.destroy());
  });
  if(code===200)return;await pause(1000);
 }
 throw Error('isolated candidate readiness timed out');
}
async function context(viewport){
 const ctx=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block',ignoreHTTPSErrors:true});
 await ctx.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='teacher.eduk12.top'||(url.port&&url.port!=='443')){externalRequests.push(url.origin);return route.abort();}
  return route.continue();
 });
 await ctx.route('**/teacher-ci-axe.js',route=>route.fulfill({contentType:'application/javascript',body:axe}));
 return ctx;
}
async function wcag(page){
 await page.addScriptTag({url:base+'/teacher-ci-axe.js'});
 const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
 return {violations:0,passes:result.passes.length,incomplete:result.incomplete.length};
}
async function api(page,path,data,token){
 return page.evaluate(async({path,data,token})=>{
  const headers=data?{'Content-Type':'application/json'}:{};
  if(data){const csrf=token??(await (await fetch('/api/huiteacher/auth/csrf',{credentials:'include'})).json()).data.csrfToken;headers['X-CSRF-Token']=csrf;}
  const res=await fetch('/api/huiteacher'+path,{method:data?'POST':'GET',credentials:'include',headers,body:data?JSON.stringify(data):undefined});
  return {status:res.status,body:await res.json()};
 },{path,data,token});
}
async function noSession(ctx,page){assert.ok(!(await ctx.cookies()).some(c=>c.name==='huiteacher_session'));assert.equal((await api(page,'/auth/me')).status,401);}
try{
 docker('network','create',network);
 const pg=network+'-postgres';
 start(pg,'postgres',['-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD=synthetic-ci-only','-e','POSTGRES_DB=teacher_home_ci_test','postgres:16']);
 start(network+'-redis','redis',['redis:7']);
 let pgReady=false;
 for(let i=0;i<30;i++){try{docker('exec',pg,'pg_isready','-U','ptool');pgReady=true;break;}catch{await pause(1000);}}
 assert.ok(pgReady,'isolated database readiness');
 const backend='eduk12-teacher-home-backend:'+plan.head;
 docker('run','--rm','--network',network,...envArgs,backend+'-build','npx','prisma','migrate','deploy');
 start(network+'-backend','backend',[...envArgs,'-v',join(process.cwd(),'.github/scripts/teacher-home-fixture.cjs')+':/app/teacher-home-fixture.cjs:ro',backend]);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-subj','/CN=teacher.eduk12.top'],{stdio:'pipe'});
 const nginx=readFileSync('server-version/frontend/nginx.conf','utf8').replace('listen 80;','listen 80;\n    listen 443 ssl;\n    ssl_certificate /teacher-ci-tls/cert.pem;\n    ssl_certificate_key /teacher-ci-tls/key.pem;');
 writeFileSync(join(temp,'nginx.conf'),nginx);
 start(network+'-frontend','frontend',['-p','127.0.0.1:443:443','-v',temp+':/teacher-ci-tls:ro','-v',join(temp,'nginx.conf')+':/etc/nginx/conf.d/default.conf:ro','eduk12-teacher-home-frontend:'+plan.head]);
 await ready();
 docker('exec',network+'-backend','node','teacher-home-fixture.cjs');
 docker('cp',network+'-backend:/app/.local/teacher-home-fixture.json',join(temp,'fixture.json'));
 const fixture=JSON.parse(readFileSync(join(temp,'fixture.json'),'utf8'));
 browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP teacher.eduk12.top 127.0.0.1']});
 for(const [width,height] of [[1440,900],[768,1024],[390,844],[1440,768]]){
  const ctx=await context({width,height}),page=await ctx.newPage();lastPage=page;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.goto(base+'/')).status(),200);await page.locator('.ht-journal-copy').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  assert.equal(await page.locator('h1').textContent(),'从每一次思考，走向更好的教育。');
  const layout=await page.evaluate(()=>{
   const copy=document.querySelector('.ht-journal-copy'),strip=document.querySelector('.ht-feature-strip');
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,overlap:copy.getBoundingClientRect().bottom>strip.getBoundingClientRect().top,
    allInFirstFold:document.documentElement.scrollHeight<=innerHeight+1,logo:document.querySelector('.ht-brand img').getAttribute('src'),
    background:getComputedStyle(copy).backgroundColor,border:getComputedStyle(copy).borderStyle};
  });
  assert.equal(layout.overflow,false);assert.equal(layout.overlap,false);assert.equal(layout.allInFirstFold,true);
  assert.ok(layout.logo.endsWith('.svg'));assert.match(layout.background,/rgba/);assert.notEqual(layout.border,'none');
  const accessibility=await wcag(page);
  await page.screenshot({path:'teacher-home-evidence/screenshots/home-'+width+'-'+height+'.png',fullPage:true});
  for(const title of ['教师成长','学校改进','实践观察','持续改进']){
   const button=page.getByRole('button',{name:title,exact:true});await button.click();
   await page.getByRole('dialog').getByRole('heading',{name:title,exact:true}).waitFor();
   await wcag(page);await page.keyboard.press('Escape');
   assert.equal(await button.evaluate(el=>document.activeElement===el),true);
  }
  await page.getByRole('button',{name:'进入 Huiteacher',exact:true}).click();
  await page.getByRole('heading',{name:'登录 Huiteacher',exact:true}).waitFor();
  assert.equal(await page.getByLabel('教育账号',{exact:true}).getAttribute('autocomplete'),'username');
  assert.equal(await page.getByLabel('密码',{exact:true}).getAttribute('autocomplete'),'current-password');
  await wcag(page);await page.screenshot({path:'teacher-home-evidence/screenshots/login-'+width+'-'+height+'.png',fullPage:true});
  await page.getByRole('button',{name:'使用邀请注册',exact:true}).click();
  for(const [choice,title] of [['教师／学校成员','教师邀请注册'],['学生','学生评教身份注册'],['外部专家','外部专家受控注册']]){
   await page.getByRole('button',{name:choice,exact:true}).click();
   await page.getByRole('heading',{name:title,exact:true}).waitFor();await wcag(page);
   await page.getByRole('button',{name:'选择其他邀请身份',exact:false}).click();
  }
  records.push({width,height,layout,accessibility,features:4,loginAndInvitationChoices:'success',errors});
  assert.deepEqual(errors,[]);await ctx.close();
 }
 const ctx=await context({width:390,height:844}),page=await ctx.newPage();lastPage=page;
 await page.goto(base);await page.locator('.ht-journal-copy').waitFor();
 const invitePath='/organizations/'+fixture.org+'/evaluation-events/'+fixture.event+'/expert-registration-invites';
 const forbiddenInvite=await api(page,invitePath,{});assert.equal(forbiddenInvite.status,401);boundaries.push({case:'guest-invite-issuance',status:401});
 for(const [username,password] of [['teacher_ci_member','WrongSynthetic!2026'],['teacher_ci_wrong_domain',fixture.password]]){
  const failed=await api(page,'/auth/login',{username,password});assert.equal(failed.status,401);await noSession(ctx,page);
  boundaries.push({case:username==='teacher_ci_member'?'wrong-password-no-session':'wrong-account-domain-no-session',status:401});
 }
 assert.equal((await api(page,'/education/register-expert',{inviteCode:fixture.invite,username:'teacher_ci_expert',password:fixture.password},'invalid-token')).status,403);
 boundaries.push({case:'registration-csrf-required',status:403});
 await page.getByRole('button',{name:'注册',exact:true}).click();
 await page.getByRole('button',{name:'外部专家',exact:true}).click();
 await page.getByLabel('限定活动的专家邀请码',{exact:true}).fill(fixture.invite);
 await page.getByLabel('教育账号登录名',{exact:true}).fill('teacher_ci_expert');
 await page.getByLabel('设置密码',{exact:true}).fill(fixture.password);
 const registered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/huiteacher/education/register-expert'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'注册统一教育账号',exact:true}).click();
 assert.equal((await registered).status(),200);
 await page.getByRole('heading',{name:'登录 Huiteacher',exact:true}).waitFor();await noSession(ctx,page);
 boundaries.push({case:'real-guest-expert-registration',status:200});
 await page.getByLabel('密码',{exact:true}).fill(fixture.password);
 const expertLogin=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/huiteacher/auth/login'&&r.request().method()==='POST');
 await page.locator('.ht-form-panel').getByRole('button',{name:'登录',exact:true}).click();
 assert.equal((await expertLogin).status(),200);
 await page.getByRole('heading',{name:'我的教育发展空间',exact:true}).waitFor();
 assert.equal((await api(page,'/auth/me')).body.data.product,'HUITEACHER');assert.equal((await api(page,'/auth/me')).body.data.organizations.length,0);
 boundaries.push({case:'expert-login-without-school-membership',status:200});
 assert.equal((await api(page,'/auth/logout',{})).status,200);await noSession(ctx,page);
 assert.equal((await api(page,'/auth/login',{username:'teacher_ci_member',password:fixture.password})).status,200);
 assert.equal((await api(page,invitePath,{})).status,403);boundaries.push({case:'ordinary-teacher-cannot-issue-expert-invites',status:403});
 await ctx.clearCookies();
 await ctx.addCookies([{name:'huiteacher_session',value:fixture.schoolToken,domain:'teacher.eduk12.top',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
 assert.equal((await api(page,'/auth/me')).status,401);boundaries.push({case:'School-session-rejected-by-Teacher',status:401});
 await ctx.close();assert.deepEqual(externalRequests,[]);
 writeFileSync('teacher-home-evidence/browser.json',JSON.stringify({head:plan.head,components:plan.components,images:checks.images,records,boundaries,externalRequests,
  environment:'real production-mode runtime images; synthetic isolated PostgreSQL/Redis; canonical Teacher HTTPS mapped to loopback; only fixture TLS uses a short-lived self-signed certificate'},null,2));
}catch(error){
 if(lastPage&&!lastPage.isClosed()){
  await lastPage.screenshot({path:'teacher-home-evidence/browser-failure.png',fullPage:true});
  writeFileSync('teacher-home-evidence/browser-failure.json',JSON.stringify({url:lastPage.url(),error:String(error),text:await lastPage.locator('body').innerText()},null,2));
 }
 for(const name of resources)try{writeFileSync('teacher-home-evidence/'+name+'.log',docker('logs',name));}catch{}
 throw error;
}finally{
 if(browser)await browser.close();
 for(const name of resources.reverse())docker('rm','-f',name);
 try{docker('network','rm',network);}finally{rmSync(temp,{recursive:true,force:true});}
}
