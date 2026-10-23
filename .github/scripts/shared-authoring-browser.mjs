import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../release-tools/node_modules/playwright-core');
const root=resolve('server-version/frontend/dist'),out=resolve('shared-authoring-evidence/browser');await mkdir(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=resolve(root,'.'+decodeURIComponent(url.pathname));assert.ok(file===root||file.startsWith(root+sep));let target=file;try{if(!(await stat(file)).isFile())target=resolve(root,'index.html')}catch{target=resolve(root,'index.html')}res.setHeader('Content-Type',mime[extname(target)]??'application/octet-stream');res.end(await readFile(target));}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://survey.localhost:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});const results=[];
try{for(const[width,theme]of [[1440,'light'],[390,'dark']]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],unexpected=[];page.on('pageerror',e=>errors.push(e.message));
 const id='198e278f-f993-44fa-9eaa-223693fa4db3';let writes=0;
 const tool={id:'fixture',title:'Compiled authoring',kind:'SCALE',revision:1,status:'DRAFT',readiness:'DRAFT',completedRevision:null,updatedAt:'2026-10-23T00:00:00.000Z',definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'a',label:'No',score:0},{optionKey:'b',label:'Yes',score:1}],dimensions:[{dimensionKey:'d',label:'Descriptive',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic compiled question',required:true,reverse:false,dimensionKeys:['d']}]}};
 try{
  await context.addInitScript(mode=>localStorage.setItem('survey.appearance',mode),theme);
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());let data;
   if(url.pathname==='/api/survey/auth/me')data={id:'fixture-researcher',username:'synthetic-ci-only',mustChangePassword:false};
   else if(url.pathname==='/api/survey/auth/csrf')data={csrfToken:'synthetic-ui-fixture'};
   else if(url.pathname==='/api/survey/projects')data={list:[]};
   else if(url.pathname==='/api/survey/tool-library')data={list:[tool],total:1,hasMore:false};
   else if(url.pathname==='/api/survey/tool-library/fixture'&&req.method()==='GET')data=tool;
   else if(url.pathname==='/api/survey/tool-library/fixture'&&req.method()==='PATCH'){const body=req.postDataJSON();assert.equal(body.revision,tool.revision);Object.assign(tool,body,{revision:tool.revision+1});writes++;data=tool;}
   else if(url.pathname==='/api/survey/media-library')data={list:[{id,originalName:'Synthetic PDF',mimeType:'application/pdf',contentHash:'a'.repeat(64),size:100}],total:1,page:1,pageSize:9};
   else{unexpected.push(req.method()+' '+url.pathname);return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:-1,message:'Unexpected compiled UI fixture request'})})}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'OK',data})});
  });
  await page.goto(origin+'/');await page.locator('.survey-landing').waitFor();
  const art=await page.locator('.survey-landing').evaluate(el=>getComputedStyle(el).backgroundImage);assert.ok(art||await page.locator('picture, img').count(),'Landing has compiled imagery');
  await page.screenshot({path:resolve(out,`landing-${width}-${theme}.png`),fullPage:true});
  results.push({page:'compiled landing',width,theme,status:'passed'});
  await page.goto(origin+'/workspace/tools?tool=fixture');await page.getByText('Compiled authoring',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'题目',exact:true}).click();await page.getByText('题目素材 · 图片、视频、文档',{exact:true}).click();
  await page.getByRole('button',{name:'从素材库添加',exact:true}).click();await page.getByRole('button',{name:'添加',exact:true}).first().click();
  await page.getByLabel('使用依据',{exact:true}).selectOption('authorized');await page.getByLabel('原创／授权说明',{exact:true}).fill('Synthetic compiled UI rights');
  await page.getByRole('button',{name:'保存量表',exact:true}).click();await page.getByText('修订 2',{exact:true}).waitFor();
  assert.equal(writes,1);assert.equal(tool.definition.items[0].materials[0].asset.assetId,id);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.screenshot({path:resolve(out,`scale-${width}-${theme}.png`),fullPage:true});results.push({page:'compiled scale save',width,theme,status:'passed'});
 }catch(error){results.push({width,theme,status:'failed',error:String(error),errors,unexpected});await page.screenshot({path:resolve(out,`failed-${width}-${theme}.png`),fullPage:true}).catch(()=>{});throw error}finally{await context.close()}
}}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(out,'results.json'),JSON.stringify({artifact:'exact current Vite dist',browser:'installed Google Chrome, sandbox enabled',uiApi:'strict synthetic fixtures; actual authentication/frozen delivery tested separately',results},null,2));}
assert.equal(results.length,4);assert.ok(results.every(x=>x.status==='passed'));
