import hashlib,json,tempfile,time,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from qualify import verify_archive,qualify
class Origin(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'package.zip';self.head='1'*40;self.base='0'*40
        self.plan={'route':'A','head':self.head,'base':self.base,'changed':['frontend'],'surfaces':['home'],'components':{'frontend':{'candidate':'a'*64},'backend':{'candidate':'b'*64}},'required':['frontend-scan'],'tools':{k:'c'*64 for k in ['policy','executor','build','scan','browser','frontendChecks','backendChecks']}}
        self.manifest={'candidateQualified':True,'route':'A','head':self.head,'base':self.base,'run':'123','at':time.time(),'artifacts':{'frontend':{'file':'frontend.tar','sha256':hashlib.sha256(b'synthetic-image').hexdigest(),'image':'sha256:'+'a'*64,'component':'a'*64}}}
        with zipfile.ZipFile(self.path,'w') as z:
            for n,v in {'manifest.json':self.manifest,'release-plan.json':self.plan,'browser/browser.json':{'status':'success'},'browser/frontend-browser.json':{'status':'success'},'release-checks.json':{'checks':{'frontend-checks':{'status':'success','component':'a'*64}}},'release-scans.json':{'frontend':{'status':'success','image':'sha256:'+'a'*64}},'executor-rehearsal.json':{'status':'PASS'},'candidate-ready.json':{'html':'hash','csp':'policy'}}.items():z.writestr(n,json.dumps(v))
            z.writestr('frontend.tar',b'synthetic-image')
        self.run={'status':'completed','conclusion':'success','path':'.github/workflows/ci.yml','event':'pull_request','head_repository':{'full_name':'caohuibj/eduK12-new-version'},'head_sha':self.head}
        self.artifact={'workflow_run':{'id':123},'expired':False,'name':'release-components-'+self.head,'digest':'sha256:'+hashlib.sha256(self.path.read_bytes()).hexdigest()}
        self.jobs={'jobs':[{'name':'scoped-release / candidate / qualified','status':'completed','conclusion':'success'}]}
    def tearDown(self):self.temp.cleanup()
    def api(self,path):return self.jobs if '/jobs?' in path else self.artifact if path.startswith('actions/artifacts') else self.run
    def test_real_digest_and_selected_success_required(self):
        with patch('qualify.api',self.api):self.assertEqual(verify_archive(self.path,4,123)[0],self.manifest)
        for target,key,value in [(self.artifact,'digest','sha256:'+'0'*64),(self.artifact,'expired',True),(self.run,'event','workflow_dispatch'),(self.run,'conclusion','failure')]:
            previous=target[key];target[key]=value
            with patch('qualify.api',self.api),self.assertRaises(ValueError):verify_archive(self.path,4,123)
            target[key]=previous
        self.jobs['jobs'][0]['conclusion']='skipped'
        with patch('qualify.api',self.api),self.assertRaises(ValueError):verify_archive(self.path,4,123)
    def test_component_and_relevant_tool_reuse(self):
        cfg={'configurationFingerprint':'d'*64,'oldReady':{}}
        with patch('qualify.api',self.api):self.assertEqual(qualify(self.plan,cfg,self.path,4,123)['images']['frontend'],'sha256:'+'a'*64)
        self.plan['components']['frontend']['candidate']='f'*64
        with patch('qualify.api',self.api),self.assertRaises(ValueError):qualify(self.plan,cfg,self.path,4,123)
if __name__=='__main__':unittest.main()
