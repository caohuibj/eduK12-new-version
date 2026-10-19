const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const {chromium}=require('../../backend/node_modules/playwright-core')
const {sessionJsonFetch}=require('../../e2e/helpers/session-auth.cjs')
const state=process.argv[2],base=process.env.C04_BROWSER_URL
assert.equal(new URL(base).hostname,'127.0.0.1')
const fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
const checks=[],errors=[],submitted=[]
const check=name=>{checks.push(name);console.log('PASS',name)}
const ok=response=>{assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.code,0);return response.body.data}
async function login(page,who,role){await page.goto(base+'/training');ok(await sessionJsonFetch(page,'/auth/training-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...who,expectedRole:role})}))}
async function shot(page,label,width){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+label);await page.screenshot({path:path.join(state,label+'-'+width+'.png'),fullPage:true})}
async function main(){
 const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/usr/bin/chromium'})
 const teacherContext=await browser.newContext({viewport:{width:1440,height:900}})
 const studentContext=await browser.newContext({viewport:{width:1440,height:900}})
 for(const context of [teacherContext,studentContext])await context.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:'?route.continue():route.abort()})
 const page=await teacherContext.newPage(),student=await studentContext.newPage()
 for(const p of [page,student])p.on('pageerror',error=>errors.push(error.message))
 student.on('request',request=>{if(request.method()==='POST'&&/form-sections\/[^/]+\/submit/.test(request.url()))submitted.push(JSON.parse(request.postData()))})
 let result={passed:false}
 try{
  await login(page,fixture.teacher,'TEACHER');await page.goto(base+'/questionnaire-products/new')
  await page.getByLabel('测评名称',{exact:true}).fill('C04 浏览器基础题型')
  await page.getByLabel(fixture.courses[0].title,{exact:true}).check()
  await page.getByRole('button',{name:'创建草稿',exact:true}).click()
  await page.waitForURL(url=>url.pathname.startsWith('/questionnaire-products/')&&!url.pathname.endsWith('/new'))
  const id=page.url().split('/').pop()
  for(const [type,label] of [['number','浏览器数值'],['long_text','浏览器长文本'],['date','浏览器日期'],['time','浏览器时间']]){
   await page.getByLabel('测评类型',{exact:true}).selectOption('FORM')
   await page.getByLabel('题目文字',{exact:true}).fill(label)
   await page.getByLabel('题型',{exact:true}).selectOption(type)
   if(type==='number'){await page.getByLabel('最小值',{exact:true}).fill('-10');await page.getByLabel('最大值',{exact:true}).fill('10');await page.getByLabel('最大小数位（留空表示不限制）',{exact:true}).fill('2');await page.getByLabel('步长（留空表示任意）',{exact:true}).fill('0.25')}
   if(type==='long_text')await page.getByLabel('字数上限',{exact:true}).fill('10000')
   if(type==='time')await page.getByLabel('时间时区',{exact:true}).selectOption('UTC')
   const response=page.waitForResponse(r=>r.url().endsWith('/items')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'添加到测评',exact:true}).click();assert.equal((await response).status(),200)
   await page.getByLabel('题目文字',{exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(x=>x.value===''))
  }
  await shot(page,'c04-editor',1440);await shot(page,'c04-editor',390)
  const preflight=page.waitForResponse(r=>r.url().endsWith('/preflight')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'发布前自检',exact:true}).click();assert.equal((await preflight).status(),200)
  await page.getByText('当前草稿自检通过',{exact:true}).waitFor()
  const published=page.waitForResponse(r=>r.url().endsWith('/publish')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'发布组合测评',exact:true}).click();assert.equal((await published).status(),200)
  const detail=ok(await sessionJsonFetch(page,'/questionnaire-products/'+id))
  assert.equal(detail.items.length,4)
  for(const item of detail.items){assert.equal(item.form.formDefinition.itemKey,'q_'+item.id);assert.equal(item.form.formDefinition.prompt,item.form.label)}
  check('real Chromium teacher creates all four typed definitions, freezes constraints and publishes; 390/1440 editor has no overflow')
  await login(student,fixture.student,'STUDENT');await student.goto(base+'/student/composite/'+id)
  const number=student.getByRole('spinbutton',{name:'浏览器数值',exact:true});await number.fill('-1.25')
  await student.getByText('已保存到本机。',{exact:true}).waitFor()
  await student.reload();await number.waitFor();assert.equal(await number.inputValue(),'-1.25')
  await number.fill('0.333')
  const rejection=student.waitForResponse(r=>/form-sections\/[^/]+\/submit/.test(r.url())&&r.request().method()==='POST')
  await student.getByRole('button',{name:'提交整个区段',exact:true}).click();assert.equal((await rejection).status(),400)
  await student.waitForFunction(()=>!document.querySelector('input[type="number"]')?.disabled)
  await number.fill('0')
  const accepted=student.waitForResponse(r=>/form-sections\/[^/]+\/submit/.test(r.url())&&r.request().method()==='POST'&&r.status()===200)
  await student.getByRole('button',{name:'提交整个区段',exact:true}).dblclick();await accepted
  const text=student.getByRole('textbox',{name:'浏览器长文本',exact:true});await text.waitFor()
  const longText='浏览器中文长文本。\n'.repeat(500);await text.fill(longText)
  await student.getByText('已保存到本机。',{exact:true}).waitFor();await student.reload();await text.waitFor();assert.equal(await text.inputValue(),longText)
  await student.getByRole('button',{name:'提交整个区段',exact:true}).click()
  const date=student.getByLabel('浏览器日期',{exact:true});await date.fill('2024-02-29');await student.getByRole('button',{name:'提交整个区段',exact:true}).click()
  const time=student.getByLabel('浏览器时间',{exact:true});await time.fill('00:00')
  await student.getByText('时间解释时区：UTC；请填写 24 小时制。',{exact:true}).waitFor()
  await shot(student,'c04-time',390);await shot(student,'c04-time',1440)
  await student.getByRole('button',{name:'提交整个区段',exact:true}).click()
  await student.getByRole('button',{name:'查看个人报告',exact:true}).waitFor({timeout:30000})
  await student.getByRole('button',{name:'查看个人报告',exact:true}).click()
  await student.waitForURL(url=>url.pathname.endsWith('/report'))
  await student.getByText('浏览器日期',{exact:false}).first().waitFor()
  await shot(student,'c04-report',1440)
  assert.equal(submitted[0].answers[0].value,0.333)
  assert.equal(submitted[1].answers[0].value,0)
  assert.notEqual(submitted[0].submissionId,submitted[1].submissionId)
  const validById=new Map()
  for(const payload of submitted.slice(1)){const prior=validById.get(payload.submissionId);if(prior)assert.deepEqual(payload,prior);else validById.set(payload.submissionId,payload)}
  assert.ok([...validById.values()].some(payload=>payload.answers[0].value===longText))
  check('real Chromium typed negative/large text refresh, server-invalid numeric correction, zero, double-click, date/time and report complete')
  assert.deepEqual(errors,[])
  result={passed:true,checks,requests:submitted.length,uniqueAcceptedSubmissionIds:validById.size,sourceHead:process.env.C04_SOURCE_HEAD}
 }catch(error){result={passed:false,checks,error:String(error),pageErrors:errors};await student.screenshot({path:path.join(state,'c04-failure.png'),fullPage:true}).catch(()=>{});throw error}
 finally{fs.writeFileSync(path.join(state,'c04-browser-result.json'),JSON.stringify(result,null,2));await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
