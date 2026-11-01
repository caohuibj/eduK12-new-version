import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {edgeConfigScope,edgeConfigOutputs} from './edge-config-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const nginx='server-version/frontend/nginx.conf',compose='server-version/docker-compose.yml';
const entry=file=>({file,oldMode:'100644',newMode:'100644',status:'M'});
const before='  frontend:\n    container_name: ptool-frontend\n    ports: []\n';
const after=before.replace('    ports:', '    ulimits:\n      nofile:\n        soft: 65535\n        hard: 65535\n    ports:');
test('only nginx and the precise nofile addition use the edge route',()=>{
 assert(edgeConfigScope([entry(nginx)],()=>before,()=>after));
 assert(edgeConfigScope([entry(nginx),entry(compose)],()=>before,()=>after));
 assert(!edgeConfigScope([entry(nginx),entry(compose)],()=>before,()=>after+'  backend: {}\n'));
 assert(!edgeConfigScope([entry(nginx),entry('server-version/backend/src/index.ts')],()=>before,()=>after));
 assert(!edgeConfigScope([{...entry(nginx),newMode:'120000'}],()=>before,()=>after));
});
test('main config and only its exact runtime-config Dockerfile split use the edge route',()=>{
 const main='server-version/frontend/nginx-main.conf',dockerfile='server-version/frontend/Dockerfile';
 const original='FROM nginx:1.31.6-alpine3.24-slim AS runtime\nRUN existing-security-updates\nCOPY --from=build /app/dist /usr/share/nginx/html\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\nEXPOSE 80\n';
 const candidate=original.replace('AS runtime\n','AS runtime-config\n').replace('COPY --from=build /app/dist /usr/share/nginx/html\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\n','COPY nginx-main.conf /etc/nginx/nginx.conf\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\n\nFROM runtime-config AS runtime\nCOPY --from=build /app/dist /usr/share/nginx/html\n');
 const entries=[{...entry(main),status:'A',oldMode:'000000'},entry(dockerfile)];
 assert(edgeConfigScope(entries,()=>original,()=>candidate));
 for(const changed of [candidate.replace('RUN existing-security-updates','RUN npm install'),candidate.replace('1.31.6','1.31.7'),candidate+'CMD ["sh"]\n'])assert(!edgeConfigScope(entries,()=>original,()=>changed));
 assert(!edgeConfigScope([entry(dockerfile)],()=>original,()=>candidate));
 assert(!edgeConfigScope([...entries,entry('server-version/frontend/src/App.tsx')],()=>original,()=>candidate));
 assert(!edgeConfigScope([{...entry(main),newMode:'120000'}],()=>original,()=>candidate));
});
test('merge still requires actual successful edge checks; failure or skip cannot qualify',()=>{
 const needs={scope:{result:'success',outputs:Object.fromEntries(Object.entries(edgeConfigOutputs()).map(([k,v])=>[k,String(v)]))},'edge-config':{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','edge-config']);
 assert.deepEqual(failedChecks(needs,false),[]);
 for(const result of ['failure','skipped','cancelled'])assert(failedChecks({...needs,'edge-config':{result}},false).includes('edge-config'));
 assert(failedChecks(needs,true).includes('scope'));
});
test('workflow executes the actual configuration smoke and makes it an aggregate dependency',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert(workflow.includes('run: bash .github/scripts/edge-config-smoke.sh'));
 assert(workflow.slice(workflow.indexOf('  merge-gate:')).includes('    - edge-config\n'));
});
