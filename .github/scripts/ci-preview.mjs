import {createServer,request}from 'node:http';
import {readFileSync,lstatSync,realpathSync}from 'node:fs';
import {resolve,join,extname,sep}from 'node:path';
import {pathToFileURL}from 'node:url';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4','.ico':'image/x-icon'};
export function previewServer(directory,{backend}={}){
 let backendTarget;
 if(backend){backendTarget=new URL(backend);if(backendTarget.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(backendTarget.hostname)||backendTarget.username||backendTarget.password||backendTarget.pathname!=='/'||backendTarget.search||backendTarget.hash)throw new Error('Preview proxy requires an explicit loopback HTTP service');}
 const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
 const cleanHeaders=headers=>Object.fromEntries(Object.entries(headers).filter(([key])=>!hop.has(key.toLowerCase())&&!(headers.connection??'').split(',').map(s=>s.trim().toLowerCase()).includes(key.toLowerCase()))); 
 const root=resolve(directory);if(realpathSync(root)!==root||!lstatSync(root).isDirectory())throw new Error('Preview root must be a real directory');
 readFileSync(join(root,'index.html'));
 return createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end();return;}
  if(backendTarget&&(pathname==='/api'||pathname.startsWith('/api/')||pathname==='/uploads'||pathname.startsWith('/uploads/'))){
   const upstream=request({hostname:backendTarget.hostname==='localhost'?'127.0.0.1':backendTarget.hostname.replace(/^\[|\]$/g,''),port:backendTarget.port||80,path:req.url,method:req.method,headers:{...cleanHeaders(req.headers),host:backendTarget.host}},response=>{res.writeHead(response.statusCode,cleanHeaders(response.headers));response.pipe(res);});
   upstream.setTimeout(120000,()=>upstream.destroy(new Error('Isolated API proxy timeout')));
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});req.pipe(upstream);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(pathname.startsWith('/api/')||pathname.startsWith('/uploads/')||pathname.includes('\0')||pathname.includes('\\')){res.writeHead(404);res.end();return;}
  const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)&&file!==root){res.writeHead(403);res.end();return;}
  let target=file;
  try{
   let current=root;for(const segment of file.slice(root.length+1).split('/').filter(Boolean)){current=join(current,segment);if(lstatSync(current).isSymbolicLink())throw new Error('Preview symlink denied');}
   if(!lstatSync(file).isFile())target=join(root,'index.html');
  }catch(error){
   if(error.code==='ENOENT'&&!extname(pathname))target=join(root,'index.html');
   else{res.writeHead(error.code==='ENOENT'?404:403);res.end();return;}
  }
  try{const bytes=readFileSync(target);res.writeHead(200,{'content-type':types[extname(target)]??'application/octet-stream','content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(404);res.end();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [directory,port='5173']=process.argv.slice(2);if(!directory||!/^\d+$/.test(port)||+port<1024||+port>65535)throw new Error('Usage: ci-preview.mjs <exact-dist-directory> [port]');
 const backend=process.argv.includes('--proxy')?(process.env.E2E_BACKEND_URL||'http://127.0.0.1:3000'):undefined;
 const server=previewServer(directory,{backend});server.listen(+port,'127.0.0.1',()=>console.log('CI static preview ready at 127.0.0.1:'+port));
 for(const sig of ['SIGTERM','SIGINT'])process.once(sig,()=>server.close(()=>process.exit(0)));
}
