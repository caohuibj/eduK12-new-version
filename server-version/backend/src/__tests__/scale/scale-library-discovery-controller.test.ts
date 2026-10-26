import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Request,Response} from 'express'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/scale/library/standard-catalog-reader',()=>({readStandardScaleLibraryForActor:read}))
import {scaleLibraryController} from '../../controllers/scaleLibraryController'
import {buildUnifiedScaleLibraryReadModel} from '../../modules/scale/library/catalog-only-read-model'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const model=()=>{
 const m=buildUnifiedScaleLibraryReadModel({viewerRole:'ADMIN',locale:'zh-CN',territory:'CN'})
 const a=structuredClone(m.entries[0]),b=structuredClone(a)
 a.construct.constructOverlapTags=['license:noncommercial_only'];b.identity.instrumentKey='synthetic-other';b.construct.constructOverlapTags=['license:cc_by_4_0']
 return {...m,entries:[a,b]}
}
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res}
beforeEach(()=>vi.clearAllMocks())
describe('general library classification DTOs',()=>{
 it('filters on source tags, exposes facets only from the actor-readable model and preserves availability',async()=>{
  const m=model(),before=canonicalHash(m);read.mockResolvedValue(m)
  const res=response();await scaleLibraryController.list({user:{userId:'actor',role:'ADMIN'},query:{keyword:'非商业',tags:'license:noncommercial_only'}} as unknown as Request,res as unknown as Response)
  const body=res.json.mock.calls[0][0]
  expect(body.code).toBe(0);expect(body.data.entries).toHaveLength(1)
  expect(body.data.entries[0].classificationTags).toContainEqual({id:'license:noncommercial_only',label:'仅限非商业',facet:'license'})
  expect(body.data.tagFacets.license).toHaveLength(2)
  expect(body.data.entries[0].availability).toEqual(m.entries[0].availability)
  expect(canonicalHash(m)).toBe(before)
 })
 it('does not read private metadata or return facets without an authenticated actor',async()=>{
  const res=response();await scaleLibraryController.list({query:{}} as Request,res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(401);expect(read).not.toHaveBeenCalled()
  expect(res.json.mock.calls[0][0].data).toBeNull()
 })
 it('includes the same detached classification in exact-version detail without changing the source',async()=>{
  const m=model();read.mockResolvedValue(m);const res=response(),identity=m.entries[0].identity
  await scaleLibraryController.detail({user:{userId:'actor',role:'ADMIN'},query:{},params:{instrumentKey:identity.instrumentKey,instrumentVersion:identity.instrumentVersion}} as unknown as Request,res as unknown as Response)
  expect(res.json.mock.calls[0][0].data.entry.classificationTags).toContainEqual({id:'license:noncommercial_only',label:'仅限非商业',facet:'license'})
  expect(m.entries[0]).not.toHaveProperty('classificationTags')
 })
})
