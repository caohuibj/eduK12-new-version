const fs=require('node:fs'),path=require('node:path');
const repo='/workspace/eduK12-new-version';
const ts=require(repo+'/server-version/backend/node_modules/typescript');
const records=[];
for(const component of ['frontend']) {
 const dir=path.join(repo,'server-version',component),config=path.join(dir,component==='backend'?'tsconfig.json':'tsconfig.app.json');
 const read=ts.readConfigFile(config,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,dir);
 const folder=path.join(dir,'src',component==='backend'?'modules/cognitive/content-candidates/number-series':'modules/cognitive/tasks/number-series');
 const roots=fs.readdirSync(folder).filter(n=>/\.tsx?$/.test(n)).map(n=>path.join(folder,n));
 if(component==='backend')roots.push(path.join(dir,'src/__tests__/cognitive/number-series-content.test.ts'));
 const options={...parsed.options,noEmit:true,incremental:false,composite:false};delete options.tsBuildInfoFile;
 const program=ts.createProgram(roots,options);
 const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file?.fileName,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 records.push({component,roots,typescript:ts.version,sourceFiles:program.getSourceFiles().filter(f=>!f.isDeclarationFile).map(f=>f.fileName),diagnostics});
}
const output=repo+'/docs/cognitive-library/scenario-roadmap-20261027/domains/child-learning/implementation/types-frontend-final.json';
fs.writeFileSync(output,JSON.stringify(records,null,2)+'\n');
for(const r of records)console.log(JSON.stringify({component:r.component,roots:r.roots.length,sourceFiles:r.sourceFiles.length,diagnostics:r.diagnostics}));
process.exitCode=records.some(r=>r.diagnostics.length)?1:0;
