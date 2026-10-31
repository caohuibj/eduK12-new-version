"""Render actual Compose defaults with synthetic inputs; never starts services."""
import os,re,pathlib,subprocess,json,hashlib,time
root=pathlib.Path(__file__).resolve().parents[3];server=root/'server-version'
out=pathlib.Path(__file__).parent
files=['docker-compose.yml','docker-compose.capacity.yml','scripts/prelaunch-resource-preflight.mjs']
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','DOCKER_CONFIG','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS']}
for filename in ['docker-compose.yml','docker-compose.capacity.yml']:
 for key in re.findall(r'\$\{([A-Z0-9_]+):\?',(server/filename).read_text()):env[key]='synthetic-only'
env.update({'DB_USER':'synthetic','DB_PASSWORD':'synthetic','DB_NAME':'synthetic','DATABASE_URL':'postgresql://synthetic:synthetic@postgres:5432/synthetic',
 'COOKIE_SECURE':'true','ASSET_MIGRATION_COMPLETE':'true','CORS_ORIGIN':'https://synthetic.invalid'})
result={'schemaVersion':1,'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'kind':'actual_source_defaults_rendered_with_synthetic_configuration_not_running_deployment',
 'userTarget':{'vcpus':4,'memoryGiB':4,'actualFutureHostUnmeasured':True},
 'inputSHA256':{name:hashlib.sha256((server/name).read_bytes()).hexdigest() for name in files},'profiles':[]}
node='/workspace/eduk12-cloud/tools/node_modules/node/bin/node'
for name,args in [('production-defaults',[]),('capacity-with-report-worker',['--profile','capacity-worker','-f','docker-compose.yml','-f','docker-compose.capacity.yml'])]:
 cmd=['docker','--host=unix:///var/run/docker.sock','compose',*args,'config','--format','json']
 p=subprocess.run(cmd,cwd=server,env=env,text=True,capture_output=True,timeout=30)
 if p.returncode:raise RuntimeError('Synthetic Compose render failed: '+p.stderr[:500])
 js="import fs from 'node:fs';import {inspectResourceContract} from './scripts/prelaunch-resource-preflight.mjs';console.log(JSON.stringify(inspectResourceContract(JSON.parse(fs.readFileSync(0,'utf8')),{capacity:"+('true' if args else 'false')+"})))"
 t=time.monotonic();q=subprocess.run([node,'--input-type=module','-e',js],cwd=server,env=env,input=p.stdout,text=True,capture_output=True,timeout=30)
 row={'name':name,'preflightExitCode':q.returncode,'seconds':time.monotonic()-t}
 if q.returncode:row['error']=q.stderr.strip()
 else:row['preflight']=json.loads(q.stdout)
 result['profiles'].append(row)
(out/'resource-defaults.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
