import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync}from 'node:fs';import {join}from 'node:path';import {tmpdir}from 'node:os';import{once}from 'node:events';import{previewServer}from './ci-preview.mjs';
test('built assets and deep links serve without frontend node_modules; missing API/assets fail',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-preview-'));writeFileSync(join(root,'index.html'),'<html>actual compiled input</html>');mkdirSync(join(root,'assets'));writeFileSync(join(root,'assets/app.js'),'export const compiled=true;');writeFileSync(join(root,'outside.txt'),'cannot follow');symlinkSync(join(root,'outside.txt'),join(root,'assets/link.js'));
 const server=previewServer(root);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await fetch(base+'/training/student/courses?x=1');assert.equal(page.status,200);assert.match(await page.text(),/actual compiled/);
  const js=await fetch(base+'/assets/app.js');assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);assert.match(await js.text(),/compiled/);
  for(const path of ['/assets/missing.js','/api/courses'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/assets/link.js')).status,403);
  assert.equal((await fetch(base+'/assets/%5cfile')).status,404);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  assert.equal(await(await fetch(base+'/',{method:'HEAD'})).text(),'');
 }finally{await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});}
});

test('isolated API proxy preserves authentication, CSRF, writes, query and media ranges',async()=>{
 const {createServer}=await import('node:http');const root=mkdtempSync(join(tmpdir(),'ci-proxy-'));writeFileSync(join(root,'index.html'),'compiled');
 const received=[];const api=createServer(async(req,res)=>{
  let body='';for await(const data of req)body+=data;
  received.push({url:req.url,method:req.method,headers:req.headers,body});
  res.writeHead(req.headers.range?206:200,{'content-type':req.url.startsWith('/api')?'application/json':'video/mp4','set-cookie':['session=synthetic; HttpOnly; SameSite=Lax'],'content-range':'bytes 0-2/3'});res.end(req.headers.range?'abc':JSON.stringify({body}));
 });api.listen(0,'127.0.0.1');await once(api,'listening');
 const server=previewServer(root,{backend:'http://127.0.0.1:'+api.address().port});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  const result=await fetch(base+'/api/submit?attempt=2',{method:'POST',headers:{cookie:'session=synthetic','x-csrf-token':'synthetic-csrf','content-type':'application/json'},body:'{"final":true}'});
  assert.equal(result.status,200);assert.equal((await result.json()).body,'{"final":true}');assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.equal(received[0].url,'/api/submit?attempt=2');assert.equal(received[0].headers.cookie,'session=synthetic');assert.equal(received[0].headers['x-csrf-token'],'synthetic-csrf');
  const video=await fetch(base+'/uploads/test.mp4',{headers:{range:'bytes=0-2'}});assert.equal(video.status,206);assert.equal(await video.text(),'abc');assert.equal(received[1].headers.range,'bytes=0-2');
  assert.equal((await fetch(base+'/training/course')).status,200);
  await new Promise(r=>api.close(r));assert.equal((await fetch(base+'/api/health')).status,502);
  for(const backend of ['https://127.0.0.1:3000','http://prod.example:3000','http://user:password@localhost:3000','http://localhost:3000/api'])assert.throws(()=>previewServer(root,{backend}),/loopback/);
 }finally{await new Promise(r=>server.close(r));if(api.listening)await new Promise(r=>api.close(r));rmSync(root,{recursive:true,force:true});}
});
