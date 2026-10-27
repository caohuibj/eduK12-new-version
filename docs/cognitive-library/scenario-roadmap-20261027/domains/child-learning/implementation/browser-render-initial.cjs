const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo='/workspace/eduK12-new-version',front=repo+'/server-version/frontend',out=repo+'/docs/cognitive-library/scenario-roadmap-20261027/domains/child-learning/implementation';
const esbuild=require(front+'/node_modules/esbuild'),{chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 await esbuild.build({entryPoints:[out+'/browser-harness.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'/tmp/child-learning-review/actual-browser.js',nodePaths:[front+'/node_modules'],define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false,args:['--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'zh-CN',acceptDownloads:true});
  const requests=[],errors=[];await context.route('**/*',r=>{requests.push(r.request().url());r.abort()});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const css=fs.readFileSync('/tmp/child-learning-review/actual-browser.css','utf8');
  const html=('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#edf1f5}#fixture-banner{padding:8px 16px;color:#526174;font:13px system-ui}'+css+'</style><p id="fixture-banner">合成候选预览 · 未接入 · 没有参与者数据</p><div id="root"></div>');
  await page.route('https://number-series.fixture.invalid/',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://number-series.fixture.invalid/');
  await page.addScriptTag({path:'/tmp/child-learning-review/actual-browser.js'});
  await page.getByRole('region',{name:'完整说明与三个例子'}).waitFor();await page.evaluate(()=>document.fonts.ready);
  const layouts=[];
  async function check(name){const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,row:[...document.querySelectorAll('.number-series-row')].map(x=>({client:x.clientWidth,scroll:x.scrollWidth})),buttons:[...document.querySelectorAll('.number-series-choice')].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))}));if(m.scrollWidth>m.width||m.row.some(x=>x.scroll>x.client)||m.buttons.some(x=>x.height<44))throw Error('Layout '+name);layouts.push({name,...m})}
  await check('phone instructions');await page.screenshot({path:out+'/actual-phone-intro-390.png',fullPage:true});
  await page.getByRole('button',{name:'准备练习',exact:true}).click();await page.getByRole('button',{name:'开始练习',exact:true}).click();
  const practice=await page.evaluate(()=>window.numberSeriesBrowserFixture.practice);
  for(let i=0;i<3;i++){await page.getByRole('button',{name:`选项 ${practice[i].correctIndex+1}：${practice[i].answer}`,exact:true}).tap();if(i<2)await page.getByRole('button',{name:'下一题练习',exact:true}).click()}
  await page.getByRole('button',{name:'准备正式题目',exact:true}).click();await page.getByRole('button',{name:'开始正式题目',exact:true}).click();await check('phone formal row');await page.screenshot({path:out+'/actual-phone-formal-390.png',fullPage:true});
  await page.evaluate(()=>window.numberSeriesBrowserFixture.showReport('interpretable'));await page.getByText('谢谢你认真完成这组题',{exact:true}).waitFor();await page.setViewportSize({width:820,height:1180});await check('tablet report');await page.screenshot({path:out+'/actual-tablet-report-820.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下载一张摘要图',exact:true}).click();const download=await downloadPromise;await download.saveAs('/tmp/child-learning-review/downloaded-report.svg');
  if(fs.readFileSync('/tmp/child-learning-review/downloaded-report.svg','utf8')!==fs.readFileSync(out+'/synthetic-report.svg','utf8'))throw Error('Downloaded SVG differs from same public projection');
  const states=[];for(const state of ['limited','invalid']){await page.evaluate(s=>window.numberSeriesBrowserFixture.showReport(s),state);await page.locator('[data-report-state="'+state+'"]').waitFor();if(await page.getByRole('table').count()||await page.getByRole('button',{name:'下载一张摘要图',exact:true}).count())throw Error('Restricted report leaked performance');states.push({state,tableCount:0,imageButtonCount:0});}
  await page.evaluate(()=>window.numberSeriesBrowserFixture.showReport('limited'));await page.setViewportSize({width:390,height:844});await check('phone limited');await page.screenshot({path:out+'/actual-phone-limited-390.png',fullPage:true});
  await page.setViewportSize({width:820,height:1180});await page.evaluate(()=>window.numberSeriesBrowserFixture.showInstructions('en'));await page.getByText('Example 3: gaps that grow step by step',{exact:true}).waitFor();await check('english instructions');
  if(errors.length||requests.length)throw Error(JSON.stringify({errors,requests}));
  const proof={synthetic:true,participantData:false,browser:browser.version(),chromiumSandbox:false,reason:'original local bundle, all network requests blocked, no system sandbox permissions changed',layouts,restrictedStates:states,downloadedSvgMatchesPublicProjection:true,errors,externalRequests:requests,serverCalls:0,fixtureOrigin:'https://number-series.fixture.invalid/ served only by local route fulfillment for a secure browser context',centralizedAcceptance:false,previewBundleSha256:crypto.createHash('sha256').update(fs.readFileSync('/tmp/child-learning-review/actual-browser.js')).digest('hex')};
  fs.writeFileSync(out+'/actual-browser.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
