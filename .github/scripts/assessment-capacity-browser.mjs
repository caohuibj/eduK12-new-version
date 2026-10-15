import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '../release-tools/node_modules/playwright-core/index.mjs';
const dir='assessment-capacity-evidence',plan=JSON.parse(readFileSync('assessment-capacity-plan.json','utf8'));
const checks=JSON.parse(readFileSync(join(dir,'checks.json'),'utf8')),runtime=checks.runtime.frontend;
assert.equal(runtime.status,'success');
const tools=['.github/scripts/assessment-capacity-browser.mjs','.github/release-tools/package-lock.json'].map(file=>execFileSync('git',['rev-parse',plan.head+':'+file],{encoding:'utf8'}).trim());
const key=createHash('sha256').update(JSON.stringify([checks.inputs.builds.frontend,runtime.id,tools,'chromium-playwright-1.62.1','wcag2a,wcag2aa,wcag21aa'])).digest('hex');
if(existsSync(join(dir,'reuse.json'))){
 const receipt=JSON.parse(readFileSync(join(dir,'reuse.json'),'utf8')),old=receipt.checks.browser;
 if(old?.status==='success'&&old.key===key&&Date.now()-Date.parse(old.at)<86400000){
  checks.browser={...old,reusedFrom:{runId:receipt.runId,artifactId:receipt.artifactId,head:receipt.checks.head}};
  cpSync(join(receipt.source,'browser'),join(dir,'browser'),{recursive:true});writeFileSync(join(dir,'checks.json'),JSON.stringify(checks,null,2));
  console.log('REUSED official same-runtime report feedback proof');process.exit(0);
 }
}
const run=args=>execFileSync(args[0],args.slice(1),{stdio:'inherit'});
run(['docker','run','-d','--name','assessment-ui','-p','127.0.0.1:3189:80','--add-host','backend:127.0.0.1',runtime.id]);
const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP eduk12.top 127.0.0.1, MAP training.eduk12.top 127.0.0.1','--no-proxy-server']});
mkdirSync(join(dir,'browser'),{recursive:true});const evidence=[];let active;
const report={id:'attempt-ci',assessmentId:'q-ci',name:'合成多维测评结果',productKind:'QUESTIONNAIRE',reportMode:'COLLECTION_ONLY',reportState:'COMPLETED',completedAt:'2026-10-15T00:00:00Z',totalTime:120000,anonymousCode:null,backgroundValues:[],unitReports:[{
 itemId:'scale-ci',type:'SCALE',kind:'scale',scaleId:'scale-ci',scaleCode:'TEST',scaleName:'合成五维量表',
 dimensionScores:[{dimensionId:'d1',dimensionCode:'D1',dimensionName:'测试维度一',rawScore:3,normalizedScore:null,level:null,itemCount:3,minScore:0,maxScore:3},{dimensionId:'d2',dimensionCode:'D2',dimensionName:'测试维度二',rawScore:2,normalizedScore:null,level:null,itemCount:3,minScore:0,maxScore:3}],
 feedback:{overall:'仅用于测试',dimensions:[]},caveats:['虚拟区段，仅用于并发验证'],disclaimer:'合成测试结果，不作诊断。',completedAt:'2026-10-15T00:00:00Z',totalTime:120000,method:{scaleId:'scale-ci',scaleCode:'TEST',reportDefinitionVersion:'scale-unit-report-v1'}
}]};
const cases=[{name:'participant-pending',host:'training.eduk12.top',path:'/student/composite/attempts/attempt-ci/report'},
 {name:'public-failed-retry',host:'eduk12.top',path:'/public/composite/attempts/attempt-ci/report',public:true,retry:true},
 {name:'teacher-pending',host:'eduk12.top',path:'/composite-assessments/q-ci/attempts/attempt-ci/report',teacher:true}];
try{
 for(const variant of cases)for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(12000);
  const errors=[],calls=[];let statusCalls=0,retries=0,state=variant.retry?'FAILED':'PENDING',rejectFatal;
  const fatal=new Promise((_,reject)=>{rejectFatal=reject});fatal.catch(()=>{});
  const fail=message=>{errors.push(message);rejectFatal(Error(message))};
  const step=async(stage,operation)=>{active={variant:variant.name,width,stage,calls,errors};return Promise.race([operation(),fatal])};
  page.on('pageerror',e=>fail(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/^(TypeError:|ReferenceError:|Error:|Minified React error)/.test(m.text()))fail(m.text())});
  await page.addInitScript(()=>sessionStorage.setItem('composite:recovery:attempt:attempt-ci','synthetic-recovery'));
  const status=()=>({attemptId:'attempt-ci',attemptEpoch:1,status:state==='READY'?'COMPLETED':'IN_PROGRESS',hasAcceptedSubmission:true,reportStatus:{state,jobId:'job-ci',retryAfterSeconds:2,errorCode:state==='FAILED'?'REPORT_RETRY_EXHAUSTED':null,completedAt:state==='READY'?'2026-10-15T00:00:00Z':null}});
  const prefix='/api/'+(variant.public?'public/':'')+'composite-assessments/'+(variant.teacher?'q-ci/':'')+'attempts/attempt-ci';
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),method=route.request().method(),path=url.pathname;
   if(!['eduk12.top','training.eduk12.top'].includes(url.hostname))return route.abort();
   if(path==='/assessment-ci-axe.js')return route.fulfill({contentType:'application/javascript',body:readFileSync('.github/release-tools/node_modules/axe-core/axe.min.js','utf8')});
   if(!path.startsWith('/api/'))return route.continue();
   calls.push({method,path,at:Date.now()});let data;
   if(method==='POST'&&path===prefix+'/report-retry'&&variant.retry){assert.equal(state,'FAILED');retries++;state='PENDING';statusCalls=0;data=status()}
   else if(method!=='GET'){fail('Unexpected write: '+method+' '+path);return route.abort()}
   else if(path===prefix+'/report-status'){statusCalls++;if(state==='PENDING'&&statusCalls>1)state='READY';data=status()}
   else if(path===prefix+'/report'){assert.equal(state,'READY','Never read a fat report before READY');data=report}
   else if(path==='/api/auth/me')data={id:'synthetic-user',username:'synthetic',nickname:'合成用户',role:variant.teacher?'TEACHER':'STUDENT',accountDomain:variant.host.startsWith('training')?'TRAINING':'LEGACY',isActive:true,mustChangePassword:false};
   else if(path==='/api/auth/csrf')data={csrfToken:'synthetic-csrf'};
   else if(path==='/api/capabilities')data={cognitive:false,parentPortal:false};
   else if(path==='/api/my-assessments')data={list:[],pendingCount:0};
   else if(path==='/api/organizations')data={list:[],total:0,page:1,pageSize:100,platformRole:'STANDARD',allowedActions:[]};
   else if(['/api/relational-assessments/catalog','/api/relational-assessments/tasks'].includes(path))data={list:[]};
   else {fail('Missing explicit fixture: '+method+' '+path);return route.abort()}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'操作成功',data})});
  });
  const audit=async label=>{
   await step('WCAG '+label,async()=>{
    assert.equal(await page.getByTestId('report-shell').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
    const result=await page.evaluate(()=>window.axe.run({include:['[data-testid="report-shell"]']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   });
   await page.screenshot({path:join(dir,'browser',variant.name+'-'+width+'-'+label+'.png'),fullPage:true});
  };
  await step('open feedback',()=>page.goto('http://'+variant.host+':3189'+variant.path));
  await step('saved feedback',()=>page.getByText(variant.retry?'报告生成暂时失败':'作答记录已保存，报告生成中',{exact:true}).waitFor());
  assert.equal(calls.filter(c=>c.path.endsWith('/report')).length,0);
  await page.addScriptTag({url:'http://'+variant.host+':3189/assessment-ci-axe.js'});await audit(variant.retry?'failed':'pending');
  if(variant.retry)await step('report-only retry',()=>page.getByRole('button',{name:'重新生成报告',exact:true}).click());
  await step('ready report',()=>page.getByText('合成多维测评结果',{exact:true}).waitFor());
  await step('dimension report',()=>page.getByText('合成五维量表',{exact:true}).waitFor());await audit('ready');
  assert.equal(retries,variant.retry?1:0);assert.equal(calls.filter(c=>c.path.endsWith('/report')).length,1);
  assert.ok(calls.filter(c=>c.path.endsWith('/report-status')).length<=3,'Bounded polling');assert.deepEqual(errors,[]);
  evidence.push({case:variant.name,width,status:'success',calls,wcagViolations:0});
  writeFileSync(join(dir,'browser','progress.json'),JSON.stringify({head:plan.head,image:runtime.id,evidence},null,2));
  console.log('PASS report feedback '+variant.name+' '+width);await page.close();
 }
 checks.browser={status:'success',at:new Date().toISOString(),key,sourceHead:plan.head,image:runtime.id};
 writeFileSync(join(dir,'browser','browser.json'),JSON.stringify({head:plan.head,image:runtime.id,evidence,authority:'Actual scanned UI runtime with explicit synthetic transport fixtures. PostgreSQL durable receipt, owner boundaries and recovery verified independently.'},null,2));
 writeFileSync(join(dir,'checks.json'),JSON.stringify(checks,null,2));
}catch(e){
 const page=browser.contexts().flatMap(c=>c.pages()).at(-1);
 if(page){await page.screenshot({path:join(dir,'browser','failure.png'),fullPage:true});writeFileSync(join(dir,'browser','failure.json'),JSON.stringify({...active,error:String(e),text:await page.locator('body').innerText()},null,2))}
 throw e;
}finally{await browser.close();run(['docker','rm','-f','assessment-ui'])}
