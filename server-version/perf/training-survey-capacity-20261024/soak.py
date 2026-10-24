from journeys import *
from monitor import *
import math
async def main():
 n=40;seconds=180;name='candidate-soak-40';records=[];errors=[];results=[];sessions=json.loads((P/'student-sessions.json').read_text());counter=300;monitor=Monitor(name);mt=asyncio.create_task(monitor.run());started=time.perf_counter();until=started+seconds;before=await asyncio.to_thread(pg_snapshot);background=[];stop=asyncio.Event();monitor.phase='continuous40-local-answers-20to40s'
 async def teachers():
  t=API('training',background);t.restore(json.loads((P/'training-admin-session.json').read_text()));s=API('survey',background);s.restore(json.loads((P/'survey-admin-session.json').read_text()))
  try:
   while not stop.is_set():
    for a,path,label in [(t,'/questionnaire-products/workspace/courses/'+F['course'],'teacher.course_query'),(s,'/survey/projects','researcher.project_query')]:
     try:await a.call(path,label=label)
     except Exception as e:errors.append({'phase':'background','error':str(e)})
    try:await asyncio.wait_for(stop.wait(),3)
    except asyncio.TimeoutError:pass
  finally:await t.close();await s.close()
 bg=asyncio.create_task(teachers())
 async def worker(i):
  nonlocal counter
  await asyncio.sleep(i*.12);cycle=0
  while time.perf_counter()<until and not monitor.error:
   a=API('training' if i%2==0 else 'survey',records);begin=time.perf_counter()
   try:
    if a.realm=='training':
     account=counter;counter+=1;a.restore(sessions[str(account)]);await a.call('/questionnaire-products/available',label='training.available');state=await training_open(a)
    else:state=await survey_open(a)
    opening=(time.perf_counter()-begin)*1000
    # No participant HTTP while answering; not a shortened timed/cognitive task.
    think=20+((i*7+cycle*11)%21);await asyncio.sleep(think)
    finish=time.perf_counter();r=await (training_finish(a,state) if a.realm=='training' else survey_finish(a,state));results.append({'realm':a.realm,'openMs':opening,'finishMs':(time.perf_counter()-finish)*1000,'thinkSeconds':think,'result':r})
   except Exception as e:errors.append({'worker':i,'cycle':cycle,'realm':a.realm,'error':str(e)});break
   finally:await a.close()
   cycle+=1
 try:await asyncio.gather(*(worker(i) for i in range(n)))
 finally:
  stop.set();await bg;resource=await monitor.close(mt)
 after=await asyncio.to_thread(pg_snapshot);d={'name':name,'activeUsers':n,'trainingUsers':20,'surveyUsers':20,'arrivalWindowSeconds':180,'durationIncludingDrainSeconds':time.perf_counter()-started,'thinkSeconds':[20,40],'completed':len(results),'errors':errors,'summary':summarize(records),'background':summarize(background),'resources':resource,'dbBefore':before,'dbAfter':after,'nextStudentOffset':counter}
 (W/'evidence'/('stage-'+name+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2));(W/'evidence'/('raw-'+name+'.json')).write_text(json.dumps({'outcomes':results,'requests':records},ensure_ascii=False));print(json.dumps({'completed':len(results),'errors':errors,'resources':resource,'p95':{k:v['p95ms'] for k,v in d['summary'].items()}}),flush=True)
if __name__=='__main__':asyncio.run(main())
