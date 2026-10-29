import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const scaleIntakeToolingInputs = Object.freeze([
 '.github/scripts/scale-intake-scope.mjs','.github/scripts/scale-intake-scope.test.mjs',
 '.github/workflows/scale-onboarding-boundary.yml',
 'server-version/backend/scripts/scale-intake-selected-check.ts',
 'server-version/backend/scripts/scale-intake-selected-check.test.ts',
]);
export const scaleIntakeToolingChanged = files => files.some(file => scaleIntakeToolingInputs.includes(file));

const versionRoot='server-version/backend/src/modules/scale/instruments/';
const source=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/([0-9]+\.[0-9]+\.[0-9]+)\/(instrument\.ts|source\.json)$/;
const metadata=/^server-version\/backend\/src\/modules\/scale\/instruments\/[a-z][a-z0-9_]*\/[0-9]+\.[0-9]+\.[0-9]+\/(README\.md|THIRD_PARTY_LICENSE\.md)$/;
const notes=/^docs\/(scale-intake|scale-instruments)\/[a-zA-Z0-9_./-]+\.(md|json|txt)$/;
const index='server-version/backend/src/modules/scale/onboarding/instruments.generated.ts';
export function selectScaleIntake(entries) {
 if(!Array.isArray(entries)||!entries.length)return null;
 const files=new Set(),sources=new Set();
 for(const e of entries) {
  if(!e||typeof e.file!=='string'||/[\\\x00-\x1f\x7f]/.test(e.file)||e.file.split('/').some(p=>!p||p==='.'||p==='..')||files.has(e.file))return null;
  if(e.newMode!=='100644'||!(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644'))return null;
  const match=source.exec(e.file);
  if(!match&&e.file!==index&&!metadata.test(e.file)&&!notes.test(e.file))return null;
  files.add(e.file);
  if(match)sources.add(`${versionRoot}${match[1]}/${match[2]}/instrument.ts`);
 }
 return sources.size?{sources:[...sources].sort(),files:[...files].sort()}:null;
}
export function parseScaleIntakeRawDiff(raw) {
 if(raw==='')return [];
 assert.ok(raw.endsWith('\0'),'Malformed raw diff');
 const parts=raw.slice(0,-1).split('\0');assert.equal(parts.length%2,0,'Malformed raw diff');
 const entries=[];
 for(let i=0;i<parts.length;i+=2){const m=/^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([AMDT])$/.exec(parts[i]);
  assert.ok(m&&parts[i+1],'Unsupported raw diff');entries.push({file:parts[i+1],oldMode:m[1],newMode:m[2],status:m[5]});}
 return entries;
}
export function readScaleIntakeDiff(base,head,{cwd=process.cwd()}={}) {
 assert.match(base||'',/^[a-f0-9]{40}$/,'Exact base required');assert.match(head||'',/^[a-f0-9]{40}$/,'Exact checkout required');
 assert.notEqual(base,head,'Empty candidate');
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(git('rev-parse','HEAD').trim(),head,'Checkout identity mismatch');
 const entries=parseScaleIntakeRawDiff(git('diff','--raw','--abbrev=40','--no-renames','-z',base,head));
 const selected=selectScaleIntake(entries);assert.ok(selected,'Not an isolated Scale declaration intake');
 // A changed JSON source must retain its actual ordinary declaration wrapper.
 for(const file of selected.sources)assert.match(git('ls-tree',head,'--',file),/^100644 blob [a-f0-9]{40}\t/,'Missing/nonregular instrument wrapper');
 return {base,head,entries,...selected};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try {const result=readScaleIntakeDiff(process.env.SCALE_INTAKE_BASE_SHA,process.env.SCALE_INTAKE_HEAD_SHA);console.log(JSON.stringify({status:'SELECTED_SCALE_INTAKE',...result}));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
