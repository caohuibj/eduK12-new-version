/** Exact current 6708/6719 admission and final protection. No restore exception,
 * migration, write, service or fixture creation. Outer controller bounds each child. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {INLINE_PYTHON as oldProgram} from './c25-c26-db.mjs'
export const STATE='/workspace/scratch/5a77e8bdc1ae/eduk12_c26_analysis_abba_02'
export const INLINE_PYTHON=String.raw`
import argparse,hashlib,json,os,sys,traceback
from pathlib import Path
sys.dont_write_bytecode=True
old={'__name__':'analysis_original_readonly_helpers'}
exec(compile(${JSON.stringify(oldProgram)},'<original-c26-audit>','exec'),old)
sha_file,digest,private_file,private_json,load_helper=(old[k] for k in ['sha_file','digest','private_file','private_json','load_helper'])
ROOT=Path('/workspace/scratch/5a77e8bdc1ae');STATE=Path(${JSON.stringify(STATE)})
WORKING,PRIMARY='eduk12_c25_joint_restore','eduk12_recovery'
A07=ROOT/'eduk12_c26_a_07'
PINS={
 A07/'c25-c26-audit-final-rows-private.json':'711f9732a0bbb2605c2c7eff833f79b315f19ae7b3d1dbc90a4a1c7f1db53d6b',
 A07/'c25-c26-final-db-snapshot.json':'f3b2837a0d6079899405f917a6231151d74536061809e171c09e7b5cf35b1728',
 A07/'c25-c26-audit-final-primary-db-snapshot.json':'f4e761419f5faf4a84befef265b4edff45d49d5a1d16a89cc09d039b1eed34b4'}
def read_pinned():
 for p,h in PINS.items():assert sha_file(private_file(p))==h,'fixed current logical baseline changed'
 rows,snapshot,primary=[json.loads(p.read_text()) for p in PINS]
 assert rows['snapshot']==snapshot and sum(len(r) for r in rows['rows'].values())==6719 and len(rows['rows'])==217
 assert sum(r['rows'] for r in primary['projection'].values())==6708
 return rows,snapshot,primary

def exact_rows(actual,expected,helper):
 assert actual['snapshot']==expected['snapshot'],'exact live schema/complete snapshot differs'
 assert set(actual['rows'])==set(expected['rows']) and len(actual['rows'])==217
 for table,rows in expected['rows'].items():assert helper.row_counter(actual['rows'][table])==helper.row_counter(rows),'complete logical rows differ: '+table
 assert sum(map(len,actual['rows'].values()))==6719
 return {'allRowsExact':True,'allColumnsExact':True,'liveSchemaExact':True,'tables':217,'workingRows':6719,'workingCheckpoints':len(actual['rows']['training_attempt_checkpoints']),'noAddedOrRemovedRows':True,'restoreNormalizationApplied':False}

def main():
 p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('--mode',choices=['baseline','final'],required=True);a=p.parse_args()
 os.umask(0o077);assert a.state==STATE and STATE.is_dir() and STATE.stat().st_mode&0o777==0o700
 assert all(not q.is_symlink() for q in [STATE,*STATE.parents])
 label='c25-c26-audit-'+a.mode;result={'schemaVersion':1,'passed':False,'scope':'ANALYSIS_ONLY_EXACT_CURRENT_6708_6719','mode':a.mode,'databaseReadOnly':True,'restoreNormalizationApplied':False};db=None;error=None
 try:
  expected,snapshot,primary_expected=read_pinned();helper=load_helper(old['DB_HELPER']);db=helper.Database(a.tools,STATE);db.env['PGOPTIONS']+=' -c default_transaction_read_only=on'
  current_snapshot=db.snapshot(WORKING);snapshot_path=STATE/(label+'-db-snapshot.json');private_json(snapshot_path,current_snapshot)
  rows=db.rows(current_snapshot['columns'],WORKING);capture={'schemaVersion':1,'snapshot':current_snapshot,'rows':rows};rows_path=STATE/('c25-c26-protected-rows-private.json' if a.mode=='baseline' else label+'-rows-private.json');private_json(rows_path,capture)
  primary=db.snapshot(PRIMARY);primary_path=STATE/(label+'-primary-db-snapshot.json');private_json(primary_path,primary)
  result.update(snapshotSha256=sha_file(snapshot_path),rowsFile={'path':str(rows_path),'sha256':sha_file(rows_path)},snapshotFile={'path':str(snapshot_path),'sha256':sha_file(snapshot_path)},primarySnapshotFile={'path':str(primary_path),'sha256':sha_file(primary_path)})
  # Every complete live capture is durable before preservation assertions.
  old['assert_quiescent'](db);facts=exact_rows(capture,expected,helper);assert primary==primary_expected,'primary changed'
  if a.mode=='final':
   baseline_path=private_file(STATE/'c25-c26-protected-rows-private.json');receipt_path=private_file(STATE/'c25-c26-audit-baseline-result.json');receipt=json.loads(receipt_path.read_text());assert receipt['passed'] is True and receipt['rowsFile']['sha256']==sha_file(baseline_path)
   baseline=json.loads(baseline_path.read_text());exact_rows(capture,baseline,helper)
   result['baselineBindings']={str(p):sha_file(p) for p in [baseline_path,receipt_path]}
  result.update(protectedCoreFacts={**facts,'primarySnapshotExact':True,'primaryRows':6708},passed=True)
  for p,h in PINS.items():assert sha_file(p)==h
 except BaseException as e:
  error=e;result.update(passed=False,errorType=type(e).__name__);private_json(STATE/(label+'-error-private.json'),{'traceback':traceback.format_exc()})
 finally:
  result['processExits']=db.exits if db else {};private_json(STATE/(label+'-result.json'),result)
 print(json.dumps({'passed':result['passed'],'mode':a.mode,'resultSha256':sha_file(STATE/(label+'-result.json'))}))
 if error:raise SystemExit(1)
if __name__=='__main__':main()
`
export function invocation(argv){
 assert.equal(argv.length,8);const values={};for(let i=0;i<8;i+=2){assert.ok(['--python','--tools','--state','--mode'].includes(argv[i])&&!Object.hasOwn(values,argv[i]));values[argv[i]]=argv[i+1]}
 assert.equal(values['--state'],STATE);assert.ok(['baseline','final'].includes(values['--mode']));for(const key of ['--python','--tools','--state'])assert.equal(path.resolve(values[key]),values[key])
 return {python:values['--python'],args:['-B','-',...['--tools','--state','--mode'].flatMap(key=>[key,values[key]])],input:INLINE_PYTHON}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const c=invocation(process.argv.slice(2)),r=spawnSync(c.python,c.args,{input:c.input,encoding:'utf8',timeout:295000,killSignal:'SIGKILL',maxBuffer:1024**2,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});process.stdout.write(r.stdout??'');assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr);process.exitCode=0}catch(e){process.stderr.write(`Analysis audit rejected (${e.name}); inspect private capture.\n`);process.exitCode=1}
}
