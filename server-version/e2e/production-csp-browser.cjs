// Exercise the enforced production policy with built pages and real PDF/HLS playback.
// Only synthetic fixtures are used; no credentials or production data.
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const http=require('node:http')
const os=require('node:os')
const {spawnSync}=require('node:child_process')
const {chromium}=require('../backend/node_modules/playwright-core')
const root=path.resolve(__dirname,'..'), frontend=path.join(root,'frontend')
const config=fs.readFileSync(path.join(frontend,'nginx.conf'),'utf8')
const policy=config.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1]
assert.ok(policy,'production CSP must be enforced')
assert.ok(!policy.includes("'unsafe-eval'"),'string evaluation must stay disabled')
assert.ok(!config.includes('Content-Security-Policy-Report-Only'))
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eduk12-csp-'))
function pdf(){
 const stream='0 0 1 rg 5 5 80 40 re f\n'
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 160 90] /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream']
 let text='%PDF-1.4\n'; const offsets=[]
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+object+'\nendobj\n'})
 const xref=Buffer.byteLength(text)
 return text+'xref\n0 5\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'
}
const positive=`
import * as pdfjs from '/compat/pdf.mjs';
import Hls from '/compat/hls.mjs';
window.results={};
const style=document.createElement('div');style.style.width='37px';document.body.append(style);
window.results.inlineStyle=getComputedStyle(style).width==='37px';
await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));window.results.wasm=true;
const worker=new Worker(URL.createObjectURL(new Blob(['postMessage("ready")'],{type:'text/javascript'})));
await new Promise((resolve,reject)=>{worker.onmessage=resolve;worker.onerror=reject;});worker.terminate();window.results.blobWorker=true;
pdfjs.GlobalWorkerOptions.workerSrc='/compat/pdf.worker.min.mjs';
const doc=await pdfjs.getDocument({url:'/compat/probe.pdf'}).promise;
const page=await doc.getPage(1);const canvas=document.querySelector('canvas');const viewport=page.getViewport({scale:1});
canvas.width=viewport.width;canvas.height=viewport.height;
await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
window.results.pdf=doc.numPages===1&&canvas.getContext('2d').getImageData(10,60,1,1).data[2]>200;await doc.destroy();
const video=document.querySelector('video');
if(!Hls.isSupported())throw new Error('HLS support required');
const hls=new Hls({enableWorker:true});hls.loadSource('/compat/probe.m3u8');hls.attachMedia(video);
await new Promise((resolve,reject)=>{video.onloadeddata=resolve;hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)reject(new Error(d.type));});});
window.results.hls=video.videoWidth===160;hls.destroy();
window.results.api=(await fetch('/api/auth/csrf')).ok;window.positiveDone=true;
`
const negative=`
window.attackExecuted=false;
const script=document.createElement('script');script.textContent='window.attackExecuted=true';document.body.append(script);
const remote=document.createElement('script');remote.src='https://csp-denied.invalid/script.js';document.body.append(remote);
const button=document.createElement('button');button.setAttribute('onclick','window.attackExecuted=true');document.body.append(button);button.click();
try{eval('window.attackExecuted=true')}catch(e){window.evalBlocked=e.name==='EvalError'}
const base=document.createElement('base');base.href='https://csp-denied.invalid/';document.head.append(base);
const object=document.createElement('object');object.data='https://csp-denied.invalid/plugin';document.body.append(object);
const frame=document.createElement('iframe');frame.src='https://csp-denied.invalid/frame';document.body.append(frame);
try{const socket=new WebSocket('wss://csp-denied.invalid/');socket.onerror=()=>{}}catch{};
const font=new FontFace('denied','url(https://csp-denied.invalid/font.woff2)');font.load().catch(()=>{});
const form=document.createElement('form');form.action='https://csp-denied.invalid/submit';form.method='POST';document.body.append(form);form.submit();
window.negativeDone=true;
`
let browser,server
async function main(){
 const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=25','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p','-f','hls','-hls_time','1','-hls_list_size','0',path.join(temp,'probe.m3u8')])
 assert.equal(result.status,0,'ffmpeg required for real HLS playback')
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.pdf':'application/pdf','.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.svg':'image/svg+xml'}
 server=http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',policy);res.setHeader('X-Content-Type-Options','nosniff')
  const pathname=new URL(req.url,'http://localhost').pathname
  const send=(type,body,status=200)=>{res.writeHead(status,{'Content-Type':type});res.end(body)}
  if(pathname==='/positive')return send('text/html','<canvas></canvas><video muted></video><script type="module" src="/positive.js"></script>')
  if(pathname==='/negative')return send('text/html','<body>Negative CSP probe</body>')
  if(pathname==='/positive.js')return send('text/javascript',positive)
  if(pathname==='/negative.js')return send('text/javascript',negative)
  if(pathname==='/api/security/csp-report'){req.resume();res.writeHead(204);return res.end()}
  if(pathname==='/api/auth/csrf')return send('application/json',JSON.stringify({data:{csrfToken:'synthetic-csp-probe'}}))
  if(pathname==='/api/capabilities')return send('application/json',JSON.stringify({code:0,data:{cognitive:true,parentPortal:false}}))
  if(pathname.startsWith('/api/'))return send('application/json','{"error":"unauthenticated"}',401)
  const compat={
   '/compat/pdf.mjs':path.join(frontend,'node_modules/pdfjs-dist/build/pdf.mjs'),
   '/compat/pdf.worker.min.mjs':path.join(frontend,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
   '/compat/hls.mjs':path.join(frontend,'node_modules/hls.js/dist/hls.mjs'),
   '/compat/probe.m3u8':path.join(temp,'probe.m3u8'),'/compat/probe0.ts':path.join(temp,'probe0.ts')
  }
  if(pathname==='/compat/probe.pdf')return send('application/pdf',pdf())
  let file=compat[pathname]
  if(!file){
   file=path.resolve(frontend,'dist','.'+pathname)
   if(!file.startsWith(path.resolve(frontend,'dist')+path.sep))return send('text/plain','denied',403)
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(frontend,'dist/index.html')
  }
  return send(mime[path.extname(file)]||'application/octet-stream',fs.readFileSync(file))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const origin='http://127.0.0.1:'+server.address().port
 const executablePath=[process.env.E2E_BROWSER_EXECUTABLE,chromium.executablePath(),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome'].find(p=>p&&fs.existsSync(p))
 browser=await chromium.launch({headless:true,executablePath});const page=await browser.newPage();page.on('pageerror',e=>console.error('Browser fixture error:',e.message))
 await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.effectiveDirective))})
 for(const [route,placeholder]of[['/student/login','请输入用户名'],['/teacher/account-login','请输入用户名'],['/admin/login','请输入管理员账号']]){
  await page.goto(origin+route);await page.getByPlaceholder(placeholder).waitFor({state:'visible'})
  assert.deepEqual(await page.evaluate(()=>window.cspViolations),[],route+' must remain usable')
 }
 await page.goto(origin+'/positive');await page.waitForFunction(()=>window.positiveDone,null,{timeout:15000})
 const results=await page.evaluate(()=>({checks:window.results,violations:window.cspViolations}))
 assert.deepEqual(results.violations,[],'permitted PDF/HLS/workers/Wasm/styles must not violate CSP')
 assert.ok(Object.values(results.checks).every(Boolean),JSON.stringify(results.checks))
 await page.goto(origin+'/negative',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{const fixture=document.createElement('script');fixture.src='/negative.js';document.body.append(fixture)});await page.waitForFunction(()=>window.negativeDone)
 const required=['script-src-elem','script-src-attr','script-src','base-uri','object-src','frame-src','connect-src','font-src','form-action']
 await page.waitForFunction(expected=>expected.every(x=>window.cspViolations.includes(x)),required,{timeout:10000})
 assert.equal(await page.evaluate(()=>window.attackExecuted),false);assert.equal(await page.evaluate(()=>window.evalBlocked),true)
 console.log(JSON.stringify({status:'PASS',loginRoutes:3,compatibility:results.checks,blockedDirectives:required}))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(browser)await browser.close()
 if(server)await new Promise(resolve=>server.close(resolve))
 fs.rmSync(temp,{recursive:true,force:true})
})
