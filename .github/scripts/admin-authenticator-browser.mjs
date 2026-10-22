import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../release-tools/package.json',import.meta.url));
const {chromium}=require('playwright-core');
assert.equal(require('playwright-core/package.json').version,require('./package.json').dependencies['playwright-core']);
const dist=resolve('server-version/frontend/dist'),directory=resolve('admin-authenticator-evidence');
await stat(resolve(dist,'index.html'));await mkdir(directory,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+path);assert.ok(file===dist||file.startsWith(dist+sep));
 try{if(!(await stat(file)).isFile())throw Error();}catch{if(extname(path)){res.writeHead(404).end();return;}file=resolve(dist,'index.html');}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
}catch{res.writeHead(400).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const local='http://127.0.0.1:'+server.address().port,checks=[],unexpected=[],errors=[];
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname!=='training.eduk12.top'){unexpected.push(url.origin);return route.abort();}
   if(url.pathname.startsWith('/api/')){
    if(req.method()!=='GET'){unexpected.push(req.method()+' '+url.pathname);return route.abort();}
    if(url.pathname==='/api/auth/me')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:401,message:'请先登录'})});
    const data=url.pathname==='/api/capabilities'?{cognitive:false,parentPortal:false}:url.pathname==='/api/organizations'?{list:[],total:0,page:1,pageSize:100,allowedActions:[]}:null;
    if(data===null){unexpected.push('GET '+url.pathname);return route.abort();}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})});
   }
   const r=await fetch(local+url.pathname+url.search);assert.equal(r.status,200);return route.fulfill({contentType:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())});
  });
  for(const[route,title,button]of [['/admin/login','管理员登录','管理员登录'],['/admin/security/enroll','绑定管理员验证方式','生成绑定二维码']]){
   await page.goto('https://training.eduk12.top'+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();
   assert.equal(await page.getByRole('combobox',{name:/^验证方式/}).inputValue(),'TOTP');
   await page.getByRole('button',{name:button,exact:true}).waitFor();
   const code=page.getByLabel('Authenticator 六位动态码',{exact:true});
   if(route==='/admin/login'){assert.equal(await code.getAttribute('pattern'),'[0-9]{6}');assert.equal(await code.getAttribute('autocomplete'),'one-time-code');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no page overflow');
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const axe=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));assert.deepEqual(axe.violations,[]);
   await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'keyboard focus');
   const name=(route.endsWith('login')?'login':'enrollment')+'-'+width;await page.screenshot({path:resolve(directory,name+'.png'),fullPage:true});checks.push({name,width,axePasses:axe.passes.length,overflow:false,keyboard:true});
  }
  await context.close();
 }
 assert.equal(checks.length,4);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 await writeFile(resolve(directory,'browser.json'),JSON.stringify({status:'PASS',checks,unexpected,errors,scope:'compiled UI only; protocol evidence is reviewed local API tests',productionAccess:false},null,2));
}catch(error){const pages=browser?.contexts().flatMap(context=>context.pages())||[];const page=pages.at(-1);if(page){await page.screenshot({path:resolve(directory,'failure.png'),fullPage:true});await writeFile(resolve(directory,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText());}throw error;}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
