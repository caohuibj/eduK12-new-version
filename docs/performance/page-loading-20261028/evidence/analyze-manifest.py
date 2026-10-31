import json,pathlib,gzip,hashlib
root=pathlib.Path.cwd();dist=root/'server-version/frontend/dist';m=json.loads((dist/'.vite/manifest.json').read_text());out=root.parent/'page-loading-evidence'
def find(name):
 keys=[k for k,v in m.items() if pathlib.PurePosixPath(v['file']).name.startswith(name+'-') and v['file'].endswith('.js')]
 assert len(keys)==1,(name,keys);return keys[0]
def closure(entries):
 seen=set();files=set()
 def visit(k):
  if k in seen:return
  seen.add(k);v=m[k];files.add(v['file']);files.update(v.get('css',[]))
  for x in v.get('imports',[]):visit(x)
 for k in entries:visit(k)
 return sorted(files)
rows=[]
for name,roots in [('Training app shell',[find('App')]),('Training homepage',[find('App'),find('TrainingPortal')]),('Training learner home',[find('App'),find('TrainingLearnerHome')]),('Training composite answer',[find('App'),'src/modules/composite/CompositeAssessmentPage.tsx']),('Training standalone scale answer',[find('App'),'src/pages/student/ScaleAssessment.tsx']),('Training composite report',[find('App'),'src/modules/composite/CompositeReportPage.tsx']),('School app homepage and shell',['src/school/SchoolApp.tsx']),('Teacher app homepage and shell',[find('HuiteacherApp')]),('Survey researcher entry',[find('SurveyApp')]),('Survey participant entry',[find('SurveyPublicApp')])]:
 files=closure(['index.html',*roots]);sizes=[{'file':p,'bytes':(dist/p).stat().st_size,'gzip1Bytes':len(gzip.compress((dist/p).read_bytes(),compresslevel=1,mtime=0)),'sha256':hashlib.sha256((dist/p).read_bytes()).hexdigest()}for p in files]
 row={'name':name,'rootEntries':roots,'files':sizes,'count':len(files),'rawBytes':sum(x['bytes']for x in sizes),'gzip1Bytes':sum(x['gzip1Bytes']for x in sizes)};rows.append(row)
 print(name,row['count'],row['rawBytes'],row['gzip1Bytes'])
 for s in sorted(sizes,key=lambda x:-x['gzip1Bytes'])[:4]:print(' ',s['file'],s['gzip1Bytes'])
(out/'main-entry-closures.json').write_text(json.dumps({'scope':'Built Vite static import plus CSS closure; excludes dynamic children not activated, public media/fonts, HTTP headers, runtime API traffic and cache reuse. Gzip level1 bytes estimate configured code compression, not network timing.','base':(out/'base.txt').read_text().strip(),'rows':rows},indent=2)+'\n')
