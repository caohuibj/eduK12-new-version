#!/usr/bin/env python3
"""Independent C19 clone to additive C20 migration; no source services opened."""
import argparse,importlib.util,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('c20_db',BASE/'c20-materials-db.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def main():
 p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--state',type=Path,required=True);a=p.parse_args();db=m.Database(a.tools,a.state)
 target=a.state/'c20-upgrade-result.json';assert not target.exists();assert db.status['state']=='upgrading';r={'passed':False,'checks':[]}
 try:
  before=db.snapshot();columns=before['columns'];assert len(columns)==211
  migrations=db.sql('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines();assert len(migrations)==174
  assert not set(columns)&set(m.NEW_TABLES)
  dump=a.state/'c19-pinned.dump';assert m.sha_file(dump)==m.PINNED_DUMP_SHA256
  db.restore('eduk12_c20_pinned_restore',dump,'restore-pinned-c19')
  r['pinnedRestoreEquivalence']=m.restored_snapshot_equivalence(before,db.snapshot('eduk12_c20_pinned_restore'),db,'eduk12_c20_pinned_restore')
  original={**before,'rows':db.rows(columns)};(a.state/'c20-original-rows-private.json').write_text(json.dumps(original))
  db.run([db.node,'node_modules/prisma/build/index.js','migrate','deploy'],'migrate-c20',{'DATABASE_URL':db.url(db.owner,'eduk12_recovery')})
  after=db.snapshot();assert set(after['columns'])==set(columns)|set(m.NEW_TABLES)
  assert all(after['columnMetadata'][t]==before['columnMetadata'][t] for t in columns),'old column/ordinal changed'
  assert db.sql('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name').splitlines()==[*migrations,m.MIGRATION]
  assert {k:v for k,v in db.projection(columns).items() if k!='_prisma_migrations'}=={k:v for k,v in before['projection'].items() if k!='_prisma_migrations'}
  assert all(db.sql('SELECT count(*) FROM '+m.quote(t))=='0' for t in m.NEW_TABLES)
  original['c20AddedOldTableGuards']=db.validate_added_guards(original,after)
  (a.state/'c20-original-rows-private.json').write_text(json.dumps(original))
  r['retainedFacts']=db.original_rows_unchanged(original);db.apply_role('eduk12_recovery');assert db.snapshot()==after
  r.update(passed=True,oldTableCount=211,tableCount=215,oldMigrationCount=174,newMigrationCount=175,postStateSha256=m.digest(after));r['checks']=['Exact pinned C19 dump restores all logical rows/schema/guards under unchanged PG parser whitelist','Only four additive C20 tables; no old columns, ordinals, facts, constraints or existing guards changed; exactly three migration-defined identity guards added','Restricted official runtime-role apply/verify succeeds']
  (a.state/'c20-upgrade-post-state.json').write_text(json.dumps(after))
 finally:r['processExits']=db.exits;target.write_text(json.dumps(r,indent=2))
if __name__=='__main__':main()
