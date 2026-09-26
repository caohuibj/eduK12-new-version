const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('../backend/node_modules/playwright-core')
const { loginWithSession, sessionJsonFetch } = require('./helpers/session-auth.cjs')
const fixture = JSON.parse(fs.readFileSync(process.env.QUESTIONNAIRE_PRODUCT_FIXTURE_FILE || '/tmp/huisurvey-q1-browser-fixture.json','utf8'))
const baseUrl = process.env.QUESTIONNAIRE_PRODUCT_BASE_URL || 'http://127.0.0.1:5141'
const output = process.env.QUESTIONNAIRE_PRODUCT_EVIDENCE || '/tmp/huisurvey-q1-browser'
fs.mkdirSync(output,{recursive:true})
function ok(response) { assert.equal(response.status,200,JSON.stringify(response.body)); assert.equal(response.body.code,0); return response.body.data }
async function completeFour(page, label) {
  await page.locator('textarea').fill('学习与合作')
  await page.waitForTimeout(300)
  const route=page.url()
  await page.reload()
  await page.locator('textarea').waitFor()
  assert.equal(await page.locator('textarea').inputValue(),'学习与合作')
  assert.equal(page.url(),route)
  await page.getByRole('button',{name:'提交整个区段',exact:true}).click()
  await page.getByRole('button',{name:'是',exact:true}).click()
  await page.waitForTimeout(300)
  await page.getByRole('button',{name:'提交整份量表',exact:true}).click()
  await page.getByRole('button',{name:'开始/继续文字情境测评',exact:true}).click()
  await page.locator('input[type="radio"]').first().click()
  await page.waitForFunction(()=>document.querySelector('input[type="radio"]')?.checked)
  await page.getByRole('button',{name:'情境 2，未完成',exact:true}).click()
  await page.locator('input[type="radio"]').first().click()
  await page.waitForFunction(()=>document.querySelector('input[type="radio"]')?.checked)
  await page.getByRole('button',{name:'提交测评',exact:true}).click()
  await page.getByRole('button',{name:'开始/继续认知任务',exact:true}).click()
  await page.getByRole('button',{name:'开始测评',exact:true}).click()
  await page.getByRole('button',{name:'开始练习',exact:true}).click()
  let green=false
  const deadline=Date.now()+300000
  while(Date.now()<deadline) {
    const formal=page.getByRole('button',{name:'开始正式测验',exact:true})
    if(await formal.isVisible()) { await formal.click(); green=false }
    const retry=page.getByRole('button',{name:'重新练习',exact:true})
    if(await retry.isVisible()) { await retry.click(); green=false }
    const stimulus=page.getByRole('button',{name:'respond',exact:true})
    if(await stimulus.count()) {
      const visible=(await stimulus.getAttribute('class')).includes('bg-green-500')
      if(visible&&!green) { await page.waitForTimeout(150); await page.keyboard.press('Space') }
      green=visible
    }
    if(page.url().includes('/report') || await page.getByRole('button',{name:'查看个人报告',exact:true}).isVisible()) break
    const finish=page.getByRole('button',{name:/完成测评|提交结果|查看报告|返回综合测评/}).first()
    if(await finish.isVisible()) await finish.click()
    await page.waitForTimeout(75)
  }
  const reportButton=page.getByRole('button',{name:'查看个人报告',exact:true})
  if(await reportButton.isVisible()) await reportButton.click()
  await page.waitForURL(url=>url.pathname.endsWith('/report'),{timeout:30000})
  await page.screenshot({path:output+'/'+label+'-report.png',fullPage:true})
  assert.equal(await page.getByText('本次学习目标',{exact:false}).count()>0,true)
}
async function main() {
  assert.equal(process.env.QUESTIONNAIRE_PRODUCT_ISOLATED_DB,'1','Use an isolated test service')
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
  const context = await browser.newContext({viewport:{width:1440,height:1000}})
  const page = await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const publicMode=process.env.QUESTIONNAIRE_PRODUCT_PUBLIC==='1'
  try {
    await loginWithSession(page,{baseUrl,route:publicMode?'/admin/login':'/teacher/account-login',...(publicMode?fixture.admin:fixture.teacher),...(publicMode?{usernamePlaceholder:'请输入管理员账号',submitName:'管理员登录'}:{}),timeout:60000})
    if(process.env.QUESTIONNAIRE_PRODUCT_REPORT_ONLY==='1') {
      const previous=JSON.parse(fs.readFileSync(output+'/result.json','utf8'))
      const payload=ok(await sessionJsonFetch(page,'/questionnaire-products/'+previous.id+'/reports'))
      assert.equal(payload.reports.length,1)
      const report=payload.reports[0]
      assert.equal(report.productKind,'QUESTIONNAIRE')
      assert.equal(report.unitReports.length,3)
      assert.notEqual(report.unitReports.find(v=>v.type==='SCALE').reportKind,'unavailable')
      await page.goto(baseUrl+'/composite-assessments/'+previous.id+'/attempts/'+report.id+'/report')
      await page.locator('[data-testid^="composite-unit-report-"]').nth(2).waitFor()
      assert.equal(await page.getByTestId('scale-report-unavailable').count(),0)
      await page.screenshot({path:output+'/final-report.png',fullPage:true})
      console.log('Final independent report API, disclosure and browser projection: PASS')
      return
    }
    await page.goto(baseUrl+'/questionnaires')
    await page.getByRole('link',{name:'创建问卷',exact:true}).click()
    const name='四类问卷浏览器验收 '+Date.now()
    await page.getByLabel('问卷名称',{exact:true}).fill(name)
    if(publicMode) {
      await page.getByLabel('问卷类型',{exact:true}).selectOption('GENERAL')
      await page.getByLabel('截止时间',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16))
    } else for(const course of fixture.courses) await page.getByLabel(course.title,{exact:true}).check()
    await page.getByRole('button',{name:'创建草稿',exact:true}).click()
    await page.waitForURL(url=>url.pathname.startsWith('/questionnaire-products/')&&!url.pathname.endsWith('/new'))
    const id=page.url().split('/').pop()
    await page.getByRole('button',{name:'发布问卷',exact:true}).waitFor()
    for(const [type,value] of [['FORM',null],['SCALE',fixture.scaleId],['SITUATIONAL','sjt-assertiveness-golden/1.0.0'],['COGNITIVE',fixture.assignmentId]]) {
      await page.getByLabel('测评类型',{exact:true}).selectOption(type)
      if(type==='FORM') await page.getByLabel('题目文字',{exact:true}).fill('本次学习目标')
      else await page.getByLabel('选择测评',{exact:true}).selectOption(value)
      const response=page.waitForResponse(r=>r.url().endsWith('/items')&&r.request().method()==='POST')
      await page.getByRole('button',{name:'添加到问卷',exact:true}).click()
      assert.equal((await response).status(),200)
      await page.getByRole('button',{name:'添加到问卷',exact:true}).waitFor({state:'visible'})
    }
    await page.screenshot({path:output+'/teacher-editor.png',fullPage:true})
    const publish=page.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST')
    await page.getByRole('button',{name:'发布问卷',exact:true}).click()
    assert.equal((await publish).status(),200)
    await page.getByRole('button',{name:'停止新作答',exact:true}).waitFor()
    const detail=ok(await sessionJsonFetch(page,'/questionnaire-products/'+id))
    assert.equal(detail.items.length,4)
    assert.equal(detail.questionnaireCourses.length,publicMode?0:2)
    assert.equal(detail.reportMode,'COLLECTION_ONLY')
    const bypass=await sessionJsonFetch(page,'/composite-assessments/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'bypass'})})
    assert.equal(bypass.status,409)
    ok(await sessionJsonFetch(page,'/questionnaire-products/'+id+'/reports'))
    await page.setViewportSize({width:390,height:844})
    await page.screenshot({path:output+'/teacher-mobile.png',fullPage:true})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile overflow')
    const studentContext=await browser.newContext({viewport:{width:1280,height:900}})
    const student=await studentContext.newPage()
    let publicEntry
    if(publicMode) {
      await page.getByLabel('有效期',{exact:true}).fill(new Date(Date.now()+3600000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16))
      await page.getByLabel('最大参与次数（0 表示不限）',{exact:true}).fill('1')
      await page.getByRole('button',{name:'生成新链接',exact:true}).click()
      const link=page.locator('a[href*="/public/composite/"]').first()
      await link.waitFor()
      publicEntry=await link.getAttribute('href')
      await student.goto(publicEntry)
      await student.getByRole('button',{name:'开始匿名测评',exact:true}).click()
    } else {
      await loginWithSession(student,{baseUrl,route:'/student/login',...fixture.student,timeout:60000})
      await student.goto(baseUrl+'/student/questionnaires')
      await student.getByRole('link').filter({hasText:name}).click()
    }
    await student.getByText('本次学习目标',{exact:false}).waitFor()
    await student.screenshot({path:output+'/student-form.png',fullPage:true})
    await completeFour(student, 'student').catch(async e=>{await student.screenshot({path:output+'/student-failure.png',fullPage:true});throw e})
    if(publicMode) {
      const reportUrl=student.url()
      await student.goto(publicEntry)
      await student.waitForURL(reportUrl,{timeout:30000})
      await student.getByText('本次学习目标',{exact:false}).waitFor()
    }
    fs.writeFileSync(output+'/result.json',JSON.stringify({id,name,teacherAuthoring:true,multiCourse:true,fourTypes:true,legacyBypassBlocked:true,studentEntry:true,studentCompleted:true,publicMode,errors},null,2))
    assert.deepEqual(errors,[])
    console.log('Questionnaire browser authoring, publish, four-type completion and report: PASS')
    await studentContext.close()
  } catch(e) {
    await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{})
    throw e
  } finally { await browser.close() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
