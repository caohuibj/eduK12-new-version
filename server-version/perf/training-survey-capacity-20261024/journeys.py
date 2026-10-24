from client import *
import uuid
F=json.loads((P/'fixtures.json').read_text())
async def training_open(a):
 r=await a.call('/composite-assessments/'+F['questionnaire']+'/attempts','POST',{},label='training.open')
 return r['attempt']
async def training_finish(a,state,retry=None):
 call=retry or a.call;b='/composite-assessments/attempts/'+state['id'];cur=state['currentItem']
 assert cur['type']=='SCALE';assert state['status']=='IN_PROGRESS'
 payload={'submissionId':str(uuid.uuid4()),'attemptEpoch':state['attemptEpoch'],'definitionHash':cur['definitionHash'],'contextSnapshotHash':state.get('contextSnapshotHash'),'answers':[{'itemCode':x['itemCode'],'responseValue':3} for x in cur['scale']['definition']['items']]}
 receipt=await call(b+'/items/'+cur['id']+'/scale/submit','POST',payload,label='training.scale_final')
 # The UI refreshes the authoritative attempt after each unit submission.
 state=await a.call(b,label='training.after_scale')
 for section in state['formSections']:
  payload={'submissionId':str(uuid.uuid4()),'attemptEpoch':state['attemptEpoch'],'definitionHash':section['definitionHash'],'contextSnapshotHash':state.get('contextSnapshotHash'),'answers':[{'formItemId':x['formItemId'],'value':'合成记录' if x['type']=='text_input' else x['options'][0]['value']} for x in section['items']]}
  receipt=await call(b+'/form-sections/'+section['id']+'/submit','POST',payload,label='training.form_final')
  state=await a.call(b,label='training.after_form')
 assert state['status']=='COMPLETED',state['status']
 return {'id':state['id'],'status':state['status'],'progress':state['progress']}
async def survey_open(a,info=True):
 b='/public/survey/r/'+F['surveyPublicId']
 a.csrf=(await a.call('/survey/auth/csrf',label='survey.csrf'))['csrfToken']
 if info:await a.call(b+'/info','POST',{'entryToken':F['surveyEntryToken']},label='survey.info')
 s=await a.call(b+'/waves/'+F['surveyWave']+'/start-unlinked','POST',{'entryToken':F['surveyEntryToken'],'consent':True,'consentVersion':F['surveyConsentVersion']},label='survey.open')
 task=await a.call(b+'/attempts/'+s['attemptId']+'/task','POST',{'accessCredential':s['accessCredential']},label='survey.task')
 return {'start':s,'task':task}
async def survey_finish(a,state,retry=None):
 call=retry or a.call;start=state['start'];task=state['task'];answers={}
 for u in task['units']:
  if u['kind']=='SCALE':answers[u['instrumentKey']]={x['itemKey']:'o3' for x in u['items']}
  elif u['kind']=='FORM':answers[u['instrumentKey']]={q['itemKey']:('a' if q['type']=='SINGLE' else '合成记录') for p in u['pages'] for q in p['questions']}
  else:raise ValueError('Unsupported profile unit')
 b='/public/survey/r/'+F['surveyPublicId']+'/attempts/'+start['attemptId'];proof={'accessCredential':start['accessCredential']}
 receipt=await call(b+'/final','POST',{**proof,'submissionId':str(uuid.uuid4()),'answers':answers},label='survey.final')
 assert receipt['status']=='COMPLETED' and receipt['receiptId'] and receipt['idempotent'] is False
 general=await a.call(b+'/general','POST',proof,label='survey.feedback')
 assert general['kind']=='GENERAL_ONLY'
 return {'id':start['attemptId'],'status':receipt['status'],'receiptId':receipt['receiptId']}
async def probe():
 out={};rec=[];t=API('training',rec);t.restore(json.loads((P/'probe-training-session.json').read_text()));s=API('survey',rec)
 try:
  state=json.loads((P/'probe-training-start.json').read_text())['attempt'];out['training']=await training_finish(t,state)
  state=await survey_open(s);out['survey']=await survey_finish(s,state)
 finally:await t.close();await s.close()
 (W/'evidence/single-user-journey.json').write_text(json.dumps({'result':out,'requests':rec},ensure_ascii=False,indent=2));print(json.dumps({'verified':list(out),'requests':rec}))
if __name__=='__main__':asyncio.run(probe())
