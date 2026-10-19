import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {anonymousStudyApi,publicStudyApi} from '../anonymousStudy'
const owner=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('../client',()=>({default:owner}))
const version={id:'11111111-1111-4111-8111-111111111111',studyId:'study',version:1,body:'Immutable research consent body from the server.',bodyHash:'body-hash',publishedAt:'2026-10-18T12:00:00.000Z',scope:{purpose:'Research purpose',dataCategories:['FORM'] as const,waveCoverage:'EXISTING_AND_FUTURE'},scopeId:'study',scopeHash:'scope-hash'}
const participation={version,acceptedVersion:null,acceptance:null,state:'UNKNOWN',revision:0,eligible:false,reason:null}
beforeEach(()=>{vi.resetAllMocks()})
afterEach(()=>{vi.unstubAllGlobals()})

it('publishes exact owner scope and CAS/version payload through authenticated management routes',async()=>{
 owner.get.mockResolvedValue({code:0,message:'ok',data:{version}});owner.post.mockResolvedValue({code:0,message:'ok',data:version})
 expect(await anonymousStudyApi.researchConsent('study/one')).toEqual({version})
 expect(owner.get).toHaveBeenCalledWith('/anonymous-studies/study%2Fone/research-consent')
 const input={requestId:'22222222-2222-4222-8222-222222222222',expectedVersionId:null,body:version.body,scope:{purpose:version.scope.purpose,dataCategories:['FORM' as const]}}
 expect(await anonymousStudyApi.publishResearchConsent('study/one',input)).toEqual(version)
 expect(owner.post).toHaveBeenCalledWith('/anonymous-studies/study%2Fone/research-consent',input)
})

it('uses full credential bearer with no session authority for consent reads, acceptance and withdrawal',async()=>{
 const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,json:vi.fn().mockResolvedValue({code:0,message:'ok',data:participation})})
 vi.stubGlobal('fetch',fetchMock)
 const api=publicStudyApi('FULL-IDENTITY-CREDENTIAL')
 expect(await api.researchConsent('study/one')).toEqual(participation)
 const accept={requestId:'22222222-2222-4222-8222-222222222222',versionId:version.id,bodyHash:version.bodyHash}
 const withdraw={requestId:'33333333-3333-4333-8333-333333333333',expectedRevision:1}
 await api.acceptResearchConsent('study/one',accept);await api.requestResearchWithdrawal('study/one',withdraw)
 expect(fetchMock.mock.calls.map(call=>call[0])).toEqual(['/api/public/anonymous-studies/study%2Fone/research-consent','/api/public/anonymous-studies/study%2Fone/research-consent/accept','/api/public/anonymous-studies/study%2Fone/research-withdrawal'])
 for(const [,init] of fetchMock.mock.calls){expect(init.credentials).toBe('omit');expect(new Headers(init.headers).get('Authorization')).toBe('Bearer FULL-IDENTITY-CREDENTIAL')}
 expect(fetchMock.mock.calls[0][1].method).toBe('GET')
 expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(accept)
 expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(withdraw)
})

it('rejects revoked capability or owner authorization failures without manufacturing consent',async()=>{
 owner.get.mockResolvedValue({code:-1,message:'Forbidden',data:{version}})
 await expect(anonymousStudyApi.researchConsent('study')).rejects.toThrow('Forbidden')
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403,headers:new Headers(),clone:()=>({json:async()=>({code:-1,message:'Identity revoked'})})}))
 await expect(publicStudyApi('revoked').researchConsent('study')).rejects.toMatchObject({status:403,message:'Identity revoked'})
})

it('uses explicit page and revision-bound owner withdrawal review routes',async()=>{
 owner.get.mockResolvedValue({code:0,message:'ok',data:{list:[],page:2,pageSize:25}})
 await anonymousStudyApi.researchWithdrawals('study/one',2)
 expect(owner.get).toHaveBeenCalledWith('/anonymous-studies/study%2Fone/research-withdrawals?page=2')
 owner.post.mockResolvedValue({code:0,message:'ok',data:{state:'EXCLUDED',revision:4}})
 const input={requestId:'33333333-3333-4333-8333-333333333333',expectedRevision:3,reason:'Confirmed research withdrawal'}
 expect(await anonymousStudyApi.reviewResearchWithdrawal('study/one','participant/one',input)).toEqual({state:'EXCLUDED',revision:4})
 expect(owner.post).toHaveBeenCalledWith('/anonymous-studies/study%2Fone/participants/participant%2Fone/research-withdrawal/review',input)
})
