import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const plan=JSON.parse(readFileSync('campus-plan.json','utf8'));
if(!plan.changed.includes('frontend')) {console.log('No changed frontend candidate');process.exit(0);}
const root=resolve('campus-evidence/frontend');
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(path!==root&&!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 const file=existsSync(path)&&extname(path)?path:join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});await new Promise(r=>server.listen(3189,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP school.eduk12.top 127.0.0.1']});
const evidence=[];mkdirSync('campus-evidence/screenshots',{recursive:true});
try{
 for(const [width,height] of [[1440,900],[768,1024],[390,844],[820,1180],[1024,1366]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'UNAUTHENTICATED',data:null,message:'请登录'})}));
  await page.goto('http://school.eduk12.top:3189/');await page.getByRole('heading',{name:'在更好的环境中 看见每一个独特的你'}).waitFor();
  await page.locator('.hs-campus-art').evaluate(img=>img.decode());await page.locator('.hs-brand img').all().then(imgs=>Promise.all(imgs.map(i=>i.evaluate(img=>img.decode()))));
  const bounds=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right}};return {copy:box('.hs-landing-copy'),cards:box('.hs-feature-strip'),overflow:document.documentElement.scrollWidth>innerWidth}});
  assert.equal(bounds.overflow,false);
  if(width>=601&&width<=1100&&height>width){assert.ok(Math.abs(bounds.copy.left-bounds.cards.left)<1);assert.ok(Math.abs(bounds.copy.right-bounds.cards.right)<1);}
  await page.screenshot({path:`campus-evidence/screenshots/home-${width}x${height}.png`});
  await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('textbox',{name:'用户名',exact:true}).waitFor();
  assert.equal(await page.locator('input[type=password]').count(),1);
  await page.getByRole('button',{name:'注册',exact:true}).click();await page.getByRole('textbox',{name:'注册码',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'继续注册',exact:true}).count(),1);
  if(width<1000){await page.getByRole('button',{name:'打开菜单'}).click();await page.getByRole('button',{name:'首页',exact:true}).click();}
  else await page.getByRole('button',{name:'首页',exact:true}).click();
  await page.getByRole('link',{name:'心理健康支持',exact:true}).click();assert.ok(new URL(page.url()).pathname.endsWith('/features/mental-health'));
  assert.deepEqual(errors,[]);evidence.push({width,height,bounds,status:'success'});await page.close();
 }
 writeFileSync('campus-evidence/browser.json',JSON.stringify({head:plan.head,component:plan.components.frontend,evidence,api:'synthetic unauthenticated browser fixture; PostgreSQL authority tested independently'},null,2));
}catch(error){const page=browser.contexts().flatMap(c=>c.pages()).at(-1);if(page){await page.screenshot({path:'campus-evidence/browser-failure.png'});writeFileSync('campus-evidence/browser-failure.json',JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),error:String(error)},null,2));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
