#!/usr/bin/env python3
"""Prepare/register dedicated CI lanes on Mac or the Windows Linux/WSL host.

No production paths/services; no copying existing runner credentials. Registration
uses a short-lived token returned to memory by an administrator's authenticated gh.
"""
import argparse, hashlib, json, os, pathlib, platform, shutil, stat, subprocess, tarfile, urllib.request

REPO='caohuibj/eduK12-new-version'

def checked_directory(path):
 path=pathlib.Path(path).expanduser().absolute()
 if any(ord(c)<32 or ord(c)==127 for c in str(path)):raise ValueError('Control characters are forbidden in fleet paths')
 for parent in [path,*path.parents]:
  if parent.is_symlink():raise ValueError('Fleet directories cannot contain symlinks')
 path.mkdir(mode=0o700,parents=True,exist_ok=True)
 if path.stat().st_uid!=os.getuid() or stat.S_IMODE(path.stat().st_mode)&0o077:raise ValueError('Fleet directory must belong to current CI account, mode0700')
 return path

def safe_extract(archive,root):
 with tarfile.open(archive,'r:gz')as tar:
  # Python's data filter rejects escaping paths/links and special files. GitHub
  # runner archives legitimately contain internal relative library symlinks.
  tar.extractall(root,filter='data')

def write_private(path,text,executable=False):
 if path.is_symlink():raise ValueError('Cannot replace a symlink')
 path.write_text(text);path.chmod(0o700 if executable else 0o600)

def prepare(fleet,host):
 if not hasattr(tarfile,'data_filter'):raise ValueError('Python tar data filter required; upgrade the CI account Python before preparing')
 pin=json.loads(pathlib.Path(__file__).with_name('runner-release.json').read_text());asset=pin['assets'][host]
 arch=platform.machine().lower()
 if (host=='mac' and (platform.system()!='Darwin' or arch not in ['arm64','aarch64']))or(host=='win' and(platform.system()!='Linux' or arch not in ['x86_64','amd64'])):raise ValueError('Lane host/architecture mismatch')
 if os.getuid()==0:raise ValueError('Use the dedicated non-root CI account')
 fleet=checked_directory(fleet);shared=checked_directory(fleet/'host');source=pathlib.Path(__file__).parent.resolve()
 write_private(shared/'host-lease.py',(source/'host-lease.py').read_text(),True)
 archive=fleet/('runner-'+pin['version']+'.tar.gz')
 if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=asset['sha256']:
  temp=archive.with_suffix('.download')
  if temp.exists():temp.unlink()
  with urllib.request.urlopen(asset['url'],timeout=60)as response,temp.open('xb')as target:shutil.copyfileobj(response,target)
  if hashlib.sha256(temp.read_bytes()).hexdigest()!=asset['sha256']:temp.unlink();raise ValueError('Official runner archive SHA256 mismatch')
  os.replace(temp,archive)
 inventory=[]
 for weight in ['light','heavy']:
  lane=host+'-'+weight;root=checked_directory(fleet/lane)
  if(root/'.runner').exists():raise ValueError('Existing registered lane requires explicit upgrade, not overwrite')
  safe_extract(archive,root)
  for child in ['cache','cache/npm','cache/playwright','_work','hooks']:checked_directory(root/child)
  for operation in ['acquire','release']:
   # Paths are selected locally, never interpolated from PR input or credentials.
   import shlex
   command='python3 '+shlex.quote(str(shared/'host-lease.py'))+' '+operation+' --root '+shlex.quote(str(shared))+' --lane '+lane
   write_private(root/'hooks'/('job-'+operation+'.sh'),'#!/bin/bash\nset -euo pipefail\n'+command+'\n',True)
  env='\n'.join(['CI_RUNNER_ROOT='+str(root),'CI_RUNNER_LANE='+lane,'NPM_CONFIG_CACHE='+str(root/'cache/npm'),'ACTIONS_RUNNER_HOOK_JOB_STARTED='+str(root/'hooks/job-acquire.sh'),'ACTIONS_RUNNER_HOOK_JOB_COMPLETED='+str(root/'hooks/job-release.sh')])+'\n'
  write_private(root/'.env',env)
  inventory.append({'lane':lane,'name':'eduk12-'+lane,'labels':['self-hosted','macOS' if host=='mac' else 'Linux','ARM64' if host=='mac' else 'X64','eduk12-'+lane],'root':str(root),'work':str(root/'_work'),'temporary':str(root/'_work/_temp'),'npmCache':str(root/'cache/npm'),'browserCache':str(root/'cache/playwright'),'registered':False})
 write_private(fleet/'inventory.json',json.dumps({'host':host,'runnerVersion':pin['version'],'archiveSha256':asset['sha256'],'lanes':inventory},indent=2)+'\n');return inventory

def register(fleet):
 fleet=checked_directory(fleet);record=json.loads((fleet/'inventory.json').read_text())
 if os.getuid()==0:raise ValueError('Use the dedicated CI account')
 # Does not print/serialize the token. gh must already have authorized repository
 # Administration write access; contents/actions integration permission is insufficient.
 token_result=subprocess.run(['gh','api','-X','POST','repos/'+REPO+'/actions/runners/registration-token','--jq','.token'],capture_output=True,text=True)
 if token_result.returncode:raise RuntimeError('Runner registration permission unavailable: '+token_result.stderr.strip())
 token=token_result.stdout.strip()
 if not token or '\n' in token:raise ValueError('Missing registration capability')
 try:
  for lane in record['lanes']:
   root=checked_directory(lane['root'])
   if lane['registered']:
    if not(root/'.runner').is_file():raise ValueError('Registered lane configuration missing')
    identity=json.loads((root/'.runner').read_text())
    if identity.get('agentName')!=lane['name']:raise ValueError('Existing runner identity mismatch')
    continue
   if(root/'.runner').exists():raise ValueError('Untracked registered runner; inspect before retry')
   env=dict(os.environ);env['ACTIONS_RUNNER_INPUT_TOKEN']=token
   subprocess.run([str(root/'config.sh'),'--unattended','--url','https://github.com/'+REPO,'--name',lane['name'],'--labels',lane['labels'][-1],'--work','_work'],cwd=root,env=env,check=True)
   env.pop('ACTIONS_RUNNER_INPUT_TOKEN',None);lane['registered']=True
   write_private(fleet/'inventory.json',json.dumps(record,indent=2)+'\n')
  write_private(fleet/'inventory.json',json.dumps(record,indent=2)+'\n')
 finally:token=''
 return record

def start(fleet):
 record=json.loads((checked_directory(fleet)/'inventory.json').read_text())
 if not all(x['registered'] for x in record['lanes']):raise ValueError('All lanes must be registered before service start')
 for lane in record['lanes']:
  root=checked_directory(lane['root']);command=[str(root/'svc.sh'),'install']
  if record['host']=='win':command=['sudo',*command,os.environ.get('USER','')]
  subprocess.run(command,cwd=root,check=True)
  command=[str(root/'svc.sh'),'start']
  if record['host']=='win':command=['sudo',*command]
  subprocess.run(command,cwd=root,check=True)
 # Existing runner services remain intact until real four-lane health/concurrency
 # checks pass. Explicit rollout must then drain/disable the two legacy listeners.
 return record

def main():
 p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','register','start','inspect']);p.add_argument('--host',choices=['mac','win'],required=True);p.add_argument('--root',default=str(pathlib.Path.home()/'eduk12-ci-fleet'));args=p.parse_args()
 if args.command=='prepare':record=prepare(args.root,args.host)
 elif args.command=='register':record=register(args.root)
 elif args.command=='start':record=start(args.root)
 else:record=json.loads((checked_directory(args.root)/'inventory.json').read_text())
 print(json.dumps(record,indent=2))

if __name__=='__main__':main()
