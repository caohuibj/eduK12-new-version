import {describe,it,expect,vi} from 'vitest'
import {assertTrainingReferenceReadyForMeasurement} from '../../modules/composite/training-reference-admission'
const hash='a'.repeat(64),ref='b'.repeat(64)
const row=()=>({id:'attempt',content_hash:hash,reference_hash:null as string|null,required:true,identity_valid:true})
describe('measurement runner readiness never selects references or guesses missing context',()=>{
 it('adds no query for explicit old null markers or an already frozen reference pair',async()=>{
  const db={$queryRaw:vi.fn()}
  for(const parent of [{id:'legacy',trainingContentBindingHash:null,trainingReferenceBindingHash:null},{id:'attempt',trainingContentBindingHash:hash,trainingReferenceBindingHash:ref}])
   await assertTrainingReferenceReadyForMeasurement(db as never,parent)
  expect(db.$queryRaw).not.toHaveBeenCalled()
 })
 it('uses one request-local metadata query for older content with no reference policy',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...row(),required:false}])},parent={id:'attempt',trainingContentBindingHash:hash,trainingReferenceBindingHash:null}
  await assertTrainingReferenceReadyForMeasurement(db as never,parent);await assertTrainingReferenceReadyForMeasurement(db as never,parent)
  expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  expect(db.$queryRaw.mock.calls[0][0].sql).not.toContain('SELECT training_content_binding,')
 })
 it('blocks direct Scale/Cognitive/SJT/media admission while a context-dependent reference policy is not frozen',async()=>{
  for(const _family of ['SCALE','COGNITIVE','SJT','MEDIA']){
   const db={$queryRaw:vi.fn().mockResolvedValue([row()])}
   await expect(assertTrainingReferenceReadyForMeasurement(db as never,{id:'attempt'})).rejects.toMatchObject({statusCode:409})
  }
 })
 it('does not cache rejection, so a genuinely completed context transaction permits the next read',async()=>{
  const current=row(),db={$queryRaw:vi.fn().mockImplementation(async()=>[current])},parent={id:'attempt'}
  await expect(assertTrainingReferenceReadyForMeasurement(db as never,parent)).rejects.toThrow()
  current.reference_hash=ref
  await expect(assertTrainingReferenceReadyForMeasurement(db as never,parent)).resolves.toBeUndefined()
  expect(db.$queryRaw).toHaveBeenCalledTimes(2)
 })
 it.each([{identity_valid:false},{id:'foreign'},{content_hash:ref},{reference_hash:'bad'}])('rejects malformed or mismatched metadata %j',async patch=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...row(),reference_hash:ref,...patch}])}
  await expect(assertTrainingReferenceReadyForMeasurement(db as never,{id:'attempt',trainingContentBindingHash:hash})).rejects.toMatchObject({statusCode:409})
 })
})
