import {it,expect,vi,beforeAll,afterAll} from 'vitest'
import path from 'node:path'
import type {Prisma} from '@prisma/client'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptCognitivePayload,decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {retainEducationNativeBundle,assertEducationNativeBundle,readEducationNativeBundleFeedback,assertEducationNativeBundlePopulation} from '../../modules/bundle-product/education-adapter'
import type {BundleBindings} from '../../modules/bundle-product/instance'
beforeAll(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterAll(()=>vi.unstubAllEnvs())
const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
const frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-10-29T12:00:00.000Z',sourceReference:'synthetic-whole-source'})
const bindings={schemaVersion:1,slots:[{slotKey:'ase',itemId:'old-e',unitType:'SCALE'},{slotKey:'vc',itemId:'old-vc',unitType:'SCALE'}],context:[{contextKey:'grade_level',itemId:'old-grade',valueType:'number'}]}
const source=()=>({definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)})
it('retains the complete original package and remaps every slot/context without changing its definition',async()=>{
 const create=vi.fn().mockResolvedValue({}),tx={bundleInstance:{create}} as unknown as Prisma.TransactionClient,s=source()
 const identity=await retainEducationNativeBundle(tx,s,'new-runtime',new Map([['old-e','new-e'],['old-vc','new-vc'],['old-grade','new-grade']]))
 const stored=create.mock.calls[0][0].data
 expect(stored.definitionEncrypted).toBe(s.definitionEncrypted);expect(stored.definitionHash).toBe(frozen.contentHash)
 expect(decryptCognitivePayload<BundleBindings>(stored.bindingsEncrypted)).toMatchObject({slots:[{itemId:'new-e'},{itemId:'new-vc'}],context:[{itemId:'new-grade'}]})
 await expect(assertEducationNativeBundle(stored,identity)).resolves.toBeUndefined()
 await expect(assertEducationNativeBundle({...stored,bindingsHash:'0'.repeat(64)},identity)).rejects.toThrow('IDENTITY_CHANGED')
})
it('rejects split or mixed sources, while absent historical native identity has no write',async()=>{
 const create=vi.fn(),tx={bundleInstance:{create}} as unknown as Prisma.TransactionClient
 await expect(retainEducationNativeBundle(tx,undefined,'legacy',new Map())).resolves.toBeUndefined()
 await expect(retainEducationNativeBundle(tx,source(),'split',new Map([['old-e','new-e']]))).rejects.toThrow('INCOMPLETE')
 await expect(retainEducationNativeBundle(tx,source(),'mixed',new Map([['old-e','new-e'],['old-vc','new-vc'],['old-grade','new-grade'],['extra','extra']]))).rejects.toThrow('INCOMPLETE')
 expect(create).not.toHaveBeenCalled()
})
it('withholds native inference when any underlying single report or core metric is not authorized',async()=>{
 const s=source(),identity={definitionHash:s.definitionHash,bindingsHash:s.bindingsHash,sourceBindingsHash:s.bindingsHash}
 expect(await readEducationNativeBundleFeedback({attemptId:'must-not-query',instance:s,identity,availableItemIds:new Set(['old-e']),metricKeys:new Set(['academic_self_efficacy','value','cost'])})).toMatchObject({status:'WITHHELD',profileView:null})
 expect(await readEducationNativeBundleFeedback({attemptId:'must-not-query',instance:s,identity,availableItemIds:new Set(['old-e','old-vc']),metricKeys:new Set(['academic_self_efficacy','value'])})).toMatchObject({status:'WITHHELD',profileView:null})
})

it('does not relabel a youth native model as an adult Teacher SELF assessment',()=>{
 expect(()=>assertEducationNativeBundlePopulation(source(),'TEACHER')).toThrow('POPULATION_UNSUPPORTED')
 expect(()=>assertEducationNativeBundlePopulation(source(),'TEACHER')).toThrow(expect.objectContaining({statusCode:400}))
 expect(()=>assertEducationNativeBundlePopulation(source(),'SCHOOL')).not.toThrow()
})
