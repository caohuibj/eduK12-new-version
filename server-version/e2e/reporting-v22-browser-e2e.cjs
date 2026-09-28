const assert=require('node:assert/strict')
const fs=require('node:fs')
const {chromium}=require('../backend/node_modules/playwright-core')
const {loginWithSession}=require('./helpers/session-auth.cjs')
async function main(){
 assert.equal(process.env.REPORTING_BROWSER_ISOLATED_DB,'1')
 const f=JSON.parse(fs.readFileSync(process.env.REPORTING_BROWSER_FIXTURE||'/tmp/reporting-v22-fixture.json','utf8'))
 const baseUrl=process.env.REPORTING_BROWSER_BASE_URL||'http://127.0.0.1:5173'
 const output=process.env.REPORTING_BROWSER_EVIDENCE||'/tmp/reporting-v22-evidence'
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})})
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const generate=async(name)=>{
  const response=page.waitForResponse(r=>r.url().endsWith('/reporting/analyses')&&r.request().method()==='POST')
  await page.getByRole('button',{name,exact:true}).click()
  const r=await response,payload=await r.json();assert.equal(r.status(),200,JSON.stringify(payload));assert.equal(payload.code,0)
  return payload.data.projection
 }
 try{
  await loginWithSession(page,{baseUrl,route:'/teacher/account-login',username:f.username,password:f.password,timeout:60000})
  await page.goto(baseUrl+'/organizations/'+f.organizationId+'/reporting')
  await page.getByLabel('女生',{exact:true}).check()
  await page.getByRole('region',{name:'单次群体报告',exact:true}).getByLabel('选择测量',{exact:true}).selectOption(f.first.runId+'::'+f.first.trackId)
  await page.getByLabel('报告方案（单次）',{exact:true}).selectOption(f.specs.GROUP)
  const group=await generate('生成单次群体报告');assert.equal(group.eligibleN,4)
  await page.getByLabel('三班',{exact:true}).check()
  const historical=await generate('生成单次群体报告');assert.equal(historical.eligibleN,4)
  await page.getByLabel('三班',{exact:true}).uncheck()
  await page.getByLabel('选择测量项目',{exact:true}).selectOption(f.resource)
  const times=page.getByRole('group',{name:'选择至少两个时间点',exact:true}).getByRole('checkbox')
  assert.equal(await times.count(),3)
  for(const item of await times.all())await item.check()
  await page.getByLabel('报告方案',{exact:true}).selectOption(f.specs.REPEATED_COHORT)
  const repeated=await generate('生成群体纵向报告');assert.equal(repeated.kind,'REPEATED_COHORT');assert.equal(repeated.waves.length,3)
  await page.getByLabel('分析方式',{exact:true}).selectOption('MATCHED_LONGITUDINAL')
  await page.getByLabel('人群定义',{exact:true}).selectOption('BASELINE_FIXED')
  await page.getByLabel('匹配方式',{exact:true}).selectOption('FULL_CASE')
  await page.getByLabel('报告方案',{exact:true}).selectOption(f.specs.MATCHED_LONGITUDINAL)
  const matched=await generate('生成群体纵向报告');assert.equal(matched.matchedEligibleN,4)
  await page.getByRole('button',{name:'选择指定成员',exact:true}).click()
  const memberBox=page.getByRole('group',{name:'指定成员（可选）',exact:true}).getByRole('checkbox')
  await memberBox.first().waitFor();await memberBox.first().check()
  const small=await generate('生成单次群体报告');assert.equal(small.state,'suppressed')
  await page.getByRole('button',{name:'重置为全部受测者',exact:true}).click()
  await page.getByRole('button',{name:'选择学生生成个人报告',exact:true}).click()
  await page.getByLabel('选择学生',{exact:true}).selectOption(f.subject)
  await page.getByLabel('个人测量项目',{exact:true}).selectOption(f.resource)
  const personalTimes=page.getByRole('group',{name:'个人测量时间',exact:true}).getByRole('checkbox')
  for(const item of await personalTimes.all())await item.check()
  await page.getByLabel('个人报告方案',{exact:true}).selectOption(f.specs.INDIVIDUAL_LONGITUDINAL)
  const individual=await generate('生成个人纵向报告');assert.equal(individual.waves.length,3)
  for(const comparison of individual.comparisons)for(const metric of Object.values(comparison.metrics)){assert.equal(metric.comparability.level,'NOT_COMPARABLE');assert.equal(metric.delta,undefined)}
  await page.getByLabel('个人报告结果').waitFor()
  await page.screenshot({path:output+'/reporting.png',fullPage:true})
  assert.deepEqual(errors,[])
  fs.writeFileSync(output+'/result.json',JSON.stringify({group:true,repeated:true,matched:true,historicalClass:true,individual:true,noUnsupportedDelta:true,memberSuppression:true,errors},null,2))
 }catch(e){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});throw e}
 finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
