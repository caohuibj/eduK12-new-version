import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const PR356_BRANCH='fix/runtime-time-and-validation-20261025';
export const PR356_MARKER='.github/scripts/pr356-bindings.json';
/** Routing hint only. Actual source, event and official PR identity are verified
 * separately; this must never issue qualification or merge permission. */
export function isPr356Entry({event,headRef,refName,ref,entries=[]}={}){
 if(headRef===PR356_BRANCH||refName===PR356_BRANCH||ref==='refs/heads/'+PR356_BRANCH)return true;
 return event==='push'&&ref==='refs/heads/main'&&entries.some(e=>e.file===PR356_MARKER);
}
export function detectPr356Entry(env=process.env,eventPayload={},readDiff){
 const event=env.GITHUB_EVENT_NAME||env.CI_EVENT;
 const headRef=eventPayload.pull_request?.head?.ref||env.CI_HEAD_REF||env.GITHUB_HEAD_REF;
 const ref=env.GITHUB_REF;
 const simple={event,headRef,refName:env.GITHUB_REF_NAME,ref};
 if(isPr356Entry(simple))return {candidate:true,event,reason:'fixed-pr356-branch'};
 if(event==='push'&&ref==='refs/heads/main'){
  const before=eventPayload.before||env.CI_BASE_SHA,after=eventPayload.after||env.GITHUB_SHA;
  assert.match(before||'',/^[a-f0-9]{40}$/,'Exact main before required');
  assert.match(after||'',/^[a-f0-9]{40}$/,'Exact main after required');
  assert.notEqual(before,'0'.repeat(40),'Unbounded main creation cannot be classified');
  const entries=readDiff(before,after);
  return {candidate:isPr356Entry({...simple,entries}),event,reason:entries.some(e=>e.file===PR356_MARKER)?'pr356-main-marker':'unrelated-main-diff'};
 }
 return {candidate:false,event,reason:'unrelated-event'};
}
function readDiff(before,after){
 const raw=execFileSync('git',['diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40','-z',before,after,'--'],{encoding:'utf8'});
 assert(raw.endsWith('\0')||raw==='','Incomplete raw diff');
 const fields=raw?raw.slice(0,-1).split('\0'):[];assert.equal(fields.length%2,0);
 return Array.from({length:fields.length/2},(_,i)=>{assert.match(fields[i*2],/^:[0-7]{6} [0-7]{6} [a-f0-9]{40} [a-f0-9]{40} [A-Z][0-9]*$/);return {file:fields[i*2+1]};});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.argv[2],'--detect','Only explicit routing detection is supported');
 const payload=process.env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):{};
 const result=detectPr356Entry(process.env,payload,readDiff);
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'candidate='+String(result.candidate)+'\n');
}
