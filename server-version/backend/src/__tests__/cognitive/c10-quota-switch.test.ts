import { beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../config'
import { readCognitiveQuota } from '../../modules/cognitive/attempt-quota'
const db={cognitiveAssignment:{findUnique:vi.fn()},cognitiveSession:{count:vi.fn(),findFirst:vi.fn()}}
beforeEach(()=>{vi.clearAllMocks();config.cognitiveModuleEnabled=false;db.cognitiveAssignment.findUnique.mockResolvedValue({id:'source',maxAttempts:3});db.cognitiveSession.count.mockResolvedValue(1)})
describe('C10 quota resume projection',()=>{
 it('OFF shell retains usage but is paused without a link; ON returns the same session',async()=>{
  db.cognitiveSession.findFirst.mockResolvedValue({id:'old',compositeAttemptId:null,frozenAdmissionSnapshotHash:null})
  expect(await readCognitiveQuota(db as any,'owner','source')).toMatchObject({admissionPaused:true,continueHref:null,usedAttempts:1,remainingAttempts:2})
  config.cognitiveModuleEnabled=true
  expect(await readCognitiveQuota(db as any,'owner','source')).toMatchObject({admissionPaused:false,continueHref:'/student/cognitive/sessions/old'})
  expect(db.cognitiveSession.findFirst).toHaveBeenCalledTimes(2)
 })
 it('OFF admitted composite or standalone keeps its exact recovery link',async()=>{
  for(const parent of [null,'parent']){
   db.cognitiveSession.findFirst.mockResolvedValue({id:'old',compositeAttemptId:parent,frozenAdmissionSnapshotHash:'accepted'})
   expect(await readCognitiveQuota(db as any,'owner','source')).toMatchObject({admissionPaused:false,continueHref:parent?'/student/composite/attempts/parent':'/student/cognitive/sessions/old'})
  }
 })
})
