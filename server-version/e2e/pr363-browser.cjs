'use strict'
// NOTRUN locally. CI consumes official same-candidate builds and real HTTPS only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),dns=require('node:dns/promises')
const {spawnSync}=require('node:child_process')
const base=require('./school-teacher-fixture.cjs'),fixtureTools=require('./pr363-fixture.cjs')
const {totp}=require('./school-teacher-browser.cjs')
const {preflightChrome,verifyChromeSandbox,CHROME_LAUNCH_OPTIONS}=require('./school-teacher-chrome.cjs')
const prefixes={SCHOOL:'/api/campus',TEACHER:'/api/huiteacher'}
async function api(page,prefix,uri,method='GET',body){
 const result=await page.evaluate(async({prefix,uri,method,body})=>{
  const headers={'Content-Type':'application/json'}
  if(method!=='GET'){const csrf=await(await fetch(prefix+'/auth/csrf',{credentials:'same-origin'})).json();headers['X-CSRF-Token']=csrf.data.csrfToken}
  const response=await fetch(prefix+uri,{method,headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
 },{prefix,uri,method,body})
 assert.equal(result.status,200,'Real entry API '+uri);assert.equal(result.body.code,0,'Real entry API refused '+uri);return result.body.data
}
function artifactResponseFile(dist,url,document){
 const pathname=decodeURIComponent(new URL(url).pathname)
 assert.ok(!pathname.includes('\\')&&!pathname.includes('\0'))
 let file=path.resolve(dist,'.'+pathname);assert.ok(file===dist||file.startsWith(dist+path.sep))
 if(document)file=path.join(dist,'index.html')
 assert.ok(fs.statSync(file).isFile());assert.ok(fs.realpathSync(file).startsWith(dist+path.sep));return file
}
async function login(browser,product,user,privileged){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),url=fixtureTools.origin(product),prefix=prefixes[product]
 page.setDefaultTimeout(30000)
 const dist=fs.realpathSync(process.env.SCHOOL_TEACHER_FRONTEND_DIST||path.join(base.repo,'server-version/frontend/dist')),assetErrors=[],assetChecks=[]
 page.on('response',response=>{
  const responseUrl=new URL(response.url());if(responseUrl.origin!==url||responseUrl.pathname.startsWith('/api/')||responseUrl.pathname.startsWith('/uploads/'))return
  assetChecks.push((async()=>{assert.equal(response.status(),200);const file=artifactResponseFile(dist,response.url(),response.request().resourceType()==='document');assert.equal(base.sha(await response.body()),base.sha(fs.readFileSync(file)),'Network document/asset must be actual official artifact bytes')})().catch(error=>assetErrors.push(base.sha(String(error)))))
 })
 const verifyAssets=async()=>{await Promise.all(assetChecks);assert.deepEqual(assetErrors,[])}
 const response=await page.goto(url+'/login');assert.equal(response.status(),200);assert.ok(await response.securityDetails(),'Trusted TLS document required')
 await page.getByLabel(product==='SCHOOL'?'用户名':'教育账号',{exact:true}).fill(user.username)
 await page.getByLabel('密码',{exact:true}).fill(user.password)
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname===prefix+'/auth/login'&&r.request().method()==='POST')
 await page.locator('form').filter({has:page.getByLabel('密码',{exact:true})}).getByRole('button',{name:'登录',exact:true}).click()
 const logged=await pending;assert.equal(logged.status(),200);const result=(await logged.json()).data
 assert.equal(!!result.mfaRequired,privileged,'Fixture must exercise the actual privileged MFA boundary')
 if(result.mfaRequired){assert.equal(result.enrolled,false);const enrollment=await api(page,prefix,'/auth/mfa/setup','POST',{});const secret=new URL(enrollment.otpauthUri).searchParams.get('secret');assert.ok(secret);await api(page,prefix,'/auth/mfa/confirm','POST',{code:totp(secret)})}
 assert.equal((await api(page,prefix,'/auth/me')).id,user.id)
 const cookies=await context.cookies(url),session=cookies.find(c=>c.name===(product==='SCHOOL'?'huischool_session':'huiteacher_session'))
 assert.ok(session?.secure&&session?.httpOnly);assert.equal(cookies.some(c=>c.name==='ptool_session'),false)
 return {context,page,prefix,url,verifyAssets}
}
async function openCase(page,c){
 const url=fixtureTools.origin(c.product)
 await page.goto(url+(c.product==='SCHOOL'?'/workspace/tasks':'/workspace#ht-personal-tasks'))
 const card=page.locator('article').filter({hasText:c.title});await card.first().waitFor({state:'visible'});assert.equal(await card.count(),1,'Exact human-readable task title, never manual UUID selection')
 await card.getByRole('button',{name:c.product==='SCHOOL'?'开始／继续官方测评':/^(开始测评|继续测评)$/}).click()
 const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.includes(c.executionId)&&/\/(start|start-assessment)$/.test(new URL(r.url()).pathname))
 await page.getByRole('button',{name:c.product==='SCHOOL'?'开始或继续正式测评':'开始或继续测评',exact:true}).click()
 const response=await pending;assert.equal(response.status(),200);const data=(await response.json()).data;assert.equal(data.runtimeBindingKind,'COMPOSITE');assert.ok(data.runtimeBindingRef)
 return data.runtimeBindingRef
}
async function reaction(page){
 await page.getByRole('button',{name:'开始/继续认知任务',exact:true}).click()
 await page.getByRole('button',{name:'开始测评',exact:true}).click()
 await page.getByRole('button',{name:'开始练习',exact:true}).click()
 for(let i=0;i<3;i++){
  await page.waitForFunction(i=>document.querySelector('button[aria-label="practice trial '+i+'"]')?.textContent.includes('点击！'),i)
  await page.waitForTimeout(180);await page.getByRole('button',{name:'practice trial '+i,exact:true}).click()
  await page.getByRole('button',{name:i===2?'开始正式测评':'下一个',exact:true}).click()
 }
 for(let i=0;i<8;i++){
  await page.waitForFunction(i=>document.querySelector('button[aria-label="trial '+i+'"]')?.textContent.includes('点击！'),i)
  await page.waitForTimeout(180);await page.getByRole('button',{name:'trial '+i,exact:true}).click()
 }
 // Real input timed by the task; no injected envelopes or manually submitted FINAL.
 await page.getByRole('button',{name:'完成测评',exact:true}).click()
 await page.getByRole('button',{name:/^(继续本次测评|返回校园活动)$/}).click()
}
async function native(page){
 await page.getByRole('button',{name:'开始/继续情境判断测评',exact:true}).click()
 for(let node=0;node<2;node++){
  await page.locator('input[type=radio][value=A]:not(:disabled)').first().click()
  await page.getByRole('button',{name:'确认行动选择',exact:true}).click()
  await page.locator('input[type=radio][value=CHECK]:not(:disabled)').first().click()
  await page.getByRole('button',{name:'确认本阶段作答',exact:true}).click()
  if(node===0)await page.getByRole('button',{name:/^(下一题|确认本页并进入下一情境)$/}).click()
 }
 await page.getByRole('button',{name:'提交测评',exact:true}).click()
}
async function run(){
 const {root,value:fixture}=base.readFixture(),data=JSON.parse(fs.readFileSync(path.join(root,'pr363.json')))
 assert.deepEqual(data.identity,fixture.identity)
 const backendArtifact=await fixtureTools.artifact('backend'),frontendArtifact=await fixtureTools.artifact('frontend')
 for(const product of ['SCHOOL','TEACHER']){const addresses=await dns.lookup(new URL(fixtureTools.origin(product)).hostname,{all:true});assert.ok(addresses.length&&addresses.every(x=>['127.0.0.1','::1'].includes(x.address)),'Never connect to public/production product hosts')}
 const out=path.resolve(process.env.PR363_EVIDENCE_DIR||path.join(base.repo,'pr363-evidence'))
 assert.ok(!out.startsWith(root+path.sep)&&!root.startsWith(out+path.sep)&&out!==root);fs.mkdirSync(out,{recursive:true})
 const report={schemaVersion:1,status:'RUNNING',source:fixture.identity,cases:[],inputs:{backend:backendArtifact,frontend:frontendArtifact}}
 let browser
 try{
  const preflight=preflightChrome();assert.equal(preflight.ok,true)
  const {chromium}=require('../../.github/release-tools/node_modules/playwright-core')
  browser=await chromium.launch(CHROME_LAUNCH_OPTIONS);assert.equal((await verifyChromeSandbox(browser)).ok,true)
  const observed=[]
  for(const product of ['SCHOOL','TEACHER']){
   // Real password + TOTP enrollment/confirmation. No generated session cookies.
   const manager=await login(browser,product,fixture.products[product].author,true);await manager.verifyAssets();await manager.context.close()
   for(const c of data.cases.filter(c=>c.product===product)){
    const {page,context,prefix,verifyAssets}=await login(browser,product,fixture.products[product].participant,false),pageErrors=[]
    page.on('pageerror',e=>pageErrors.push(base.sha(String(e))))
    try{
     const parentId=await openCase(page,c)
     await page.reload();const resumedParentId=await openCase(page,c);assert.equal(resumedParentId,parentId,'Refresh must keep the actual durable parent')
     await reaction(page);await native(page)
     await page.getByLabel('Synthetic note',{exact:false}).fill('Synthetic browser Form answer')
     const feedback=page.waitForResponse(r=>new URL(r.url()).pathname===prefix+'/assessment-reports/executions/'+c.executionId&&r.request().method()==='GET')
     await page.getByRole('button',{name:'提交本页',exact:true}).click()
     const response=await feedback;assert.equal(response.status(),200);const result=(await response.json()).data
     if(c.mode==='SCHEDULED'){
      assert.equal(result.state,'WITHHELD');assert.equal(result.releaseAt,c.feedbackPolicy.releaseAt);assert.equal(result.reports,undefined)
      await page.getByText(/反馈尚未达到开放时间|尚未开放|反馈尚未开放/).first().waitFor()
      assert.equal(await page.getByRole('heading',{name:'Synthetic frozen report',exact:true}).count(),0)
     }else{
      assert.equal(result.state,'READY');assert.equal(result.reports.length,2)
      await page.getByRole('heading',{name:'Synthetic frozen report',exact:true}).first().waitFor()
     }
     await verifyAssets();assert.deepEqual(pageErrors,[]);observed.push({executionId:c.executionId,parentId,resumedParentId,report:result})
     report.cases.push({product,mode:c.mode,complete:true,resumedSameParent:true,reportState:result.state})
    }finally{await context.close()}
   }
  }
  fixtureTools.privateFile(root,'pr363-observed.json',observed)
  const checked=spawnSync(process.execPath,[path.join(__dirname,'pr363-fixture.cjs'),'verify'],{env:process.env,encoding:'utf8',maxBuffer:1024*1024});assert.equal(checked.status,0,'Persisted FINAL exact metric-key/value verification required')
  report.status='PASS'
 }catch(error){report.status='FAILED';report.errorDigest=base.sha(String(error));throw error}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n')}
}
module.exports={api,login,openCase,reaction,native,artifactResponseFile,run}
if(require.main===module)run().catch(error=>{console.error('PR363_BROWSER_FAILED '+base.sha(String(error)));process.exitCode=1})
