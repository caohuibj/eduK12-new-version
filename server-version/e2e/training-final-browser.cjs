const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../backend/node_modules/playwright-core');
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs');
assert.equal(process.env.TRAINING_ISOLATED_DB, '1', 'Explicit isolated test environment required');
const fixtureFile = process.env.TRAINING_FIXTURE_FILE;
const f = JSON.parse(fs.readFileSync(fixtureFile));
const output = process.env.TRAINING_EVIDENCE;
assert.ok(output && process.env.TRAINING_HEAD_SHA, 'Evidence directory and tested head required');
fs.mkdirSync(output, { recursive: true });
const base = process.env.TRAINING_BASE_URL || 'http://training.localhost:55173';
const canonical = process.env.TRAINING_ADMIN_BASE_URL || 'http://localhost:55173';
const widths = [390, 768, 1440], screenshots = [], checks = [], errors = [];
function ok(r) { assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.code, 0); return r.body.data; }
async function json(page, endpoint, data, method = 'POST') {
 return sessionJsonFetch(page, endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
function passed(name) { checks.push({ name, status: 'PASS' }); console.log('PASS:', name); save(); }
function save(status = 'RUNNING') { fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ status, head: process.env.TRAINING_HEAD_SHA, environment: 'local Vite + actual API + disposable PostgreSQL 16/Redis; synthetic accounts only', screenshots, checks, errors }, null, 2)); }
async function shots(page, name, role) {
 for (const width of widths) {
  await page.setViewportSize({ width, height: 960 });
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= width + 1, `${name} at ${width}: overflow ${size.scroll}`);
  const file = name + '-' + width + '.png';
  await page.screenshot({ path: path.join(output, file), fullPage: true });
  screenshots.push({ name, role, route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: { width, height: 960 }, file, ...size });
 }
 save();
}
async function open(page, route, ready, name, role) {
 await page.goto((role === 'admin' ? canonical : base) + route + (role === 'admin' && route !== '/admin/training' ? '?workspace=training' : ''));
 await ready(page).waitFor();
 await shots(page, name, role);
}
async function main() {
 const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  const pages = {};
  for (const role of ['public', 'admin', 'trainer', 'learner', 'outsider']) {
   const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
   const page = await context.newPage(); pages[role] = page; page.setDefaultTimeout(15000);
   page.on('pageerror', e => errors.push({ role, route: page.url(), message: e.message }));
   page.on('dialog', dialog => dialog.accept());
   if (role !== 'public') await loginWithSession(page, { baseUrl: role === 'admin' ? canonical : base, route: role === 'admin' ? '/admin/login' : role === 'learner' ? '/student/login' : '/teacher/account-login', ...f.users[role], ...(role === 'admin' ? { usernamePlaceholder: '请输入管理员账号', submitName: '管理员登录' } : {}) });
  }
  const { public: pub, admin, trainer, learner, outsider } = pages;
  await open(pub, '/', p => p.getByRole('heading', { name: /学有所思/ }), 'entry', 'public');
  assert.equal(await pub.locator('a[href="/admin/login"]').count(), 0);
  for (const [route, name] of [['/student/login','learner-login'],['/teacher/account-login','trainer-login'],['/admin/login','admin-login']]) {
   await pub.goto((name === 'admin-login' ? canonical : base) + route);
   await pub.getByPlaceholder(name === 'admin-login' ? '请输入管理员账号' : '请输入用户名').waitFor();
   await shots(pub, name, name.split('-')[0]);
  }
  const teacherCode = ok(await json(admin, '/teacher-codes', { maxUses: 2 }));
  f.teacherCodeId = teacherCode.id;
  await open(pub, '/teacher/register?code='+teacherCode.code, p => p.getByRole('heading', { name: '培训师账号注册' }), 'trainer-register', 'public');
  await open(pub, '/student/register?course='+f.courseCode, p => p.getByPlaceholder('如：student01'), 'learner-register', 'public');
  passed('Host entry exposes only learner/trainer; canonical admin login remains separate');
  await open(trainer, '/dashboard', p => p.getByRole('heading', { name: /你好/ }), 'trainer-courses', 'trainer');
  await trainer.getByRole('button', { name: '创建课程', exact: true }).click();
  await trainer.getByRole('dialog').waitFor();
  await shots(trainer, 'trainer-create-course', 'trainer');
  assert.ok(await trainer.getByRole('dialog').evaluate(d=>d.contains(document.activeElement)));
  await trainer.keyboard.press('Escape'); await trainer.getByRole('dialog').waitFor({state:'hidden'});
  assert.ok(await trainer.getByRole('button',{name:'创建课程',exact:true}).evaluate(e=>e===document.activeElement));
  await trainer.getByRole('button',{name:'创建课程',exact:true}).click();
  await trainer.getByRole('dialog').locator('input').first().fill('浏览器新建研修课程');
  await trainer.getByRole('dialog').locator('textarea').fill('从真实创建到报名、结束与历史查看。');
  const createResponse = trainer.waitForResponse(r => r.url().endsWith('/api/courses') && r.request().method() === 'POST');
  await trainer.getByRole('dialog').getByRole('button', { name: '创建课程', exact: true }).click();
  const created = ok({ status: (await createResponse).status(), body: await (await createResponse).json() });
  f.createdCourseId = created.id; f.createdCourseCode = created.courseCode;
  assert.ok(created.courseCode); assert.equal(created.status, 'PUBLISHED');
  await open(learner, '/student', p => p.getByRole('heading', { name: /你好/ }), 'learner-courses', 'learner');
  await learner.getByRole('button', { name: '加入课程', exact: true }).click();
  await learner.getByRole('dialog').waitFor(); await shots(learner, 'learner-join-course', 'learner');
  await learner.getByRole('dialog').locator('input').fill(created.courseCode);
  await learner.getByRole('dialog').getByRole('button', { name: '加入课程', exact: true }).click();
  await learner.getByRole('dialog').waitFor({ state: 'hidden' });
  passed('Real UI course create auto-generates code; learner joins via code');
  // Authorization must be enforced by the API, including a forged exact-course ID.
  assert.equal((await json(outsider, '/scales/'+f.scaleId+'/courses', { courseIds: [f.courseId] })).status, 403);
  const metadata = { requestId: require('node:crypto').randomUUID(), name: '学习与实践组合测评（测试）', questionnaireType: 'COURSE', courseIds: [f.courseId, f.createdCourseId], publicEnabled: false };
  let questionnaire = ok(await json(trainer, '/questionnaire-products', metadata));
  const noGrant = await json(trainer, '/questionnaire-products/'+questionnaire.id+'/items', { revision: questionnaire.revision, item: {type:'SCALE',scaleId:f.scaleId} });
  assert.equal(noGrant.status, 403);
  const grant = ok(await json(admin, '/admin/material-grants', { teacherId: f.users.trainer.id, resourceType: 'SCALE', resourceId: f.scaleId }));
  f.grantId = grant.id;
  ok(await json(trainer, '/scales/'+f.ownScaleId+'/courses', { courseIds: [f.courseId] }));
  for (const item of [{ type:'FORM',formType:'text_input',formLabel:'本次学习目标' }, { type:'SCALE',scaleId:f.scaleId }, { type:'SITUATIONAL',situationalInstrumentKey:'sjt-assertiveness-golden',situationalInstrumentVersion:'1.0.0' }, { type:'COGNITIVE',cognitiveAssignmentId:f.cognitiveId }]) {
   questionnaire = ok(await json(trainer, '/questionnaire-products/'+questionnaire.id+'/items', { revision: questionnaire.revision, item }));
  }
  const preflight = ok(await json(trainer, '/questionnaire-products/'+questionnaire.id+'/preflight', { revision: questionnaire.revision }));
  assert.equal(preflight.ok, true, JSON.stringify(preflight));
  questionnaire = ok(await json(trainer, '/questionnaire-products/'+questionnaire.id+'/publish', { revision: questionnaire.revision }));
  f.questionnaireId = questionnaire.id;
  fs.writeFileSync(fixtureFile, JSON.stringify(f, null, 2), { mode: 0o600 });
  passed('Published resource grant enforced; four-type questionnaire published with exact multi-course delivery');
  await open(learner, '/student/courses/'+f.courseId, p => p.getByRole('heading', { name:'教师专业发展研修', exact:true }), 'learner-course', 'learner');
  await learner.getByRole('button',{name:'测评',exact:true}).click();
  await learner.getByText(metadata.name,{exact:true}).waitFor();
  for (const excluded of ['其他课程量表（测试）','未投放的公开量表（测试）','问卷内部认知（测试）']) assert.equal(await learner.getByText(excluded,{exact:true}).count(),0);
  await shots(learner,'learner-assessments','learner');
  passed('Course feed excludes foreign/public-only/internal Cognitive tasks');
  await open(learner, '/student/assignments/'+f.assignmentId+'?courseId='+f.courseId, p=>p.getByRole('heading',{name:'第一周教学反思',exact:true}), 'learner-homework','learner');
  await learner.getByPlaceholder('请输入作答内容').fill('通过课堂实践发现：清晰反馈帮助学员把反思转化为行动。');
  await learner.getByRole('button',{name:'提交作业',exact:true}).click();
  await learner.getByText('我的提交',{exact:true}).waitFor();
  await learner.reload(); await learner.getByText('我的提交',{exact:true}).waitFor();
  const submission=ok(await sessionJsonFetch(learner,'/assignments/'+f.assignmentId+'/my-submission'));
  f.submissionId=submission.id;
  ok(await json(trainer,'/assignments/'+f.assignmentId+'/submissions/'+submission.id+'/grade',{comment:'反思具体，请在下一周验证改进计划。'}));
  await learner.reload(); await learner.getByText('反思具体，请在下一周验证改进计划。',{exact:true}).waitFor();
  await shots(learner,'learner-homework-feedback','learner');
  passed('Homework submits, survives refresh, receives real teacher grading and learner feedback');
  await open(learner,'/student/checkins/'+f.checkinId+'?courseId='+f.courseId,p=>p.getByRole('heading',{name:'每日阅读打卡',exact:true}),'learner-checkin','learner');
  await learner.getByPlaceholder('记录一下今天的学习内容或心得...').fill('今天阅读了关于教学反思的文章，并记录实践计划。');
  await learner.getByRole('button',{name:'提交打卡',exact:true}).click();
  await learner.getByText('打卡已成功提交。',{exact:true}).waitFor(); await learner.reload();
  await learner.getByText('今天阅读了关于教学反思的文章，并记录实践计划。',{exact:true}).waitFor();
  await shots(learner,'learner-checkin-submitted','learner'); passed('Check-in submission and reload retain the actual record');
  for (const [role,page,route] of [['learner',learner,'/student/profile'],['trainer',trainer,'/profile']]) {
   await open(page,route,p=>p.getByRole('heading').filter({hasText:/账户|个人/}).first(),role+'-account',role);
  }
  await open(trainer,'/courses/'+f.courseId+'/detail',p=>p.getByRole('heading',{name:'教师专业发展研修',exact:true}),'trainer-course','trainer');
  await trainer.getByText('课程设置',{exact:false}).first().click(); await shots(trainer,'trainer-course-settings','trainer');
  await open(trainer,'/courses/'+f.courseId+'/students',p=>p.getByRole('button',{name:/为 李学员 生成一次性临时密码/}),'trainer-students','trainer');
  await open(trainer,'/assignments?create=true&courseId='+f.courseId,p=>p.getByRole('dialog'),'trainer-homework-editor','trainer');
  assert.equal(await trainer.getByLabel('选择课程 *',{exact:true}).inputValue(),f.courseId);
  await trainer.getByLabel('作业标题 *',{exact:true}).fill('浏览器发布新作业');
  const newAssignment=trainer.waitForResponse(r=>r.url().endsWith('/api/assignments')&&r.request().method()==='POST');
  await trainer.getByRole('dialog').getByRole('button',{name:'创建作业',exact:true}).click();
  const publishedAssignment=ok({status:(await newAssignment).status(),body:await(await newAssignment).json()});assert.equal(publishedAssignment.courseId,f.courseId);
  await trainer.getByRole('dialog').waitFor({state:'hidden'});
  await trainer.getByRole('row').filter({hasText:'第一周教学反思'}).getByRole('button',{name:'查看提交',exact:true}).click();
  await trainer.getByRole('dialog').waitFor(); await shots(trainer,'trainer-homework-grading','trainer');
  await open(trainer,'/checkins?create=true&courseId='+f.courseId,p=>p.getByRole('dialog'),'trainer-checkin-editor','trainer');
  await trainer.getByLabel('打卡标题 *',{exact:true}).fill('浏览器发布新打卡');
  const newCheckin=trainer.waitForResponse(r=>r.url().endsWith('/api/checkins')&&r.request().method()==='POST');
  await trainer.getByRole('dialog').getByRole('button',{name:'创建打卡',exact:true}).click();
  const publishedCheckin=ok({status:(await newCheckin).status(),body:await(await newCheckin).json()});assert.equal(publishedCheckin.courseId,f.courseId);
  await trainer.getByRole('dialog').waitFor({state:'hidden'});
  await learner.goto(base+'/student/courses/'+f.courseId);await learner.getByText('浏览器发布新作业',{exact:true}).waitFor();await learner.getByRole('button',{name:'打卡',exact:true}).click();await learner.getByText('浏览器发布新打卡',{exact:true}).waitFor();
  passed('Actual editor forms publish homework and check-in to the exact learner course; dialogs retain keyboard focus and restore it');
  await trainer.getByRole('row').filter({hasText:'每日阅读打卡'}).getByRole('button',{name:'查看提交',exact:true}).click();
  await trainer.getByRole('dialog').waitFor(); await shots(trainer,'trainer-checkin-records','trainer');
  await open(trainer,'/questionnaire-products/'+questionnaire.id,p=>p.getByRole('heading').first(),'trainer-assessment-publication','trainer');
  await open(trainer,'/assessment-workbench?courseId='+f.courseId,p=>p.getByText(metadata.name,{exact:true}),'trainer-results','trainer');
  assert.equal(await trainer.getByRole('link',{name:/群体|纵向/}).count(),0);
  for (const [route,name,ready] of [['/admin/training','admin-training',/培训版管理/],['/users','admin-account-approval',/用户管理/],['/teacher-codes','admin-registration-codes',/教师码|注册码/],['/admin/material-grants','admin-resource-grants',/授权/],['/courses','admin-course-oversight',/课程/]]) {
   await open(admin,route,p=>p.getByRole('heading',{name:ready}).first(),name,'admin');
  }
  assert.deepEqual(errors,[]); passed('All sampled role pages render at 390/768/1440 without document overflow or runtime errors');
  fs.writeFileSync(fixtureFile,JSON.stringify(f,null,2),{mode:0o600});save('PASS');
 } catch(error) { errors.push({message:error.message});save('FAIL');throw error; }
 finally { await browser.close(); }
}
module.exports={shots,save,passed,ok,json,f,output,base,canonical,errors,checks};
if(require.main===module) main().catch(error=>{console.error(error.stack);process.exitCode=1;});
