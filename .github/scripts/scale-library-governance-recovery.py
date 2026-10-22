"""Bounded synthetic migration/restore only; never accepts external database URLs.
Caller owns the disposable PostgreSQL container and same-head backend builder.
No application tests or compilers are invoked here.
"""
import hashlib,json,os,subprocess,sys,tarfile
from pathlib import Path
BASE='aabbe049773b6b5b910f0d584a843180052ba4ed'
CONTAINER='scale-library-governance-postgres'
DATABASE='ptool'
RESTORE='governance_restore_test'
ROOT=Path(os.environ['GITHUB_WORKSPACE'])
PRIVATE=Path(os.environ['RUNNER_TEMP'])/'scale-library-governance-private'
EVIDENCE=ROOT/'scale-library-governance-evidence'/'postgres'
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('CI')=='true'
assert os.environ.get('SCALE_GOVERNANCE_ISOLATED')=='1'
IMAGE='scale-library-governance-backend-builder:'+os.environ['GITHUB_SHA']
URL='postgresql://ptool:ptool123@127.0.0.1:5432/ptool?schema=public'
assert os.environ['DATABASE_URL']==URL
PRIVATE.mkdir(mode=0o700,parents=True,exist_ok=True)
assert PRIVATE.resolve()==PRIVATE and PRIVATE.stat().st_mode&0o077==0
EVIDENCE.mkdir(parents=True,exist_ok=True)
def run(args,**kwargs):return subprocess.run(args,check=True,timeout=300,**kwargs)
def sql(query,db=DATABASE):
 return subprocess.check_output(['docker','exec',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-U','ptool','-d',db,'-Atc',query],text=True,timeout=60).strip()
def migrate(schema):
 run(['docker','run','--rm','--network','host','-e','DATABASE_URL='+URL,'-v',str(PRIVATE)+':'+str(PRIVATE)+':ro',IMAGE,'npx','prisma','migrate','deploy','--schema',schema])
def snapshot(db):
 # Synthetic data only. Record digests/counts, never user/asset or secret rows.
 tables=['users','stored_assets','asset_references','material_grants','content_capability_grants','survey_tool_grants','survey_projects','scales','assessments','measurement_content_releases','scale_library_submissions','scale_library_entries','scale_library_use_grants','scale_library_events','scale_library_emergency_stops','scale_library_media']
 result={}
 for table in tables:
  order='target_kind,target_id' if table=='scale_library_emergency_stops' else 'id'
  result[table]=json.loads(sql("SELECT json_build_object('count',count(*),'digest',md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY "+order+"),''))) FROM "+table+' t',db))
 return result
mode=sys.argv[1]
if mode=='bootstrap':
 assert sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")=='0','Fresh service database required'
 legacy=PRIVATE/'legacy';legacy.mkdir()
 archive=PRIVATE/'legacy-prisma.tar'
 with archive.open('wb') as out:run(['git','archive',BASE,'server-version/backend/prisma'],cwd=ROOT,stdout=out)
 with tarfile.open(archive) as package:package.extractall(legacy,filter='data')
 migrate(str(legacy/'server-version/backend/prisma/schema.prisma'))
 seed=ROOT/'server-version/backend/scripts/scale-library-governance-legacy-fixture.sql'
 assert seed.is_file(),'Reviewed old-schema synthetic fixture is required'
 run(['docker','exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-U','ptool','-d',DATABASE],input=seed.read_bytes())
 before=sql("SELECT md5(row_to_json(t)::text) FROM (SELECT id,code,name,status,visibility,definition,definition_hash,measurement_release_id FROM scales WHERE code='GOVERNANCE_LEGACY_CI') t")
 assert before,'Old published synthetic scale must exist'
 historical={table:sql("SELECT md5(row_to_json(t)::text) FROM "+table+" t WHERE id='"+identity+"'") for table,identity in [('measurement_content_releases','21000000-0000-4000-8000-000000000003'),('assessments','21000000-0000-4000-8000-000000000004')]}
 assert all(historical.values())
 migrate('/app/prisma/schema.prisma')
 after=sql("SELECT md5(row_to_json(t)::text) FROM (SELECT id,code,name,status,visibility,definition,definition_hash,measurement_release_id FROM scales WHERE code='GOVERNANCE_LEGACY_CI') t")
 assert before==after,'Migration changed historical source bytes'
 for table,identity in [('measurement_content_releases','21000000-0000-4000-8000-000000000003'),('assessments','21000000-0000-4000-8000-000000000004')]:
  assert sql("SELECT md5(row_to_json(t)::text) FROM "+table+" t WHERE id='"+identity+"'")==historical[table],table
 assert sql("SELECT legacy_public_access AND authoring_family_id IS NULL AND authoring_version IS NULL AND source_scale_id IS NULL FROM scales WHERE code='GOVERNANCE_LEGACY_CI'")=='t'
 (EVIDENCE/'migration.json').write_text(json.dumps({'status':'PASS','base':BASE,'historicalScaleDigest':before,'historicalReleaseAndAssessmentDigests':historical,'legacyPublishedPublicPreserved':True,'lineageNotInvented':True}))
elif mode=='restore':
 before=snapshot(DATABASE)
 assert all(before[t]['count']>0 for t in ['scale_library_submissions','scale_library_entries','scale_library_use_grants','scale_library_events','scale_library_emergency_stops','scale_library_media']),'PG contracts must create actual new-schema evidence'
 dump=PRIVATE/'synthetic-governance.dump'
 with dump.open('wb') as out:run(['docker','exec',CONTAINER,'pg_dump','-U','ptool','-d',DATABASE,'--format=custom','--no-owner','--no-acl'],stdout=out)
 assert dump.stat().st_size>0
 sql('CREATE DATABASE '+RESTORE)
 with dump.open('rb') as inp:run(['docker','exec','-i',CONTAINER,'pg_restore','-U','ptool','-d',RESTORE,'--exit-on-error','--no-owner','--no-acl'],stdin=inp)
 after=snapshot(RESTORE);assert before==after
 assert sql("SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL",RESTORE)=='0'
 (EVIDENCE/'restore.json').write_text(json.dumps({'status':'PASS','scope':'full isolated synthetic DB dump; exact governance, parent authorization/asset references, frozen scale/release and completed assessment identity verification only','dumpSHA256':hashlib.sha256(dump.read_bytes()).hexdigest(),'tables':after,'productionRecoveryClaim':False},indent=2))
 dump.unlink()
else:raise ValueError('Explicit bootstrap or restore required')
