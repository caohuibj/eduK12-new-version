import os,pathlib,subprocess,time,json,socket,hashlib
root=pathlib.Path.cwd();out=root.parent/'storage-ledger-evidence';runtime=root.parent/'four-entry-v2-evidence/tooling/root';B=runtime/'usr/lib/postgresql/17/bin'
data=root.parent/'observer-journeys-evidence/pgdata-observer-http-r4';assert data.exists();assert not (data/'postmaster.pid').exists()
env={**os.environ,'LD_LIBRARY_PATH':str(runtime/'usr/lib/x86_64-linux-gnu'),'PGHOST':'127.0.0.1','PGPORT':'55435','PGUSER':'v2_synthetic_owner','TZ':'UTC'}
s=socket.socket();s.bind(('127.0.0.1',55435));s.close();log=open(out/'read-existing-services.log','w');p=None
try:
 p=subprocess.Popen([str(B/'postgres'),'-D',str(data),'-h','127.0.0.1','-p','55435','-k','','-c','shared_buffers=64MB','-c','max_connections=10','-c','default_transaction_read_only=on'],env=env,stdout=log,stderr=log)
 for i in range(100):
  if subprocess.run([str(B/'pg_isready')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.1)
 def query(sql):
  return subprocess.check_output([str(B/'psql'),'-X','-A','-t','-v','ON_ERROR_STOP=1','-d','education_observer_http_test','-c',sql],env={**env,'PGOPTIONS':'-c default_transaction_read_only=on'},text=True).strip()
 assert query('SHOW default_transaction_read_only')=='on'
 def qj(sql):return json.loads(query(sql))
 tables=qj("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
 wanted=[t for t in tables if t.startswith(('assessment_','composite_','relational_','huiteacher_field','huiteacher_observation','scale_library','measurement_','reference_','report_')) or t in ['assessments','scales','education_report_policy_snapshots']]
 rows=[];empty=[]
 for t in wanted:
  quoted='"'+t.replace('"','""')+'"'
  row=qj(f"SELECT json_build_object('table','{t}','rows',count(*),'totalRelationBytes',pg_total_relation_size('{t}'),'tableBytesIncludingToast',pg_table_size('{t}'),'indexesBytes',pg_indexes_size('{t}')) FROM {quoted}")
  if not row['rows']:empty.append(t);continue
  columns=qj(f"SELECT json_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}'")
  fields=[]
  for c in columns:
   if any(s in c for s in ['encrypted','cipher','answers','result','snapshot','manifest','payload','definition','report','binding']):
    qc='"'+c.replace('"','""')+'"'
    fields.append(qj(f"SELECT json_build_object('column','{c}','nonNullRows',count({qc}),'datumBytes',coalesce(sum(pg_column_size({qc})),0),'textRepresentationBytes',coalesce(sum(octet_length({qc}::text)),0)) FROM {quoted}"))
  row['fields']=fields;rows.append(row)
 identities=qj("SELECT json_agg(x) FROM (SELECT respondent_type, status::text, count(*) AS count FROM composite_assessment_attempts GROUP BY respondent_type,status ORDER BY respondent_type,status) x")
 completed=qj("SELECT json_build_object('completedScales',(SELECT count(*) FROM assessments WHERE status='COMPLETED'),'unitFinals',(SELECT count(*) FROM assessment_unit_snapshots WHERE terminal_state='COMPLETED' AND payload_kind='UNIT_RESULT'),'externalFieldEvidence',(SELECT count(*) FROM huiteacher_field_form_evidence))")
 record={'sourceMain':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'businessSource':'90c0a9a5c0ba24a5a9d8cb8003279dfb668650ba','origin':'PR376 observer-http-r4 database retained after actual synthetic HTTP journeys; no new FINAL or scoring','readOnly':True,'postgres':'17.11','identities':identities,'completed':completed,'tables':rows,'emptySelectedTables':empty,'limitations':['Two School observer scale finals and one Teacher external field form only, not four-entry distribution or capacity.','Actual complete database schema but small fixture sample includes setup/governance records; page allocation is not per-user amortized cost.','Column datum bytes and text representation are distinct; sums do not equal heap/index/TOAST totals.','No prior WAL baseline or before-START table baseline; no backup/restore/COS or decrypted payload equivalence claim.','Original ephemeral encryption keys are not retained; only metadata/size and existing committed completion identities read. No changes to business rows.']}
 (out/'existing-ledger.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'tables':len(rows),'completed':completed,'totalSelectedRelations':sum(r['totalRelationBytes'] for r in rows),'identities':identities}))
finally:
 if p:
  p.terminate()
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 log.close()
