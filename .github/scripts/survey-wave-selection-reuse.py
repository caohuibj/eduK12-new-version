"""Fixed PR322 prior audit/unit evidence only; no build, application test or scan."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location('reuse', Path(__file__).with_name('scale-authoring-reuse.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
SOURCE = 'b65f7d658db33f1ebbf08e655f6d41164ebc653d'
RUN = 39546696259
JOBS = {'backend':119046433031, 'frontend':119046433042}
REPORT = (12322310113, 'backend-vitest-report', 2674, '9023d4596a8630c50b17fabd63a648122435c2cdd7a628f50f18e0889933f234')
UNIT_COUNTS = {'survey-content-options.test.ts':19, 'survey-content-selection.test.ts':10, 'survey-frozen-feedback-read.test.ts':8}

def same(path):
    assert subprocess.check_output(['git','show',SOURCE+':'+path]) == Path(path).read_bytes(), 'Reused consumer input changed: '+path

def inputs(component):
    assert component in JOBS
    root='server-version/'+component
    for path in ['package.json','package-lock.json','tsconfig.json'] if component=='backend' else ['package.json','package-lock.json','tsconfig.app.json','vite.config.ts','vitest.config.ts']:
        same(root+'/'+path)
    if component=='backend':
        for name in UNIT_COUNTS: same(root+'/src/__tests__/measurement-content/'+name)
        for path in ['vitest.config.ts','src/config/database.ts','src/modules/survey/content-options.service.ts','src/modules/survey/content-selection.ts','src/modules/survey/waves.service.ts','src/modules/assessment-runtime/canonical.ts','src/modules/measurement-content/reference-candidate.ts','src/modules/measurement-content/repository.ts','src/modules/survey/publication.service.ts']:
            same(root+'/'+path)
        # Frozen-read executes only this unchanged schema, not the newly added result projector.
        path=root+'/src/modules/survey/participant-feedback.ts'
        old=subprocess.check_output(['git','show',SOURCE+':'+path],text=True)
        section=lambda text:text.split('export const surveyRawFeedbackSchema=',1)[1].split('export const surveyParticipantFeedbackSelectionsSchema=',1)[0]
        assert section(old)==section(Path(path).read_text())
    else:
        for path in ['src/survey/SurveyWaveContentSelection.tsx','src/survey/SurveyWaveContentSelection.test.tsx','src/test/setup.ts']:
            same(root+'/'+path)
    # Whole test setup trees and config remain part of the original execution boundary.
    setup=root+'/src/test' if component=='frontend' else root+'/src/__tests__/setup.ts'
    if component=='frontend':
        assert not subprocess.check_output(['git','diff',SOURCE,'--',setup],text=True).strip(), 'Test setup tree drift'
    assert os.environ['NPM_CONFIG_REGISTRY']=='https://registry.npmjs.org'
    assert os.environ['NPM_CONFIG_REPLACE_REGISTRY_HOST']=='always'

def official(component,read=r.api):
    run=read('runs/'+str(RUN));job=read('jobs/'+str(JOBS[component]))
    assert run['id']==RUN and run['head_sha']==SOURCE and run['run_attempt']==1 and run['conclusion']=='success'
    assert job['run_id']==RUN and job['head_sha']==SOURCE and job['conclusion']=='success'
    names=['bounded Survey Wave options and authoritative freeze contracts'] if component=='backend' else ['dependency audit (high and critical)','affected Wave selector and direct consumers']
    for name in names:
        steps=[s for s in job['steps'] if s['name']==name]
        assert len(steps)==1 and steps[0]['conclusion']=='success'

def logs(component):
    # Do not forward the GitHub credential to the official signed download destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): return None
    request=urllib.request.Request('https://api.github.com/repos/caohuibj/eduK12-new-version/actions/jobs/'+str(JOBS[component])+'/logs',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN']})
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response: data=response.read()
    except urllib.error.HTTPError as error:
        assert error.code in [301,302,303,307,308]
        url=error.headers['Location'];assert url.startswith('https://')
        with urllib.request.urlopen(url,timeout=60) as response:data=response.read()
    return data.decode('utf-8')

def log_contract(component,text):
    text=re.sub(r'\x1b\[[0-9;]*m','',text)
    text=re.sub(r'\\u001b\[[0-9;]*m','',text)
    assert 'npm audit --audit-level=high' in text
    if component=='backend': assert 'found 0 vulnerabilities' in text
    else:
        assert '3 vulnerabilities (1 low, 2 moderate)' in text
        assert re.search(r'SurveyWaveContentSelection\.test\.tsx\s+\(7 tests\)',text)
        assert re.search(r'Test Files\s+6 passed\s+\(6\)',text) and re.search(r'Tests\s+32 passed\s+\(32\)',text)

def report_contract(path):
    assert hashlib.sha256(path.read_bytes()).hexdigest()=='cb8b2608a9617159a22f783379538a263c58b251c32a9c2199e3da2f41c8a709'
    report=json.loads(path.read_text());assert report['success'] and report['numPassedTests']==39 and report['numFailedTests']==0 and report['numPendingTests']==0
    for name,count in UNIT_COUNTS.items():
        rows=[x for x in report['testResults'] if x['name'].endswith('/'+name)]
        assert len(rows)==1 and len(rows[0]['assertionResults'])==count
        assert all(a['status']=='passed' for a in rows[0]['assertionResults'])

def main():
    component=sys.argv[1];inputs(component);official(component);log_contract(component,logs(component))
    if component=='backend':
        r.RUN,r.SOURCE=RUN,SOURCE;r.ARTIFACTS['pr322']=REPORT
        target=Path(os.environ['RUNNER_TEMP'])/'pr322-prior-backend';r.download('pr322',target)
        report_contract(target/'eduk12-backend-vitest.json')
    receipt={'status':'PASS','component':component,'sourceRun':RUN,'sourceHead':SOURCE,'sourceJob':JOBS[component],
             'audit':'original locked-input audit passed; not repeated','reusedTests':UNIT_COUNTS if component=='backend' else {'SurveyWaveContentSelection.test.tsx':7},
             'notReused':['new integrated compile/types/runtime scan','changed PG fixture','changed WaveStudio consumers']}
    Path(os.environ['RUNNER_TEMP'],'pr322-'+component+'-reuse.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps(receipt))
if __name__=='__main__':main()
