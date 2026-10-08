import importlib.util,json,multiprocessing,os,pathlib,tempfile,time,unittest
spec=importlib.util.spec_from_file_location('hostlease',pathlib.Path(__file__).with_name('host-lease.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def request(name,lane,memory,exclusive=False):
 return dict(id=name,lane=lane,memory_mib=memory,exclusive=exclusive,pid=os.getpid(),stamp=m.process_stamp(os.getpid()),order=time.time_ns())

def child_acquire(root,name,lane,memory,exclusive,events,hold):
 r=request(name,lane,memory,exclusive);events.put(('queued',name,time.monotonic()));m.acquire(root,r,8192,1024,timeout=5,poll=.01);events.put(('start',name,time.monotonic()));time.sleep(hold);events.put(('end',name,time.monotonic()));m.release(root,name)

class LeaseTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)/'host';self.root.mkdir(mode=0o700)
 def tearDown(self):self.temp.cleanup()
 def test_safe_light_heavy_overlap_and_budget(self):
  active=request('heavy','win-heavy',6144);light=request('static','win-light',768);codeql=request('codeql','win-light',4096)
  state={'active':[active],'waiting':[light]};self.assertTrue(m.may_start(state,light,8192,1024));self.assertFalse(m.may_start({'active':[active],'waiting':[codeql]},codeql,8192,1024))
 def test_two_heavy_jobs_never_overlap_even_with_large_memory(self):
  a=request('a','win-heavy',6144);b=request('b','win-heavy',6144);self.assertFalse(m.may_start({'active':[a],'waiting':[b]},b,32768,1024))
 def test_exclusive_intent_blocks_new_light_and_drains_active(self):
  a=request('running','win-light',768);p=request('perf','win-heavy',6144,True);n=request('next','win-light',768);state={'active':[a],'waiting':[p,n]}
  self.assertFalse(m.may_start(state,n,32768,1024));self.assertFalse(m.may_start(state,p,32768,1024));state['active']=[];self.assertTrue(m.may_start(state,p,32768,1024))
 def test_real_processes_wait_for_host_exclusive_then_resume(self):
  q=multiprocessing.Queue();p=multiprocessing.Process(target=child_acquire,args=(str(self.root),'perf','win-heavy',6144,True,q,.2));p.start();first=q.get(timeout=2);second=q.get(timeout=2);self.assertEqual(second[:2],('start','perf'))
  n=multiprocessing.Process(target=child_acquire,args=(str(self.root),'new-light','win-light',768,False,q,.01));n.start();events=[first,second]+[q.get(timeout=3) for _ in range(4)];p.join(2);n.join(2);self.assertEqual(p.exitcode,0);self.assertEqual(n.exitcode,0)
  times={(kind,name):when for kind,name,when in events};self.assertGreaterEqual(times['start','new-light'],times['end','perf']);self.assertEqual(json.loads((self.root/'admission.json').read_text())['active'],[])
 def test_dead_or_reused_pid_does_not_hold_capacity(self):
  r=request('old','win-heavy',6144);r['stamp']='different process';(self.root/'admission.json').write_text(json.dumps({'version':1,'active':[r],'waiting':[]}))
  with m.state_lock(self.root)as state:self.assertEqual(state['active'],[])
 def test_rejects_symlinks_foreign_modes_and_overbudget(self):
  link=self.root/'link';link.symlink_to(self.root,target_is_directory=True);self.assertRaises(ValueError,m.assert_root,link)
  self.root.chmod(0o755);self.assertRaises(ValueError,m.assert_root,self.root);self.root.chmod(0o700)
  (self.root/'admission.json').symlink_to(self.root/'absent');self.assertRaises(ValueError,lambda:self.enter_lock());(self.root/'admission.json').unlink()
  self.assertRaises(ValueError,m.acquire,self.root,request('too-big','win-heavy',8192),8192,1024)
 def enter_lock(self):
  with m.state_lock(self.root):pass
 def test_duplicate_acquisition_cannot_release_running_job(self):
  running=request('running','win-heavy',6144);m.acquire(self.root,running,8192,1024)
  self.assertRaises(ValueError,m.acquire,self.root,running,8192,1024)
  with m.state_lock(self.root)as state:self.assertEqual(len(state['active']),1)
  m.release(self.root,'running')
 def test_timeout_removes_own_pending_exclusive_intent(self):
  running=request('running','win-light',4096);m.acquire(self.root,running,8192,1024)
  self.assertRaises(TimeoutError,m.acquire,self.root,request('timeout','win-heavy',6144,True),8192,1024,timeout=.03,poll=.01)
  with m.state_lock(self.root)as state:self.assertEqual(state['waiting'],[]);self.assertEqual(len(state['active']),1)
  m.release(self.root,'running')

if __name__=='__main__':unittest.main()
