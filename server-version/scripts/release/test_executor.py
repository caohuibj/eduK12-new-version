import copy,json,tempfile,threading,time,unittest,urllib.request
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from evidence import digest,inputs,record,validate
from executor import Release,attempt,wait_ready,configuration_fingerprint
I='sha256:'+'a'*64;OLD='sha256:'+'b'*64
PLAN={'schema':1,'route':'A','base':'0'*40,'head':'1'*40,'changed':['frontend'],'components':{c:{'base':'b'*64,'candidate':'a'*64 if c=='frontend' else 'b'*64} for c in ['frontend','backend']},'tools':{k:k+'hash' for k in ['policy','browser','executor','scan','build','frontendChecks','backendChecks']},'surfaces':['home'],'changes':[{'file':'server-version/frontend/src/training/training-workspace-refresh.css'}],'required':['policy','frontend-checks','frontend-scan','frontend-browser','compatibility','rollback','readiness']}
class Clock:
    value=0
    def now(self):return self.value
    def sleep(self,n):self.value+=n
class TestEvidence(unittest.TestCase):
    def test_fail_missing_failed_cancelled_skipped_and_duplicate(self):
        p=PLAN;images={'frontend':I};configuration=digest({});rows=[record(p,k,images,configuration,'isolated') for k in p['required']]
        self.assertTrue(validate(p,rows,images,configuration))
        for state in [None,'failure','cancelled','skipped','neutral']:
            bad=copy.deepcopy(rows)
            if state is None:bad.pop()
            else:bad[0]['status']=state
            with self.assertRaises(ValueError):validate(p,bad,images,configuration)
        with self.assertRaises(ValueError):validate(p,rows+[rows[0]],images,configuration)
    def test_component_config_tool_image_parameters_expire_exactly(self):
        p=copy.deepcopy(PLAN);images={'frontend':I};configuration=digest({});r=record(p,'frontend-browser',images,configuration,'run')
        for field in ['component','tool','surface','image','configuration']:
            q=copy.deepcopy(p);im=images.copy();cfg=configuration
            if field=='component':q['components']['frontend']['candidate']='c'*64
            if field=='tool':q['tools']['browser']='new'
            if field=='surface':q['surfaces']=['auth']
            if field=='image':im['frontend']=OLD
            if field=='configuration':cfg=digest({'changed':1})
            with self.assertRaises(ValueError):validate(q,[r],im,cfg,required=['frontend-browser'])
        # Unrelated backend-only change does not counterfeit frontend acceptance.
        q=copy.deepcopy(p);q['components']['backend']['candidate']='c'*64
        self.assertTrue(validate(q,[r],images,configuration,required=['frontend-browser']))
        with self.assertRaises(ValueError):validate(p,[r],images,configuration,now=r['completedAt']+86401,required=['frontend-browser'])
class TestWait(unittest.TestCase):
    def test_transient_is_bounded_and_differs_from_persistent(self):
        clock=Clock();seq=iter([ConnectionError(),{'version':'old'},{'version':'new'}])
        def probe():
            r=next(seq)
            if isinstance(r,Exception):raise r
            return r
        self.assertEqual(len(wait_ready(probe,{'version':'new'},clock=clock.now,sleep=clock.sleep)),3)
        clock=Clock()
        with self.assertRaises(TimeoutError):wait_ready(lambda:0,1,timeout=6,clock=clock.now,sleep=clock.sleep)
        self.assertEqual(clock.value,6)
    def test_unique_attempts_preserve_existing_backup(self):
        with tempfile.TemporaryDirectory() as d:
            a=attempt(Path(d));(a/'backup.gcm').write_bytes(b'first')
            b=attempt(Path(d));self.assertNotEqual(a,b);self.assertEqual((a/'backup.gcm').read_bytes(),b'first')
class TestIsolatedHTTP(unittest.TestCase):
    def test_success_failure_rollback_retry_real_http_and_unchanged_backend(self):
        state={'version':OLD};calls=[]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200);self.end_headers();self.wfile.write(state['version'].encode())
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        class Adapter:
            def current(self):return {'services':{'frontend':{'image':state['version']},'backend':{'image':OLD},'worker':{'image':OLD}}}
            def switch(self,images):calls.append(images);state['version']=images['frontend']
            def verify_images(self,images):assert state['version']==images['frontend']
        def probe():
            with urllib.request.urlopen('http://127.0.0.1:'+str(server.server_port),timeout=2) as r:return r.read().decode()
        try:
            cfg={'baseHead':PLAN['base'],'baseImages':{c:OLD for c in ['frontend','backend','worker']},'oldReady':OLD,'samples':2,'sampleInterval':0};images={'frontend':I};configuration=configuration_fingerprint(Adapter().current(),PLAN['changed'])
            receipt={'head':PLAN['head'],'environment':'candidate','images':images,'ready':I,'records':[record(PLAN,k,images,configuration,'synthetic-http') for k in PLAN['required']]}
            with tempfile.TemporaryDirectory() as d:
                root=Path(d);a=Release(Adapter(),probe,lambda:True,sleep=lambda _:None).apply(root,PLAN,receipt,cfg)
                self.assertEqual(json.loads((a/'result.json').read_text())['status'],'APPLICATION_COMPLETE')
                count=len(calls)
                self.assertEqual(Release(Adapter(),probe,lambda:True,sleep=lambda _:None).apply(root,PLAN,receipt,cfg),a)
                self.assertEqual(len(calls),count)
                state['version']=OLD
                with self.assertRaises(ValueError):Release(Adapter(),probe,lambda:False,sleep=lambda _:None).apply(root,PLAN,receipt,cfg)
                self.assertEqual(probe(),OLD)
                b=Release(Adapter(),probe,lambda:True,sleep=lambda _:None).apply(root,PLAN,receipt,cfg)
                self.assertNotEqual(a,b);self.assertEqual(len(list(root.glob('*/result.json'))),3)
                self.assertTrue(all(set(c)=={'frontend'} for c in calls))
        finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
