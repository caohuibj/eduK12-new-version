import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const dir='access-efficiency-evidence',plan=JSON.parse(readFileSync('access-efficiency-plan.json','utf8'));
const checks=JSON.parse(readFileSync(join(dir,'checks.json'),'utf8'));
const runtime=checks.runtime.frontend;
assert.equal(runtime.status,'success');
const tools=['.github/scripts/access-efficiency-browser.mjs','.github/release-tools/package-lock.json'].map(file=>execFileSync('git',['rev-parse',plan.head+':'+file],{encoding:'utf8'}).trim());
const browserKey=createHash('sha256').update(JSON.stringify([checks.inputs.builds.frontend,runtime.id,tools,'chromium-playwright-1.62.1','wcag2a,wcag2aa,wcag21aa'])).digest('hex');
const reuseFile=join(dir,'reuse.json');
if(existsSync(reuseFile)){
 const receipt=JSON.parse(readFileSync(reuseFile,'utf8')),old=receipt.checks.browser;
 if(old?.status==='success'&&old.key===browserKey&&Date.now()-Date.parse(old.at)<86400000){
  checks.browser={...old,reusedFrom:{runId:receipt.runId,artifactId:receipt.artifactId,head:receipt.checks.head}};
  cpSync(join(receipt.source,'browser'),join(dir,'browser'),{recursive:true});
  writeFileSync(join(dir,'checks.json'),JSON.stringify(checks,null,2));
  console.log('REUSED official pagination browser proof for the same frontend/runtime');process.exit(0);
 }
}
const run=(args)=>execFileSync(args[0],args.slice(1),{stdio:'inherit'});
run(['docker','run','-d','--name','access-ui','-p','127.0.0.1:3189:80','--add-host','backend:127.0.0.1',runtime.id]);
const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP eduk12.top 127.0.0.1, MAP training.eduk12.top 127.0.0.1','--no-proxy-server']});
mkdirSync(join(dir,'browser'),{recursive:true});
const evidence=[];
const variants=[
 {key:'training-courses',host:'training.eduk12.top',path:'/student',button:'加载更多课程',scope:'.training-course-section',endpoint:'/api/courses/my'},
 {key:'student-courses',host:'eduk12.top',path:'/student',button:'加载更多课程',scope:'.hui-student-home',endpoint:'/api/courses/my'},
 {key:'student-checkins',host:'eduk12.top',path:'/student/checkins',button:'加载更多打卡',scope:'.hui-student-tasks',endpoint:'/api/checkins/my'},
 {key:'teacher-submissions',host:'eduk12.top',path:'/checkins',button:'加载更多提交',scope:'.staff-dialog',endpoint:'/api/checkins/task-1/submissions',teacher:true},
 {key:'student-peers',host:'eduk12.top',path:'/student/checkins/task-1',button:'加载更多提交',scope:'[aria-labelledby=checkin-others-title]',endpoint:'/api/checkins/task-1/others-submissions',peers:true},
];
const course={id:'course-1',title:'合成课程',description:'合成课程简介',createdAt:'2026-01-01T00:00:00.000Z',status:'PUBLISHED',courseCode:'SYNTHETIC'};
const checkin={id:'task-1',title:'合成打卡',courseId:'course-1',course:{id:'course-1',title:'合成课程'},createdAt:'2026-01-01T00:00:00.000Z',allowViewOthers:true,content:'',images:[],videos:[],documents:[],_count:{submissions:45}};
try{
 for(const variant of variants)for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],calls=[];let nextFailures=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(!['eduk12.top','training.eduk12.top'].includes(url.hostname))return route.abort();
   if(url.pathname==='/access-ci-axe.js')return route.fulfill({contentType:'application/javascript',body:readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8')});
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const path=url.pathname;calls.push(url.pathname+url.search);
   let data={list:[],total:0,pageSize:20,counts:{ACTIONABLE:0,UPCOMING:0,EXPIRED:0,COMPLETED:0}};
   if(path==='/api/auth/me')data={id:'synthetic-user',username:'synthetic',nickname:'合成用户',role:variant.teacher?'TEACHER':'STUDENT',accountDomain:variant.host.startsWith('training')?'TRAINING':'LEGACY',isActive:true,mustChangePassword:false};
   else if(path==='/api/capabilities')data={cognitive:false,parentPortal:false};
   else if(path==='/api/courses')data={list:[course],total:1};
   else if(path==='/api/checkins')data={list:[checkin],total:1};
   else if(path==='/api/checkins/task-1')data=checkin;
   else if(path==='/api/checkins/task-1/my-submission')data=null;
   else if(path===variant.endpoint){
    const next=url.searchParams.has('cursor');
    if(next&&nextFailures++===0)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:-1,message:'合成临时失败',data:null})});
    const label=next?'第二页':'第一页';
    const row=variant.key.includes('courses')?{...course,id:next?'course-2':'course-1',title:label}
      :variant.key==='student-checkins'?{...checkin,id:next?'task-2':'task-1',title:label}
      :{id:next?'submission-2':'submission-1',content:label,images:[],createdAt:'2026-01-01T00:00:00.000Z',student:{id:'synthetic-student',username:'synthetic',nickname:'合成同学'}};
    data={list:[row],total:45,pageSize:20,hasMore:!next,nextCursor:next?null:'synthetic-next'};
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,data,message:'操作成功'})});
  });
  await page.goto(`http://${variant.host}:3189${variant.path}`);
  if(variant.teacher)await page.getByRole('button',{name:'查看提交',exact:true}).first().click();
  if(variant.peers)await page.getByRole('button',{name:'查看',exact:true}).click();
  await page.getByText('第一页',{exact:true}).waitFor();
  const button=page.getByRole('button',{name:variant.button,exact:true});await button.waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.addScriptTag({url:`http://${variant.host}:3189/access-ci-axe.js`});
  // Limit WCAG to the affected list/dialog surface. Existing application-wide
  // navigation is not a newly changed component or an extra regression gate.
  const scope=await page.locator(variant.scope).count()?variant.scope:variant.peers?'.student-submit-page':variant.scope;
  const axe=await page.evaluate(async selector=>window.axe.run({include:[selector]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}),scope);
  assert.deepEqual(axe.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(n=>n.target)})),[]);
  await page.screenshot({path:join(dir,'browser',`${variant.key}-${width}-first.png`),fullPage:true});
  await button.click();await page.getByText('合成临时失败',{exact:false}).waitFor();
  assert.equal(await page.getByText('第一页',{exact:true}).count(),1);
  await button.click();await page.getByText('第二页',{exact:true}).waitFor();
  assert.equal(await page.getByText('第一页',{exact:true}).count(),1);assert.equal(await button.count(),0);
  assert.equal(calls.filter(call=>call.startsWith(variant.endpoint+'?cursor=')).length,2);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:join(dir,'browser',`${variant.key}-${width}-next.png`),fullPage:true});
  evidence.push({view:variant.key,width,status:'success',calls,scope,wcagViolations:0});await page.close();
 }
 checks.browser={status:'success',at:new Date().toISOString(),key:browserKey,sourceHead:plan.head,image:runtime.id};
 writeFileSync(join(dir,'browser','browser.json'),JSON.stringify({head:plan.head,image:runtime.id,evidence,authority:'Synthetic UI fixtures; PostgreSQL/Redis authority and privacy tested independently.'},null,2));
 writeFileSync(join(dir,'checks.json'),JSON.stringify(checks,null,2));
}catch(error){
 const page=browser.contexts().flatMap(context=>context.pages()).at(-1);
 if(page){await page.screenshot({path:join(dir,'browser','failure.png'),fullPage:true});writeFileSync(join(dir,'browser','failure.json'),JSON.stringify({url:page.url(),text:await page.locator('body').innerText(),error:String(error)},null,2));}
 throw error;
}finally{await browser.close();run(['docker','rm','-f','access-ui']);}
