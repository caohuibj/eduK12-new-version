// Compiled UI smoke with synthetic read-only API fixtures; not backend authority evidence.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';import {createRequire} from 'node:module';import {verifyBuiltSource} from './training-polish-checks.mjs';
verifyBuiltSource();const require=createRequire(new URL('../release-tools/package.json',import.meta.url));const {chromium}=require('playwright-core');
assert.equal(require('playwright-core/package.json').version,require('./package.json').dependencies['playwright-core']);
const dist=resolve('server-version/frontend/dist'),evidence=resolve('training-polish-evidence');await mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+p);assert(file.startsWith(dist+sep)||file===dist);
 try{if(!(await stat(file)).isFile())throw Error();}catch{if(extname(p)){res.writeHead(404);res.end();return;}file=resolve(dist,'index.html');}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(400);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
const courses=Array.from({length:7},(_,i)=>({id:'c'+(i+1),title:'合成测试课程 '+(i+1),description:'仅用于编译页面验证。',creatorId:'synthetic-TEACHER',courseCode:'LOCAL'+i,status:'PUBLISHED',isRecruiting:true,isLibrary:false,studentCount:2,createdAt:'2026-10-01T00:00:00Z'}));
const assignments=[{id:'a1',courseId:'c1',title:'待完成的练习',description:'合成未交作答',deadline:null,submitted:false},{id:'a2',courseId:'c1',title:'已完成的练习',description:'合成已提交作答',deadline:null,submitted:true,mySubmission:{id:'s2',status:'SUBMITTED'}}];
const checkins=[{id:'k1',courseId:'c1',title:'待完成的打卡',submitted:false},{id:'k2',courseId:'c1',title:'已完成的打卡',submitted:true,submission:{id:'ks2'}}];
const questions=[false,true].map((completed,i)=>({id:'q'+i,name:completed?'已完成的测评':'待完成的测评',description:'合成测评',completed,inProgress:false,assessmentId:completed?'qa1':null,courses:[{id:'c1',title:courses[0].title}]}));
const todo={key:'ASSIGNMENT:a1',kind:'ASSIGNMENT',typeLabel:'练习',title:'待完成的练习',courses:[{id:'c1',title:courses[0].title}],state:'TODO',stateLabel:'未完成',deadline:null,updatedAt:null,href:'/student/assignments/a1?courseId=c1&courseSection=assignments',action:'去完成'};
const feedback={...todo,key:'ASSIGNMENT:a2',title:'已完成的练习',state:'REVIEWED',stateLabel:'已有评语',href:'/student/assignments/a2?courseId=c1&courseSection=assignments',action:'查看反馈'};
const teaching={summary:{pendingSubmissions:1,pendingAssignments:1,courses:7,publishedCourses:7},list:[{id:'a1',title:'待完成的练习',course:{id:'c1',title:courses[0].title},pendingCount:1,oldestSubmittedAt:'2026-10-24T00:00:00Z',href:'/courses/c1/detail?section=assignments&assignmentId=a1'}],total:1,page:1,pageSize:5};
const tools=[{id:'tool1',name:'合成普通组合问卷',kind:'composition',description:'可以按需展开的问卷说明。',source:'owned',status:'DRAFT',version:'1',href:'/questionnaire-products/tool1'}];
let browser,page;const checks=[],unexpected=[],errors=[];const deadline=setTimeout(async()=>{server.closeAllConnections();await browser?.close();process.exit(1)},180000);
try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome'});
 for(const role of ['TEACHER','STUDENT'])for(const theme of ['light','dark']){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});await context.addInitScript(({role,theme})=>{localStorage.setItem('training:appearance:boot:v1',theme);localStorage.setItem('training:appearance:v1:synthetic-'+role,theme)},{role,theme});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname,q=u.searchParams;
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,data,message:''})});
   if(u.hostname!=='training.eduk12.top'){unexpected.push(u.origin);return route.abort();}
   if(p.startsWith('/api/')){
    if(req.method()!=='GET'){unexpected.push(req.method()+' '+p);return json(null,500);}
    if(p==='/api/auth/me')return json({id:'synthetic-'+role,username:'synthetic',nickname:'合成测试账号',role,platformRole:'STANDARD',mustChangePassword:false});
    if(p==='/api/capabilities')return json({cognitive:false,parentPortal:false});
    if(p==='/api/organizations')return json({list:[],total:0,page:1,pageSize:100,platformRole:'STANDARD',allowedActions:[]});
    if(p==='/api/training/reference-governance/capabilities')return json([]);
    if(p==='/api/courses/my/teaching-overview')return json(teaching);
    if(p==='/api/courses/my/learning-inbox'){const list=q.get('view')==='feedback'?[feedback]:[todo];return json({summary:{todo:1,feedback:1},counts:{ALL:1,ASSIGNMENT:1,CHECKIN:0,ASSESSMENT:0},list,total:1,page:1,pageSize:6,generatedAt:'2026-10-24T00:00:00Z'});}
    if(p==='/api/courses/my')return json({list:[courses[0]],total:1,nextCursor:null,hasMore:false});
    if(p==='/api/courses'){const size=+(q.get('pageSize')||6),offset=(+(q.get('page')||1)-1)*size;return json({list:courses.slice(offset,offset+size),total:7});}
    if(p==='/api/courses/c1')return json(courses[0]);
    if(p==='/api/courses/c1/assignments')return json({list:assignments,total:2});
    if(p==='/api/courses/c1/checkins')return json({list:checkins,total:2});
    if(p==='/api/questionnaires/available')return json({list:questions,total:2});
    if(p==='/api/scales/available')return json({list:[],total:0});
    if(p==='/api/cognitive/assignments/my')return json([]);
    if(p==='/api/composite-assessments/available')return json({list:[],total:0});
    if(p==='/api/training-workspace/tools')return json({list:tools,total:1});
    if(p==='/api/training-workspace/media')return json({list:[],total:0});
    unexpected.push('GET '+p+u.search);return json(null,500);
   }
   if(req.method()!=='GET'){unexpected.push(req.method()+' '+p);return route.abort();}
   const r=await fetch(local+p+u.search);if(!r.ok)unexpected.push('static '+r.status+' '+p);return route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await r.arrayBuffer())});
  });
  async function proof(name){await page.waitForLoadState('networkidle');assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page horizontal overflow');
   assert.equal(await page.locator('.training-workspace-shell').getAttribute('data-training-theme'),theme);await page.screenshot({path:resolve(evidence,name+'.png'),fullPage:true});checks.push(name);}
  const home=role==='TEACHER'?'/dashboard':'/student';
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});await page.goto('http://training.eduk12.top'+home);
   if(role==='TEACHER'){
    await page.getByRole('link',{name:courses[0].title,exact:true}).waitFor();const cols=await page.locator('.training-trainer-course-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(cols,width>=1100?3:width>=701?2:1);
    assert.equal(await page.locator('.trainer-shortcut').count(),1);assert(await page.locator('.trainer-shortcut').evaluate(el=>el.getBoundingClientRect().height<125));
   }else{await page.getByRole('heading',{name:'我的课程',exact:true}).waitFor();assert(await page.locator('.learning-shortcut').first().evaluate(el=>el.getBoundingClientRect().height<125));}
   const account=page.locator('.hui-account');assert(await account.locator('.training-appearance-control').isVisible());assert(await account.evaluate(el=>{const a=el.querySelector('.training-appearance-control'),b=[...el.querySelectorAll('button')].find(b=>b.textContent.includes('退出'));return Boolean(a&&b&&(b.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING));}));await proof(role+'-'+theme+'-'+width);
   if(width===1440){
    if(role==='TEACHER'){await page.getByRole('button',{name:/待批阅练习.*份提交/}).click();const link=page.getByRole('link',{name:'查看并批阅：待完成的练习',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),teaching.list[0].href);await proof('review-link-'+theme);}
    else{await page.getByRole('button',{name:/待办任务.*跨课程/}).click();await page.getByRole('link',{name:'去完成：待完成的练习',exact:true}).waitFor();await page.getByRole('button',{name:/反馈与结果.*练习评语/}).click();await page.getByRole('link',{name:'查看反馈：已完成的练习',exact:true}).waitFor();assert.equal(await page.getByRole('group',{name:'学习内容分类'}).getByRole('button',{name:/打卡/}).count(),0);await proof('student-inbox-'+theme);}
   }
  }
  if(role==='STUDENT'){
   for(const section of ['assignments','checkins','assessments']){
    await page.goto('http://training.eduk12.top/student/courses/c1?section='+section);await page.locator('.training-completion-filter').waitFor();
    await page.getByRole('button',{name:/^已完成/}).click();await page.locator('.training-task-item[data-completion="complete"]').waitFor();assert.equal(await page.locator('.training-task-item').count(),1);
    await proof('student-'+section+'-completed-'+theme);
    await page.getByRole('button',{name:/^未完成/}).click();await page.locator('.training-task-item[data-completion="incomplete"]').waitFor();assert.equal(await page.locator('.training-task-item').count(),1);await proof('student-'+section+'-incomplete-'+theme);
   }
  }else{
   await page.goto('http://training.eduk12.top/toolkit?kind=composition');await page.getByRole('heading',{name:tools[0].name,exact:true}).waitFor();
   assert.equal(await page.getByText(tools[0].description,{exact:true}).count(),0);await page.getByRole('button',{name:'展开详情：'+tools[0].name,exact:true}).click();await page.getByText(tools[0].description,{exact:true}).waitFor();
   await proof('tool-details-'+theme);const bar=page.locator('.training-library-filter');const first=bar.getByRole('button').first();await first.focus();assert(await first.evaluate(el=>{const b=el.closest('.training-library-filter').getBoundingClientRect(),r=el.getBoundingClientRect();return r.left>=b.left+4&&r.right<=b.right-4;}));await proof('tool-focus-inset-'+theme);
   await page.goto('http://training.eduk12.top/media');await page.getByRole('heading',{name:'媒体',exact:true}).waitFor();await proof('media-filter-'+theme);
  }
  await context.close();
 }
 await writeFile(resolve(evidence,'browser.json'),JSON.stringify({checks,unexpected,errors,syntheticOnly:true,compiledArtifact:true},null,2));
}catch(e){if(page&&!page.isClosed()){await page.screenshot({path:resolve(evidence,'browser-failure.png'),fullPage:true});await writeFile(resolve(evidence,'browser-failure.json'),JSON.stringify({error:String(e),url:page.url(),body:await page.locator('body').innerText(),checks,unexpected,errors},null,2));}throw e;}
finally{clearTimeout(deadline);await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
