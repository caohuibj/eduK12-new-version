#!/usr/bin/env python3
"""C14 isolated PG/HTTP qualification. Run under TOOLS/.measurement.lock."""
import argparse, hashlib, json, os, signal, subprocess, time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);a=p.parse_args()
base=Path(__file__).resolve().parent;backend=base.parents[1]/'backend';node=a.tools.resolve()/'node_modules/node/bin/node';state=a.state.resolve()
assert not state.exists(), 'new private state required'
launcher=subprocess.Popen(['python3',str(base/'local-stack.py'),'--tools',str(a.tools.resolve()),'--state',str(state),'--hold-seconds','1800','--export-processing'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
result={'passed':False};env={'PATH':f'{node.parent}:/usr/bin:/bin','HOME':str(state),'TMPDIR':str(state),'LANG':'C.UTF-8','NODE_ENV':'test'}
def stop_signal(signum,frame):raise KeyboardInterrupt
for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,stop_signal)
def harness_inputs():
 paths=[Path(__file__).resolve(),base/'c14-variants-smoke.mjs',base/'c14-variants-restore.py',backend.parent/'e2e/questionnaire-products-fixture.ts',backend/'src/modules/situational/authoring/examples/online-hand-calculated.json',base/'local-stack.py',base/'runtime-fingerprint.cjs']
 return {str(p.relative_to(backend.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
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
 result['harnessInputs']=harness_inputs()
 result['sourceHead']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=backend,text=True).strip();result['runtimeFingerprint']=fingerprint()
 assert result['runtimeFingerprint']==json.loads((state/'status.json').read_text())['runtimeFingerprint']
 seed=backend.parent/'e2e/questionnaire-products-fixture.ts'
 with (state/'c14-seed.log').open('w') as log:
  subprocess.run([str(node),'--import','tsx',str(seed)],cwd=backend,env={**env,**runtime,'QUESTIONNAIRE_PRODUCT_TEST_DATABASE_URL':runtime['DATABASE_URL'],'QUESTIONNAIRE_PRODUCT_FIXTURE_FILE':str(state/'fixture-private.json')},stdout=log,stderr=log,check=True,timeout=180)
 phases = ['variants']
 result['phases']={}
 for phase in phases:
  script=base/'c14-variants-smoke.mjs'
  with (state/('c14-http.log' if phase=='variants' else 'c14-mixed.log')).open('w') as log:
   subprocess.run([str(node),str(script),str(state)],cwd=backend,env={**env,**runtime,'PERF_ISOLATED_TEST_MODE':'1','PERF_SQL_EVENT_COUNT':'1'},stdout=log,stderr=log,check=True,timeout=1000)
  assert harness_inputs()==result['harnessInputs'] and fingerprint()==result['runtimeFingerprint']
  result['phases'][phase]=json.loads((state/('c14-http-result.json' if phase=='variants' else 'c14-mixed-result.json')).read_text())
 with (state/'c14-new-format-restore.log').open('w') as log:
  subprocess.run(['python3',str(base/'c14-variants-restore.py'),'--tools',str(a.tools.resolve()),'--state',str(state)],cwd=backend,env=env,stdout=log,stderr=log,check=True,timeout=240)
 result['phases']['newFormatRestore']=json.loads((state/'c14-new-format-restore-result.json').read_text())
 assert harness_inputs()==result['harnessInputs'] and fingerprint()==result['runtimeFingerprint']
 result['passed']=all(phase['passed'] for phase in result['phases'].values())
except BaseException as error:result['errorType']=type(error).__name__;raise
finally:
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
 if state.exists():(state/'stop').touch()
 try:output,_=launcher.communicate(timeout=100)
 except subprocess.TimeoutExpired:launcher.send_signal(signal.SIGTERM);output,_=launcher.communicate(timeout=100)
 if state.exists():
  (state/'launcher.log').write_text(output)
  status=json.loads((state/'status.json').read_text());result['cleanupVerified']=status.get('cleanupVerified',False)
  result['passed']=result['passed'] and result['cleanupVerified']
  (state/'c14-runtime-result.json').write_text(json.dumps(result,indent=2))
  print(json.dumps({'resultPath':str(state/'c14-runtime-result.json'),'passed':result['passed'],'cleanupVerified':result['cleanupVerified']}),flush=True)
 if not result.get('cleanupVerified'):raise RuntimeError('C14 cleanup not verified')
