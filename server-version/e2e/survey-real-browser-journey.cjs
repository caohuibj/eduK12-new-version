/* Full Survey browser acceptance against an ISOLATED REAL backend + PG.
 * NO page.route(), NO mocked API data, NO writes to public production IPs.
 * A separate disposable test seeder must supply SURVEY_REAL_BROWSER_FIXTURE:
 * {surveyUrl,adminUrl,entryUrl,adminCookies,researcherCookies} in mode 0600.
 */
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const dns=require('node:dns').promises
const {chromium}=require('../backend/node_modules/playwright-core')
const fixtureFile=process.env.SURVEY_REAL_BROWSER_FIXTURE
if(!fixtureFile)throw Error('Need an isolated Survey browser fixture; real PG required, never silently mock APIs')
const stat=fs.statSync(fixtureFile)
if(stat.mode&0o077)throw Error('Survey browser fixture must be chmod 600')
const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'))
const outfile=process.env.SURVEY_REAL_BROWSER_OUTPUT||'/tmp/survey-real-browser'
async function loopbackOnly(url){
  const {hostname}=new URL(url)
  const addresses=await dns.lookup(hostname,{all:true})
  assert.ok(addresses.length,'No mapped test hostname')
  assert.ok(addresses.every(x=>['127.0.0.1','::1'].includes(x.address)),
    'Browser fixture may only access loopback-mapped test hosts; public production is prohibited')
}
async function fillAnswers(page){
  // Iterate because a valid conditional Form can reveal later questions only
  // after a preceding answer. Never bypass server-side FINAL validation.
  for(let step=0;step<5;step++){
    let changed=false
    const fields=page.locator('form fieldset')
    for(let i=0;i<await fields.count();i++){
      const field=fields.nth(i)
      const radios=field.locator('input[type="radio"]')
      const names=await radios.evaluateAll(elements=>[...new Set(elements.map(x=>x.getAttribute('name')).filter(Boolean))])
      for(const name of names){
        const group=field.locator('input[type="radio"]').filter({hasNot:page.locator('nonsense-selector-that-never-matches')})
        const same=field.locator('input[type="radio"][name="'+name.replace(/["\\]/g,'')+'"]')
        if(await same.count()&&!(await same.first().isChecked())){
          await same.first().check();changed=true
        }
        void group
      }
      const checks=field.locator('input[type="checkbox"]')
      if(!names.length&&await checks.count()&&!(await checks.first().isChecked())){
        await checks.first().check();changed=true
      }
      const number=field.locator('input[type="number"]')
      if(await number.count()&&!(await number.first().inputValue())){
        await number.first().fill(await number.first().getAttribute('min')||'1');changed=true
      }
      const text=field.locator('textarea')
      if(await text.count()&&!(await text.first().inputValue())){
        await text.first().fill('用于检验 Survey 的匿名研究任务');changed=true
      }
    }
    if(!changed)break
  }
}
async function runParticipant(browser,width){
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  try{
    await page.goto(fixture.entryUrl,{waitUntil:'domcontentloaded'})
    await page.getByText('研究波次',{exact:true}).waitFor()
    await page.getByRole('button',{name:'选择本轮'}).first().click()
    await page.getByRole('checkbox',{name:/我已阅读并同意/}).check()
    await page.getByRole('button',{name:/首次参加/}).click()
    const codes=await page.locator('code').allTextContents()
    const researchCode=codes.find(x=>/^R-[A-Z0-9]{8,32}$/.test(x.trim()))
    const secret=codes.find(x=>/^[A-Za-z0-9_-]{43}$/.test(x.trim()))
    assert.ok(researchCode&&secret,'New linked identity and one-time secret must appear')
    await page.getByRole('button',{name:/开始或恢复本轮作答/}).click()
    await page.getByRole('button',{name:'提交本轮正式回答'}).waitFor()
    await fillAnswers(page)
    await page.getByRole('button',{name:'提交本轮正式回答'}).click()
    await page.getByRole('heading',{name:'本轮回答已完成'}).waitFor()
    assert.equal(await page.getByText(/未经验证的诊断或常模/).count()>0,true)
    // Open the subsequent wave from the same project, with the same identity.
    await page.getByRole('button',{name:'返回我的研究波次'}).click()
    const followup=page.locator('div.border-b').filter({hasText:'第 2 轮'}).first()
    await followup.getByRole('button',{name:/选择本轮/}).click()
    await page.getByRole('checkbox',{name:/我已阅读并同意/}).check()
    await page.getByRole('button',{name:/开始或恢复本轮作答/}).click()
    await page.getByRole('button',{name:'提交本轮正式回答'}).waitFor()
    await fillAnswers(page)
    await page.getByRole('button',{name:'提交本轮正式回答'}).click()
    await page.getByRole('heading',{name:'本轮回答已完成'}).waitFor()
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
    assert.equal(overflow,false,'horizontal overflow at viewport width '+width)
    assert.deepEqual(errors,[])
    await page.screenshot({path:path.join(outfile,'participant-'+width+'.png'),fullPage:true})
  }finally{await context.close()}
}
async function inspectRole(browser,width,url,cookies,heading,filename){
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true})
  try{
    await context.addCookies(cookies)
    const page=await context.newPage()
    await page.goto(url,{waitUntil:'domcontentloaded'})
    await page.getByRole('heading',{name:heading}).waitFor()
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
    assert.equal(overflow,false,'role UI overflows at '+width)
    await page.screenshot({path:path.join(outfile,filename+'-'+width+'.png'),fullPage:true})
  }finally{await context.close()}
}
;(async()=>{
  for(const url of [fixture.surveyUrl,fixture.adminUrl,fixture.entryUrl])
    await loopbackOnly(url)
  fs.mkdirSync(outfile,{recursive:true})
  const browser=await chromium.launch({headless:true,
    ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})})
  try{
    for(const width of [390,768,1440]){
      await inspectRole(browser,width,fixture.adminUrl+'/admin/survey-researchers',
        fixture.adminCookies,'Survey｜研究者资格管理','admin')
      await inspectRole(browser,width,fixture.surveyUrl+'/',
        fixture.researcherCookies,'我的研究','researcher')
      await runParticipant(browser,width)
    }
  }finally{await browser.close()}
  console.log('Real Survey isolated browser acceptance: three roles, 390/768/1440, T1/T2 FINAL+General: PASS')
})().catch(e=>{console.error(e);process.exitCode=1})
