"""One immutable PR356 database phase per invocation; never an all-phases driver.

No historical report/ledger admission. Cross-job SQL/dumps must pass the official
artifact verifier before use. Importing this module performs no command or I/O.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import urlsplit, urlunsplit
import uuid

PHASES = ('schema-upgrade', 'schema-restore', 'vertical4', 'exact-worker1', 'ordinary-harness4', 'exact-lazy-current-child')
DEPENDENCIES = {'schema-restore': 'schema-upgrade', 'vertical4': 'schema-restore', 'exact-worker1': 'schema-restore', 'ordinary-harness4': 'schema-restore', 'exact-lazy-current-child': 'schema-restore'}
VS = 'dot356 registered source to real ONLINE and Training FINAL '
OSUITE = 'ordinary durable whole receipt collection boundary '
CASE_IDS = {
 'schema-upgrade': ['old-schema-230-real-final', 'candidate-schema-237-facts-preserved', 'current-reader-legacy-report', 'synthetic-upgrade-dump'],
 'schema-restore': ['official-synthetic-upgrade-artifact', 'fresh-restore-identical-facts', 'restored-current-reader', 'append-only-protection', 'schema-only-setup-and-migrations'],
 'vertical4': [VS+x for x in ['real installation, three trials, exact 21B, teacher publish, child FINAL, authorized reload and P/R', 'stores exactly one role/delegation basis and protects active use identity in PostgreSQL', 'keeps entry-role revocation separate from explicit reissue through the original exact 21B root', 'keeps admitted FINAL and durable whole receipts finishable after withdrawal and emergency stop']],
 'exact-worker1': ['accepted STANDARD whole receipt actual report-worker recovery recovers an expired real lease and completes parent/report after withdrawal without losing the accepted envelope'],
 'ordinary-harness4': [OSUITE+x for x in ['processes accepted single units after emergency stop while retaining receipt and lease identity', 'processes accepted batch units after emergency stop while retaining receipt and lease identity', 'rechecks wall-clock lease after a real job-lock wait rather than transaction start', 'rejects a new ordinary whole submission stopped before durable ACK in the receipt transaction']],
 'exact-lazy-current-child': ['actual-current-exact-child-materialization'],
}
CONTINUATIONS = ('DOT356_STANDARD_AUTHORITY_CONTINUE', 'DOT356_STANDARD_RECEIPT_CONTINUE', 'PR356_RECEIPT_WORKER_CONTINUE', 'PR356_RECEIPT_VERIFY_ONLY')

def now(): return datetime.now(timezone.utc).isoformat()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
def sha(path):
 with Path(path).open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
def save(path, value): Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
def require(condition, reason):
 if not condition: raise ValueError(reason)
def identifier(value):
 require(isinstance(value, str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value), 'Unsafe synthetic SQL identifier')
 return '"'+value+'"'
def controlled(path, root, *, exists=False):
 p = Path(path)
 require(p.is_absolute() and '..' not in p.parts, 'Explicit absolute controlled path required')
 for parent in [*reversed(p.parents), p]: require(not parent.is_symlink(), 'Controlled paths must not contain symlinks')
 require(p.resolve().is_relative_to(root.resolve()) and p.resolve() != root.resolve(), 'Path escapes RUNNER_TEMP')
 if exists: require(p.exists(), 'Required controlled input is missing')
 return p

def validate_inputs(root, inputs, tree):
 require(inputs.get('schemaVersion') == 1 and isinstance(inputs.get('files'), list) and inputs['files'], 'Nonempty phase file inputs required')
 for key in ('configuration', 'tools', 'dependencies'): require(isinstance(inputs.get(key), (dict, list)) and inputs[key], 'Nonempty '+key+' inputs required')
 validated, seen = [], set()
 for expected in inputs['files']:
  path = expected.get('path', '')
  require(isinstance(path, str) and path and not Path(path).is_absolute() and '..' not in Path(path).parts and path not in seen, 'Invalid or duplicate phase source path')
  seen.add(path); local = root/path
  require(local.is_file() and not any(p.is_symlink() for p in [local, *local.parents]) and local.resolve().is_relative_to(root.resolve()), 'Phase source missing, linked or outside checkout')
  content = local.read_bytes(); blob = hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
  mode = '100755' if local.stat().st_mode & 0o111 else '100644'
  require(tree.get(path) == (expected.get('mode'), expected.get('blob')) and mode == expected.get('mode') and blob == expected.get('blob'), 'Phase source/tree/blob drift: '+path)
  validated.append({'path': path, 'mode': mode, 'blob': blob, 'sha256': hashlib.sha256(content).hexdigest()})
 return validated

def validate_report(report, phase, source):
 required = CASE_IDS[phase]
 require(report.get('success') is True and report.get('numTotalTests') == len(required) and report.get('numPassedTests') == len(required), 'Required nonempty test count mismatch')
 for key in ('numFailedTests', 'numPendingTests', 'numTodoTests'): require(report.get(key, 0) == 0, 'Failed, skipped, filtered or todo cases are not evidence')
 suites = report.get('testResults', [])
 require(len(suites) == 1 and Path(suites[0].get('name', '')).resolve() == source.resolve() and suites[0].get('status') == 'passed', 'Wrong or failed test consumer')
 cases = suites[0].get('assertionResults', [])
 require(len(cases) == len(required) and sorted(x.get('fullName', '') for x in cases) == sorted(required) and all(x.get('status') == 'passed' for x in cases), 'Required exact case identities are missing or not passed')
 return [{'id': case, 'status': 'passed'} for case in required]

EXACT_LAZY_ASSERTIONS = ['fresh-isolated-schema','registered-source-installed-published','real-three-trials-online','lawful-use-and-flow-published','parent-start-froze-exact-candidate','form-final-advanced-without-scale-child','use-and-source-withdrawn-without-emergency','current-exact-child-written-after-withdrawal','frozen-identity-epoch-and-null-guide','reread-keeps-one-child','new-start-remains-denied']

def validate_exact_lazy_result(result, database):
 require(result.get('schemaVersion') == 1 and result.get('kind') == 'pr356-real-exact-lazy-consumer' and result.get('syntheticOnly') is True and result.get('caseId') == CASE_IDS['exact-lazy-current-child'][0] and result.get('status') == 'passed', 'Actual exact-lazy consumer did not complete')
 require(result.get('assertions') == [{'id':name,'status':'passed'} for name in EXACT_LAZY_ASSERTIONS], 'Real materialization assertions are incomplete or failed')
 observed = result.get('observed', {})
 require(observed.get('databaseName') == database and observed.get('materializedChildCount') == 1 and observed.get('trialCount') == 3 and observed.get('emergencyStopCount') == 0 and 'frozenInstruction' in observed and observed['frozenInstruction'] is None and observed.get('useRevoked') is True and observed.get('sourceWithdrawn') is True and observed.get('newStartDenied') is True, 'Actual exact-lazy identity/phase observations are incomplete')
 for key in ('parentId','itemId','childId','combinationReleaseId'): require(isinstance(observed.get(key),str) and observed[key], 'Missing actual exact-lazy identity')
 for key in ('combinationHash','flowSnapshotHash','slotSetHash','compiledRuntimeHash','sourceDefinitionHash'): require(re.fullmatch(r'[a-f0-9]{64}',observed.get(key,'')), 'Missing frozen exact-lazy hash')
 require(type(observed.get('epoch')) is int and observed['epoch'] > 0, 'Missing exact-lazy epoch')
 return [{'id':CASE_IDS['exact-lazy-current-child'][0],'status':'passed'}]

class Runner:
 def __init__(self, out, env): self.out, self.env, self.seq = out, env, 0
 def execute(self, label, args, *, cwd, env=None, stdin=None, output=None, capture=False):
  self.seq += 1; name = f'{self.seq:03d}-{label}'; logs = self.out/'commands'; logs.mkdir(exist_ok=True)
  log, started = logs/(name+'.log'), now(); data = b''; code = 127
  if stdin is not None and label == 'sql': (logs/(name+'.sql')).write_bytes(stdin)
  target = output.open('xb') if output else None
  try:
   with log.open('wb') as stream:
    try:
     result = subprocess.run([str(x) for x in args], cwd=cwd, env=env or self.env, input=stdin, stdout=target or (subprocess.PIPE if capture else stream), stderr=stream)
     code, data = result.returncode, result.stdout or b''
     if capture: stream.write(data)
    except OSError as error: stream.write(('Executor unavailable: '+type(error).__name__+'\n').encode())
  finally:
   if target: target.close()
   save(logs/(name+'.json'), {'command':[str(x) for x in args], 'cwd':str(cwd), 'exitCode':code, 'logSHA256':sha(log), 'startedAt':started, 'completedAt':now(), **({'stdinSHA256':hashlib.sha256(stdin).hexdigest(),'stdinBytes':len(stdin)} if stdin is not None else {}), **({'stdoutFile':str(output.relative_to(self.out)) if output.is_relative_to(self.out) else str(output), 'stdoutSHA256':sha(output)} if output else {})})
  require(code == 0, label+' failed; retained command exit/log')
  return data.decode() if capture else None

class DatabasePhase:
 def __init__(self, phase, env=None, root=None, runner_type=Runner):
  self.phase, self.env = phase, dict(env or os.environ)
  self.root = Path(root or Path(__file__).resolve().parents[2]).resolve(); self.back = self.root/'server-version/backend'
  require(phase in PHASES, 'Unknown database phase')
  require(self.env.get('CI') == 'true' and self.env.get('NODE_ENV') == 'test' and self.env.get('PR356_SCHEMA_ISOLATED') == '1', 'Explicit isolated Actions database job required')
  require(self.env.get('GITHUB_JOB') == 'pr356-'+phase, 'Database phase job identity mismatch')
  for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'): require(re.fullmatch(r'[1-9][0-9]*', self.env.get(key, '')), 'Official run/attempt identity required')
  require(re.fullmatch(r'[a-f0-9]{40}', self.env.get('GITHUB_SHA', '')), 'Exact Actions source SHA required')
  require(not any(self.env.get(key) == '1' for key in CONTINUATIONS), 'Continuation/verify-only journeys cannot qualify fresh phases')
  require(not self.env.get('PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS') and self.env.get('PR356_ORDINARY_RECEIPT_MODE', 'fresh') == 'fresh', 'Historical ordinary ledger inputs are forbidden')
  self.temp = Path(self.env.get('RUNNER_TEMP', ''))
  require(self.temp.is_absolute() and self.temp.is_dir() and not self.temp.is_symlink(), 'Real RUNNER_TEMP directory required')
  self.out = controlled(self.env.get('PR356_DATABASE_OUTPUT_DIR', ''), self.temp)
  if self.out.exists():
   require(self.out.is_dir(), 'Phase output must be a directory')
   names = {p.name for p in self.out.iterdir()}
   require(not names or (names == {'phase-spec.json','phase-inputs.json'} and all(p.is_file() and not p.is_symlink() for p in self.out.iterdir())
    and Path(self.env.get('PR356_PHASE_INPUTS','')).resolve() == self.out/'phase-inputs.json'
    and Path(self.env.get('PR356_PHASE_SPEC','')).resolve() == self.out/'phase-spec.json'), 'Existing phase output cannot be overwritten or silently rerun')
  else: self.out.mkdir(parents=True)
  self.runner = runner_type(self.out, self.env)
  self.started, self.checks, self.upstream = now(), [], []
  self.inputs, self.inputs_sha = {}, hashlib.sha256(canonical({})).hexdigest()
  self.log = self.out/'phase.log'; self.log.write_text('phase '+phase+'\n')
  u = urlsplit(self.env.get('DATABASE_URL', ''))
  require(u.scheme in ('postgres', 'postgresql') and u.hostname == '127.0.0.1' and u.port == 55439 and u.path == '/pr356_ci_upgrade' and not u.query and not u.fragment and re.fullmatch(r'[a-z_][a-z0-9_]*', u.username or ''), 'Dedicated loopback synthetic PostgreSQL URL required')
  self.url = u; self.container = self.env.get('PR356_POSTGRES_CONTAINER', '')
  require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', self.container), 'Explicit owned PostgreSQL service container required')
  self.docker_env = {k:v for k,v in self.env.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
  self.bindings = json.loads((self.root/'.github/scripts/pr356-bindings.json').read_text())
  require(self.env.get('GITHUB_REPOSITORY') == self.bindings['repository'], 'Repository identity mismatch')
  self.inputs_path = controlled(self.env.get('PR356_PHASE_INPUTS', ''), self.temp, exists=True)
  self.inputs = json.loads(self.inputs_path.read_text()); self.inputs_sha = hashlib.sha256(canonical(self.inputs)).hexdigest()
  self.spec_path = controlled(self.env.get('PR356_PHASE_SPEC',''), self.temp, exists=True)
  self.spec = json.loads(self.spec_path.read_text())
  require(self.spec.get('id') == phase, 'Current phase spec ID mismatch')
  require(self.spec.get('inputs') == self.inputs and self.spec.get('inputsSHA256') == self.inputs_sha and self.spec.get('jobName') == 'pr356-'+phase and self.spec.get('caseIds') == CASE_IDS[phase], 'Current phase spec/inputs/cases/job mismatch')
  self.inputs_file_sha, self.spec_file_sha = sha(self.inputs_path), sha(self.spec_path)
 def note(self, text):
  with self.log.open('a') as stream: stream.write(text+'\n')
 def run(self, label, args, **kwargs):
  self.note(label); return self.runner.execute(label, args, cwd=kwargs.pop('cwd', self.root), **kwargs)
 def git(self, *args): return self.run('git', ['git', *args], capture=True).strip()
 def bind_source(self, stage='before'):
  require(sha(self.inputs_path) == self.inputs_file_sha and sha(self.spec_path) == self.spec_file_sha, 'Phase input/spec file changed during execution')
  require(self.git('rev-parse', 'HEAD') == self.env['GITHUB_SHA'], 'Checked out source is not this official head')
  for name, expected in self.bindings['components'].items(): require(self.git('rev-parse', 'HEAD:server-version/'+name) == expected, 'Application component drift')
  raw = self.git('ls-tree', '-r', 'HEAD', '--', *[x['path'] for x in self.inputs.get('files', [])]); tree = {}
  for line in raw.splitlines():
   header, path = line.split('\t', 1); mode, kind, blob = header.split(); require(kind == 'blob', 'Non-file phase tree input'); tree[path] = (mode, blob)
  validated = validate_inputs(self.root, self.inputs, tree)
  if not hasattr(self, '_shared_verify'):
   # The producer module is import-safe for application execution. Route its
   # evidence-directory initializer only to this already-controlled output.
   previous = os.environ.get('PR356_EVIDENCE_DIR'); os.environ['PR356_EVIDENCE_DIR'] = str(self.out)
   bytecode = sys.dont_write_bytecode; sys.dont_write_bytecode = True
   try:
    spec = importlib.util.spec_from_file_location('pr356_shared_phase_inputs', Path(__file__).with_name('pr356-qualification.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    self._shared_verify = module.verify_working_inputs
   finally:
    sys.dont_write_bytecode = bytecode
    if previous is None: os.environ.pop('PR356_EVIDENCE_DIR', None)
    else: os.environ['PR356_EVIDENCE_DIR'] = previous
  def cached_git(*args):
   require(len(args) == 2 and args[0] == 'rev-parse' and args[1].startswith('HEAD:'), 'Unexpected shared input lookup')
   return tree.get(args[1][5:], ('',''))[1]
  self._shared_verify(self.inputs, root=self.root, git_reader=cached_git)
  save(self.out/('inputs-validation-'+stage+'.json'), {'inputsSHA256':self.inputs_sha, 'validatedFiles':validated})
 def db_env(self, database):
  identifier(database)
  return {**self.env, 'DATABASE_URL':urlunsplit((self.url.scheme,self.url.netloc,'/'+database,'','')), 'PR356_EVIDENCE_DIR':str(self.out), 'BACKGROUND_WORKERS_ENABLED':'false'}
 def pg(self, label, *args, stdin=None, output=None, capture=False):
  return self.run(label, ['docker','--host=unix:///var/run/docker.sock','exec',*(['-i'] if stdin is not None else []),self.container,*args], env=self.docker_env, stdin=stdin, output=output, capture=capture)
 def sql(self, database, query):
  identifier(database)
  return self.pg('sql', 'psql','-X','-v','ON_ERROR_STOP=1','-U',self.url.username,'-d',database,'-At','-f','-',stdin=query.encode(),capture=True).strip()
 def create_db(self, name): self.sql('postgres', 'CREATE DATABASE '+identifier(name))
 def columns(self, name):
  value = json.loads(self.sql(name, "SELECT json_object_agg(table_name,columns) FROM (SELECT table_name,json_agg(column_name ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' GROUP BY table_name)x"))
  require(isinstance(value, dict) and value, 'Schema tables/columns are empty'); return value
 def digests(self, name, columns):
  parts = []
  for table, cols in sorted(columns.items()):
   selected = ','.join(identifier(col) for col in cols); quoted = identifier(table)
   parts.append(f"SELECT '{table}' AS t,(SELECT count(*)::text||':'||coalesce(md5(string_agg(h,',' ORDER BY h)),'') FROM (SELECT md5(row_to_json(x)::text) h FROM (SELECT {selected} FROM public.{quoted})x)y) AS d")
  return json.loads(self.sql(name, 'SELECT json_object_agg(t,d) FROM ('+' UNION ALL '.join(parts)+') facts'))
 def migrations(self, name):
  rows = json.loads(self.sql(name, "SELECT json_agg(x ORDER BY migration_name) FROM (SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)x"))
  expected = [{'migration_name':p.parent.name, 'checksum':sha(p)} for p in sorted((self.back/'prisma/migrations').glob('*/migration.sql'))]
  require(len(rows or []) == 237 and rows == expected, 'Applied migration names/checksums do not match candidate 237'); return rows
 def reader(self, name, label):
  script = "const fs=require('node:fs');const i=JSON.parse(fs.readFileSync(process.env.PR356_EVIDENCE_DIR+'/old-report-identity.json'));const db=require('./src/config/database.ts').prisma;(async()=>{try{const r=await require('./src/modules/survey/governed-package.reports.ts').readGovernedPackageReports(i.actor,i);if(r.list.length!==i.packageReportRows||r.semantics!=='SAVED_AT_FINAL_NO_RESCORING')throw Error('Legacy report read failed')}finally{await require('./src/config/queue.ts').closeQueues(true);await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1})"
  self.run(label, [self.back/'node_modules/.bin/tsx','-e',script], cwd=self.back, env=self.db_env(name))
 def check(self, case): self.checks.append({'id':case, 'status':'passed'})
 def verify_input(self):
  expected = DEPENDENCIES[self.phase]
  directory = controlled(self.env.get('PR356_DATABASE_INPUT_DIR', ''), self.temp, exists=True)
  spec = controlled(self.env.get('PR356_DATABASE_INPUT_PHASE_SPEC', ''), self.temp, exists=True)
  result = self.run('verify-official-'+expected, ['node',self.root/'.github/scripts/pr356-artifacts.mjs','verify-local',expected,'--directory',directory,'--phase-spec',spec], capture=True)
  verified = json.loads(result)
  proof_path = controlled(verified['proofPath'], directory, exists=True)
  require(proof_path.name == 'phase-receipt.json', 'Unexpected verified upstream proof path')
  proof = json.loads(proof_path.read_text())
  require(proof.get('schemaVersion') == 1 and proof.get('kind') == 'pr356-phase-proof' and proof.get('phaseId') == expected and proof.get('status') == 'success' and proof.get('source',{}).get('repository') == self.env['GITHUB_REPOSITORY'] and proof['source'].get('head') == self.env['GITHUB_SHA'] and proof['source'].get('runId') == self.env['GITHUB_RUN_ID'], 'Verified upstream phase identity mismatch')
  files = proof.get('outputs',{}).get('files',{}); require(files, 'Verified upstream has no declared files')
  verification_path = controlled(verified['verificationReceipt'], self.temp, exists=True)
  require(verification_path == Path(str(directory)+'.verified.json'), 'Unexpected official verification receipt path')
  official = json.loads(verification_path.read_text())
  require(official.get('kind') == 'pr356-official-artifact-validation' and official.get('phaseId') == expected and official.get('role') == expected and official.get('source') == proof['source'] and official.get('proofSHA256') == sha(proof_path) and official.get('payloadFiles') == files and official.get('directory') == str(directory) and official.get('proofPath') == str(proof_path), 'Official verification receipt and payload differ')
  self.upstream = [{'phaseId':expected,'role':official['role'],'artifactId':str(official['artifact']['id']),'runId':str(official['source']['runId']),'producerAttempt':int(official['source']['producerAttempt']),'proofSHA256':official['proofSHA256'],'artifactDigest':official['artifact']['digest'],'inputsSHA256':official['inputsSHA256']}]
  def file(name):
   require(name in files, 'Required upstream output missing: '+name)
   p = controlled(str(directory/name), directory, exists=True)
   require(p.is_file() and not p.is_symlink() and p.stat().st_size == files[name]['bytes'] and sha(p) == files[name]['sha256'], 'Verified upstream file changed after official verification')
   return p
  return file
 def schema_upgrade(self):
  name = 'pr356_ci_upgrade'
  require(self.sql(name,"SELECT count(*) FROM pg_tables WHERE schemaname='public'") == '0', 'Fresh empty owned upgrade database required')
  workspace = Path(tempfile.mkdtemp(prefix='pr356-old-main-', dir=self.temp))
  try:
   archive = workspace/'main.tar'
   self.run('base-archive',['git','archive',self.bindings['base'],'server-version/backend'],output=archive)
   with tarfile.open(archive) as content: content.extractall(workspace,filter='data')
   old = workspace/'server-version/backend'; (old/'node_modules').symlink_to(self.back/'node_modules',target_is_directory=True)
   env = self.db_env(name)
   self.run('main-230-migrate',[self.back/'node_modules/.bin/prisma','migrate','deploy'],cwd=old,env=env)
   require(self.sql(name,'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL') == '230', 'Base schema is not 230')
   self.run('main-client-generate',[self.back/'node_modules/.bin/prisma','generate'],cwd=old,env=env)
   self.run('old-data-real-final',[self.back/'node_modules/.bin/tsx',self.root/'.github/scripts/pr356-restore-fixture.cjs'],cwd=old,env=env)
   old_columns = self.columns(name); before = self.digests(name,old_columns)
   require(not before['survey_package_report_artifacts'].startswith('0:'), 'Real encrypted legacy report missing')
   save(self.out/'old-data-before-upgrade.json', {'base':self.bindings['base'],'columns':old_columns,'digests':before,'containsRealFinalAndEncryptedReport':True})
   self.check('old-schema-230-real-final')
   self.run('candidate-237-migrate',[self.back/'node_modules/.bin/prisma','migrate','deploy'],cwd=self.back,env=env)
   self.run('candidate-client-generate',[self.back/'node_modules/.bin/prisma','generate'],cwd=self.back,env=env)
   migrations = self.migrations(name)
   require(self.digests(name,old_columns) == before, 'Existing facts changed during upgrade')
   require(self.sql(name,'SELECT count(*) FROM survey_package_report_artifacts WHERE budget_version IS NOT NULL') == '0', 'Legacy budget was backfilled')
   self.check('candidate-schema-237-facts-preserved'); self.reader(name,'current-reader-legacy-final'); self.check('current-reader-legacy-report')
   columns = self.columns(name); rows = self.digests(name,columns)
   save(self.out/'upgrade-facts.json', {'syntheticOnly':True,'columns':columns,'digests':rows,'migrations':migrations})
   self.pg('synthetic-upgrade-dump','pg_dump','-U',self.url.username,'--format=custom','--no-owner','--no-acl',name,output=self.out/'synthetic-upgrade.dump')
   require((self.out/'synthetic-upgrade.dump').stat().st_size > 0, 'Empty synthetic dump')
   self.check('synthetic-upgrade-dump')
  finally: shutil.rmtree(workspace)
 def schema_restore(self):
  file = self.verify_input(); facts = json.loads(file('upgrade-facts.json').read_text()); require(facts.get('syntheticOnly') is True,'Only synthetic upgrade facts may be restored')
  dump, identity = file('synthetic-upgrade.dump'), file('old-report-identity.json')
  require(json.loads(identity.read_text()).get('syntheticOnly') is True,'Only explicit synthetic report identity may be restored')
  shutil.copyfile(identity,self.out/'old-report-identity.json'); self.check('official-synthetic-upgrade-artifact')
  name = 'pr356_ci_restore'; self.create_db(name)
  self.pg('restore-upgraded-dump','pg_restore','-U',self.url.username,'--no-owner','--no-acl','--exit-on-error','-d',name,stdin=dump.read_bytes())
  require(self.digests(name,facts['columns']) == facts['digests'],'Restored rows changed')
  require(self.migrations(name) == facts['migrations'],'Restored migration metadata changed'); self.check('fresh-restore-identical-facts')
  self.reader(name,'restored-reader-legacy-final'); self.check('restored-current-reader')
  self.sql(name,"DO $$ BEGIN BEGIN UPDATE survey_package_report_artifacts SET budget_version=1; RAISE EXCEPTION 'MUTATION_WAS_ALLOWED'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Survey governed content is append-only' THEN RAISE; END IF; END; END $$;")
  require(self.digests(name,facts['columns']) == facts['digests'],'Append-only check changed restored facts'); self.check('append-only-protection')
  self.pg('schema-only-setup','pg_dump','-U',self.url.username,'--schema-only','--format=custom','--no-owner','--no-acl',name,output=self.out/'setup-schema.dump')
  self.pg('migration-history-setup','pg_dump','-U',self.url.username,'--data-only','--table=public._prisma_migrations','--no-owner','--no-acl',name,output=self.out/'migration-history.sql')
  save(self.out/'migrations.json', {'schemaVersion':1,'setupOnly':True,'applicationDataIncluded':False,'migrationCount':237,'migrations':facts['migrations'],'sourcePhase':'schema-restore'})
  self.check('schema-only-setup-and-migrations')
 def restore_setup(self, file, name):
  metadata = json.loads(file('migrations.json').read_text())
  require(metadata.get('schemaVersion') == 1 and metadata.get('setupOnly') is True and metadata.get('applicationDataIncluded') is False and metadata.get('migrationCount') == 237, 'Verified setup must contain schema and migration metadata only')
  self.create_db(name)
  self.pg('setup-schema-restore','pg_restore','--schema-only','-U',self.url.username,'--no-owner','--no-acl','--exit-on-error','-d',name,stdin=file('setup-schema.dump').read_bytes())
  self.pg('setup-migration-history','psql','-X','-v','ON_ERROR_STOP=1','-U',self.url.username,'-d',name,'-f','-',stdin=file('migration-history.sql').read_bytes())
  require(self.migrations(name) == metadata['migrations'],'Schema setup migration metadata mismatch')
  require(self.sql(name,'SELECT count(*) FROM users') == '0' and self.sql(name,'SELECT count(*) FROM composite_report_jobs') == '0','Schema-only setup unexpectedly contains application data')
  # Schema-only dumps omit migration-seeded control rows. Recreate precisely the
  # empty reports budget required by migration 20261015010000, never live queue state.
  require(self.sql(name,'SELECT count(*) FROM composite_report_queue_budget') == '0','Fresh setup already contains queue budget state')
  self.sql(name,"INSERT INTO composite_report_queue_budget (id,pending) VALUES ('reports',0)")
  require(self.sql(name,"SELECT count(*) FROM composite_report_queue_budget WHERE id='reports' AND pending=0") == '1','Migration queue budget seed missing')
 def journey(self):
  file = self.verify_input(); env = dict(self.env)
  if self.phase == 'ordinary-harness4':
   urls = {}
   for key in ('single','batch','prestop','lockwait'):
    name='pr356_ordinary_receipt_'+key+'_test_'+uuid.uuid4().hex[:10]; self.restore_setup(file,name); urls[key]=self.db_env(name)['DATABASE_URL']
   env.update(PR356_ORDINARY_RECEIPT_ISOLATED='1',PR356_ORDINARY_RECEIPT_MODE='fresh',PR356_ORDINARY_RECEIPT_DATABASE_URLS=json.dumps(urls),PR356_ORDINARY_RECEIPT_OUT=str(self.out/'ordinary-ledgers'))
   target='composite/pr356-ordinary-receipt.postgres.integration.test.ts'
  else:
   name=('eduk12_dot356_vertical_'+datetime.now(timezone.utc).strftime('%Y%m%d')+'_' if self.phase == 'vertical4' else 'pr356_receipt_recovery_test_')+uuid.uuid4().hex[:10]
   self.restore_setup(file,name); env=self.db_env(name)
   if self.phase == 'vertical4': env.update(DOT356_STANDARD_VERTICAL='1',DOT356_VERTICAL_OUTPUT=str(self.out/'vertical-observation.json'),ASSESSMENT_REPORT_ASYNC_ENABLED='false'); target='measurement-content/dot356-standard-vertical.postgres.integration.test.ts'
   else: env['PR356_RECEIPT_RECOVERY_ISOLATED']='1'; target='measurement-content/training-receipt-recovery.postgres.integration.test.ts'
  report=self.out/'tests.json'; source=self.back/'src/__tests__'/target
  self.run('whole-file-journey',[self.back/'node_modules/.bin/vitest','run',str(source.relative_to(self.back)),'--maxWorkers=1','--reporter=default','--reporter=json','--outputFile='+str(report)],cwd=self.back,env=env)
  self.checks.extend(validate_report(json.loads(report.read_text()),self.phase,source))
 def exact_lazy(self):
  file = self.verify_input()
  name = 'pr356_exact_lazy_test_'+uuid.uuid4().hex[:10]
  self.restore_setup(file,name)
  env = self.db_env(name)
  env.update(PR356_EXACT_LAZY_ISOLATED='1',PR356_EXACT_LAZY_OUTPUT=str(self.out/'exact-lazy-result.json'),PR356_DATABASE_OUTPUT_DIR=str(self.out),ASSESSMENT_REPORT_ASYNC_ENABLED='false')
  self.run('actual-current-exact-child',[self.back/'node_modules/.bin/tsx',self.root/'.github/scripts/pr356-exact-lazy-fixture.cjs'],cwd=self.back,env=env)
  self.checks.extend(validate_exact_lazy_result(json.loads((self.out/'exact-lazy-result.json').read_text()),name))
 def execute(self):
  self.bind_source('before')
  original = None
  try:
   if self.phase == 'exact-lazy-current-child': self.exact_lazy()
   elif self.phase == 'schema-upgrade': self.schema_upgrade()
   elif self.phase == 'schema-restore': self.schema_restore()
   else: self.journey()
  except Exception as error: original = error
  try: self.bind_source('after')
  except Exception as error:
   save(self.out/'post-input-validation-error.json', {'error':type(error).__name__,'reason':str(error)})
   if original is None: raise
   original.add_note('Post-input validation also failed; see retained post-input-validation-error.json')
  if original is not None: raise original
  require(sorted(x['id'] for x in self.checks) == sorted(CASE_IDS[self.phase]) and all(x['status']=='passed' for x in self.checks),'Phase case/check set incomplete')
 def proof(self, status, code, reason=None):
  outputs={}
  for path in sorted(self.out.rglob('*')):
   require(not path.is_symlink(),'Phase output symlink refused')
   if path.is_file() and path.name!='phase-receipt.json': outputs[str(path.relative_to(self.out))]={'sha256':sha(path),'bytes':path.stat().st_size}
  return {'schemaVersion':1,'kind':'pr356-phase-proof','phaseId':self.phase,'status':status,'source':{'repository':self.env.get('GITHUB_REPOSITORY',''),'runId':self.env['GITHUB_RUN_ID'],'head':self.env['GITHUB_SHA'],'producerAttempt':int(self.env['GITHUB_RUN_ATTEMPT'])},'inputs':self.inputs,'inputsSHA256':self.inputs_sha,'command':{'argv':[sys.executable,str(self.root/'.github/scripts/pr356-database.py'),self.phase],'cwd':str(self.root),'exitCode':code,'logSHA256':sha(self.log),'startedAt':self.started,'completedAt':now()},'outputs':{'files':outputs,'upstream':self.upstream},'checks':self.checks,**({'reason':reason} if reason else {})}

def main(argv=None):
 parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('phase',choices=PHASES); args=parser.parse_args(argv)
 driver=None
 try:
  driver=DatabasePhase.__new__(DatabasePhase); driver.__init__(args.phase); driver.execute(); save(driver.out/'phase-receipt.json',driver.proof('success',0)); return 0
 except Exception as error:
  code=2 if isinstance(error,NotImplementedError) else 1
  if driver is not None and hasattr(driver,'log') and driver.log.is_file():
   driver.note(type(error).__name__+': '+str(error)); save(driver.out/'phase-receipt.json',driver.proof('blocked' if code==2 else 'failure',code,str(error)))
  print('PR356 database '+args.phase+': '+str(error),file=sys.stderr); return code
if __name__=='__main__': sys.exit(main())
