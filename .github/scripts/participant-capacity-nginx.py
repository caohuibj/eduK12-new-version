"""Small real-Nginx HTTP contracts; disposable private upstream, no app build."""
from pathlib import Path
import subprocess,tempfile,uuid,hashlib,http.client,json,gzip,time
OUT=Path('participant-capacity-evidence');OUT.mkdir(exist_ok=True)
name='capacity-http-'+uuid.uuid4().hex[:12];network=name+'-network';front=name+'-frontend';back=name+'-backend';checks=[]
IMAGE='nginx:1.31.6-alpine3.24-slim';NODE='node:24.21.0-bookworm-slim'
def run(*args):return subprocess.check_output(args,text=True).strip()
def check(condition,label):
 assert condition,label
 checks.append(label)
def request(port,path,headers=None):
 c=http.client.HTTPConnection('127.0.0.1',port,timeout=5);c.request('GET',path,headers=headers or {});r=c.getresponse();body=r.read();result=(r.status,{k.lower():v for k,v in r.getheaders()},body);c.close();return result
with tempfile.TemporaryDirectory(prefix=name) as tmp:
 root=Path(tmp);root.chmod(0o755);html=root/'html';(html/'assets').mkdir(parents=True);html.chmod(0o755);(html/'assets').chmod(0o755)
 script=(b'export const fixture="synthetic static payload";\n'*5000)
 values={'assets/app-AbC123xy.js':script,'assets/app-AbC123xy.css':b'body { color: black; }\n'*3000,'assets/pdf.worker-AbC123xy.mjs':script,'index.html':b'<!doctype html><title>Synthetic fixture</title>','entry-brand.js':b'window.fixture=true;'}
 for path,data in values.items():p=html/path;p.write_bytes(data);p.chmod(0o644)
 config=root/'default.conf';config.write_bytes(Path('server-version/frontend/nginx.conf').read_bytes());config.chmod(0o644)
 try:
  run('docker','pull',IMAGE);run('docker','pull',NODE);run('docker','network','create',network)
  upstream="require('http').createServer((q,s)=>{s.setHeader('Content-Type','application/json');s.setHeader('Cache-Control','no-store');s.end(JSON.stringify({synthetic:'x'.repeat(10000)}))}).listen(3000,'0.0.0.0')"
  run('docker','run','-d','--name',back,'--network',network,'--network-alias','backend',NODE,'node','-e',upstream)
  run('docker','run','-d','--name',front,'--network',network,'-p','127.0.0.1::80','-v',str(config)+':/etc/nginx/conf.d/default.conf:ro','-v',str(html)+':/usr/share/nginx/html:ro',IMAGE)
  run('docker','exec',front,'nginx','-t')
  info=json.loads(run('docker','inspect',front))[0];port=int(info['NetworkSettings']['Ports']['80/tcp'][0]['HostPort'])
  for _ in range(30):
   try:
    if request(port,'/')[0]==200:break
   except OSError:pass
   time.sleep(.1)
  status,h,plain=request(port,'/assets/app-AbC123xy.js');check(status==200 and plain==script,'identity JS bytes unchanged');check('immutable' in h.get('cache-control',''),'hashed JS immutable');etag=h['etag']
  status,h,body=request(port,'/assets/app-AbC123xy.js',{'Accept-Encoding':'gzip'});check(status==200 and h.get('content-encoding')=='gzip' and gzip.decompress(body)==script,'gzip decodes to exact JS');check(len(body)<len(script)//2 and 'accept-encoding' in h.get('vary','').lower(),'compressed transfer and Vary')
  status,h,_=request(port,'/assets/app-AbC123xy.js',{'If-None-Match':etag});check(status==304 and 'immutable' in h.get('cache-control',''),'conditional immutable asset response')
  status,h,body=request(port,'/assets/app-AbC123xy.css',{'Accept-Encoding':'gzip'});check(status==200 and h.get('content-encoding')=='gzip' and gzip.decompress(body)==values['assets/app-AbC123xy.css'],'CSS compression and exact content')
  status,h,_=request(port,'/assets/pdf.worker-AbC123xy.mjs');check(status==200 and 'javascript' in h.get('content-type','') and h.get('x-content-type-options')=='nosniff','PDF module MIME and nosniff retained')
  for path in ['/','/login','/student/composite/synthetic','/index.html']:
   status,h,_=request(port,path);check(status==200 and h.get('cache-control')=='no-cache','HTML revalidation '+path)
  status,h,_=request(port,'/entry-brand.js');check(status==200 and 'immutable' not in h.get('cache-control',''),'unhashed entry helper is not immutable')
  for path in ['/assets/missing-AbC123xy.js','/assets/missing-AbC123xy.mjs']:
   status,h,_=request(port,path);check(status==404 and 'immutable' not in h.get('cache-control',''),'missing hashed asset is not SPA or immutable '+path)
  status,h,body=request(port,'/api/synthetic',{'Accept-Encoding':'gzip'});check(status==200 and h.get('cache-control')=='no-store' and 'content-encoding' not in h,'private JSON retains no-store and is not added to compression types')
  for path in ['/','/assets/app-AbC123xy.js','/assets/missing-AbC123xy.js','/api/synthetic']:
   _,h,_=request(port,path);check(h.get('x-frame-options')=='DENY' and 'frame-ancestors' in h.get('content-security-policy','') and h.get('x-content-type-options')=='nosniff' and 'camera=()' in h.get('permissions-policy',''),'security headers retained '+path)
  for path in ['/metrics','/api/metrics','/uploads/synthetic']:
   status,_,_=request(port,path);check(status==404,'existing internal and legacy paths remain denied '+path)
  result={'checks':checks,'count':len(checks),'sourceSHA256':hashlib.sha256(config.read_bytes()).hexdigest(),'frontendImage':info['Image'],'upstreamImage':json.loads(run('docker','inspect',back))[0]['Image'],'applicationRebuilt':False}
  (OUT/'static-http-contracts.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'checks':len(checks),'passed':True}))
 finally:
  subprocess.run(['docker','rm','-f',front,back],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
