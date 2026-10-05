import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { requireFreePort } from './runner-preflight.mjs';
export function assertMediaServices(env, services, postgres, redis) {
  if(env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.NODE_ENV !== 'test' || !env.GITHUB_RUN_ID)
    throw new Error('Disposable service reset requires an Actions test job');
  if(env.DATABASE_URL !== 'postgresql://ptool:ptool123@localhost:5432/ptool?schema=public'
      || env.REDIS_URL !== 'redis://localhost:6379') throw new Error('Unexpected test service URL');
  for(const [name,item,id,image] of [['postgres',postgres,env.CI_POSTGRES_SERVICE_ID,'postgres:16.15-bookworm'],['redis',redis,env.CI_REDIS_SERVICE_ID,'redis:7.4.11-bookworm']]) {
    if(!/^[a-f0-9]{64}$/.test(id || '') || services[name]?.id !== id || item.Id !== id || item.Config?.Image !== image)
      throw new Error('Reset must target this job service container');
    if(item.Mounts?.some(m => m.Type !== 'volume' || !/^[a-f0-9]{64}$/.test(m.Name || '')))
      throw new Error('Reset rejects persistent named volumes or bind mounts');
  }
  for(const value of ['POSTGRES_USER=ptool','POSTGRES_PASSWORD=ptool123','POSTGRES_DB=ptool'])
    if(!postgres.Config.Env.includes(value)) throw new Error('Unexpected disposable PostgreSQL configuration');
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env=process.env, services=JSON.parse(env.CI_JOB_SERVICES || '{}');
  const inspect=id=>JSON.parse(execFileSync('docker',['container','inspect',id],{encoding:'utf8'}))[0];
  for(const id of [env.CI_POSTGRES_SERVICE_ID,env.CI_REDIS_SERVICE_ID]) if(!/^[a-f0-9]{64}$/.test(id || '')) throw new Error('Missing current service ID');
  assertMediaServices(env,services,inspect(env.CI_POSTGRES_SERVICE_ID),inspect(env.CI_REDIS_SERVICE_ID));
  await requireFreePort(3000); await requireFreePort(5173);
  for(const sql of ['DROP DATABASE ptool WITH (FORCE)','CREATE DATABASE ptool OWNER ptool'])
    execFileSync('docker',['exec',env.CI_POSTGRES_SERVICE_ID,'psql','-v','ON_ERROR_STOP=1','-U','ptool','-d','postgres','-c',sql],{stdio:'inherit'});
  execFileSync('docker',['exec',env.CI_REDIS_SERVICE_ID,'redis-cli','FLUSHALL','SYNC'],{stdio:'inherit'});
  console.log('Fresh PostgreSQL database and Redis state for the next independent media scenario');
}
