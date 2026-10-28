import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),front=resolve('server-version/frontend'),dist=resolve(front,'dist'),out=resolve('onboarding-evidence/page-loading');mkdirSync(out,{recursive:true});
assert.equal(process.env.GITHUB_ACTIONS,'true');
const result={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'RUNNING',scope:'One production build. Built static JS/CSS gzip1 estimates and sandboxed compiled-page consumers with synthetic read-only API replies. No production transfer, RTT, login, START or FINAL qualification.',cases:[],sandbox:null};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(result,null,2)+'\n');save();let browser;
try{
 const started=Date.now();let buildLog;
 try{buildLog=execFileSync('npm',['run','build','--','--manifest'],{cwd:front,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});}catch(e){writeFileSync(resolve(out,'build.log'),String(e.stdout??'')+String(e.stderr??''));throw e;}
 writeFileSync(resolve(out,'build.log'),buildLog);cpSync(dist,resolve(out,'dist'),{recursive:true});result.build={exitCode:0,elapsedMs:Date.now()-started,command:'npm run build -- --manifest'};save();
 const manifest=JSON.parse(readFileSync(resolve(dist,'.vite/manifest.json'))),base=JSON.parse(readFileSync('docs/performance/page-loading-20261028/evidence/main-entry-closures.json'));
 const find=name=>{const keys=Object.keys(manifest).filter(k=>manifest[k].file.split('/').pop().startsWith(name+'-')&&manifest[k].file.endsWith('.js'));assert.equal(keys.length,1,name);return keys[0]};
 function closure(keys){const seen=new Set(),files=new Set();function visit(key){if(seen.has(key))return;seen.add(key);const v=manifest[key];assert(v,key);files.add(v.file);for(const p of v.css??[])files.add(p);for(const k of v.imports??[])visit(k)}for(const key of keys)visit(key);return [...files].sort();}
 const selectors={'Training app shell':[find('App')],'Training homepage':[find('App'),find('TrainingPortal')],'Training learner home':[find('App'),find('TrainingLearnerHome')],'Training composite answer':[find('App'),'src/modules/composite/CompositeAssessmentPage.tsx'],'Training standalone scale answer':[find('App'),'src/pages/student/ScaleAssessment.tsx'],'Training composite report':[find('App'),'src/modules/composite/CompositeReportPage.tsx'],'School app homepage and shell':[find('SchoolApp')],'Teacher app homepage and shell':[find('HuiteacherApp')],'Survey researcher entry':[find('SurveyApp')],'Survey participant entry':[find('SurveyPublicApp')]};
 result.closures=Object.entries(selectors).map(([name,roots])=>{const files=closure(['index.html',...roots]).map(file=>{const b=readFileSync(resolve(dist,file));return {file,bytes:b.length,gzip1Bytes:gzipSync(b,{level:1}).length,sha256:createHash('sha256').update(b).digest('hex')}});const baseline=base.rows.find(x=>x.name===name);assert(baseline);return {name,count:files.length,rawBytes:files.reduce((n,f)=>n+f.bytes,0),gzip1Bytes:files.reduce((n,f)=>n+f.gzip1Bytes,0),baselineGzip1Bytes:baseline.gzip1Bytes,files}});
 for(const name of ['School app homepage and shell','Teacher app homepage and shell']){const row=result.closures.find(r=>r.name===name);assert(row.gzip1Bytes<row.baselineGzip1Bytes,name+' did not reduce eager bytes');assert(!row.files.some(f=>/ScaleDefinitionEditor|CognitiveRunner|SituationalRunner|ResearchFormEditor/.test(f.file)),'Heavy optional family still eager')}
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));save();
 const {chromium}=require('../release-tools/node_modules/playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});result.sandbox=await require('../../server-version/e2e/school-teacher-chrome.cjs').verifyChromeSandbox(browser);assert.equal(result.sandbox.ok,true);save();
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
 const envelope=data=>({code:0,message:'成功',data});
 async function scenario(name,host,path,width,mode,work){
  const row={name,host,path,width,status:'RUNNING',requests:[],api:[]};result.cases.push(row);save();const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let authRelease;const authWait=new Promise(r=>{authRelease=r});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());row.requests.push(url.pathname);
   if(url.hostname!==host){errors.push('Unexpected external origin '+url.origin);return route.abort()}
   if(url.pathname.startsWith('/api/')){
    row.api.push({path:url.pathname,method:request.method()});if(request.method()!=='GET'){errors.push('Unexpected mutation');return route.abort()}
    if(url.pathname==='/api/capabilities')return route.fulfill({contentType:'application/json',body:JSON.stringify(envelope({cognitive:false,parentPortal:false}))});
    if(url.pathname.endsWith('/auth/me')||url.pathname==='/api/auth/profile'){
     if(mode==='pending')await authWait;
     if(mode==='teacher')return route.fulfill({contentType:'application/json',body:JSON.stringify(envelope({id:'fixture-teacher',username:'合成教师',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'fixture-school',organizationName:'合成学校',productAdmin:true}]}))});
     return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:401,message:'Not signed in',data:null})});
    }
    if(mode==='teacher'&&url.pathname.startsWith('/api/huiteacher/')){
     const suffix=url.pathname.slice('/api/huiteacher'.length);
     if(suffix.endsWith('/roster-files/capabilities'))return route.fulfill({contentType:'application/json',body:JSON.stringify(envelope({structure:true,personnel:false,batchImport:false}))});
     if(suffix.endsWith('/tool-authoring-capabilities'))return route.fulfill({contentType:'application/json',body:JSON.stringify(envelope({canAuthor:false,authorableToolKinds:[]}))});
     if(['/my-form-tasks','/my-private-form-tasks','/my-scale-tasks','/my-assessment-tasks','/organizations/fixture-school/units','/organizations/fixture-school/members'].includes(suffix))return route.fulfill({contentType:'application/json',body:JSON.stringify(envelope({list:[],nextCursor:null,truncated:false}))});
    }
    errors.push('Unexpected API '+url.pathname);return route.abort();
   }
   const relative=url.pathname.replace(/^\/+/,''),file=resolve(dist,relative);if(file!==dist&&!file.startsWith(dist+'/'))return route.abort();
   if(existsSync(file)&&extname(file))return route.fulfill({path:file,contentType:mime[extname(file)]??'application/octet-stream'});
   if(!extname(url.pathname))return route.fulfill({path:resolve(dist,'index.html'),contentType:'text/html'});
   errors.push('Missing static '+url.pathname);return route.abort();
  });
  try{await page.goto('https://'+host+path,{waitUntil:'domcontentloaded'});await work(page,row,authRelease);assert.deepEqual(errors,[]);row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(row.overflow,false);await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,animations:'disabled'});assert.deepEqual(errors,[]);row.status='PASS';}catch(e){row.status='FAIL';row.error=String(e.stack??e);throw e}finally{authRelease();save();await context.close()}
 }
 await scenario('school-public-pending','school.eduk12.top','/',390,'pending',async(page,row)=>{await page.getByRole('heading',{level:1}).filter({hasText:'看见每一个独特的你'}).waitFor();assert(!row.requests.some(p=>/SchoolActivityManager|SchoolStudentTasks|ScaleDefinitionEditor|CognitiveRunner/.test(p)));});
 await scenario('teacher-public-pending','teacher.eduk12.top','/',768,'pending',async(page,row)=>{await page.getByRole('heading',{level:1}).filter({hasText:'走向更好的教育'}).waitFor();assert(!row.requests.some(p=>/HuiteacherFormStudio|EducationRosterManagement|ScaleDefinitionEditor/.test(p)));});
 await scenario('school-protected-pending','school.eduk12.top','/workspace/tasks',390,'pending',async(page,row)=>{await page.getByText('正在核对校园会话…').waitFor();assert.equal(await page.locator('.hs-landing-hero').count(),0);assert(!row.requests.some(p=>/huischool-campus-(sunlight|moonlight).*\.webp/.test(p)));});
 await scenario('teacher-workspace-lazy','teacher.eduk12.top','/',1280,'teacher',async(page,row)=>{
  await page.getByText('暂无分配给你的测评任务。').waitFor();assert(!row.api.some(r=>/\/(units|members)$/.test(r.path)));assert(!row.requests.some(p=>/HuiteacherFormStudio|HuiteacherEvaluationStudio|EducationRosterManagement/.test(p)));
  await page.getByRole('navigation',{name:'Teacher 工作台'}).getByRole('button',{name:'学校改进'}).click();await page.getByRole('button',{name:'刷新学校信息'}).waitFor();await page.getByText('暂无年级和班级，可通过批量导入或手动创建添加。').waitFor();
  for(const suffix of ['/units','/members'])assert.equal(row.api.filter(r=>r.path.endsWith(suffix)).length,1);
  assert(!row.requests.some(p=>/HuiteacherFormStudio|HuiteacherEvaluationStudio/.test(p)));
 });
 await scenario('training-public','training.eduk12.top','/',390,'anonymous',async page=>{await page.locator('#training-title').waitFor();});
 await scenario('survey-public','survey.eduk12.top','/',1280,'anonymous',async page=>{await page.getByRole('heading',{level:1}).waitFor();});
 result.status='PASS';save();
}catch(e){result.status='FAIL';result.error=String(e.stack??e);save();throw e;}finally{await browser?.close();save();}
