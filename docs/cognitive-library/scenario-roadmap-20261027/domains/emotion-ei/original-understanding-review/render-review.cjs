// Static HTML layout capture only. No participant flow, runner or scoring.
const path = require('node:path'); const fs = require('node:fs'); const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../../../../../..')
const { chromium } = require(path.join(root, 'server-version/backend/node_modules/playwright-core'))
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
;(async () => {
 const started = new Date().toISOString(), requests=[]
 const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', headless:true, chromiumSandbox:false, env:{...process.env,XDG_CONFIG_HOME:'/tmp/emotion-original-review-config',XDG_CACHE_HOME:'/tmp/emotion-original-review-cache'} })
 try {
 const page = await browser.newPage({viewport:{width:1800,height:1400},deviceScaleFactor:1})
 await page.route(/^https?:/, route=>{ requests.push(route.request().url()); return route.abort() })
 await page.setContent(fs.readFileSync(path.join(__dirname,'review.html'),'utf8')); await page.evaluate(()=>document.fonts.ready)
 const layout=await page.evaluate(()=>({scripts:document.scripts.length,media:document.querySelectorAll('audio,video,img,iframe').length,forms:document.forms.length,screenBounds:[...document.querySelectorAll('.screen')].map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,horizontalOverflow:e.scrollWidth>e.clientWidth})),textOverflow:[...document.querySelectorAll('.story,.choice,.question,.report,.notice')].filter(e=>e.scrollWidth>e.clientWidth).map(e=>e.className)}))
 for(const [id,file] of [['review-board','review.png'],['phone-zh','phone-zh.png'],['tablet-en','tablet-en.png'],['phone-instructions','phone-instructions-zh.png']]) await page.locator('#'+id).screenshot({path:path.join(__dirname,file)})
 const outputs=['review.png','phone-zh.png','tablet-en.png','phone-instructions-zh.png'].map(file=>({file,bytes:fs.statSync(path.join(__dirname,file)).size,sha256:hash(path.join(__dirname,file))}))
 const receipt={kind:'STATIC_DESIGN_CAPTURE_NOT_RUNNER_VALIDATION',startedAtUTC:started,finishedAtUTC:new Date().toISOString(),browser:browser.version(),inputSha256:hash(path.join(__dirname,'review.html')),captureScriptSha256:hash(__filename),layout,externalRequests:requests,outputs,notExecuted:['test runner','stimulus sequence','scorer','participant records','backend','CI','real devices']}
 fs.writeFileSync(path.join(__dirname,'static-review.json'),JSON.stringify(receipt,null,2)+'\n')
 console.log(JSON.stringify(receipt,null,2))
 if(requests.length||layout.scripts||layout.media||layout.forms||layout.textOverflow.length||layout.screenBounds.some(x=>x.horizontalOverflow))process.exitCode=1
 } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1})
