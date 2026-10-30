const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {chromium}=require('../backend/node_modules/playwright-core'),esbuild=require('../frontend/node_modules/esbuild')
async function main(){
 const output=process.argv[2];if(!output)throw Error('evidence directory required');fs.mkdirSync(output,{recursive:true})
 const bundle=path.join(output,'teacher-group-fixture.js')
 await esbuild.build({entryPoints:[path.join(__dirname,'teacher-group-report-fixture.tsx')],outfile:bundle,bundle:true,jsx:'automatic',minify:true,plugins:[{name:'public-assets',setup(build){build.onResolve({filter:/^\/huiteacher\//},args=>({path:path.join(__dirname,'../frontend/public',args.path)}))}}],nodePaths:[path.join(__dirname,'../frontend/node_modules')],loader:{'.avif':'dataurl','.webp':'dataurl','.png':'dataurl','.svg':'dataurl','.jpg':'dataurl','.woff2':'dataurl'},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false,"PROD":true,"VITE_REPORT_PRIVACY_TEACHER_V2_ENABLED":"true"}'}})
 const calls=[],report={versionId:'old',eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-20T00:00:00Z',independentRespondents:null,minimumRespondents:10,distributions:[
  {itemKey:'single',prompt:'教学支持',status:'READY',precision:'ROUNDED_10_PERCENT',cells:[{key:'yes',label:'支持充分',percentage:60},{key:'none',label:'未选',percentage:0}]},
  {itemKey:'multi',prompt:'所需资源',status:'READY',selectionMode:'NON_EXCLUSIVE',precision:'ROUNDED_10_PERCENT',cells:[{key:'time',label:'时间',percentage:60},{key:'training',label:'培训',percentage:60}]},
  {itemKey:'text',prompt:'补充文字',status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'},
 ]}
 const updated={...report,versionId:'new',populationLabel:'任教班级：甲班（任一匹配）'};let generated=false
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(bundle.replace(/\.js$/,'.css'),'utf8')}</style><div id="root"></div><script>${fs.readFileSync(bundle,'utf8')}</script></html>`
 const server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname
  if(p.startsWith('/huiteacher/')){const asset=path.join(__dirname,'../frontend/public',p);if(fs.existsSync(asset)){res.setHeader('Content-Type',p.endsWith('.svg')?'image/svg+xml':'image/webp');res.end(fs.readFileSync(asset));return}}
  if(!p.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.end(html);return}
  calls.push({method:req.method,path:p});let data={list:[],nextCursor:null}
  if(p.endsWith('/auth/me'))data={id:'admin',username:'合成 Teacher 管理员',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'合成学校',productAdmin:true}]}
  else if(p.endsWith('/tool-authoring-capabilities'))data={canAuthor:false,authorableToolKinds:[]}
  else if(p.endsWith('/evaluation-targets'))data={list:[{id:'target',name:'学校',kind:'ORGANIZATION'}]}
  else if(p.endsWith('/evaluation-events'))data={list:[{id:'event',targetId:'target',title:'学期教师调查',kind:'ASSESSMENT',status:'CLOSED',version:3}]}
  else if(p.endsWith('/forms'))data={list:[{id:'form',title:'教师体验表',status:'PUBLISHED',definitionDigest:'a'.repeat(64)}]}
  else if(p.endsWith('/evaluation-events/event/run'))data={eventId:'event',runId:'run',status:'CLOSED',version:4,trackCount:1}
  else if(p.endsWith('/auth/csrf'))data={csrfToken:'synthetic-browser-csrf'}
  else if(p.endsWith('/group-report/versions')&&req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk
   assert.deepEqual(JSON.parse(body),{selection:{kind:'CLASSES',ids:['class-a']}});generated=true;data=updated
  }else if(p.endsWith('/group-report/versions'))data={versioned:true,truncated:false,versions:(generated?[updated,report]:[report]).map(row=>({versionId:row.versionId,releasedAt:row.releasedAt,populationLabel:row.populationLabel??'全部合格参与教师'})),groups:{options:[{kind:'CLASSES',id:'class-a',name:'甲班',dimensionId:null,dimensionName:null}],limitations:['按发布时的任教关系选人，不据当前年级关系回写过去。']}}
  else if(p.endsWith('/versions/old'))data=report
  else if(p.endsWith('/versions/new'))data=updated
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:0,data,message:'synthetic fixture'}))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(`http://127.0.0.1:${server.address().port}/workspace`)
  await page.getByRole('navigation',{name:'Teacher 工作台'}).getByRole('button',{name:'学校改进',exact:true}).click()
  await page.getByRole('link',{name:'评价活动',exact:true}).click()
  await page.getByRole('button',{name:'查看任务配置',exact:true}).click()
  await page.getByLabel('报告对应 Form').selectOption('form')
  const view=page.getByRole('article',{name:'教师群体报告阅读'});await view.waitFor()
  assert.equal(calls.some(c=>c.method==='POST'),false)
  await page.getByLabel('报告人群').selectOption('CLASSES');await page.getByLabel('甲班',{exact:true}).check()
  await page.getByRole('button',{name:'生成更新版报告',exact:true}).click();await view.getByText(/任教班级：甲班/).waitFor()
  await page.getByLabel('已生成版本').selectOption('old');await page.waitForFunction(()=>document.querySelector('select')&&[...document.querySelectorAll('select')].some(s=>s.value==='old'))
  await page.getByLabel('已生成版本').selectOption('new');await view.getByText(/任教班级：甲班/).waitFor()
  assert.equal(await view.getByText('0%',{exact:true}).count(),1)
  assert.equal(await view.locator('td').first().innerText(),'受限展示')
  await view.getByLabel('阅读题目').selectOption('multi');await view.getByText(/合计可能超过 100%/).waitFor()
  await view.getByRole('button',{name:'全屏展示'}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.evaluate(()=>document.exitFullscreen())
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000})
   assert.equal(await view.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth+1),true)
   await page.screenshot({path:path.join(output,`teacher-group-${width}.png`),fullPage:true})
  }
  await page.emulateMedia({media:'print'})
  assert.equal(await view.getByRole('button',{name:'全屏展示'}).isVisible(),false)
  for(const name of ['教学支持','所需资源','补充文字'])assert.equal(await view.getByRole('heading',{name,exact:true,level:3}).isVisible(),true)
  assert.equal(await page.getByRole('button',{name:'查看任务配置',exact:true}).isVisible(),false)
  await page.pdf({path:path.join(output,'teacher-group-report.pdf'),format:'A4',printBackground:true})
  assert.deepEqual(errors,[]);assert.equal(calls.filter(c=>c.method==='POST').length,1)
  fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:true,actualTeacherAppAndEvaluationNavigation:true,syntheticAuthAndBackend:true,snapshotReadsAndOneExplicitGeneration:true,calls,checks:['real product admin navigation','initial saved version without generation','single staff-class selection and explicit POST','retained version GET','hidden counts retained','rounded zero percentage retained','multi-select denominator explanation','item switch','fullscreen','1440/390 report layout','print all items including withholding reasons; hide surrounding management UI'],noBackendOrProductionAuthorityClaim:true},null,2))
  console.log('Teacher native Form subgroup generation and saved version journey passed')
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
