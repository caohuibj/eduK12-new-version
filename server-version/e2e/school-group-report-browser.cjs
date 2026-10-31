const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {chromium}=require('../backend/node_modules/playwright-core'),esbuild=require('../frontend/node_modules/esbuild')
async function main(){
 const longitudinal=process.env.SCHOOL_GROUP_BROWSER_MODE==='longitudinal'
 const output=process.argv[2];if(!output)throw Error('evidence directory required');fs.mkdirSync(output,{recursive:true})
 const bundle=path.join(output,'school-group-fixture.js')
 await esbuild.build({entryPoints:[path.join(__dirname,'school-group-report-fixture.tsx')],outfile:bundle,bundle:true,jsx:'automatic',minify:true,nodePaths:[path.join(__dirname,'../frontend/node_modules')],loader:{'.avif':'dataurl','.webp':'dataurl','.png':'dataurl','.svg':'dataurl','.jpg':'dataurl','.woff2':'dataurl'},define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false,"PROD":true}'}})
 const leaf={slotKey:'scale:a',unitType:'SCALE',instrumentKey:'学习支持',instrumentVersion:'1',compiledRuntimeHash:'a'.repeat(64)}
 const metric=(key,mean)=>({key,label:key,type:'NUMBER',unit:'score',validN:10,missingN:0,mean,sdSample:1,range:null,observedRange:{min:0,max:4},qualityCounts:{},measurement:leaf,frequencies:[{value:'0',label:'0',count:10,proportion:1}]})
 const old={artifactId:'old',generatedAt:'2026-10-30T00:00:00Z',projection:{title:'学校群体报告',sourceLabel:'学习支持 · 1',cutoff:'2026-10-30T00:00:00Z',populationLabel:'本任务的冻结群体',completedN:10,countUnit:'PERSON',assignedN:10,tool:{key:'a',title:'学习支持',kind:'SCALE'},metrics:[metric('参与感',0),metric('支持感',2)],limitations:['合成页面场景，非真实学生数据或后端权限验收。','按冻结历史班级选取，不作因果结论。']}}
 const longArtifact={artifactId:'long-latest',generatedAt:'2026-10-31T00:00:00Z',projection:{planId:'plan',sourceKey:'scale-a',title:'学校群体纵向报告',wavePopulationLabels:{r1:'原冻结人群',run:'原冻结人群'},limitations:['合成浏览器后端，仅验证真实School页面接线；真实原生施测由已有PG原件证明。'],metrics:[{id:'score',label:'原始分数',unit:'points',points:[1,2].map((mean,i)=>({waveId:i?'run':'r1',ordinal:i+1,label:'T'+(i+1),observedFrom:'2026-10-30T00:00:00Z',observedUntil:'2026-10-30T00:00:00Z',completedN:null,countUnit:'PERSON',validN:null,missingN:null,state:'present',mean,sdSample:0,adjacentDelta:i?1:null,baselineDelta:i?1:null,intermediateMissing:false,populationChanged:null}))}]}}
 const cursor={generatedAt:'2026-10-30T00:00:00.123000Z',artifactId:'long-latest'}
 const versions=[old],calls=[]
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(bundle.replace(/\.js$/,'.css'),'utf8')}</style><div id="root"></div><script>${fs.readFileSync(bundle,'utf8')}</script></html>`
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),p=url.pathname
  if(!p.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','huischool_csrf=synthetic-browser; SameSite=Strict; Path=/');res.end(html);return}
  calls.push({method:req.method,path:p});let data
  if(p==='/api/campus/auth/me')data={id:'owner',username:'合成管理者',role:'ADMIN',mustChangePassword:false}
  else if(p==='/api/campus/organizations')data={list:[{id:'org',name:'合成学校'}]}
  else if(p==='/api/campus/organizations/org/context')data={access:{orgRole:'ORG_ADMIN',canGovern:true,personas:['TEACHER'],capabilities:[],explicitDenies:[]}}
  else if(p==='/api/campus/organizations/org/units')data={list:[]}
  else if(p.endsWith('/tool-authoring-capabilities'))data={canAuthor:false,authorableToolKinds:[]}
  else if(p==='/api/campus/reports/availability')data={parentReportsEnabled:false}
  else if(longitudinal&&p==='/api/campus/reports/groups/catalog')data={specs:[{specId:'spec',title:'已发布学校方案',version:1,metricIds:['score']}],sources:[{runId:'first',trackId:'first',name:'第一页来源',resource:{family:'SCALE',key:'scale',version:'1'}}],artifacts:[],nextSourcePage:2}
  else if(longitudinal&&p==='/api/campus/reports/groups/sources')data={sources:[{runId:'run',trackId:'track',name:'第二页冻结任务',resource:{family:'SCALE',key:'scale',version:'1'}}],nextSourcePage:null}
  else if(longitudinal&&p==='/api/campus/reports/groups/plans/org/run'){
   assert.equal(req.method,'GET');data=url.searchParams.has('beforeGeneratedAt')?{artifacts:[{artifactId:'long-old',generatedAt:'2026-10-29T00:00:00Z'}],nextCursor:null}:{status:'CONFIGURED',planId:'plan',tools:[{key:'scale-a',label:'冻结量表A',kind:'SCALE'}],waves:[{id:'r1',ordinal:1,title:'首轮'},{id:'run',ordinal:2,title:'第二轮'}],artifacts:[{artifactId:'long-latest',generatedAt:longArtifact.generatedAt}],nextCursor:cursor}
  }
  else if(longitudinal&&p.startsWith('/api/campus/reports/groups/plans/org/run/'))data={...longArtifact,artifactId:p.endsWith('long-old')?'long-old':'long-latest'}
  else if(p==='/api/campus/reports/groups/catalog')data={specs:[{specId:'spec',title:'已发布学校方案',version:1,metricIds:['参与感','支持感']}],sources:[{runId:'run',trackId:'track',name:'合成校园活动',resource:{family:'BUNDLE',key:'bundle',version:'1'}}],artifacts:versions.map(a=>({artifactId:a.artifactId,generatedAt:a.generatedAt})),truncated:false}
  else if(p==='/api/campus/reports/groups/tools')data={tools:[{leaf,metrics:[{key:'参与感'},{key:'支持感'}]}],groups:{options:[{kind:'CLASSES',id:'class-a',name:'一班',dimensionId:null,dimensionName:null}],limitations:['班级和人员标签按任务发布时的关系选择。']}}
  else if(p==='/api/campus/reports/groups'&&req.method==='POST'){
   let raw='';for await(const chunk of req)raw+=chunk
   assert.deepEqual(JSON.parse(raw),{organizationId:'org',runId:'run',trackId:'track',specId:'spec',leaf,selection:{kind:'CLASSES',ids:['class-a']}})
   data={...old,artifactId:'new'};versions.unshift(data)
  }else data=versions.find(a=>p===`/api/campus/reports/groups/org/${a.artifactId}`)
  res.setHeader('Content-Type','application/json');res.statusCode=data?200:404;res.end(JSON.stringify({code:data?0:404,data:data??null,message:data?'ok':'Unexpected fixture request'}))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(`http://127.0.0.1:${server.address().port}/workspace?organizationId=org`)
  if(longitudinal){
   await page.getByText('群体纵向分析',{exact:true}).first().click()
   await page.getByRole('heading',{name:'学校群体纵向报告',exact:true}).waitFor()
   await page.getByRole('button',{name:'加载更多测评来源',exact:true}).click()
   await page.getByLabel('测评来源').selectOption('run:track')
   await page.getByRole('button',{name:'打开纵向群体报告',exact:true}).click()
   await page.getByRole('article',{name:'群体纵向报告',exact:true}).waitFor()
   assert.equal(await page.getByLabel('纵向群体历史版本').inputValue(),'long-latest')
   await page.getByRole('button',{name:'加载更早的纵向版本',exact:true}).click()
   await page.getByRole('option',{name:/long-old/}).waitFor({state:'attached'})
   assert.equal(await page.getByLabel('纵向群体历史版本').inputValue(),'long-latest')
   await page.getByLabel('纵向群体历史版本').selectOption('long-old')
   await page.waitForFunction(()=>document.querySelector('[aria-label="纵向群体历史版本"]').value==='long-old')
   await page.getByRole('article',{name:'群体纵向报告',exact:true}).locator('svg').waitFor()
   assert.equal(calls.some(c=>c.method==='POST'),false)
   assert(calls.some(c=>c.path.endsWith('/sources')));assert(calls.some(c=>c.path.endsWith('/long-old')))
   await page.setViewportSize({width:390,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   await page.screenshot({path:path.join(output,'school-longitudinal-history-390.png'),fullPage:true});assert.deepEqual(errors,[])
   fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:true,actualSchoolAppNavigationAndGroupLongitudinalComponents:true,syntheticAuthAndBackend:true,realPostgres:false,finalsReplayed:0,calls,checks:['School navigation','page-two frozen source','stored longitudinal report','append older pointers retains selection','old snapshot read','existing SVG','390 layout','no POST']},null,2))
   console.log('School longitudinal existing entry and pointer history passed');return
  }
  await page.getByText('群体报告',{exact:true}).first().click()
  await page.getByRole('article',{name:'群体报告阅读'}).waitFor();assert.equal(new URL(page.url()).pathname,'/workspace/group-reports')
  assert.equal(calls.some(c=>c.path.endsWith('/tools')),false);assert.equal(calls.some(c=>c.method==='POST'),false)
  await page.getByLabel('测评来源').selectOption('run:track');await page.getByRole('button',{name:'选择工具与人群',exact:true}).click()
  await page.getByLabel('叶工具与固定版本').selectOption(JSON.stringify(leaf));await page.getByLabel('已发布统计方案').selectOption('spec')
  await page.getByLabel('报告人群').selectOption('CLASSES');await page.getByLabel('一班',{exact:true}).check();await page.getByRole('button',{name:'生成更新版报告',exact:true}).click()
  await page.waitForFunction(()=>[...document.querySelectorAll('select')].some(s=>s.value==='new'))
  await page.getByLabel('阅读指标').selectOption('支持感');await page.getByLabel('已生成版本').selectOption('old')
  await page.waitForFunction(()=>[...document.querySelectorAll('select')].some(s=>s.value==='old'))
  await page.getByRole('button',{name:'全屏展示'}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.evaluate(()=>document.exitFullscreen())
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,`school-group-${width}.png`),fullPage:true})}
  await page.emulateMedia({media:'print'});assert.equal(await page.getByRole('button',{name:'生成更新版报告',exact:true}).isVisible(),false)
  assert.equal(await page.getByRole('heading',{name:'参与感',exact:true,level:2}).isVisible(),true);assert.equal(await page.getByRole('heading',{name:'支持感',exact:true,level:2}).isVisible(),true)
  await page.pdf({path:path.join(output,'school-group-report.pdf'),format:'A4',printBackground:true});assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:true,actualSchoolAppNavigationAndGroupComponent:true,syntheticAuthAndBackend:true,calls,checks:['real School navigation to group reports','latest snapshot without discovery or generation','single leaf class selection','retained version read','metric switch','fullscreen','1440/390 layout','all metrics print/PDF']},null,2))
  console.log('School actual entry and group snapshot journey passed')
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
