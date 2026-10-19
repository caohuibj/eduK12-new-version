/** One new course/two publications, three attempts/four FINALs. No old replay. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {readAnalysisPrerequisites,analysisState,coreState,qualification} from './c25-analysis-contract.mjs'
import {runAnalysisSupplement} from './c25-analysis-http.mjs'
import {harness,publicFailure} from './c25-client.mjs'
export async function main(){
 const inherited=readAnalysisPrerequisites(process.argv[2])
 const h=await harness('analysis-execute',300);let error
 try{
  assert.equal(h.state,analysisState);h.result.qualification={...h.result.qualification,...qualification}
  h.result.inheritedCoreReceipt=inherited.references[path.join(coreState,'c25-missing-result.json')]
  h.result.inheritedRestore=inherited.references[path.join(coreState,'c25-missing-restore-result.json')]
  const source=JSON.parse(fs.readFileSync(path.join(coreState,'c25-fixture-private.json')))
  const E=JSON.parse(fs.readFileSync(path.join(coreState,'c25-missing-probe-fixture-private.json')))
  await runAnalysisSupplement(h,source,E)
  h.result.passed=true
 }catch(e){error=e}finally{await h.finish(error)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 try{if(process.argv[2]===analysisState)fs.writeFileSync(path.join(analysisState,'c25-analysis-entry-error-private.log'),String(error.stack??error),{flag:'wx',mode:0o600})}catch{}
 console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
