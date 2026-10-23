'use strict';
// Real compiled main.tsx / App, all production styles, strict synthetic API.
// This is frontend UI acceptance, not real-account, backend, or deployment acceptance.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ORG,privateForm,schoolForm,apiResponse}=require('./school-teacher-visual-fixtures.cjs');
const widths=[320,390,768,1100,1440],themes=['light','dark'];
const origins={School:'https://school.eduk12.top',Teacher:'https://teacher.eduk12.top',admin:'https://training.eduk12.top'};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const entryPaths=new Set(['/','/login','/workspace/private-tools','/admin/login','/admin/security/enroll','/admin/huischool','/admin/huiteacher','/admin/entrances']);
async function run(){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Run the missing browser matrix in Actions only');
 const root=path.resolve(__dirname,'../..'),dist=path.join(root,'server-version/frontend/dist');
 const out=path.join(root,'school-teacher-visual-evidence');fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
 const {chromium}=require(path.join(root,'.github/release-tools/node_modules/playwright-core'));
 const axe=fs.readFileSync(path.join(root,'.github/release-tools/node_modules/axe-core/axe.min.js'),'utf8');
 const report={source:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,scope:'synthetic-production-frontend-ui',checks:[],unexpected:[],pageErrors:[],status:'running'};
 const manifest=JSON.parse(fs.readFileSync(path.join(dist,'ci-build-manifest.json'),'utf8'));
 const {verifyManifest,treeDigest}=await import('./ci-artifact.mjs');
 const lockDigest=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'server-version/frontend/package-lock.json'))).digest('hex');
 verifyManifest(manifest,{schemaVersion:1,sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,kind:'frontend',lockDigest},treeDigest(dist));report.artifact=manifest;
 let browser,page;
 const timeout=setTimeout(()=>{throw Error('Browser matrix exceeded 6 minutes')},360000);
 async function proof(name,width,theme){
  await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,styles:document.styleSheets.length}));
  assert.ok(geometry.styles>0,'Production styles must be loaded');assert.ok(geometry.scroll<=geometry.width+1,name+' horizontal overflow');
  await page.addScriptTag({content:axe});
  const accessibility=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'rule',values:['color-contrast','label','button-name','link-name','aria-valid-attr-value','aria-required-attr','aria-allowed-attr']}});return {passes:r.passes.length,violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}});
  await page.screenshot({path:path.join(out,'screenshots',`${name}-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
  report.checks.push({name,width,theme,geometry,accessibility});
  assert.ok(accessibility.passes>0,'axe did not execute');assert.deepEqual(accessibility.violations,[],name+' accessibility');
 }
 async function contextFor(product,width,theme,state){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({theme})=>{
   for(const product of ['school','teacher'])for(const account of ['guest','psych','teacher','admin-entry','admin:admin'])localStorage.setItem(`${product}:appearance:v1:${encodeURIComponent(account)}`,theme);
  },{theme});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   try{
    assert.ok(Object.values(origins).includes(url.origin),'External request refused: '+url.origin);
    if(url.pathname.startsWith('/api/')){
     const r=apiResponse(req.method(),url.pathname,url.search,state);
     await route.fulfill({status:r.status??200,contentType:'application/json',body:JSON.stringify({code:r.code??0,message:r.message??'成功',data:r.data})});return;
    }
    assert.equal(req.method(),'GET','Non-GET static request');
    const relative=entryPaths.has(url.pathname)?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');
    const file=path.resolve(dist,relative);assert.ok(file.startsWith(dist+path.sep),'Static traversal');
    assert.ok(fs.existsSync(file)&&fs.statSync(file).isFile(),'Missing static asset: '+relative);
    assert.ok(fs.realpathSync(file).startsWith(dist+path.sep),'Static symlink');
    await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   }catch(error){report.unexpected.push(String(error));await route.abort('blockedbyclient')}
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.pageErrors.push(String(e)));
  return context;
 }
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
  for(const width of widths)for(const theme of themes){
   for(const product of ['School','Teacher']){
    const state={session:false};const context=await contextFor(product,width,theme,state);
    await page.goto(origins[product]+'/login');
    await page.getByRole('heading',{name:product==='School'?'校园账号登录':'登录 Teacher',exact:true}).waitFor();
    assert.equal(await page.locator(product==='School'?'.hs-app':'.ht-app').getAttribute('data-theme'),theme);
    await proof(product+'-login',width,theme);
    state.session=true;
    if(product==='School'){
     await page.goto(origins.School+`/workspace/private-tools?organizationId=${ORG}`);
     await page.getByRole('button',{name:'编辑 '+privateForm.title,exact:true}).click();
     await page.getByRole('heading',{name:'表单编制',exact:true}).waitFor();
     await page.getByLabel('工具名称',{exact:true}).fill('长名称草稿 · '+privateForm.title);
     await proof('School-form-editor',width,theme);
     const layout=await page.locator('.education-private-form-layout').evaluate(el=>({width:el.getBoundingClientRect().width,columns:getComputedStyle(el).gridTemplateColumns}));
     if(layout.width<=760)assert.equal(layout.columns.split(' ').length,1,'Editor must respond to content width');
     assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).isEnabled(),true);
    }else{
     await page.goto(origins.Teacher+'/');
     await page.getByRole('navigation',{name:'个人任务分区'}).waitFor();
     await page.getByRole('link',{name:'表单任务',exact:true}).click();
     assert.equal(await page.locator('#ht-personal-forms').evaluate(el=>document.activeElement===el),true);
     await page.goBack();
     await page.locator('#ht-personal-self').waitFor({state:'visible'});
     assert.equal(await page.locator('#ht-personal-self').isVisible(),true);
     assert.equal(await page.locator('#ht-personal-self').evaluate(el=>document.activeElement===el),true);
     await page.getByRole('button',{name:'学校改进',exact:true}).click();
     await page.getByRole('link',{name:'学校表单',exact:true}).click();
     await page.getByRole('button',{name:schoolForm.title+' · 草稿',exact:true}).click();
     await page.getByLabel('表单标题',{exact:true}).fill('尚未保存的修改');
     await page.getByRole('link',{name:'学校设置与成员',exact:true}).click();
     assert.equal(await page.getByLabel('表单标题',{exact:true}).isVisible(),false);
     for(let i=0;i<5;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('[hidden]'))),false,'Hidden section cannot receive keyboard focus')}
     await page.getByRole('link',{name:'学校表单',exact:true}).click();
     assert.equal(await page.getByLabel('表单标题',{exact:true}).inputValue(),'尚未保存的修改');
     const dialog=page.waitForEvent('dialog').then(async d=>{assert.match(d.message(),/草稿尚未保存/);await d.dismiss()});
     await page.getByRole('button',{name:'教师成长',exact:true}).click();await dialog;
     assert.equal(await page.getByRole('button',{name:'学校改进',exact:true}).getAttribute('aria-pressed'),'true');
     assert.equal(await page.getByLabel('表单标题',{exact:true}).inputValue(),'尚未保存的修改');
     await proof('Teacher-form-draft',width,theme);
    }
    await context.close();
   }
   for(const product of ['School','Teacher']){
    const state={adminSession:false};const context=await contextFor(product,width,theme,state);
    const destination=product==='School'?'/admin/huischool':'/admin/huiteacher';
    await page.goto(origins.admin+'/admin/login?returnTo='+encodeURIComponent(destination));
    await page.getByRole('heading',{name:product+' 管理员登录',exact:true}).waitFor();
    await proof(product+'-admin-login',width,theme);
    await page.screenshot({path:path.join(out,'screenshots',`${product}-admin-login-default-viewport-${width}-${theme}.png`),fullPage:false});
    await page.getByRole('button',{name:'管理员登录',exact:true}).click();
    assert.equal(await page.getByLabel('管理员账号',{exact:true}).evaluate(el=>el.validity.valueMissing),true);
    await page.screenshot({path:path.join(out,'screenshots',`${product}-admin-login-invalid-viewport-${width}-${theme}.png`),fullPage:false});
    await page.getByRole('link',{name:'首次绑定 Authenticator',exact:true}).click();
    await page.getByRole('heading',{name:'绑定管理员验证方式',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'前往管理员登录',exact:true}).getAttribute('href'),'/admin/login?returnTo='+encodeURIComponent(destination));
    assert.equal(await page.getByRole('link',{name:/管理员登录/}).count(),1,'Exactly one visible return-to-login link');
    await proof(product+'-admin-enrollment',width,theme);
    await page.screenshot({path:path.join(out,'screenshots',`${product}-admin-enrollment-default-viewport-${width}-${theme}.png`),fullPage:false});
    state.adminSession=true;await page.goto(origins.admin+destination);
    await page.getByText(product+' · 管理员工作台',{exact:true}).waitFor();
    assert.equal(await page.locator('.education-admin-shell').getAttribute('data-theme'),theme);
    await page.getByLabel('学校 Organization UUID',{exact:true}).fill(ORG);
    await page.getByRole('button',{name:'查询学校产品授权',exact:true}).click();
    await page.getByRole('heading',{name:'独立产品开通',exact:true}).waitFor();
    const details=page.locator('.epg-verification');assert.equal(await details.getAttribute('open'),null);
    await details.locator('summary').click();
    await page.getByLabel('Authenticator 六位动态码',{exact:true}).fill('123456');
    await details.locator('summary').click();await details.locator('summary').click();
    assert.equal(await page.getByLabel('Authenticator 六位动态码',{exact:true}).inputValue(),'123456');
    await proof(product+'-admin-workspace',width,theme);
    await context.close();
   }
  }
  // Negative route boundary is an independent UI fixture, never a claimed server authorization test.
  const context=await contextFor('School',390,'dark',{adminSession:true,denied:true});
  await page.goto(origins.admin+'/admin/huischool');
  await page.getByText('当前账号没有此入口的管理权限',{exact:true}).waitFor();
  assert.equal(await page.locator('.education-admin-shell').count(),0);
  assert.equal(await page.getByLabel('学校 Organization UUID',{exact:true}).count(),0);
  report.checks.push({name:'ungranted-admin-ui-refusal'});await context.close();
  assert.equal(report.checks.length,101,'Complete matrix required');
  assert.deepEqual(report.unexpected,[]);assert.deepEqual(report.pageErrors,[]);report.status='PASS';
 }catch(error){report.status='FAIL';report.error=String(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error}
 finally{clearTimeout(timeout);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');await browser?.close()}
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
