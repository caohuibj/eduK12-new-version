"""CI-only synthetic main -> candidate schema upgrade and restore; no live access."""
import os,sys,json,hashlib,subprocess,tempfile,re
from pathlib import Path
from urllib.parse import urlsplit
root=Path.cwd();binding=json.loads((root/'.github/scripts/survey-governance-bindings.json').read_text())
u=urlsplit(os.environ['DATABASE_URL'])
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_REPOSITORY')=='caohuibj/eduK12-new-version'
assert u.hostname=='127.0.0.1' and u.port==55433 and u.path=='/survey_governance_ci'
assert os.environ.get('CI_PR_NUMBER')=='354'
env={**os.environ,'PGPASSWORD':u.password or ''};base=['psql','-X','-h','127.0.0.1','-p','55433','-U',u.username,'-v','ON_ERROR_STOP=1','-At']
out=root/'survey-governance-evidence';out.mkdir(exist_ok=True)
def sql(db,text):return subprocess.check_output(base+['-d',db,'-c',text],env=env,text=True).strip()
def run(args,cwd=root,**kwargs):subprocess.run(args,cwd=cwd,env=env,check=True,**kwargs)
def receipt(name,value):(out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n')
def digests(db):
 tables=sql(db,"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename").splitlines();result={}
 for t in tables:
  assert re.fullmatch(r'[A-Za-z0-9_]+',t)
  result[t]=sql(db,f'''SELECT count(*)::text||':'||coalesce(md5(string_agg(x.h,',' ORDER BY x.h)),'') FROM (SELECT md5(row_to_json(t)::text) h FROM public."{t}" t)x''')
 return result
if sys.argv[1]=='upgrade':
 tmp=Path(tempfile.mkdtemp(prefix='survey-governance-schema-',dir=os.environ['RUNNER_TEMP']))
 paths=subprocess.check_output(['git','ls-tree','-r','--name-only',binding['base'],'server-version/backend/prisma'],text=True).splitlines()
 for p in paths:
  if not (p.endswith('schema.prisma') or '/migrations/' in p):continue
  q=tmp/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(subprocess.check_output(['git','show',binding['base']+':'+p]))
 run(['node','node_modules/prisma/build/index.js','migrate','deploy','--schema',str(tmp/'server-version/backend/prisma/schema.prisma')],root/'server-version/backend')
 sql('survey_governance_ci',"INSERT INTO users(id,username,password_hash,role,account_domain,platform_role,updated_at) VALUES('ci-history-account','ci-history-account','synthetic-only','STUDENT','SURVEY','STANDARD',now())")
 before=digests('survey_governance_ci');receipt('before-upgrade',before)
 run(['node','node_modules/prisma/build/index.js','migrate','deploy'],root/'server-version/backend')
 after=digests('survey_governance_ci');assert all(after.get(k)==v for k,v in before.items()),'Existing history changed'
 added=set(after)-set(before);assert len(added)==12,(len(added),added)
 assert all(after[t].startswith('0:') for t in added),'Migration auto-created governance data'
 receipt('upgrade-qualified',{'oldTables':len(before),'newTables':sorted(added),'oldRowsUnchanged':True,'automaticApprovalsOrGrants':0})
 for _,_,database,_ in binding['checks']['postgres']:
  assert re.fullmatch(r'survey_(alltools|triplet|permissions)_test_[a-z_]+',database)
  sql('postgres',f'CREATE DATABASE "{database}" TEMPLATE survey_governance_ci')
elif sys.argv[1]=='restore':
 source=binding['checks']['postgres'][0][2];restored='survey_governance_restore_ci'
 before=digests(source);assert any(not v.startswith('0:') for t,v in before.items() if t.startswith('survey_governed_')),'No governance rows to restore'
 container=os.environ['POSTGRES_CONTAINER'];assert re.fullmatch(r'[0-9a-f]{64}',container)
 dump=out/'synthetic-governance.dump'
 with dump.open('wb') as f:run(['docker','exec',container,'pg_dump','-U','postgres','--format=custom','--no-owner','--no-acl',source],stdout=f)
 sql('postgres','CREATE DATABASE '+restored)
 with dump.open('rb') as f:run(['docker','exec','-i',container,'pg_restore','-U','postgres','--no-owner','--no-acl','--exit-on-error','-d',restored],stdin=f)
 assert digests(restored)==before,'Restored synthetic rows differ'
 receipt('restore-qualified',{'tables':len(before),'allRowsEqual':True,'syntheticOnly':True,'dumpSHA256':hashlib.sha256(dump.read_bytes()).hexdigest()})
 dump.unlink()
else:raise ValueError('unknown stage')
