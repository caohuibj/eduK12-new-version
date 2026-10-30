import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_COGNITIVE_BROWSER==='1'?describe:describe.skip
suite('Connected built Training manager cognitive exact configuration',()=>{
 let db:any,server:Server|undefined,browser:any,page:any,base='',manager:any,recipient:any,config:any,beforeCount=0,stage='init'
 const requests:any[]=[],external:string[]=[],errors:string[]=[],observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact actual runtime fixture required')
  const dist=process.env.PRECISE_COGNITIVE_BROWSER_DIST;if(!dist)throw Error('Explicit built frontend required');await readFile(resolve(dist,'index.html'))
  db=(await import('../../config/database')).prisma;beforeCount=await db.contentCapabilityGrant.count();expect(beforeCount).toBe(3)
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-manager-'}}});recipient=await db.user.findFirstOrThrow({where:{username:{startsWith:'precise-general-outsider-'}}})
  config=await db.cognitiveTestConfig.findFirstOrThrow({where:{testType:'reaction',status:'PUBLISHED'}})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/auth',(await import('../../routes/auth')).default);app.use('/api/capabilities',(await import('../../routes/capabilities')).default)
  app.use('/api/users',(await import('../../routes/users')).default);app.use('/api/scales',(await import('../../routes/scales')).default)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
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
  if(page){await page.screenshot({path:process.env.PRECISE_TRAINING_COGNITIVE_BROWSER_SCREENSHOT??'/tmp/connected-training-cognitive-profile.png',fullPage:true}).catch(()=>{})}
  await writeFile(process.env.PRECISE_TRAINING_COGNITIVE_BROWSER_EVIDENCE??'/tmp/connected-training-cognitive-profile.json',JSON.stringify({productionAccessed:false,stage,beforeCount,selects:page?await page.locator('select').evaluateAll((nodes:any[])=>nodes.map(n=>({label:n.parentElement?.textContent,options:[...n.options].map((o:any)=>({value:o.value,text:o.text}))}))).catch(()=>[]):[],requests,external,errors,observations,
   scope:'Real built management page, real auth/me and protected API/runtime PostgreSQL. Synthetic signed recent-MFA session fixture; no human MFA or production traffic. Every browser request intercepted and forwarded only to the local listener.'},null,2)+'\n')
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('selects a real approved report, grants to a qualified recipient and reads the actual T1 audit',async()=>{
  await page.goto('https://training.eduk12.top/admin/training/resources');await page.getByRole('button',{name:'固定认知配置',exact:true}).click({timeout:15000});stage='management-connected'
  const choice=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'COGNITIVE_PROFILE_APPROVED',metadata:{path:['configuration','profile'],equals:'experience'},AND:{metadata:{path:['artifactFormatVersion'],equals:2}}}})
  await page.getByRole('combobox',{name:/测验与报告/}).selectOption(choice.metadata.artifactHash,{timeout:5000});stage='profile-selected'
  await page.getByRole('combobox',{name:/接收培训师/}).selectOption(recipient.id,{timeout:5000});stage='recipient-selected'
  await page.getByLabel('配置名称').fill('浏览器实连 · 体验报告')
  await page.getByLabel('开始时间').fill(new Date(Date.now()-60000).toISOString().slice(0,16))
  await page.getByLabel('结束时间').fill(new Date(Date.now()+86400000).toISOString().slice(0,16))
  await page.getByRole('button',{name:'授权此固定配置',exact:true}).click();stage='write-clicked'
  await page.getByText('原请求已确认，固定配置已保存。',{exact:true}).waitFor({timeout:15000});stage='confirmed'
  expect(await db.contentCapabilityGrant.count()).toBe(beforeCount+1)
  const event=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'TRAINING_COGNITIVE_PROFILE_USE_GRANTED',actorId:manager.id,resourceId:config.id,metadata:{path:['userId'],equals:recipient.id}},orderBy:{createdAt:'desc'}})
  expect(event.metadata.artifactHash).toBe(choice.metadata.artifactHash);expect(event.metadata.configurationName).toBe('浏览器实连 · 体验报告')
  expect(event.metadata.selectedBinding.binding.configuration.profile).toBe('experience')
  expect(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/use-grants'))).toEqual([{method:'POST',path:'/api/cognitive/profile-configurations/training/'+config.id+'/experience/use-grants',status:200}])
  expect(requests.some(r=>r.method==='GET'&&r.path.endsWith('/use-requests/'+event.id)&&r.status===200)).toBe(true)
  expect(external).toEqual([]);expect(errors).toEqual([])
  observations.push({grantId:event.id,actualGrantCountDelta:1,actualAuditVerified:true,originalRequestConfirmed:true,profile:'experience',browser:'system Chromium',viewport:{width:1280,height:900},syntheticMfaOnly:true})
 },30000)
})
