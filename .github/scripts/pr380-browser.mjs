import assert from 'node:assert/strict';
import {restoreBrowserBuild} from './pr380-browser-reuse.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),front=resolve('server-version/frontend'),dist=resolve(front,'dist'),out=resolve('onboarding-evidence/postlogin');mkdirSync(out,{recursive:true});
assert.equal(process.env.GITHUB_ACTIONS,'true');
const result={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'RUNNING',scope:'Original official production build reused without rebuilding; two original passed consumers retained, three missing consumers execute. Built static JS/CSS gzip1 estimates and sandboxed compiled-page consumers with synthetic read-only API replies. No production transfer, RTT, login, START or FINAL qualification.',cases:[],sandbox:null};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(result,null,2)+'\n');save();let browser;
try{
 const {report:originalBrowser,origin}=await restoreBrowserBuild();
 result.build={...originalBrowser.build,executedThisRun:false,reusedFrom:origin};
 cpSync(dist,resolve(out,'dist'),{recursive:true});
 for(const name of ['school-student-navigation','teacher-list-without-answer-code']){const row=originalBrowser.cases.find(c=>c.name===name);assert.equal(row?.status,'PASS');result.cases.push({...row,executedThisRun:false,reusedFrom:origin});}save();
 const manifest=JSON.parse(readFileSync(resolve(dist,'.vite/manifest.json'))),base={rows:JSON.parse(readFileSync('docs/performance/postlogin-20261028/baseline/pr378-browser.json')).closures};
 const find=name=>{const keys=Object.keys(manifest).filter(k=>manifest[k].file.split('/').pop().startsWith(name+'-')&&manifest[k].file.endsWith('.js'));assert.equal(keys.length,1,name);return keys[0]};
 function closure(keys){const seen=new Set(),files=new Set();function visit(key){if(seen.has(key))return;seen.add(key);const v=manifest[key];assert(v,key);files.add(v.file);for(const p of v.css??[])files.add(p);for(const k of v.imports??[])visit(k)}for(const key of keys)visit(key);return [...files].sort();}
 const selectors={'Training app shell':[find('App')],'Training homepage':[find('App'),find('TrainingPortal')],'Training learner home':[find('App'),find('TrainingLearnerHome')],'Training composite answer':[find('App'),'src/modules/composite/CompositeAssessmentPage.tsx'],'Training standalone scale answer':[find('App'),'src/pages/student/ScaleAssessment.tsx'],'Training composite report':[find('App'),'src/modules/composite/CompositeReportPage.tsx'],'School app homepage and shell':[find('SchoolApp')],'Teacher app homepage and shell':[find('HuiteacherApp')],'Survey researcher entry':[find('SurveyApp')],'Survey participant entry':[find('SurveyPublicApp')]};
 selectors['School student task list']=[find('SchoolApp'),'src/school/SchoolStudentTasks.tsx'];selectors['Teacher task list']=[find('HuiteacherApp'),'src/huiteacher/HuiteacherAssessmentTasks.tsx'];selectors['Training questionnaire editor']=[find('App'),'src/pages/teacher/GeneralQuestionnaireEdit.tsx'];const original=JSON.parse(readFileSync('docs/performance/postlogin-20261028/baseline/authenticated-closures.json'));for(const [name,path] of [['School student task list','school/SchoolStudentTasks'],['Teacher task list','huiteacher/HuiteacherAssessmentTasks'],['Training questionnaire editor','pages/teacher/GeneralQuestionnaireEdit']]){const row=original.rows.find(r=>r.page===path);assert(row);base.rows.push({name,gzip1Bytes:row.coldGzip1})}
 result.closures=Object.entries(selectors).map(([name,roots])=>{const files=closure(['index.html',...roots]).map(file=>{const b=readFileSync(resolve(dist,file));return {file,bytes:b.length,gzip1Bytes:gzipSync(b,{level:1}).length,sha256:createHash('sha256').update(b).digest('hex')}});const baseline=base.rows.find(x=>x.name===name);assert(baseline);return {name,count:files.length,rawBytes:files.reduce((n,f)=>n+f.bytes,0),gzip1Bytes:files.reduce((n,f)=>n+f.gzip1Bytes,0),baselineGzip1Bytes:baseline.gzip1Bytes,files}});
 for(const name of ['School student task list','Teacher task list','Training questionnaire editor']){const row=result.closures.find(r=>r.name===name);assert(row.gzip1Bytes<row.baselineGzip1Bytes,name+' did not reduce eager bytes');assert(!row.files.some(f=>/FinalCompositeAssessment|SchoolCompositeRunner|ScaleSelector|SurveyPublicApp/.test(f.file)),'Optional answer/editor code still eager')}
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));save();
 const {chromium}=require('../release-tools/node_modules/playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});result.sandbox=await require('../../server-version/e2e/school-teacher-chrome.cjs').verifyChromeSandbox(browser);assert.equal(result.sandbox.ok,true);save();
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
 const envelope=data=>({code:0,message:'成功',data});
 async function scenario(name,host,path,width,mode,work){
  const row={name,host,path,width,status:'RUNNING',requests:[],api:[],documents:0};result.cases.push(row);save();const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let authRelease;const authWait=new Promise(r=>{authRelease=r});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());row.requests.push(url.pathname);if(request.resourceType()==='document')row.documents++;
   if(url.hostname!==host){errors.push('Unexpected external origin '+url.origin);return route.abort()}
   if(url.pathname.startsWith('/api/')){
    row.api.push({path:url.pathname,method:request.method()});if(request.method()!=='GET'){errors.push('Unexpected mutation');return route.abort()}
    const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(envelope(data))});
    if(url.pathname==='/api/capabilities')return send({cognitive:false,parentPortal:false});
    if(url.pathname.endsWith('/auth/me')){
     if(mode==='school')return send({id:'student',username:'合成学生',role:'STUDENT',accountDomain:'SCHOOL',mustChangePassword:false});
     if(mode==='training')return send({id:'trainer',username:'合成培训师',role:'TEACHER',platformRole:'STANDARD',mustChangePassword:false,entryGrants:[]});
     if(mode==='survey')return send({id:'researcher',username:'合成研究者',mustChangePassword:false});
     return send({id:'teacher',username:'合成教师',role:'TEACHER',mustChangePassword:false,organizations:[]});
    }
    if(mode==='school'){
     if(url.pathname.endsWith('/organizations'))return send({list:[{id:'school',name:'合成学校',orgRole:'MEMBER'}]});
     if(url.pathname.endsWith('/my/student-reference'))return send({reference:'SYNTHETIC'});
     if(url.pathname.endsWith('/my-status'))return send({status:'APPROVED',organizationId:'school'});
     if(url.pathname.endsWith('/context'))return send({access:{orgRole:'MEMBER',canGovern:false,personas:[],capabilities:[],explicitDenies:[]}});
     if(url.pathname.endsWith('/reports/availability'))return send({parentReportsEnabled:false});
     if(url.pathname.endsWith('/tool-authoring-capabilities'))return send({canAuthor:false,authorableToolKinds:[]});
     if(url.pathname.endsWith('/my/activity-tasks'))return send({list:[{id:'task',activityId:'00000000-0000-4000-8000-000000000001',activityTitle:'本周学习',kind:'READING',title:'阅读材料',status:'PENDING',deadline:null,href:'safe'}],total:1,hasMore:false,truncated:false,page:1});
    }
    if(mode==='teacher'||mode==='expert'){
     const suffix=url.pathname.slice('/api/huiteacher'.length);
     if(['/my-form-tasks','/my-private-form-tasks','/my-scale-tasks','/my-assessment-tasks','/my-field-notes','/my-consensus-reviews'].includes(suffix))return send({list:[],nextCursor:null,truncated:false});
     if(suffix==='/my-field-invitations')return send({list:[1,2,3].map(n=>({invitationId:'invite'+n,organizationId:'school',eventId:'event'+n,title:'课堂实践'+n,kind:'CLASSROOM',role:'EXPERT',expiresAt:'2099-01-01T00:00:00Z',status:'ACCEPTED'}))});
     if(suffix==='/field-invitations/invite1/form')return send({formId:'form1',title:'课堂观察预制表单',definitionDigest:'fixture-fixed',pages:[{pageKey:'one',title:'课堂观察',questions:[{itemKey:'q1',prompt:'教学目标是否清晰',type:'SINGLE',required:true,options:[{optionKey:'a',label:'目标清晰'}],rows:[]}]}]});
    }
    if(mode==='training'){
     if(url.pathname==='/api/organizations')return send({allowedActions:[],platformRole:'STANDARD',list:[],total:0,page:1,pageSize:25});
     if(['/api/relational-assessments/catalog','/api/relational-assessments/tasks'].includes(url.pathname))return send({list:[]});
     if(url.pathname==='/api/general-questionnaires/q1')return send({id:'q1',code:'fixture',name:'合成普通问卷',description:'',instruction:'',status:'DRAFT',estimatedTime:5});
     if(url.pathname==='/api/general-questionnaires/q1/content')return send({units:[]});
     if(url.pathname==='/api/general-questionnaires/q1/form-sections')return send({list:[]});
     if(['/api/general-questionnaires/q1/form-items','/api/general-questionnaires/q1/scales','/api/scales'].includes(url.pathname))return send({list:[]});
    }
    if(mode==='survey'){
     if(url.pathname==='/api/survey/auth/capabilities')return send({analytics:false,publication:false});
     if(url.pathname==='/api/survey/tool-library')return send({list:[],total:0,hasMore:false});
     if(url.pathname==='/api/survey/projects')return send({list:[],page:1,total:0,hasNext:false});
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
 await scenario('teacher-selected-practice-form','teacher.eduk12.top','/',1280,'expert',async(page,row)=>{
  await page.getByText('暂无分配给你的测评任务。').waitFor();await page.getByRole('navigation',{name:'Teacher 工作台'}).getByRole('button',{name:'专业实践'}).click();await page.getByRole('heading',{name:'课堂实践1',exact:true}).waitFor();assert.equal(row.api.filter(r=>r.path.endsWith('/form')).length,0);
  await page.getByRole('button',{name:'填写实践表单'}).first().click();await page.getByText('教学目标是否清晰',{exact:false}).waitFor();assert.equal(row.api.filter(r=>r.path.endsWith('/form')).length,1);assert(row.api.some(r=>r.path.endsWith('/field-invitations/invite1/form')));assert(!row.requests.some(p=>/SurveyPublicApp/.test(p)));
 });
 await scenario('training-editor-deferred-tabs','training.eduk12.top','/general-questionnaires/q1/edit',1280,'training',async(page,row)=>{
  await page.getByLabel('问卷名称 *',{exact:true}).waitFor();assert(!row.api.some(r=>/\/(form-items|scales)$/.test(r.path)));assert(!row.requests.some(p=>/ScaleSelector|PublicDeliveryManager|FormSectionManager/.test(p)));
  await page.getByLabel('问卷名称 *',{exact:true}).fill('保留的本地名称');await page.getByRole('button',{name:'内容编排',exact:true}).click();await page.getByText('选择量表',{exact:true}).waitFor();await page.getByRole('heading',{name:'内容与顺序',exact:true}).waitFor();await page.getByText('加载区段中...',{exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'基本信息',exact:true}).click();assert.equal(await page.getByLabel('问卷名称 *',{exact:true}).inputValue(),'保留的本地名称');for(const suffix of ['/form-items','/q1/scales','/api/scales'])assert.equal(row.api.filter(r=>r.path.endsWith(suffix)).length,suffix==='/form-items'?2:1);
 });
 await scenario('survey-tools-without-directory','survey.eduk12.top','/workspace/tools',1280,'survey',async(page,row)=>{
  await page.getByRole('heading',{name:'工具集',exact:true}).waitFor();assert(!row.api.some(r=>r.path==='/api/survey/projects'));const directoryResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/survey/projects'&&r.request().method()==='GET');await page.getByRole('link',{name:'我的研究',exact:true}).click();await directoryResponse;await page.getByRole('heading',{name:'研究工作台',exact:true}).waitFor();await page.getByRole('heading',{name:'从一项研究草稿开始',exact:true}).waitFor();assert.equal(row.api.filter(r=>r.path==='/api/survey/projects').length,1);
 });
 assert.equal(result.cases.length,5);assert(result.cases.every(c=>c.status==='PASS'));result.status='PASS';save();
}catch(e){result.status='FAIL';result.error=String(e.stack??e);save();throw e;}finally{await browser?.close();save();}
