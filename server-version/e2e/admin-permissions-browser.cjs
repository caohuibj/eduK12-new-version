/* Development verification only. Synthetic accounts, virtual CTAP2 keys and
 * loopback services; never claim this as physical hardware or official CI. */
const fs=require('node:fs')
const assert=require('node:assert/strict')
const {chromium}=require('../backend/node_modules/playwright-core')
const fixturePath=process.env.ADMIN_PERMISSIONS_FIXTURE_FILE
if(process.env.ADMIN_PERMISSIONS_ISOLATED_TEST!=='1'||!fixturePath?.startsWith('/workspace/admin-permissions-private/'))throw new Error('Private isolated fixture required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'))
const resumed=process.env.ADMIN_PERMISSIONS_BROWSER_PHASE==='remaining'
const signedSessions=resumed?JSON.parse(fs.readFileSync(process.env.ADMIN_PERMISSIONS_BROWSER_SESSIONS,'utf8')):null
const origin='http://localhost:5174'
let browser,step='startup',checks=0
const check=(condition,label)=>{assert.ok(condition,label);checks++}
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{
  let csrf=document.cookie.split('; ').find(x=>x.startsWith('ptool_csrf='))?.split('=').slice(1).join('=')
  if(!csrf){const response=await fetch('/api/auth/csrf');csrf=(await response.json()).data.csrfToken}
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf)},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
},{path,method,body})}
async function login(page,account){
  await page.goto(origin+'/admin/login')
  await page.locator('#auth-username').fill(account.username)
  await page.locator('#auth-password').fill(account.password)
  await page.getByRole('button',{name:'管理员登录',exact:true}).click()
  await page.waitForURL(/\/admin\/(entrances|permissions)$/,{timeout:20000})
}
async function register(name){
  step='enroll-'+name
  const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  const account=fixture[name]
  if(account.enrollmentToken){
    await page.goto(origin+'/admin/security/enroll')
    await page.getByLabel('管理账号',{exact:true}).fill(account.username)
    await page.getByLabel('当前密码',{exact:true}).fill(account.password)
    await page.getByLabel('受控登记票据',{exact:true}).fill(account.enrollmentToken)
    await page.getByRole('button',{name:'登记安全密钥',exact:true}).click()
    await page.getByText('安全密钥已登记，请前往管理员登录。',{exact:true}).waitFor({timeout:20000})
    check((await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length===1,'virtual registration')
    check(!(await context.cookies()).some(c=>c.name==='ptool_session'),'registration must not create a session')
  }
  step='login-'+name
  await login(page,account)
  return {context,page,cdp,authenticatorId}
}
;(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  const sessions={}
  if(resumed){
    for(const name of ['system','training','survey']){
      const context=await browser.newContext()
      await context.addCookies([{name:'ptool_session',value:signedSessions[name],url:origin,httpOnly:true,sameSite:'Lax'}])
      const page=await context.newPage();await page.goto(origin+(name==='system'?'/admin/permissions':'/admin/entrances'))
      sessions[name]={context,page}
    }
  }else{
  for(const name of ['system','training','survey','school','teacher','both','none','business'])sessions[name]=await register(name)
  const org=fixture.organizationId
  const routes=['/users','/platform/survey/researchers',`/platform/education/organizations/${org}/products`,`/platform/education/organizations/${org}/teacher-admins`,'/admin/permissions/accounts']
  const matrix={system:[403,403,403,403,200],training:[200,403,403,403,403],survey:[403,200,403,403,403],school:[403,403,200,403,403],teacher:[403,403,200,200,403],both:[200,200,403,403,403],none:[403,403,403,403,403],business:[403,403,403,403,403]}
  for(const [name,expected]of Object.entries(matrix)){
    step='HTTP-entry-matrix-'+name
    for(let i=0;i<routes.length;i++)check((await api(sessions[name].page,routes[i])).status===expected[i],`${name} ${i}`)
  }
  for(const [name,product]of [['school','HUISCHOOL'],['teacher','HUITEACHER']]){
    step='product-projection-'+name
    const response=await api(sessions[name].page,routes[2])
    check(response.body.data.length===1&&response.body.data[0].product===product,'product projection')
  }
  step='horizontal-course-boundary'
  check((await api(sessions.business.page,`/courses/${fixture.courseId}/students`)).status===200,'course owner')
  check((await api(sessions.survey.page,`/courses/${fixture.courseId}/students`)).status===403,'other teacher')
  step='system-admin-parameter-tampering'
  check((await api(sessions.training.page,'/users','POST',{username:'synthetic-denied',password:'SyntheticDeny7',role:'ADMIN',platformRole:'SYSTEM_ADMIN'})).status!==200,'generic create cannot elevate')
  step='security-key-step-up'
  const renewed=await sessions.system.page.evaluate(async()=>{const m=await import('/src/admin/securityKey.ts');return (await m.reauthenticateAdmin()).code})
  check(renewed===0,'actual browser step-up')
  console.log(JSON.stringify({phase:'enrollment-login-entry-matrix-step-up',result:'PASS',checks,entryMatrixRequests:40,physicalKeyVerified:false}))
  }
  step='menus-and-deep-links'
  await sessions.survey.page.goto(origin+'/admin/survey-researchers')
  await sessions.survey.page.getByRole('heading',{name:'研究者与工具授权',exact:true}).waitFor()
  check(await sessions.survey.page.getByRole('link',{name:'培训版管理',exact:true}).count()===0,'survey-only menu')
  await sessions.training.page.goto(origin+'/admin/survey-researchers')
  await sessions.training.page.getByText('当前账号没有此入口的管理权限',{exact:true}).waitFor()
  checks++
  step='mobile-width-governance'
  await sessions.system.page.setViewportSize({width:390,height:844})
  await sessions.system.page.reload()
  await sessions.system.page.getByRole('heading',{name:'系统治理与入口授权',exact:true}).waitFor()
  check(await sessions.system.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px page overflow')
  step='revoke-old-session-and-login'
  const target=await api(sessions.system.page,'/admin/permissions/accounts?keyword='+encodeURIComponent(fixture.training.username))
  const grant=target.body.data.accounts.find(x=>x.id===fixture.training.id).entries.find(x=>x.entry==='TRAINING')
  const start=performance.now()
  check((await api(sessions.system.page,`/admin/permissions/accounts/${fixture.training.id}/entries/TRAINING`,'PUT',{active:false,expectedVersion:grant.version,reason:'synthetic HTTP revocation'})).status===200,'revoke')
  check((await api(sessions.training.page,'/users')).status===401,'old session invalid immediately after revoke commit')
  const revokeToDenialMs=performance.now()-start
  await login(sessions.training.page,fixture.training)
  check((await api(sessions.training.page,'/users')).status===403,'fresh ordinary login lacks revoked grant')
  await sessions.training.page.reload()
  check(await sessions.training.page.getByRole('link',{name:'Training 培训管理',exact:true}).count()===0,'refresh does not revive grant')
  console.log(JSON.stringify({result:'PASS',checks,phase:resumed?'remaining-ui-and-http-revocation':'full',signedPresentationFixture:resumed,physicalKeyVerified:false,revokeToDenialMs,privateDataUploaded:false}))
})().catch(error=>{console.error(JSON.stringify({result:'FAIL',step,checks,errorType:error.name}));process.exitCode=1}).finally(()=>browser?.close())
