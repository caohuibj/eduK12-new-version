from client import *
from playwright.sync_api import sync_playwright,expect
from urllib.parse import urlsplit,urlunsplit
import sys,re
F=json.loads((P/'fixtures.json').read_text())
def main(name):
 out={'profile':{'latencyMs':100,'downloadBps':500000,'uploadBps':250000,'rendererCPUThrottle':4,'loadGeneratorCPU':[4]},'phases':[],'errors':[]}
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-proxy-server','--ignore-certificate-errors-spki-list='+(ROOT/'access-optimization/test-tls-spki.txt').read_text().strip(),'--host-resolver-rules=MAP training.eduk12.top 127.0.0.1, MAP survey.eduk12.top 127.0.0.1, MAP * ~NOTFOUND'])
  def context(realm,session=None):
   c=browser.new_context(locale='zh-CN',viewport={'width':1440,'height':1000});base='https://'+realm+'.eduk12.top:6681'
   if session:c.add_cookies([{'name':x['name'],'value':x['value'],'domain':x['domain'],'path':x['path'],'secure':True} for x in session['cookies']])
   page=c.new_page();page.on('pageerror',lambda e:out['errors'].append(str(e)[:200]));cdp=c.new_cdp_session(page);cdp.send('Network.enable');cdp.send('Performance.enable');cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':100,'downloadThroughput':500000,'uploadThroughput':250000,'connectionType':'cellular4g'});cdp.send('Emulation.setCPUThrottlingRate',{'rate':4});return c,page,base
  def measure(page,label,action,ready,nav=False):
   page.evaluate('performance.clearResourceTimings()');beg=time.perf_counter();action();ready();ms=(time.perf_counter()-beg)*1000;page.wait_for_timeout(300)
   rows=page.evaluate("nav=>[...performance.getEntriesByType('resource'),...(nav?performance.getEntriesByType('navigation'):[])].map(r=>({path:new URL(r.name).pathname,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize,duration:r.duration}))",nav)
   out['phases'].append({'label':label,'readyMs':ms,'resources':rows,'apiCount':sum(x['path'].startswith('/api/') for x in rows),'jsWireBytes':sum(x['transfer'] for x in rows if x['path'].endswith('.js'))});print(json.dumps({k:v for k,v in out['phases'][-1].items() if k!='resources'}),flush=True)
  sessions=json.loads((P/'student-sessions.json').read_text());reserved='1300'
  c,page,b=context('training');page.set_default_timeout(20000)
  measure(page,'training.login_cold',lambda:page.goto(b+'/login',wait_until='domcontentloaded'),lambda:expect(page.get_by_role('heading',name='登录 Huitraining')).to_be_visible(),True)
  # Existing session may redirect login to student home; start fresh measurement context.
  c.close();c,page,b=context('training',sessions[reserved]);page.set_default_timeout(20000)
  measure(page,'training.assessment_cold',lambda:page.goto(b+'/student/composite/'+F['questionnaire']+'?courseId='+F['course'],wait_until='domcontentloaded'),lambda:expect(page.get_by_role('button',name='3',exact=True)).to_be_visible(),True)
  measure(page,'training.local_answer',lambda:page.get_by_role('button',name='3',exact=True).click(),lambda:expect(page.get_by_role('heading',name='合成体验条目 2：本次学习让我感觉投入。必答',exact=True)).to_be_visible())
  c.close();c,page,b=context('survey');u=urlsplit(F['researchUrl']);url=urlunsplit(('https','survey.eduk12.top:6681',u.path,u.query,u.fragment));page.set_default_timeout(20000)
  measure(page,'survey.entry_cold',lambda:page.goto(url,wait_until='domcontentloaded'),lambda:expect(page.get_by_role('button',name='选择本轮',exact=True)).to_be_visible(),True)
  page.get_by_role('button',name='选择本轮',exact=True).click();page.get_by_role('checkbox').check()
  measure(page,'survey.open',lambda:page.get_by_role('button',name='开始或恢复本轮作答',exact=True).click(),lambda:expect(page.get_by_label('合成选项 3',exact=True).first).to_be_visible())
  measure(page,'survey.local_answer',lambda:page.get_by_label('合成选项 3',exact=True).first.check(),lambda:expect(page.get_by_label('合成选项 3',exact=True).first).to_be_checked())
  c.close();browser.close()
 (W/'evidence'/('browser-'+name+'.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2));assert not out['errors'],out['errors']
if __name__=='__main__':main(sys.argv[1])
