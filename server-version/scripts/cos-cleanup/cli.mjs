import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Cleanup } from './engine.mjs';
import { CosApi } from './store.mjs';
import { config, need } from './model.mjs';

process.umask(0o077);
let work;
try {
  const input=JSON.parse(fs.readFileSync(0,'utf8')),c=config(input.config);
  need(typeof input.secret==='string'&&input.secret.length>=32,'BACKUP_KEY_REQUIRED');
  const require=createRequire(import.meta.url),COS=require('/app/node_modules/cos-nodejs-sdk-v5');
  const make=v=>new COS({SecretId:v.COS_SECRET_ID,SecretKey:v.COS_SECRET_KEY,...(v.COS_SECURITY_TOKEN?{SecurityToken:v.COS_SECURITY_TOKEN}:{}),Timeout:60000});
  need(input.credentials?.COS_SECRET_ID&&input.credentials.COS_SECRET_KEY,'COS_CREDENTIALS_REQUIRED');
  let deleter=null;
  if(c.mode==='execute') {
    need(input.deleteCredentials?.COS_SECRET_ID&&input.deleteCredentials.COS_SECRET_KEY
      &&input.deleteCredentials.COS_SECRET_ID!==input.credentials.COS_SECRET_ID,'DEDICATED_DELETE_IDENTITY_REQUIRED');
    deleter=make(input.deleteCredentials);
  }
  need(/^[a-f0-9]{32}$/.test(input.runId||''),'RUN_ID_REQUIRED');
  work=await fsp.mkdtemp('/state/.work-'+input.runId+'-');
  const paths={state:'/state',work,host:'/host/catalog.json',hostStatus:'/host/status.json',attachment:'/attachments/catalog.json',
    proof:'/proof/recovery-proof.json',launcherFailure:'/attachments/launcher-failure.json'};
  const task=new Cleanup(c,new CosApi(c,make(input.credentials),deleter),input.secret,paths);
  console.log(JSON.stringify(await task.run()));
} catch(e) {
  console.error(JSON.stringify({failed:true,error:/^[A-Z][A-Z0-9_]{2,80}$/.test(e?.message||'')?e.message:'CLEANUP_FAILED'}));process.exitCode=1;
} finally {if(work)await fsp.rm(work,{recursive:true,force:true});}
