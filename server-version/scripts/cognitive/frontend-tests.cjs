const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const {declaredFrontendSuites}=require('./acceptance.cjs')
function frontendTestArguments(root){
 const cwd=path.join(root,'server-version/frontend')
 const suites=declaredFrontendSuites(root)
 if(!suites.length)throw Error('Missing onboarding-owned frontend suites')
 for(const suite of suites){
  if(!/^src\/modules\/cognitive\/[A-Za-z0-9_./-]+\.test\.tsx?$/.test(suite)
    ||suite.split('/').some(part=>part==='..'||part==='.')||!fs.existsSync(path.join(cwd,suite)))
    throw Error('Invalid onboarding-owned suite '+suite)
 }
 return ['run','--maxWorkers=2',...suites.flatMap(suite=>['--exclude',suite])]
}
if(require.main===module){
 const root=path.resolve(__dirname,'../../..'),cwd=path.join(root,'server-version/frontend')
 if(process.argv.slice(2).join(' ')!=='--onboarding-owned-by-backend')throw Error('Explicit onboarding owner required')
 const result=spawnSync(process.execPath,[path.join(cwd,'node_modules/vitest/vitest.mjs'),...frontendTestArguments(root)],{cwd,env:process.env,stdio:'inherit'})
 if(result.error)throw result.error
 process.exitCode=result.status??1
}
module.exports={frontendTestArguments}
