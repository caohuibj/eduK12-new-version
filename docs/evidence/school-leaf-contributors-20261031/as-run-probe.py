import json,subprocess,copy,pathlib,hashlib
q=json.load(open('/tmp/school-contributor-query-native.json'))
def compact(x):return json.dumps(x,separators=(',',':'),ensure_ascii=False,sort_keys=True)
def digest(x):return hashlib.sha256(compact(x).encode()).hexdigest()
def lit(x):
 if x is None:return 'NULL'
 if isinstance(x,(int,float)):return str(x)
 if not isinstance(x,str):x=compact(x)
 return "'"+x.replace("'","''")+"'"
def insert(table,columns,values):return 'INSERT INTO '+table+'('+','.join(columns)+') VALUES ('+','.join(map(lit,values))+');\n'
sql='''CREATE TEMP TABLE reporting_analysis_artifacts(id text,organization_id text,analysis_kind text,artifact_payload jsonb,spec_id text,cohort_snapshot_id text,generated_at timestamptz,analysis_identity_hash text);
CREATE TEMP TABLE reporting_cohort_snapshots(id text,organization_id text,source_run_id text,source_track_id text,members jsonb);
CREATE TEMP TABLE reporting_analysis_specs(id text,definition jsonb);
CREATE TEMP TABLE assessment_run_tracks(id text,organization_id text,run_id text,frozen_resource_policy jsonb,requested_policy jsonb);
CREATE TEMP TABLE education_report_policy_snapshots(id text,organization_id text,run_id text,product text,scenario text,policy_version int,effective_json jsonb,effective_hash text);
CREATE TEMP TABLE education_report_release_records(organization_id text,source_run_id text,source_spec_id text,report_kind text,audience text,report_projection jsonb,report_digest text,report_scope_key text,policy_snapshot_id text);
CREATE TEMP TABLE reporting_analysis_artifact_waves(artifact_id text,organization_id text,wave_id text,series_id text);
CREATE TEMP TABLE reporting_series_waves(id text,organization_id text,series_id text,cohort_snapshot_id text);
'''
old=q['prior'][0];org=old['cohort']['organizationId'];cohort=old['cohort'];policy=old['privacy'];payload=old['payload']
sql+=insert('reporting_cohort_snapshots',['id','organization_id','source_run_id','source_track_id','members'],[cohort['id'],org,cohort['sourceRunId'],cohort['sourceTrackId'],old['members']])
sql+=insert('reporting_analysis_specs',['id','definition'],[old['spec']['id'],old['spec']['definition']])
sql+=insert('assessment_run_tracks',['id','organization_id','run_id','frozen_resource_policy','requested_policy'],[cohort['sourceTrackId'],org,cohort['sourceRunId'],{'minimumRespondents':10},{'minimumRespondents':10}])
sql+=insert('education_report_policy_snapshots',['id','organization_id','run_id','product','scenario','policy_version','effective_json','effective_hash'],[policy['id'],org,cohort['sourceRunId'],policy['product'],policy['scenario'],policy['policyVersion'],policy['effective'],policy['effectiveHash']])
def artifact(p,kind='GROUP',organization=org):
 global sql
 sql+=insert('reporting_analysis_artifacts',['id','organization_id','analysis_kind','artifact_payload','spec_id','cohort_snapshot_id','generated_at','analysis_identity_hash'],[p['artifactId'],organization,kind,p,old['spec']['id'],cohort['id'] if kind=='GROUP' else None,p['generatedAt'],p['analysisIdentityHash']])
artifact(payload)
selfcopy=copy.deepcopy(payload);selfcopy['artifactId']=q['values'][1];selfcopy['analysisIdentityHash']=q['values'][2];artifact(selfcopy)
foreign=copy.deepcopy(payload);foreign['artifactId']='foreign';artifact(foreign,organization='other-school')
unrelated=copy.deepcopy(payload);unrelated['artifactId']='unrelated';unrelated['source']['leaf']['instrumentKey']='other-tool';artifact(unrelated)
for kind in ['REPEATED_COHORT','MATCHED_LONGITUDINAL']:
 p=copy.deepcopy(payload);p['artifactId']=kind;p['analysisIdentityHash']=kind
 if kind=='REPEATED_COHORT':p['projection']={'kind':kind,'state':'present','waves':[dict(payload['projection'],waveId=kind+str(i)) for i in [1,2]]}
 else:p['projection']={'kind':kind,'state':'present','mode':'FULL_CASE','matchedEligibleN':31,'metrics':{'old-alias':{'state':'present','validCaseN':31,'waveMeans':[{'waveId':kind+str(i),'mean':0} for i in [1,2]]}}}
 artifact(p,kind)
 for i in [1,2]:
  wave=kind+str(i)
  sql+=insert('reporting_analysis_artifact_waves',['artifact_id','organization_id','wave_id','series_id'],[kind,org,wave,kind])
  sql+=insert('reporting_series_waves',['id','organization_id','series_id','cohort_snapshot_id'],[wave,org,kind,cohort['id']])
for i in range(21):
 p=copy.deepcopy(payload);p['artifactId']='z-history-'+str(i).zfill(3);p['analysisIdentityHash']=digest({'isolatedQueryRow':i});p['generatedAt']='2026-10-31T00:00:00.000001Z';artifact(p)
p=copy.deepcopy(payload);p['artifactId']='released-legacy';p['schemaVersion']=1;p['source'].pop('leaf');p['analysisIdentityHash']=digest({'isolatedLegacy':1});artifact(p)
projection={'artifactId':p['artifactId'],'state':'READY','metrics':{'old-alias':{'mean':0.18,'validN':11,'missingN':20}}}
scope={'kind':'CAMPUS_GENERAL_GROUP_V2','organizationId':org,'runId':cohort['sourceRunId'],'trackId':cohort['sourceTrackId'],'specId':old['spec']['id']}
sql+=insert('education_report_release_records',['organization_id','source_run_id','source_spec_id','report_kind','audience','report_projection','report_digest','report_scope_key','policy_snapshot_id'],[org,cohort['sourceRunId'],old['spec']['id'],'SCHOOL_GENERAL_EDUCATION_GROUP','AUTHORIZED_HUISCHOOL_GENERAL_AGGREGATE',projection,digest(projection),digest(scope),policy['id']])
def query(after=False):
 text=q['text'];nulls=[i for i,v in enumerate(q['values'],1) if v is None]
 assert len(nulls)==4,nulls
 substitutions={i:s for i,s in zip(nulls,[":'cursor_at'",":'cursor_at'",":'cursor_id'",":'cursor_wave'"])}
 for i in reversed(range(1,len(q['values'])+1)):text=text.replace('$'+str(i),substitutions[i] if after and i in substitutions else lit(q['values'][i-1]))
 return text
sql+='CREATE TEMP TABLE page1 AS '+query()+';\n'
sql+='SELECT "cursorAt" AS cursor_at,"cursorId" AS cursor_id,"waveId" AS cursor_wave FROM page1 ORDER BY "cursorAt" DESC,"cursorId" DESC,"waveId" DESC LIMIT 1 \\gset\n'
sql+='CREATE TEMP TABLE page2 AS '+query(True)+';\nCREATE TEMP TABLE actual AS SELECT * FROM page1 UNION ALL SELECT * FROM page2;\n'
sql+='''DO $$ BEGIN
 IF (SELECT count(*) FROM page1)<>20 OR (SELECT count(*) FROM page2)<>7 OR (SELECT count(*) FROM actual)<>27
 OR (SELECT count(*) FROM actual WHERE "legacyKind"='GROUP')<>23
 OR (SELECT count(*) FROM actual WHERE "legacyKind"='REPEATED_COHORT')<>2 OR (SELECT count(*) FROM actual WHERE "legacyKind"='MATCHED_LONGITUDINAL')<>2
 OR (SELECT count(DISTINCT ("cursorId","waveId")) FROM actual)<>27
 OR EXISTS(SELECT 1 FROM actual WHERE "resourceMinimumN"<>10 OR privacy->>'id'<>'synthetic-policy' OR "metricRules"->0->>'sourceMetricKey'<>'score')
 OR NOT EXISTS(SELECT 1 FROM actual WHERE payload->>'artifactId'='released-legacy' AND jsonb_array_length(releases)=1)
 OR EXISTS(SELECT 1 FROM actual WHERE payload->>'artifactId' IN ('foreign','unrelated'))
 THEN RAISE EXCEPTION 'SYNTHETIC_PAGED_QUERY_BOUNDARY_FAILED'; END IF;
END $$;
SELECT json_build_object('status','pass','firstPage',20,'secondPage',7,'distinctDisclosures',27,'microsecondsPreserved',true,'generalPublicationJoined',true,'selfForeignAndUnrelatedExcluded',true,'realFinalsCreated',0,'schema','minimal isolated temporary query fixture');
'''
pathlib.Path('/tmp/school-contributor-query-fixture-native.sql').write_text(sql)
cmd=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock','exec','-i','b-school-contributor-native-20261031','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','school_probe']
p=subprocess.run(cmd,input=sql,text=True,capture_output=True)
pathlib.Path('/tmp/school-contributor-sql-probe-native.log').write_text(p.stdout+p.stderr)
print(p.stdout[-1600:]+p.stderr[-1600:]);print('exit',p.returncode)
raise SystemExit(p.returncode)
