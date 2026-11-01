import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const p=JSON.parse(readFileSync('homepage-copy-plan.json','utf8'));
const checks=JSON.parse(readFileSync('homepage-copy-evidence/checks.json','utf8'));
assert.equal(p.head,checks.head);
assert.equal(p.frontendTree,checks.frontendTree);
const tag='eduk12-homepage-copy:'+p.head;
const run=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
assert.equal(run('image','inspect','--format','{{.Id}}',tag),checks.image);
// The actual scanned Nginx image serves its compiled assets. API calls are
// anonymous UI-only fixtures; this is never account/permission evidence.
const container='homepage-copy-browser-'+p.head.slice(0,12);
let browser, lastPage;
mkdirSync('homepage-copy-evidence/screenshots',{recursive:true});
const records=[];
try {
 run('run','-d','--name',container,'-p','127.0.0.1:3189:80',tag);
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--host-resolver-rules=MAP training.eduk12.top 127.0.0.1, MAP school.eduk12.top 127.0.0.1, MAP teacher.eduk12.top 127.0.0.1, MAP survey.eduk12.top 127.0.0.1']});
 for(const copy of p.pages) for(const [width,height] of [[1440,900],[390,844]]) {
  const host=copy.page+'.eduk12.top';
  const page=await browser.newPage({viewport:{width,height}}), errors=[],requests=[];
  lastPage=page;
  page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&!new URL(response.url()).pathname.startsWith('/api/'))errors.push(response.status()+' '+response.url());});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname===host&&(url.port==='3189'||url.origin==='https://'+host)){
    const response=await fetch('http://127.0.0.1:3189'+url.pathname+url.search,{signal:AbortSignal.timeout(5000),headers:{Host:url.host,'Accept-Encoding':'identity'}});
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   }
   errors.push('Unexpected origin '+url.origin);return route.abort();
  });
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;requests.push(path);
   if(!['/api/auth/me','/api/capabilities','/api/campus/auth/me','/api/huiteacher/auth/me','/api/survey/auth/me'].includes(path))errors.push('Unexpected API '+path);
   return route.fulfill({status:path==='/api/capabilities'?200:401,contentType:'application/json',body:JSON.stringify({code:path==='/api/capabilities'?0:401,data:path==='/api/capabilities'?{cognitive:false,parentPortal:false}:null,message:'请登录'})});
  });
  const origin=`http://${host}:3189`;
  const inspect=async path=>{
   assert.equal((await page.goto(origin+path)).status(),200);
   await page.locator('h1').first().waitFor();await page.waitForLoadState('networkidle');
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
   assert.ok((await page.locator('h1').first().innerText()).trim(),'Empty public heading');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Public page overflow');
   assert.deepEqual(errors,[]);
  };
  await inspect('/');
  if(copy.static) {
   const paths=[...new Set(await page.locator('a[href*="/features/"]').evaluateAll(links=>links.map(a=>new URL(a.href).pathname)))];
   assert.ok(paths.length,'No feature navigation on '+copy.page);
   for(const path of paths) {
    assert.match(path,/^\/features\/[a-zA-Z0-9_-]+$/);
    // Navigate by the real card, then check direct refresh of the public route.
    await page.locator(`a[href*="${path}"]`).first().click();
    await page.waitForURL(url=>url.hostname===host&&url.pathname===path);requests.length=0;
    await inspect(path);
    if(['school','teacher'].includes(copy.page))assert.deepEqual(requests,[],'Public guide must not load sessions or business data');
    const entry=page.locator('a[href*="login"]');
    assert.ok(await entry.count(),'Missing existing login entry');
    for(const href of await entry.evaluateAll(links=>links.map(a=>a.getAttribute('href')))) {
     const url=new URL(href,origin);assert.ok(url.origin===origin || url.origin==='https://'+host || copy.page==='survey'&&url.origin==='https://training.eduk12.top','Unexpected login origin');assert.ok(/\/(?:student\/|teacher\/|admin\/)?login$/.test(url.pathname),'Unexpected login target '+url.pathname);
    }
    await page.screenshot({path:`homepage-copy-evidence/screenshots/${copy.page}-${path.split('/').at(-1)}-${width}.png`,fullPage:true});
    const back=page.locator('a[href="/"]:visible, a[href^="/#"]:visible');assert.ok(await back.count(),'Missing home navigation');
    await back.first().click();await page.waitForURL(url=>url.pathname==='/');
    records.push({page:copy.page,path,width,height,status:'success'});
   }
  } else if(copy.page==='training') {
   for(const [selector,expected] of [['.training-eyebrow',copy.eyebrow],['#training-title',copy.heading],['.training-portal-description',copy.description]])assert.equal(await page.locator(selector).textContent(),expected.join(''));
  } else {
   assert.equal(new URL(await page.getByRole('link',{name:copy.title,exact:true}).getAttribute('href'),page.url()).pathname,'/features/positive-campus');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 writeFileSync('homepage-copy-evidence/browser.json',JSON.stringify({head:p.head,frontendTree:p.frontendTree,image:checks.image,records,api:'anonymous UI-only fixture; no account or permission claim'},null,2));
} catch(error) {
 if(lastPage && !lastPage.isClosed()) {
  console.error(error);
  await lastPage.screenshot({path:'homepage-copy-evidence/browser-failure.png',fullPage:true,timeout:5000}).catch(()=>{});
  writeFileSync('homepage-copy-evidence/browser-failure.json',JSON.stringify({url:lastPage.url(),text:await lastPage.locator('body').innerText({timeout:1000}).catch(()=>'unavailable'),error:String(error)},null,2));
 }
 throw error;
} finally {if(browser)await browser.close();run('rm','-f',container);}
