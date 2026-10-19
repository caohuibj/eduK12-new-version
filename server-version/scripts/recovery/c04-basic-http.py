#!/usr/bin/env python3
"""Fresh UTC/loopback C04 runtime, synthetic fixture, public authoring and FINAL.
Call under TOOLS/.measurement.lock. Uses only newly created state and children.
"""
import argparse, hashlib, json, os, signal, subprocess, time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);a=p.parse_args()
base=Path(__file__).resolve().parent;backend=base.parents[1]/'backend';node=a.tools.resolve()/'node_modules/node/bin/node';state=a.state.resolve()
assert not state.exists(), 'new private state required'
launcher=subprocess.Popen(['python3',str(base/'local-stack.py'),'--tools',str(a.tools.resolve()),'--state',str(state),'--hold-seconds','900','--whole-submit'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
result={'passed':False,'checks':[]};env={'PATH':f'{node.parent}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','NODE_ENV':'test'}
def stop_signal(signum,frame):raise KeyboardInterrupt
for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,stop_signal)
def fingerprint():return json.loads(subprocess.check_output([str(node),str(base/'runtime-fingerprint.cjs'),str(backend)],text=True))
try:
 deadline=time.monotonic()+420
 while time.monotonic()<deadline:
  if launcher.poll() is not None:raise RuntimeError('stack startup failed')
  if (state/'status.json').exists() and json.loads((state/'status.json').read_text()).get('state')=='running':break
  time.sleep(.5)
 else:raise TimeoutError('stack startup deadline')
 runtime=json.loads((state/'runtime-private.json').read_text());runtime.pop('DATABASE_URL_OWNER',None)
 assert 'runtime' in runtime['DATABASE_URL'] and runtime['BACKGROUND_WORKERS_ENABLED']=='false'
 result['sourceHead']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=backend,text=True).strip();result['runtimeFingerprint']=fingerprint()
 assert result['runtimeFingerprint']==json.loads((state/'status.json').read_text())['runtimeFingerprint'],'API startup runtime differs from test consumer'
 seed=backend.parent/'e2e/questionnaire-products-fixture.ts'
 with (state/'c04-seed.log').open('w') as log:
  subprocess.run([str(node),'--import','tsx',str(seed)],cwd=backend,env={**env,**runtime,'QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL':runtime['DATABASE_URL'],'QUESTIONNAIRE_PRODUCT_FIXTURE_FILE':str(state/'fixture-private.json')},stdout=log,stderr=log,check=True,timeout=180)
 script=base/'c04-basic-smoke.mjs';result['harnessSha256']=hashlib.sha256(script.read_bytes()).hexdigest()
 with (state/'c04-http.log').open('w') as log:
  subprocess.run([str(node),str(script),str(state)],cwd=backend,env={**env,**runtime},stdout=log,stderr=log,check=True,timeout=360)
 assert fingerprint()==result['runtimeFingerprint'] and hashlib.sha256(script.read_bytes()).hexdigest()==result['harnessSha256'],'runtime inputs changed'
 result['http']=json.loads((state/'c04-http-result.json').read_text());result['passed']=result['http']['passed']
except BaseException as error:result['errorType']=type(error).__name__;raise
finally:
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
 if state.exists(): (state/'stop').touch()
 try:output,_=launcher.communicate(timeout=100)
 except subprocess.TimeoutExpired:
  launcher.send_signal(signal.SIGTERM);output,_=launcher.communicate(timeout=100)
 if state.exists():
  (state/'launcher.log').write_text(output)
  status=json.loads((state/'status.json').read_text());result['cleanupVerified']=status.get('cleanupVerified',False)
  result['passed']=result['passed'] and result['cleanupVerified']
  (state/'c04-runtime-result.json').write_text(json.dumps(result,indent=2))
  print(json.dumps({'resultPath':str(state/'c04-runtime-result.json'),'passed':result['passed'],'cleanupVerified':result['cleanupVerified']}),flush=True)
 if not result.get('cleanupVerified'):raise RuntimeError('C04 cleanup not verified')
