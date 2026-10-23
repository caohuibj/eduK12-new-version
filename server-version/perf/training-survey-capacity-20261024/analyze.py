from pathlib import Path
import json,re,hashlib,math,os
W=Path(os.environ['EDUK12_CAPACITY_WORK_DIR']).resolve();E=W/'evidence'
def metric(text,name):
 rows=[l for l in text.splitlines() if l.startswith(name+' ') or l.startswith(name+'{')]
 return sum(float(l.rsplit(' ',1)[1]) for l in rows)
def main():
 out={'baseMain':'902144e636905ab372ff4a0c7cbfd1b88bffba47','stages':[],'browser':{},'login':{}}
 for p in sorted(E.glob('stage-*.json')):
  d=json.loads(p.read_text());name=d['name'];res=json.loads((E/('resources-'+name+'.json')).read_text());ms=json.loads((E/('metrics-'+name+'.json')).read_text());first,last=ms[0]['text'],ms[-1]['text']
  q=metric(last,'prisma_datasource_queries_total')-metric(first,'prisma_datasource_queries_total');calls=metric(last,'ptool_prisma_call_duration_seconds_count')-metric(first,'ptool_prisma_call_duration_seconds_count');cpu=metric(last,'process_cpu_seconds_total')-metric(first,'process_cpu_seconds_total');busy=max(metric(x['text'],'prisma_pool_connections_busy') for x in ms)
  delay=max(float(l.rsplit(' ',1)[1])*1000 for x in ms for l in x['text'].splitlines() if l.startswith('ptool_nodejs_event_loop_delay_seconds{quantile="0.99"}'))
  out['stages'].append({'name':name,'users':d.get('users',d.get('activeUsers')),'completed':d['completed'],'errors':d['errors'],'p95ms':{k:v['p95ms'] for k,v in d['summary'].items()},'requestCounts':{k:v['count'] for k,v in d['summary'].items()},'background':d['background'],'observedPeakTotalMemoryMiB':round(max(sum(s['memoryMiB'] for s in x['services'].values()) for x in res),1),'observedPeakTotalWorkingMiB':round(max(sum(s['workingMiB'] for s in x['services'].values()) for x in res),1),'observedPeakTotalCpuPercent':round(max(sum(s['cpuPercent'] or 0 for s in x['services'].values()) for x in res),1),'processCpuSeconds':round(cpu,3),'prismaDatasourceQueries':q,'prismaMiddlewareCalls':calls,'observedPeakPoolBusy':busy,'observedPeakEventLoopP99ms':round(delay,2),'dbBytesAdded':d['dbAfter']['db_bytes']-d['dbBefore']['db_bytes'],'deadlocksAdded':d['dbAfter']['deadlocks']-d['dbBefore']['deadlocks'],'rollbackAdded':d['dbAfter']['xact_rollback']-d['dbBefore']['xact_rollback'],'durationSeconds':d.get('durationSeconds',d.get('durationIncludingDrainSeconds'))})
 for p in E.glob('browser-*.json'):
  d=json.loads(p.read_text());out['browser'][p.stem.removeprefix('browser-')]={x['label']:{k:x[k] for k in ['readyMs','apiCount','jsWireBytes']} for x in d['phases']}
 for p in E.glob('login-workers*.json'):
  d=json.loads(p.read_text());out['login'][d['name']]={k:d[k] for k in ['levels','background','resources']}
 out['rawEvidence']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(E.glob('*.json')) if p.name!='summary.json'}
 (E/'summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'stages':[{k:x[k] for k in ['name','users','completed','observedPeakTotalMemoryMiB','observedPeakPoolBusy','prismaDatasourceQueries','observedPeakEventLoopP99ms']} for x in out['stages']],'browser':out['browser']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
