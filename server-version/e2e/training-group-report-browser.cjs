const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const {chromium} = require('../backend/node_modules/playwright-core'), esbuild = require('../frontend/node_modules/esbuild')
const output = process.argv[2]
if (!output) throw Error('Usage: node training-group-report-browser.cjs <evidence-directory>')
fs.mkdirSync(output, {recursive: true})
const bundle = path.join(output, 'training-group-fixture.js')
esbuild.buildSync({entryPoints: [path.join(__dirname, 'training-group-report-fixture.tsx')], outfile: bundle, bundle: true, jsx: 'automatic', minify: true,
  nodePaths: [path.join(__dirname, '../frontend/node_modules')], define: {'process.env.NODE_ENV': '"production"'}})
const artifact = {artifactId: 'old', generatedAt: '2026-10-30T00:00:00Z', projection: {schemaVersion: 1, descriptionVersion: 'group-descriptive-v1',
  title: '学习体验 · 群体报告', sourceLabel: '合成课程任务 · 发布 2026-10-30', cutoff: '2026-10-30T00:00:00Z', populationLabel: '本任务全部合格已完成作答', completedN: 6, countUnit: 'PERSON', assignedN: null,
  tool: {key: 'FORM:section', title: '学习体验', kind: 'FORM'}, metrics: [
    {key: 'hours', label: '本周小时', type: 'NUMBER', unit: '小时', range: {min: -10, max: 20}, observedRange: {min: -2, max: 3}, validN: 6, missingN: 0, mean: .5, sdSample: 1.87, qualityCounts: {}, measurement: {}, frequencies: []},
    {key: 'activities', label: '学习活动', type: 'MULTIPLE', unit: null, range: null, observedRange: null, validN: 6, missingN: 0, mean: null, sdSample: null, qualityCounts: {}, measurement: {}, frequencies: [{value: 'a', label: '阅读', count: 6, proportion: 1}, {value: 'b', label: '讨论', count: 6, proportion: 1}]},
  ], limitations: ['每项指标使用各自有效样本；缺失不回退旧分数。', '现有 Training 最小有效样本为 5。多选比例合计可能超过 100%。', '合成 UI 合同；不代表后端授权或生产性能验收。']}}
const tool = {key: 'FORM:section', kind: 'FORM', title: '学习体验', source: {taskId: 'task', publication: '2026-10-30T00:00:00Z', configDigest: null, variantKey: null}}
const calls = [], versions = [artifact]
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;background:#edf4f5;margin:0;padding:20px}button,select{font:inherit;padding:.5em}main{max-width:1400px;margin:auto}*{box-sizing:border-box}</style><style>${fs.readFileSync(bundle.replace(/\.js$/,'.css'),'utf8')}</style><div id="root"></div><script>${fs.readFileSync(bundle,'utf8')}</script></html>`
const server = http.createServer(async (req,res) => {
  if (!req.url.startsWith('/api/')) {res.setHeader('Content-Type','text/html'); res.setHeader('Set-Cookie','ptool_csrf=synthetic-browser; SameSite=Strict; Path=/'); res.end(html); return}
  const url = req.url.split('?')[0], base = '/api/courses/course/training-group-reports'
  calls.push({method:req.method,path:url})
  let data
  if (url === base && req.method === 'GET') data = {tasks: [{id:'task',name:'合成课程任务'}], artifacts: versions.map(row => ({taskId:'task',artifactId:row.artifactId,generatedAt:row.generatedAt}))}
  else if (url === base + '/sources/task') data = {tools:[tool]}
  else if (url === base && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk
    assert.equal(JSON.parse(raw).toolKey, 'FORM:section')
    data = {...artifact,artifactId:'new'}; versions.unshift(data)
  } else data = versions.find(row => url === `${base}/task/${row.artifactId}`)
  res.setHeader('Content-Type','application/json'); res.statusCode = data ? 200 : 404; res.end(JSON.stringify({code:data?0:404,data:data??null,message:data?'ok':'Unexpected fixture request'}))
})
;(async()=>{
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[]
    page.on('pageerror',error=>errors.push(String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('button',{name:'打开群体报告'}).click(); await page.getByRole('article',{name:'群体报告阅读'}).waitFor()
    assert.equal(calls.some(row=>row.path.includes('/sources/')),false)
    await page.getByRole('button',{name:'选择工具与版本'}).click(); await page.getByLabel('群体报告工具').waitFor()
    await page.getByRole('button',{name:'生成更新版报告'}).click(); await page.waitForFunction(()=>document.querySelector('select[aria-label="群体报告版本"]').value==='new')
    await page.getByLabel('阅读指标').selectOption('activities'); assert.equal(await page.getByRole('table').isVisible(),true)
    await page.getByLabel('群体报告版本').selectOption('old'); await page.waitForFunction(()=>document.querySelector('select[aria-label="群体报告版本"]').value==='old')
    assert.equal(calls.filter(row=>row.method==='POST').length,1); assert.equal(calls.filter(row=>row.path.includes('/sources/')).length,1)
    await page.getByRole('button',{name:'全屏展示'}).click(); await page.waitForFunction(()=>!!document.fullscreenElement); await page.evaluate(()=>document.exitFullscreen())
    for(const width of [1440,390]) {await page.setViewportSize({width,height:1000}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); await page.screenshot({path:path.join(output,`training-group-${width}.png`),fullPage:true})}
    await page.emulateMedia({media:'print'}); assert.equal(await page.getByRole('button',{name:'生成更新版报告'}).isVisible(),false)
    assert.equal(await page.getByRole('heading',{name:'本周小时',exact:true,level:2}).isVisible(),true); assert.equal(await page.getByRole('table').isVisible(),true)
    await page.pdf({path:path.join(output,'training-group-report.pdf'),format:'A4',printBackground:true}); assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({passed:true,synthetic:true,actualReactComponents:true,calls,checks:['saved snapshot without discovery','explicit selected tool generation','old version read','local metric switch','fullscreen','1440 and 390 overflow','print all metrics','no page errors']},null,2))
    console.log('Training group-report browser contract passed')
  } finally {await browser.close(); await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1})
