import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,realpathSync,symlinkSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {runAcceptance}=require('../../../../scripts/cognitive/acceptance.cjs')

it('uses a real Vitest control and rejects an actually skipped declared suite',()=>{
 const root=mkdtempSync(join(tmpdir(),'cognitive-owner-control-'))
 try{
  const frontend=join(root,'server-version/frontend'),suite='src/modules/cognitive/fixture.test.ts'
  mkdirSync(join(frontend,'src/modules/cognitive'),{recursive:true})
  const installed=realpathSync(fileURLToPath(new URL('../../../node_modules/',import.meta.url)))
  symlinkSync(installed,join(frontend,'node_modules'),'dir')
  writeFileSync(join(frontend,suite),"import {it} from 'vitest'; it('normal synthetic control',()=>{});\n")
  expect(runAcceptance(root,{acceptance:{frontendSuites:[suite]}})).toBe(1)
  writeFileSync(join(frontend,suite),"import {it} from 'vitest'; it.skip('skipped synthetic control',()=>{});\n")
  expect(()=>runAcceptance(root,{acceptance:{frontendSuites:[suite]}})).toThrow(/COG_RUNNER_ACCEPTANCE_FAILED/)
 }finally{rmSync(root,{recursive:true,force:true})}
},15000)
