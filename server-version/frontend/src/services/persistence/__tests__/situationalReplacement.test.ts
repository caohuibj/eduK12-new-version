import { describe, expect, it } from 'vitest'
import { createFinalDraftMeta, createFinalDraftStore } from '../finalDraftStore'
const setup = async () => {
  const store = createFinalDraftStore()
  const meta = createFinalDraftMeta({draftKey:`situational:${crypto.randomUUID()}`,instrument:'situational',attemptId:'a',attemptEpoch:1,definitionHash:'h',contextSnapshotHash:null,deliveryMode:'final_only',submissionId:'submission-123456'})
  await store.ensure(meta)
  await store.putAnswer({draftKey:meta.draftKey,itemKey:'old',value:'keep on failure',updatedAt:1})
  return {store,meta}
}
describe('atomic SJT answer replacement',()=>{
  it('replaces the full set without altering another draft',async()=>{
    const {store,meta}=await setup()
    const other={...meta,draftKey:meta.draftKey+'other'}
    await store.ensure(other)
    await store.putAnswer({draftKey:other.draftKey,itemKey:'q',value:'other',updatedAt:1})
    await store.replaceSituationalAnswers(meta,[{draftKey:meta.draftKey,itemKey:'new',value:'restored',updatedAt:2}])
    expect((await store.listAnswers(meta.draftKey)).map(a=>a.itemKey)).toEqual(['new'])
    expect((await store.listAnswers(other.draftKey))[0].value).toBe('other')
  })
  it('validates the entire replacement before any mutation',async()=>{
    const {store,meta}=await setup()
    await expect(store.replaceSituationalAnswers(meta,[{draftKey:meta.draftKey,itemKey:'new',value:'new',updatedAt:2},{draftKey:'wrong',itemKey:'bad',value:'bad',updatedAt:2}])).rejects.toThrow()
    expect((await store.listAnswers(meta.draftKey)).map(a=>a.itemKey)).toEqual(['old'])
  })
  it('rejects stale identity and a sealed submission',async()=>{
    const {store,meta}=await setup()
    await expect(store.replaceSituationalAnswers({...meta,attemptEpoch:2},[])).rejects.toThrow()
    await store.sealForSubmission(meta.draftKey,s=>({answers:s.answers}))
    await expect(store.replaceSituationalAnswers(meta,[])).rejects.toThrow()
    expect((await store.listAnswers(meta.draftKey)).map(a=>a.itemKey)).toEqual(['old'])
  })
  it('permits explicit empty restoration but rejects non-SJT usage',async()=>{
    const {store,meta}=await setup()
    await expect(store.replaceSituationalAnswers({...meta,instrument:'scale'},[])).rejects.toThrow()
    await store.replaceSituationalAnswers(meta,[])
    expect(await store.listAnswers(meta.draftKey)).toEqual([])
  })
})
