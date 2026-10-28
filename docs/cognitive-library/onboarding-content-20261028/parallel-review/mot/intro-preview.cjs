const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process')
const root=path.resolve(__dirname,'../../../../..'),front=path.join(root,'server-version/frontend'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'mot-intro-review-'))
const esbuild=require(path.join(front,'node_modules/esbuild'))
const entry=`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {MotTask} from ${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/mot/MotTask.tsx'))};
import {MotCalibration} from ${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/mot/MotCalibration.tsx'))};
import {motConfig} from ${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/mot/generated/protocol.ts'))};
globalThis.window={innerWidth:820,innerHeight:1180,devicePixelRatio:2} as any;
const out=${JSON.stringify(__dirname)},css=readFileSync(${JSON.stringify(path.join(front,'src/modules/cognitive/tasks/mot/mot.css'))},'utf8'),files=[];
for(const language of ${process.argv.includes('--english-intros-only')?"['en']":"['zh','en']"} as const)for(const profile of ['experience','research'] as const){
 const draft:any={binding:{sessionId:'synthetic-intro-'+profile+'-'+language,attemptNo:1,protocolKey:'mot/1.1.1/1.1.0',resolvedConfigHash:'synthetic-preview-only',randomSeed:'mot-intro-review'},pending:async()=>null,begin:async()=>{},append:async()=>{},records:async()=>[],appendPractice:async()=>{},practices:async()=>[]};
 const body=renderToStaticMarkup(<MotTask config={motConfig(profile)} randomSeed="mot-intro-review" trialIndex={0} language={language} draft={draft} onTrialComplete={async()=>true} prepareFinalArchive={async()=>{}}/>);
 const name='intro-'+profile+'-'+language+'.html';writeFileSync(join(out,name),'<!doctype html><html lang="'+language+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><p>SYNTHETIC COMPONENT PREVIEW / 合成组件预览 · 未发布</p>'+body+'</html>');files.push({file:name,profile,language,text:body.replace(/<[^>]*>/g,' ')});
}
for(const language of ${process.argv.includes('--english-intros-only')?"[]":"['zh','en']"} as const){const name='calibration-'+language+'.html',body=renderToStaticMarkup(<div className="mot-task"><MotCalibration language={language} onConfirm={()=>{}}/></div>);writeFileSync(join(out,name),'<!doctype html><html lang="'+language+'"><meta charset="utf-8"><style>'+css+'</style><p>SYNTHETIC COMPONENT PREVIEW / 未进行真实校准</p>'+body+'</html>');files.push({file:name,language,text:body.replace(/<[^>]*>/g,' ')});}
writeFileSync(join(out,${JSON.stringify(process.argv.includes('--english-intros-only')?'intro-render-english-final.json':'intro-render.json')}),JSON.stringify({node:process.version,kind:'ACTUAL_COMPONENT_STATIC_RENDER_NOT_BROWSER_OR_CALIBRATION_EVIDENCE',files},null,2)+'\\n');console.log(JSON.stringify({node:process.version,files:files.map(f=>f.file)}));`
try{
 esbuild.buildSync({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'entry.cjs'),nodePaths:[path.join(front,'node_modules')],loader:{'.css':'empty'},logLevel:'silent'})
 const run=cp.spawnSync(process.execPath,[path.join(temp,'entry.cjs')],{encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);process.exitCode=run.status??1
}finally{fs.rmSync(temp,{recursive:true,force:true})}
