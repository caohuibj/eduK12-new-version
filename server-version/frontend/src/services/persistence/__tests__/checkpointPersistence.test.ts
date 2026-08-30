import { describe, expect, it, vi } from 'vitest'
import { createMemoryCheckpointStore } from '../checkpointStore'
import { CheckpointScheduler } from '../checkpointScheduler'

describe('durable checkpoint persistence', () => {
  it('allocates monotonic sequences per assessment scope', async () => {
    const store = createMemoryCheckpointStore()
    const first = await store.append({ scopeType: 'scale', scopeId: 'assessment-1', payload: { itemCode: 'a' } })
    const second = await store.append({ scopeType: 'scale', scopeId: 'assessment-1', payload: { itemCode: 'b' } })
    const otherScope = await store.append({ scopeType: 'scale', scopeId: 'assessment-2', payload: { itemCode: 'a' } })

    expect([first.sequence, second.sequence, otherScope.sequence]).toEqual([1, 2, 1])
    expect((await store.list('scale', 'assessment-1')).map((record) => record.sequence)).toEqual([1, 2])
  })

  it('only removes records explicitly acknowledged by the server', async () => {
    const store = createMemoryCheckpointStore()
    const scheduler = new CheckpointScheduler(store)
    const transport = vi.fn().mockResolvedValue({ acceptedSequence: 1 })
    await scheduler.enqueue({ scopeType: 'questionnaire', scopeId: 'qa-1', payload: { formItemId: 'a' } }, transport)
    await scheduler.enqueue({ scopeType: 'questionnaire', scopeId: 'qa-1', payload: { formItemId: 'b' } }, transport)

    await scheduler.flush('questionnaire', 'qa-1')

    expect(transport).toHaveBeenCalledTimes(1)
    expect((await store.list('questionnaire', 'qa-1')).map((record) => record.sequence)).toEqual([2])
  })

  it('keeps a failed batch for an identical retry and records attempts', async () => {
    const store = createMemoryCheckpointStore()
    const scheduler = new CheckpointScheduler(store)
    const transport = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ acceptedIds: [] })
    await scheduler.enqueue({ scopeType: 'cognitive', scopeId: 'session-1', payload: { trialIndex: 7 } }, transport)

    await expect(scheduler.flush('cognitive', 'session-1')).rejects.toThrow('network')
    const pending = await store.list('cognitive', 'session-1')
    expect(pending).toHaveLength(1)
    expect(pending[0].attempts).toBe(1)
  })
})

