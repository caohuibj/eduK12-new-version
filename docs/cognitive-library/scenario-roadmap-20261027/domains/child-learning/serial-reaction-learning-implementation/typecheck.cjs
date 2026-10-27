const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../../../../../..'),ts=require(repo+'/server-version/backend/node_modules/typescript');
const records=[];
for(const component of (process.argv[2]?[process.argv[2]]:['backend','frontend'])){
 const dir=repo+'/server-version/'+component,config=path.join(dir,component==='backend'?'tsconfig.json':'tsconfig.app.json'),read=ts.readConfigFile(config,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,dir);
 const folder=path.join(dir,'src',component==='backend'?'modules/cognitive/content-candidates/serial-reaction-learning':'modules/cognitive/tasks/serial-reaction-learning'),roots=fs.readdirSync(folder).filter(n=>/\.tsx?$/.test(n)).map(n=>path.join(folder,n));
 if(component==='backend')roots.push(dir+'/src/__tests__/cognitive/serial-reaction-learning-content.test.ts');
 const options={...parsed.options,noEmit:true,incremental:false,composite:false};delete options.tsBuildInfoFile;
 const program=ts.createProgram(roots,options),diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file?.fileName,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 records.push({component,typescript:ts.version,roots,sourceFiles:program.getSourceFiles().filter(x=>!x.isDeclarationFile).map(x=>x.fileName),diagnostics});
}
fs.writeFileSync(path.join(__dirname,process.argv[3]||'types-attempt1.json'),JSON.stringify(records,null,2)+'\n');console.log(JSON.stringify(records.map(r=>({component:r.component,roots:r.roots.length,sourceFiles:r.sourceFiles.length,diagnostics:r.diagnostics}))));process.exitCode=records.some(r=>r.diagnostics.length)?1:0;
