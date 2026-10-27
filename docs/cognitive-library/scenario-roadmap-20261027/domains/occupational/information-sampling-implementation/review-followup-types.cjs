// DOT follow-up: current direct consumers and the old fixture adapted to the required language field.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto')
const root=process.cwd(),ts=require(path.join(root,'server-version/frontend/node_modules/typescript'))
const outputs=[]
for(const [label,configFile,entries] of [
 ['backend','server-version/backend/tsconfig.json',['server-version/backend/src/modules/cognitive/content-candidates/information-sampling/package.ts','server-version/backend/src/modules/cognitive/content-candidates/information-sampling/participant-presentation.ts','server-version/backend/src/__tests__/cognitive/information-sampling-content.test.ts']],
 ['frontend','server-version/frontend/tsconfig.app.json',['server-version/frontend/src/modules/cognitive/tasks/information-sampling/IstTask.tsx','server-version/frontend/src/modules/cognitive/tasks/information-sampling/content.test.tsx','server-version/frontend/src/modules/cognitive/tasks/information-sampling/review-followup.test.tsx','server-version/frontend/src/modules/cognitive/tasks/information-sampling/strictmode-lifecycle.test.tsx']]
]){
 if(process.argv[3]&&label!==process.argv[3])continue
 const read=ts.readConfigFile(path.join(root,configFile),ts.sys.readFile);if(read.error)throw Error(ts.flattenDiagnosticMessageText(read.error.messageText,'\n'))
 const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(path.join(root,configFile)))
 const program=ts.createProgram(entries.map(p=>path.join(root,p)),{...parsed.options,noEmit:true,incremental:false,composite:false})
 const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file?path.relative(root,d.file.fileName):null,start:d.start??null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))
 outputs.push({label,configFile,entries,diagnostics,sourceFiles:program.getSourceFiles().filter(f=>!f.isDeclarationFile).map(f=>({path:path.relative(root,f.fileName),sha256:crypto.createHash('sha256').update(f.text).digest('hex')}))})
}
const dest=process.argv[2];if(!dest)throw Error('Output filename required');fs.writeFileSync(dest,JSON.stringify(outputs,null,2)+'\n');console.log(JSON.stringify(outputs.map(x=>({label:x.label,entries:x.entries.length,sourceFiles:x.sourceFiles.length,diagnostics:x.diagnostics}))))
if(outputs.some(x=>x.diagnostics.length))process.exitCode=1
