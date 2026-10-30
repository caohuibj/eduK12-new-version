import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_COGNITIVE_BROWSER==='1'?describe:describe.skip
suite('Connected built Survey manager cognitive exact configuration',()=>{
 let db:any,server:Server|undefined,browser:any,page:any,base='',manager:any,recipient:any,config:any,beforeCount=0,stage='init'
 const requests:any[]=[],external:string[]=[],errors:string[]=[],observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_SURVEY_COGNITIVE_DATABASE_URL;if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_survey_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact actual runtime fixture required')
  const dist=process.env.PRECISE_COGNITIVE_BROWSER_DIST;if(!dist)throw Error('Explicit built frontend required');await readFile(resolve(dist,'index.html'))
  db=(await import('../../config/database')).prisma;beforeCount=(await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  const [target]=await db.$queryRaw`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id AND g.status='ACTIVE' JOIN survey_mfa_credentials m ON m.user_id=u.id AND m.enabled WHERE u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen AND NOT EXISTS(SELECT 1 FROM survey_tool_grants t WHERE t.user_id=u.id AND t.snapshot#>>'{provenance,cognitiveProfile,configuration,profile}'='research') LIMIT 1`
  recipient=await db.user.findUniqueOrThrow({where:{id:target.id}})
  config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',status:'PUBLISHED'}})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/auth',(await import('../../routes/auth')).default);app.use('/api/capabilities',(await import('../../routes/capabilities')).default)
  app.use('/api/users',(await import('../../routes/users')).default);app.use('/api/scales',(await import('../../routes/scales')).default)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  app.use(express.static(dist));app.get('*',(_q,r)=>r.sendFile(resolve(dist,'index.html')))
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port
  const {chromium}=await import('playwright-core');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  const sign=(await import('../../utils/jwt')).generateToken,token=sign({userId:manager.id,username:manager.username,role:manager.role,accountDomain:'TRAINING',tokenVersion:manager.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  await context.addCookies([{name:'ptool_session',value:token,domain:'training.eduk12.top',path:'/',secure:true,httpOnly:true,sameSite:'Lax'},
   {name:'ptool_csrf',value:'connected-profile-browser',domain:'training.eduk12.top',path:'/',secure:true,sameSite:'Lax'}])
  await context.route('**/*',async(route:any)=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin!=='https://training.eduk12.top'){external.push(url.origin+url.pathname);return route.abort()}
   const headers=await req.allHeaders();delete headers.host;delete headers['content-length'];delete headers['accept-encoding']
   const response=await fetch(base+url.pathname+url.search,{method:req.method(),headers,...(['GET','HEAD'].includes(req.method())?{}:{body:req.postDataBuffer()})})
   if(url.pathname.startsWith('/api/'))requests.push({method:req.method(),path:url.pathname,status:response.status})
   const responseHeaders=Object.fromEntries(response.headers);delete responseHeaders['content-length'];delete responseHeaders['content-encoding']
   await route.fulfill({status:response.status,headers:responseHeaders,body:Buffer.from(await response.arrayBuffer())})
  })
  page=await context.newPage();page.on('pageerror',(error:any)=>errors.push(error.message));stage='ready'
 },60000)
 afterAll(async()=>{
  if(page){await page.screenshot({path:process.env.PRECISE_SURVEY_COGNITIVE_BROWSER_SCREENSHOT??'/tmp/connected-training-cognitive-profile.png',fullPage:true}).catch(()=>{})}
  await writeFile(process.env.PRECISE_SURVEY_COGNITIVE_BROWSER_EVIDENCE??'/tmp/connected-training-cognitive-profile.json',JSON.stringify({productionAccessed:false,stage,beforeCount,selects:page?await page.locator('select').evaluateAll((nodes:any[])=>nodes.map(n=>({label:n.parentElement?.textContent,options:[...n.options].map((o:any)=>({value:o.value,text:o.text}))}))).catch(()=>[]):[],requests,external,errors,observations,
   scope:'Real built management page, real auth/me and protected API/runtime PostgreSQL. Synthetic signed recent-MFA session fixture; no human MFA or production traffic. Every browser request intercepted and forwarded only to the local listener.'},null,2)+'\n')
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('selects a real approved report, grants to a qualified recipient and reads the actual T1 audit',async()=>{
  await page.goto('https://training.eduk12.top/admin/survey-researchers')
  await page.getByRole('tab',{name:/工具授权/}).click({timeout:15000});stage='management-connected'
  await page.getByRole('combobox',{name:'授权给研究者'}).selectOption(recipient.id,{timeout:5000})
  if(process.env.PRECISE_SURVEY_COGNITIVE_BROWSER_READBACK==='1'){
   const [actual]=await db.$queryRaw`SELECT id,snapshot FROM survey_tool_grants WHERE user_id=${recipient.id} AND snapshot#>>'{provenance,configurationName}'='浏览器实连 · 反应体验'`
   expect(actual.snapshot.provenance.selectedBinding.binding.configuration.profile).toBe('experience')
   await page.getByRole('combobox',{name:'来源类型'}).selectOption('COGNITIVE')
   await page.getByRole('button',{name:'查询可授权版本',exact:true}).click()
   await page.getByRole('heading',{name:config.name+' · 体验报告',exact:true}).waitFor({timeout:5000})
   await page.locator('.survey-admin-existing-grants article').filter({hasText:'固定使用配置：浏览器实连 · 反应体验'}).locator('summary').first().click()
   await page.getByRole('button',{name:'以新配置替换：浏览器实连 · 反应体验',exact:true}).waitFor({timeout:5000})
   const value=await page.evaluate(async(path:string)=>{const response=await fetch(path,{credentials:'same-origin'});return {status:response.status,body:await response.json()}},'/api/platform/survey/researchers/'+recipient.id+'/tool-grant-requests/'+actual.id)
   expect(value.status).toBe(200);expect(value.body.data.operation.request).toMatchObject({requestId:actual.id,userId:recipient.id,configurationName:'浏览器实连 · 反应体验',source:actual.snapshot.ref})
   expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(beforeCount)
   expect(requests.filter(r=>r.method==='POST')).toEqual([]);expect(external).toEqual([]);expect(errors).toEqual([])
   stage='retained-write-readback';observations.push({grantId:actual.id,actualGrantCountDelta:0,retainedOriginalBrowserWrite:true,originalRequestReadback:true,profile:'experience',noRepeatedAuthorization:true});return
  }
  await page.getByRole('combobox',{name:'来源类型'}).selectOption('COGNITIVE')
  await page.getByRole('button',{name:'查询可授权版本',exact:true}).click()
  const [choice]=await db.$queryRaw`SELECT metadata FROM assessment_management_events WHERE action='COGNITIVE_PROFILE_APPROVED' AND metadata#>>'{configuration,profile}'='experience' AND metadata->>'artifactFormatVersion'='2' ORDER BY created_at DESC LIMIT 1`
  const hash=choice.metadata.artifactHash
  const article=page.locator('article').filter({has:page.locator('button[aria-label*="'+hash+'"]')})
  await article.locator('summary').first().click();await article.getByRole('button',{name:'预览此报告',exact:true}).click()
  await page.getByRole('region',{name:'认知报告预览'}).waitFor({timeout:10000});stage='report-previewed'
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(beforeCount)
  await page.getByLabel('认知授权配置名称',{exact:true}).fill('浏览器实连 · 反应体验')
  await page.getByText('操作验证',{exact:true}).click()
  await page.getByLabel('当前管理员密码（敏感操作再次验证）',{exact:true}).fill('Synthetic-Survey-HTTP-20261029!')
  await article.getByRole('button',{name:/授权此版本：/}).click();stage='write-clicked'
  await page.getByRole('status').filter({hasText:'已向'}).waitFor({timeout:15000});stage='confirmed'
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(beforeCount+1)
  const [actual]=await db.$queryRaw`SELECT id,snapshot FROM survey_tool_grants WHERE user_id=${recipient.id} AND snapshot#>>'{provenance,configurationName}'='浏览器实连 · 反应体验'`
  expect(actual.snapshot.provenance.cognitiveProfile.artifactHash).toBe(hash)
  expect(actual.snapshot.provenance.selectedBinding.binding.configuration.profile).toBe('experience')
  expect(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/tool-grants'))).toEqual([{method:'POST',path:'/api/platform/survey/researchers/'+recipient.id+'/tool-grants',status:200}])
  const recovered=await page.evaluate(async(path:string)=>{const response=await fetch(path,{credentials:'same-origin'});return {status:response.status,body:await response.json()}},'/api/platform/survey/researchers/'+recipient.id+'/tool-grant-requests/'+actual.id)
  expect(recovered.status).toBe(200);expect(recovered.body.data.operation.request.requestId).toBe(actual.id)
  expect(external).toEqual([]);expect(errors).toEqual([])
  observations.push({grantId:actual.id,actualGrantCountDelta:1,actualAuditVerified:true,originalRequestConfirmed:true,profile:'experience',browser:'system Chromium',viewport:{width:1280,height:900},syntheticMfaOnly:true})
 },30000)
})
