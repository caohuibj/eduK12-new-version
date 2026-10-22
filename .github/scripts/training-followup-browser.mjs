import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../release-tools/package.json',import.meta.url));
const {chromium}=require('playwright-core');
assert.equal(require('playwright-core/package.json').version,require('./package.json').dependencies['playwright-core']);
const dist=resolve('server-version/frontend/dist'),directory=resolve('training-followup-evidence');
await stat(resolve(dist,'index.html'));await mkdir(directory,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 try {const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+path);assert.ok(file===dist||file.startsWith(dist+sep));
  try {if(!(await stat(file)).isFile())throw Error();}catch{if(extname(path)){res.writeHead(404).end();return;}file=resolve(dist,'index.html');}
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(400).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const local='http://127.0.0.1:'+server.address().port,checks=[],unexpected=[],errors=[];
let browser,page;
const timeout=setTimeout(()=>{server.closeAllConnections();void browser?.close();process.exitCode=1;},120000);
try{
 browser=await chromium.launch({headless:true});
 for(const width of [1440,834,390]){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:900}});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname;
   const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data,message:''})});
   if(url.hostname!=='training.eduk12.top'){unexpected.push(url.origin);return route.abort();}
   if(path.startsWith('/api/')){
    if(request.method()!=='GET'){unexpected.push(request.method()+' '+path);return route.abort();}
    if(path==='/api/auth/me')return json({id:'trainer',username:'synthetic',nickname:'Synthetic trainer',role:'TEACHER',platformRole:'STANDARD',mustChangePassword:false});
    if(path==='/api/capabilities')return json({cognitive:false,parentPortal:false});
    if(path==='/api/training/reference-governance/capabilities')return json([]);
    if(path==='/api/organizations')return json({list:[],total:0,page:1,pageSize:100,platformRole:'STANDARD',allowedActions:[]});
    if(['/api/relational-assessments/catalog','/api/relational-assessments/tasks'].includes(path))return json({list:[]});
    if(path==='/api/courses/c1')return json({id:'c1',title:'合成课程 · 布局检查',creatorId:'trainer',courseCode:'SYNTHETIC',status:'PUBLISHED',studentCount:0,description:'合成课程说明'});
    if(path==='/api/courses/c1/training-assessments')return json({list:[{id:'q1',key:'q1',kind:'QUESTIONNAIRE',typeLabel:'组合测评',name:'合成测评 · 较长标题检查布局',description:'说明文字用于检查内容和操作按钮在窄屏下的排列。'.repeat(6),status:'DRAFT',unitCount:3,unitLabel:'单元',manageHref:'/questionnaire-products/q1',tags:[]}],total:1});
    if(path==='/api/training-workspace/media')return json({list:Array.from({length:3},(_,index)=>({id:'media'+index,name:'合成图片 '+index,kind:'image',source:'owned',size:1024,url:'/synthetic.svg',description:'合成媒体说明。'.repeat(30)})),total:3});
    unexpected.push('GET '+path+url.search);return route.abort();
   }
   if(path==='/synthetic.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#dce7df"/></svg>'});
   const response=await fetch(local+path+url.search);if(!response.ok)unexpected.push('static '+response.status+' '+path);
   return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await response.arrayBuffer())});
  });
  async function proof(name){await page.waitForLoadState('networkidle');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' viewport overflow');await page.screenshot({path:resolve(directory,name+'-'+width+'.png'),fullPage:true});checks.push({name,width});}
  await page.goto('http://training.eduk12.top/courses/c1/detail?section=assessments');
  await page.getByRole('heading',{name:'合成课程 · 布局检查',exact:true}).waitFor();
  await page.getByRole('heading',{name:'合成测评 · 较长标题检查布局',exact:true}).waitFor();
  const tabs=page.getByRole('navigation',{name:'课程管理内容'}),filter=page.getByRole('button',{name:/检索与筛选/});
  assert.equal(await tabs.getByRole('button').count(),4);
  const tabBox=await tabs.boundingBox(),filterBox=await filter.boundingBox();
  assert.ok(tabBox&&filterBox);
  assert.ok(tabBox.x+tabBox.width<=filterBox.x+1||filterBox.x+filterBox.width<=tabBox.x+1||tabBox.y+tabBox.height<=filterBox.y+1||filterBox.y+filterBox.height<=tabBox.y+1,'tabs and filter overlap');
  await proof('assessment-toolbar');await filter.click();await page.getByRole('searchbox',{name:'搜索测评'}).waitFor();await proof('assessment-filter-open');
  await page.goto('http://training.eduk12.top/media-library');await page.getByRole('heading',{name:'合成图片 0',exact:true}).waitFor();
  await page.getByRole('button',{name:'改名',exact:true}).first().click();
  const rename=page.getByRole('dialog',{name:'修改媒体名称',exact:true});await rename.waitFor();assert.ok(await rename.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await proof('media-rename');await page.keyboard.press('Escape');await rename.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'预览',exact:true}).first().click();const preview=page.getByRole('dialog',{name:'合成图片 0',exact:true});await preview.waitFor();await proof('media-preview');await page.getByRole('button',{name:'关闭预览',exact:true}).click();
  await page.goto('http://training.eduk12.top/toolkit/forms/new');await page.getByRole('heading',{name:'编制表单',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'← 返回工具 · 表单',exact:true}).getAttribute('href'),'/toolkit?kind=form');assert.equal(await page.getByText('投放设置',{exact:true}).count(),0);await proof('independent-form');
  await context.close();
 }
 assert.equal(checks.length,15);
 await writeFile(resolve(directory,'browser.json'),JSON.stringify({status:'PASS',checks,unexpected,errors,syntheticOnly:true,physicalBrowser:false},null,2));
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:resolve(directory,'browser-failure.png'),fullPage:true});await writeFile(resolve(directory,'browser-failure.json'),JSON.stringify({error:String(error),url:page.url(),checks,unexpected,errors},null,2));}throw error;}
finally{clearTimeout(timeout);await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
