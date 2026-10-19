import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ stored: vi.fn(), persist: vi.fn(), load: vi.fn(), find: vi.fn(), write: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { cognitiveSession: { findUnique: mocks.find, updateMany: mocks.write } } }))
vi.mock('../../modules/assessment-runtime/unit-admission', () => ({
  loadStoredUnitAdmission: mocks.stored, readStoredUnitAdmission: mocks.stored, persistAdmissionOnce: mocks.persist,
}))
vi.mock('../../modules/cognitive/session.service', () => ({ loadCognitiveSessionConfig: mocks.load }))
import { config } from '../../config'
import { activateCognitiveAdmission, ensureCognitiveAdmissionAtDelivery } from '../../modules/cognitive/cognitive-admission.service'
const shell = { id:'session', userId:'owner', recoveryTokenHash:null, compositeAttemptId:null, compositeItemId:null,
  testType:'reaction', engineVersion:'1.0.0', scoringVersion:'1.0.0', configVersion:'1.0.0', attemptNo:1,
  status:'IN_PROGRESS', deliveryMode:'FINAL_ONLY', runtimeGeneration:'UNIFIED_V1', compiledRuntimeHash:'b'.repeat(64),
  configSnapshotEncrypted:'runtime', frozenAdmissionSnapshotEncrypted:null, frozenAdmissionSnapshotHash:null } as any
beforeEach(() => { vi.clearAllMocks(); config.cognitiveModuleEnabled=true; mocks.stored.mockResolvedValue(null); mocks.load.mockResolvedValue({snapshot:{configHash:'a'.repeat(64)}}); mocks.persist.mockImplementation(async ({snapshot}) => snapshot) })
describe('C10 cognitive admission uses the existing server switch', () => {
  it('OFF does not activate an existing shell or write admission; ON can continue it', async () => {
    config.cognitiveModuleEnabled=false
    await expect(activateCognitiveAdmission(shell)).rejects.toMatchObject({ code:'INSTRUMENT_NOT_AVAILABLE', statusCode:409 })
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
    config.cognitiveModuleEnabled=true
    const accepted=await activateCognitiveAdmission(shell)
    expect(accepted.principal.userId).toBe('owner'); expect(accepted.attemptEpoch).toBe(1)
    expect(mocks.persist).toHaveBeenCalledTimes(1)
  })
  it('OFF returns a durable existing admission without refreezing runtime or writing', async () => {
    const accepted=await activateCognitiveAdmission(shell)
    vi.clearAllMocks(); mocks.stored.mockResolvedValue(accepted); config.cognitiveModuleEnabled=false
    expect(await ensureCognitiveAdmissionAtDelivery(shell.id,undefined,shell)).toBe(accepted)
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled()
  })
  it('does not let caller-supplied parent or child bypass existing structural binding', async () => {
    config.cognitiveModuleEnabled=false
    await expect(ensureCognitiveAdmissionAtDelivery('other',undefined,shell)).rejects.toMatchObject({ code:'DEFINITION_MISMATCH' })
    await expect(ensureCognitiveAdmissionAtDelivery(shell.id,{id:'other'} as any,shell)).rejects.toMatchObject({ code:'DEFINITION_MISMATCH' })
    expect(mocks.persist).not.toHaveBeenCalled()
  })
})
