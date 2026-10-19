#!/usr/bin/env python3
"""No-service fault tests for actual launcher/upgrade acceptance functions."""
import copy, importlib.util, pathlib, sys, unittest, json
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

    def test_shared_helpers_import_without_clone_or_services(self):
        launcher=load('launcher_tested','c23-checkpoint-http.py')
        self.assertEqual(launcher.PHASES,p.PHASES)
        self.assertEqual(launcher.m.MIGRATION,'20261019050000_training_persistence')

if __name__ == '__main__': unittest.main(verbosity=2)
