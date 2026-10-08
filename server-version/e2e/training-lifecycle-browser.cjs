const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('../backend/node_modules/playwright-core');
const {loginWithSession,sessionJsonFetch}=require('./helpers/session-auth.cjs');
const {shots,save,passed,ok,json,f,output,base,canonical,errors}=require('./training-final-browser.cjs');
async function completeFour(page, label) {
  await page.locator('textarea').fill('学习与合作')
  await page.waitForTimeout(300)
  const route=page.url()
  await page.reload()
  await page.locator('textarea').waitFor()
  assert.equal(await page.locator('textarea').inputValue(),'学习与合作')
  assert.equal(page.url(),route)
  await page.getByRole('button',{name:'提交整个区段',exact:true}).click()
  await page.getByRole('button',{name:'是',exact:true}).click()
  await page.waitForTimeout(300)
  await page.getByRole('button',{name:'提交整份量表',exact:true}).click()
  await page.getByRole('button',{name:'开始/继续文字情境测评',exact:true}).click()
  await page.locator('input[type="radio"]').first().click()
  await page.waitForFunction(()=>document.querySelector('input[type="radio"]')?.checked)
  await page.getByRole('button',{name:'情境 2，未完成',exact:true}).click()
  await page.locator('input[type="radio"]').first().click()
  await page.waitForFunction(()=>document.querySelector('input[type="radio"]')?.checked)
  await page.getByRole('button',{name:'提交测评',exact:true}).click()
  await page.getByRole('button',{name:'开始/继续认知任务',exact:true}).click()
  await page.getByRole('button',{name:'开始测评',exact:true}).click()
  await page.getByRole('button',{name:'开始练习',exact:true}).click()
  let green=false
  const deadline=Date.now()+300000
  while(Date.now()<deadline) {
    const formal=page.getByRole('button',{name:'开始正式测验',exact:true})
    if(await formal.isVisible()) { await formal.click(); green=false }
    const retry=page.getByRole('button',{name:'重新练习',exact:true})
    if(await retry.isVisible()) { await retry.click(); green=false }
    const stimulus=page.getByRole('button',{name:'respond',exact:true})
    // The stimulus can unmount between count() and getAttribute() as the
    // cognitive runner advances. Snapshot all matching nodes in one DOM
    // evaluation so a normal React transition cannot turn into a 30s wait.
    const stimulusClasses = await stimulus.evaluateAll(nodes => nodes.map(node => node.getAttribute('class') || ''))
    const visible = stimulusClasses.some(value => value.includes('bg-green-500'))
    if(visible&&!green) { await page.waitForTimeout(150); await page.keyboard.press('Space') }
    green=visible
    if(page.url().includes('/report') || await page.getByRole('button',{name:'查看个人报告',exact:true}).isVisible()) break
    const finish=page.getByRole('button',{name:/完成测评|提交结果|查看报告|返回综合测评/}).first()
    if(await finish.isVisible()) await finish.click()
    await page.waitForTimeout(75)
  }
  const reportButton=page.getByRole('button',{name:'查看个人报告',exact:true})
  if(await reportButton.isVisible()) await reportButton.click()
  await page.waitForURL(url=>url.pathname.endsWith('/report'),{timeout:30000})
  await page.getByText('本次学习目标',{exact:false}).waitFor({timeout:30000})
  await page.screenshot({path:output+'/'+label+'-report.png',fullPage:true})
}

async function main(){
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 let activePage;
 try{
  const pages={};
  for(const role of ['trainer','learner','admin','outsider']){
   const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();pages[role]=page;page.setDefaultTimeout(20000);
   page.on('pageerror',e=>errors.push({role,message:e.message}));page.on('dialog',d=>d.accept());
   await loginWithSession(page,{baseUrl:role==='admin'?canonical:base,route:role==='admin'?'/admin/login':role==='learner'?'/student/login':'/teacher/account-login',...f.users[role],...(role==='admin'?{usernamePlaceholder:'请输入管理员账号',submitName:'管理员登录'}:{})});
  }
  const {trainer,learner,admin,outsider}=pages;activePage=learner;
  await learner.goto(base+'/student/courses/'+f.courseId);await learner.getByRole('button',{name:'测评',exact:true}).click();
  const row=learner.locator('article').filter({hasText:'学习与实践组合测评（测试）'});
  await row.getByRole('link',{name:/开始/}).click();await learner.getByText('本次学习目标',{exact:false}).waitFor();await shots(learner,'learner-questionnaire-start','learner');
  await completeFour(learner,'learner');await shots(learner,'learner-questionnaire-feedback','learner');
  const reports=ok(await sessionJsonFetch(trainer,'/questionnaire-products/'+f.questionnaireId+'/reports'));
  assert.equal(reports.reports.length,1);assert.equal(reports.reports[0].unitReports.length,3);
  assert.equal(reports.reports[0].productKind,'QUESTIONNAIRE');
  await trainer.goto(base+'/composite-assessments/'+f.questionnaireId+'/attempts/'+reports.reports[0].id+'/report');await trainer.locator('[data-testid^="composite-unit-report-"]').nth(2).waitFor();await shots(trainer,'trainer-authorized-individual-results','trainer');
  passed('Actual FORM, Scale FINAL, text SJT FINAL, full Cognitive practice/formal completion and authorized individual reports');
  await learner.goto(base+'/student/scales/'+f.ownScaleId+'?courseId='+f.courseId);await learner.getByRole('radio').first().waitFor();await shots(learner,'learner-scale-start','learner');
  await learner.getByRole('radio').last().click();await learner.waitForFunction(()=>Array.from(document.querySelectorAll('input[type=radio]')).at(-1)?.checked);await learner.getByRole('button',{name:'完成测评',exact:true}).click();await learner.waitForURL(u=>u.pathname.includes('/result/'));await shots(learner,'learner-scale-feedback','learner');passed('Standalone course Scale uses the unchanged FINAL runtime and displays feedback');
  activePage=trainer;
  const lifecycle=f.createdCourseId;
  ok(await json(trainer,'/courses/'+lifecycle+'/resume-recruiting',{}));
  await trainer.goto(base+'/courses/'+lifecycle+'/detail');await trainer.getByText('课程设置',{exact:false}).first().click();
  await trainer.getByRole('button',{name:'暂停报名',exact:true}).click();await trainer.getByRole('button',{name:'确认',exact:true}).click();await trainer.getByRole('button',{name:'恢复报名',exact:true}).waitFor();
  assert.notEqual((await json(outsider,'/courses/verify-code',{courseCode:f.createdCourseCode})).body.code,0);
  assert.equal(ok(await sessionJsonFetch(learner,'/courses/'+lifecycle)).id,lifecycle);
  await trainer.getByRole('button',{name:'恢复报名',exact:true}).click();await trainer.getByRole('button',{name:'确认',exact:true}).click();await trainer.getByRole('button',{name:'暂停报名',exact:true}).waitFor();
  await trainer.getByRole('button',{name:'轮换课程码',exact:true}).click();await trainer.getByRole('button',{name:'确认',exact:true}).click();
  await trainer.getByText('课程码已轮换',{exact:true}).waitFor();const rotated=ok(await sessionJsonFetch(trainer,'/courses/'+lifecycle));assert.notEqual(rotated.courseCode,f.createdCourseCode);
  assert.notEqual((await json(outsider,'/courses/verify-code',{courseCode:f.createdCourseCode})).body.code,0);ok(await json(outsider,'/courses/verify-code',{courseCode:rotated.courseCode}));
  assert.equal(ok(await sessionJsonFetch(learner,'/courses/'+lifecycle)).id,lifecycle);f.createdCourseCode=rotated.courseCode;
  passed('Pause blocks recruitment only; resume and code rotation preserve current enrollment');
  // Registration and approval run through the real forms and canonical admin table.
  const publicContext=await browser.newContext(),pub=await publicContext.newPage();pub.setDefaultTimeout(20000);activePage=pub;
  const code=ok(await json(admin,'/teacher-codes',{maxUses:1}));const teacherUsername='QaTeacher'+f.suffix;
  await pub.goto(base+'/teacher/register?code='+code.code);
  await pub.getByPlaceholder('如：teacher01').fill(teacherUsername);await pub.getByPlaceholder('请输入您的真实姓名').fill('待审核培训师');await pub.getByPlaceholder('请输入密码',{exact:true}).fill('TrainingNewTeacher2026');await pub.getByPlaceholder('请再次输入密码').fill('TrainingNewTeacher2026');
  const registeredResponse=pub.waitForResponse(r=>r.url().endsWith('/api/auth/teacher-register')&&r.request().method()==='POST');await pub.getByRole('button',{name:'完成注册',exact:true}).click();
  const registered=await (await registeredResponse).json();assert.equal(registered.code,0);assert.equal(registered.data.pendingApproval,true);await pub.getByText('已提交，等待管理员审核',{exact:true}).waitFor();await shots(pub,'trainer-registration-pending','public');
  const pendingLogin=await json(pub,'/auth/login',{username:teacherUsername,password:'TrainingNewTeacher2026'});assert.notEqual(pendingLogin.body.code,0);
  await admin.goto(canonical+'/users');await admin.getByPlaceholder('用户名或姓名').fill(teacherUsername);await admin.getByRole('button',{name:'通过教师 待审核培训师 的注册审核',exact:true}).click();
  await admin.getByText('已通过该教师的注册审核',{exact:true}).waitFor();await shots(admin,'admin-trainer-approval-completed','admin');
  await loginWithSession(pub,{baseUrl:base,route:'/teacher/account-login',username:teacherUsername,password:'TrainingNewTeacher2026'});await pub.getByRole('heading',{name:/你好/}).waitFor();
  const reuse=await json(outsider,'/auth/teacher-register',{teacherCode:code.code,username:'Duplicate'+f.suffix,password:'TrainingNewTeacher2026',nickname:'重复注册测试'});assert.notEqual(reuse.body.code,0);
  passed('Teacher code registration waits for approval; canonical admin approves; code cannot be reused');
  const signupContext=await browser.newContext(),signup=await signupContext.newPage();signup.setDefaultTimeout(20000);activePage=signup;
  await signup.goto(base+'/student/register?course='+rotated.courseCode);await signup.getByPlaceholder('如：student01').fill('QaStudent'+f.suffix);await signup.getByPlaceholder('请输入中文昵称').fill('陈学员');await signup.getByPlaceholder('请输入密码',{exact:true}).fill('TrainingNewLearner2026');await signup.getByPlaceholder('请再次输入密码').fill('TrainingNewLearner2026');
  await signup.getByRole('button',{name:/注册/}).click();await signup.getByRole('heading',{name:/你好/}).waitFor();const newStudent=ok(await sessionJsonFetch(signup,'/auth/me'));
  assert.equal(ok(await sessionJsonFetch(signup,'/courses/'+lifecycle)).id,lifecycle);passed('New learner registration enrolls the exact verified course and starts an authenticated session');
  activePage=trainer;
  await trainer.getByRole('button',{name:'结束课程',exact:true}).click();await trainer.getByRole('button',{name:'确认结束课程',exact:true}).click();await trainer.getByText('课程已结束，不再接受新报名；历史任务和结果仍按原有权限查看。',{exact:true}).waitFor();
  assert.equal(ok(await sessionJsonFetch(trainer,'/courses/'+lifecycle)).status,'COMPLETED');assert.notEqual((await json(outsider,'/courses/verify-code',{courseCode:rotated.courseCode})).body.code,0);assert.equal(ok(await sessionJsonFetch(signup,'/courses/'+lifecycle)).id,lifecycle);await shots(trainer,'trainer-course-ended','trainer');
  const draft=ok(await json(trainer,'/courses/'+f.courseId+'/clone',{}));assert.equal(draft.status,'DRAFT');assert.notEqual((await json(outsider,'/courses/verify-code',{courseCode:draft.courseCode})).body.code,0);passed('End rejects new recruitment but preserves historical access; cloned draft is not joinable');
  // Revocation affects new use, not frozen content already legitimately published.
  ok(await sessionJsonFetch(admin,'/admin/material-grants/'+f.grantId,{method:'DELETE'}));
  const fresh=ok(await json(trainer,'/questionnaire-products',{requestId:require('node:crypto').randomUUID(),name:'撤销授权校验（测试）',questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:false}));
  assert.equal((await json(trainer,'/questionnaire-products/'+fresh.id+'/items',{revision:fresh.revision,item:{type:'SCALE',scaleId:f.scaleId}})).status,403);
  assert.equal(ok(await sessionJsonFetch(trainer,'/questionnaire-products/'+f.questionnaireId+'/reports')).reports.length,1);passed('Revoked resource denies new use while preserving authorized frozen result access');
  await trainer.goto(base+'/courses/'+f.courseId+'/students');await trainer.getByRole('button',{name:/为 李学员 生成一次性临时密码/}).click();await shots(trainer,'trainer-password-reset-confirm','trainer');await trainer.getByRole('button',{name:'确认',exact:true}).click();
  const secret=trainer.locator('code[aria-label="临时密码"]');await secret.waitFor();const temporaryPassword=await secret.textContent();assert.ok(temporaryPassword.length>=8);
  const storage=await trainer.evaluate(()=>JSON.stringify({local: {...localStorage},session:{...sessionStorage},url:location.href}));assert.ok(!storage.includes(temporaryPassword));
  await secret.evaluate(node=>{node.textContent='[隔离测试临时凭据已遮蔽]'});await shots(trainer,'trainer-password-reset-handoff','trainer');await trainer.getByRole('button',{name:'我已安全交付，关闭',exact:true}).click();assert.equal(await secret.count(),0);
  assert.equal((await sessionJsonFetch(learner,'/auth/me')).status,401);assert.equal((await json(outsider,'/courses/'+f.courseId+'/students/'+f.users.learner.id+'/reset-password',{})).status,403);
  const recoveryContext=await browser.newContext(),recovery=await recoveryContext.newPage();activePage=recovery;
  await loginWithSession(recovery,{baseUrl:base,route:'/student/login',username:f.users.learner.username,password:temporaryPassword});await recovery.getByLabel('临时密码',{exact:true}).waitFor();await shots(recovery,'learner-force-password-change','learner');assert.equal((await sessionJsonFetch(recovery,'/courses/my')).status,403);
  await recovery.getByLabel('临时密码',{exact:true}).fill(temporaryPassword);await recovery.getByLabel('新密码',{exact:true}).fill('TrainingRecovered2026');await recovery.getByLabel('确认新密码',{exact:true}).fill('TrainingRecovered2026');await recovery.getByRole('button',{name:'修改密码并重新登录',exact:true}).click();
  await loginWithSession(recovery,{baseUrl:base,route:'/student/login',username:f.users.learner.username,password:'TrainingRecovered2026'});assert.equal(ok(await sessionJsonFetch(recovery,'/auth/me')).mustChangePassword,false);ok(await sessionJsonFetch(recovery,'/courses/my'));
  f.users.learner.password='TrainingRecovered2026';fs.writeFileSync(process.env.TRAINING_FIXTURE_FILE,JSON.stringify(f,null,2),{mode:0o600});passed('One-time teacher reset invalidates old session; forced change blocks learning APIs; new password restores access');
  // Course-member removal cannot change the global account.
  ok(await sessionJsonFetch(trainer,'/courses/'+lifecycle+'/students/'+newStudent.id,{method:'DELETE'}));assert.equal((await sessionJsonFetch(signup,'/courses/'+lifecycle)).status,403);assert.equal(ok(await sessionJsonFetch(signup,'/auth/me')).id,newStudent.id);
  assert.equal((await json(trainer,'/courses/'+lifecycle+'/students/'+newStudent.id+'/reset-password',{})).status,403);passed('Removing a course member preserves the shared account and removes course/reset authority');
  assert.deepEqual(errors,[]);save('PASS');
 }catch(error){if(activePage)await activePage.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});errors.push({message:error.message});save('FAIL');throw error}
 finally{await browser.close()}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
