import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const scaleIntakeToolingInputs = Object.freeze([
 '.github/scripts/declarative-content.mjs',
 '.github/scripts/scale-intake-scope.mjs','.github/scripts/scale-intake-scope.test.mjs',
 '.github/scripts/scale-report-artwork.mjs','.github/scripts/scale-report-artwork.test.mjs',
 '.github/workflows/scale-onboarding-boundary.yml',
 'server-version/backend/scripts/scale-intake-selected-check.ts',
 'server-version/backend/scripts/scale-intake-selected-check.test.ts',
 'server-version/backend/scripts/generate-scale-instruments.ts',
]);
export const scaleIntakeToolingChanged = files => files.some(file => scaleIntakeToolingInputs.includes(file));

const versionRoot='server-version/backend/src/modules/scale/instruments/';
const source=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/([0-9]+\.[0-9]+\.[0-9]+)\/(instrument\.ts|source\.json)$/;
const reportVariant=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/([0-9]+\.[0-9]+\.[0-9]+)\/report-variants\.json$/;
const reportArtwork=/^server-version\/frontend\/src\/scale-report-artwork\/([a-z][a-z0-9_]*)\/([0-9]+\.[0-9]+\.[0-9]+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(report-artwork\.json|[a-z][a-z0-9_-]*\.webp)$/;
const metadata=/^server-version\/backend\/src\/modules\/scale\/instruments\/[a-z][a-z0-9_]*\/[0-9]+\.[0-9]+\.[0-9]+\/(README\.md|THIRD_PARTY_LICENSE\.md)$/;
const notes=/^docs\/(scale-intake|scale-instruments)\/[a-zA-Z0-9_./-]+\.(md|json|txt)$/;
const index='server-version/backend/src/modules/scale/onboarding/instruments.generated.ts';
const reportVariantIndex='server-version/backend/src/modules/scale/onboarding/report-variants.generated.ts';
export function assertScaleContentImmutability(entries,{readBaseFile,readHeadFile}={}){
 for(const entry of entries){
  if(reportArtwork.test(entry.file))assert.ok(entry.status==='A'&&entry.oldMode==='000000'&&entry.newMode==='100644',`Frozen report artwork must use a new report-version path: ${entry.file}`);
  if(!reportVariant.test(entry.file))continue;
  assert.ok(entry.newMode==='100644'&&(entry.status==='A'&&entry.oldMode==='000000'||entry.status==='M'&&entry.oldMode==='100644'),`Report variant material cannot be removed or renamed: ${entry.file}`);
  if(entry.status==='A')continue;
  assert.equal(typeof readBaseFile,'function',`Missing base reader for report variant history: ${entry.file}`);assert.equal(typeof readHeadFile,'function',`Missing head reader for report variant history: ${entry.file}`);
  const before=JSON.parse(readBaseFile(entry.file)),after=JSON.parse(readHeadFile(entry.file));
  for(const key of ['instrumentKey','instrumentVersion','baseContentHash','baseParametersHash'])assert.deepEqual(after[key],before[key],`Report variant binding changed: ${entry.file}:${key}`);
  assert.ok(Array.isArray(before.variants)&&Array.isArray(after.variants),`Invalid report variant history: ${entry.file}`);
  const byKey=new Map(after.variants.map(variant=>[variant?.key,variant])),byVersion=new Map(after.variants.map(variant=>[variant?.report?.reportVersion,variant]));
  for(const variant of before.variants){
   const current=byKey.get(variant?.key);assert.ok(current,`Report variant removed: ${entry.file}:${String(variant?.key)}`);
   assert.deepEqual(current,variant,`Published report variant rewritten: ${entry.file}:${String(variant?.key)}`);
   assert.equal(byVersion.get(variant?.report?.reportVersion)?.key,variant?.key,`Report version rebound: ${entry.file}:${String(variant?.report?.reportVersion)}`);
  }
 }
}
export function selectScaleIntake(entries) {
 if(!Array.isArray(entries)||!entries.length)return null;
 const files=new Set(),sources=new Set();
 for(const e of entries) {
  if(!e||typeof e.file!=='string'||/[\\\x00-\x1f\x7f]/.test(e.file)||e.file.split('/').some(p=>!p||p==='.'||p==='..')||files.has(e.file))return null;
  if(e.newMode!=='100644'||!(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644'))return null;
  const match=source.exec(e.file),variant=reportVariant.exec(e.file),artwork=reportArtwork.exec(e.file);
  if(!match&&!variant&&!artwork&&e.file!==index&&e.file!==reportVariantIndex&&!metadata.test(e.file)&&!notes.test(e.file))return null;
  // The global scope guard rejects replacement in every CI route. Keep this
  // lane conservative as well, so it never claims an in-place edit is content.
  if(artwork&&e.status!=='A')return null;
  files.add(e.file);
  const identity=match??variant??artwork;
  if(identity)sources.add(`${versionRoot}${identity[1]}/${identity[2]}/instrument.ts`);
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
 const root=execFileSync('git',['rev-parse','--show-toplevel'],{cwd,encoding:'utf8'}).trim();
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(git('rev-parse','HEAD').trim(),head,'Checkout identity mismatch');
 const entries=parseScaleIntakeRawDiff(git('diff','--raw','--abbrev=40','--no-renames','-z',base,head));
 const selected=selectScaleIntake(entries);assert.ok(selected,'Not an isolated Scale declaration intake');
 // A changed JSON source must retain its actual ordinary declaration wrapper.
 for(const file of selected.sources)assert.match(git('ls-tree',head,'--',file),/^100644 blob [a-f0-9]{40}\t/,'Missing/nonregular instrument wrapper');
 const artworkIdentities=new Set(selected.files.flatMap(file=>{const match=reportArtwork.exec(file);return match?[`${match[1]}/${match[2]}`]:[]}));
 for(const identity of artworkIdentities)assert.match(git('ls-tree',head,'--',`${versionRoot}${identity}/source.json`),/^100644 blob [a-f0-9]{40}\t/,'Artwork requires an ordinary version-local Scale source');
 return {base,head,entries,...selected};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try {const result=readScaleIntakeDiff(process.env.SCALE_INTAKE_BASE_SHA,process.env.SCALE_INTAKE_HEAD_SHA);console.log(JSON.stringify({status:'SELECTED_SCALE_INTAKE',...result}));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
