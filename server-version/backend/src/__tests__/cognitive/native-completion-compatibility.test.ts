import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createUnifiedCognitiveRawSubmissionPayload,parseUnifiedCognitiveRawSubmissionPayload} from '../../modules/cognitive/unified-raw-submission'
import {finalCognitiveSubmitSchema,finalCognitivePublicSubmitSchema} from '../../modules/cognitive/cognitive.schema'
import {nativeCompletionFixture} from './native-completion-fixture.test-support'
describe('native completion backward compatibility',()=>{
 it('leaves an old encrypted-payload shape and canonical identity unchanged',()=>{
  const f=nativeCompletionFixture(),trials=f.input.trials.slice(0,1)
  const old={schemaVersion:1,attemptEpoch:1,trials},created=createUnifiedCognitiveRawSubmissionPayload({attemptEpoch:1,trials})
  expect(created).toEqual(old);expect(Object.keys(created)).not.toContain('nativeCompletion')
  expect(parseUnifiedCognitiveRawSubmissionPayload(old)).toEqual(old)
  expect(canonicalHash(created)).toBe(canonicalHash(old))
 })
 it('accepts the authenticated optional claim while preserving the public schema boundary',()=>{
  const f=nativeCompletionFixture(),old={submissionId:'compatibility-submit',attemptEpoch:1,definitionHash:f.input.session.configHash,trials:f.input.trials}
  expect(finalCognitiveSubmitSchema.safeParse(old).success).toBe(true)
  expect(finalCognitiveSubmitSchema.safeParse({...old,nativeCompletion:f.completion}).success).toBe(true)
  expect(finalCognitivePublicSubmitSchema.safeParse({...old,recoveryToken:'x'.repeat(32)}).success).toBe(true)
  expect(finalCognitivePublicSubmitSchema.safeParse({...old,recoveryToken:'x'.repeat(32),nativeCompletion:f.completion}).success).toBe(false)
 })
})
