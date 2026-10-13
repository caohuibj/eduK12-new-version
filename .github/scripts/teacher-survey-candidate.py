"""PR295 exact frontend producer; official proof is verified, never fabricated."""
import hashlib,json,os,subprocess,tempfile,time,urllib.request,urllib.parse,zipfile,datetime
from pathlib import Path
p=json.loads(Path('teacher-survey-plan.json').read_text());assert p['route']=='teacher-survey' and p['changed']==['frontend']
e=Path('teacher-survey-evidence');e.mkdir(exist_ok=True)
prior={}
c={'head':p['head'],'frontendTree':p['frontendTree'],'backendTree':p['backendTree'],'phases':[],'proof':{},'prNumber':int(os.environ['PR_NUMBER']),'repository':os.environ['GITHUB_REPOSITORY']}
def run(args,timeout=900):subprocess.run(args,check=True,timeout=timeout)
def output(args):return subprocess.check_output(args,text=True).strip()
def phase(name,fn):
 start=time.monotonic();status='failure'
 try:fn();status='success'
 finally:c['phases'].append({'name':name,'status':status,'seconds':round(time.monotonic()-start,2)});(e/'checks.json').write_text(json.dumps(c,indent=2))
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*a):return subprocess.check_output(['git',*a])
def api(path):
 url='https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']+path
 return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'}),timeout=30))
def recent(at):
 age=datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(at.replace('Z','+00:00'));return datetime.timedelta(0)<=age<datetime.timedelta(hours=24)
def evidence():
 global prior
 ref=p['proof']['lintTypes'];run_info=api('/actions/runs/'+str(ref['run']));job=api('/actions/jobs/'+str(ref['job']))
 assert run_info['event']=='pull_request' and run_info['path']=='.github/workflows/ci.yml' and run_info['head_sha']==ref['source'] and run_info['head_branch']=='codex/teacher-survey-local-fixes-20261013'
 assert run_info['conclusion']=='success' and job['conclusion']=='success' and job['run_id']==ref['run'] and job['name']=='PR light / frontend lint + typecheck' and recent(job['completed_at'])
 for name in ['npm ci','lint','typecheck']:
  assert any(x['name']==name and x['conclusion']=='success' for x in job['steps'])
 run(['git','fetch','origin',ref['source']],60)
 oldtree=output(['git','rev-parse',ref['source']+':server-version/frontend'])
 if oldtree!=p['frontendTree']:
  delta=ref['accessibleTableDelta'];assert delta=='server-version/frontend/src/survey/SurveyAnalyticsWorkspace.tsx'
  assert output(['git','diff','--name-only',ref['source'],p['head'],'--','server-version/frontend'])==delta
  before=git('show',ref['source']+':'+delta);after=Path(delta).read_bytes()
  attrs=b' tabIndex={0} role="region" aria-label="'+bytes.fromhex('e7a094e7a9b6e6b3a2e6aca1e5ae8ce68890e7bb9fe8aea1')+b'"'
  assert after.count(attrs)==1 and after.replace(attrs,b'')==before
  c['typeDeltaFile']=delta

 def block(text):return text.split(b'  pr-light-frontend:\n',1)[1].split(b'  post-merge-smoke:\n',1)[0]
 before=block(git('show',ref['source']+':.github/workflows/ci.yml'));after=block(Path('.github/workflows/ci.yml').read_bytes());assert before==after
 assert b"node-version: '24.21.0'" in after and b'ubuntu-24.04' in after
 c['proof']['lintTypes']={'status':'REUSED','runId':ref['run'],'jobId':ref['job'],'frontendTree':p['frontendTree'],'commandFingerprint':sha(after),'source':ref['source']}
 backend=p['proof']['backend'];meta=api('/actions/artifacts/'+str(backend['artifact']));producer=api('/actions/runs/'+str(backend['run']));assert producer['conclusion']=='success' and producer['event']=='pull_request' and producer['path']=='.github/workflows/ci.yml' and producer['head_branch']=='codex/access-efficiency-followup-20261013'
 assert not meta['expired'] and recent(meta['created_at']) and meta['workflow_run']['id']==backend['run'] and meta['name'].startswith('access-diagnostics-')
 # Follow the signed official archive URL without forwarding the API token.
 class Redirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,req,fp,code,msg,headers,newurl):
   assert urllib.parse.urlparse(newurl).scheme=='https';result=super().redirect_request(req,fp,code,msg,headers,newurl)
   if urllib.parse.urlparse(newurl).hostname!='api.github.com':result.remove_header('Authorization')
   return result
 request=urllib.request.Request(meta['archive_download_url'],headers={'Authorization':'Bearer '+os.environ['GH_TOKEN']})
 data=urllib.request.build_opener(Redirect()).open(request,timeout=60).read();assert meta['digest']=='sha256:'+sha(data)
 archive=e/'backend-proof.zip';archive.write_bytes(data)
 with zipfile.ZipFile(archive) as z:old=json.loads(z.read('access-efficiency-evidence/checks.json'))
 assert old['prNumber']==294 and old['repository']==os.environ['GITHUB_REPOSITORY'] and old['head']==backend['source'] and old['components']['backend']==p['backendTree']
 run(['git','fetch','origin',backend['source']],60)
 assert output(['git','rev-parse',backend['source']+':server-version/backend'])==p['backendTree']
 prior=old
 assert old['compile']['backend']['status']=='success' and old['runtime']['backend']['status']=='success'
 c['proof']['backend']={'status':'REUSED','artifactId':backend['artifact'],'runId':backend['run'],'backendTree':p['backendTree'],'officialDigest':meta['digest'],'image':old['runtime']['backend']['id'],'rebuilt':False}
phase('bound-official-input-proof',evidence)
c['candidateBlob']=output(['git','rev-parse','HEAD:.github/scripts/teacher-survey-candidate.py'])
c['contractDigest']=sha(Path('.github/scripts/teacher-survey-contracts.test.tsx').read_bytes())

def compiler_fingerprint(source):
 # Test-phase revisions do not consume the compiler. Bind its exact helpers,
 # frozen Dockerfile transformation, command, configuration and archive code.
 fragments=[source.split('def run(',1)[1].split('def api(',1)[0],source.split('def archive_images():',1)[1].split("tag='eduk12-teacher-survey:'",1)[0],source.split("tag='eduk12-teacher-survey:'",1)[1].split(" c['builder']=output",1)[0]]
 return sha(''.join(fragments).encode())
c['compilerFingerprint']=compiler_fingerprint(Path('.github/scripts/teacher-survey-candidate.py').read_text())
reuse=None
# Only this same PR's official artifact with matching consumed inputs qualifies.
for meta in sorted(api('/actions/artifacts?per_page=30')['artifacts'],key=lambda x:x['created_at'],reverse=True):
 if not meta['name'].startswith('teacher-survey-') or meta['expired'] or not recent(meta['created_at']):continue
 producer=api('/actions/runs/'+str(meta['workflow_run']['id']))
 if producer['event']!='pull_request' or producer['path']!='.github/workflows/ci.yml' or producer['head_branch']!='codex/teacher-survey-local-fixes-20261013':continue
 class Redirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,req,fp,code,msg,headers,newurl):
   assert urllib.parse.urlparse(newurl).scheme=='https';result=super().redirect_request(req,fp,code,msg,headers,newurl)
   if urllib.parse.urlparse(newurl).hostname!='api.github.com':result.remove_header('Authorization')
   return result
 request=urllib.request.Request(meta['archive_download_url'],headers={'Authorization':'Bearer '+os.environ['GH_TOKEN']})
 archive=e/'previous.zip'
 with urllib.request.build_opener(Redirect()).open(request,timeout=60) as src,archive.open('wb') as target:
  while chunk:=src.read(1024*1024):target.write(chunk)
 h=hashlib.sha256()
 with archive.open('rb') as src:
  for chunk in iter(lambda:src.read(8*1024*1024),b''):h.update(chunk)
 assert meta['digest']=='sha256:'+h.hexdigest(),'official candidate ZIP mismatch'
 with zipfile.ZipFile(archive) as zipped:
  old=json.loads(zipped.read('teacher-survey-evidence/checks.json'))
  assert old['repository']==os.environ['GITHUB_REPOSITORY'] and old['prNumber']==c['prNumber'] and meta['name']=='teacher-survey-'+old['head']
  if old.get('frontendTree')!=c['frontendTree'] or not old.get('builder'):continue
  run(['git','fetch','origin',old['head']],60)
  producer_source=git('show',old['head']+':.github/scripts/teacher-survey-candidate.py').decode()
  if compiler_fingerprint(producer_source)!=c['compilerFingerprint']:continue
  assert output(['git','rev-parse',old['head']+':server-version/frontend'])==c['frontendTree']
  if not any(x['name']=='frontend-build-once' and x['status']=='success' for x in old['phases']):continue
  member='teacher-survey-evidence/images.tar.zst';assert member in zipped.namelist();zipped.extract(member,e/'previous')
 tar=e/'previous'/member;h=hashlib.sha256()
 with tar.open('rb') as src:
  for chunk in iter(lambda:src.read(8*1024*1024),b''):h.update(chunk)
 assert h.hexdigest()==old['archiveSha256']
 decoder=subprocess.Popen(['zstd','-dc',str(tar)],stdout=subprocess.PIPE)
 try:subprocess.run(['docker','load'],stdin=decoder.stdout,check=True)
 finally:decoder.stdout.close()
 assert decoder.wait()==0
 assert output(['docker','image','inspect','--format','{{.Id}}',old['builder']])==old['builder']
 if old.get('image'):assert output(['docker','image','inspect','--format','{{.Id}}',old['image']])==old['image']
 
 old_test=git('show',old['head']+':.github/scripts/teacher-survey-contracts.test.tsx').decode();(e/'previous-contract.tsx').write_text(old_test)
 with zipfile.ZipFile(archive) as zipped:
  if 'teacher-survey-evidence/contracts.json' in zipped.namelist():(e/'previous-contracts.json').write_bytes(zipped.read('teacher-survey-evidence/contracts.json'))
 reuse=old;c['proof']['candidatePhases']={'artifactId':meta['id'],'runId':producer['id'],'digest':meta['digest'],'source':old['head']};break

def archive_images():
 ids=[c['builder']]+([c['image']] if c.get('image') else [])
 target=e/'images.tar.zst';save=subprocess.Popen(['docker','save',*ids],stdout=subprocess.PIPE)
 try:
  with target.open('wb') as f:subprocess.run(['zstd','-T2','-1','-c'],stdin=save.stdout,stdout=f,check=True,timeout=300)
 finally:save.stdout.close()
 assert save.wait()==0;h=hashlib.sha256()
 with target.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 c['archiveSha256']=h.hexdigest();(e/'checks.json').write_text(json.dumps(c,indent=2))
tag='eduk12-teacher-survey:'+p['head'];builder=tag+'-build'
with tempfile.TemporaryDirectory(prefix='teacher-survey-') as temp:
 lines=[];c['bases']={}
 for line in Path('server-version/frontend/Dockerfile').read_text().splitlines():
  fields=line.split()
  if len(fields)>1 and fields[0].upper()=='FROM' and ':' in fields[1]:
   image=fields[1];digest=prior['bases'][image];run(['docker','pull',digest],300);c['bases'][image]=digest;line=line.replace(image,digest,1)
  lines.append(line)
 dockerfile=Path(temp)/'Dockerfile';dockerfile.write_text('\n'.join(lines)+'\n')
 args=['docker','buildx','build','--load','-f',str(dockerfile),'--label','org.opencontainers.image.revision='+p['head'],'--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true']
 if reuse:
  run(['docker','tag',reuse['builder'],builder]);c['phases'].append({'name':'frontend-build-once','status':'success','reusedFrom':c['proof']['candidatePhases']})
 else:phase('frontend-build-once',lambda:run(args+['--target','build','-t',builder,'server-version/frontend']))
 c['builder']=output(['docker','image','inspect','--format','{{.Id}}',builder]);archive_images()
 if c.get('typeDeltaFile'):
  config=Path(temp)/'tsconfig.review-delta.json';config.write_text(json.dumps({'extends':'./tsconfig.app.json','include':['src/survey/SurveyAnalyticsWorkspace.tsx','src/vite-env.d.ts'],'references':[]}))
  if reuse and any(x['name']=='only-accessible-table-delta-lint-types' and x['status']=='success' for x in reuse['phases']):c['phases'].append({'name':'only-accessible-table-delta-lint-types','status':'success','reusedFrom':c['proof']['candidatePhases']})
  else:phase('only-accessible-table-delta-lint-types',lambda:run(['docker','run','--rm','-v',str(config)+':/app/tsconfig.review-delta.json:ro',builder,'sh','-ec','npx eslint src/survey/SurveyAnalyticsWorkspace.tsx && npx tsc -p tsconfig.review-delta.json --noEmit']))

 if reuse and reuse.get('contractDigest')==c['contractDigest'] and any(x['name']=='affected-ui-contracts' and x['status']=='success' for x in reuse['phases']):c['phases'].append({'name':'affected-ui-contracts','status':'success','reusedFrom':c['proof']['candidatePhases']})
 else:
  missing=[]
  if reuse and (e/'previous-contracts.json').is_file():
   # TypeScript AST identifies exact test bodies and a shared fixture context.
   program="""import ts from './.github/release-tools/node_modules/typescript/lib/typescript.js';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const hash=x=>createHash('sha256').update(x).digest('hex');const parse=path=>{const text=readFileSync(path,'utf8'),source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(source.parseDiagnostics.length)throw Error('invalid contract source');let cases={},ranges=[];const walk=n=>{if(ts.isCallExpression(n)&&n.expression.getText(source)==='it'&&ts.isStringLiteral(n.arguments[0])){cases[n.arguments[0].text]=n.getText(source);ranges.push([n.getStart(source),n.end]);return}ts.forEachChild(n,walk)};walk(source);let shared=text;for(const[a,b]of ranges.sort((x,y)=>y[0]-x[0]))shared=shared.slice(0,a)+shared.slice(b);return{shared:hash(shared),cases:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,hash(v)]))}};const old=parse('teacher-survey-evidence/previous-contract.tsx'),now=parse('.github/scripts/teacher-survey-contracts.test.tsx');console.log(JSON.stringify({old,now}));"""
   parts=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],text=True));report=json.loads((e/'previous-contracts.json').read_text());passed={a['title'] for suite in report['testResults'] for a in suite.get('assertionResults',[]) if a['status']=='passed'}
   for title,digest in parts['now']['cases'].items():
    if parts['old']['shared']!=parts['now']['shared'] or parts['old']['cases'].get(title)!=digest or title not in passed:missing.append(title)
   c['proof']['contractCases']={'reused':[t for t in parts['now']['cases'] if t not in missing],'rerun':missing,'sharedFixtureDigest':parts['now']['shared'],'source':c['proof']['candidatePhases']}
  command=['docker','run','--rm','-v',str(Path('.github/scripts/teacher-survey-contracts.test.tsx').resolve())+':/app/src/review-contracts.test.tsx:ro','-v',str(e.resolve())+':/evidence',builder,'npx','vitest','run','src/review-contracts.test.tsx','--maxWorkers=2','--reporter=json','--outputFile=/evidence/contracts.json']
  if missing:
   import re
   command+=['-t','|'.join('^'+re.escape(t)+'$' for t in missing)]
  if reuse and not missing and c['proof'].get('contractCases'):c['phases'].append({'name':'affected-ui-contracts','status':'success','reusedFrom':c['proof']['candidatePhases']})
  else:phase('affected-ui-contracts',lambda:run(command))

 # Audit consumes dependency/config/build base inputs, not unrelated JSX text.
 for file in ['package.json','package-lock.json','Dockerfile']:
  assert git('show',p['proof']['backend']['source']+':server-version/frontend/'+file)==Path('server-version/frontend/'+file).read_bytes()
 assert prior['audit']['frontend']['status']=='success' and recent(prior['audit']['frontend']['at'])
 assert c['bases']['node:24.21.0-bookworm-slim']==prior['environment']['node']
 c['proof']['audit']={'status':'REUSED','artifactId':p['proof']['backend']['artifact'],'dependencyLock':sha(Path('server-version/frontend/package-lock.json').read_bytes()),'base':prior['environment']['node'],'at':prior['audit']['frontend']['at']}

 if reuse and reuse.get('image'):
  run(['docker','tag',reuse['image'],tag]);c['phases'].append({'name':'runtime-from-same-build-cache','status':'success','reusedFrom':c['proof']['candidatePhases']})
 else:
  runtime_file=Path(temp)/'Dockerfile.runtime';runtime_file.write_text('FROM '+c['builder']+' AS build\n'+dockerfile.read_text().split('FROM nginx',1)[1].join(['FROM nginx','']) if False else 'FROM '+c['builder']+' AS build\nFROM nginx'+dockerfile.read_text().split('FROM nginx',1)[1])
  phase('runtime-from-same-build-cache',lambda:run(['docker','buildx','build','--builder','default','--load','-f',str(runtime_file),'--label','org.opencontainers.image.revision='+p['head'],'--target','runtime','-t',tag,'server-version/frontend']))
c['image']=output(['docker','image','inspect','--format','{{.Id}}',tag]);archive_images()
