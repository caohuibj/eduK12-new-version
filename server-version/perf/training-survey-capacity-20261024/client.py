from pathlib import Path
import asyncio,aiohttp,ssl,socket,json,time,base64,hmac,hashlib,struct,os
W=Path(os.environ['EDUK12_CAPACITY_WORK_DIR']).resolve(); ROOT=W.parent; P=W/'private'
if W.name!='capacity-20261024' or not (W/'compose.yml').is_file():raise RuntimeError('Explicit isolated capacity workspace required')
def save_private(path,value):
 path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');path.chmod(0o600)
def otp(secret):
 k=base64.b32decode(secret+'='*((8-len(secret)%8)%8));m=hmac.new(k,struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest();o=m[-1]&15;return str((struct.unpack('>I',m[o:o+4])[0]&0x7fffffff)%1000000).zfill(6)
class LocalResolver(aiohttp.abc.AbstractResolver):
 async def resolve(self,host,port=0,family=socket.AF_INET):
  if host not in ('training.eduk12.top','survey.eduk12.top'):raise OSError('External target denied')
  return [{'hostname':host,'host':'127.0.0.1','port':port,'family':socket.AF_INET,'proto':0,'flags':0}]
 async def close(self):pass
TLS=ssl.create_default_context(cafile=str(ROOT/'private/perf-test-tls.crt'))
class APIError(Exception):
 def __init__(self,status,message,label,retry=0):self.status=status;self.message=str(message);self.label=label;self.retry=retry;super().__init__(f'{label}: HTTP {status} {str(message)[:180]}')
class API:
 def __init__(self,realm,records=None,connector=None):
  self.realm=realm;self.origin=f'https://{realm}.eduk12.top';self.base=self.origin+':6681';self.records=records;self.csrf='';self.connector=connector or aiohttp.TCPConnector(resolver=LocalResolver(),ssl=TLS,limit=0,limit_per_host=0,ttl_dns_cache=600)
  self.ctx=aiohttp.ClientSession(connector=self.connector,connector_owner=connector is None,cookie_jar=aiohttp.CookieJar(),timeout=aiohttp.ClientTimeout(total=40))
 async def close(self):await self.ctx.close()
 async def call(self,path,method='GET',data=None,label=None):
  label=label or path;start=time.perf_counter();status=0;size=0;code=None;retry=0
  try:
   h={'Origin':self.origin}
   if self.csrf:h['X-CSRF-Token']=self.csrf
   async with self.ctx.request(method,self.base+'/api'+path,headers=h,json=data,allow_redirects=False) as r:
    status=r.status;raw=await r.read();size=len(raw);retry=float(r.headers.get('Retry-After','0'))
    try:j=json.loads(raw)
    except Exception:raise APIError(status,'Non-JSON response',label,retry)
    code=j.get('code')
    if status>=400 or code!=0:raise APIError(status,j.get('message'),label,retry)
    return j.get('data')
  finally:
   if self.records is not None:self.records.append({'label':label,'status':status,'code':code,'ms':round((time.perf_counter()-start)*1000,3),'bytes':size,'retryAfter':retry})
 async def login(self,username,password,totp=None):
  pre='/auth' if self.realm=='training' else '/survey/auth';self.csrf=(await self.call(pre+'/csrf',label=self.realm+'.csrf'))['csrfToken']
  path='/auth/training-login' if self.realm=='training' else '/survey/auth/login'
  r=await self.call(path,'POST',{'username':username,'password':password},label=self.realm+'.password_login')
  if totp:await self.call('/survey/auth/mfa/verify','POST',{'code':otp(totp)},label='survey.mfa')
  return r
 def session_state(self):
  return {'csrf':self.csrf,'cookies':[{'name':x.key,'value':x.value,'domain':x['domain'],'path':x['path'],'secure':bool(x['secure']),'expires':x['expires']} for x in self.ctx.cookie_jar]}
 def restore(self,state):
  from yarl import URL
  self.csrf=state['csrf']
  for x in state['cookies']:self.ctx.cookie_jar.update_cookies({x['name']:x['value']},URL(self.base+x['path']))
if __name__=='__main__':
 async def main():
  c=json.loads((ROOT/'private/credentials.json').read_text());out={}
  for realm in ['training','survey']:
   a=API(realm)
   try:
    await a.login(c[realm+'_username'],c[realm+'_password'],c.get('survey_totp_secret') if realm=='survey' else None)
    save_private(P/(realm+'-admin-session.json'),a.session_state());out[realm]='authenticated, CSRF and MFA preserved'
   finally:await a.close()
  print(json.dumps(out))
 asyncio.run(main())
