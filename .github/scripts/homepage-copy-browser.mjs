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
let browser;
mkdirSync('homepage-copy-evidence/screenshots',{recursive:true});
const records=[];
try {
 run('run','-d','--name',container,'-p','127.0.0.1:3189:80',tag);
 browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP training.localhost 127.0.0.1, MAP school.localhost 127.0.0.1']});
 for(const copy of p.pages) for(const [width,height] of [[1440,900],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{"code":"UNAUTHENTICATED","data":null,"message":"请登录"}'}));
  const response=await page.goto(`http://${copy.page}.localhost:3189/`);
  assert.equal(response.status(),200);
  if(copy.page==='training') {
   await page.locator('#training-title').waitFor();
   for(const [selector,expected] of [['.training-eyebrow',copy.eyebrow],['#training-title',copy.heading],['.training-portal-description',copy.description]]) {
    assert.equal(await page.locator(selector).textContent(),expected.join(''));
    assert.equal(await page.locator(selector+' br').count(),expected.length-1);
   }
  } else {
   await page.getByRole('link',{name:copy.title,exact:true}).waitFor();
   assert.equal(new URL(await page.getByRole('link',{name:copy.title,exact:true}).getAttribute('href'),page.url()).pathname,'/features/positive-campus');
  }
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`homepage-copy-evidence/screenshots/${copy.page}-${width}.png`,fullPage:true});
  records.push({page:copy.page,width,height,status:'success'});await page.close();
 }
 writeFileSync('homepage-copy-evidence/browser.json',JSON.stringify({head:p.head,frontendTree:p.frontendTree,image:checks.image,records,api:'anonymous UI-only fixture; no account or permission claim'},null,2));
} finally {if(browser)await browser.close();run('rm','-f',container);}
