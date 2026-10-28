const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../../../../..'),ts=require(path.join(root,'server-version/frontend/node_modules/typescript')),kind=process.argv[2]
if(!['backend','frontend'].includes(kind))throw Error('Choose backend or frontend')
const dir=path.join(root,'server-version',kind),configFile=path.join(dir,kind==='backend'?'tsconfig.json':'tsconfig.app.json')
const config=ts.readConfigFile(configFile,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,dir)
const roots=kind==='backend'?['src/modules/cognitive/content-candidates/attentional-blink/analysis.ts','src/__tests__/cognitive/attentional-blink-input-review.test.ts']:['src/modules/cognitive/tasks/attentional-blink/content.test.tsx','src/modules/cognitive/tasks/attentional-blink/review.test.tsx','src/vite-env.d.ts','src/test/setup.ts']
const program=ts.createProgram(roots.map(f=>path.join(dir,f)),{...parsed.options,noEmit:true,incremental:false})
const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>({file:d.file&&path.relative(root,d.file.fileName),start:d.start,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sources=Object.fromEntries(program.getSourceFiles().filter(f=>!f.fileName.includes('node_modules')).map(f=>[path.relative(root,f.fileName),sha(f.text)]))
fs.writeFileSync(path.join(__dirname,kind+'-types.json'),JSON.stringify({node:process.version,roots,configSHA256:sha(fs.readFileSync(configFile)),sources,diagnostics},null,2)+'\n')
console.log(JSON.stringify({success:diagnostics.length===0,node:process.version,sourceCount:Object.keys(sources).length,diagnostics},null,2));process.exitCode=diagnostics.length?1:0
