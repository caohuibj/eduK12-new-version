const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='/workspace/eduK12-new-version/docs/cognitive-library/next-candidates-20261026/enumeration';
const html=fs.readFileSync(path.join(root,'preview.html'),'utf8');
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'zh-CN',timezoneId:'UTC'});
 await context.route('**/*',r=>r.abort());const page=await context.newPage(),errors=[],checks=[],shots=[];const resume=process.argv.includes('--resume');
 page.on('pageerror',error=>errors.push(error.message));
 async function shot(name){await page.evaluate(()=>document.fonts.ready);const file=path.join(root,name+'.png');await page.screenshot({path:file,fullPage:true});shots.push({file:name+'.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}
 async function init(){await page.goto('about:blank');await page.setContent(html);await page.waitForFunction(()=>Boolean(window.designPreview));}
 if(!resume){for(const [width,height]of [[390,844],[820,1180]]){
  await page.setViewportSize({width,height});await init();
  for(const state of ['guide','setup','fixation','stimulus','mask','answer','report']){
   await page.evaluate(state=>window.designPreview.setState(state),state);
   const measurement=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,field:document.querySelector('.field')?.getBoundingClientRect().toJSON()??null}));
   if(measurement.scrollWidth>width)throw Error('Horizontal overflow '+state+' '+width);
   checks.push({state,width,...measurement});
   if(['guide','stimulus','answer','report'].includes(state))await shot(state+'-'+width);
  }
 }
 }
 await page.setViewportSize({width:390,height:844});await init();
 let polarity,noise;
 if(!resume){
 await page.evaluate(()=>window.designPreview.setState('stimulus'));
 polarity=await page.evaluate(()=>({field:getComputedStyle(document.querySelector('.field')).backgroundColor,dot:document.querySelector('.field circle').getAttribute('fill'),centres:Array.from(document.querySelectorAll('.field circle')).map(c=>[Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))])}));
 if(polarity.field!=='rgb(128, 128, 128)'||polarity.dot!=='#FFFFFF')throw Error('Paper polarity preview mismatch');
 const circles=await page.evaluate(()=>Array.from(document.querySelectorAll('.field circle')).map(c=>({x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy')),r:Number(c.getAttribute('r'))})));
 if(circles.some(c=>Math.hypot(c.x-152,c.y-152)+c.r>152))throw Error('Circular-domain proposal centre escaped illustration');
 await page.selectOption('#polarity','project');await shot('stimulus-project-alternative-390');
 await page.selectOption('#polarity','paper');
 await page.evaluate(()=>window.designPreview.setState('mask'));noise=await page.evaluate(()=>window.previewNoise);await shot('mask-390');
 await page.evaluate(()=>window.designPreview.setState('answer'));
 const slider=page.locator('#answerRange');await slider.focus();await slider.press('Home');if(await slider.inputValue()!=='1')throw Error('Range minimum changed');await slider.press('End');if(await slider.inputValue()!=='15')throw Error('Range maximum changed');await slider.press('ArrowLeft');if(await slider.inputValue()!=='14')throw Error('Keyboard integer step failed');
 await page.getByRole('button',{name:'确认这个数量'}).click();if(!(await page.getByRole('status').textContent()).includes('14'))throw Error('Static confirmation failed');
 await page.evaluate(()=>window.designPreview.setState('report'));
 const design=JSON.parse(fs.readFileSync(path.join(root,'design.json'),'utf8'));
 const fixtureCheck=await page.evaluate(()=>window.designPreview.fixtures);
 for(const profile of ['experience','research']){const p=design.syntheticReportFixtures[profile],f=fixtureCheck[profile];if(f.total!==p.totalValid||f.correct!==p.totalCorrect||JSON.stringify(f.rows)!==JSON.stringify(p.targets.map((n,i)=>[n,p.correct[i],p.valid[i]])))throw Error('Synthetic fixture mismatch '+profile)}
 }else{const prior=['guide-390','stimulus-390','answer-390','report-390','guide-820','stimulus-820','answer-820','report-820','stimulus-project-alternative-390','mask-390','report-interpretable-390'];for(const name of prior){const file=path.join(root,name+'.png');if(fs.existsSync(file))shots.push({file:name+'.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),retainedFromFailedInitialInvocation:true})}}
 for(const state of (resume?['limited','invalid']:['interpretable','limited','invalid'])){
  await page.evaluate(state=>window.designPreview.setReportState(state),state);
  const body=await page.locator('#content').innerText(),image=page.locator('.takehome svg');
  if(await image.count()!==1||!(await image.textContent()).includes('EDUK12.TOP'))throw Error('Single branded summary image missing');
  if(state!=='interpretable'&&(body.includes('19 / 25')||(await image.getAttribute('aria-label')).includes('19 / 25')))throw Error('Gated aggregate leaked');
  if(state==='invalid'&&await page.locator('.report-table,.report-value').count())throw Error('Invalid performance data leaked');
  if(state==='limited'){await page.locator('details').evaluate(d=>d.open=true)}
  if(state==='limited'&&!(await page.locator('.report-table').innerText()).includes('—'))throw Error('Limited condition not hidden');
  await shot('report-'+state+'-390');
 }
 await page.getByRole('checkbox').uncheck();if(await page.locator('.takehome svg').count())throw Error('Summary image cannot be disabled');await page.getByRole('checkbox').check();
 const zoom=[];
 for(const lang of ['zh','en'])for(const state of ['guide','report']){
  await init();await page.evaluate(({lang,state})=>{window.designPreview.setLanguage(lang);window.designPreview.setState(state);document.documentElement.style.zoom='2'},{lang,state});
  const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(m.scrollWidth>m.width)throw Error('200% overflow '+lang+' '+state);zoom.push({lang,state,...m});
  await shot(state+'-'+lang+'-200percent');
 }
 await init();await page.evaluate(()=>{window.designPreview.setLanguage('en');window.designPreview.setState('guide')});await shot('guide-en-390');
 await page.evaluate(()=>{window.designPreview.setState('report')});await shot('report-en-390');
 await page.setViewportSize({width:1280,height:1310});
 await page.setContent('<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf1f5;color:#1F2937;font-family:system-ui,sans-serif}h1{font-size:24px;margin:0 0 8px}p{font-size:13px;color:#4B5563;margin:0}.grid{display:flex;gap:18px;margin-top:20px}.column{width:394px;flex:none}.label{font-size:15px;margin:0 0 10px}.frame{width:390px;height:1200px;overflow:hidden;border:1px solid #CBD5E1;border-radius:9px;background:white}.frame iframe{width:390px;height:1200px;border:0}</style><h1>短时点数判断 · 设计待确认</h1><p>静态草案，不是运行测验；白点/中灰为论文描述的名义RGB候选，5°尚未校准，50ms尚未实现；报告使用合成数据。</p><div class="grid"><div class="column"><div class="label">指导 · 25/100双版本提案</div><div class="frame"><iframe title="guide"></iframe></div></div><div class="column"><div class="label">呈现定格 · 论文极性候选</div><div class="frame"><iframe title="stimulus"></iframe></div></div><div class="column"><div class="label">作答 · 保留1–15整数范围</div><div class="frame"><iframe title="answer"></iframe></div></div></div>');
 for(let i=0;i<3;i++){const handle=await page.locator('iframe').nth(i).elementHandle(),frame=await handle.contentFrame();await frame.setContent(html);await frame.waitForFunction(()=>Boolean(window.designPreview));await frame.evaluate(state=>window.designPreview.setState(state),['guide','stimulus','answer'][i]);await frame.evaluate(()=>document.fonts.ready)}
 await shot('review');
 if(errors.length)throw Error(JSON.stringify(errors));
 const files=['README.md','design.json','preview.html'];
 const evidence={kind:'STATIC_DESIGN_PROPOSAL_CLOUD_CHROMIUM_ONLY',resumeAfterInitialFailure:resume,initialFailures:[{status:'failed',message:'Limited condition not hidden',cause:'innerText was queried inside closed details; now opens details before verification'},{status:'failed',message:'Identifier fixtures has already been declared',cause:'setContent reused the same JavaScript realm; now each preview initialization navigates to a fresh about:blank document'}],qualificationNote:'Failed development invocations remain failed. Fresh-document initialization changes affected all browser-rendered states, which were checked again. No product/scientific code was changed.',candidateId:'attention-enumeration-flower',dateUtc:new Date().toISOString(),cloud:true,chromiumSandbox:true,browser:browser.version(),actualTimingEmulated:false,checks:{layouts:checks,syntheticFixtureBinding:true,range1To15AndKeyboard:true,explicitConfirm:true,threeReportStatesAndImageGate:true,optionalImage:true,paperPolarityNominalOnly:polarity,noisePreviewOnly:noise??{recording:'first invocation rendered and captured mask; full realized stats recalculated from the exact seeded recipe without browser rerender',algorithm:'lcg1664525-1013904223-u32-topbit',seed:20261026},zoom200:zoom},sourceBindings:files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),screenshots:shots,errors,notVerified:['50ms actual stimulus presentation','physical visual-angle/luminance calibration','real phone/tablet hardware','four product entry consumers','Chinese/English comprehension','norms/reliability/validity','runner/scorer/API/DB/COS/registration']};
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({screenshots:shots.length,layoutChecks:checks.length,zoomChecks:zoom.length,noise,output:root}));
 }finally{await browser?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
