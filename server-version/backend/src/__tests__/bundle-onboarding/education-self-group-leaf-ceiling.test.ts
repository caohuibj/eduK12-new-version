import {it,expect,vi} from 'vitest'
import path from 'node:path'
const read=vi.hoisted(()=>vi.fn().mockRejectedValue(Error('forbidden selector must not materialize saved Bundle feedback')))
vi.mock('../../modules/bundle-product/analysis',()=>({readReport:read}))
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {readEducationNativeBundleFeedback} from '../../modules/bundle-product/education-adapter'

it('withholds Bundle inference when a READY item forbids its selector despite a global grant from another item',async()=>{
 vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64))
 try{
  const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
  const frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-10-29T12:00:00.000Z',sourceReference:'synthetic-whole-source'})
  const bindings={schemaVersion:1,slots:[{slotKey:'ase',itemId:'item-a',unitType:'SCALE'},{slotKey:'vc',itemId:'item-b',unitType:'SCALE'}],context:[{contextKey:'grade_level',itemId:'grade',valueType:'number'}]}
  const instance={definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)}
  const result=await readEducationNativeBundleFeedback({attemptId:'must-not-query',instance,
   identity:{definitionHash:instance.definitionHash,bindingsHash:instance.bindingsHash,sourceBindingsHash:instance.bindingsHash},
   availableItemIds:new Set(['item-a','item-b']),metricKeys:new Set(['academic_self_efficacy','value','cost']),
   metricKeysByItem:new Map([['item-a',new Set(['academic_self_efficacy','cost'])],['item-b',new Set(['value'])]])})
  expect(result).toMatchObject({status:'WITHHELD',profileView:null})
  expect(read).not.toHaveBeenCalled()
 }finally{vi.unstubAllEnvs()}
})
