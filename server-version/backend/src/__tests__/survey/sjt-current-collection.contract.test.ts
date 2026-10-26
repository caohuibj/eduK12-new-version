import {beforeEach,describe,it,expect,vi} from 'vitest'
const check=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/situational/entry-authority',async original=>({...await original<any>(),assertSjtEntryDistributionAuthority:check}))
import {SjtEntryAuthorityError} from '../../modules/situational/entry-authority'
import {assertSurveyPublicationNotPaused} from '../../modules/survey/tool-policy'
const receipt={protocol:'sjt-survey-distribution-v1',actorId:'manager',grantId:'source-capability',grantVersion:1,
 measurementReleaseId:'measurement',measurementContentHash:'a'.repeat(64),releaseId:'native',instrumentVersion:'1',definitionHash:'b'.repeat(64),contentDigest:'c'.repeat(64)}
const fixture=()=>{
 const snapshot:any={projectId:'project',units:['first','second'].map((instrumentKey,index)=>({draftId:'draft-'+index,instrumentKey,kind:'SJT',
  sourceDigest:'d'.repeat(64),sourceProvenance:{source:{kind:'SJT',sourceId:'native',sourceVersion:'1'},sourceGrantId:'grant-'+index,sjtEntryAuthority:receipt}}))}
 const tx:any={$executeRaw:vi.fn(async()=>0),$queryRaw:vi.fn(async(query:any)=>{
  const sql=(query.strings??query).join('')
  return sql.includes('survey_tool_grants')?[{id:'current-grant'}]:[]
 })}
 return {tx,snapshot}
}
beforeEach(()=>{vi.resetAllMocks();check.mockResolvedValue(undefined)})
describe('current pinned native source distribution authority at collection',()=>{
 it('checks the same exact capability once per transaction, each recipient grant, and checks again next request',async()=>{
  const f=fixture();await assertSurveyPublicationNotPaused(f.tx,f.snapshot)
  expect(check).toHaveBeenCalledExactlyOnceWith(f.tx,{actorId:receipt.actorId,releaseId:receipt.releaseId,instrumentVersion:receipt.instrumentVersion,pinned:receipt})
  expect(f.tx.$queryRaw.mock.calls.filter(([q]:any)=>(q.strings??q).join('').includes('survey_tool_grants'))).toHaveLength(2)
  await assertSurveyPublicationNotPaused(f.tx,f.snapshot);expect(check).toHaveBeenCalledTimes(2)
 })
 it('refuses revoked or expired pinned authority without substituting a newer capability',async()=>{
  const f=fixture();check.mockRejectedValueOnce(new SjtEntryAuthorityError('SOURCE_SJT_ENTRY_AUTHORITY_STALE'))
  await expect(assertSurveyPublicationNotPaused(f.tx,f.snapshot)).rejects.toMatchObject({statusCode:403})
  expect(check).toHaveBeenCalledExactlyOnceWith(f.tx,{actorId:receipt.actorId,releaseId:receipt.releaseId,instrumentVersion:receipt.instrumentVersion,pinned:receipt})
 })
 it('still rejects the second recipient grant when the common source capability is valid',async()=>{
  const f=fixture();let grants=0
  f.tx.$queryRaw.mockImplementation(async(query:any)=>{
   const sql=(query.strings??query).join('')
   return sql.includes('survey_tool_grants')?++grants===1?[{id:'first'}]:[]:[]
  })
  await expect(assertSurveyPublicationNotPaused(f.tx,f.snapshot)).rejects.toMatchObject({statusCode:403})
  expect(check).toHaveBeenCalledTimes(1);expect(grants).toBe(2)
 })
})
