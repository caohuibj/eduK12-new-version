import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedDbFinalDraftStore, FinalDraftStorageError } from '../finalDraftStore'

// Transaction double with staged writes and abort rollback, not a browser benchmark.
function fixture(options: { expired?: boolean; failKeys?: boolean; failDelete?: boolean; blocked?: boolean } = {}) {
  type Row = { key: IDBValidKey; draftKey: string; payload?: unknown; trainingRetention?: { expiredAt: number } }
  const rows: Record<string, Row[]> = {
    draftMeta: [{ key: 'target', draftKey: 'target', ...(options.expired ? { trainingRetention: { expiredAt: 1 } } : {}) }, { key: 'other', draftKey: 'other' }],
    draftAnswers: [{ key: ['target', 'question:一'], draftKey: 'target', payload: 'large answer' }, { key: ['other', 'question:一'], draftKey: 'other' }],
    draftTrials: [{ key: ['target', 0], draftKey: 'target', payload: 'large trial' }, { key: ['target', 12], draftKey: 'target' }, { key: ['other', 0], draftKey: 'other' }],
  }
  const before = structuredClone(rows)
  const keyReads = vi.fn()
  const payloadReads = vi.fn(() => { throw new Error('must not materialize payloads') })
  const deletes = vi.fn()
  const transaction = vi.fn((names: string[], mode: string) => {
    expect(names).toEqual(['draftMeta', 'draftAnswers', 'draftTrials'])
    expect(mode).toBe('readwrite')
    const staged = structuredClone(rows)
    let pending = 0, finished = false
    const tx = {
      oncomplete: null as null | (() => void), onabort: null as null | (() => void), onerror: null as null | (() => void), error: null as Error | null,
      abort: vi.fn(() => { if (finished) return; finished = true; queueMicrotask(() => tx.onabort?.()) }),
      objectStore(name: string) {
        expect(names).toContain(name)
        return {
          get(key: IDBValidKey) { return request(() => staged[name].find(row => row.key === key)) },
          delete(key: IDBValidKey) {
            deletes(name, key)
            return request(() => {
              if (options.failDelete && name === 'draftTrials') throw new Error('delete failed')
              staged[name] = staged[name].filter(row => JSON.stringify(row.key) !== JSON.stringify(key))
            })
          },
          index(indexName: string) {
            expect(indexName).toBe('draftKey')
            return { getAll: payloadReads, getAllKeys(query: string) {
              keyReads(name, query)
              return request(() => {
                if (options.failKeys && name === 'draftTrials') throw new Error('key read failed')
                return staged[name].filter(row => row.draftKey === query).map(row => row.key)
              })
            } }
          },
        }
      },
    }
    function request(operation: () => unknown) {
      pending += 1
      const req = { result: undefined as unknown, error: null as Error | null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) }
      setTimeout(() => {
        if (finished) return
        try { req.result = operation(); req.onsuccess?.() }
        catch (error) { req.error = error as Error; tx.error = error as Error; req.onerror?.(); tx.abort() }
        pending -= 1
        setTimeout(() => {
          if (pending || finished) return
          finished = true; Object.assign(rows, staged); tx.oncomplete?.()
        }, 0)
      }, 0)
      return req
    }
    return tx
  })
  const open = vi.fn(() => {
    const req = { result: { transaction }, onsuccess: null as null | (() => void), onblocked: null as null | (() => void) }
    queueMicrotask(() => options.blocked ? req.onblocked?.() : req.onsuccess?.())
    return req
  })
  vi.stubGlobal('indexedDB', { open })
  return { store: new IndexedDbFinalDraftStore(), rows, before, keyReads, payloadReads, deletes, transaction, open }
}

afterEach(() => vi.unstubAllGlobals())
describe('FINAL accepted-draft key-only cleanup', () => {
  it('deletes compound string/numeric primary keys without loading payloads or touching another draft', async () => {
    const f = fixture()
    await f.store.delete('target')
    expect(f.keyReads.mock.calls).toEqual([['draftAnswers', 'target'], ['draftTrials', 'target']])
    expect(f.payloadReads).not.toHaveBeenCalled()
    expect(f.deletes.mock.calls).toEqual([
      ['draftMeta', 'target'], ['draftAnswers', ['target', 'question:一']],
      ['draftTrials', ['target', 0]], ['draftTrials', ['target', 12]],
    ])
    for (const name of Object.keys(f.rows)) expect(f.rows[name]).toEqual(f.before[name].filter(row => row.draftKey === 'other'))
    expect(f.open).toHaveBeenCalledWith('eduk12-final-drafts-v1', 1)
  })
  it('keeps expired Training tombstones and their records untouched', async () => {
    const f = fixture({ expired: true })
    await f.store.delete('target')
    expect(f.rows).toEqual(f.before)
    expect(f.keyReads).not.toHaveBeenCalled()
    expect(f.deletes).not.toHaveBeenCalled()
  })
  it.each(['failKeys', 'failDelete'] as const)('rejects and rolls back all stores on %s', async failure => {
    const f = fixture({ [failure]: true })
    await expect(f.store.delete('target')).rejects.toBeInstanceOf(FinalDraftStorageError)
    expect(f.rows).toEqual(f.before)
    expect(f.payloadReads).not.toHaveBeenCalled()
  })
  it('reports blocked storage without starting cleanup', async () => {
    const f = fixture({ blocked: true })
    await expect(f.store.delete('target')).rejects.toBeInstanceOf(FinalDraftStorageError)
    expect(f.transaction).not.toHaveBeenCalled()
    expect(f.rows).toEqual(f.before)
  })
  it('handles an absent draft with no matching keys', async () => {
    const f = fixture()
    await f.store.delete('absent')
    expect(f.rows).toEqual(f.before)
    expect(f.keyReads.mock.calls).toEqual([['draftAnswers', 'absent'], ['draftTrials', 'absent']])
  })
})
