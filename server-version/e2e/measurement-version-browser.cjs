/** Bounded missing-browser acceptance, CI only. Real rendered candidate + API.
 * Virtual CTAP2 is software protocol evidence, never physical key/Safari evidence.
 * Enrollment/login flow follows admin-permissions-browser.cjs. No fabricated
 * AdminSessionProof, signed session, browser API DTO mock or seeded FINAL.
 * Evidence is deliberately a sanitized action/status trace, NOT a Playwright
 * trace/HAR/profile (those disclose cookies, passwords and enrollment tickets).
 */
'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {spawnSync}=require('node:child_process')
const {chromium}=require('../backend/node_modules/playwright-core')
const {guardRouteCallback}=require('./helpers/measurement-response-loss.cjs')
const {runJourneys,requiredChecks,labeledSelect,labeledTextarea}=require('./measurement-version-journeys.cjs')
assert.equal(process.env.GITHUB_ACTIONS,'true','Browser execution belongs only in GitHub CI')
assert.equal(process.env.MEASUREMENT_BROWSER_ISOLATED,'1')
const privateRoot=path.resolve(process.env.RUNNER_TEMP,'measurement-browser-private')
const fixturePath=path.resolve(process.env.MEASUREMENT_BROWSER_FIXTURE_FILE||'')
assert.equal(path.dirname(fixturePath),privateRoot)
for(const file of [privateRoot,fixturePath]){
  const st=fs.lstatSync(file);assert.equal(st.isSymbolicLink(),false);assert.equal(st.mode&0o077,0)
  assert.equal(fs.realpathSync(file),file)
}
const selectedPhase=process.env.MEASUREMENT_BROWSER_PHASE
assert.ok(['admin','journeys'].includes(selectedPhase),'Exact browser phase is required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'))
const output=path.resolve(process.env.MEASUREMENT_BROWSER_OUTPUT||'')
assert.equal(output,path.resolve(process.env.RUNNER_TEMP,'measurement-browser-evidence'))
fs.mkdirSync(output,{recursive:true})
const origin=process.env.MEASUREMENT_BROWSER_ORIGIN||'http://localhost:5174'
assert.equal(origin,'http://localhost:5174')
fixture.compositeId??=fixture.product?.id
const allowedOrigins=new Set([origin,fixture.trainingUrl,fixture.surveyUrl].filter(Boolean))
for(const url of allowedOrigins)assert.ok(['http://localhost:5174','https://training.eduk12.top:3189','https://survey.eduk12.top:3189'].includes(url),'Only exact isolated browser origins')
let browser,admin,phase='startup',activePage
const evidence={schemaVersion:1,status:'RUNNING',head:process.env.GITHUB_SHA,checks:[],actions:[],screenshots:[],pageErrors:[],blockedExternalRequests:[],callbackFailures:[],
  physicalHardwareVerified:false,nativeSafariVerified:false,authenticator:'Chromium virtual CTAP2, real server registration/login/step-up verification',
  selectedPhase,grantProvenance:selectedPhase==='admin'?'REAL_UI_WEBAUTHN_ROOT_ISSUANCE':'SYNTHETIC_DB_FIXTURE_NOT_ADMIN_ISSUANCE_OR_CROSS_JOB_END_TO_END',
  scope:'Missing representative measurement-version rendered UI paths only; no repetition of prior backend assertion suites'}
function callbackFailure(scope){evidence.callbackFailures.push({scope,phase});evidence.status='FAIL';evidence.failure={phase,scope,name:'AsyncCallbackFailure'};process.exitCode=1;save()}
function save(){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(evidence,null,2))}
function check(name,actual=true,expected=true){assert.deepEqual(actual,expected,name);evidence.checks.push({name,phase,status:'PASS'});save();console.log(JSON.stringify({check:name,phase,status:'PASS'}))}
async function shot(page,name,width=1440){
  activePage=page;await page.setViewportSize({width,height:960});await page.evaluate(()=>document.fonts.ready)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' horizontal overflow')
  const file=name+'-'+width+'.png';await page.screenshot({path:path.join(output,file),fullPage:true})
  evidence.screenshots.push({file,width,route:new URL(page.url()).pathname});save()
}
async function register(){
  phase='admin-webauthn';const context=await browser.newContext({viewport:{width:1440,height:960}})
  admin=await context.newPage();activePage=admin;const cdp=await context.newCDPSession(admin)
  await cdp.send('WebAuthn.enable')
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  await admin.goto(origin+'/admin/security/enroll')
  await admin.getByLabel('管理账号',{exact:true}).fill(fixture.system.username)
  await admin.getByLabel('当前密码',{exact:true}).fill(fixture.system.password)
  await admin.getByLabel('受控登记票据',{exact:true}).fill(fixture.system.enrollmentToken)
  await admin.getByRole('button',{name:'登记安全密钥',exact:true}).click()
  await admin.getByText('安全密钥已登记，请前往管理员登录。',{exact:true}).waitFor()
  check('Real virtual CTAP2 registration',(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length,1)
  check('Registration does not create session',(await context.cookies()).some(x=>x.name==='ptool_session'),false)
  await admin.goto(origin+'/admin/login')
  await admin.locator('#auth-username').fill(fixture.system.username)
  await admin.locator('#auth-password').fill(fixture.system.password)
  await admin.getByRole('button',{name:'管理员登录',exact:true}).click()
  await admin.waitForURL(/\/admin\/(entrances|permissions)$/)
  await admin.goto(origin+'/admin/permissions')
  await admin.getByRole('heading',{name:'精确内容授权',exact:true}).waitFor()
  const before=(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials[0].signCount
  await admin.getByRole('button',{name:'重新验证安全密钥',exact:true}).click()
  await admin.getByText('安全密钥验证完成，五分钟内可执行敏感操作。',{exact:true}).waitFor()
  const after=(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials[0].signCount
  check('UI step-up creates fresh actual authenticator assertion',after>before)
  admin.on('dialog',dialog=>dialog.accept().catch(()=>callbackFailure('admin-dialog')))
}
const localDate=ms=>new Date(ms).toISOString().slice(0,16)
async function fillGrant({product='TRAINING',purpose='report',subjectId=fixture.teacher.id,scopeId=fixture.courseId,resourceIds=[fixture.compositeId],capabilities=['report.edit','report.publish'],expired=false}){
  const another=admin.getByRole('button',{name:'编制另一份授权',exact:true})
  if(await another.count())await another.click()
  await labeledSelect(admin,'产品授权范围').selectOption(product)
  if(product==='TRAINING')await labeledSelect(admin,'Training 授权用途').selectOption(purpose)
  else await labeledSelect(admin,'资源类型').selectOption(purpose==='data'?'data':'reference')
  await admin.getByLabel(product==='TRAINING'?'目标教师 UUID':'目标研究者 UUID',{exact:true}).fill(subjectId)
  if(purpose!=='reference-governance')await admin.getByLabel(product==='TRAINING'?'课程 UUID':'项目 UUID',{exact:true}).fill(scopeId)
  await labeledTextarea(admin,'精确资源 UUID（逗号或换行分隔）').fill(resourceIds.join('\n'))
  for(const cap of capabilities)await admin.getByRole('checkbox',{name:cap,exact:true}).check()
  await admin.getByLabel('生效时间（本地时间）',{exact:true}).fill(localDate(Date.now()-120000))
  await admin.getByLabel('到期时间（本地时间）',{exact:true}).fill(localDate(Date.now()+(expired?-60000:3600000)))
  await admin.getByLabel('内容授权原因',{exact:true}).fill('Synthetic CI exact scoped browser acceptance')
}
async function issueGrant(options={}){
  phase='admin-content-issue';activePage=admin
  await admin.getByRole('button',{name:'重新验证安全密钥',exact:true}).click()
  await admin.getByText('安全密钥验证完成，五分钟内可执行敏感操作。',{exact:true}).waitFor()
  await fillGrant(options)
  const responsePromise=admin.waitForResponse(r=>r.url().endsWith('/api/admin/permissions/content-grants')&&r.request().method()==='POST')
  await admin.getByRole('button',{name:'确认签发内容授权',exact:true}).click()
  const response=await responsePromise;assert.equal(response.status(),200)
  const result=await response.json();assert.equal(result.code,0);assert.ok(result.data.grantId)
  await admin.getByRole('status').filter({hasText:'已确认授权 '+result.data.grantId}).waitFor()
  check('UI issued '+(options.product||'TRAINING')+' '+(options.purpose||'report')+' grant')
  return result.data.grantId
}
async function issueWithRecovery(){
  phase='admin-content-recovery';await fillGrant({expired:true})
  let posts=0;const count=request=>{if(request.method()==='POST'&&request.url().endsWith('/api/admin/permissions/content-grants'))posts++}
  admin.on('request',count)
  await admin.getByRole('button',{name:'确认签发内容授权',exact:true}).click()
  await admin.getByRole('alert').filter({hasText:'请填写有效 UUID'}).waitFor()
  check('Expired grant form blocked before transmission',posts,0);admin.off('request',count)
  await fillGrant({})
  let committed,injectionFailure
  await admin.route('**/api/admin/permissions/content-grants',guardRouteCallback(async route=>{
    try{
      const response=await route.fetch()
      if(response.status()!==200)injectionFailure='Real upstream grant failed with status '+response.status()
      else committed=(await response.json()).data.grantId
    }catch{injectionFailure='Real upstream grant transport failed'}
    await route.abort('connectionreset')
  },()=>callbackFailure('admin-response-loss')),{times:1})
  await admin.getByRole('button',{name:'确认签发内容授权',exact:true}).click()
  await admin.getByText(/待核对请求编号：/).waitFor();await admin.getByRole('alert').filter({hasText:'请求编号及内容已保留'}).waitFor()
  assert.equal(injectionFailure,undefined,'Grant must commit before loss injection');assert.ok(committed);await admin.reload();await admin.getByText('待核对请求编号：'+committed,{exact:false}).waitFor()
  await admin.getByRole('button',{name:'读取授权元数据',exact:true}).click()
  await admin.getByRole('button',{name:'按已读记录结束待核对请求',exact:true}).click()
  await admin.getByRole('status').filter({hasText:'已按真实授权元数据结束请求'}).waitFor()
  check('Real committed grant response-loss recovered via same UUID after reload')
  await shot(admin,'admin-content-recovered',390);await shot(admin,'admin-content-recovered',1440)
  return committed
}
async function revokeGrant(grantId){
  phase='admin-content-revoke';activePage=admin
  await admin.getByRole('button',{name:'重新验证安全密钥',exact:true}).click()
  await admin.getByText('安全密钥验证完成，五分钟内可执行敏感操作。',{exact:true}).waitFor()
  await admin.getByLabel('授权 UUID',{exact:true}).fill(grantId)
  await admin.getByRole('button',{name:'读取授权元数据',exact:true}).click()
  await admin.getByLabel('撤销原因',{exact:true}).fill('Synthetic browser revoke after completed consumer journey')
  await admin.getByRole('button',{name:'确认撤销已读授权',exact:true}).click()
  await admin.getByRole('status').filter({hasText:'撤销已确认'}).waitFor()
  await admin.getByRole('button',{name:'读取授权元数据',exact:true}).click()
  await admin.getByText(new RegExp('授权 '+grantId+' · 版本 2 · 已撤销')).waitFor()
  await admin.reload();await admin.getByLabel('授权 UUID',{exact:true}).fill(grantId)
  await admin.getByRole('button',{name:'读取授权元数据',exact:true}).click()
  await admin.getByText(new RegExp('授权 '+grantId+' · 版本 2 · 已撤销')).waitFor()
  check('UI revoke and fresh page metadata retain revoked state')
}
function fixtureCommand(command){
  const result=spawnSync(process.execPath,['--import','tsx','scripts/measurement-browser-fixture.ts',command],{
    cwd:path.resolve(__dirname,'../backend'),env:process.env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024})
  assert.equal(result.status,0,'Isolated fixture preparation failed: '+command)
}
async function syntheticGrant(options){
  assert.equal(selectedPhase,'journeys');assert.equal(options.purpose,'data')
  fs.writeFileSync(path.join(privateRoot,'grant-request.json'),JSON.stringify({resourceKind:'data',capabilities:['data.reinterpret'],resourceKeys:options.resourceIds,scopeId:options.scopeId,subjectId:options.subjectId,...(options.expired?{expired:true}:{})}),{mode:0o600})
  fixtureCommand('grant')
  return JSON.parse(fs.readFileSync(path.join(privateRoot,'grant-result.json'),'utf8')).grantId
}
async function prepareFinals(){
  phase='native-final-fixture'
  fs.writeFileSync(fixturePath,JSON.stringify(fixture),{mode:0o600})
  fixtureCommand('finals')
  Object.assign(fixture,JSON.parse(fs.readFileSync(fixturePath,'utf8')))
  assert.ok(fixture.finals?.length>=5,'Reference preparation requires five real FINALs')
  phase='measurement-journeys'
  return fixture
}
;(async()=>{
  save()
  const executablePath=process.env.CHROMIUM_EXECUTABLE||chromium.executablePath()
  const profileHome=process.env.MEASUREMENT_BROWSER_PROFILE_HOME
  assert.equal(process.env.MEASUREMENT_BROWSER_EPHEMERAL_CA_APPROVED,'true','Approved isolated certificate trust is required')
  assert.ok(profileHome&&path.resolve(profileHome).startsWith(privateRoot+path.sep),'Private browser HOME required')
  assert.equal(fs.realpathSync(profileHome),path.resolve(profileHome),'Browser HOME cannot use symlink escape')
  assert.ok(fs.lstatSync(profileHome).isDirectory()&&!fs.lstatSync(profileHome).isSymbolicLink(),'Private real browser HOME required')
  browser=await chromium.launch({executablePath,env:{...process.env,HOME:profileHome},headless:true,args:['--no-sandbox','--disable-dev-shm-usage',
    '--host-resolver-rules=MAP training.eduk12.top 127.0.0.1, MAP survey.eduk12.top 127.0.0.1']})
  const newContext=browser.newContext.bind(browser)
  browser.newContext=async options=>{
    const context=await newContext({...options,timezoneId:'UTC'})
    context.setDefaultTimeout(20000)
    await context.route('**/*',guardRouteCallback(route=>{
      const url=new URL(route.request().url())
      if(!['http:','https:'].includes(url.protocol)||allowedOrigins.has(url.origin))return route.continue()
      evidence.blockedExternalRequests.push({host:url.hostname});save();return route.abort('blockedbyclient')
    },()=>callbackFailure('browser-network-route')))
    context.on('page',page=>{
      page.on('pageerror',e=>{evidence.pageErrors.push({name:e.name,phase});save()})
      page.on('response',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/api/')){evidence.actions.push({phase,method:r.request().method(),path:url.pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,':id'),status:r.status()});save()}})
    })
    return context
  }
  if(selectedPhase==='admin'){
  await register();fixture.reportGrantId=await issueWithRecovery()
  fixture.referenceGrantId=await issueGrant({purpose:'reference',capabilities:['reference.analyze','reference.review','reference.publish']})
  await issueGrant({purpose:'reference-governance',subjectId:fixture.otherTeacher.id,resourceIds:[fixture.conversion.measurementReleaseId],capabilities:['reference.review','reference.publish']})
  await revokeGrant(fixture.reportGrantId)
  }else{
    phase='measurement-journeys'
    await runJourneys({browser,origin,fixture,output,check,shot,issueGrant:syntheticGrant,prepareFinals})
    for(const name of requiredChecks)assert.ok(evidence.checks.some(row=>row.name===name),'Missing required browser scenario: '+name)
  }
  assert.equal(evidence.callbackFailures.length,0,'Asynchronous browser callback failure')
  check('No uncaught browser errors',evidence.pageErrors.length,0)
  check('No external browser requests',evidence.blockedExternalRequests.length,0)
  const mandatory=selectedPhase==='admin'?['Real virtual CTAP2 registration','UI step-up creates fresh actual authenticator assertion','Expired grant form blocked before transmission','Real committed grant response-loss recovered via same UUID after reload','UI revoke and fresh page metadata retain revoked state','UI issued TRAINING reference-governance grant']:requiredChecks
  for(const name of mandatory)assert.ok(evidence.checks.some(row=>row.name===name),'Missing required browser scenario: '+name)
  evidence.status='PASS';save()
})().catch(async error=>{
  evidence.status='FAIL';evidence.failure={phase,name:error.name,message:'Browser phase failed; inspect precise named check and sanitized action/status trace',sourceFrames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3)}
  // Never screenshot auth forms, nor emit input values, credentials, cookies or bodies.
  if(activePage&&phase!=='admin-webauthn'&&phase!=='startup')await shot(activePage,'failure',1440).catch(()=>{})
  save();console.error(JSON.stringify(evidence.failure));process.exitCode=1
}).finally(async()=>{
  try{await browser?.close()}catch{evidence.status='FAIL';evidence.failure={phase:'browser-cleanup',name:'BrowserCleanupFailure'};process.exitCode=1;save()}
  if(evidence.callbackFailures.length){evidence.status='FAIL';process.exitCode=1}
  save()
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,physicalHardwareVerified:false,nativeSafariVerified:false}))})
