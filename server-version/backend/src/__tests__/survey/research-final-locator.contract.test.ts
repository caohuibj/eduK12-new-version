import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {verifiedSurveyAttempt,verifiedSurveyFinalLocator} from '../../modules/survey/admission.service'
const mocks=vi.hoisted(()=>({find:vi.fn(),project:vi.fn(),recover:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:any)=>fn({
  surveyProject:{findFirst:mocks.project},surveyWaveAttempt:{findFirst:mocks.find},
})}}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:()=> 'hash',recoverLinkedResearchIdentity:mocks.recover}))
const proof={publicId:randomUUID(),attemptId:randomUUID(),accessCredential:'a'.repeat(43)}
let attempt:any
beforeEach(()=>{
 vi.clearAllMocks();process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true'
 const compiledSnapshot={runtimeStatus:'SURVEY_FINAL_V1',units:[]}
 attempt={id:proof.attemptId,waveId:'wave',participantId:null,status:'STARTED',sessionHash:'hash',wave:{
  generalText:'thanks',finishUntil:new Date(),hardStopAt:null,publication:{id:'publication',compiledSnapshot,definitionDigest:canonicalHash(compiledSnapshot)}}}
 mocks.project.mockResolvedValue({id:'project'});mocks.find.mockImplementation(async(args:any)=>{
  const value=structuredClone(attempt);if(!args.select.wave.select.publication.select.compiledSnapshot)delete value.wave.publication.compiledSnapshot;return value
 });mocks.recover.mockResolvedValue({participantId:'person'})
})
describe('Survey FINAL preflight metadata projection',()=>{
 it('omits the definition payload but binds the same project, bearer, attempt and version',async()=>{
  const result=await verifiedSurveyFinalLocator(proof)
  expect(result).toMatchObject({projectId:'project',attemptId:proof.attemptId,publicationId:'publication',definitionDigest:attempt.wave.publication.definitionDigest})
  expect(result).not.toHaveProperty('compiledSnapshot')
  expect(mocks.find.mock.calls[0][0].select.wave.select.publication.select.compiledSnapshot).toBe(false)
 })
 it('full task/read callers still select and verify their complete snapshot',async()=>{
  expect((await verifiedSurveyAttempt(proof)).compiledSnapshot).toEqual(attempt.wave.publication.compiledSnapshot)
  expect(mocks.find.mock.calls[0][0].select.wave.select.publication.select.compiledSnapshot).toBe(true)
  attempt.wave.publication.compiledSnapshot.units.push({corrupt:true})
  await expect(verifiedSurveyAttempt(proof)).rejects.toMatchObject({statusCode:403})
 })
 it('rejects a wrong unlinked credential, unknown project and unavailable publication',async()=>{
  attempt.sessionHash='revoked';await expect(verifiedSurveyFinalLocator(proof)).rejects.toMatchObject({statusCode:403})
  attempt.sessionHash='hash';mocks.project.mockResolvedValueOnce(null);await expect(verifiedSurveyFinalLocator(proof)).rejects.toMatchObject({statusCode:403})
  attempt.wave.publication=null;mocks.find.mockResolvedValueOnce(attempt);await expect(verifiedSurveyFinalLocator(proof)).rejects.toMatchObject({statusCode:403})
 })
 it('keeps linked identity recovery and exact participant binding',async()=>{
  attempt.participantId='person';await expect(verifiedSurveyFinalLocator(proof)).rejects.toMatchObject({statusCode:403})
  await verifiedSurveyFinalLocator({...proof,researchCode:'R-12345678'})
  expect(mocks.recover).toHaveBeenCalledWith({projectId:'project',researchCode:'R-12345678',accessCredential:proof.accessCredential})
  mocks.recover.mockResolvedValueOnce({participantId:'different'});await expect(verifiedSurveyFinalLocator({...proof,researchCode:'R-12345678'})).rejects.toMatchObject({statusCode:403})
 })
})
