#!/usr/bin/env python3
"""No-service fault tests for actual launcher/upgrade acceptance functions."""
import copy, importlib.util, pathlib, sys, unittest, json, ast, types, signal, subprocess, tempfile, os
sys.dont_write_bytecode = True
BASE = pathlib.Path(__file__).resolve().parent

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, BASE/file)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

p = load('preflight_tested', 'c23-checkpoint-preflight.py')
db = load('database_tested', 'c23-checkpoint-db.py')

class AcceptanceFaults(unittest.TestCase):
    def test_budget_exact_boundary_and_insufficient_disk_memory(self):
        clone=741623858; free=p.FLOOR+p.RESERVE+clone
        self.assertEqual(p.clone_budget(free,clone,p.MEMORY)['projectedFreeAfterCloneAndReserve'],p.FLOOR)
        for values in [(free-1,clone,p.MEMORY),(free,clone,p.MEMORY-1),(free,0,p.MEMORY),(free,-1,p.MEMORY)]:
            with self.assertRaises(AssertionError): p.clone_budget(*values)

    def test_old_failed_receipt_never_counts_as_c21_success(self):
        receipt={k:True for k in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified']}
        receipt['finalSnapshotSha256']='a'*64; p.source_receipt(receipt,'a'*64)
        for field in ['passed','cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified']:
            broken={**receipt,field:False}
            with self.assertRaises(AssertionError): p.source_receipt(broken,'a'*64)
        with self.assertRaises(AssertionError): p.source_receipt(receipt,'b'*64)

    def test_build_reuse_is_closed_to_c23_and_migrations(self):
        p.build_changes(['server-version/scripts/recovery/c23-checkpoint-http.py','server-version/backend/prisma/migrations/20261019050000_training_persistence/migration.sql'])
        for name in ['server-version/scripts/recovery/c21-group-ip-http.py','server-version/backend/src/index.ts','server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json']:
            with self.assertRaises(AssertionError): p.build_changes([name])

    def test_final_success_requires_all_phases_and_final_snapshot(self):
        result={k:True for k in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified']}
        result['phases']={phase:{'passed':True} for phase in p.PHASES}
        self.assertTrue(p.complete(result))
        for phase in p.PHASES:
            bad=copy.deepcopy(result);bad['phases'][phase]['passed']=False;self.assertFalse(p.complete(bad))
            bad=copy.deepcopy(result);del bad['phases'][phase];self.assertFalse(p.complete(bad))
        for key in ['cleanupVerified','sourceUnchanged','inputsUnchanged','finalSnapshotVerified']:
            self.assertFalse(p.complete({**result,key:False}))

    def upgrade_fixture(self):
        before={'columns':{'training_public_rounds':['id'],'composite_assessments':['id'],'composite_assessment_attempts':['id'],'assessment_unit_snapshots':['id']},'allPublicUserGuards':[{'table':'composite_assessments','name':'old_guard','enabled':'O','function':'retained bytes'}],'constraints':[{'name':'old_constraint','definition':'retained bytes'}]}
        after=copy.deepcopy(before);after['columns'][db.TABLE]=['attempt_id']
        for table,columns in db.ADDED.items():after['columns'][table]+=columns
        after['allPublicUserGuards'] += [{'table':table,'name':name,'enabled':'O'} for table,name in db.GUARDS]
        return before,after

    def test_upgrade_accepts_only_exact_columns_and_guard_additions(self):
        before,after=self.upgrade_fixture();db.validate_upgrade(before,after)
        for mutate in [lambda x:x['columns']['composite_assessments'].append('unknown'),lambda x:x['columns'].pop(db.TABLE),lambda x:x['allPublicUserGuards'].pop(),lambda x:x['constraints'].clear()]:
            bad=copy.deepcopy(after);mutate(bad)
            with self.assertRaises(AssertionError):db.validate_upgrade(before,bad)

    def test_upgrade_rejects_disabled_or_rewritten_old_guard(self):
        before,after=self.upgrade_fixture()
        for key,value in [('enabled','D'),('function','different bytes')]:
            bad=copy.deepcopy(after);bad['allPublicUserGuards'][0][key]=value
            with self.assertRaises(AssertionError):db.validate_upgrade(before,bad)

    def test_noemit_receipt_is_not_an_emitted_runtime_build(self):
        backend=pathlib.Path('/tmp/c23-test-backend');node=pathlib.Path('/tmp/node')
        step={'command':[str(node),'node_modules/typescript/bin/tsc'],'cwd':str(backend),'exitCode':0}
        p.emitted_build([step],backend,node)
        for change in [{'command':step['command']+['--noEmit']},{'exitCode':1},{'cwd':'/tmp/wrong'},{'command':[str(node),'arbitrary.js']}]:
            with self.assertRaises(AssertionError):p.emitted_build([{**step,**change}],backend,node)

    def test_existing_client_metadata_rejects_mismatch_without_loading_client(self):
        verify=load('verify_tested','c23-checkpoint-verify-client.py')
        schema='model Sample {\n  id String @id\n}\n'
        metadata={'models':{'Sample':{'fields':[{'name':'id','type':'String','kind':'scalar','isList':False,'isRequired':True}]}},'enums':{}}
        index='  "inlineSchema": '+json.dumps(schema)+',\n  "clientVersion": "5.22.0",\n  "engineVersion": "abc",\nconfig.runtimeDataModel = JSON.parse('+json.dumps(json.dumps(metadata))+')'
        versions={'prisma':'5.22.0','@prisma/client':'5.22.0','@prisma/engines':'5.22.0','engineCommit':'abc'}
        self.assertEqual(verify.inspect_metadata(schema,index,versions)['fields'],1)
        with self.assertRaises(AssertionError):verify.inspect_metadata(schema+'// changed',index,versions)
        with self.assertRaises(AssertionError):verify.inspect_metadata(schema,index,{**versions,'engineCommit':'wrong'})
        bad=index.replace('String','Int',1)
        with self.assertRaises(AssertionError):verify.inspect_metadata(schema,bad,versions)

    def test_model_enum_mapping_mismatch_rejected(self):
        verify=load('mapping_verify_tested','c23-checkpoint-verify-client.py')
        schema='model Sample {\n  id String @id\n  @@map("sample_table")\n}\nmodel Second {\n  id String @id\n}\nenum Choice {\n  YES @map("yes")\n  @@map("choice_enum")\n}\n'
        metadata={'models':{'Sample':{'dbName':'sample_table','fields':[{'name':'id','type':'String','kind':'scalar','isList':False,'isRequired':True}]}},'enums':{'Choice':{'dbName':'choice_enum','values':[{'name':'YES','dbName':'yes'}]}}}
        metadata['models']['Second']={'fields':[{'name':'id','type':'String','kind':'scalar','isList':False,'isRequired':True}]}
        versions={'prisma':'5.22.0','@prisma/client':'5.22.0','@prisma/engines':'5.22.0','engineCommit':'abc'}
        def index(value):return '  "inlineSchema": '+json.dumps(schema)+',\n  "clientVersion": "5.22.0",\n  "engineVersion": "abc",\nconfig.runtimeDataModel = JSON.parse('+json.dumps(json.dumps(value))+')'
        self.assertTrue(verify.inspect_metadata(schema,index(metadata),versions)['modelMappingsMatch'])
        for where,key,value in [('model','dbName','wrong_table'),('enum','dbName','wrong_enum'),('enum','values',[{'name':'NO','dbName':'yes'}])]:
            bad=copy.deepcopy(metadata);bad['models' if where=='model' else 'enums']['Sample' if where=='model' else 'Choice'][key]=value
            with self.assertRaises(AssertionError):verify.inspect_metadata(schema,index(bad),versions)

    def test_service_shutdown_nonzero_never_passes(self):
        for name in ['postgres','redis','api']:
            p.service_exit(name,0)
            for code in [1,-9,-15,None]:
                with self.assertRaises(AssertionError):p.service_exit(name,code)

    def test_process_lookup_shutdown_race_validates_real_helper_exit(self):
        source=ast.parse((BASE/'c23-checkpoint-http.py').read_text())
        function=next(n for n in ast.walk(source) if isinstance(n,ast.FunctionDef) and n.name=='stop_child')
        class Exiting:
            pid=123;returncode=None;calls=0
            def poll(self):
                self.calls+=1
                if self.calls>=3:self.returncode=1
                return self.returncode
        def vanished(*_):raise ProcessLookupError()
        errors=[];scope={'cleanup':errors,'preflight':p,'os':types.SimpleNamespace(killpg=vanished),'signal':signal,'subprocess':subprocess}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'actual-stop-child','exec'),scope)
        scope['stop_child']('postgres',Exiting())
        self.assertEqual(errors,[{'name':'postgres','error':'UnexpectedShutdownExit','returncode':1}])

    def test_actual_build_validation_rejects_interval_mutations_before_clone(self):
        source=ast.parse((BASE/'c23-checkpoint-http.py').read_text())
        names={'validate_source','dependency_manifest','validate_build'}
        functions=[n for n in ast.walk(source) if isinstance(n,ast.FunctionDef) and n.name in names]
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);backend=root/'backend';backend.mkdir();node=root/'node';node.write_text('official node test bytes')
            files={'src/index.ts':'source','prisma/schema.prisma':'schema','package.json':'{}','package-lock.json':'{}',
                   'tsconfig.json':json.dumps({'compilerOptions':{'outDir':'./dist'}}),'dist/index.js':'compiled',
                   'node_modules/.prisma/client/index.js':'client','node_modules/typescript/bin/tsc':'compiler',
                   'node_modules/typescript/lib/_tsc.js':'compiler library','node_modules/typescript/package.json':'{}'}
            for relative,value in files.items():
                file=backend/relative;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(value)
            current={'head':'a'*40,'clean':True};args=types.SimpleNamespace(expected_head=current['head'],build_receipt=root/'build.json')
            def output(command,**_):
                if command[1:3]==['rev-parse','HEAD']:return current['head']+'\n'
                if command[1]=='ls-files':return b''
                return ''
            def run(command,**_):return types.SimpleNamespace(returncode=0 if command[1]!='diff' or current['clean'] else 1)
            scope={'BACKEND':backend,'REPO':root,'BASE':BASE,'Path':pathlib.Path,'os':os,'json':json,'a':args,'node':node,
                   'sha_file':db.sha_file,'digest':db.digest,'preflight':p,'qualification_sources':['source'],
                   'subprocess':types.SimpleNamespace(check_output=output,run=run),
                   'module':lambda *_:types.SimpleNamespace(schema_agreement=lambda *_:{'schemaTokensMatch':True})}
            exec(compile(ast.Module(body=functions,type_ignores=[]),'actual-build-validator','exec'),scope)
            inputs={name:db.sha_file(backend/name) for name in files if not name.startswith(('dist/','node_modules/'))}
            client={'node_modules/.prisma/client/index.js':db.sha_file(backend/'node_modules/.prisma/client/index.js')}
            generated={'inputsUnchanged':True,'inputs':inputs,'client':client,'nodeVersion':'v24.21.0','nodeSha256':db.sha_file(node),'head':current['head'],'steps':[{'name':'prisma','exitCode':0}]}
            generated_path=root/'generated.json';generated_path.write_text(json.dumps(generated))
            build={**generated,'dependenciesUnchanged':True,'clientUnchanged':True,'dependencies':scope['dependency_manifest'](),
                   'compiler':{name:db.sha_file(backend/name) for name in files if name.startswith('node_modules/typescript/')},
                   'dist':{'dist/index.js':db.sha_file(backend/'dist/index.js')},
                   'priorPrismaReceipt':{'path':str(generated_path),'sha256':db.sha_file(generated_path)},
                   'steps':[{'command':[str(node),'node_modules/typescript/bin/tsc'],'cwd':str(backend),'exitCode':0}]}
            args.build_receipt.write_text(json.dumps(build));args.expected_build_receipt_sha256=db.sha_file(args.build_receipt)
            validate=scope['validate_build']
            def binding():return {'head':current['head'],'bytes':{str(f.relative_to(backend)):db.sha_file(f) for f in backend.rglob('*') if f.is_file()}}
            validate();self.assertEqual(p.accepted_binding(binding,validate,args.expected_head)['head'],args.expected_head)
            # Every mutation occurs AFTER earlier successful validation, BEFORE the baseline capture.
            for relative in ['src/index.ts','dist/index.js','node_modules/.prisma/client/index.js','node_modules/typescript/lib/_tsc.js','node_modules/extra.js']:
                with self.subTest(interval_mutation=relative):
                    file=backend/relative;original=file.read_bytes() if file.exists() else None;file.write_text('intervening edit')
                    cloned=[]
                    with self.assertRaises(AssertionError):
                        p.accepted_binding(binding,validate,args.expected_head);cloned.append(True)
                    self.assertEqual(cloned,[])
                    if original is None:file.unlink()
                    else:file.write_bytes(original)
            for field,value in [('head','b'*40),('clean',False)]:
                original=current[field];current[field]=value
                with self.assertRaises(AssertionError):p.accepted_binding(binding,validate,args.expected_head)
                current[field]=original

    def test_binding_rejects_mutation_during_validation(self):
        current={'head':'a'*40,'dist':'accepted'}
        def validate():current['dist']='edited during validation'
        with self.assertRaises(AssertionError):p.accepted_binding(lambda:copy.deepcopy(current),validate,current['head'])

    def test_aggregate_timeout_kills_sql_group_and_always_stops_postgres(self):
        events=[];ticks=iter([0,299,300])
        class Hung:
            pid=123;returncode=None
            def poll(self):return self.returncode
            def wait(self,timeout):events.append(('reap',timeout));self.returncode=-9
        proc=Hung();result={'passed':True}
        def audit():
            p.wait_child(proc,300,lambda:events.append('guard'),clock=lambda:next(ticks),pause=lambda _:None,killpg=lambda pid,sig:events.append(('kill',pid,sig)))
            self.fail('timed-out helper cannot yield snapshot evidence')
        p.finish_database(audit,lambda:events.append('stop-postgres'),result)
        self.assertEqual(events,['guard',('kill',123,signal.SIGKILL),('reap',5),'stop-postgres'])
        self.assertFalse(result['passed']);self.assertFalse(result['finalSnapshotVerified']);self.assertEqual(result['finalSnapshotError'],'TimeoutError')
        self.assertNotIn('finalSnapshotSha256',result)

    def test_final_audit_failure_never_fabricates_snapshot(self):
        for evidence in [{'passed':False,'mode':'final'},{'passed':True,'mode':'preserve'},
                         {'passed':True,'mode':'final','retainedFacts':{'allOriginalRowsRetained':False}}]:
            result={'passed':True};stopped=[]
            p.finish_database(lambda:evidence,lambda:stopped.append(True),result)
            self.assertFalse(result['passed']);self.assertFalse(result['finalSnapshotVerified']);self.assertEqual(stopped,[True])
            self.assertNotIn('finalSnapshotSha256',result)

    def test_client_receipt_rejects_consumed_python_helper_mutation(self):
        verify=load('client_helper_closure_tested','c23-checkpoint-verify-client.py')
        with tempfile.TemporaryDirectory() as directory:
            base=pathlib.Path(directory);helper=base/'transitive-helper.py';helper.write_text('accepted helper bytes')
            before=verify.python_helper_closure(base)
            self.assertEqual(verify.unchanged_python_helpers(before,base),before)
            helper.write_text('intervening helper mutation')
            with self.assertRaises(AssertionError):verify.unchanged_python_helpers(before,base)
            helper.write_text('accepted helper bytes');(base/'extra-helper.py').write_text('unexpected helper')
            with self.assertRaises(AssertionError):verify.unchanged_python_helpers(before,base)

    def test_shared_helpers_import_without_clone_or_services(self):
        launcher=load('launcher_tested','c23-checkpoint-http.py')
        self.assertEqual(launcher.PHASES,p.PHASES)
        self.assertEqual(launcher.m.MIGRATION,'20261019050000_training_persistence')

if __name__ == '__main__': unittest.main(verbosity=2)
