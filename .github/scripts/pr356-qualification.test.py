import hashlib,importlib.util,json,os,tempfile,types,unittest,sys
sys.dont_write_bytecode=True
from pathlib import Path
from unittest.mock import patch

class IndependentProducers(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='pr356-producer-control-');self.root=Path(self.temp.name);self.out=self.root/'out';self.out.mkdir()
  self.env=patch.dict(os.environ,{'PR356_EVIDENCE_DIR':str(self.out)},clear=False);self.env.start()
  spec=importlib.util.spec_from_file_location('pr356_producer',Path(__file__).with_name('pr356-qualification.py'));self.p=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.p)
  self.p.ROOT=self.root;self.p.OUT=self.out;self.inputs={};self.git={}
  for name in ['server-version/backend/package.json','server-version/backend/package-lock.json','server-version/frontend/package.json','server-version/frontend/package-lock.json','server-version/backend/.dockerignore','server-version/frontend/.dockerignore','server-version/backend/Dockerfile','server-version/frontend/Dockerfile','.github/scripts/pr356-qualification.py']:
   file=self.root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('node_modules\ndist\n' if name.endswith('.dockerignore') else ('FROM node:24.21.0-bookworm-slim AS build\nFROM '+('nginx:1.31.6-alpine3.24-slim' if '/frontend/' in name else 'node:24.21.0-bookworm-slim')+' AS runtime\n' if name.endswith('/Dockerfile') else '{}\n'));raw=file.read_bytes();self.git[name]=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
  self.inputs={'schemaVersion':1,'files':[{'path':k,'mode':'100644','blob':v}for k,v in sorted(self.git.items())],'configuration':{'fixture':'control-only'},'tools':{'node':'24.21.0'},'dependencies':{'locks':'tracked'}}
  self.patch_git=patch.object(self.p,'git',side_effect=self.fake_git);self.patch_git.start()
 def tearDown(self):self.patch_git.stop();self.env.stop();self.temp.cleanup()
 def fake_git(self,*args):
  if args[0]=='status':return ''
  if args[0]=='ls-tree':return '\n'.join(k for k in self.git if k.startswith(args[-1]+'/'))
  if args==('rev-parse','HEAD'):return 'a'*40
  if args[0]=='rev-parse'and args[1].startswith('HEAD:'):return self.git[args[1][5:]]
  raise AssertionError(args)
 def context(self,phase):
  spec={'id':phase,'caseIds':self.p.PHASE_CASES[phase],'inputs':self.inputs,'inputsSHA256':hashlib.sha256(self.p.canonical(self.inputs).encode()).hexdigest()}
  return {'spec':spec,'inputs':self.inputs,'source':{'repository':self.p.REPOSITORY,'runId':'123','head':'a'*40,'producerAttempt':1}}
 def run_stub(self,name,args,cwd=None,env=None,check=True):
  if name=='build-frontend'and getattr(self,'fail_frontend',False):raise RuntimeError('SYNTHETIC_FRONTEND_BUILD_FAILURE')
  if name.startswith('save-'):(self.p.OUT/(name[5:]+'.tar')).write_bytes(b'synthetic immutable archive')
  if name=='extract-frontend-dist':
   (self.p.OUT/'dist').mkdir();(self.p.OUT/'dist'/'index.html').write_text('<p>control fixture</p>')
  code=1 if name=='audit-backend'and getattr(self,'audit_failure',False) else 0
  log=self.p.OUT/(name+'.log');log.write_text(json.dumps([{'Id':'sha256:'+'b'*64,'RepoDigests':[('nginx' if 'nginx' in str(args[-1]) else 'node')+'@sha256:'+'c'*64]}]) if name.endswith('-inspect') else 'stub-control-command\n')
  record={'command':[str(x)for x in args],'cwd':str(cwd or self.root),'exitCode':code,'logSHA256':hashlib.sha256(log.read_bytes()).hexdigest(),'startedAt':'2026-10-26T00:00:00Z','completedAt':'2026-10-26T00:01:00Z'}
  (self.p.OUT/(name+'.json')).write_text(json.dumps(record));return record
 def check_output_stub(self,args,**kwargs):
  if 'version'in args:return '{"Client":{"Version":"synthetic-control"}}'
  if 'inspect'in args:return json.dumps([{'Id':'sha256:'+'b'*64,'RepoDigests':['node@sha256:'+'c'*64]}])
  if 'create'in args:return 'control-container-id\n'
  raise AssertionError(args)
 def stubs(self):
  return patch.multiple(self.p,phase_context=self.context,run=self.run_stub,tool_identity=lambda name:{'version':'stub-'+name,'executableSHA256':'d'*64})
 def new_out(self,name):self.p.OUT=self.root/name;self.p.OUT.mkdir()
 def test_phase_proof_declares_explicit_empty_upstream_for_independent_producers(self):
  command={'command':['synthetic-control-only'],'cwd':str(self.root),'exitCode':0,'logSHA256':'f'*64,'startedAt':'2026-10-26T00:00:00Z','completedAt':'2026-10-26T00:00:01Z'}
  for phase in ['backend-image','frontend-image','backend-audit','frontend-audit']:
   self.new_out(phase+'-protocol');proof=self.p.phase_proof(phase,self.context(phase),command,{'files':{}})
   self.assertEqual(proof['outputs']['upstream'],[]);self.assertEqual(json.loads((self.p.OUT/'phase-receipt.json').read_text())['outputs']['upstream'],[])
 def test_complete_inputs_and_actual_worktree_bytes_are_required(self):
  c=self.context('backend-image');self.p.validate_phase_inputs('backend-image',c['spec'],self.inputs)
  (self.root/'server-version/backend/package.json').write_text('changed')
  with self.assertRaisesRegex(ValueError,'changed'):self.p.validate_phase_inputs('backend-image',c['spec'],self.inputs)
 def test_manifest_cannot_omit_the_consumed_control_driver(self):
  inputs={**self.inputs,'files':[f for f in self.inputs['files']if not f['path'].endswith('pr356-qualification.py')]};c=self.context('backend-image');c['spec']['inputs']=inputs;c['spec']['inputsSHA256']=hashlib.sha256(self.p.canonical(inputs).encode()).hexdigest()
  with self.assertRaisesRegex(ValueError,'incomplete'):self.p.validate_phase_inputs('backend-image',c['spec'],inputs)
 def test_backend_success_is_retained_when_separate_frontend_fails(self):
  with self.stubs(),patch.object(self.p.subprocess,'check_output',side_effect=self.check_output_stub),patch.object(self.p.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)):
   self.assertEqual(self.p.build_component('backend'),0);original=(self.out/'phase-receipt.json').read_bytes();proof=json.loads(original);self.assertEqual(proof['phaseId'],'backend-image');self.assertNotIn('frontend-dist',proof['outputs']['artifactFiles'])
   self.new_out('frontend-failure');self.fail_frontend=True
   with self.assertRaisesRegex(RuntimeError,'FRONTEND'):self.p.build_component('frontend')
   self.assertEqual((self.out/'phase-receipt.json').read_bytes(),original)
 def test_frontend_has_separate_full_dist_and_image_manifests(self):
  with self.stubs(),patch.object(self.p.subprocess,'check_output',side_effect=self.check_output_stub),patch.object(self.p.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)):
   self.p.build_component('frontend');proof=json.loads((self.out/'phase-receipt.json').read_text());roles=proof['outputs']['artifactFiles'];self.assertIn('frontend.tar',roles['frontend-image']);self.assertNotIn('frontend.tar',roles['frontend-dist']);self.assertIn('dist/index.html',roles['frontend-dist']);self.assertEqual(proof['source']['producerAttempt'],1)
 def test_both_audits_record_their_own_actual_failure_or_success(self):
  self.audit_failure=True
  with self.stubs():
   self.assertEqual(self.p.audit_component('backend'),1);first=json.loads((self.out/'phase-receipt.json').read_text());self.assertEqual(first['command']['exitCode'],1);self.assertEqual(first['status'],'failed')
   self.new_out('frontend-audit');self.assertEqual(self.p.audit_component('frontend'),0);last=json.loads((self.p.OUT/'phase-receipt.json').read_text());self.assertEqual(last['command']['exitCode'],0);self.assertEqual(last['status'],'success')
 def test_existing_producer_output_is_never_overwritten(self):
  (self.out/'phase-receipt.json').write_text('prior success')
  with self.assertRaisesRegex(ValueError,'not fresh'):self.p.build_component('backend')


 def test_pinned_from_materials_cover_node_and_nginx_without_changing_stage_bodies(self):
  original='# syntax=docker/dockerfile:1\nFROM node:24.21.0-bookworm-slim AS build\nRUN npm run build\nFROM nginx:1.31.6-alpine3.24-slim AS runtime\nCOPY --from=build /app/dist /usr/share/nginx/html\n'
  seen=[]
  def resolver(ref,index):
   seen.append(ref);return {'immutableReference':'docker.io/library/'+ref.split(':')[0]+'@sha256:'+str(index+1)*64}
  generated,mappings,materials=self.p.pin_dockerfile_sources(original,resolver)
  self.assertEqual(seen,['node:24.21.0-bookworm-slim','nginx:1.31.6-alpine3.24-slim']);self.assertEqual(len(mappings),2)
  self.assertIn('FROM docker.io/library/nginx@sha256:'+'2'*64+' AS runtime',generated)
  for row in mappings:generated=generated.replace(row['immutable'],row['original'])
  self.assertEqual(generated,original)
 def test_pinned_from_reuses_resolution_and_rejects_nonofficial_or_unresolved_materials(self):
  calls=[]
  def resolver(ref,index):calls.append(ref);return {'immutableReference':'docker.io/library/node@sha256:'+'1'*64}
  text='FROM node:24.21.0-bookworm-slim AS deps\nFROM deps AS build\nFROM node:24.21.0-bookworm-slim AS runtime\n'
  generated,mappings,materials=self.p.pin_dockerfile_sources(text,resolver);self.assertEqual(len(calls),1);self.assertEqual(len(mappings),2);self.assertIn('FROM deps AS build',generated)
  for text in ['FROM attacker.example/node:latest AS build\n','FROM ${BASE} AS build\n']:
   with self.assertRaises(ValueError):self.p.pin_dockerfile_sources(text,resolver)
  with self.assertRaises(ValueError):self.p.pin_dockerfile_sources('FROM node:latest AS build\n',lambda ref,index:{'immutableReference':'node:latest'})
 def test_pinned_build_command_and_receipt_record_exact_generated_dockerfile(self):
  with self.stubs(),patch.object(self.p.subprocess,'check_output',side_effect=self.check_output_stub),patch.object(self.p.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)):
   self.p.build_component('frontend');proof=json.loads((self.out/'phase-receipt.json').read_text());mapping=proof['outputs']['executionInputs']['dockerfileMaterials'];self.assertEqual(mapping['generatedSHA256'],hashlib.sha256((self.out/'Dockerfile.pinned').read_bytes()).hexdigest());self.assertEqual(len(mapping['materials']),2);self.assertIn('--file',proof['command']['argv']);self.assertNotIn('runtimeBase',proof['outputs']['executionInputs']);self.assertTrue(all('@sha256:' in row['immutable']for row in mapping['mappings']))


 def test_all_pinned_docker_operations_ignore_inherited_remote_context_and_tls(self):
  inherited={key:'synthetic-unsafe-target'for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']}
  original_run=self.run_stub
  def recorded(name,args,**kwargs):
   self.assertTrue(all(key not in kwargs.get('env',{})for key in inherited));return original_run(name,args,**kwargs)
  def output(args,**kwargs):
   self.assertTrue(all(key not in kwargs.get('env',{})for key in inherited));return self.check_output_stub(args,**kwargs)
  with patch.dict(os.environ,inherited),self.stubs(),patch.object(self.p,'run',side_effect=recorded),patch.object(self.p.subprocess,'check_output',side_effect=output),patch.object(self.p.subprocess,'run',return_value=types.SimpleNamespace(returncode=0))as removal:
   self.p.build_component('frontend');self.assertTrue(all(key not in removal.call_args.kwargs['env']for key in inherited))

if __name__=='__main__':unittest.main()
