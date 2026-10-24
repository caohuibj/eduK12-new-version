from client import *
import http.client,subprocess,shutil,psutil,datetime
class DockerHTTP(http.client.HTTPConnection):
 def __init__(self):super().__init__('localhost',timeout=8)
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(self.timeout);self.sock.connect('/var/run/docker.sock')
def docker(path):
 c=DockerHTTP();c.request('GET',path);r=c.getresponse();v=json.loads(r.read());c.close();assert r.status==200,(path,r.status);return v
PREFIX='eduk12-capacity-20261024-'
class Monitor:
 def __init__(self,name):
  self.name=name;self.samples=[];self.metrics=[];self.stop=asyncio.Event();self.phase='prepare';self.previous={};self.started=time.perf_counter();self.error=None
  self.containers={x['Labels']['com.docker.compose.service']:x['Id'] for x in docker('/containers/json') if x.get('Labels',{}).get('com.docker.compose.project')=='eduk12-capacity-20261024'}
  assert set(self.containers)=={'backend','frontend','postgres','redis'}
  meta={k:docker('/containers/'+v+'/json') for k,v in self.containers.items()}
  assert all(v['HostConfig']['CpusetCpus']=='0-3' for v in meta.values());assert sum(v['HostConfig']['Memory'] for v in meta.values())==3328*1024**2
  ip=next(iter(meta['backend']['NetworkSettings']['Networks'].values()))['IPAddress'];assert ip.startswith('172.') or ip.startswith('192.168.')
  self.metricURL='http://'+ip+':3000/metrics';self.limits={k:v['HostConfig']['Memory'] for k,v in meta.items()}
  (W/'evidence'/('resource-config-'+name+'.json')).write_text(json.dumps({k:{'id':v['Id'],'image':v['Image'],'cpuset':v['HostConfig']['CpusetCpus'],'memory':v['HostConfig']['Memory'],'swap':v['HostConfig']['MemorySwap'],'ports':v['HostConfig']['PortBindings']} for k,v in meta.items()},indent=2))
 async def run(self):
  async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
   while not self.stop.is_set():
    t=time.perf_counter();row={'s':round(t-self.started,3),'phase':self.phase,'services':{},'driverRSSMiB':psutil.Process().memory_info().rss/2**20,'hostCPUpct':psutil.cpu_percent()}
    for k,ident in self.containers.items():
     st=await asyncio.to_thread(docker,'/containers/'+ident+'/stats?stream=false&one-shot=true');cpu=st['cpu_stats']['cpu_usage']['total_usage'];memory=st['memory_stats'];use=memory.get('usage',0);cache=memory.get('stats',{}).get('inactive_file',0);old=self.previous.get(k);pc=(cpu-old[1])/((t-old[0])*1e9)*100 if old else None;self.previous[k]=(t,cpu)
     row['services'][k]={'cpuPercent':pc,'memoryMiB':use/2**20,'workingMiB':(use-cache)/2**20,'pids':st.get('pids_stats',{}).get('current',0)}
     if use>self.limits[k]*.90:self.error='memory90:'+k
    if shutil.disk_usage(W).free<4*1024**3:self.error='disk reserve <4GiB'
    try:
     async with session.get(self.metricURL) as r:metric=await r.text();assert r.status==200
     self.metrics.append({'s':row['s'],'phase':self.phase,'text':metric})
    except Exception as e:row['metricsError']=type(e).__name__
    self.samples.append(row)
    try:await asyncio.wait_for(self.stop.wait(),timeout=max(.1,2-(time.perf_counter()-t)))
    except asyncio.TimeoutError:pass
 async def close(self,task):
  self.stop.set();await task
  (W/'evidence'/('resources-'+self.name+'.json')).write_text(json.dumps(self.samples,indent=2));(W/'evidence'/('metrics-'+self.name+'.json')).write_text(json.dumps(self.metrics))
  return {'samples':len(self.samples),'peakMemoryMiB':{k:round(max(x['services'][k]['memoryMiB'] for x in self.samples),1) for k in self.containers},'peakCpuPercent':{k:round(max(x['services'][k]['cpuPercent'] or 0 for x in self.samples),1) for k in self.containers},'stop':self.error}
def pg_snapshot():
 sql="SELECT json_build_object('database',current_database(),'xact_commit',xact_commit,'xact_rollback',xact_rollback,'blks_read',blks_read,'blks_hit',blks_hit,'tup_returned',tup_returned,'tup_fetched',tup_fetched,'tup_inserted',tup_inserted,'tup_updated',tup_updated,'deadlocks',deadlocks,'temp_bytes',temp_bytes,'db_bytes',pg_database_size(current_database()),'wal_lsn',pg_current_wal_lsn(),'active',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active'),'waitLock',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),'connections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database())) FROM pg_stat_database WHERE datname=current_database();"
 r=subprocess.run(['docker','compose','-f',str(W/'compose.yml'),'exec','-T','postgres','psql','-U','eduk12_owner','-d','eduk12_capacity_20261024','-Atc',sql],text=True,capture_output=True,check=True);return json.loads(r.stdout)
def summarize(records):
 def pct(a,p):return round(sorted(a)[max(0,__import__('math').ceil(len(a)*p)-1)],2) if a else None
 out={}
 for label in sorted(set(x['label'] for x in records)):
  a=[x for x in records if x['label']==label];d=[x['ms'] for x in a];ok=[x for x in a if x['status']==200 and x['code']==0]
  out[label]={'count':len(a),'success':len(ok),'statuses':{str(s):sum(x['status']==s for x in a) for s in set(x['status'] for x in a)},'p50ms':pct(d,.5),'p95ms':pct(d,.95),'p99ms':pct(d,.99),'maxms':max(d),'decodedBytes':sum(x['bytes'] for x in a)}
 return out
