'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {origin,exactMetric,assertCases}=require('./pr363-fixture.cjs')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {artifactResponseFile,assertManagementReads}=require('./pr363-browser.cjs')
test('entry origins cannot become HTTP, another host or credential URL',()=>{
 assert.equal(origin('SCHOOL',{}),'https://school.eduk12.top')
 for(const value of ['http://school.eduk12.top','https://school.eduk12.top:9443','https://training.eduk12.top','https://user:secret@school.eduk12.top','https://school.eduk12.top/path','https://school.eduk12.top?x=1'])assert.throws(()=>origin('SCHOOL',{PR363_SCHOOL_ORIGIN:value}))
})
test('rendered report metric binds the exact key rather than equal-valued sibling',()=>{
 const saved={core:{metrics:[{key:'a',value:7},{key:'b',value:8}]}}
 exactMetric({metricKey:'a',value:7},saved)
 assert.throws(()=>exactMetric({metricKey:'missing',value:7},saved))
 assert.throws(()=>exactMetric({metricKey:'b',value:7},saved))
})
test('artifact file traversal and encoded separators cannot bypass network byte identity',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pr363-control-')),dist=path.join(root,'dist');fs.mkdirSync(dist)
 try{
  fs.writeFileSync(path.join(root,'outside.js'),'outside');fs.writeFileSync(path.join(dist,'safe.js'),'safe')
  assert.equal(artifactResponseFile(dist,'https://school.eduk12.top/safe.js',false),path.join(dist,'safe.js'))
  for(const url of ['https://school.eduk12.top/%2e%2e%2foutside.js','https://school.eduk12.top/%5csecret','https://school.eduk12.top/%00secret'])assert.throws(()=>artifactResponseFile(dist,url,false))
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})

test('fixture scope cannot pass empty, duplicate or product-incomplete browser cases',()=>{
 const cases=[['SCHOOL','IMMEDIATE'],['TEACHER','IMMEDIATE'],['TEACHER','SCHEDULED']].map(([product,mode],i)=>({product,mode,executionId:'execution-'+i,runtimeId:'runtime-'+i,title:'PR363 '+i}))
 assertCases(cases)
 assert.throws(()=>assertCases([]))
 assert.throws(()=>assertCases([cases[0],cases[0],cases[2]]))
 assert.throws(()=>assertCases(cases.map(c=>({...c,executionId:'same'}))))
})

test('management acceptance requires successful summary reads from both real product contexts',()=>{
 const valid=['SCHOOL','TEACHER'].map(product=>({product,summaryRead:true,cprVerified:true,technicalJsonCollapsed:true,disclosure:'INDIVIDUAL_SUMMARY',openingMode:'IMMEDIATE'}))
 assertManagementReads(valid)
 assert.throws(()=>assertManagementReads([]))
 assert.throws(()=>assertManagementReads([valid[0],valid[0]]))
 assert.throws(()=>assertManagementReads([valid[0],{...valid[1],technicalJsonCollapsed:false}]))
 assert.throws(()=>assertManagementReads([valid[0],{...valid[1],cprVerified:false}]))
})
test('fixture failures retain only fixed safe diagnostics, never private raw message, URL or secret-shaped fields',()=>{
 const {readSafeSetupDiagnostics}=require('./pr363-fixture.cjs')
 const text='password=do-not-copy\nPR363_FIXTURE_FAILED '+JSON.stringify({stage:'source-TEACHER-IMMEDIATE',errorName:'CompositeServiceError',code:'TEACHER_SELF_IN_TRAINING',message:'secret',url:'https://private',digest:'a'.repeat(64)})+'\nSCHOOL_TEACHER_SEED_DIAGNOSTIC '+JSON.stringify({stage:'role-policy',errorName:'Error',code:'42501',credentials:'secret'})+'\nPR363_FIXTURE_FAILED '+JSON.stringify({stage:'secret-stage',errorName:'private-name',code:'PRIVATE_SECRET'})
 const rows=readSafeSetupDiagnostics(text)
 assert.equal(rows.length,3);assert.equal(rows[0].code,'TEACHER_SELF_IN_TRAINING');assert.equal(rows[1].code,'42501');assert.equal(rows[2].code,'UNKNOWN')
 assert(!JSON.stringify(rows).includes('secret'));assert(!JSON.stringify(rows).includes('https://'));assert.equal(readSafeSetupDiagnostics('PR363_FIXTURE_FAILED {broken').length,0)
})
test('Teacher refresh consumes the real bound-parent GET instead of manufacturing a second START',async()=>{
 const {openCase}=require('./pr363-browser.cjs'),handlers=new Set();let clicks=0,reads=0
 const response={url:()=> 'https://teacher.eduk12.top/api/huiteacher/assessment-composite-attempts/parent?view=current-unit',request:()=>({method:()=> 'GET'}),status:()=>200,json:async()=>({data:{id:'parent',status:'IN_PROGRESS'}})}
 const card={first(){return this},waitFor:async()=>{},count:async()=>1,getByRole(){return {click:async()=>{clicks++}}}}
 const page={goto:async()=>{},locator:()=>({filter:()=>card}),on:(_name,fn)=>handlers.add(fn),off:(_name,fn)=>handlers.delete(fn),waitForResponse:async predicate=>{reads++;assert.equal(predicate(response),true);return response},getByRole(){throw Error('Existing Teacher parent must not open another START button')}}
 assert.equal(await openCase(page,{product:'TEACHER',title:'Synthetic',executionId:'execution'},'parent'),'parent');assert.equal(clicks,1);assert.equal(reads,1);assert.equal(handlers.size,0)
 response.json=async()=>({data:{id:'different-parent',status:'IN_PROGRESS'}})
 await assert.rejects(()=>openCase(page,{product:'TEACHER',title:'Synthetic',executionId:'execution'},'parent'));assert.equal(handlers.size,0)
})

test('native single choice clicks once and awaits async checked state without replay',async()=>{
 const {selectNativeOption}=require('./pr363-browser.cjs');let clicks=0,checked=false;const element={get checked(){return checked}};
 const page={getByRole(role,options){assert.equal(role,'radio');assert.equal(options.name,'Synthetic async option');assert.equal(options.exact,true);return {async click(){clicks++;assert.equal(checked,false)},async elementHandle(){return element}}},async waitForFunction(predicate,arg){assert.equal(clicks,1);assert.equal(predicate(arg),false);checked=true;assert.equal(predicate(arg),true)}};
 await selectNativeOption(page,'Synthetic async option');assert.equal(clicks,1);assert.equal(checked,true)
})

test('bound-parent navigation waits for pending artifact verification and refuses a failed drain',async()=>{
 const {openCase}=require('./pr363-browser.cjs');let drained=false,navigated=false;
 const response={url:()=> 'https://teacher.eduk12.top/api/huiteacher/assessment-composite-attempts/parent',request:()=>({method:()=> 'GET'}),status:()=>200,json:async()=>({data:{id:'parent',status:'IN_PROGRESS'}})};
 const card={first(){return this},waitFor:async()=>{},count:async()=>1,getByRole:()=>({click:async()=>{}})};
 const page={goto:async()=>{assert.equal(drained,true);navigated=true},locator:()=>({filter:()=>card}),on(){},off(){},waitForResponse:async()=>response};
 await openCase(page,{product:'TEACHER',title:'Synthetic'},'parent',async()=>{await Promise.resolve();drained=true});assert.equal(navigated,true);navigated=false;
 await assert.rejects(()=>openCase(page,{product:'TEACHER',title:'Synthetic'},'parent',async()=>{throw Error('verification failed')}));assert.equal(navigated,false)
})
