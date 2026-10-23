from journeys import *
from monitor import *
import sys,math
async def main(name):
 records=[];background=[];errors=[];outcomes=[];monitor=Monitor(name);mt=asyncio.create_task(monitor.run());stop=asyncio.Event();beg=time.perf_counter();accounts=F['students']
 async def teacher():
  a=API('training',background);a.restore(json.loads((P/'training-admin-session.json').read_text()))
  try:
   while not stop.is_set():
    try:await a.call('/questionnaire-products/workspace/courses/'+F['course'],label='teacher.during_login')
    except Exception as e:errors.append(str(e))
    try:await asyncio.wait_for(stop.wait(),.25)
    except asyncio.TimeoutError:pass
  finally:await a.close()
 task=asyncio.create_task(teacher())
 try:
  for n in [20,40,80]:
   monitor.phase='login-'+str(n);start=time.perf_counter();base=len(records)
   async def one(i):
    a=API('training',records);start=time.perf_counter()
    try:
     await a.login(**accounts[1400+i]);outcomes.append({'n':n,'success':True,'ms':(time.perf_counter()-start)*1000})
    except APIError as e:outcomes.append({'n':n,'success':False,'status':e.status,'retryAfter':e.retry,'message':e.message,'ms':(time.perf_counter()-start)*1000})
    finally:await a.close()
   await asyncio.gather(*(one(i) for i in range(n)));await asyncio.sleep(2)
   print(json.dumps({'n':n,'success':sum(x['n']==n and x['success'] for x in outcomes),'seconds':time.perf_counter()-start}),flush=True)
 finally:stop.set();await task;resource=await monitor.close(mt)
 d={'name':name,'duration':time.perf_counter()-beg,'summary':summarize(records),'background':summarize(background),'outcomes':outcomes,'errors':errors,'resources':resource,'noRetries':True,'levels':[]}
 for n in [20,40,80]:
  row=[x for x in outcomes if x['n']==n];good=sorted(x['ms'] for x in row if x['success']);bad=[x for x in row if not x['success']];d['levels'].append({'users':n,'success':len(good),'rejected':len(bad),'successfulP95ms':good[math.ceil(len(good)*.95)-1] if good else None,'rejectStatuses':{str(s):sum(x['status']==s for x in bad) for s in set(x['status'] for x in bad)}})
 (W/'evidence'/(name+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2));(W/'evidence'/('raw-'+name+'.json')).write_text(json.dumps(records));print(json.dumps({k:d[k] for k in ['levels','background','resources']}),flush=True)
if __name__=='__main__':asyncio.run(main(sys.argv[1]))
