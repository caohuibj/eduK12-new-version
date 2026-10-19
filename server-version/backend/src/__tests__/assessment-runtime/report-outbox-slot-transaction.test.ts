import {expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({loadSlots:vi.fn(),globalDb:{$queryRaw:vi.fn(),$executeRaw:vi.fn(),$transaction:vi.fn(),compositeAssessmentAttempt:{findUnique:vi.fn()}}}))
vi.mock('../../config/database',()=>({prisma:mocks.globalDb}))
vi.mock('../../modules/assessment-runtime/slot-set',async importOriginal=>({...(await importOriginal<any>()),loadFrozenActiveSlotSet:mocks.loadSlots}))
import {enqueueCompositeReportForUnit} from '../../modules/assessment-runtime/report-outbox.service'

it('passes the existing enqueue transaction to the frozen slot reader before any global connection or budget write',async()=>{
 const sentinel=new Error('transaction-local-slot-read-probe')
 mocks.loadSlots.mockRejectedValueOnce(sentinel)
 const parent={id:'parent',attemptEpoch:3,asyncReportEpoch:3,status:'IN_PROGRESS',frozenActiveSlotSetEncrypted:'shared-slot-reference',frozenActiveSlotSetHash:'a'.repeat(64),contextSnapshotHash:null}
 const tx={compositeAssessmentAttempt:{findUnique:vi.fn().mockResolvedValue(parent),updateMany:vi.fn()},
  $queryRaw:vi.fn().mockResolvedValue([{id:'job',status:'WAITING',budgetHeld:false}]),
  assessmentUnitSnapshot:{findMany:vi.fn()},compositeReportJob:{update:vi.fn()}}
 await expect(enqueueCompositeReportForUnit(tx as any,{compositeAttemptId:parent.id,attemptEpoch:3})).rejects.toBe(sentinel)
 expect(tx.compositeAssessmentAttempt.findUnique).toHaveBeenCalledTimes(1);expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 expect(mocks.loadSlots).toHaveBeenCalledExactlyOnceWith(parent.frozenActiveSlotSetEncrypted,tx)
 expect(tx.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled();expect(tx.compositeReportJob.update).not.toHaveBeenCalled();expect(tx.compositeAssessmentAttempt.updateMany).not.toHaveBeenCalled()
 expect(mocks.globalDb.$queryRaw).not.toHaveBeenCalled();expect(mocks.globalDb.$executeRaw).not.toHaveBeenCalled();expect(mocks.globalDb.$transaction).not.toHaveBeenCalled();expect(mocks.globalDb.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
})
