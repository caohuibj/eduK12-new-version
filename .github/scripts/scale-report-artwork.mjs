import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readScaleIntakeDiff} from './scale-intake-scope.mjs';

const root='server-version/frontend/src/scale-report-artwork/';
const pathPattern=/^server-version\/frontend\/src\/scale-report-artwork\/([a-z][a-z0-9_]*)\/(\d+\.\d+\.\d+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(report-artwork\.json|[a-z][a-z0-9_-]*\.webp)$/;
const reportVariantPattern=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/(\d+\.\d+\.\d+)\/report-variants\.json$/;
const sourcePattern=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/(\d+\.\d+\.\d+)\/source\.json$/;
const filePattern=/^[a-z][a-z0-9_-]*\.webp$/;
const keyPattern=/^[a-z][a-z0-9_.-]{0,119}$/;

const exactKeys=(value,keys,label)=>{
 assert.ok(value&&typeof value==='object'&&!Array.isArray(value),`${label}: object required`);
 assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),`${label}: unsupported fields`);
};
const boundedText=(value,label,max=400)=>assert.ok(typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max,`${label}: invalid text`);

export function webpDimensions(buffer){
 assert.ok(Buffer.isBuffer(buffer)&&buffer.length>=30&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP','Invalid WebP container');
 const kind=buffer.subarray(12,16).toString(),offset=20;
 if(kind==='VP8X')return {width:1+buffer.readUIntLE(offset+4,3),height:1+buffer.readUIntLE(offset+7,3)};
 if(kind==='VP8 '){
  assert.ok(buffer.length>=offset+10&&buffer[offset+3]===0x9d&&buffer[offset+4]===0x01&&buffer[offset+5]===0x2a,'Invalid VP8 frame');
  return {width:buffer.readUInt16LE(offset+6)&0x3fff,height:buffer.readUInt16LE(offset+8)&0x3fff};
 }
 if(kind==='VP8L'){
  assert.equal(buffer[offset],0x2f,'Invalid VP8L frame');
  const bits=buffer.readUInt32LE(offset+1);return {width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};
 }
 throw new Error('Unsupported WebP payload');
}

function parseImage(value,label){
 exactKeys(value,['file','alt','width','height'],label);
 assert.match(value.file,filePattern,`${label}: invalid file`);boundedText(value.alt,`${label}.alt`);
 for(const key of ['width','height'])assert.ok(Number.isInteger(value[key])&&value[key]>=64&&value[key]<=4096,`${label}.${key}: invalid dimension`);
 return value;
}

export function validateReportArtworkManifest(raw,{instrumentKey,instrumentVersion,reportVersion,readImage}){
 exactKeys(raw,['schemaVersion','artworkKey','hero','bands'].filter(key=>key!=='hero'||Object.hasOwn(raw,'hero')),'manifest');
 assert.equal(raw.schemaVersion,1,'manifest: schemaVersion');
 const artworkKey=`${instrumentKey}/${instrumentVersion}/${reportVersion}`;assert.equal(raw.artworkKey,artworkKey,'manifest: artworkKey/path mismatch');
 assert.ok(raw.hero||Array.isArray(raw.bands)&&raw.bands.length,'manifest: hero or bands required');
 const images=[];
 if(raw.hero)images.push(parseImage(raw.hero,'hero'));
 assert.ok(Array.isArray(raw.bands)&&raw.bands.length<=100,'manifest: invalid bands');
 const pairs=new Set();
 for(const [index,entry] of raw.bands.entries()){
  exactKeys(entry,['scoreKey','bandKey','file','alt','width','height'],`bands.${index}`);
  boundedText(entry.scoreKey,`bands.${index}.scoreKey`,120);assert.match(entry.scoreKey,keyPattern);
  boundedText(entry.bandKey,`bands.${index}.bandKey`,120);assert.match(entry.bandKey,keyPattern);
  const pair=`${entry.scoreKey}\0${entry.bandKey}`;assert.ok(!pairs.has(pair),`bands.${index}: duplicate score/band`);pairs.add(pair);
  images.push(parseImage({file:entry.file,alt:entry.alt,width:entry.width,height:entry.height},`bands.${index}`));
 }
 const files=new Set();
 for(const image of images){
  files.add(image.file);
  const dimensions=webpDimensions(readImage(image.file));assert.deepEqual(dimensions,{width:image.width,height:image.height},`manifest: dimensions mismatch: ${image.file}`);
 }
 return {artworkKey,files:[...files].sort(),bands:raw.bands.map(entry=>({scoreKey:entry.scoreKey,bandKey:entry.bandKey})),hasHero:Boolean(raw.hero)};
}

export function checkSelectedReportArtwork({base,head,cwd=process.cwd()}){
 const selected=readScaleIntakeDiff(base,head,{cwd}),git=(args,encoding='utf8')=>execFileSync('git',args,{cwd,encoding,maxBuffer:32*1024*1024});
 const identities=new Map(),selectedArtworkKeys=new Set();
 for(const entry of selected.entries){
  const artwork=pathPattern.exec(entry.file),variant=reportVariantPattern.exec(entry.file),source=sourcePattern.exec(entry.file);
  if(artwork){identities.set(`${artwork[1]}/${artwork[2]}`,{instrumentKey:artwork[1],instrumentVersion:artwork[2]});selectedArtworkKeys.add(`${artwork[1]}/${artwork[2]}/${artwork[3]}`);}
  if(variant)identities.set(`${variant[1]}/${variant[2]}`,{instrumentKey:variant[1],instrumentVersion:variant[2]});
  if(source)identities.set(`${source[1]}/${source[2]}`,{instrumentKey:source[1],instrumentVersion:source[2]});
 }
 const declarations=new Map();
 for(const identity of identities.values()){
  const versionRoot=`server-version/backend/src/modules/scale/instruments/${identity.instrumentKey}/${identity.instrumentVersion}/`,reports=[];
  const sourcePath=versionRoot+'source.json';
  if(git(['ls-tree','--name-only',head,'--',sourcePath]).trim()){
   const source=JSON.parse(git(['show',`${head}:${sourcePath}`]));
   if(source?.executable?.definition?.report)reports.push({report:source.executable.definition.report,label:sourcePath});
  }
  const variantPath=versionRoot+'report-variants.json';
  if(git(['ls-tree','--name-only',head,'--',variantPath]).trim()){
   const material=JSON.parse(git(['show',`${head}:${variantPath}`]));assert.ok(material&&typeof material==='object'&&Array.isArray(material.variants),`Invalid report variants: ${variantPath}`);
   for(const variant of material.variants)reports.push({report:variant?.report,label:variantPath});
  }
  for(const declaration of reports){
   const report=declaration.report,reportVersion=report?.reportVersion,artworkKey=report?.artworkKey;
   if(artworkKey===undefined)continue;
   assert.ok(typeof reportVersion==='string'&&typeof artworkKey==='string',`Invalid report artwork binding: ${declaration.label}`);
   const expected=`${identity.instrumentKey}/${identity.instrumentVersion}/${reportVersion}`;assert.equal(artworkKey,expected,`Report artwork identity mismatch: ${declaration.label}`);
   assert.ok(!declarations.has(artworkKey),`Duplicate report artwork declaration: ${artworkKey}`);
   const bands=new Set();
   for(const interpretation of Array.isArray(report.interpretations)?report.interpretations:[])for(const band of Array.isArray(interpretation?.bands)?interpretation.bands:[]){
    if(typeof interpretation.scoreKey==='string'&&typeof band?.key==='string')bands.add(`${interpretation.scoreKey}\0${band.key}`);
   }
   declarations.set(artworkKey,{...identity,reportVersion,bands});
  }
 }
 for(const artworkKey of selectedArtworkKeys)assert.ok(declarations.has(artworkKey),`Artwork is not declared by its Scale report: ${artworkKey}`);
 const tree=git(['ls-tree','-rz','--full-tree',head,'--',root]).split('\0').filter(Boolean).map(row=>{
  const match=/^100644 blob [a-f0-9]{40}\t(.+)$/.exec(row);assert.ok(match,'Artwork must be regular files');return match[1];
 });
 const results=[];
 for(const [directory,identity] of [...declarations].sort(([a],[b])=>a.localeCompare(b))){
  const prefix=root+directory+'/',files=tree.filter(file=>file.startsWith(prefix));
  assert.ok(files.includes(prefix+'report-artwork.json'),`Missing artwork manifest: ${directory}`);
  assert.ok(files.every(file=>pathPattern.test(file)),`Unsupported artwork file: ${directory}`);
  const raw=JSON.parse(git(['show',`${head}:${prefix}report-artwork.json`]));
  const result=validateReportArtworkManifest(raw,{...identity,readImage:file=>git(['show',`${head}:${prefix}${file}`],null)});
  assert.deepEqual(files.filter(file=>file.endsWith('.webp')).map(file=>file.slice(prefix.length)).sort(),result.files,`Unreferenced/missing artwork files: ${directory}`);
  for(const band of result.bands)assert.ok(identity.bands.has(`${band.scoreKey}\0${band.bandKey}`),`Artwork band is not declared by the report: ${directory}/${band.scoreKey}/${band.bandKey}`);
  results.push(result);
 }
 return {status:'SELECTED_SCALE_REPORT_ARTWORK_OK',base,head,artwork:results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(checkSelectedReportArtwork({base:process.env.SCALE_INTAKE_BASE_SHA,head:process.env.SCALE_INTAKE_HEAD_SHA})));}
 catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
