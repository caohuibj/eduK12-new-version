import assert from 'node:assert/strict';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../release-tools/node_modules/playwright-core');
const root=resolve('server-version/frontend/dist'),out=resolve('shared-authoring-evidence/browser');await mkdir(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
// Vite production builds intentionally do not recognize the DEV-only .localhost
// alias. All requests to the canonical presentation host are fulfilled from local
// artifact bytes or synthetic API envelopes: no DNS, network or production access.
const origin='https://survey.eduk12.top';
const browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});const results=[];
try{for(const[width,theme]of [[1440,'light'],[390,'dark']]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[],unexpected=[];page.on('pageerror',e=>errors.push(e.message));
 const id='198e278f-f993-44fa-9eaa-223693fa4db3',toolId='e1136d32-7abf-4665-b4d8-589bf039bf9e';let writes=0,signedIn=false;
 const tool={id:toolId,title:'Compiled authoring',kind:'SCALE',revision:1,status:'DRAFT',readiness:'DRAFT',completedRevision:null,updatedAt:'2026-10-23T00:00:00.000Z',definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'a',label:'No',score:0},{optionKey:'b',label:'Yes',score:1}],dimensions:[{dimensionKey:'d',label:'Descriptive',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic compiled question',required:true,reverse:false,dimensionKeys:['d']}]}};
 try{
  await context.addInitScript(mode=>localStorage.setItem('survey.appearance',mode),theme);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   try{
    assert.equal(url.origin,origin,'No third party or production network');
    if(url.pathname==='/favicon.ico')return await route.fulfill({status:204});
    if(!url.pathname.startsWith('/api/')){
     const file=resolve(root,'.'+decodeURIComponent(url.pathname));assert.ok(file===root||file.startsWith(root+sep));
     let target=file;try{if(!(await stat(file)).isFile())target=resolve(root,'index.html')}catch{assert.ok(!extname(url.pathname),'Missing compiled static asset');target=resolve(root,'index.html')}
     return await route.fulfill({status:200,contentType:mime[extname(target)]??'application/octet-stream',body:await readFile(target)});
    }
    let data;
    if(url.pathname==='/api/survey/auth/me'){
     if(!signedIn)return await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:-1,message:'Synthetic anonymous visitor'})});
     data={id:'fixture-researcher',username:'synthetic-ci-only',mustChangePassword:false};
    }else if(url.pathname==='/api/survey/auth/capabilities')data={analytics:true,publication:true};
    else if(url.pathname==='/api/survey/auth/csrf')data={csrfToken:'synthetic-ui-fixture'};
    else if(url.pathname==='/api/survey/projects')data={list:[]};
    else if(url.pathname==='/api/survey/tool-library')data={list:[tool],total:1,hasMore:false};
    else if(url.pathname==='/api/survey/tool-library/'+toolId&&req.method()==='GET')data=tool;
    else if(url.pathname==='/api/survey/tool-library/'+toolId&&req.method()==='PATCH'){
     assert.equal(req.headers()['x-csrf-token'],'synthetic-ui-fixture');const body=req.postDataJSON();assert.equal(body.revision,tool.revision);
     Object.assign(tool,body,{revision:tool.revision+1});writes++;data=tool;
    }else if(url.pathname==='/api/survey/media-library')data={list:[{id,name:'Synthetic PDF',mimeType:'application/pdf',contentHash:'a'.repeat(64),size:100}],total:1,page:1,pageSize:9};
    else throw Error('Unknown synthetic API request');
    return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'OK',data})});
   }catch(error){unexpected.push({method:req.method(),url:req.url(),message:String(error)});return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:-1,message:'Unexpected compiled UI request'})});}
  });
  await page.goto(origin+'/');await page.locator('.survey-landing').waitFor();await page.getByRole('link',{name:'研究者登录',exact:true}).waitFor();
  await page.waitForFunction(mode=>document.querySelector('[data-survey-theme]')?.getAttribute('data-survey-theme')===mode,theme);
  const art=await page.locator('.survey-public-hero').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
  assert.ok(art.includes(`research-wind-${theme}`),'Actual compiled day/night hero art is selected');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:resolve(out,`landing-${width}-${theme}.png`),fullPage:true});results.push({page:'compiled anonymous landing',width,theme,status:'passed'});
  signedIn=true;
  await page.goto(origin+'/workspace/tools?tool='+toolId);await page.getByRole('heading',{name:'Compiled authoring',exact:true}).waitFor();
  await page.getByRole('tab',{name:'题目',exact:true}).click();await page.getByText('题目素材 · 图片、视频、文档',{exact:true}).click();
  await page.getByRole('button',{name:'从素材库添加',exact:true}).click();await page.getByRole('button',{name:'添加',exact:true}).first().click();
  await page.getByLabel('使用依据',{exact:true}).selectOption('authorized');await page.getByLabel('原创／授权说明',{exact:true}).fill('Synthetic compiled UI rights');
  await page.getByRole('button',{name:'保存量表',exact:true}).click();await page.getByText('修订 2',{exact:true}).waitFor();
  assert.equal(writes,1);assert.equal(tool.definition.items[0].materials[0].asset.assetId,id);assert.equal(tool.definition.items[0].materials[0].name,'Synthetic PDF');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.screenshot({path:resolve(out,`scale-${width}-${theme}.png`),fullPage:true});results.push({page:'compiled scale save',width,theme,status:'passed'});
 }catch(error){results.push({width,theme,status:'failed',error:String(error),errors,unexpected});await page.screenshot({path:resolve(out,`failed-${width}-${theme}.png`),fullPage:true}).catch(()=>{});throw error}finally{await context.close()}
}}finally{await browser.close();await writeFile(resolve(out,'results.json'),JSON.stringify({artifact:'exact qualified Vite dist',browser:'installed Google Chrome, sandbox enabled',network:'all requests fulfilled locally; canonical host selects production presentation only',uiApi:'strict synthetic fixtures; real authentication/frozen delivery qualified separately',results},null,2));}
assert.equal(results.length,4);assert.ok(results.every(x=>x.status==='passed'));
