#!/usr/bin/env python3
"""C21 additive migration / nonempty restore; original full rows are immutable evidence."""
import argparse, importlib.util, json, re, sys
from collections import Counter
from pathlib import Path
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('c21_prior',BASE/'c20-materials-db.py');old=importlib.util.module_from_spec(s);s.loader.exec_module(old)
sha_file,digest,quote,fresh_prisma=old.sha_file,old.digest,old.quote,old.fresh_prisma
MIGRATION='20261019040000_training_public_rounds'
class Database(old.Database):
 def restore(self,database,target,label):
  assert re.fullmatch(r'eduk12_c21_[a-z_]+',database)
  self.sql('CREATE DATABASE '+quote(database),'postgres')
  self.run([self.pg/'pg_restore','--exit-on-error','--no-owner','--no-acl','-h','127.0.0.1','-p',self.owner.port,'-U',self.owner.username,'-d',database,target],label,self.auth)
 def original_rows_unchanged(self,original,database='eduk12_recovery'):
  metadata=self.column_metadata(database)
  for table,columns in original['columnMetadata'].items():
   assert [c for c in metadata[table] if c['column'] in original['columns'][table]]==columns,table
  current=self.rows(original['columns'],database)
  for table,rows in original['rows'].items():
   assert not Counter(map(lambda r:json.dumps(r,sort_keys=True),rows))-Counter(map(lambda r:json.dumps(r,sort_keys=True),current[table])),table
  guards={(g['table'],g['name']):g for g in self.guards(sorted(original['columns']),database)}
  assert all(guards.get((g['table'],g['name']))==g for g in original['allPublicUserGuards'])
  constraints=self.constraints(database)
  assert all(c in constraints for c in original['constraints'])
  return {'allOriginalRowsRetained':True,'oldTables':len(original['columns']),'oldRows':sum(map(len,original['rows'].values())),'historicalRowsSha256':digest(original['rows']),'originalGuardsUnchanged':True}
def main():
 p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);p.add_argument('--phase',choices=['upgrade','restore'],required=True);a=p.parse_args();db=Database(a.tools,a.state)
 target=a.state/f'c21-{a.phase}-result.json';assert not target.exists();r={'passed':False,'checks':[]}
 try:
  if a.phase=='upgrade':
   before=db.snapshot();assert 'training_public_rounds' not in before['columns'];assert len(before['columns'])==215
   original={**before,'rows':db.rows(before['columns'])};(a.state/'c21-original-rows-private.json').write_text(json.dumps(original))
   migrations=db.sql('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()
   db.run([db.node,'node_modules/prisma/build/index.js','migrate','deploy'],'migrate-c21',{'DATABASE_URL':db.url(db.owner,'eduk12_recovery')})
   after=db.snapshot();assert set(after['columns'])==set(before['columns'])|{'training_public_rounds'}
   for t,cols in before['columns'].items():assert after['columns'][t]==cols+(['training_round_id'] if t=='composite_assessment_access_tokens' else [])
   assert db.sql('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()==migrations+[MIGRATION]
   assert db.sql('SELECT count(*) FROM composite_assessment_access_tokens WHERE training_round_id IS NOT NULL')=='0'
   assert db.sql('SELECT count(*) FROM training_public_rounds')=='0'
   expected={('composite_assessments','training_public_round_parent_guard'),('courses','training_public_round_course_guard'),('questionnaire_course_deliveries','training_public_round_delivery_guard'),('composite_assessment_access_tokens','training_public_token_round_guard'),('anonymous_study_waves','training_public_round_study_guard'),('training_public_rounds','training_public_round_guard'),('composite_assessment_attempts','training_public_round_attempt_guard')}
   oldkeys={(g['table'],g['name']) for g in before['allPublicUserGuards']};newkeys={(g['table'],g['name']) for g in after['allPublicUserGuards']};assert newkeys-oldkeys==expected
   assert all(g['enabled']=='O' for g in after['allPublicUserGuards'])
   db.apply_role('eduk12_recovery');assert db.snapshot()==after
   r['checks']=['Exactly one table and nullable token round column added; zero backfill','Only seven named additive guards; all original definitions/facts retained','Official restricted runtime-role policy apply and verify']
  else:
   assert json.loads((a.state/'c21-functional-result.json').read_text())['passed']
   original=json.loads((a.state/'c21-original-rows-private.json').read_text());after=db.snapshot()
   assert int(db.sql('SELECT count(*) FROM training_public_rounds'))>0
   assert int(db.sql('SELECT count(*) FROM composite_assessment_access_tokens WHERE training_round_id IS NOT NULL'))>0
   out=a.state/'c21-new-format-restore';out.mkdir(mode=0o700);dump=out/'c21-http-new-format.dump';r['dumpSha256']=db.dump('eduk12_recovery',dump,'dump-c21');assert db.snapshot()==after
   db.restore('eduk12_c21_http_restore',dump,'restore-c21');restored=db.snapshot('eduk12_c21_http_restore')
   r['restoreEquivalence']=old.restored_snapshot_equivalence(after,restored,db,'eduk12_c21_http_restore')
   db.apply_role('eduk12_c21_http_restore');assert db.snapshot('eduk12_c21_http_restore')==restored;assert db.snapshot()==after
   r['checks']=['Nonempty rounds/token bindings and all logical facts/guards restored','Unchanged exact C19 column/parser restore whitelist','Restored restricted runtime role verifies']
  r['retainedFacts']=db.original_rows_unchanged(original);r['postStateSha256']=digest(after);r['passed']=True
  (a.state/f'c21-{a.phase}-post-state.json').write_text(json.dumps(after,indent=2))
 except BaseException as e:r['errorType']=type(e).__name__;raise
 finally:r['processExits']=db.exits;target.write_text(json.dumps(r,indent=2))
if __name__=='__main__':main()
