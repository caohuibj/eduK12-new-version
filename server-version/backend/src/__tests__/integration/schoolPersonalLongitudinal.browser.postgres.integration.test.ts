import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {readFile,writeFile,unlink} from 'node:fs/promises'
import {resolve} from 'node:path'
import {prisma as db} from '../../config/database'
import {requireIsolatedReleaseDatabase} from './integration-env'
const suite=process.env.SCHOOL_TRACKING_BROWSER==='true'?describe:describe.skip
suite('School native next activity, SELF answers and both reports in Chromium',()=>{
 let fixture:any,server:any,vite:any,browser:any,page:any
 const syntheticMedia=new Set<string>()
 const prefix=resolve('../frontend/.school-longitudinal-browser'),requests:Array<{method:string;path:string;status:number}>=[]
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(process.env.RELEASE_INTEGRATION_DATABASE_URL!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  fixture=JSON.parse(await readFile('/tmp/school-personal-longitudinal-state.json','utf8'))
  for(const asset of await db.storedAsset.findMany({where:{ownerId:fixture.actor.userId,objectKey:{startsWith:'synthetic-private/'}},select:{id:true}}))syntheticMedia.add(asset.id)
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  for(const name of ['admission','activity','activity.run','report','composite'])app.use('/api/campus',(await import('../../modules/campus/'+name+'.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=await new Promise<any>(done=>{const listener=app.listen(0,'127.0.0.1',()=>done(listener))})
  await writeFile(prefix+'.html','<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/.school-longitudinal-browser.tsx"></script></body></html>')
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {SchoolActivityManager} from '/src/school/SchoolActivityManager';import {SchoolStudentTasks} from '/src/school/SchoolStudentTasks';import '/src/school/school.css';
   async function api(path,method='GET',data){const response=await fetch('/api/campus'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':'school-longitudinal-browser'},...(data===undefined?{}:{body:JSON.stringify(data)})});const body=await response.json();if(!response.ok||body.code!==0)throw new Error(body.message||'Protected request failed');return body.data}
   const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(q.get('role')==='manager'?React.createElement(SchoolActivityManager,{api,organizationId:q.get('org'),actorKey:q.get('actor'),isAdmin:false,classes:[]}):React.createElement(SchoolStudentTasks,{api,activityId:q.get('activity')}));`
  await writeFile(prefix+'.tsx',entry)
  vite=await(await import('vite')).createServer({root:resolve('../frontend'),configFile:resolve('../frontend/vite.config.ts'),server:{host:'127.0.0.1',port:5183,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+server.address().port,changeOrigin:true}}}});await vite.listen()
  browser=await(await import('playwright-core')).chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 },60000)
 afterAll(async()=>{
  await writeFile('/tmp/school-longitudinal-browser-requests.json',JSON.stringify(requests,null,2))
  if(browser)await browser.close();if(vite)await vite.close();if(server){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}
  await Promise.all([unlink(prefix+'.html').catch(()=>{}),unlink(prefix+'.tsx').catch(()=>{})]);await db.$disconnect()
 })
 it('creates native T3, opens and publishes it, saves an actual SELF answer and shows single plus independent changes',async()=>{
  const origin='http://school.localhost:5183'
  const pageFor=async(id:string)=>{
   const user=await db.user.findUniqueOrThrow({where:{id}}),context=await browser.newContext({viewport:{width:1350,height:1000}})
   const token=(await import('../../utils/jwt')).generateToken({userId:user.id,username:user.username,role:user.role,accountDomain:'SCHOOL',sessionProduct:'HUISCHOOL',tokenVersion:user.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
   await context.addCookies([{name:'huischool_session',value:token,url:origin},{name:'huischool_csrf',value:'school-longitudinal-browser',url:origin}])
   const next=await context.newPage();next.on('dialog',async(d:any)=>d.accept());next.on('response',(r:any)=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({method:r.request().method(),path:u.pathname,status:r.status()})})
   // The reusable private fixture has decorative image metadata only. Fulfil
   // just its two synthetic byte endpoints; publication/START/FINAL/reports
   // still use real protected product routes. This is not media acceptance.
   await context.route('**/*',(route:any)=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();const asset=url.pathname.match(/\/assets\/([^/]+)\/content$/)?.[1];if(asset&&syntheticMedia.has(asset))return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rlsAAAAASUVORK5CYII=','base64')});return route.continue()});return next
  }
  try{
   page=await pageFor(fixture.actor.userId)
   await page.goto(origin+'/.school-longitudinal-browser.html?role=manager&org='+fixture.organizationId+'&actor='+fixture.actor.userId,{waitUntil:'domcontentloaded'})
   const [retained]=await db.$queryRaw<Array<{courseId:string;runId:string;status:string;activityStatus:string}>>`SELECT link.course_id AS "courseId",run.id AS "runId",run.status,activity.status AS "activityStatus" FROM assessment_runs run JOIN campus_activity_runs link ON link.run_id=run.id JOIN campus_activities activity ON activity.course_id=link.course_id WHERE run.organization_id=${fixture.organizationId} AND run.personal_tracking_baseline_id=${fixture.runId} AND run.personal_tracking_ordinal=3`
   await page.getByRole('combobox',{name:'选择已有活动'}).selectOption(retained?.courseId??fixture.next.courseId,{timeout:30000})
   if(!retained){await page.getByRole('button',{name:'创建下一轮学生活动',exact:true}).click({timeout:30000});await page.getByText('下一轮活动草稿已创建；请按原流程确认名单、审批并发布。',{exact:true}).waitFor({timeout:30000})}
   const [third]=await db.$queryRaw<Array<{courseId:string;runId:string;status:string}>>`SELECT link.course_id AS "courseId",run.id AS "runId",run.status FROM assessment_runs run JOIN campus_activity_runs link ON link.run_id=run.id WHERE run.organization_id=${fixture.organizationId} AND run.personal_tracking_baseline_id=${fixture.runId} AND run.personal_tracking_ordinal=3`
   if(third.status==='DRAFT'){
    if(!retained||retained.activityStatus==='DRAFT')await page.getByRole('button',{name:'完成配置',exact:true}).click({timeout:30000})
    if(!retained||retained.activityStatus!=='OPEN')await page.getByRole('button',{name:'开放本人活动',exact:true}).click({timeout:30000})
    await page.getByRole('button',{name:/合成心理活动 · T3 ·/}).click({timeout:30000})
    await page.getByRole('button',{name:'预览合法参与者数量',exact:true}).click()
    await page.getByRole('button',{name:'正式发布本人测评',exact:true}).click()
    await page.getByText('正式测评已发布。学生仍需以本人身份完成原有作答流程。',{exact:true}).waitFor({timeout:30000})
   }
   await page.screenshot({path:'/tmp/school-longitudinal-browser-published.png',fullPage:true})
   const [execution]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status FROM assessment_run_executions WHERE run_id=${third.runId}`
   page=await pageFor(fixture.studentId)
   await page.goto(origin+'/.school-longitudinal-browser.html?role=student&activity='+third.courseId,{waitUntil:'domcontentloaded'})
   if(execution.status!=='COMPLETED'){
    await page.locator('[data-task-id="'+execution.id+'"]').getByRole('button',{name:'开始／继续官方测评',exact:true}).click({timeout:30000})
    const consent=page.getByRole('checkbox',{name:'我已阅读本次测评的用途与可见性说明，自愿同意作答。'});if(await consent.count())await consent.check()
    await page.getByRole('button',{name:'开始或继续正式测评',exact:true}).click()
    await page.getByRole('button',{name:'A',exact:true}).click({timeout:30000})
    await page.getByRole('button',{name:'提交整份量表',exact:true}).click()
   }else await page.locator('[data-task-id="'+execution.id+'"]').getByRole('button',{name:'查看我的测评反馈',exact:true}).click({timeout:30000})
   await page.getByRole('region',{name:'获准的个人测评反馈',exact:true}).waitFor({timeout:30000})
   await page.getByRole('button',{name:'查看我的变化',exact:true}).click()
   await page.getByRole('table',{name:'Total各轮记录',exact:true}).waitFor({timeout:30000})
   expect(await page.getByText('T2 → T3：-1 points',{exact:true}).count()).toBe(1)
   expect(await page.getByText('固定私有版本描述反馈，不是诊断。',{exact:true}).count()).toBeGreaterThan(0)
   await page.screenshot({path:'/tmp/school-longitudinal-browser-reports.png',fullPage:true})
  }catch(error){if(page)await page.screenshot({path:'/tmp/school-longitudinal-browser-failure.png',fullPage:true});throw error}
 },120000)
})
