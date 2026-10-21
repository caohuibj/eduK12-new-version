// Frontend-only compiled Chromium smoke. All API data is synthetic; no backend or DB.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(process.env.FRONTEND_DIST || resolve(root, 'server-version/frontend/dist'));
const require = createRequire(new URL('../release-tools/package.json', import.meta.url));
const { chromium } = require('playwright-core');
assert.equal(require('playwright-core/package.json').version, require('./package.json').dependencies['playwright-core']);
await stat(resolve(dist, 'index.html'));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(dist, '.' + pathname);
    assert.ok(file === dist || file.startsWith(dist + sep));
    try { if (!(await stat(file)).isFile()) throw new Error('not a file'); }
    catch { if (extname(pathname)) { res.writeHead(404); res.end(); return; } file = resolve(dist, 'index.html'); }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(400); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
// Only synthetic, bounded Training contracts; never contact the real API.
const evidence=resolve(root,'training-workspace-evidence');await mkdir(evidence,{recursive:true});
const courses=Array.from({length:7},(_,i)=>({id:'c'+(i+1),title:'Synthetic course '+(i+1),description:'Course description '.repeat(25),creatorId:'trainer',courseCode:'SYNTHETIC'+i,status:'PUBLISHED',isRecruiting:true,isLibrary:false,studentCount:0,createdAt:'2026-01-01T00:00:00Z'}));
const assessments=Array.from({length:7},(_,i)=>({id:'q'+i,name:'Synthetic assessment '+i,status:i<2?'PUBLISHED':'DRAFT',kind:'COLLECTION',editHref:'/questionnaire-products/q'+i,tags:[]}));
const unexpected=[],errors=[],checks=[];let browser,page;
const deadline=setTimeout(async()=>{server.closeAllConnections();await browser?.close();process.exit(1)},120000);
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:900}});page=await context.newPage();
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname,q=url.searchParams;
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,data,message:''})});
  if(url.hostname!=='training.eduk12.top'){unexpected.push(url.origin);return route.abort()}
  if(p.startsWith('/api/')){
   if(request.method()!=='GET'){unexpected.push(request.method()+' '+p);return json(null,500)}
   if(p==='/api/auth/me')return json({id:'trainer',username:'synthetic',nickname:'Synthetic trainer',role:'TEACHER',platformRole:'STANDARD',mustChangePassword:false});
   if(p==='/api/capabilities')return json({cognitive:false,parentPortal:false});
   if(p==='/api/training/reference-governance/capabilities')return json([]);
   if(p==='/api/organizations')return json({list:[],total:0,page:1,pageSize:100,platformRole:'STANDARD',allowedActions:[]});
   if(['/api/relational-assessments/catalog','/api/relational-assessments/tasks'].includes(p))return json({list:[]});
   if(p==='/api/courses'){const size=Number(q.get('pageSize')||20),start=(Number(q.get('page')||1)-1)*size;return json({list:courses.slice(start,start+size),total:7})}
   if(p==='/api/courses/c1')return json(courses[0]);
   if(p==='/api/courses/c1/training-assessments')return json({list:[],total:0});
   if(p==='/api/questionnaire-products'){const list=assessments.filter(v=>!q.get('status')||v.status===q.get('status'));return json({list,total:list.length})}
   if(p==='/api/assignments'||p==='/api/checkins'){
    const list=q.has('courseId')||q.get('search')==='unmatched'?[]:[{id:'old',title:p.endsWith('assignments')?'Synthetic prior exercise':'Synthetic prior check-in',courseId:'c2',course:{id:'c2',title:'Synthetic source course',creatorId:'trainer'}}];return json({list,total:list.length});
   }
   unexpected.push('GET '+p+url.search);return json(null,500);
  }
  if(request.method()!=='GET'){unexpected.push(request.method()+' '+p);return route.abort()}
  const response=await fetch(local+p+url.search);if(!response.ok)unexpected.push('Static '+response.status+' '+p);
  return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await response.arrayBuffer())});
 });
 async function proof(name){await page.waitForLoadState('networkidle');assert.deepEqual(unexpected,[],name);assert.deepEqual(errors,[],name);await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true});checks.push(name)}
 await page.goto('http://training.eduk12.top/dashboard');await page.getByRole('heading',{name:'Synthetic course 1',exact:true}).waitFor();
 const size=page.locator('select').filter({visible:true});assert.equal(await size.count(),1);await size.selectOption('6');await page.getByRole('heading',{name:'Synthetic course 6',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Synthetic course 6',exact:true}).waitFor();assert.equal(await size.inputValue(),'6');await proof('dashboard-page-size-persistence');
 await page.goto('http://training.eduk12.top/courses/c1/detail?section=analysis');await page.getByRole('link',{name:'复用测评',exact:true}).waitFor();assert.match(page.url(),/section=assessments/);assert.equal(await page.getByRole('navigation',{name:'课程管理内容'}).getByRole('button').count(),4);await proof('hidden-analysis-old-link');
 await page.getByRole('link',{name:'复用测评',exact:true}).click();await page.getByRole('button',{name:'已发布',exact:true}).click();await page.getByText('共 2 份',{exact:true}).waitFor();assert.equal(await page.locator('.tql-card').count(),2);assert.equal(await page.getByRole('navigation',{name:'课程管理内容'}).getByRole('link').count(),4);await proof('assessment-published-filter');
 await page.getByRole('button',{name:'草稿',exact:true}).click();await page.getByText('共 5 份',{exact:true}).waitFor();await page.reload();await page.getByText('共 5 份',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'草稿',exact:true}).getAttribute('aria-pressed'),'true');await proof('assessment-draft-refresh');
 for(const [tab,label]of [['练习','练习'],['打卡','打卡']]){
  await page.getByRole('link',{name:tab,exact:true}).click();await page.getByRole('link',{name:'复用'+label,exact:true}).click();const dialog=page.getByRole('dialog',{name:'复用'+label,exact:true});await dialog.getByRole('button',{name:'使用此内容',exact:true}).waitFor();await proof('reuse-'+(label==='练习'?'exercise':'checkin'));
  await page.setViewportSize({width:390,height:844});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await proof('reuse-mobile-'+(label==='练习'?'exercise':'checkin'));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.setViewportSize({width:1365,height:900});
 }
 await page.getByRole('link',{name:'课程管理',exact:true}).click();await page.getByRole('textbox',{name:'课程介绍',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'管理学员',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'测评与结果',exact:true}).count(),0);await proof('course-management');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await proof('course-management-mobile');
 await writeFile(resolve(evidence,'browser.json'),JSON.stringify({checks,unexpected,errors,syntheticOnly:true},null,2));
}catch(error){if(page){await page.screenshot({path:resolve(evidence,'browser-failure.png'),fullPage:true});await writeFile(resolve(evidence,'browser-failure.json'),JSON.stringify({error:String(error),url:page.url(),unexpected,errors,checks,body:await page.locator('body').innerText()},null,2))}throw error}finally{clearTimeout(deadline);await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
