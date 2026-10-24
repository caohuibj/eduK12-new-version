from client import *
import subprocess,secrets,uuid
old=json.loads((ROOT/'private/access-perf-fixture.json').read_text());F=P/'fixtures.json'
state=json.loads(F.read_text()) if F.exists() else {'synthetic':True,'course':old['course_id'],'questionnaire':old['questionnaires'][0]['id'],'students':[]}
if not state['students']:
 password=secrets.token_urlsafe(24)+'Aa7!';state['students']=[{'username':f'capacity_20261024_{i:04d}','password':password} for i in range(1600)];save_private(F,state)
node="""const fs=require('fs'),assert=require('assert/strict'),bcrypt=require('bcryptjs');const {PrismaClient}=require('@prisma/client');const v=JSON.parse(fs.readFileSync(0,'utf8'));assert.equal(new URL(process.env.DATABASE_URL).pathname,'/eduk12_capacity_20261024');const d=new PrismaClient();(async()=>{const c=await d.course.findUniqueOrThrow({where:{id:v.course},include:{creator:true}});assert.equal(c.creator.username,'preview_trainer');const h=await bcrypt.hash(v.students[0].password,10);for(let i=0;i<v.students.length;i+=100){const batch=v.students.slice(i,i+100);batch.forEach(a=>assert.match(a.username,/^capacity_20261024_[0-9]{4}$/));await d.user.createMany({data:batch.map(a=>({id:require('crypto').randomUUID(),username:a.username,passwordHash:h,accountDomain:'TRAINING',role:'STUDENT',expiresAt:new Date(Date.now()+8*3600000)})),skipDuplicates:true});const users=await d.user.findMany({where:{username:{in:batch.map(a=>a.username)}},select:{id:true,username:true,role:true}});assert(users.every(a=>a.role==='STUDENT'));await d.courseStudent.createMany({data:users.map(a=>({id:require('crypto').randomUUID(),courseId:v.course,studentId:a.id,status:'ACTIVE'})),skipDuplicates:true});}console.log(JSON.stringify({syntheticStudents:v.students.length,courseEnrollments:v.students.length,ttlHours:8,sharedFixturePasswordHashCost:10}));})().finally(()=>d.$disconnect())"""
if not state.get('seeded'):
 subprocess.run(['docker','compose','-f',str(W/'compose.yml'),'exec','-T','backend','node','-e',node],input=json.dumps(state),text=True,check=True);state['seeded']=True;save_private(F,state)
async def main():
 s=API('survey');s.restore(json.loads((P/'survey-admin-session.json').read_text()))
 try:
  if not state.get('surveyProject'):
   row=await s.call('/survey/projects','POST',{'requestId':str(uuid.uuid4()),'title':'4C4G容量测试（仅合成）','description':'独立云端容量测量，无真实参与者或心理诊断。','collectionMode':'SINGLE_UNLINKED'});state['surveyProject']=row['id'];save_private(F,state)
  b='/survey/projects/'+state['surveyProject'];state.setdefault('surveyInstruments',{})
  defs={'scale':{'kind':'SCALE','title':'60条合成体验量表（容量测试）','definition':{'schemaVersion':1,'presentationMode':'ALL_AT_ONCE','respondentType':'participant_self_report','responseOptions':[{'optionKey':'o'+str(i),'label':'合成选项 '+str(i),'score':i} for i in range(1,6)],'dimensions':[{'dimensionKey':'experience','label':'合成体验','direction':'descriptive'}],'aggregation':'mean','items':[{'itemKey':'i'+str(i),'prompt':'合成软件体验问题 '+str(i),'required':True,'reverse':False,'dimensionKeys':['experience']} for i in range(1,61)]}},'form':{'kind':'FORM','title':'合成分页表单','definition':{'schemaVersion':1,'pages':[{'pageKey':'p'+str(i),'title':'第'+str(i)+'页','questions':[{'itemKey':'choice'+str(i),'type':'SINGLE','prompt':'合成体验','required':True,'options':[{'optionKey':'a','label':'专注'},{'optionKey':'b','label':'平静'}],'rows':[]},{'itemKey':'note'+str(i),'type':'SHORT_TEXT','prompt':'合成记录','required':True,'maxLength':200,'options':[],'rows':[]}]} for i in [1,2]]}}}
  for k,v in defs.items():
   if k not in state['surveyInstruments']:
    row=await s.call(b+'/instruments','POST',{'requestId':str(uuid.uuid4()),'kind':v['kind'],'title':v['title'],'instrumentKey':k});state['surveyInstruments'][k]={'id':row['id']};save_private(F,state)
   x=state['surveyInstruments'][k];ib=b+'/instruments/'+x['id']
   if not x.get('saved'):
    row=await s.call(ib);await s.call(ib,'PATCH',{'revision':row['revision'],'title':v['title'],'definition':v['definition']});x['saved']=True;save_private(F,state)
   if k=='scale' and not x.get('released'):
    row=await s.call(ib);await s.call(ib+'/measurement-release','POST',{'revision':row['revision']});x['released']=True;save_private(F,state)
  if not state.get('surveyWave'):
   row=await s.call(b+'/waves','POST',{'requestId':str(uuid.uuid4()),'title':'60条量表与分页表单容量轮次','consentText':'本轮仅为独立云端合成软件容量测试，无真实个人数据，不提供心理诊断，可以随时停止。','generalText':'谢谢，合成容量测评已完成。','instrumentIds':[x['id'] for x in state['surveyInstruments'].values()]});state['surveyWave']=row['id'];save_private(F,state)
  wb=b+'/waves/'+state['surveyWave'];wave=await s.call(wb)
  if wave['status']=='DRAFT':
   pre=await s.call(wb+'/preflight','POST',{});assert pre['ok'];await s.call(wb+'/prepare','POST',{'revision':wave['revision']});wave=await s.call(wb)
  if wave['status']!='OPEN':state['researchUrl']=(await s.call(wb+'/open','POST',{'revision':wave['revision']}))['researchUrl'];save_private(F,state)
  t=API('training');t.restore(json.loads((P/'training-admin-session.json').read_text()))
  q=await t.call('/questionnaire-products/'+state['questionnaire']);save_private(P/'training-product.json',q);await t.close()
  print(json.dumps({'syntheticStudents':len(state['students']),'surveyWave':'OPEN','scaleItems':60,'scalePresentation':'ALL_AT_ONCE','formPages':2,'trainingProduct':{'kind':q.get('questionnaireType'),'status':q.get('status'),'keys':list(q)}}))
 finally:await s.close()
if __name__=='__main__':asyncio.run(main())
