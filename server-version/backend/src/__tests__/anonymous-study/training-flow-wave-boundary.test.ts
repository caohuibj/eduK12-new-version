import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
const { db, composite }=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),$executeRaw:vi.fn(),$transaction:vi.fn(),compositeAssessment:{findUnique:vi.fn()}},composite:{revealAccessToken:vi.fn(),getPublicCompositeInfo:vi.fn(),createAccessTokenForComposite:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/composite/composite.service',()=>composite)
vi.mock('../../modules/composite/composite-export.service',()=>({compositeExportService:{}}))
vi.mock('../../modules/composite/composite-export-projection',()=>({}))
import {addWave,createWaveWithLink} from '../../modules/anonymous-study/service'
const empty={trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,trainingFlowDraft:null,trainingFlowFrozen:null,trainingFlowDigest:null}
const request={requestId:'request',compositeId:'questionnaire',title:'Wave',expiresAt:'2026-12-31T12:00:00.000Z',maxUses:100}
beforeEach(()=>{
 vi.resetAllMocks();db.$transaction.mockImplementation((fn:any)=>fn(db));db.compositeAssessment.findUnique.mockResolvedValue(empty)
 composite.revealAccessToken.mockResolvedValue({token:'public-token'});composite.createAccessTokenForComposite.mockResolvedValue({id:'token',token:'public-token'})
 db.$queryRaw.mockImplementation((q:TemplateStringsArray)=>{const s=q.join('');return Promise.resolve(s.includes('FROM anonymous_studies s JOIN users')?[{id:'study',status:'ACTIVE'}]:s.includes('SELECT count(*)')?[{count:0}]:s.includes('FOR UPDATE OF t')?[{id:'token'}]:[])})
})
describe('bidirectional Training flow / anonymous wave boundary',()=>{
 it.each(['trainingFlowDraft','trainingFlowFrozen','trainingFlowDigest','trainingVariantDigest'])('addWave rejects even incomplete marker %s under parent lock',async marker=>{
  db.compositeAssessment.findUnique.mockResolvedValue({...empty,[marker]:marker.endsWith('Digest')?'digest':{}})
  await expect(addWave('teacher',UserRole.TEACHER,'study',{compositeId:'questionnaire',tokenId:'token',title:'Wave'})).rejects.toMatchObject({statusCode:400})
  expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('composite_assessments');expect(db.$executeRaw).not.toHaveBeenCalled()
 })
 it.each(['trainingFlowDraft','trainingFlowFrozen','trainingFlowDigest'])('createWaveWithLink rejects %s before link creation or idempotent reply',async marker=>{
  db.compositeAssessment.findUnique.mockResolvedValue({...empty,[marker]:marker.endsWith('Digest')?'digest':{}})
  await expect(createWaveWithLink('teacher',UserRole.TEACHER,'study',request)).rejects.toMatchObject({statusCode:400})
  expect(composite.createAccessTokenForComposite).not.toHaveBeenCalled();expect(db.$executeRaw).not.toHaveBeenCalled()
  expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('composite_assessments');expect(db.$queryRaw.mock.calls[1][0].join('')).toContain('anonymous_studies')
 })
 it('preserves null ordinary wave creation and repeats compatibility inside insertion',async()=>{
  await expect(createWaveWithLink('teacher',UserRole.TEACHER,'study',request)).resolves.toMatchObject({id:'request',ordinal:1})
  expect(composite.createAccessTokenForComposite).toHaveBeenCalledTimes(1);expect(db.compositeAssessment.findUnique).toHaveBeenCalledTimes(2);expect(db.$executeRaw).toHaveBeenCalledTimes(1)
 })
})
