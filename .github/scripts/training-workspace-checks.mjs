import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {binding,trainingWorkspacePlan} from './training-workspace-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const component=process.argv[2];
if(!['frontend','backend'].includes(component))throw Error('Explicit component required');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
trainingWorkspacePlan(changedEntries(binding.base,head),binding.base,head);
const cwd=resolve('server-version',component),run=(args)=>execFileSync('npm',args,{cwd,stdio:'inherit',env:{...process.env,NODE_ENV:'test',TZ:'UTC'},timeout:300000});
const files=binding[component+'Tests'];
if(!files?.length||files.some(p=>!/^src\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(p)))throw Error('Non-empty exact test list required');
mkdirSync('training-workspace-evidence',{recursive:true});
const report=resolve('training-workspace-evidence',component+'-tests.json');
if(component==='frontend'){
 const changed=Object.keys(binding.source).filter(p=>p.startsWith('server-version/frontend/src/')&&/\.tsx?$/.test(p)).map(p=>p.slice('server-version/frontend/'.length));
 run(['exec','--','eslint',...changed]);
 run(['run','pretypecheck']);run(['exec','--','tsc','-p','tsconfig.app.json','--noEmit']);
}else{
 run(['exec','--','prisma','generate']);run(['exec','--','tsc','--noEmit']);
}
run(['exec','--','vitest','run',...files,'--maxWorkers=2','--reporter=default','--reporter=json','--outputFile='+report]);
const result=JSON.parse(readFileSync(report));
if(!result.success||result.numFailedTests||result.numPendingTests||!result.numPassedTests||files.some(file=>!result.testResults.some(r=>r.name===resolve(cwd,file)&&r.status==='passed'&&r.assertionResults.length&&r.assertionResults.every(a=>a.status==='passed'))))throw Error('Missing, skipped or failed scoped tests');
