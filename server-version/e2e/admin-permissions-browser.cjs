/* Synthetic accounts, virtual CTAP2 keys and loopback services. Official CI
 * context is reported separately; virtual keys never prove physical hardware. */
const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')
const {chromium}=require('../backend/node_modules/playwright-core')
const fixturePath=process.env.ADMIN_PERMISSIONS_FIXTURE_FILE
const privateRoot=process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_TEMP
  ?path.resolve(process.env.RUNNER_TEMP,'admin-permissions-private'):'/workspace/admin-permissions-private'
if(process.env.ADMIN_PERMISSIONS_ISOLATED_TEST!=='1'||!fixturePath||path.dirname(path.resolve(fixturePath))!==privateRoot
  ||(process.env.ADMIN_PERMISSIONS_PRIVATE_DIR&&path.resolve(process.env.ADMIN_PERMISSIONS_PRIVATE_DIR)!==privateRoot))throw new Error('Private isolated fixture required')
const directory=fs.lstatSync(privateRoot),input=fs.lstatSync(fixturePath)
if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)||fs.realpathSync(privateRoot)!==privateRoot
  ||!input.isFile()||input.isSymbolicLink()||(input.mode&0o077))throw new Error('Private fixture permissions required')
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'))
const resumed=process.env.ADMIN_PERMISSIONS_BROWSER_PHASE==='remaining'
const signedSessions=resumed?JSON.parse(fs.readFileSync(process.env.ADMIN_PERMISSIONS_BROWSER_SESSIONS,'utf8')):null
const origin=process.env.ADMIN_PERMISSIONS_BROWSER_ORIGIN||'http://localhost:5174'
if(!['http://localhost:5174','http://localhost:5175','http://localhost:5176','http://localhost:5177'].includes(origin))throw new Error('Loopback browser origin required')
const officialCI=process.env.GITHUB_ACTIONS==='true'
let browser,activePage,step='startup',checks=0
const checkpoints={},browserErrors=[]
const check=(condition,label)=>{assert.ok(condition,label);checks++}
async function api(page,path,method='GET',body,view){return page.evaluate(async({path,method,body,view})=>{
  let csrf=document.cookie.split('; ').find(x=>x.startsWith('ptool_csrf='))?.split('=').slice(1).join('=')
  if(!csrf){const response=await fetch('/api/auth/csrf');csrf=(await response.json()).data.csrfToken}
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf),...(view?{'X-EduK12-Account-View':view}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
},{path,method,body,view})}
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
  checkpoints[name]={cookies:await context.cookies(),credentials:(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials}
  fs.writeFileSync(path.join(privateRoot,'a05-browser-checkpoint.json'),JSON.stringify(checkpoints),{mode:0o600})
  console.log(JSON.stringify({phase:'registered-and-logged-in',identity:name,checks}))
  return {context,page,cdp,authenticatorId}
}
async function verifyWorkspaces(sessions){
  const entries={TRAINING:['Training 培训管理','/admin/training','培训版管理'],SURVEY:['Survey 研究管理','/admin/survey-researchers','研究者与工具授权'],
    HUISCHOOL:['校园心理健康管理','/admin/huischool','校园心理健康产品治理'],HUITEACHER:['教师发展管理','/admin/huiteacher','教师发展与学校改进治理']}
  const expected={system:[],training:['TRAINING'],survey:['SURVEY'],school:['HUISCHOOL'],teacher:['HUITEACHER'],both:['TRAINING','SURVEY'],none:[],business:[]}
  const org=fixture.organizationId,report=[],pageErrors=[]
  for(const [name,session]of Object.entries(sessions)){
    const {page}=session;activePage=page;page.on('pageerror',error=>{pageErrors.push(name);browserErrors.push({identity:name,name:error.name,message:error.message})})
    step='A05-identity-'+name
    const me=await api(page,'/auth/me')
    check(me.status===200&&JSON.stringify((me.body.data.entryGrants||[]).map(x=>x.entry).sort())===JSON.stringify([...expected[name]].sort()),'current grants '+name)
    if(['training','school'].includes(name))check(me.body.data.businessRole==='STUDENT','business STUDENT preserved '+name)
    if(['survey','teacher','both','business'].includes(name))check(me.body.data.businessRole==='TEACHER','business TEACHER preserved '+name)
    await page.goto(origin+'/admin/entrances')
    await page.getByRole('heading',{name:'管理入口',exact:true}).waitFor()
    const main=page.locator('main')
    for(const [entry,[label]]of Object.entries(entries))check(await main.getByRole('link',{name:label,exact:true}).count()===(expected[name].includes(entry)?1:0),'visible entrance '+name+' '+entry)
    check(await main.getByRole('link',{name:'系统治理与入口授权',exact:true}).count()===(name==='system'?1:0),'system entrance '+name)
    check(await page.locator('#hui-navigation').getByRole('link',{name:'课程管理',exact:true}).count()===0,'business navigation separated '+name)
    if(!expected[name].length&&name!=='system')check(await main.getByRole('button',{name:'重新验证安全密钥',exact:true}).count()===0,'no unusable key control '+name)
    const deepLinks={}
    for(const [entry,[,path,title]]of Object.entries(entries)){
      step='A05-deep-'+name+'-'+entry
      await page.goto(origin+path)
      if(expected[name].includes(entry)){await page.getByRole('heading',{name:title,exact:true}).waitFor();deepLinks[entry]='allowed'}
      else{await page.getByText(/当前账[号户](?:没有此入口的管理权限|无法访问此页面)/).first().waitFor();deepLinks[entry]='denied'}
      checks++
    }
    await page.goto(origin+'/admin/permissions')
    if(name==='system')await page.getByRole('heading',{name:'系统治理与入口授权',exact:true}).waitFor()
    else await page.getByText('当前账号没有此入口的管理权限',{exact:true}).waitFor()
    checks++
    const endpoints=['/users','/platform/survey/researchers',`/platform/education/organizations/${org}/products`,
      `/platform/education/organizations/${org}/teacher-admins`,'/admin/permissions/accounts']
    const statuses=[]
    for(const endpoint of endpoints)statuses.push((await api(page,endpoint)).status)
    const allowedStatuses={system:[403,403,403,403,200],training:[200,403,403,403,403],survey:[403,200,403,403,403],school:[403,403,200,403,403],teacher:[403,403,200,200,403],both:[200,200,403,403,403],none:[403,403,403,403,403],business:[403,403,403,403,403]}
    check(JSON.stringify(statuses)===JSON.stringify(allowedStatuses[name]),'entry API matrix '+name)
    const scopeStatuses={}
    for(const [scope,path]of Object.entries({research:'/survey/projects',schoolSession:'/campus/auth/me',teacherSession:'/huiteacher/auth/me',
      campusRoster:`/courses/${fixture.campusCourseId}/students`,organizationAnswers:`/organizations/${org}/reporting/series`})){
      const status=(await api(page,path)).status;scopeStatuses[scope]=status
      check([401,403,404].includes(status),'independent resource scope '+name+' '+scope)
    }
    const roster=(await api(page,`/courses/${fixture.courseId}/students`)).status
    check(roster===(['training','both','business'].includes(name)?200:403),'Training/owner course boundary '+name)
    if(expected[name].includes('TRAINING'))check((await api(page,'/users/'+fixture.schoolUserId)).status===404,'Training cannot inspect SCHOOL account')
    await page.goto(origin+'/admin/entrances');await page.reload()
    await page.getByRole('heading',{name:'管理入口',exact:true}).waitFor();checks++
    await page.screenshot({path:path.join(privateRoot,'a05-')+name+'.png',fullPage:true})
    report.push({identity:name,businessRole:me.body.data.businessRole,role:me.body.data.role,entries:expected[name],system:name==='system',deepLinks,statuses,scopeStatuses,courseRoster:roster,refresh:'PASS'})
    fs.writeFileSync(path.join(privateRoot,'a05-workspaces-partial.json'),JSON.stringify({report,checks}),{mode:0o600})
    console.log(JSON.stringify({phase:'A05-identity',identity:name,result:'PASS',checks}))
  }
  step='A05-Survey-invitation-operation'
  const survey=sessions.survey.page
  await survey.goto(origin+'/admin/survey-researchers')
  await survey.getByRole('heading',{name:'研究者与工具授权',exact:true}).waitFor()
  await survey.getByLabel('当前管理员密码（敏感操作再次验证）').fill(fixture.survey.password)
  await survey.getByRole('tab',{name:/邀请/}).click()
  await survey.getByRole('button',{name:'生成研究者邀请',exact:true}).click()
  await survey.getByText(/新签发的一次性链接/).waitFor()
  check((await api(survey,'/platform/survey/researcher-invitations')).status===200,'Survey invitation operation')
  for(const [name,product,title]of [['school','HUISCHOOL','校园心理健康'],['teacher','HUITEACHER','教师发展与学校改进']]){
    step='A05-product-controls-'+name
    const page=sessions[name].page
    await page.goto(origin+entries[product][1])
    await page.getByLabel('学校 Organization UUID',{exact:true}).fill(org)
    await page.getByRole('button',{name:'查询学校产品授权',exact:true}).click()
    await page.getByRole('heading',{name:title,exact:true}).waitFor()
    check(await page.getByRole('heading',{name:name==='school'?'教师发展与学校改进':'校园心理健康',exact:true}).count()===0,'other product content hidden '+name)
    check(await page.getByRole('heading',{name:'Teacher 学校产品管理员',exact:true}).count()===(name==='teacher'?1:0),'Teacher roster controls '+name)
    check(await page.getByLabel('首次开通 Huischool 时的专门管理员 Membership UUID（仅需要时填写）').count()===(name==='school'?1:0),'School initial admin control '+name)
    await page.getByLabel('本次平台管理员密码',{exact:true}).fill(fixture[name].password)
    page.once('dialog',dialog=>dialog.accept())
    await page.getByRole('button',{name:'暂停',exact:true}).click()
    await page.getByText('已重新读取正式授权状态。',{exact:true}).waitFor()
    const current=await api(page,`/platform/education/organizations/${org}/products`)
    check(current.body.data.length===1&&current.body.data[0].product===product&&current.body.data[0].status==='SUSPENDED','real scoped product operation '+name)
    const wrong=product==='HUISCHOOL'?'HUITEACHER':'HUISCHOOL'
    check((await api(page,`/platform/education/organizations/${org}/products/${wrong}`,'PUT',{action:'SUSPEND',expectedRevision:1,currentPassword:fixture[name].password})).status===403,'cross-product mutation denied '+name)
    await page.screenshot({path:path.join(privateRoot,'a05-')+name+'-content.png',fullPage:true})
    await page.setViewportSize({width:390,height:844})
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px scoped product page '+name)
    await page.setViewportSize({width:1280,height:720})
  }
  step='A05-ordinary-login-does-not-assume-admin-role'
  for(const [name,path]of [['training','/student/login'],['survey','/teacher/account-login']]){
    const context=await browser.newContext(),page=await context.newPage()
    await page.goto(origin+path);await page.locator('#auth-username').fill(fixture[name].username);await page.locator('#auth-password').fill(fixture[name].password)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.getByRole('link',{name:'使用管理员入口',exact:true}).waitFor()
    check(!(await context.cookies()).some(c=>c.name==='ptool_session'),'ordinary login cannot silently issue management session '+name)
    await context.close()
  }
  step='A05-revoke-cross-tab-refresh-deep-link'
  const second=await sessions.training.context.newPage()
  await second.goto(origin+'/admin/training');await second.getByRole('heading',{name:'培训版管理',exact:true}).waitFor()
  const system=sessions.system.page
  await system.goto(origin+'/admin/permissions')
  await system.getByLabel('查找管理账号',{exact:true}).fill(fixture.training.username)
  await system.getByRole('button',{name:'查找',exact:true}).click()
  const revoke=system.getByRole('button',{name:'撤销 '+fixture.training.username+' TRAINING',exact:true})
  await revoke.waitFor();await system.getByLabel('本次变更原因',{exact:true}).fill('合成 A05 界面撤权验证')
  system.once('dialog',dialog=>dialog.accept())
  const start=performance.now();await revoke.click()
  await system.getByText('授权已更新，目标账号的旧会话已失效。',{exact:true}).waitFor()
  check((await api(sessions.training.page,'/users')).status===401,'revoked old session')
  const revokeToDenialMs=performance.now()-start
  await second.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await second.waitForURL(/\/admin\/login/);checks++
  await sessions.training.page.goto(origin+'/admin/entrances');await sessions.training.page.reload()
  await sessions.training.page.waitForURL(/\/admin\/login/);checks++
  await login(sessions.training.page,fixture.training)
  check((await api(sessions.training.page,'/users')).status===403,'fresh login still lacks revoked grant')
  check(await sessions.training.page.locator('main').getByRole('link',{name:'Training 培训管理',exact:true}).count()===0,'fresh login hides revoked entrance')
  await sessions.training.page.goto(origin+'/admin/training')
  await sessions.training.page.getByText('当前账户无法访问此页面',{exact:true}).waitFor();checks++
  report.push({identity:'revoked',oldSession:401,newSession:403,menu:'denied',deepLink:'denied',focusOtherTab:'PASS',refresh:'PASS'})
  check(pageErrors.length===0,'no browser page errors')
  fs.writeFileSync(path.join(privateRoot,'a05-workspaces-report.json'),JSON.stringify({result:'PASS',checks,report,revokeToDenialMs,physicalKeyVerified:false,officialCI},null,2),{mode:0o600})
  console.log(JSON.stringify({result:'PASS',phase:'A05-workspaces',checks,identities:report.length,pageErrors:pageErrors.length,physicalKeyVerified:false,officialCI,revokeToDenialMs}))
}
async function verifyBusinessOverlaps(sessions){
  const errors=[]
  for(const s of Object.values(sessions))s.page.on('pageerror',e=>errors.push(e.name))
  for(const [name,label,path]of [['training','学员','/student'],['both','培训师','/dashboard']]){
    const page=sessions[name].page;activePage=page;step='P2-business-workspace-'+name
    await page.goto(origin+'/admin/entrances')
    await page.locator('main').getByRole('link',{name:'前往'+label+'业务工作台',exact:true}).click()
    await page.waitForURL(new RegExp(path+'\\?workspace=business'))
    await page.getByText('Synthetic dual-role teaching course',{exact:true}).first().waitFor();checks++
    check((await api(page,'/auth/me','GET',undefined,'BUSINESS')).body.data.role===(name==='training'?'STUDENT':'TEACHER'),'real business identity '+name)
    check((await api(page,'/users','GET',undefined,'BUSINESS')).status===403,'business view does not borrow management role '+name)
    if(name==='training'){
      const tasks=await api(page,'/courses/my/tasks','GET',undefined,'BUSINESS')
      check(tasks.status===200&&tasks.body.data.list.some(x=>x.id===fixture.studentAssignmentId),'owned student tasks')
      check((await api(page,'/courses/my/tasks?courseId='+fixture.courseId,'GET',undefined,'BUSINESS')).body.data.list.length===0,'no foreign-course student tasks')
      check((await api(page,'/courses/join','POST',{courseCode:fixture.joinCourseCode},'BUSINESS')).status===200,'student can join')
      await page.goto(origin+'/student/situational')
      check((await api(page,'/situational/history','GET',undefined,'BUSINESS')).status===200,'student participation history')
    }else{
      check((await api(page,`/courses/${fixture.teacherCourseId}/students`,'GET',undefined,'BUSINESS')).status===200,'teacher own roster')
      check((await api(page,`/courses/${fixture.courseId}/students`,'GET',undefined,'BUSINESS')).status===403,'teacher foreign roster')
      check((await api(page,`/courses/${fixture.teacherCourseId}/students/${fixture.supportStudentId}/reset-password`,'POST',{},'BUSINESS')).status===200,'teacher owned credential support')
      check((await api(page,`/courses/${fixture.courseId}/students/${fixture.foreignStudentId}/reset-password`,'POST',{},'BUSINESS')).status===403,'teacher foreign credential support')
      await page.goto(origin+'/teacher/situational')
      check((await api(page,'/teacher/situational/history','GET',undefined,'BUSINESS')).status===200,'teacher-only participant history')
    }
    await page.getByRole('heading',{name:'情境化测评',exact:true}).waitFor();checks++
    check(await page.getByText('当前账户无法访问此页面',{exact:true}).count()===0,'business deep link '+name)
    await page.goto(origin+'/admin/training');await page.getByRole('heading',{name:'培训版管理',exact:true}).waitFor();checks++
    check((await api(page,'/users','GET',undefined,'MANAGEMENT')).status===200,'management retained '+name)
    check(await page.getByRole('link',{name:'报告方案与内容审核',exact:true}).count()===0,'Training does not show system governance '+name)
    await page.goto(origin+'/admin/reporting-content');await page.getByText('当前账号没有此入口的管理权限',{exact:true}).waitFor();checks++
    check((await api(page,'/organizations/measurement-resources')).status===403,'Training reporting API denied '+name)
    console.log(JSON.stringify({phase:'P2-business',identity:name,result:'PASS',checks}))
  }
  step='P2-pure-admin-is-not-student'
  const none=sessions.none.page
  check((await api(none,'/courses/my/tasks')).status===403,'pure ADMIN is not a student')
  check((await api(none,'/teacher/situational/history')).status===403,'pure ADMIN is not a teacher')
  step='P2-system-reporting'
  const system=sessions.system.page
  await system.goto(origin+'/admin/reporting-content');await system.getByRole('heading',{name:'测量资源与报告方案',exact:true}).waitFor()
  await system.getByRole('button',{name:'刷新准备状态',exact:true}).waitFor()
  check((await api(system,'/organizations/measurement-resources/candidates')).status===200,'system metadata candidates')
  check((await api(system,'/organizations/measurement-resources')).status===200,'system resource governance')
  check((await api(system,'/organizations/reporting-specs')).status===200,'system spec governance')
  check(await system.locator('main').getByRole('alert').count()===0,'system-only page has no Training admission dependency')
  check(errors.length===0,'no overlap browser page errors')
  console.log(JSON.stringify({result:'PASS',phase:'P2-business-and-governance',checks,pageErrors:errors.length,physicalKeyVerified:false,officialCI}))
}
async function verifyProductionOriginClosure(page){
  step='production-origin-closure';activePage=page
  const requests=[],errors=[]
  const observe=request=>{if(new URL(request.url()).pathname.startsWith('/api/platform/survey/'))requests.push(request.method())}
  const observeError=error=>errors.push(error.name)
  page.on('request',observe)
  page.on('pageerror',observeError)
  try{
    await page.goto(origin+'/admin/survey-researchers')
    await page.getByRole('alert').filter({hasText:'当前地址不支持 Survey 管理入口，请使用已配置的管理站点。'}).waitFor()
    assert.equal(await page.getByRole('heading',{name:'研究者与工具授权',exact:true}).count(),0)
    assert.deepEqual(requests,[],'unsupported production origin must not mount governance requests')
    assert.deepEqual(errors,[])
    console.log(JSON.stringify({result:'PASS',phase:'production-origin-closure',checks:4,pageErrors:errors.length,physicalKeyVerified:false,officialCI}))
  }finally{page.off('request',observe);page.off('pageerror',observeError)}
}
;(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  const sessions={}
  if(process.env.ADMIN_PERMISSIONS_BROWSER_PHASE==='business-overlaps'){
    for(const name of ['system','training','both','none'])sessions[name]=await register(name)
    await verifyBusinessOverlaps(sessions)
    if(process.env.ADMIN_PERMISSIONS_EXPECT_PRODUCTION_ORIGIN==='1')await verifyProductionOriginClosure(sessions.system.page)
    return
  }
  if(['workspaces','workspaces-resume'].includes(process.env.ADMIN_PERMISSIONS_BROWSER_PHASE)){
    const prior=process.env.ADMIN_PERMISSIONS_BROWSER_PHASE==='workspaces-resume'?JSON.parse(fs.readFileSync(path.join(privateRoot,'a05-browser-checkpoint.json'),'utf8')):null
    if(prior)Object.assign(checkpoints,prior)
    for(const name of ['system','training','survey','school','teacher','both','none','business']){
      if(!prior?.[name]){sessions[name]=await register(name);continue}
      const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page)
      await cdp.send('WebAuthn.enable')
      const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
      for(const credential of prior[name].credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential})
      await context.addCookies(prior[name].cookies);await page.goto(origin+'/admin/entrances')
      const stepUp=page.getByRole('button',{name:'重新验证安全密钥',exact:true})
      if(name!=='none'&&name!=='business'){await stepUp.click();await page.getByText('安全密钥验证完成，五分钟内可执行敏感操作。',{exact:true}).waitFor()}
      checkpoints[name]={cookies:await context.cookies(),credentials:(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials}
      fs.writeFileSync(path.join(privateRoot,'a05-browser-checkpoint.json'),JSON.stringify(checkpoints),{mode:0o600})
      sessions[name]={context,page,cdp,authenticatorId}
    }
    await verifyWorkspaces(sessions)
    return
  }
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
})().catch(async error=>{
  if(activePage&&/^A05-(identity|deep)/.test(step)){
    await activePage.screenshot({path:path.join(privateRoot,'a05-failure.png'),fullPage:true}).catch(()=>{})
    console.error(JSON.stringify({url:activePage.url(),headings:await activePage.locator('h1').allTextContents().catch(()=>[])}))
  }
  console.error(JSON.stringify({result:'FAIL',step,checks,errorType:error.name,message:String(error.message).split('\n')[0]}));process.exitCode=1
  fs.writeFileSync(path.join(privateRoot,'a05-browser-errors.json'),JSON.stringify(browserErrors),{mode:0o600})
}).finally(()=>browser?.close())
