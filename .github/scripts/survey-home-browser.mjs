import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const p=JSON.parse(readFileSync('survey-home-plan.json','utf8'));
const checks=JSON.parse(readFileSync('survey-home-evidence/checks.json','utf8'));
assert.equal(p.head,checks.head);assert.equal(p.frontendTree,checks.frontendTree);
const tag='eduk12-survey-home:'+p.head;
const run=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
assert.equal(run('image','inspect','--format','{{.Id}}',tag),checks.image);
const container='survey-home-browser-'+p.head.slice(0,12),base='http://survey.eduk12.top:3189';
const features=[['research-projects','研究项目'],['research-tools','研究工具'],['research-participation','发布与参与'],['research-data','数据与分析']];
const axe=readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8');
const records=[],unexpected=[];let browser,lastPage;
mkdirSync('survey-home-evidence/screenshots',{recursive:true});
async function accessibility(page){
 await page.addScriptTag({url:base+'/survey-ci-axe.js'});
 const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
 return {violations:0,passes:result.passes.length,incomplete:result.incomplete.length};
}
try{
 run('run','-d','--name',container,'-p','127.0.0.1:3189:80',tag);
 browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP survey.eduk12.top 127.0.0.1']});
 for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();lastPage=page;const errors=[],apiRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='survey.eduk12.top'||url.port!=='3189'){unexpected.push(url.origin);return route.abort();}
   return route.continue();
  });
  // Test instrumentation is loaded same-origin, preserving the real image CSP.
  await context.route('**/survey-ci-axe.js',route=>route.fulfill({contentType:'application/javascript',body:axe}));
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;apiRequests.push(path);
   if(path==='/api/survey/auth/capabilities')return route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:{analytics:false,publication:false}})});
   return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:401,data:null,message:'请先登录'})});
  });
  const response=await page.goto(base+'/');assert.equal(response.status(),200);
  await page.locator('.survey-landing-copy').waitFor();
  assert.equal(await page.locator('h1').textContent(),'风过有迹，细微可察。');
  assert.equal(await page.locator('.survey-landing-copy p').textContent(),'从问题出发，在数据中寻找理解的线索。');
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const layout=await page.evaluate(()=>{
   const copy=document.querySelector('.survey-landing-copy'),strip=document.querySelector('.survey-feature-strip');
   const panel=getComputedStyle(copy),logo=document.querySelector('.survey-brand img');
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,overlap:copy.getBoundingClientRect().bottom>strip.getBoundingClientRect().top,
    background:panel.backgroundColor,border:panel.borderStyle,logo:logo.getAttribute('src'),imageReady:document.querySelector('.survey-landing-art img').naturalWidth>0};
  });
  assert.equal(layout.overflow,false);assert.equal(layout.overlap,false);assert.equal(layout.imageReady,true);
  assert.ok(layout.logo.endsWith('.svg'));assert.match(layout.background,/rgba/);assert.notEqual(layout.border,'none');
  const wcag=await accessibility(page);
  assert.ok(apiRequests.every(path=>path==='/api/survey/auth/me'),'public home must not request project data');
  await page.screenshot({path:`survey-home-evidence/screenshots/home-${width}.png`,fullPage:true});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'跳至主要内容');
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'survey-intro');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent.replace(/\s+/g,'')),'研究者登录');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Researcher 登录'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/login');
  await page.screenshot({path:`survey-home-evidence/screenshots/login-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'返回首页'}).click();
  for(const [slug,title] of features){
   await page.locator(`.survey-feature-link[href="/features/${slug}"]`).click();
   await page.getByRole('heading',{name:title,level:1,exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await accessibility(page);
   if(slug==='research-data')await page.screenshot({path:`survey-home-evidence/screenshots/introduction-${width}.png`,fullPage:true});
   await page.getByRole('link',{name:'返回平台介绍'}).click();
  }
  assert.deepEqual(errors,[]);records.push({width,height,layout,wcag,loginAndBack:'success',features:4,keyboard:'success'});
  await context.close();
 }
 assert.deepEqual(unexpected,[]);
 writeFileSync('survey-home-evidence/browser.json',JSON.stringify({head:p.head,frontendTree:p.frontendTree,image:checks.image,records,externalRequests:unexpected,
  api:'anonymous UI-only fixtures; real account and permission checks are local review evidence, not claimed by this browser job'},null,2));
}catch(error){
 if(lastPage&&!lastPage.isClosed()){
  await lastPage.screenshot({path:'survey-home-evidence/browser-failure.png',fullPage:true});
  writeFileSync('survey-home-evidence/browser-failure.json',JSON.stringify({url:lastPage.url(),error:String(error),text:await lastPage.locator('body').innerText()},null,2));
 }
 throw error;
}finally{if(browser)await browser.close();run('rm','-f',container);}
