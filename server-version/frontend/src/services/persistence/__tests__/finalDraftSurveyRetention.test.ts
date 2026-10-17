import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFinalDraftMeta, createFinalDraftStore, SURVEY_COGNITIVE_DRAFT_TTL_MS as ttl } from '../finalDraftStore'

const start=10000000
const meta=(id:string,survey=true)=>createFinalDraftMeta({
  draftKey:'cognitive:'+id,instrument:'cognitive',attemptId:id,attemptEpoch:1,
  definitionHash:'definition',contextSnapshotHash:null,deliveryMode:'final_only',submissionId:'submission-'+id,
  ...(survey?{surveyRetention:{schemaVersion:1 as const,lastWriteAt:Date.now()}}:{}),
})
afterEach(()=>vi.restoreAllMocks())
describe('Survey-only cognitive draft retention',()=>{
  it('expires strictly after seven days and removes answers and trials together',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    const draft=meta('expired');await store.ensure(draft)
    await store.putAnswer({draftKey:draft.draftKey,itemKey:'q',value:'a',updatedAt:start})
    await store.putTrial({draftKey:draft.draftKey,trialIndex:0,payload:{response:'a'},createdAt:start})
    expect(await store.expireSurveyCognitiveDraft('expired',false,start+ttl)).toBe(false)
    now.mockReturnValue(start+ttl+1)
    expect(await store.expireSurveyCognitiveDraft('expired',false,Date.now())).toBe(true)
    expect(await store.get(draft.draftKey)).toBeNull()
    expect(await store.listTrials(draft.draftKey)).toEqual([])
    expect(await store.listAnswers(draft.draftKey)).toEqual([])
  })

  it('renews only effective writes, not reads, ensure, equal answers, trial replay or unchanged metadata',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    const draft=meta('writes'),key=draft.draftKey;await store.ensure(draft)
    const written=async()=> (await store.get(key))?.surveyRetention?.lastWriteAt
    now.mockReturnValue(start+1)
    await store.putTrial({draftKey:key,trialIndex:0,payload:{response:'a'},createdAt:1})
    expect(await written()).toBe(start+1) // actual persistence time, not caller's trial timestamp
    now.mockReturnValue(start+2)
    await store.ensure(meta('writes'));await store.snapshot(key);await store.listTrials(key)
    await store.putTrial({draftKey:key,trialIndex:0,payload:{response:'a'},createdAt:2})
    expect(await written()).toBe(start+1)
    await expect(store.putTrial({draftKey:key,trialIndex:0,payload:{response:'conflict'},createdAt:2})).rejects.toThrow()
    expect(await written()).toBe(start+1)
    await store.putAnswer({draftKey:key,itemKey:'q',value:'a',updatedAt:1})
    expect(await written()).toBe(start+2)
    now.mockReturnValue(start+3)
    await store.putAnswer({draftKey:key,itemKey:'q',value:'a',updatedAt:3})
    await store.deleteAnswers(key,['absent'])
    await store.update({...((await store.get(key))!),updatedAt:start+3})
    expect(await written()).toBe(start+2)
    await store.setInstrumentMetadata(key,{input:'KEYBOARD'})
    expect(await written()).toBe(start+3)
    now.mockReturnValue(start+4)
    await store.setInstrumentMetadata(key,{input:'KEYBOARD'})
    await store.setStatus(key,'DRAFT')
    // setStatus adds explicit null error fields on its first effective change.
    const statusWrite=await written()
    now.mockReturnValue(start+5);await store.setStatus(key,'DRAFT')
    expect(await written()).toBe(statusWrite)
    await store.deleteAnswers(key,['q']);expect(await written()).toBe(start+5)
    expect(await store.expireSurveyCognitiveDraft('writes',false,start+ttl+1)).toBe(false)
  })

  it('migrates explicitly registered legacy drafts from now, never inferring age from old metadata',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    await store.ensure(meta('legacy',false));await store.ensure(meta('other-product',false))
    now.mockReturnValue(start+ttl*10)
    expect((await store.listSurveyCognitiveDrafts(['legacy'])).sessionIds).toEqual(['legacy'])
    expect(await store.expireSurveyCognitiveDraft('legacy',false,Date.now())).toBe(false)
    expect((await store.get('cognitive:legacy'))?.surveyRetention).toBeUndefined()
    expect(await store.expireSurveyCognitiveDraft('legacy',true,Date.now())).toBe(false)
    expect((await store.get('cognitive:legacy'))?.surveyRetention?.lastWriteAt).toBe(Date.now())
    expect(await store.expireSurveyCognitiveDraft('other-product',false,Date.now())).toBe(false)
    now.mockReturnValue(Date.now()+ttl+1)
    expect(await store.expireSurveyCognitiveDraft('legacy',true,Date.now())).toBe(true)
    expect(await store.get('cognitive:other-product')).not.toBeNull()
  })

  it('conservatively rebases a clock that has moved backwards and does not renew on reopening',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    await store.ensure(meta('clock'))
    now.mockReturnValue(start-100)
    expect(await store.expireSurveyCognitiveDraft('clock',false,Date.now())).toBe(false)
    expect((await store.get('cognitive:clock'))?.surveyRetention?.lastWriteAt).toBe(start-100)
    now.mockReturnValue(start)
    await store.ensure(meta('clock'))
    expect((await store.get('cognitive:clock'))?.surveyRetention?.lastWriteAt).toBe(start-100)
  })

  it('never expires seals, pending retries, completed results, or a different instrument namespace',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    for(const status of ['SUBMITTING','RETRY_PENDING','CONFLICT','COMPLETED'] as const){
      const draft=meta(status);await store.ensure(draft)
      await store.sealForSubmission(draft.draftKey,()=>({submissionId:draft.submissionId,trials:[]}))
      await store.setStatus(draft.draftKey,status)
    }
    await store.ensure({...meta('sealed-draft'),sealedSubmission:{schemaVersion:1,sealedAt:start,payload:{same:'FINAL'}}})
    await store.ensure({...meta('old-pending',false),status:'SUBMITTING'})
    await store.ensure({...meta('scale'),instrument:'scale'})
    await store.ensure({...meta('bad-key'),draftKey:'scale:bad-key'})
    now.mockReturnValue(start+ttl*10)
    for(const id of ['SUBMITTING','RETRY_PENDING','CONFLICT','COMPLETED','sealed-draft','old-pending','scale','bad-key']){
      expect(await store.expireSurveyCognitiveDraft(id,true,Date.now())).toBe(false)
    }
    expect((await store.get('cognitive:RETRY_PENDING'))?.sealedSubmission?.payload).toEqual({submissionId:'submission-RETRY_PENDING',trials:[]})
    expect((await store.get('cognitive:old-pending'))?.surveyRetention).toBeUndefined()
  })

  it('rechecks current state after discovery when a write or seal wins the race',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    await store.ensure(meta('write'));await store.ensure(meta('seal'))
    now.mockReturnValue(start+ttl+1)
    expect((await store.listSurveyCognitiveDrafts([])).sessionIds).toEqual(['seal','write'])
    await store.putTrial({draftKey:'cognitive:write',trialIndex:0,payload:{response:'new'},createdAt:Date.now()})
    await store.sealForSubmission('cognitive:seal',()=>({submissionId:'original',trials:[]}))
    expect(await store.expireSurveyCognitiveDraft('write',false,Date.now())).toBe(false)
    expect(await store.expireSurveyCognitiveDraft('seal',false,Date.now())).toBe(false)
  })
  it('bounds each scan page and safely continues after a deleted cursor key',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(start)
    const store=createFinalDraftStore()
    for(let i=0;i<105;i++)await store.ensure(meta(String(i).padStart(3,'0')))
    const first=await store.listSurveyCognitiveDrafts([])
    expect(first.sessionIds).toHaveLength(100)
    expect(first.nextCursor).toBe('cognitive:099')
    await store.delete(first.nextCursor!)
    const second=await store.listSurveyCognitiveDrafts([],first.nextCursor)
    expect(second.sessionIds).toEqual(['100','101','102','103','104'])
    expect(second.nextCursor).toBeNull()
  })

  it('gives malformed persisted timestamps a full new grace period instead of guessing their age',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(start)
    const store=createFinalDraftStore()
    for(const [id,value] of [['missing',undefined],['nan',Number.NaN],['negative',-1],['future',start+ttl]] as const){
      const draft=meta(id);await store.ensure(draft)
      // Simulate corrupt persisted fields in this memory-store fixture; browser
      // acceptance separately seeds real IndexedDB records through transactions.
      const persisted=(await store.get(draft.draftKey))!
      persisted.surveyRetention={schemaVersion:1,lastWriteAt:value as number}
      expect(await store.expireSurveyCognitiveDraft(id,false,start)).toBe(false)
      expect((await store.get(draft.draftKey))?.surveyRetention?.lastWriteAt).toBe(start)
      expect(await store.expireSurveyCognitiveDraft(id,false,start+ttl)).toBe(false)
    }
  })

  it('cannot recreate partial trials if cleanup won before a stale writer',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(start),store=createFinalDraftStore()
    await store.ensure(meta('stale-writer'))
    now.mockReturnValue(start+ttl+1)
    expect(await store.expireSurveyCognitiveDraft('stale-writer',false,Date.now())).toBe(true)
    await expect(store.putTrial({draftKey:'cognitive:stale-writer',trialIndex:4,payload:{response:'late'},createdAt:Date.now()})).rejects.toThrow('本地测评草稿不存在')
    expect(await store.listTrials('cognitive:stale-writer')).toEqual([])
  })

  it('does not serialize another product or a sealed FINAL for retention on shared status writes',async()=>{
    const store=createFinalDraftStore()
    await store.ensure(meta('other',false));await store.ensure(meta('large-final'))
    await store.sealForSubmission('cognitive:large-final',()=>({trials:['x'.repeat(10000)]}))
    const stringify=vi.spyOn(JSON,'stringify')
    await store.setStatus('cognitive:other','DRAFT')
    await store.setStatus('cognitive:large-final','RETRY_PENDING')
    expect(stringify).not.toHaveBeenCalled()
  })

})
