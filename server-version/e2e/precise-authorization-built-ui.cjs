/* Exact-dist presentation smoke only. Every URL is intercepted locally before
 * navigation: canonical-looking hosts below never contact production. Backend
 * permission evidence is supplied separately by the real isolated HTTP tests. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const {chromium}=require('playwright')
if(process.env.PRECISE_AUTHORIZATION_BUILT_UI!=='1')throw Error('Explicit isolated built-UI mode required')
const dist=path.resolve(process.env.PRECISE_AUTHORIZATION_DIST||''),out=path.resolve(process.env.PRECISE_AUTHORIZATION_UI_OUT||'')
if(!dist.startsWith('/workspace/materials-load-20261029/')||!out.startsWith('/workspace/materials-load-20261029/evidence/'))throw Error('Named isolated artifact/evidence paths required')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor=id(1),org=id(2),person={id:id(5),userId:id(5),membershipId:id(6),username:'合成接收者',nickname:'合成接收者',role:'TEACHER',teacherApproved:true,isActive:true,isFrozen:false,status:'ACTIVE'}
const versions={CONTENT:'C-existing',PARAMETERS:'none-v1',REPORT:'R-basic-existing'}
const choice={id:id(3),title:'合成界面夹具量表',toolKey:'synthetic-ui-only',instrumentVersion:'1.0.0',combinationHash:'a'.repeat(64),state:'ONLINE',versions,
 assignable:true,unavailableReason:null,authorities:[{id:id(4),version:1,validFrom:'2020-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z'}]}
const choices=[choice,{...choice,id:id(7),combinationHash:'b'.repeat(64),versions:{...versions,REPORT:'none-v1'}}]
const user={id:actor,username:'synthetic-ui-manager',nickname:'合成管理员',role:'ADMIN',businessRole:'TEACHER',accountDomain:'TRAINING',platformRole:'STANDARD',
 teacherApproved:true,isActive:true,isFrozen:false,mustChangePassword:false,tokenVersion:0,entryGrants:['TRAINING','SURVEY','HUISCHOOL','HUITEACHER'].map((entry,i)=>({id:id(20+i),entry,version:1}))}
const cases=process.env.PRECISE_AUTHORIZATION_UI_CASES?.split(',')||['training','survey','school','teacher']
if(cases.some(name=>!['training','survey','school','teacher'].includes(name)))throw Error('Unknown UI case')
const viewports=process.env.PRECISE_AUTHORIZATION_UI_MOBILE_ONLY==='1'?[{name:'mobile-dark',width:390,height:844,colorScheme:'dark'}]:
 process.env.PRECISE_AUTHORIZATION_UI_DESKTOP_ONLY==='1'?[{name:'desktop-light',width:1280,height:900,colorScheme:'light'}]:[{name:'desktop-light',width:1280,height:900,colorScheme:'light'},{name:'mobile-dark',width:390,height:844,colorScheme:'dark'}]
const result={schemaVersion:1,syntheticUIOnly:true,realBackendAuthorization:false,productionNetworkAccessed:false,artifact:dist,cases:[],unknownApi:[],blockedSockets:0,externalAssets:[],writes:[]}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'}
let browser
async function fixture(route){
 const request=route.request(),url=new URL(request.url()),p=url.pathname
 if(p.startsWith('/api/')){
  if(request.method()!=='GET'){result.writes.push({method:request.method(),path:p});await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:-1,message:'Read-only built-UI fixture; no authorization writes',data:null})});return}
  let data
  if(p==='/api/auth/me')data=user
  else if(p==='/api/capabilities')data={cognitive:true,parentPortal:false}
  else if(p==='/api/auth/csrf')data={csrfToken:'synthetic-read-only-ui'}
  else if(p==='/api/questionnaire-products/standard-combinations/catalog')data={page:1,hasMore:false,list:choices}
  else if(/^\/api\/questionnaire-products\/standard-combinations\/[^/]+\/use-grants$/.test(p))data={page:1,hasMore:false,list:[]}
  else if(p==='/api/users')data={list:[person],total:1,page:1,pageSize:100}
  else if(p==='/api/platform/survey/researchers')data={list:[{...person,createdAt:'2026-01-01T00:00:00.000Z'}],page:1,hasMore:false}
  else if(p==='/api/platform/survey/researcher-invitations')data={list:[],page:1,hasMore:false}
  else if(p==='/api/platform/survey/source-catalog')data={actorId:actor,list:choices.map(c=>({ref:{kind:'SCALE',sourceId:'survey-standard:'+c.id,sourceVersion:c.combinationHash},title:c.title,available:true,
   configuration:{toolKey:c.toolKey,instrumentVersion:c.instrumentVersion,report:c.versions.REPORT,axes:{CONTENT:'c',PARAMETERS:'p',REPORT:c.id},axisVersions:c.versions}})),page:1,hasMore:false,terminalReason:'END_OF_CATALOG'}
  else if(/^\/api\/platform\/survey\/researchers\/[^/]+\/tool-grants$/.test(p))data={list:[],page:1,hasMore:false}
  else if(p===`/api/platform/education/organizations/${org}/products`)data=['HUISCHOOL','HUITEACHER'].map(product=>({product,status:'ACTIVE',revision:1}))
  else if(p.endsWith('/teacher-admins'))data={list:[],truncated:false}
  else if(/\/products\/(HUISCHOOL|HUITEACHER)\/standard-configurations$/.test(p))data={page:1,hasMore:false,list:choices}
  else if(/\/standard-configurations\/(?:[^/]+\/)?recipients$/.test(p))data={page:1,hasMore:false,list:[person]}
  else if(/\/standard-configurations\/[^/]+\/use-grants$/.test(p))data={page:1,hasMore:false,list:[]}
  else if(p==='/api/scales'||p==='/api/cognitive/configs'||p==='/api/notifications')data={list:[],total:0,page:1,unreadCount:0}
  else {result.unknownApi.push({method:request.method(),path:p});await route.fulfill({status:501,contentType:'application/json',body:JSON.stringify({code:-1,message:'Unmapped synthetic UI dependency',data:null})});return}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'Synthetic read-only presentation fixture',data})});return
 }
 if(url.origin!=='https://training.eduk12.top'){
  result.externalAssets.push({origin:url.origin,path:p});await route.abort('blockedbyclient');return
 }
 const target=request.resourceType()==='document'?path.join(dist,'index.html'):path.resolve(dist,'.'+decodeURIComponent(p))
 if(!target.startsWith(dist+path.sep))throw Error('Artifact path escaped')
 try{await route.fulfill({status:200,contentType:mime[path.extname(target)]||'application/octet-stream',body:await fs.readFile(target)})}
 catch{await route.fulfill({status:404,body:'Missing isolated artifact'})}
}
async function axisPicker(page){
 await page.getByText('按题本、参数和报告查找已批准配置',{exact:true}).click()
 await page.getByLabel('量表工具',{exact:false}).selectOption(choice.toolKey)
 await page.getByLabel('题本 C',{exact:false}).selectOption(versions.CONTENT)
 await page.getByLabel('解释参数 P',{exact:false}).selectOption(versions.PARAMETERS)
 const reports=await page.getByLabel('报告 R',{exact:false}).locator('option').evaluateAll(rows=>rows.map(row=>row.value))
 assert(reports.includes(versions.REPORT)&&reports.includes('none-v1'),'Both existing R choices must be distinguishable')
 await page.getByLabel('报告 R',{exact:false}).selectOption(versions.REPORT)
 assert(await page.getByRole('button',{name:'使用所选已批准组合',exact:true}).isDisabled(),'No implicit exact release selection')
 const exact=page.getByLabel('核对精确配置',{exact:false}),options=await exact.locator('option').evaluateAll(rows=>rows.filter(row=>row.value).map(row=>row.value))
 assert.equal(options.length,1,'Only one explicitly matched source in this synthetic fixture')
 assert(options[0].includes(choice.id),'The exact native entry source key retains the chosen release identity')
 await exact.selectOption(options[0])
 await page.getByRole('button',{name:'使用所选已批准组合',exact:true}).click()
}
;(async()=>{
 await fs.mkdir(out,{recursive:true})
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--disable-dev-shm-usage']});result.browserVersion=browser.version();result.playwrightVersion=require('playwright/package.json').version
 for(const viewport of viewports)for(const name of cases){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},colorScheme:viewport.colorScheme,serviceWorkers:'block'})
  await context.route('**/*',fixture);await context.routeWebSocket('**',socket=>{result.blockedSockets++;socket.close()})
  await context.addInitScript(({actor,mode})=>{localStorage.setItem('training:appearance:v1:guest',mode);localStorage.setItem('training:appearance:v1:'+actor,mode)},{actor,mode:viewport.colorScheme})
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message))
  const record={name,viewport:viewport.name,status:'RUNNING'};result.cases.push(record)
  try{
   const pathname={training:'/admin/training/resources',survey:'/admin/survey-researchers',school:'/admin/huischool',teacher:'/admin/huiteacher'}[name]
   await page.goto('https://training.eduk12.top'+pathname,{waitUntil:'domcontentloaded'})
   if(name==='training'){
    await page.getByRole('button',{name:'固定量表配置',exact:true}).click();await axisPicker(page)
    await page.getByRole('dialog',{name:'分配固定量表配置'}).waitFor()
    await page.getByLabel('接收培训师',{exact:false}).selectOption(person.id)
    await page.getByLabel('授权配置名称',{exact:false}).fill('合成受控基础配置')
   }else if(name==='survey'){
    await page.getByRole('tab',{name:/工具/}).click();await page.getByLabel('授权给研究者',{exact:false}).selectOption(person.id)
    await page.getByRole('button',{name:'查询可授权版本',exact:true}).click();await axisPicker(page)
    await page.getByLabel('标准量表授权配置名称',{exact:false}).fill('合成受控科研配置')
   }else{
    await page.getByLabel('学校 Organization UUID',{exact:false}).fill(org);await page.getByRole('button',{name:'查询学校产品授权',exact:true}).click()
    await page.getByLabel('已批准量表配置',{exact:false}).waitFor();await axisPicker(page)
    assert.equal(await page.getByLabel('已批准量表配置',{exact:false}).inputValue(),choice.id)
    await page.getByLabel('精确分发委托',{exact:false}).selectOption(id(4));await page.getByLabel('配置接收者',{exact:false}).selectOption(person.id)
    await page.getByLabel('授权配置名称',{exact:false}).fill('合成本校固定配置')
   }
   assert.equal(errors.length,0,'No page execution errors: '+errors.join(';'))
   const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
   assert(sizes.scroll<=sizes.width+1,'No document horizontal overflow: '+JSON.stringify(sizes))
   record.status='PASSED';record.layout=sizes;record.actualTrainingTheme=await page.evaluate(()=>document.querySelector('[data-training-theme]')?.getAttribute('data-training-theme')??null);record.screenshot=name+'-'+viewport.name+'.png';await page.screenshot({path:path.join(out,record.screenshot),fullPage:true})
  }catch(error){record.status='FAILED';record.error=String(error);await page.screenshot({path:path.join(out,name+'-'+viewport.name+'-failed.png'),fullPage:true});throw error}
  finally{await context.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n')}
 }
 assert.equal(result.writes.length,0,'No authorization mutation may be sent')
 assert.equal(result.unknownApi.length,0,'Every API dependency must be explicitly mapped')
})().catch(error=>{result.failure=String(error);console.error(String(error));process.exitCode=1}).finally(async()=>{if(browser)await browser.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n')})
