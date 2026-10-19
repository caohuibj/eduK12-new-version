"""C20 additive-table checks. Restore equivalence uses unchanged C19 PG parser whitelist."""
import importlib.util,json,re
from pathlib import Path
BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('c20_prior_db',BASE/'c19-flow-db.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
sha_file,digest,quote,fresh_prisma=old.sha_file,old.digest,old.quote,old.fresh_prisma
def restored_snapshot_equivalence(expected,actual,db,database):
 result=old.restored_snapshot_equivalence(expected,actual,db,database)
 assert len(result['columnOrdinals'])==73 and digest(result['columnOrdinals'])=='a805204ce99aeafcd5ec97857f19a5ad02e05d2396f9f34324d03bf3b5b8838a', 'restored physical ordinal difference escaped exact C19 73-column whitelist'
 assert len(result['constraintReparses'])==3 and digest(result['constraintReparses'])=='dc87f23a38b0498793dc094f39683fa34e3a4f6571bd38fde0cc5d6fe09595cc', 'restored CHECK differences escaped exact C19 3-parser-proof whitelist'
 return result
PINNED_DUMP_SHA256='c93890e3958e905304254225c9c94879690a0c37da13755a462fc77103c6dd15'
PINNED_RESULT_SHA256='f248800fe0b654d9b3ca8654ee76a71117627e41ee892b2ab5eac6d19cf7ad58'
MIGRATION='20261018160000_training_material_allocation'
NEW_TABLES=sorted(['training_material_experiments','training_material_subject_bindings','training_material_quota_buckets','training_material_allocation_claims'])
class Database(old.Database):
 def restore(self,database,target,label):
  assert re.fullmatch(r'eduk12_c20_[a-z_]+',database)
  self.sql('CREATE DATABASE '+quote(database),'postgres')
  self.run([self.pg/'pg_restore','--exit-on-error','--no-owner','--no-acl','-h','127.0.0.1','-p',self.owner.port,'-U',self.owner.username,'-d',database,target],label,self.auth)
 def original_rows_unchanged(self,original,database='eduk12_recovery'):
  # Parent verifies old constraints against all constraints; restrict only the new
  # table identities, never normalize definitions or same-database ordinals.
  metadata=self.column_metadata(database)
  assert all(metadata[t]==v for t,v in original['columnMetadata'].items())
  current=self.rows(original['columns'],database)
  from collections import Counter
  for table,rows in original['rows'].items():
   assert not Counter(json.dumps(r,sort_keys=True) for r in rows)-Counter(json.dumps(r,sort_keys=True) for r in current[table]), table
  guards=self.guards(sorted(original['columns']),database)
  additions=original.get('c20AddedOldTableGuards',[])
  assert sorted(guards,key=lambda g:(g['table'],g['name']))==sorted(original['allPublicUserGuards']+additions,key=lambda g:(g['table'],g['name']))
  assert [c for c in self.constraints(database) if c['table'] not in NEW_TABLES]==original['constraints']
  return {'oldTables':len(original['columns']),'oldRows':sum(map(len,original['rows'].values())),'historicalRowsSha256':digest(original['rows']),'allOriginalRowsRetained':True,'originalGuardsUnchanged':True,'whitelistedAdditionalGuards':len(additions),'constraintsUnchanged':True}

 def validate_added_guards(self,original,after):
  expected={('courses','training_material_course_identity'),('composite_assessments','training_material_composite_identity'),('composite_assessment_attempts','training_material_attempt_identity')}
  before={(g['table'],g['name']):g for g in original['allPublicUserGuards']}
  actual={(g['table'],g['name']):g for g in after['allPublicUserGuards'] if g['table'] in original['columns']}
  assert all(actual.get(key)==value for key,value in before.items()), 'original guard changed'
  assert set(actual)-set(before)==expected, 'unexpected old-table guard addition'
  migration=(self.backend/'prisma/migrations'/MIGRATION/'migration.sql').read_text()
  body=migration.split('CREATE FUNCTION training_material_parent_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$',1)[1].split('$$;',1)[0]
  for table,name in expected:
   guard=actual[(table,name)]
   assert guard['enabled']=='O' and guard['deferrable'] is False and guard['initiallyDeferred'] is False
   assert guard['trigger']==f'CREATE TRIGGER {name} BEFORE UPDATE ON public.{table} FOR EACH ROW EXECUTE FUNCTION training_material_parent_identity_guard()'
   assert body in guard['function'], 'new guard function differs from frozen migration body'
  return [actual[key] for key in sorted(expected)]
