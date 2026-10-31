const path=require('node:path');const fs=require('node:fs');
const root='/workspace/eduK12-teacher-group-longitudinal';let errors=0;const records=[];
for(const [component,files] of Object.entries({backend:['src/modules/huiteacher/groupLongitudinalReport.service.ts','src/modules/huiteacher/groupLongitudinalReport.routes.ts'],frontend:['src/huiteacher/TeacherGroupLongitudinal.tsx','src/huiteacher/HuiteacherEvaluationStudio.tsx']})){
 if(process.argv[2]&&component!==process.argv[2])continue;
 const base=path.join(root,'server-version',component),ts=require(path.join(base,'node_modules/typescript'));
 const config=ts.readConfigFile(path.join(base,component==='frontend'?'tsconfig.app.json':'tsconfig.json'),ts.sys.readFile);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,base);const input=files.map(f=>path.join(base,f));
 const program=ts.createProgram({rootNames:component==='frontend'?[...input,path.join(base,'src/vite-env.d.ts')]:input,options:parsed.options});const diagnostics=program.getOptionsDiagnostics().concat(...input.map(f=>{const file=program.getSourceFile(f);if(!file)throw Error(f);return [...program.getSyntacticDiagnostics(file),...program.getSemanticDiagnostics(file)]}));
 if(diagnostics.length)console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 records.push({component,typescript:ts.version,files,diagnostics:diagnostics.length});errors+=diagnostics.length;
}
console.log(JSON.stringify({selectedModuleSemanticCheck:true,records,fullBuild:false}));process.exitCode=errors?1:0;
