/* Candidate preflight + public affected surfaces; no production credentials. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),path=require('node:path');
const requireTools=createRequire(path.resolve(__dirname,'../../../.github/release-tools/package.json'));
const {chromium}=requireTools('playwright-core');
const axe=fs.readFileSync(requireTools.resolve('axe-core/axe.min.js'),'utf8');
const [mode,base]=process.argv.slice(2);
assert.ok(['--smoke','--candidate','--login'].includes(mode));
const url=new URL(base);assert.ok(['http:','https:'].includes(url.protocol));
if(mode!=='--smoke')assert.ok(['localhost','127.0.0.1','training.localhost'].includes(url.hostname),'Candidate must be isolated loopback');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.RELEASE_CHROMIUM?{executablePath:process.env.RELEASE_CHROMIUM}:{})});
 const checks=[],shots=[],errors=[];const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  if(mode==='--login'){
   assert.equal(process.env.RELEASE_SYNTHETIC_FIXTURE,'1');
   const login=async(body)=>{
    const csrf=await context.request.get(base+'/api/auth/csrf');assert.equal(csrf.status(),200);const token=(await csrf.json()).data.csrfToken;
    return context.request.post(base+'/api/auth/login',{data:body,headers:{'X-CSRF-Token':token,Origin:base}});
   };
   for(const role of ['STUDENT','TEACHER']){
    await context.clearCookies();
    const username='release-'+role.toLowerCase(), password=process.env.RELEASE_SYNTHETIC_PASSWORD;assert.ok(password);
    const wrong=await login({username,password,expectedRole:role==='STUDENT'?'TEACHER':'STUDENT'});assert.equal(wrong.status(),403);assert.ok(!wrong.headers()['set-cookie']);
    const me=await context.request.get(base+'/api/auth/me');assert.equal(me.status(),401);
    await context.clearCookies();const bad=await login({username,password:'wrong-release-password',expectedRole:role});assert.equal(bad.status(),401);assert.ok(!bad.headers()['set-cookie']);
    await context.clearCookies();const good=await login({username,password,expectedRole:role});assert.equal(good.status(),200);assert.equal((await good.json()).data.user.role,role);assert.match(good.headers()['set-cookie'],/HttpOnly/i);assert.match(good.headers()['set-cookie'],/Secure/i);
    await context.clearCookies();const legacy=await login({username,password});assert.equal(legacy.status(),200);checks.push('correct/wrong/legacy '+role);
   }
  }else{
   const surfaces=JSON.parse(process.env.RELEASE_SURFACES||'[]');
   const publicRoutes=mode==='--smoke'?['/']:[...(surfaces.includes('home')?['/']:[]),...(surfaces.includes('auth')?['/student/login','/student/course-login','/teacher/account-login','/teacher/login']:[])];
   for(const width of publicRoutes.length?[390,768,1440]:[]){
    await page.setViewportSize({width,height:900});
    if(mode==='--smoke'||surfaces.includes('home')){
    await page.goto(base+'/');await page.getByRole('heading',{name:/让学习/}).waitFor();
    const login=page.getByRole('button',{name:'登录',exact:true}),register=page.getByRole('button',{name:'注册',exact:true});
    assert.equal(await login.getAttribute('aria-pressed'),'true');assert.equal(await register.getAttribute('aria-pressed'),'false');
    await register.click();assert.equal(await page.getByRole('link',{name:/我是学员/}).getAttribute('href'),'/student/course-login');
    await login.click();assert.equal(await page.getByRole('link',{name:/我是培训师/}).getAttribute('href'),'/teacher/account-login');
    }
    for(const route of publicRoutes){
     await page.goto(base+route);await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
     await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
     if(mode==='--candidate'){
      // CSP preserved: evaluate bundled pinned source in the test driver, without
      // injecting a script tag or altering response headers.
      const violations=await page.evaluate('(async()=>{'+axe+';return (await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}})).violations.map(v=>v.id)})()');
      assert.deepEqual(violations,[],'WCAG failures '+route);
     }
     checks.push({width,route});
     if(process.env.RELEASE_EVIDENCE){const file=path.join(process.env.RELEASE_EVIDENCE,`page-${width}-${route.replaceAll('/','_')}.png`);await page.screenshot({path:file,fullPage:true});shots.push(path.basename(file));}
    }
   }
   if(mode==='--candidate'&&(surfaces.includes('workspace')||surfaces.includes('admin'))){
    const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    for(const role of [...(surfaces.includes('workspace')?['TEACHER','STUDENT']:[]),...(surfaces.includes('admin')?['ADMIN']:[])]){
     const c=await browser.newContext();const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
     const user={id:'synthetic-'+role,username:'synthetic-'+role,nickname:'测试角色',role,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD',isActive:true,teacherApproved:true,mustChangePassword:false};
     const course={id,title:'隔离验收课程',description:'仅用于布局验收的合成数据',courseCode:'ABCD1234',teacherId:user.id,teacher:user,status:'ACTIVE',isActive:true,isLibrary:false,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',_count:{students:1,assignments:0,checkins:0,questionnaires:0}};
     await c.route(url=>url.pathname.startsWith('/api/'),async route=>{
      const u=new URL(route.request().url()),key=u.pathname;
      let data={list:[],total:0,hasMore:false};
      if(process.env.RELEASE_DEBUG&&role==='ADMIN')console.error('fixture',route.request().method(),key);
      if(key==='/api/auth/me')data=user;
      else if(key==='/api/capabilities')data={cognitive:true,parentPortal:true,materialGrants:true};
      else if(key==='/api/courses/'+id)data=course;
      else if(key==='/api/courses'||key==='/api/student/courses')data={list:[course],total:1,hasMore:false};
      else if(key==='/api/auth/csrf')data={csrfToken:'synthetic-layout-only'};
      // This is explicitly UI evidence, never authorization or lifecycle proof.
      assert.equal(route.request().method(),'GET','Unexpected layout mutation');
      await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':new URL(workspaceBase).origin,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify({code:0,data})});
     });
     const workspaceBase=role==='ADMIN'?base.replace('training.localhost','localhost'):base;
     const routes=role==='ADMIN'?['/admin/training','/users?workspace=training','/teacher-codes?workspace=training']:role==='TEACHER'?['/dashboard','/courses/'+id+'/detail','/courses/'+id+'/students','/questionnaire-products/new?courseId='+id,'/profile']:['/student','/student/courses/'+id,'/student/profile'];
     for(const width of [390,768,1440])for(const route of routes){
      await p.setViewportSize({width,height:900});await p.goto(workspaceBase+route);try{await p.getByText('Huitraining',{exact:true}).filter({visible:true}).first().waitFor({timeout:10000});await p.locator('h1').waitFor();}catch(e){console.error(JSON.stringify({role,width,route,url:p.url(),body:await p.locator('body').innerText()}));if(process.env.RELEASE_EVIDENCE)await p.screenshot({path:path.join(process.env.RELEASE_EVIDENCE,'failure.png'),fullPage:true});throw e;}
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const violations=await p.evaluate('(async()=>{'+axe+';return (await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}})).violations.map(v=>v.id)})()');assert.deepEqual(violations,[],role+' '+route);
      checks.push({role,width,route,syntheticUiOnly:true});
      if(process.env.RELEASE_EVIDENCE)await p.screenshot({path:path.join(process.env.RELEASE_EVIDENCE,`workspace-${role}-${width}-${routes.indexOf(route)}.png`),fullPage:true});
     }
     await c.close();
    }
   }
  }
  assert.deepEqual(errors,[]);if(process.env.RELEASE_EVIDENCE)fs.writeFileSync(path.join(process.env.RELEASE_EVIDENCE,'browser.json'),JSON.stringify({status:'success',checks,shots},null,2));console.log(JSON.stringify({status:'success',checks}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
