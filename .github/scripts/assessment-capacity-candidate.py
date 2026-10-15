"""One build per changed component; exact contracts and qualified stage reuse."""
import datetime, hashlib, importlib.util, json, os, shutil, subprocess, tempfile, time
from pathlib import Path
spec=importlib.util.spec_from_file_location('reuse',Path(__file__).with_name('assessment-capacity-reuse.py'));reuse=importlib.util.module_from_spec(spec);spec.loader.exec_module(reuse)
p=json.loads(Path('assessment-capacity-plan.json').read_text())
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('CI')=='true'
assert p['route']=='assessment-capacity' and p['changed']==['frontend','backend']
evidence=Path('assessment-capacity-evidence');evidence.mkdir(exist_ok=True)
checks={'head':p['head'],'components':p['components'],'repository':os.environ['GITHUB_REPOSITORY'],'prNumber':int(os.environ['PR_NUMBER']),
 'inputs':reuse.fingerprint(p),'phases':[],'compile':{},'contracts':{},'audit':{},'builders':{},'runtime':{},'tests':{},'bases':{}}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def output(args):return subprocess.check_output(args,text=True).strip()
def run(args,timeout=1800,env=None):subprocess.run(args,check=True,timeout=timeout,env=env)
def persist(): (evidence/'checks.json').write_text(json.dumps(checks,indent=2))
def phase(name,fn):
    print('START '+name,flush=True)
    start=time.monotonic()
    try:fn();status='success'
    except Exception:status='failure';raise
    finally:checks['phases'].append({'name':name,'status':status,'seconds':round(time.monotonic()-start,2)});persist()
def inherited(value,receipt):return {**value,'reusedFrom':{'runId':receipt['runId'],'artifactId':receipt['artifactId'],'head':receipt['checks']['head']}}
def capture_tests(report,selected):
    if not report.exists():return
    data=json.loads(report.read_text())
    for key in selected:
        file,title=(key.split('::',1)+[None])[:2] if '::' in key else (key,None)
        suites=[s for s in data.get('testResults',[]) if s['name'].endswith(file)]
        assertions=[a for s in suites for a in s.get('assertionResults',[]) if title is None or a['title']==title]
        passed=len(suites)==1 and bool(assertions) and all(a['status']=='passed' for a in assertions)
        if not passed:
            print('FAILED '+key,flush=True)
            for suite in suites:
                if suite.get('message'):print(suite['message'][:6000],flush=True)
            for assertion in assertions:
                if assertion['status']!='passed':print(assertion['title']+': '+'\n'.join(assertion.get('failureMessages',[]))[:6000],flush=True)
        checks['tests'][key]={'status':'success' if passed else 'failure','at':now(),'assertions':len(assertions)}
    persist()
def require_tests(keys):
    for key in keys:assert checks['tests'].get(key,{}).get('status')=='success','Required test failed/skipped/missing: '+key

with tempfile.TemporaryDirectory(prefix='assessment-capacity-') as temporary:
    temp=Path(temporary);dockerfiles={};builders={};archive_ids=set();receipt=None
    try:
        # Freeze all actually consumed base and fixture image identities before
        # looking for prior proof. Tags alone never qualify image reuse.
        for component in p['changed']:
            context='server-version/'+component;lines=[]
            for line in Path(context+'/Dockerfile').read_text().splitlines():
                fields=line.split()
                if len(fields)>1 and fields[0].upper()=='FROM' and (':' in fields[1] or '/' in fields[1]):
                    image=fields[1]
                    if image not in checks['bases']:
                        run(['docker','pull',image],600)
                        checks['bases'][image]=json.loads(output(['docker','image','inspect',image]))[0]['RepoDigests'][0]
                    line=line.replace(image,checks['bases'][image],1)
                if component=='backend' and line=='RUN npm run build':line='RUN npx tsc'
                lines.append(line)
            dockerfiles[component]=temp/(component+'.Dockerfile');dockerfiles[component].write_text('\n'.join(lines)+'\n')
        fixtures={}
        for image in ['postgres:16.15-bookworm','redis:7.4.11-bookworm']:
            run(['docker','pull',image],600);fixtures[image]=json.loads(output(['docker','image','inspect',image]))[0]['RepoDigests'][0]
        checks['environment']={'node':checks['bases']['node:24.21.0-bookworm-slim'],'fixtures':fixtures}
        receipt=reuse.prepare(p,evidence,checks['environment'])
        matches=receipt['matches'] if receipt else {'builds':[],'tests':[],'extra':False}
        if receipt:
            for key in matches['tests']:checks['tests'][key]=inherited(receipt['checks']['tests'][key],receipt)
        if not matches['extra']:
            def extra():
                env=dict(os.environ)
                env.update({key:'synthetic-only' for key in ['DB_NAME','DB_USER','DB_PASSWORD','ADMIN_USERNAME','ADMIN_PASSWORD','JWT_SECRET','DATA_ENCRYPTION_KEY','ASSET_SIGNING_SECRET','DATA_PSEUDONYM_KEY']})
                env.update({'DATABASE_URL':'postgresql://synthetic:synthetic@postgres/isolated','DATABASE_URL_RUNTIME':'postgresql://synthetic:synthetic@postgres/isolated','COOKIE_SECURE':'true','ASSET_MIGRATION_COMPLETE':'true','CORS_ORIGIN':'https://fixture.invalid',
                  'ASSESSMENT_REPORT_ASYNC_ENABLED':'true','ASSESSMENT_REPORT_ASYNC_COURSE_IDS':'synthetic-course','ASSESSMENT_REPORT_MAX_PENDING':'101','ASSESSMENT_REPORT_WORKER_CONCURRENCY':'2',
                  'HEAVY_PROCESSING_ENABLED':'false','VIDEO_PROCESSING_ENABLED':'false'})
                resolved=json.loads(subprocess.check_output(['docker','compose','-f','server-version/docker-compose.yml','-f','server-version/docker-compose.hardened.yml','config','--format','json'],env=env,text=True))
                for service in ['backend','worker']:
                    values=resolved['services'][service]['environment']
                    assert str(values['ASSESSMENT_REPORT_ASYNC_ENABLED'])=='true' and values['ASSESSMENT_REPORT_ASYNC_COURSE_IDS']=='synthetic-course'
                    assert str(values['ASSESSMENT_REPORT_MAX_PENDING'])=='101' and str(values['ASSESSMENT_REPORT_WORKER_CONCURRENCY'])=='2'
                    assert str(values['HEAVY_PROCESSING_ENABLED'])=='false' and str(values['VIDEO_PROCESSING_ENABLED'])=='false'
                checks['extra']={'status':'success','at':now()}
            phase('report-and-maintenance-compose-overrides',extra)
        else:checks['extra']=inherited(receipt['checks']['extra'],receipt)
        for component in p['changed']:
            context='server-version/'+component;tag='eduk12-assessment-capacity-'+component+':'+p['head'];builder=tag+'-build'
            args=['docker','buildx','build','--load','-f',str(dockerfiles[component]),'--label','org.opencontainers.image.revision='+p['head']]
            args+=['--build-arg','VITE_COGNITIVE_MODULE_ENABLED=true'] if component=='frontend' else ['--build-arg','DEBIAN_MIRROR=deb.debian.org']
            if component in matches['builds']:
                builder=receipt['checks']['builders'][component]['id'];checks['compile'][component]=inherited(receipt['checks']['compile'][component],receipt)
                print('REUSED official '+component+' compilation',flush=True)
            else:
                phase(component+'-compile-once',lambda:run(args+['--target','build','-t',builder,context]))
                checks['compile'][component]={'status':'success','at':now(),'sourceHead':p['head']}
            builder_id=output(['docker','image','inspect','--format','{{.Id}}',builder]);builders[component]=builder_id;archive_ids.add(builder_id)
            if component=='frontend':
                selected=p['frontendTests'];missing=[key for key in selected if key not in matches['tests']]
                changed=[entry['file'].removeprefix(context+'/') for entry in p['changes'] if entry['file'].startswith(context+'/') and entry['file'].endswith(('.ts','.tsx'))]
                config=temp/'tsconfig.access.json';config.write_text(json.dumps({'extends':'./tsconfig.app.json','include':changed+['src/vite-env.d.ts','src/test/setup.ts'],'references':[]}))
                if receipt and component in matches['builds'] and receipt['checks'].get('contracts',{}).get(component,{}).get('status')=='success' and reuse.recent(receipt['checks']['contracts'][component].get('at')) and receipt['checks']['components'][component]==p['components'][component]:
                    checks['contracts'][component]=inherited(receipt['checks']['contracts'][component],receipt)
                else:
                    phase('affected-frontend-lint-types',lambda:run(['docker','run','--rm','-v',str(config)+':/app/tsconfig.access.json:ro','-v',str(Path(context+'/src').resolve())+':/app/src:ro',builder,'sh','-ec','npx eslint '+' '.join(changed)+' && npx tsc -p tsconfig.access.json --noEmit'],300))
                    checks['contracts'][component]={'status':'success','at':now()}
                docker=['docker','run','--rm','-v',str(evidence.resolve())+':/evidence','-v',str(Path(context+'/src').resolve())+':/app/src:ro',builder]
                if missing:
                    report=evidence/'frontend-tests.json'
                    try:phase('affected-frontend-tests',lambda:run(docker+['npx','vitest','run']+missing+['--maxWorkers=2','--reporter=json','--outputFile=/evidence/frontend-tests.json'],300))
                    finally:capture_tests(report,missing)
                require_tests(selected)
            else:
                resources=[]
                try:
                    run(['docker','run','-d','--name','assessment-capacity-ci-postgres','-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD=synthetic','-e','POSTGRES_DB=assessment_capacity_ci_test','-p','127.0.0.1:5432:5432',fixtures['postgres:16.15-bookworm']]);resources.append('assessment-capacity-ci-postgres')
                    run(['docker','run','-d','--name','assessment-capacity-ci-redis','-p','127.0.0.1:6379:6379',fixtures['redis:7.4.11-bookworm']]);resources.append('assessment-capacity-ci-redis')
                    for attempt in range(30):
                        if subprocess.run(['docker','exec','assessment-capacity-ci-postgres','pg_isready','-U','ptool'],stdout=subprocess.DEVNULL).returncode==0:break
                        time.sleep(1)
                    else:raise RuntimeError('Isolated PostgreSQL readiness timeout')
                    db='postgresql://ptool:synthetic@127.0.0.1:5432/assessment_capacity_ci_test?schema=public'
                    env=['COGNITIVE_MODULE_ENABLED=true','CI=true','NODE_ENV=test','DATABASE_URL='+db,'RELEASE_INTEGRATION_DATABASE_URL='+db,'PR26_INTEGRATION_DATABASE_URL='+db,'COGNITIVE_INTEGRATION_DB_URL='+db,'REDIS_URL=redis://127.0.0.1:6379','JWT_SECRET=synthetic-access-ci-not-production','ASSET_SIGNING_SECRET=synthetic-access-assets-not-production','DATA_ENCRYPTION_KEY='+'55'*32,'DATA_PSEUDONYM_KEY='+'56'*32,'CAMPUS_MFA_ENCRYPTION_KEY='+'34'*32,'SURVEY_MFA_ENCRYPTION_KEY='+'45'*32,'ASSET_MIGRATION_COMPLETE=true','UPLOAD_DIR=/tmp/access-ci-uploads','POW_INTEGRATION_REDIS_URL=redis://127.0.0.1:6379/15','PERF_ISOLATED_TEST_MODE=1','PERF_SQL_EVENT_COUNT=1','REPORT_OUTBOX_INTEGRATION_DATABASE_URL='+db,'V32_2_INTEGRATION_DATABASE_URL='+db,'V32_3_INTEGRATION_DATABASE_URL='+db,'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL='+db]
                    docker=['docker','run','--rm','--network','host','-v',str(evidence.resolve())+':/evidence','-v',str(Path(context+'/src/__tests__').resolve())+':/app/src/__tests__:ro']
                    for value in env:docker+=['-e',value]
                    phase('isolated-schema-fixture',lambda:run(docker+[builder,'npx','prisma','migrate','deploy'],300))
                    missing=[key for key in p['tests'] if key not in matches['tests']]
                    if missing:
                        report=evidence/'backend-tests.json'
                        try:phase('affected-backend-tests',lambda:run(docker+[builder,'npx','vitest','run']+missing+['--no-file-parallelism','--reporter=json','--outputFile=/evidence/backend-tests.json'],900))
                        finally:capture_tests(report,missing)
                    require_tests(p['tests'])
                    prior_recovery=receipt['checks'].get('recovery',{}) if receipt else {}
                    if receipt and prior_recovery.get('status')=='success' and receipt['checks']['inputs'].get('recovery')==checks['inputs']['recovery'] and reuse.recent(prior_recovery.get('at')) and receipt['checks'].get('environment')==checks['environment']:
                        shutil.copyfile(Path(receipt['source'])/'recovery-result.json',evidence/'recovery-result.json')
                        checks['recovery']=inherited(prior_recovery,receipt)
                        print('REUSED official same-input pending-report restore proof',flush=True)
                    else:
                        phase('new-schema-pending-report-restore',lambda:run(['python3','-B','.github/scripts/assessment-capacity-recovery.py',builder,str(evidence.resolve())],300))
                        result=json.loads((evidence/'recovery-result.json').read_text());assert result['status']=='success'
                        checks['recovery']={'status':'success','at':now(),'input':checks['inputs']['recovery']}
                    persist()
                    for index,target in enumerate(p['focusedTests']):
                        key=target['file']+'::'+target['title']
                        if key in matches['tests']:continue
                        report=evidence/('focused-'+str(index)+'.json')
                        try:phase('focused-source-'+str(index),lambda:run(docker+[builder,'npx','vitest','run',target['file'],'-t',target['title'],'--no-file-parallelism','--reporter=json','--outputFile=/evidence/'+report.name],300))
                        finally:capture_tests(report,[key])
                        require_tests([key])
                finally:
                    for name in resources:run(['docker','rm','-f','-v',name],30)
            if receipt and component in matches['builds'] and receipt['checks'].get('audit',{}).get(component,{}).get('status')=='success' and reuse.recent(receipt['checks']['audit'][component].get('at')):
                checks['audit'][component]=inherited(receipt['checks']['audit'][component],receipt)
            else:
                phase(component+'-dependency-audit',lambda:run(['docker','run','--rm',builder,'npm','audit','--audit-level=high'],120))
                checks['audit'][component]={'status':'success','at':now()}
            prior=receipt['checks'].get('runtime',{}).get(component,{}) if receipt else {}
            runtime_bases=['node:24.21.0-bookworm-slim'] if component=='backend' else ['node:24.21.0-bookworm-slim','nginx:1.31.6-alpine3.24-slim']
            if component in matches['builds'] and prior.get('status')=='success' and reuse.recent(prior.get('at')) and all(receipt['checks']['bases'].get(key)==checks['bases'][key] for key in runtime_bases):
                image=prior['id'];run(['docker','tag',image,tag]);checks['runtime'][component]=inherited(prior,receipt)
                shutil.copyfile(Path(receipt['source'])/prior['scan'],evidence/(component+'-scan.json'))
                checks['runtime'][component]['scan']=component+'-scan.json'
                print('REUSED official '+component+' runtime and bound scan',flush=True)
            else:
                # Use the already qualified build image as the exact producer.
                # This works across CI jobs without relying on a missing remote
                # BuildKit cache or ever executing TypeScript/Vite a second time.
                alias='eduk12-qualified-'+component+':'+builder_id.removeprefix('sha256:')
                run(['docker','tag',builder_id,alias])
                frozen=dockerfiles[component].read_text()
                marker='FROM build AS prod-deps' if component=='backend' else 'FROM nginx'
                tail=frozen[frozen.index(marker):]
                runtime_file=temp/(component+'-runtime.Dockerfile')
                runtime_file.write_text('FROM '+alias+' AS build\n'+tail)
                runtime_args=['docker','buildx','build','--builder','default','--load','-f',str(runtime_file),'--label','org.opencontainers.image.revision='+p['head']]
                runtime_args+=['--build-arg','DEBIAN_MIRROR=deb.debian.org'] if component=='backend' else []
                phase(component+'-runtime-from-cache',lambda:run(runtime_args+['--target','runtime','-t',tag,context]))
                image=output(['docker','image','inspect','--format','{{.Id}}',tag])
                scan=component+'-scan.json'
                phase(component+'-actual-runtime-scan',lambda:run(['trivy','image','--exit-code','1','--ignore-unfixed','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--output',str(evidence/scan),image],300))
                checks['runtime'][component]={'id':image,'status':'success','at':now(),'scan':scan,'sourceHead':p['head'],'compiledSourceHead':checks['compile'][component]['sourceHead']}
            archive_ids.add(image);persist()
    finally:
        # Preserve actual builder/runtime identities even if a later test fails,
        # so an unchanged successful phase can be accepted without rebuilding.
        if archive_ids:
            archive=evidence/'images.tar.zst'
            save=subprocess.Popen(['docker','save',*sorted(archive_ids)],stdout=subprocess.PIPE)
            try:
                with archive.open('wb') as target:subprocess.run(['zstd','-T2','-1','-c'],stdin=save.stdout,stdout=target,check=True,timeout=300)
            finally:save.stdout.close()
            if save.wait()!=0:raise RuntimeError('Image archive failed')
            digest=hashlib.sha256(archive.read_bytes()).hexdigest()
            for component,image in builders.items():checks['builders'][component]={'id':image,'file':archive.name,'sha256':digest}
            for component,value in checks['runtime'].items():value.update({'file':archive.name,'sha256':digest})
        persist()
