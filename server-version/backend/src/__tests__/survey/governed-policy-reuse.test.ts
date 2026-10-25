import {afterAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {assertSurveyPublicationNotPaused} from '../../modules/survey/tool-policy'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
const strict=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/survey/governed-tool.service',()=>({assertGovernedEntryAllowed:strict}))
vi.mock('../../modules/survey/governed-package.service',()=>({assertFrozenPackageAdmissions:vi.fn()}))
const publication={units:[{sourceDigest:'digest',sourceProvenance:{surveyToolReleaseId:'tool',sourceGrantId:'grant',source:{kind:'FORM',sourceId:'governed:tool',sourceVersion:'exact-hash'}}}]} as ResearchFrozenPublication
beforeEach(()=>strict.mockReset().mockResolvedValue({id:'tool'}))
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('strict governed proof still owns fresh policy and source grant gates',()=>{
 it('rejects a paused exact policy before reading a source grant',async()=>{
  strict.mockRejectedValueOnce(Object.assign(new Error('精确版本已暂停'),{statusCode:409}))
  const tx={$queryRaw:vi.fn()}
  await expect(assertSurveyPublicationNotPaused(tx as never,publication)).rejects.toMatchObject({statusCode:409})
  expect(strict).toHaveBeenCalledWith(tx,'tool','exact-hash');expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
 it('rejects a revoked source grant after a strict APPROVED proof',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([])}
  await expect(assertSurveyPublicationNotPaused(tx as never,publication)).rejects.toMatchObject({statusCode:403})
  expect(strict).toHaveBeenCalledTimes(1);expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain("status='ACTIVE' FOR SHARE")
 })
 it('does not perform a weaker duplicate policy query for a valid governed grant',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'grant'}])}
  await assertSurveyPublicationNotPaused(tx as never,publication)
  expect(strict).toHaveBeenCalledTimes(1);expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 })
})
