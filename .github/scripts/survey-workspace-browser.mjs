import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
import {surveyFixture} from './survey-workspace-fixture.mjs';
const dist=resolve('server-version/frontend/dist'),out='survey-workspace-evidence';mkdirSync(out+'/screenshots',{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const browser=await chromium.launch({headless:true});const evidence={status:'running',compiledDist:true,syntheticOnly:true,checks:[],pageErrors:[],unexpectedRequests:[]};
const tools=['form','scale','composition'];
const inherited=JSON.parse(readFileSync(out+'/official-admission.json','utf8'));
assert.equal(inherited.currentHead,process.env.GITHUB_SHA);assert.equal(inherited.originalRun,39811690734);evidence.inheritedChecks=inherited.acceptedBrowser;evidence.sameRunFullJourneyClaim=false;
const inheritedScene=(scene,width)=>inherited.acceptedBrowser.some(c=>c.scene===scene&&c.width===width);
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}});const mock=surveyFixture();
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   try{
    assert.equal(url.hostname,'survey.eduk12.top','No third party requests');
    if(url.pathname.startsWith('/api/')){const r=await mock(url.pathname+url.search,{method:request.method(),body:request.postData()});await route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});return;}
    if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
    const file=resolve(dist,'.'+decodeURIComponent(url.pathname));assert.ok(file.startsWith(dist+'/')||file===dist);
    if(existsSync(file)&&extname(file)){await route.fulfill({status:200,contentType:mime[extname(file)]||'application/octet-stream',body:readFileSync(file)});return;}
    assert.ok(!extname(url.pathname),'Missing static asset');await route.fulfill({status:200,contentType:'text/html',body:readFileSync(dist+'/index.html')});
   }catch(error){evidence.unexpectedRequests.push({url:request.url(),message:error.message});await route.fulfill({status:500,body:'Unexpected synthetic request'});}
  });
  const page=await context.newPage();page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  const inspect=async(scene)=>{
   if(inheritedScene(scene,width))return;
   await page.addScriptTag({content:readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8')});
   const result=await page.evaluate(async()=>{
    const axe=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
    const white=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height&&getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)').map(e=>e.className);
    return {theme:document.querySelector('[data-survey-theme]')?.getAttribute('data-survey-theme'),overflow:document.documentElement.scrollWidth>innerWidth,white,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
   });
   evidence.checks.push({scene,width,...result});await page.screenshot({path:`${out}/screenshots/${scene}-${width}.png`,fullPage:true});
   assert.equal(result.theme,'dark',scene);assert.equal(result.overflow,false,scene+' overflow');assert.deepEqual(result.white,[],scene+' white surface');assert.deepEqual(result.violations,[],scene+' WCAG');
  };
  await page.goto('https://survey.eduk12.top/');await page.getByRole('button',{name:'外观',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await inspect('entry-settings');await page.getByRole('button',{name:'外观',exact:true}).click();
  for(const surface of tools){
   if(inheritedScene(surface,width))continue;
   await page.goto('https://survey.eduk12.top/workspace/tools?tool=00000000-0000-4000-8000-00000000000'+(tools.indexOf(surface)+1));await page.getByRole('heading',{level:1}).waitFor();
   await inspect(surface);
   if(surface==='scale'){
    await page.getByText('其他操作',{exact:true}).click();await page.getByRole('button',{name:'申请入库',exact:true}).click();await page.getByRole('heading',{name:'申请进入共用库',exact:true}).waitFor();await inspect('scale-application');
   }
  }
  for(const section of ['publish','reports','data']){
   if(inheritedScene(section,width))continue;
   await page.goto('https://survey.eduk12.top/workspace?project=synthetic-one&section='+section);await page.getByRole('tab',{name:section==='publish'?'发布与采集':section==='reports'?'私有报告':'数据',exact:true}).waitFor();
   await page.getByRole('tabpanel',{name:section==='publish'?'发布与采集':section==='reports'?'私有报告':'数据',exact:true}).waitFor();
   await inspect(section);
  }
  await context.close();
 }
 assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.unexpectedRequests,[]);evidence.status='passed';
}finally{writeFileSync(out+'/browser.json',JSON.stringify(evidence,null,2));await browser.close();}
