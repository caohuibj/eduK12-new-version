/* Production build acceptance with deterministic public API fixtures. */
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {chromium}=require('../backend/node_modules/playwright-core')
const base=process.env.INBOX_E2E_BASE_URL || 'http://127.0.0.1:5181'
const output=process.env.STUDY_E2E_OUTPUT || '/tmp/huisurvey-study-evidence'
const credential='x'.repeat(43),sid='11111111-1111-4111-8111-111111111111'
;(async()=>{
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})})
 const cases=[]
 try {for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[]
  let denied=false,started=false;page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data={list:[]},status=200
   if(url.pathname==='/api/capabilities')data={cognitive:true,parentPortal:false}
   if(url.pathname.endsWith('/info'))data={studyId:sid,studyTitle:'研究身份恢复测试',title:'第一波',accepting:true}
   if(url.pathname.endsWith('/join')){assert.equal(req.postDataJSON().consent,true);data={studyId:sid,credential,displayCode:'P-TEST'}}
   if(url.pathname===`/api/public/anonymous-studies/${sid}`){assert.equal(req.headers().authorization,`Bearer ${credential}`);if(denied)status=404;else data={studyId:sid,title:'研究身份恢复测试',displayCode:'P-TEST',waves:[{id:'wave',title:'第一波',ordinal:1,attemptId:'own',state:'COMPLETED',completedAt:'2026-10-01',accepting:true},{id:'wave-two',title:'第二波',ordinal:2,attemptId:started?'own-two':null,state:started?'IN_PROGRESS':null,completedAt:null,accepting:true}],limitations:['历史报告不等于可比较的长期变化']}}
   if(url.pathname.endsWith('/waves/wave-two/start')){assert.equal(req.headers().authorization,`Bearer ${credential}`);started=true;data={attemptId:'own-two',state:'IN_PROGRESS',recoveryToken:'r'.repeat(32)}}
   if(url.pathname==='/api/public/composite-assessments/attempts/own-two'){assert.equal(req.headers()['x-recovery-token'],'r'.repeat(32));data={id:'own-two',assessmentId:'composite',name:'第二波测评',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1,progress:0,completedItems:0,totalItems:1,currentIndex:0,items:[{id:'cog',type:'COGNITIVE',position:0,index:0,completed:false,label:'认知任务'}],currentItem:{id:'cog',type:'COGNITIVE',position:0,required:true,cognitiveSession:{sessionId:'session-two'}},context:null}}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:-1,message:status===200?'ok':'身份已停用',data:status===200?data:null})})
  })
  await page.goto(`${base}/public/studies/waves/wave/token`)
  const join=page.getByRole('button',{name:'创建研究内身份码'});await join.waitFor();assert.equal(await join.isEnabled(),false)
  await page.getByRole('checkbox').check();await join.click();await page.getByText(credential,{exact:true}).waitFor()
  await page.getByRole('button',{name:'进入我的研究测评'}).click();await page.getByRole('button',{name:'查看本次个人报告'}).waitFor()
  await page.getByRole('button',{name:'开始本波次测评',exact:true}).click();await page.getByRole('button',{name:'保存并退出',exact:true}).waitFor()
  assert.equal(new URL(page.url()).pathname,'/public/composite/attempts/own-two')
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('composite:recovery:attempt:own-two')),'r'.repeat(32))
  await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:'继续作答',exact:true}).waitFor()
  assert.equal(new URL(page.url()).pathname,`/public/studies/${sid}`)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true)
  await page.screenshot({path:`${output}/identity-${width}.png`,fullPage:true})
  denied=true;await page.getByRole('button',{name:'刷新任务与历史'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'查看本次个人报告'}).count(),0)
  assert.deepEqual(errors,[]);cases.push({width,passed:true});await context.close()
 }}finally{await browser.close()}
 fs.writeFileSync(`${output}/result.json`,JSON.stringify({cases},null,2));console.log(`Anonymous study browser matrix: ${cases.length} passed`)
})().catch(e=>{console.error(e);process.exitCode=1})
