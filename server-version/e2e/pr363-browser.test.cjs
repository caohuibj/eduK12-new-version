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
