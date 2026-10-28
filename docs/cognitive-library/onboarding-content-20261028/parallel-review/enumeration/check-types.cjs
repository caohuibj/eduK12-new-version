const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../../../..'),ts=require(path.join(root,'server-version/backend/node_modules/typescript'))
const groups={backend:{dir:'server-version/backend',config:'tsconfig.json',roots:['src/modules/cognitive/content-candidates/enumeration/protocol.ts','src/modules/cognitive/content-candidates/enumeration/scorer.ts','src/modules/cognitive/content-candidates/enumeration/package.ts']},frontend:{dir:'server-version/frontend',config:'tsconfig.app.json',roots:['src/modules/cognitive/tasks/enumeration/NativeEnumerationRunner.tsx','src/modules/cognitive/tasks/enumeration/EnumerationTask.tsx','src/modules/cognitive/tasks/enumeration/native-frozen-config.test.ts','src/modules/cognitive/tasks/enumeration/incomplete-practice.test.tsx','src/modules/cognitive/tasks/enumeration/native-port.test.tsx','src/vite-env.d.ts','src/test/setup.ts']}}
const group=process.argv[2],g=groups[group];if(!g)throw Error('Select backend/frontend')
const base=path.join(root,g.dir),config=ts.readConfigFile(path.join(base,g.config),ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,base)
const program=ts.createProgram(g.roots.map(p=>path.join(base,p)),{...parsed.options,noEmit:true,incremental:false})
const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file&&path.relative(root,d.file.fileName),start:d.start,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))
const sources=Object.fromEntries(program.getSourceFiles().filter(f=>!f.fileName.includes('node_modules')).map(f=>[path.relative(root,f.fileName),crypto.createHash('sha256').update(f.text).digest('hex')]))
fs.writeFileSync(path.join(__dirname,group+'-types.json'),JSON.stringify({node:process.version,roots:g.roots,sources,diagnostics},null,2)+'\n')
console.log(JSON.stringify({group,sourceCount:Object.keys(sources).length,diagnostics}));process.exitCode=diagnostics.length?1:0
