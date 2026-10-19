#!/usr/bin/env python3
"""Continue only missing HTTP checks on the already-upgraded synthetic PG.
Retains failed evidence and does not repeat a qualified migration/restore check.
"""
import argparse, hashlib, json, os, signal, socket, subprocess, time, urllib.parse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('--phase',choices=['full','export-whole','diagnose'],default='full');a=p.parse_args()
state=a.state.resolve();backend=Path(__file__).resolve().parents[2]/'backend';node=a.tools.resolve()/'node_modules/node/bin/node'
prior=json.loads((state/'c03-upgrade-result.json').read_text())
assert prior.get('historicalProjectionSha256') and all(x['stopped'] for x in prior['cleanup']), 'require completed isolated upgrade and shutdown'
assert not (state/'pgdata/postmaster.pid').exists(), 'existing postgres must not be active'
runtime=json.loads((state/'runtime-private.json').read_text())
assert set(runtime).isdisjoint({'DATABASE_URL_OWNER','PGPASSWORD'})
assert urllib.parse.urlparse(runtime['DATABASE_URL']).hostname=='127.0.0.1'
assert urllib.parse.urlparse(runtime['DATABASE_URL']).username=='eduk12_runtime'
name='http-resume-'+str(time.time_ns());runstate=state/name;runstate.mkdir(mode=0o700);os.umask(0o077)
(runstate/'fixture-private.json').write_bytes((state/'fixture-private.json').read_bytes())
apiport=int(runtime['PORT']);dbport=urllib.parse.urlparse(runtime['DATABASE_URL']).port;redisport=urllib.parse.urlparse(runtime['REDIS_URL']).port
# Same isolated database, new private fixture/result/log directory.
(runstate/'status.json').write_text(json.dumps({'state':'running','apiUrl':f'http://127.0.0.1:{apiport}'}))
env={'PATH':f'{node.parent}:/usr/bin:/bin','HOME':str(runstate),'TMPDIR':str(runstate),'LANG':'C.UTF-8','NODE_ENV':'test'}
children=[];logs=[];result={'passed':False,'reusedUpgradeEvidence':hashlib.sha256((state/'c03-upgrade-result.json').read_bytes()).hexdigest()}
def fingerprint():return json.loads(subprocess.check_output([str(node),str(Path(__file__).with_name('runtime-fingerprint.cjs')),str(backend)],text=True))
def start(cmd,label,extra=None):
 f=(runstate/(label+'.log')).open('w');logs.append(f);child=subprocess.Popen(list(map(str,cmd)),cwd=backend,env={**env,**(extra or {})},stdout=f,stderr=f);children.append((label,child));return child
def waitport(port,child):
 end=time.monotonic()+60
 while time.monotonic()<end:
  if child.poll() is not None:raise RuntimeError('startup failure; see private logs')
  try:
   with socket.create_connection(('127.0.0.1',port),timeout=1):return
  except OSError:time.sleep(.2)
 raise TimeoutError('startup deadline')
def stop_signal(signum,frame):raise KeyboardInterrupt
for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,stop_signal)
try:
 result['phase']=a.phase
 result['runtimeFingerprint']=fingerprint()
 result['head']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=backend,text=True).strip()
 script=Path(__file__).with_name('c03-typed-smoke.mjs');result['harnessSha256']=hashlib.sha256(script.read_bytes()).hexdigest()
 pg=start([a.tools/'postgresql/bin/postgres','-D',state/'pgdata','-h','127.0.0.1','-p',dbport,'-k','','-c','timezone=UTC','-c','shared_buffers=128MB','-c','max_connections=40'],'postgres');waitport(dbport,pg)
 redis=start([a.tools/'redis/bin/redis-server','--bind','127.0.0.1','--port',redisport,'--dir',runstate,'--save','','--appendonly','no','--maxmemory','128mb','--maxmemory-policy','noeviction'],'redis');waitport(redisport,redis)
 api=start([node,'--require',Path(__file__).with_name('loopback-only.cjs'),'dist/index.js'],'api',runtime);waitport(apiport,api)
 if a.phase != 'diagnose': worker=start([node,'dist/workers/main.js'],'report-worker',runtime)
 with (runstate/'typed-http.log').open('w') as f:subprocess.run([str(node),str(script),str(runstate)],cwd=backend,env={**env,**runtime,'C03_PHASE':a.phase},stdout=f,stderr=f,check=True,timeout=240)
 assert fingerprint()==result['runtimeFingerprint'] and hashlib.sha256(script.read_bytes()).hexdigest()==result['harnessSha256'],'inputs changed during check'
 result['http']=json.loads((runstate/'typed-http-result.json').read_text());result['passed']=result['http']['passed']
except BaseException as e:result['errorType']=type(e).__name__;raise
finally:
 for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
 cleanup=[]
 for label,child in reversed(children):
  if child.poll() is None:
   child.send_signal(signal.SIGINT if label=='postgres' else signal.SIGTERM)
   try:child.wait(timeout=20)
   except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)
  cleanup.append({'service':label,'stopped':child.poll() is not None})
 for log in logs:log.close()
 result['cleanup']=cleanup
 (runstate/'c03-http-result.json').write_text(json.dumps(result,indent=2));print(json.dumps({'resultPath':str(runstate/'c03-http-result.json'),**result}),flush=True)
