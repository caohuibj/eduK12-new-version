const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('../backend/node_modules/playwright-core');
const {loginWithSession,sessionJsonFetch}=require('./helpers/session-auth.cjs');
assert.equal(process.env.TRAINING_ISOLATED_DB,'1');
assert.ok(process.env.TRAINING_FIXTURE_FILE && process.env.TRAINING_AXE_SCRIPT && process.env.TRAINING_EVIDENCE);
const f=JSON.parse(fs.readFileSync(process.env.TRAINING_FIXTURE_FILE));
const source=fs.readFileSync(process.env.TRAINING_AXE_SCRIPT,'utf8');
const results=[];let teacherCode;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const role of ['learner','trainer','admin','public']){
   const context=await browser.newContext({viewport:{width:390,height:960}}),page=await context.newPage(),base=role==='admin'?(process.env.TRAINING_ADMIN_BASE_URL||'http://localhost:55173'):(process.env.TRAINING_BASE_URL||'http://training.localhost:55173');
   if(role!=='public')await loginWithSession(page,{baseUrl:base,route:role==='admin'?'/admin/login':role==='learner'?'/student/login':'/teacher/account-login',...f.users[role],...(role==='admin'?{usernamePlaceholder:'请输入管理员账号',submitName:'管理员登录'}:{})});
   if(role==='admin')teacherCode=(await sessionJsonFetch(page,'/teacher-codes')).body.data.list.find(row=>row.id===f.teacherCodeId).code;
   const routes=role==='public'?['/','/student/login','/student/course-login','/student/register?course='+f.courseCode,'/teacher/account-login','/teacher/login','/teacher/register?code='+teacherCode]:role==='learner'?['/student','/student/courses/'+f.courseId,'/student/assignments/'+f.assignmentId+'?courseId='+f.courseId,'/student/checkins/'+f.checkinId+'?courseId='+f.courseId,'/student/profile']:role==='trainer'?['/dashboard','/courses/'+f.courseId+'/detail','/courses/'+f.courseId+'/students','/assignments?create=true&courseId='+f.courseId,'/checkins?create=true&courseId='+f.courseId,'/questionnaire-products/'+f.questionnaireId,'/assessment-workbench?courseId='+f.courseId,'/profile']:['/admin/training','/users','/teacher-codes','/admin/material-grants','/courses'];
   for(const route of routes){
    await page.goto(base+route);await page.waitForTimeout(700);await page.addScriptTag({content:source});
    const outcome=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
    results.push({role,route,viewport:{width:390,height:960},violations:outcome});console.log(role,route,outcome.map(v=>v.id));
   }
   await context.close();
  }
  assert.equal(results.reduce((n,r)=>n+r.violations.length,0),0,'WCAG violations in sampled pages');
 }finally{await browser.close();fs.writeFileSync(process.env.TRAINING_EVIDENCE+'/a11y-results.json',JSON.stringify({head:process.env.TRAINING_HEAD_SHA,results},null,2))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
