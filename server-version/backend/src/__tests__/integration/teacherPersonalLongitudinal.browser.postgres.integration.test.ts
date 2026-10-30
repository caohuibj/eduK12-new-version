import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {resolve} from 'node:path'
import {prisma as db} from '../../config/database'
import {requireIsolatedReleaseDatabase} from './integration-env'
const suite=process.env.TEACHER_TRACKING_BROWSER==='true'?describe:describe.skip
suite('Teacher native longitudinal publisher, SELF answer and reports in Chromium',()=>{
 let fixture:any,server:any,vite:any,browser:any,page:any
 const prefix=resolve('../frontend/.teacher-longitudinal-browser'),requests:Array<{method:string;path:string;status:number}>=[]
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(process.env.RELEASE_INTEGRATION_DATABASE_URL!)
  fixture=JSON.parse(await readFile('/tmp/teacher-longitudinal-fixture.json','utf8'))
  const express=(await import('express')).default,app=express()
  app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  for(const name of ['evaluation','run','forms','scaleRuntime'])app.use('/api/huiteacher',(await import('../../modules/huiteacher/'+name+'.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=await new Promise<any>(done=>{const listener=app.listen(0,'127.0.0.1',()=>done(listener))})
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/.teacher-longitudinal-browser.tsx"></script></body></html>'
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {HuiteacherEvaluationStudio} from '/src/huiteacher/HuiteacherEvaluationStudio';import {HuiteacherMyScaleTasks} from '/src/huiteacher/HuiteacherMyScaleTasks';import '/src/huiteacher/huiteacher.css';
   async function api(path,method='GET',data){const response=await fetch('/api/huiteacher'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':'teacher-longitudinal-browser'},...(data===undefined?{}:{body:JSON.stringify(data)})});const body=await response.json();if(!response.ok||body.code!==0)throw new Error(body.message||'Protected request failed');return body.data}
   const query=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(React.createElement(query.get('role')==='manager'?HuiteacherEvaluationStudio:HuiteacherMyScaleTasks,{api,organizationId:query.get('org'),actorKey:query.get('actor')}));`
  await writeFile(prefix+'.html',html);await writeFile(prefix+'.tsx',entry)
  vite=await(await import('vite')).createServer({root:resolve('../frontend'),configFile:resolve('../frontend/vite.config.ts'),server:{host:'127.0.0.1',port:5182,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+server.address().port,changeOrigin:true}}}})
  await vite.listen()
  browser=await(await import('playwright-core')).chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 },60000)
 afterAll(async()=>{
  await writeFile('/tmp/teacher-longitudinal-browser-requests.json',JSON.stringify(requests,null,2))
  if(browser)await browser.close();if(vite)await vite.close();if(server){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}
  await Promise.all([unlink(prefix+'.html').catch(()=>{}),unlink(prefix+'.tsx').catch(()=>{})]);await db.$disconnect()
 })
 it('creates the next native event, publishes, saves three SELF responses and reads single plus independent changes',async()=>{
  const origin='http://teacher.localhost:5182'
  const pageFor=async(id:string)=>{
   const user=await db.user.findUniqueOrThrow({where:{id}}),context=await browser.newContext({viewport:{width:1350,height:1000}})
   const token=(await import('../../utils/jwt')).generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
   await context.addCookies([{name:'huiteacher_session',value:token,url:origin},{name:'huiteacher_csrf',value:'teacher-longitudinal-browser',url:origin}])
   const next=await context.newPage();next.on('dialog',async(dialog:any)=>dialog.accept())
   next.on('response',(response:any)=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/'))requests.push({method:response.request().method(),path:url.pathname,status:response.status()})})
   await context.route('**/*',(route:any)=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
   return next
  }
  try{
   page=await pageFor(fixture.managerId)
   await page.goto(origin+'/.teacher-longitudinal-browser.html?role=manager&org='+fixture.organizationId+'&actor='+fixture.managerId,{waitUntil:'domcontentloaded'})
   const [retained]=await db.$queryRaw<Array<{eventId:string;status:string}>>`SELECT link.event_id AS "eventId",run.status FROM assessment_runs run JOIN huiteacher_evaluation_run_links link ON link.run_id=run.id AND link.organization_id=run.organization_id WHERE run.organization_id=${fixture.organizationId} AND run.personal_tracking_ordinal=3 AND run.personal_tracking_baseline_id=(SELECT personal_tracking_baseline_id FROM assessment_runs WHERE id=(SELECT run_id FROM assessment_run_executions WHERE id=${fixture.executionId}))`
   if(!retained){
   const t2=page.locator('article.ht-event').filter({has:page.getByText('Synthetic Teacher Longitudinal · T2',{exact:true})})
   await t2.getByRole('button',{name:'查看任务配置',exact:true}).click({timeout:30000})
   await t2.getByRole('button',{name:'创建下一轮教师自评',exact:true}).click()
   }
   const t3=page.locator('article.ht-event').filter({has:page.getByText('Synthetic Teacher Longitudinal · T3',{exact:true})})
   await t3.getByRole('button',{name:'查看任务配置',exact:true}).click({timeout:30000})
   if(retained?.status!=='PUBLISHED'){
   await t3.getByRole('button',{name:'开放评价活动',exact:true}).click()
   await t3.getByRole('button',{name:'发布教师评价任务',exact:true}).click()
   }
   await t3.getByText(/任务状态：已发布/).waitFor({timeout:30000})
   await page.screenshot({path:'/tmp/teacher-longitudinal-browser-published.png',fullPage:true})
   page=await pageFor(fixture.teacherId)
   await page.goto(origin+'/.teacher-longitudinal-browser.html?role=teacher',{waitUntil:'domcontentloaded'})
   const task=page.locator('article').filter({has:page.getByText('Synthetic Teacher Longitudinal · T3',{exact:true})})
   await task.getByRole('button',{name:'进入本人自评',exact:true}).click({timeout:30000})
   for(let i=1;i<=3;i++){await page.getByText('本轮教师工作体验 '+i,{exact:false}).waitFor();await page.getByRole('button',{name:'选项 2',exact:true}).click()}
   await page.getByRole('button',{name:'提交整份量表',exact:true}).click()
   await page.getByRole('button',{name:'查看我的变化',exact:true}).click({timeout:30000})
   await page.getByRole('table',{name:'自我支持体验各轮记录',exact:true}).waitFor()
   expect(await page.getByText('T2 → T3：-3 points',{exact:true}).count()).toBe(1)
   expect(await page.getByText('你对支持资源的体验',{exact:true}).count()).toBe(1)
   await page.screenshot({path:'/tmp/teacher-longitudinal-browser-reports.png',fullPage:true})
  }catch(error){if(page)await page.screenshot({path:'/tmp/teacher-longitudinal-browser-failure.png',fullPage:true});throw error}
 },120000)
})
