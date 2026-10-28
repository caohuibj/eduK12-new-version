const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../../../..'),front=path.join(root,'server-version/frontend'),ts=require(path.join(front,'node_modules/typescript'))
const configPath=path.join(front,'tsconfig.app.json'),config=ts.readConfigFile(configPath,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,front)
const roots=['src/modules/cognitive/tasks/gradcpt/review-report.test.tsx','src/vite-env.d.ts','src/test/setup.ts']
const program=ts.createProgram(roots.map(f=>path.join(front,f)),{...parsed.options,noEmit:true,incremental:false})
const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file&&path.relative(root,d.file.fileName),start:d.start,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const sources=Object.fromEntries(program.getSourceFiles().filter(f=>!f.fileName.includes('node_modules')).map(f=>[path.relative(root,f.fileName),sha(f.text)]))
fs.writeFileSync(path.join(__dirname,'report-types.json'),JSON.stringify({roots,configSHA256:sha(fs.readFileSync(configPath)),sources,diagnostics},null,2)+'\n')
console.log(JSON.stringify({success:diagnostics.length===0,sourceCount:Object.keys(sources).length,diagnostics},null,2));process.exitCode=diagnostics.length?1:0
