import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),front=resolve('server-version/frontend'),out=resolve('onboarding-evidence/education-editors');
mkdirSync(out,{recursive:true});
const html=resolve(front,'pr395-fixture.html'),entry=resolve(front,'pr395-fixture.jsx');
const jsx=`import React from 'react';import{createRoot}from'react-dom/client';import{EducationPrivateToolStudio}from'./src/components/education-tools/EducationPrivateToolStudio';
const api=async(path,method='GET',data)=>{const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error('Fixture rejected request');return(await r.json()).data};
const product=new URLSearchParams(location.search).get('product');createRoot(document.getElementById('root')).render(<EducationPrivateToolStudio api={api} organizationId="synthetic-org" actorId="synthetic-author" entry={product}/>);`;
const result={status:'RUNNING',scope:'Real shared authoring components in a Vite browser harness with synthetic GET-only responses. Not real login, authorization, START/FINAL, or production network timing.',cases:[],sandbox:null};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(result,null,2)+'\n');save();
let vite,browser;
try{
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');
 const plan=JSON.parse(process.env.PLAN);assert.equal(plan.pr,395);assert.equal(plan.head,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
 result.source=plan;assert.deepEqual(JSON.parse(readFileSync('onboarding-evidence/admission.json','utf8')).source,plan);
 const {chromium}=require('../release-tools/node_modules/playwright-core');
 browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
 result.sandbox=await require('../../server-version/e2e/school-teacher-chrome.cjs').verifyChromeSandbox(browser);assert.equal(result.sandbox.ok,true);save();
 writeFileSync(html,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Education editor check</title><div id="root"></div><script type="module" src="/pr395-fixture.jsx"></script></html>');writeFileSync(entry,jsx);
 const {createServer}=await import(pathToFileURL(resolve(front,'node_modules/vite/dist/node/index.js')).href);
 vite=await createServer({root:front,server:{host:'127.0.0.1',port:5187,strictPort:true,hmr:false},clearScreen:false});await vite.listen();
 for(const product of ['SCHOOL','TEACHER']){
  const row={product,status:'RUNNING',api:[],errors:[]};result.cases.push(row);save();
  const context=await browser.newContext({viewport:{width:product==='SCHOOL'?768:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>row.errors.push(e.message));
  const base='/organizations/synthetic-org/private-tools';
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(4)+url.search;row.api.push({path,method:request.method()});
   if(request.method()!=='GET'||![base,base+'?kind=COMPOSITION',base+'/package-sources'].includes(path)){row.errors.push('Unexpected '+request.method()+' '+path);return route.abort();}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{list:[],nextCursor:null}})});
  });
  try{
   await page.goto('http://127.0.0.1:5187/pr395-fixture.html?product='+product);
   await page.getByText('暂无私有工具，可先创建一份量表或表单。',{exact:true}).waitFor();
   assert.deepEqual(row.api.map(r=>r.path),[base]);
   await page.getByRole('button',{name:'普通问卷',exact:true}).click();
   const title=page.getByLabel('问卷名称',{exact:true});await title.waitFor();
   await page.getByText('正在读取或保存，请稍候…',{exact:true}).waitFor({state:'hidden'});
   await title.fill('保留的本地问卷');
   page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'正式整包 · 整体引用',exact:true}).click();
   assert.equal(await title.inputValue(),'保留的本地问卷');assert(!row.api.some(r=>r.path.endsWith('/package-sources')));
   page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'正式整包 · 整体引用',exact:true}).click();
   await page.getByText('当前学校下暂无获授权的正式固定包。',{exact:true}).waitFor();
   assert.deepEqual(row.api.map(r=>r.path),[base,base+'?kind=COMPOSITION',base+'/package-sources']);assert.deepEqual(row.errors,[]);
   await page.screenshot({path:resolve(out,product+'.png'),fullPage:true});row.status='PASS';
  }catch(e){row.status='FAIL';row.error=String(e.stack??e);console.error(JSON.stringify({product,api:row.api,errors:row.errors,error:row.error}));throw e;}finally{save();await context.close();}
 }
 result.status='PASS';save();
}catch(e){result.status='FAIL';result.error=String(e.stack??e);save();throw e;}finally{await browser?.close();await vite?.close();rmSync(html,{force:true});rmSync(entry,{force:true});save();}
