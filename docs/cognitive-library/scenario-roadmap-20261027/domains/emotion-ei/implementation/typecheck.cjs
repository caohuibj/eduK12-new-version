const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../../../..');
const ts=require(path.join(root,'server-version/backend/node_modules/typescript'));
let failed=false;const results=[];
for(const side of (process.argv[2] ? [process.argv[2]] : ['backend','frontend'])){
const cwd=path.join(root,'server-version',side),cfg=path.join(cwd,side==='backend'?'tsconfig.json':'tsconfig.app.json');
const read=ts.readConfigFile(cfg,ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,cwd);
const roots=side==='backend'?['src/modules/cognitive/content-candidates/voice-emotion-cues/package.ts','src/modules/cognitive/content-candidates/voice-emotion-cues/submission.ts','src/modules/cognitive/content-candidates/voice-emotion-cues/metadata.ts','src/__tests__/cognitive/voice-emotion-content.test.ts']:['src/modules/cognitive/tasks/voice-emotion-cues/VoiceEmotionTask.tsx','src/modules/cognitive/tasks/voice-emotion-cues/content.test.tsx','src/vite-env.d.ts','src/test/setup.ts'];
const p=ts.createProgram(roots.map(f=>path.join(cwd,f)),{...parsed.options,noEmit:true,incremental:false,composite:false});const ds=ts.getPreEmitDiagnostics(p);
const diagnostics=ds.map(d=>({file:d.file?path.relative(root,d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
const sourceInputs=p.getSourceFiles().filter(f=>f.fileName.startsWith(root)&&!f.fileName.includes('/node_modules/')).map(f=>({path:path.relative(root,f.fileName),sha256:crypto.createHash('sha256').update(fs.readFileSync(f.fileName)).digest('hex')}));
results.push({side,rootNames:roots,diagnostics,sourceInputs});if(ds.length)failed=true;
}
console.log(JSON.stringify({typescript:ts.version,results},null,2));process.exitCode=failed?1:0;
