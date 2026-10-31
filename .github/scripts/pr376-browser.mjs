import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),front=resolve('server-version/frontend'),out=resolve('onboarding-evidence/browser');
mkdirSync(out,{recursive:true});
const original=JSON.parse(readFileSync('docs/performance/four-entry-scale-probe-20261028/evidence/cloud-more-r2.json'));
const report=original.cases[0].report.unitReports.find(u=>u.type==='SCALE');assert(report);
const styles=[...new Set(['src/components/app-shell/AppShell.tsx','src/school/SchoolApp.tsx','src/huiteacher/HuiteacherApp.tsx'].flatMap(p=>[...readFileSync(resolve(front,p),'utf8').matchAll(/import ['"]([^'"]+\.css)['"]/g)].map(m=>'/'+relative(front,resolve(dirname(resolve(front,p)),m[1])).split('\\').join('/'))))];
const files=['pr376-fixture.html','pr376-fixture.jsx','pr376-data.json'].map(p=>resolve(front,p));
writeFileSync(files[0],'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PR376 bounded display checks</title><div id="root"></div><script type="module" src="/pr376-fixture.jsx"></script></html>');
writeFileSync(files[2],JSON.stringify({report}));
writeFileSync(files[1],`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import '/src/index.css';${styles.map(p=>'import '+JSON.stringify(p)+';').join('\n')}
import {SchoolParentTasks} from '/src/school/SchoolParentTasks';import {SchoolTeacherTasks} from '/src/school/SchoolTeacherTasks';
import {HuiteacherFieldWorkspace} from '/src/huiteacher/HuiteacherFieldWorkspace';import ScaleUnitReportCard from '/src/modules/reporting/ScaleUnitReportCard';import f from './pr376-data.json';
const q=new URLSearchParams(location.search),view=q.get('view'),theme=q.get('theme')||'light';window.fixtureCalls=[];
const id='11111111-1111-4111-8111-111111111111';
const task={executionId:id,runId:id,organizationId:id,activityId:id,activityTitle:'合成家校观察活动',runTitle:'合成观察任务',studentReference:'学生匿名编号 A',status:'ASSIGNED',deadline:null,consentRequired:true,consentPurpose:'教育观察',consentVisibility:'仅限经授权人员'};
const api=async(path,method='GET')=>{window.fixtureCalls.push({path,method});if(method!=='GET')throw Error('Display fixture forbids simulated writes');
 if(path.startsWith('/my/parent-run-tasks')||path.startsWith('/my/teacher-run-tasks'))return {list:[task],truncated:false};
 if(path==='/my-field-invitations')return {list:[{invitationId:id,organizationId:id,eventId:id,title:'合成专家课堂观察',kind:'CLASSROOM',role:'EXPERT',expiresAt:'2099-01-01T00:00:00Z',status:'ACCEPTED'}]};
 if(path==='/my-field-notes')return {list:[]};
 if(path==='/field-invitations/'+id+'/form')return {formId:id,title:'合成课堂观察表单',definitionDigest:'synthetic-display-only',pages:[{pageKey:'p1',title:'课堂观察',questions:[{itemKey:'q1',type:'LIKERT',prompt:'课堂讨论证据',required:true,options:[{optionKey:'low',label:'不足'},{optionKey:'high',label:'充分'}],rows:[]}]}]};
 throw Error('Unexpected fixture read '+path);};
const child=view==='parent'?<SchoolParentTasks api={api}/>:view==='teacher'?<SchoolTeacherTasks compact api={api} organizationId={id}/>:view==='expert'?<HuiteacherFieldWorkspace api={api}/>:<ScaleUnitReportCard report={f.report}/>;
const cls=view==='report'?'hui-training hui-app':view==='expert'?'ht-app ht-app-signed-in':view==='parent'?'hs-app hs-workspace hs-parent':'hs-app hs-workspace hs-educator';
createRoot(document.getElementById('root')).render(<MemoryRouter><main className={cls} data-training-theme={theme} data-theme={theme} data-shell-mode={view==='report'?'student':undefined}><div style={{padding:16,maxWidth:960,margin:'auto'}}>{child}</div></main></MemoryRouter>);
`);
const results={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Actual UI components/styles. Role display fixtures are synthetic; report fixture is recorded PR374 public output. No API login, registration or FINAL simulated here; real HTTP evidence is separately admitted.',status:'RUNNING',cases:[],sandbox:null};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(results,null,2)+'\n');save();let vite,browser;
try{
 const {createServer}=await import(pathToFileURL(resolve(front,'node_modules/vite/dist/node/index.js')).href);
 vite=await createServer({root:front,server:{host:'127.0.0.1',port:5187,strictPort:true,hmr:false},clearScreen:false});
 if(process.argv.includes('--prepare-only')){const t=await vite.transformRequest('/pr376-fixture.jsx');assert(t?.code.includes('SchoolParentTasks'));results.status='PREPARED_NOT_BROWSER_TESTED';save();}
 else{
  assert.equal(process.env.GITHUB_ACTIONS,'true');await vite.listen();const {chromium}=require('../release-tools/node_modules/playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
  results.sandbox=await require('../../server-version/e2e/school-teacher-chrome.cjs').verifyChromeSandbox(browser);assert.equal(results.sandbox.ok,true);save();
  async function scenario(name,view,width,theme,work){
   const row={name,view,width,theme,status:'RUNNING'};results.cases.push(row);save();
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'&&u.port==='5187'&&!u.pathname.startsWith('/api/'))return route.continue();errors.push('Unexpected network request');return route.abort();});
   try{await page.goto('http://127.0.0.1:5187/pr376-fixture.html?view='+view+'&theme='+theme,{waitUntil:'networkidle'});await work(page,row);
    assert.deepEqual(errors,[]);assert((await page.evaluate(()=>window.fixtureCalls)).every(c=>c.method==='GET'));
    row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(row.overflow,false);
    await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,animations:'disabled'});row.status='PASS';
   }catch(e){row.status='FAIL';row.error=String(e.stack??e);throw e;}finally{save();await context.close();}
  }
  // Reuse the three unchanged role UI consumers from the failed overall run.
  // The failed warning and unexecuted downstream displays are NOT reused.
  const priorBytes=readFileSync('docs/performance/education-observer-journeys-20261028/evidence/ci-r1-browser.json');
  const {createHash}=await import('node:crypto');
  assert.equal(createHash('sha256').update(priorBytes).digest('hex'),'3e247b780804711d8f4ca2d6f1a2712ede7f69da8d2e187e8fe7468229f6974f');
  const prior=JSON.parse(priorBytes);assert.equal(prior.status,'FAIL');assert.equal(prior.head,'190c3ddbc86723206cc4af30cf8051ca9a00ad06');assert.equal(prior.sandbox.ok,true);
  const priorSource='6894ba96cddd4881e5d3d2292375d551cf650ddf';
  const changed=execFileSync('git',['diff','--name-only',priorSource,'HEAD','--','server-version/frontend'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assert.deepEqual(changed,['server-version/frontend/src/modules/reporting/report-ui.css']);
  for(const name of ['school-parent','school-teacher','teacher-expert']){const row=prior.cases.find(c=>c.name===name);assert.equal(row?.status,'PASS');assert.equal(row.overflow,false);results.cases.push({...row,reusedFrom:{run:40639538698,artifact:12795300037,source:priorSource},executedThisRun:false});}save();
  async function warningContrast(page,row){
   const warning=page.locator('.scale-unit-report .text-amber-700');await warning.first().waitFor();
   row.warnings=await warning.evaluateAll(elements=>elements.map(el=>{const fg=getComputedStyle(el).color;let parent=el,bg='';while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}if(!parent)bg='rgb(255, 255, 255)';const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};const a=lum(fg),b=lum(bg);return {text:el.textContent,color:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}));assert(row.warnings.length>=2);row.warning=row.warnings[0];assert(row.warning.ratio>=4.5,'Warning text contrast is insufficient');for(const value of row.warnings)assert(value.ratio>=4.5,'Auxiliary warning contrast is insufficient');
  }
  await scenario('warning-dark-mobile','report',390,'dark',warningContrast);
  await scenario('warning-dark-tablet','report',820,'dark',warningContrast);
  await scenario('warning-light-print','report',390,'light',async(page,row)=>{await warningContrast(page,row);row.light=row.warning;await page.emulateMedia({media:'print'});await warningContrast(page,row);row.print=row.warning;assert.equal(row.print.color,row.light.color);});
  assert.equal(results.cases.length,6);assert(results.cases.every(c=>c.status==='PASS'));results.status='PASS';save();
 }
}catch(e){results.status='FAIL';results.error=String(e.stack??e);save();throw e;}finally{await browser?.close();await vite?.close();for(const file of files)rmSync(file,{force:true});}
