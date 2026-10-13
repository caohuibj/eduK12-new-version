"""Input-bound, same-PR official phase reuse. Never reuse failed assertions."""
import datetime, hashlib, json, os, subprocess, urllib.request, urllib.parse, zipfile
from pathlib import Path

def sha(value): return hashlib.sha256(value).hexdigest()
def objects(ref, prefix):
    data=subprocess.check_output(['git','ls-tree','-rz','--full-tree',ref,prefix])
    return [(line.split(b'\t',1)[1].decode(),line.split(b'\t',1)[0].decode()) for line in data.split(b'\0') if line]
def fingerprint(plan, tool_refs=None, allow_transition=True):
    tools=['.github/scripts/access-efficiency-candidate.py','.github/scripts/access-efficiency-reuse.py','.github/workflows/ci-access-efficiency.yml']
    tool=sha(json.dumps([(f,(tool_refs or {}).get(f) or subprocess.check_output(['git','rev-parse',plan['head']+':'+f],text=True).strip()) for f in tools]).encode())
    builds={}; tests={}
    candidate_source=subprocess.check_output(['git','show',plan['head']+':'+tools[0]])
    backend_mirror='deb.debian.org' if b'DEBIAN_MIRROR=deb.debian.org' in candidate_source else 'mirrors.tuna.tsinghua.edu.cn'
    for component in ['frontend','backend']:
        entries=objects(plan['head'],'server-version/'+component)
        production=[entry for entry in entries if '/__tests__/' not in entry[0] and '.test.' not in entry[0] and '/src/test/' not in entry[0]]
        builds[component]=sha(json.dumps([tool,production,{'node':'24.21.0','debianMirror':backend_mirror if component=='backend' else 'mirrors.tuna.tsinghua.edu.cn','cognitiveBuild':'true'}]).encode())
        shared=[entry for entry in entries if ('/__tests__/' in entry[0] or '/src/test/' in entry[0]) and '.test.' not in entry[0]]
        selected=plan['tests'] if component=='backend' else plan['frontendTests']
        for file in selected:
            item=next(entry for entry in entries if entry[0]=='server-version/'+component+'/'+file)
            # The paging baseline consumes the exact old controller as well.
            baseline=subprocess.check_output(['git','rev-parse',plan['base']+':server-version/backend/src/controllers/checkinController.ts'],text=True).strip() if 'accessPaging.' in file else None
            tests[file]=sha(json.dumps([builds[component],shared,item,baseline]).encode())
        if component=='backend':
            for target in plan['focusedTests']:
                item=next(entry for entry in entries if entry[0]=='server-version/backend/'+target['file'])
                tests[target['file']+'::'+target['title']]=sha(json.dumps([builds[component],shared,item,target['title']]).encode())
    extra=[entry for path in ['server-version/miniprogram','server-version/miniprogram-v2','server-version/docker-compose.yml','server-version/docker-compose.hardened.yml'] for entry in objects(plan['head'],path)]
    result={'tool':tool,'builds':builds,'tests':tests,'extra':sha(json.dumps([tool,extra]).encode())}
    if allow_transition:
        transition=json.loads(subprocess.check_output(['git','show',plan['head']+':.github/scripts/access-efficiency-bindings.json'])).get('backendMirrorTransition')
        if transition:
            paths={'candidate':tools[0],'reuse':tools[1]}
            actual={key:subprocess.check_output(['git','rev-parse',plan['head']+':'+file],text=True).strip() for key,file in paths.items()}
            if actual!=transition['after']:raise ValueError('Reviewed mirror transition tool binding mismatch')
            previous=subprocess.check_output(['git','cat-file','blob',transition['before']['candidate']])
            current=subprocess.check_output(['git','show',plan['head']+':'+tools[0]])
            old_arg=b'DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn';new_arg=b'DEBIAN_MIRROR=deb.debian.org'
            if previous.count(old_arg)!=2 or previous.replace(old_arg,new_arg)!=current:
                raise ValueError('Mirror transition changed more than two backend-only arguments')
            # Only frontend and mobile/Compose consumers are equivalent. No
            # backend compilation, test, audit or scan can cross this transition.
            refs={paths[key]:value for key,value in transition['before'].items()}
            compatible=fingerprint(plan,refs,False)
            result['frontendCompatibleInputs']={'tool':compatible['tool'],'builds':{'frontend':compatible['builds']['frontend']},
                'tests':{key:compatible['tests'][key] for key in plan['frontendTests']},'extra':compatible['extra']}
    return result

def recent(value, now=None):
    if not isinstance(value,str): return False
    date=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    age=(now or datetime.datetime.now(datetime.timezone.utc))-date
    return datetime.timedelta(0)<=age<datetime.timedelta(hours=24)

def eligible(old,current,environment=None):
    if old.get('inputs',{}).get('tool')!=current['tool']:
        compatible=current.get('frontendCompatibleInputs',{})
        if compatible.get('tool')!=old.get('inputs',{}).get('tool'):return {'builds':[], 'tests':[], 'extra':False}
        current=compatible
        components=['frontend']
    else:components=['frontend','backend']
    builds=[c for c in components if old['inputs']['builds'].get(c)==current['builds'][c]
        and old.get('compile',{}).get(c,{}).get('status')=='success' and recent(old['compile'][c].get('at'))]
    if environment and old.get('environment',{}).get('node')!=environment.get('node'):builds=[]
    tests=[key for key,value in current['tests'].items() if old['inputs']['tests'].get(key)==value
        and old.get('tests',{}).get(key,{}).get('status')=='success' and recent(old['tests'][key].get('at'))]
    if environment and old.get('environment')!=environment:tests=[]
    extra=old['inputs'].get('extra')==current['extra'] and old.get('extra',{}).get('status')=='success' and recent(old['extra'].get('at'))
    return {'builds':builds,'tests':tests,'extra':extra}

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        parsed=urllib.parse.urlparse(newurl)
        if parsed.scheme!='https':raise ValueError('Non-TLS artifact redirect')
        request=super().redirect_request(req,fp,code,msg,headers,newurl)
        if parsed.hostname!='api.github.com':request.remove_header('Authorization')
        return request
opener=urllib.request.build_opener(SafeRedirect())
def api(path):
    url='https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+path
    return json.loads(opener.open(urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'}),timeout=30).read())
def valid_source(run,artifact,pr):
    return (run.get('event')=='pull_request' and run.get('path')=='.github/workflows/ci.yml'
        and any(item.get('number')==pr for item in run.get('pull_requests',[]))
        and not artifact.get('expired') and artifact.get('name','').startswith('access-efficiency-') and recent(artifact.get('created_at')))
def safe_extract(archive,dest):
    for info in archive.infolist():
        path=Path(info.filename)
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in ['access-efficiency-evidence','access-efficiency-plan.json']:
            raise ValueError('Unsafe official artifact entry')
    archive.extractall(dest)
def prepare(plan,evidence,environment=None):
    current=fingerprint(plan);evidence.mkdir(exist_ok=True)
    token=os.environ.get('GH_TOKEN');pr=int(os.environ.get('PR_NUMBER') or 0)
    if not token or not pr:return None
    artifacts=api('/actions/artifacts?per_page=40')['artifacts']
    for artifact in artifacts:
        if not artifact['name'].startswith('access-efficiency-') or artifact['expired'] or not recent(artifact['created_at']):continue
        run=api('/actions/runs/'+str(artifact['workflow_run']['id']))
        if not valid_source(run,artifact,pr):continue
        # An eligible artifact with an invalid digest is an error, not a cue
        # to silently re-execute the same checks.
        archive=evidence/'prerequisite.zip'
        req=urllib.request.Request('https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+'/actions/artifacts/'+str(artifact['id'])+'/zip',headers={'Authorization':'Bearer '+token})
        with opener.open(req,timeout=60) as response,archive.open('wb') as output:
            while chunk:=response.read(1024*1024):output.write(chunk)
        if artifact.get('digest')!='sha256:'+sha(archive.read_bytes()):raise ValueError('Official artifact digest mismatch')
        dest=evidence/'prerequisite';dest.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as zipped:safe_extract(zipped,dest)
        archive.unlink()
        source=dest/'access-efficiency-evidence';old=json.loads((source/'checks.json').read_text())
        original=json.loads((dest/'access-efficiency-plan.json').read_text())
        for report in source.glob('*tests*.json'):
            data=json.loads(report.read_text())
            for suite in data.get('testResults',[]):
                if suite.get('status')=='failed':
                    print('PRIOR DIAGNOSTIC '+suite['name']+': '+suite.get('message','')[:6000],flush=True)
                    for assertion in suite.get('assertionResults',[]):
                        if assertion.get('status')=='failed':print(assertion['title']+': '+'\n'.join(assertion.get('failureMessages',[]))[:6000],flush=True)
        if old.get('head')!=original['head'] or artifact['name']!='access-efficiency-'+old['head'] or old.get('prNumber')!=pr or old.get('repository')!=os.environ['GITHUB_REPOSITORY']:
            raise ValueError('Official source binding mismatch')
        # Verify fingerprints against the exact uploaded Git source. GitHub
        # keeps PR merge commits fetchable even after the PR merge ref moves.
        if subprocess.run(['git','cat-file','-e',old['head']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
            subprocess.run(['git','fetch','origin',old['head']],check=True)
        if old.get('inputs')!=fingerprint(original):raise ValueError('Source input fingerprint mismatch')
        match=eligible(old,current,environment)
        if not match['builds'] and not match['tests'] and not match['extra']:continue
        loaded_archives=set()
        for component in match['builds']:
            image=old.get('builders',{}).get(component)
            if not image:raise ValueError('Qualified builder missing')
            tar=source/image['file']
            if not tar.is_file() or sha(tar.read_bytes())!=image['sha256']:raise ValueError('Builder archive mismatch')
            if str(tar) not in loaded_archives:
                process=subprocess.Popen(['zstd','-dc',str(tar)],stdout=subprocess.PIPE)
                try:subprocess.run(['docker','load'],stdin=process.stdout,check=True)
                finally:process.stdout.close()
                if process.wait()!=0:raise ValueError('Builder archive decode failed')
                loaded_archives.add(str(tar))
            loaded=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image['id']],text=True).strip()
            if loaded!=image['id']:raise ValueError('Builder ID mismatch')
        receipt={'runId':run['id'],'artifactId':artifact['id'],'artifactDigest':artifact['digest'],'source':str(source),'matches':match,'checks':old}
        (evidence/'reuse.json').write_text(json.dumps(receipt,indent=2));return receipt
    return None
