import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkSelectedReportArtwork,validateReportArtworkManifest,webpDimensions} from './scale-report-artwork.mjs';

const vp8x=(width,height)=>{
 const bytes=Buffer.alloc(30);bytes.write('RIFF',0);bytes.writeUInt32LE(22,4);bytes.write('WEBP',8);bytes.write('VP8X',12);bytes.writeUInt32LE(10,16);
 bytes.writeUIntLE(width-1,24,3);bytes.writeUIntLE(height-1,27,3);return bytes;
};

test('validates version-local hero and score-band artwork',()=>{
 const images=new Map([['hero.webp',vp8x(1200,800)],['low.webp',vp8x(512,512)]]);
 const result=validateReportArtworkManifest({schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',
  hero:{file:'hero.webp',alt:'一幅帮助理解结果的插画。',width:1200,height:800},
  bands:[{scoreKey:'total',bandKey:'low',file:'low.webp',alt:'提醒先从一个小行动开始。',width:512,height:512}]},
 {instrumentKey:'example_scale',instrumentVersion:'1.2.0',reportVersion:'R1.0.0',readImage:file=>images.get(file)});
 assert.deepEqual(result,{artworkKey:'example_scale/1.2.0/R1.0.0',files:['hero.webp','low.webp'],bands:[{scoreKey:'total',bandKey:'low'}],hasHero:true});
});

test('rejects path drift duplicates unsafe files and dimension drift',()=>{
 const image=vp8x(512,512);assert.deepEqual(webpDimensions(image),{width:512,height:512});
 const base={schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',bands:[{scoreKey:'total',bandKey:'low',file:'low.webp',alt:'低分段插画。',width:512,height:512}]};
 const options={instrumentKey:'example_scale',instrumentVersion:'1.2.0',reportVersion:'R1.0.0',readImage:()=>image};
 assert.throws(()=>validateReportArtworkManifest({...base,artworkKey:'other/1.2.0/R1.0.0'},options),/artworkKey/);
 assert.throws(()=>validateReportArtworkManifest({...base,bands:[...base.bands,{...base.bands[0],file:'other.webp'}]},options),/duplicate score\/band/);
 assert.throws(()=>validateReportArtworkManifest({...base,bands:[{...base.bands[0],file:'..\/low.webp'}]},options),/invalid file/);
 assert.throws(()=>validateReportArtworkManifest({...base,bands:[{...base.bands[0],width:511}]},options),/dimensions mismatch/);
});

test('one illustration may serve the same named band across several score keys',()=>{
 const image=vp8x(512,512),base={file:'low.webp',alt:'先从一个小行动开始。',width:512,height:512};
 const result=validateReportArtworkManifest({schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',bands:[
  {scoreKey:'score_a',bandKey:'low',...base},{scoreKey:'score_b',bandKey:'low',...base}]},
 {instrumentKey:'example_scale',instrumentVersion:'1.2.0',reportVersion:'R1.0.0',readImage:()=>image});
 assert.deepEqual(result.files,['low.webp']);assert.equal(result.bands.length,2);
});

test('checks the exact Git candidate, report binding and complete artwork directory',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scale-report-artwork-')),git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
 const put=(file,value)=>{mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),value);};
 const instrument='server-version/backend/src/modules/scale/instruments/example_scale/1.2.0/instrument.ts';
 const source=instrument.replace('instrument.ts','source.json');
 const variant=instrument.replace('instrument.ts','report-variants.json');
 const artwork='server-version/frontend/src/scale-report-artwork/example_scale/1.2.0/R1.0.0/';
 try{
  git('init','-q');git('config','user.name','Synthetic test');git('config','user.email','test@example.invalid');
  put(instrument,'export const SCALE_INSTRUMENT_SOURCE = {};\n');put(source,JSON.stringify({identity:{instrumentKey:'example_scale',instrumentVersion:'1.2.0'}}));git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  put(variant,JSON.stringify({variants:[{report:{reportVersion:'R1.0.0',artworkKey:'example_scale/1.2.0/R1.0.0',interpretations:[{scoreKey:'total',bands:[{key:'low'}]}]}}]}));
  put(artwork+'report-artwork.json',JSON.stringify({schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',bands:[{scoreKey:'total',bandKey:'low',file:'low.webp',alt:'低分段插画。',width:512,height:512}]}));
  put(artwork+'low.webp',vp8x(512,512));git('add','.');git('commit','-qm','candidate');const head=git('rev-parse','HEAD');
  assert.equal(checkSelectedReportArtwork({base,head,cwd:dir}).status,'SELECTED_SCALE_REPORT_ARTWORK_OK');
  put(artwork+'unused.webp',vp8x(64,64));git('add','.');git('commit','-qm','unused');
  assert.throws(()=>checkSelectedReportArtwork({base:head,head:git('rev-parse','HEAD'),cwd:dir}),/Unreferenced\/missing/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
