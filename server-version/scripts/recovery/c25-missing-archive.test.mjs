/** Only new 6651-row archive composition; no tar/extraction/service is run. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {pythonProgram} from './c25-missing-archive.mjs'
function contract(body){const program="import json,sys\nfrom unittest import mock\npayload=json.load(sys.stdin)\nscope={'__name__':'missing_archive_contract'}\nwith mock.patch('subprocess.Popen',side_effect=AssertionError('definition import spawned')):\n exec(compile(payload['source'],'<actual-missing-archive>','exec'),scope)\nexec(compile(payload['body'],'<missing-archive-fault>','exec'),scope)\n";const r=spawnSync(process.env.C25_TEST_PYTHON??'python3',['-B','-c',program],{input:JSON.stringify({source:pythonProgram,body}),encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr||r.stdout)}

test('new recovery point requires the real second failure and exact third baseline, never rewrites history',()=>contract(String.raw`
import copy
r=json.loads((PRIOR/'c25-continuation-result.json').read_text());s=json.loads((PRIOR/'c25-continuation-final-db-snapshot.json').read_text());a=json.loads((PRIOR/'c25-continuation-audit-final-result.json').read_text())
validate_prior_facts(r,s,a)
for kind in ['success','phase','row','checkpoint','first-layer','second-layer','exit']:
 rr,ss,aa=copy.deepcopy((r,s,a))
 if kind=='success':rr['passed']=True
 elif kind=='phase':rr['executedPhases'].append('scheduled')
 elif kind=='row':ss['projection']['training_attempt_checkpoints']['rows']-=1
 elif kind=='checkpoint':ss['projection']['training_attempt_checkpoints']['rows']+=1
 elif kind=='first-layer':aa['retainedFacts']['oldRows']=0
 elif kind=='second-layer':aa['continuationRetainedFacts']['oldRows']=0
 else:rr['processExits']['api']=1
 try:validate_prior_facts(rr,ss,aa)
 except AssertionError:pass
 else:raise AssertionError('invalid prior accepted: '+kind)
`))
test('new archive keeps both old evidence roots and historical temporary recovery materials in verification',()=>contract(String.raw`
import ast
source=SOURCE_TEXT
nodes=ast.parse(source).body
verify=next(n for n in nodes if isinstance(n,ast.FunctionDef) and n.name=='verify_recovery_descriptor')
text=ast.unparse(verify)
for term in ['priorContinuationManifest','historicalRecoveryManifest','fullFailureManifest','frozenFailureManifest','check_data','producer_binding','stopped_current']:
 assert term in text,term
assert OUTPUT==Path('/tmp/c25-missing-recovery-01')
assert PRIOR.name=='eduk12_c25_continuation_01' and SOURCE.name=='eduk12_c25_http_01'
assert SCOPE=='C25_MISSING_ONLY_6651_ROW_NODE_LOCAL_TEMPORARY_RECOVERY_NOT_DURABLE_BACKUP'
try:output_path(Path('/tmp/not-the-approved-missing-archive'),Path('/tmp/source/descriptor.json'))
except AssertionError:pass
else:raise AssertionError('foreign archive target accepted')
`.replace('source=SOURCE_TEXT','source='+JSON.stringify(pythonProgram))))
