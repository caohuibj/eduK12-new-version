import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER==='1'?describe:describe.skip
suite('Connected built education manager exact cognitive profile replacement',()=>{
 let db:any,server:Server|undefined,browser:any,page:any,base='',manager:any,recipient:any,config:any,beforeCount=0,stage='init',state:any,currentProduct:''|'SCHOOL'|'TEACHER'=''
 const requests:any[]=[],external:string[]=[],errors:string[]=[],observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL;if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_education_cognitive_profile_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact actual runtime fixture required')
  const dist=process.env.PRECISE_COGNITIVE_BROWSER_DIST;if(!dist)throw Error('Explicit built frontend required');await readFile(resolve(dist,'index.html'))
  state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,'utf8'))
  db=(await import('../../config/database')).prisma;beforeCount=await db.contentCapabilityGrant.count()
  config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:state.configId}})
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/auth',(await import('../../routes/auth')).default);app.use('/api/capabilities',(await import('../../routes/capabilities')).default)
  app.use('/api/users',(await import('../../routes/users')).default);app.use('/api/scales',(await import('../../routes/scales')).default)
  app.use('/api/cognitive',(await import('../../modules/cognitive/cognitive.routes')).default)
  app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default)
  app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  app.use(express.static(dist));app.get('*',(_q,r)=>r.sendFile(resolve(dist,'index.html')))
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port
  const {chromium}=await import('playwright-core');browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
  stage='ready'
 },60000)
 afterAll(async()=>{
  if(page){await page.screenshot({path:process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER_SCREENSHOT??'/tmp/connected-training-cognitive-profile.png',fullPage:true}).catch(()=>{})}
  await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER_EVIDENCE??'/tmp/connected-training-cognitive-profile.json',JSON.stringify({productionAccessed:false,stage,beforeCount,selects:page?await page.locator('select').evaluateAll((nodes:any[])=>nodes.map(n=>({label:n.parentElement?.textContent,options:[...n.options].map((o:any)=>({value:o.value,text:o.text}))}))).catch(()=>[]):[],requests,external,errors,observations,
   readOnlyRecovery:process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER_READBACK==='1',scope:'Real built management page, real auth/me and protected API/runtime PostgreSQL. Synthetic signed recent-MFA session fixture; no human MFA or production traffic. Every browser request intercepted and forwarded only to the local listener.'},null,2)+'\n')
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s changes a real fixed profile through the built management page and retains the original frozen root',async product=>{
  currentProduct=product;const e=state.entries[product]
  const retained=process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER_READBACK==='1'
  if(retained?(!e.browserAttempt||!e.browserReplacementId):Boolean(e.browserAttempt||e.browserReplacementId))throw Error('Read retained outcome before any new browser mutation')
  manager=await db.user.findUniqueOrThrow({where:{id:e.managerId}});recipient=await db.user.findUniqueOrThrow({where:{id:e.userId}})
  const oldProfile=product==='SCHOOL'?'experience':'research',nextProfile=oldProfile==='experience'?'research':'experience',oldHash=state.profiles[oldProfile].artifactHash,nextHash=state.profiles[nextProfile].artifactHash
  const original=await db.compositeAssessment.findUniqueOrThrow({where:{id:e.compositeId}})
  const context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'})
  const token=(await import('../../utils/jwt')).generateToken({userId:manager.id,username:manager.username,role:manager.role,accountDomain:'TRAINING',tokenVersion:manager.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  await context.addCookies([{name:'ptool_session',value:token,domain:'training.eduk12.top',path:'/',secure:true,httpOnly:true,sameSite:'Lax'},{name:'ptool_csrf',value:'connected-education-profile-browser',domain:'training.eduk12.top',path:'/',secure:true,sameSite:'Lax'}])
  await context.route('**/*',async(route:any)=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin!=='https://training.eduk12.top'){external.push(url.origin+url.pathname);return route.abort()}
   const headers=await req.allHeaders();delete headers.host;delete headers['content-length'];delete headers['accept-encoding']
   if(req.method()==='POST'&&url.pathname.includes('/cognitive-profile-configurations/')&&url.pathname.endsWith('/use-grants')){
    const {currentPassword:_,...input}=JSON.parse(req.postData()??'{}');state.entries[currentProduct].browserAttempt={path:url.pathname,input};await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})
   }
   const response=await fetch(base+url.pathname+url.search,{method:req.method(),headers,...(['GET','HEAD'].includes(req.method())?{}:{body:req.postDataBuffer()})})
   if(url.pathname.startsWith('/api/'))requests.push({product:currentProduct,method:req.method(),path:url.pathname,status:response.status})
   const responseHeaders=Object.fromEntries(response.headers);delete responseHeaders['content-length'];delete responseHeaders['content-encoding']
   const bytes=Buffer.from(await response.arrayBuffer())
   if(req.method()==='POST'&&url.pathname.includes('/cognitive-profile-configurations/')&&url.pathname.endsWith('/use-grants')&&response.status===200){
    const value=JSON.parse(bytes.toString('utf8'));if(value.code===0){state.entries[currentProduct].browserReplacementId=value.data.id;await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
   }
   await route.fulfill({status:response.status,headers:responseHeaders,body:bytes})
  })
  page=await context.newPage();page.on('pageerror',(error:any)=>errors.push(error.message))
  if(retained)await context.addInitScript(({key,pending}:any)=>sessionStorage.setItem(key,JSON.stringify(pending)),{key:'education-exact-cognitive:'+JSON.stringify([manager.id,product==='SCHOOL'?'HUISCHOOL':'HUITEACHER',e.organizationId]),pending:{kind:'ISSUE',configId:state.configId,profile:nextProfile,body:e.browserAttempt.input,unknown:true}})
  await page.goto('https://training.eduk12.top/admin/'+(product==='SCHOOL'?'huischool':'huiteacher'))
  await page.getByLabel('学校 Organization UUID',{exact:true}).fill(e.organizationId);await page.getByRole('button',{name:'查询学校产品授权',exact:true}).click()
  const region=page.getByRole('region',{name:'教育固定认知配置',exact:true});await region.waitFor({timeout:15000})
  if(retained){await region.getByRole('button',{name:'核对原认知请求',exact:true}).click()}else{
  await region.getByRole('combobox',{name:'认知测验与报告',exact:true}).selectOption(oldHash)
  await region.getByRole('button',{name:'替换认知配置：'+product+' 固定'+(oldProfile==='experience'?'体验':'科研')+'配置',exact:true}).click()
  await region.getByRole('combobox',{name:'认知测验与报告',exact:true}).selectOption(nextHash)
  await page.waitForFunction(({userId}:any)=>(document.querySelector('section[aria-label="教育固定认知配置"] select[aria-label="认知授权接收者"]') as HTMLSelectElement)?.value===userId,{userId:recipient.id})
  await region.getByLabel('认知配置名称',{exact:true}).fill('浏览器实连 · '+product+' '+nextProfile)
  await region.getByLabel('认知配置替换原因',{exact:true}).fill('明确选择另一已批准 profile，原任务保持原配置')
  await region.getByLabel('认知授权开始',{exact:true}).fill(new Date(Date.now()-60000).toISOString().slice(0,16))
  await region.getByLabel('认知授权结束',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16))
  await region.getByLabel('认知授权当前管理员密码',{exact:true}).fill('Synthetic-manager-test-20261029!')
  await region.getByRole('button',{name:'预览认知报告',exact:true}).click();await region.getByRole('region',{name:'教育认知报告预览',exact:true}).waitFor();stage=product+'-previewed'
  await region.getByRole('button',{name:'授权固定认知配置',exact:true}).click()
  }
  await region.getByText('原认知配置请求已确认。',{exact:true}).waitFor({timeout:10000});stage=product+'-confirmed'
  const id=state.entries[product].browserReplacementId;expect(id).toBeTruthy()
  const actual=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id}}),old=await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:e.useId}})
  expect(actual.metadata).toMatchObject({artifactHash:nextHash,configurationName:'浏览器实连 · '+product+' '+nextProfile,supersedes:{selectedBinding:{authorizationId:e.useId}},selectedBinding:{binding:{configuration:{profile:nextProfile}}}})
  expect(old).toMatchObject({version:2,revokedAt:expect.any(Date)})
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:e.compositeId}})).toEqual(original)
  expect(original.trainingContentSnapshot.units[0].source.educationNative).toMatchObject({profile:oldProfile,artifactHash:oldHash,selectedBinding:{authorizationId:e.useId}})
  if(retained)expect(requests.filter(r=>r.product===product&&r.method==='POST')).toEqual([])
  expect(external).toEqual([]);expect(errors).toEqual([])
  await page.screenshot({path:(process.env.PRECISE_EDUCATION_COGNITIVE_BROWSER_SCREENSHOT??'/tmp/education-cognitive')+'-'+product+'.png',fullPage:true})
  observations.push({product,grantId:id,oldGrantId:e.useId,oldRevoked:true,profile:nextProfile,artifactHash:nextHash,originalFrozenRootUnchanged:true,realProtectedBrowserWrite:!retained,retainedOriginalBrowserWrite:retained,noRepeatedAuthorization:retained,originalRequestReadback:true,syntheticMfaOnly:true})
  await context.close();page=undefined
 },30000)
})
