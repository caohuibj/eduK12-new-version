import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=process.cwd(),front=resolve('server-version/frontend'),out=resolve('onboarding-evidence/browser');
mkdirSync(out,{recursive:true});
const evidence='docs/performance/four-entry-scale-probe-20261028/evidence/';
const training=JSON.parse(readFileSync(evidence+'cloud-more-r2.json')),survey=JSON.parse(readFileSync(evidence+'cloud-more-r3.json'));
const state=training.requests.find(r=>r.status===200&&r.body?.data?.currentItem?.type==='SCALE')?.body.data;
const report=training.cases[0].report.unitReports.find(u=>u.type==='SCALE');
const task=survey.requests.find(r=>r.status===200&&r.path.endsWith('/task'))?.body.data;
const feedback=survey.cases[0].waves[0].feedback;
const source=JSON.parse(readFileSync('docs/performance/four-entry-scale-probe-20261028/fixtures/c1-source.json'));
assert(state&&report&&task&&feedback);assert.equal(state.currentItem.scale.instruction,source.instruction.text);
assert.equal(report.scores[0].value,30);assert.equal(feedback.measurements[0].metrics[0].value,30);
const fixture={state,report,task:{...task,status:'COMPLETED'},feedback,instruction:source.instruction.text,publicId:'11111111-1111-4111-8111-111111111111'};
const shell=resolve(front,'src/components/app-shell/AppShell.tsx');
const styles=[...readFileSync(shell,'utf8').matchAll(/import ['"]([^'"]+\.css)['"]/g)].map(m=>'/'+relative(front,resolve(dirname(shell),m[1])).split('\\').join('/'));
const html=resolve(front,'pr374-fixture.html'),entry=resolve(front,'pr374-fixture.jsx'),data=resolve(front,'pr374-data.json');
const jsx=`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import '/src/index.css';${styles.map(p=>'import '+JSON.stringify(p)+';').join('\n')}
import FinalCompositeAssessment from '/src/components/FinalCompositeAssessment';
import ScaleUnitReportCard from '/src/modules/reporting/ScaleUnitReportCard';
import SurveyPublicApp from '/src/survey/SurveyPublicApp';import f from './pr374-data.json';
const q=new URLSearchParams(location.search),view=q.get('view'),host=q.get('host'),theme=q.get('theme')||'light';
const refuse=async()=>{throw Error('No simulated FINAL is allowed in this display-only fixture')};
let content;if(view==='survey'){history.replaceState(null,'','/r/'+f.publicId);content=<SurveyPublicApp/>;}
else if(view==='report')content=<ScaleUnitReportCard report={f.report}/>;
else content=<FinalCompositeAssessment state={f.state} campusMode={host==='education'} publicMode={host==='public'} submitScale={refuse} submitFormSection={refuse} onReload={async()=>{}} onCompleted={()=>{}} onExit={()=>{}}/>;
createRoot(document.getElementById('root')).render(<MemoryRouter><main className={view==='survey'?'':'hui-training hui-app'} data-training-theme={theme} data-shell-mode="student"><div style={{padding:16,maxWidth:960,margin:'auto'}}>{content}</div></main></MemoryRouter>);
`;
writeFileSync(html,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PR374 recorded-response display qualification</title><div id="root"></div><script type="module" src="/pr374-fixture.jsx"></script></html>');
writeFileSync(entry,jsx);writeFileSync(data,JSON.stringify(fixture));
const results={scope:'Current real frontend components/styles with explicitly recorded public HTTP response fixtures. No new authenticated API, FINAL, scoring or full product UI claim.',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:[],status:'RUNNING',sandbox:null};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(results,null,2)+'\n');save();
let vite,browser;
try{
 const {createServer}=await import(pathToFileURL(resolve(front,'node_modules/vite/dist/node/index.js')).href);
 vite=await createServer({root:front,server:{host:'127.0.0.1',port:5187,strictPort:true,hmr:false},clearScreen:false});
 if(process.argv.includes('--prepare-only')){
  const transformed=await vite.transformRequest('/pr374-fixture.jsx');assert(transformed?.code.includes('ScaleUnitReportCard'));results.status='PREPARED_NOT_BROWSER_TESTED';save();console.log('Recorded fixtures and new harness transformed; no browser checks executed');
 }else{
  assert.equal(process.env.GITHUB_ACTIONS,'true','Browser qualification belongs to its selected runner');await vite.listen();
  const {chromium}=require('../release-tools/node_modules/playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,args:['--host-resolver-rules=MAP training.localhost 127.0.0.1,MAP survey.localhost 127.0.0.1']});
  const {verifyChromeSandbox}=require('../../server-version/e2e/school-teacher-chrome.cjs');results.sandbox=await verifyChromeSandbox(browser);assert.equal(results.sandbox.ok,true);save();
  async function scenario(name,width,view,host='training',theme='light',work){
   const row={name,width,view,host,theme,status:'RUNNING'};results.cases.push(row);save();
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];let finalRequests=0;
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(({publicId,attemptId})=>{sessionStorage.setItem('huisurvey:v1:single:'+publicId,JSON.stringify({attemptId,accessCredential:'a'.repeat(43),createdAt:Date.now()}));},{publicId:fixture.publicId,attemptId:fixture.task.attemptId});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(!['training.localhost','survey.localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5187'){errors.push('Unexpected external request');return route.abort();}
    if(!url.pathname.startsWith('/api/'))return route.continue();
    if(view!=='survey'){errors.push('Unexpected API request in display-only Scale fixture');return route.abort();}
    let response;
    if(url.pathname.endsWith('/info'))response={project:{name:'已保存C1反馈显示',description:'Recorded-response UI fixture',collectionMode:'SINGLE_UNLINKED',status:'OPEN'},waves:[]};
    else if(url.pathname.endsWith('/task'))response=fixture.task;
    else if(url.pathname.endsWith('/general'))response=fixture.feedback;
    else{if(url.pathname.endsWith('/final'))finalRequests++;errors.push('Unexpected Survey API path');return route.abort();}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'Recorded public fixture',data:response})});
   });
   try{
    const origin=view==='survey'?'survey.localhost':'training.localhost';await page.goto(`http://${origin}:5187/pr374-fixture.html?view=${view}&host=${host}&theme=${theme}`,{waitUntil:'networkidle'});
    await work(page,row);assert.equal(finalRequests,0);assert.deepEqual(errors,[]);
    row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(row.overflow,false);
    await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,animations:'disabled'});row.status='PASS';
   }catch(e){row.status='FAIL';row.error=String(e.message);throw e;}finally{save();await context.close();}
  }
  for(const host of ['training','public','education'])await scenario('instruction-'+host,390,'instruction',host,'light',async(page,row)=>{
   const note=page.getByRole('region',{name:'本量表作答说明'});await note.waitFor();assert.equal(await note.textContent(),fixture.instruction);
   const text=fixture.state.currentItem.scale.definition.items[0].content;const question=page.getByRole('heading',{name:new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))});await question.waitFor();
   assert((await note.boundingBox()).y<(await question.boundingBox()).y);row.frozenInstructionBeforeQuestion=true;
  });
  async function contrast(page,row){
   const value=page.locator('.report-range__heading strong').first();await value.waitFor();assert.equal((await value.textContent()).trim(),'30');
   row.colors=await page.locator('.report-range__heading').first().evaluate(el=>{
    const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    return [...el.querySelectorAll('h4,p,strong')].map(node=>{let parent=node,bg='';while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}const fg=getComputedStyle(node).color,a=luminance(fg),b=luminance(bg);return {text:node.textContent,color:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
   });assert(row.colors.length>=3);for(const c of row.colors)assert(c.ratio>=4.5,'Insufficient contrast: '+c.text);
  }
  await scenario('report-dark-mobile',390,'report','training','dark',contrast);
  await scenario('report-dark-tablet',820,'report','training','dark',contrast);
  await scenario('report-light-print',390,'report','training','light',async(page,row)=>{await contrast(page,row);row.lightColors=row.colors;await page.emulateMedia({media:'print'});await contrast(page,row);row.printColors=row.colors;});
  await scenario('survey-readable-feedback',390,'survey','survey','light',async(page,row)=>{
   await page.getByRole('button',{name:'恢复本次作答／查看已完成回执'}).click();await page.getByText('一般任务自我效能感：30（已计算）',{exact:true}).waitFor();await page.getByText('本次结果可作参考。仅反映本次条件下的表现。',{exact:true}).waitFor();const text=await page.locator('body').innerText();assert(!text.includes('ipip_neo_c1_self_efficacy10：'));assert(!text.includes('质量状态：interpretable'));row.savedChineseLabelAndStatus=true;
  });
  assert.equal(results.cases.length,7);assert(results.cases.every(c=>c.status==='PASS'));results.status='PASS';save();
 }
}catch(e){results.status='FAIL';results.error=String(e.stack??e);save();throw e;}
finally{await browser?.close();await vite?.close();for(const file of [html,entry,data])rmSync(file,{force:true});}
