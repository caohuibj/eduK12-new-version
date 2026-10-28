const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process')
const root=path.resolve(__dirname,'../../../../..'),front=path.join(root,'server-version/frontend'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'recognition-report-review-'))
const entry=`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {RecognitionReport} from ${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/continuous-recognition/RecognitionReport.tsx'))};
const out=${JSON.stringify(__dirname)},evidence=JSON.parse(readFileSync(join(out,'representative-records.json'),'utf8'));
// Structural UI example only, copied from the existing report-test shape. No asset-rights claim or scorer replay.
const negative={state:'interpretable',profile:'experience',reportVersion:'0.2.0',scoringVersion:'0.2.0',qualityRule:'product-session-descriptive-0.2.0',configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),assetManifestHash:'c'.repeat(64),hitRate:.3,falseAlarmRate:.5,correctedRecognitionRate:-.2,targetHits:6,targetFalseAlarms:10,denominator:20,completeTargetPairs:20,plannedTargetPairs:20,receivedTrialCount:100,expectedTrialCount:100,reasons:[],canGenerateTakeHomeImage:false,logo:'EDUK12.TOP',interpretationScope:'this-session-descriptive-only'};
const css=readFileSync(${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/continuous-recognition/recognition.css'))},'utf8'),files=[];
for(const [name,language,report] of [['negative-zh','zh',negative],['negative-en','en',negative],['limited-zh','zh',evidence.cases[0].report],['invalid-en','en',evidence.empty]] as const){
 const body=renderToStaticMarkup(<RecognitionReport report={report as any} language={language} synthetic guidedPractice/>),file='report-'+name+'.html';
 writeFileSync(join(out,file),'<!doctype html><html lang="'+language+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><p>SYNTHETIC COMPONENT PREVIEW / 合成组件预览 · 未发布 · NO ASSET CLEARANCE</p>'+body+'</html>');files.push({file,text:body.replace(/<[^>]*>/g,' ')});
}
writeFileSync(join(out,'report-render.json'),JSON.stringify({node:process.version,kind:'ACTUAL_COMPONENT_STATIC_PREVIEW_NOT_ASSET_OR_BROWSER_QUALIFICATION',files},null,2));console.log(JSON.stringify({node:process.version,files:files.map(f=>f.file)}));`
try{
 require(path.join(front,'node_modules/esbuild')).buildSync({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'entry.cjs'),nodePaths:[path.join(front,'node_modules')],loader:{'.css':'empty'},logLevel:'silent'})
 const run=cp.spawnSync(process.execPath,[path.join(temp,'entry.cjs')],{encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);process.exitCode=run.status??1
}finally{fs.rmSync(temp,{recursive:true,force:true})}
