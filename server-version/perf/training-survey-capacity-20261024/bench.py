from journeys import *
from monitor import Monitor,pg_snapshot,summarize
import argparse,datetime,math,psutil
async def stage(n,offset,name,duration=60):
 records=[];errors=[];results=[];pre=await asyncio.to_thread(pg_snapshot);monitor=Monitor(name);mt=asyncio.create_task(monitor.run());start=time.perf_counter();apis=[];states={};session_states=json.loads((P/'student-sessions.json').read_text());lag=[];teacher_records=[];stopbg=asyncio.Event()
 async def clock():
  target=time.perf_counter()+.1
  while not stopbg.is_set():
   await asyncio.sleep(max(0,target-time.perf_counter()));lag.append(max(0,time.perf_counter()-target)*1000);target+=.1
 async def background():
  t=API('training',teacher_records);s=API('survey',teacher_records);t.restore(json.loads((P/'training-admin-session.json').read_text()));s.restore(json.loads((P/'survey-admin-session.json').read_text()))
  try:
   while not stopbg.is_set():
    for a,p,l in [(t,'/questionnaire-products/workspace/courses/'+F['course'],'teacher.course_query'),(s,'/survey/projects','researcher.project_query')]:
     try:await a.call(p,label=l)
     except Exception as e:errors.append({'phase':'background','label':l,'error':str(e)})
    try:await asyncio.wait_for(stopbg.wait(),3)
    except asyncio.TimeoutError:pass
  finally:await t.close();await s.close()
 bg=asyncio.create_task(background());clk=asyncio.create_task(clock())
 async def opening(i):
  realm='training' if i%2==0 else 'survey';a=API(realm,records);apis.append(a);beg=time.perf_counter()
  try:
   if realm=='training':
    a.restore(session_states[str(offset+i//2)])
    await a.call('/questionnaire-products/available',label='training.available')
    st=await training_open(a)
   else:st=await survey_open(a)
   states[i]=(a,st);results.append({'i':i,'realm':realm,'phase':'open','ms':round((time.perf_counter()-beg)*1000,3),'success':True})
  except Exception as e:
   errors.append({'i':i,'realm':realm,'phase':'open','error':str(e)});results.append({'i':i,'realm':realm,'phase':'open','ms':round((time.perf_counter()-beg)*1000,3),'success':False})
 async def finish(i):
  a,st=states[i];beg=time.perf_counter()
  try:
   result=await (training_finish(a,st) if a.realm=='training' else survey_finish(a,st));results.append({'i':i,'realm':a.realm,'phase':'complete','ms':round((time.perf_counter()-beg)*1000,3),'success':True,'result':result})
  except Exception as e:errors.append({'i':i,'realm':a.realm,'phase':'complete','error':str(e)});results.append({'i':i,'realm':a.realm,'phase':'complete','ms':round((time.perf_counter()-beg)*1000,3),'success':False})
 resources=None
 try:
  await asyncio.sleep(1);monitor.phase='open';await asyncio.gather(*(opening(i) for i in range(n)))
  monitor.phase='local-answer-no-HTTP';await asyncio.sleep(10)
  monitor.phase='synchronized-final';await asyncio.gather(*(finish(i) for i in states))
  monitor.phase='observe-recovery';remain=duration-(time.perf_counter()-start)
  if remain>0:await asyncio.sleep(remain)
 finally:
  stopbg.set();await bg;await clk
  for a in apis:await a.close()
  resources=await monitor.close(mt)
 post=await asyncio.to_thread(pg_snapshot);summ=summarize(records);violations=[]
 for label,v in summ.items():
  if v['success']<v['count']:violations.append(label+': non-success')
  target=2000 if 'final' in label else 1000
  if v['p95ms']>target:violations.append(label+': p95>'+str(target)+'ms')
 if monitor.error:violations.append(monitor.error)
 verdict={'name':name,'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'users':n,'trainingUsers':math.ceil(n/2),'surveyUsers':n//2,'offset':offset,'durationSeconds':round(time.perf_counter()-start,2),'flow':'All participants open together; 10s local answer interval with zero participant HTTP; all final together; one teacher and one researcher refresh each 3s.','summary':summ,'background':summarize(teacher_records),'completed':sum(x['phase']=='complete' and x['success'] for x in results),'errors':errors,'violations':violations,'resources':resources,'dbBefore':pre,'dbAfter':post,'driverLagP95ms':sorted(lag)[math.ceil(len(lag)*.95)-1] if lag else None,'driverLagMaxms':max(lag or [0])}
 (W/'evidence'/('stage-'+name+'.json')).write_text(json.dumps(verdict,ensure_ascii=False,indent=2));(W/'evidence'/('raw-'+name+'.json')).write_text(json.dumps({'requests':records,'background':teacher_records,'outcomes':results},ensure_ascii=False,indent=2));print(json.dumps({k:verdict[k] for k in ['name','users','completed','errors','violations','resources','driverLagP95ms']}),flush=True)
 return verdict
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--levels',default='10,25,50,100,200,400,800');parser.add_argument('--offset',type=int,default=1);parser.add_argument('--name',default='baseline');parser.add_argument('--seconds',type=int,default=60);args=parser.parse_args();offset=args.offset;out=[]
 for n in map(int,args.levels.split(',')):
  r=await stage(n,offset,args.name+'-'+str(n),args.seconds);out.append(r);offset+=math.ceil(n/2)
  if r['violations'] or r['errors']:break
 (W/'evidence'/('ladder-'+args.name+'.json')).write_text(json.dumps({'levels':[{'name':r['name'],'users':r['users'],'completed':r['completed'],'violations':r['violations']} for r in out],'nextStudentOffset':offset},indent=2))
if __name__=='__main__':asyncio.run(main())
