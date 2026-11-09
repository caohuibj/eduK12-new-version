import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedDbFinalDraftStore } from '../finalDraftStore'

// Minimal transaction double for clearAll: enumerate metas, drop every
// non-retained draft with its answers/trials, keep retained tombstones.
function fixture(options: { retained?: boolean } = {}) {
  const rows: Record<string, Array<{ key: IDBValidKey; draftKey: string; trainingRetention?: { expiredAt: number } }>> = {
    draftMeta: [
      { key: 'draft-a', draftKey: 'draft-a' },
      { key: 'draft-b', draftKey: 'draft-b', ...(options.retained ? { trainingRetention: { expiredAt: 1 } } : {}) },
    ],
    draftAnswers: [
      { key: ['draft-a', 'q:1'], draftKey: 'draft-a' },
      { key: ['draft-b', 'q:1'], draftKey: 'draft-b' },
    ],
    draftTrials: [{ key: ['draft-a', 0], draftKey: 'draft-a' }, { key: ['draft-b', 3], draftKey: 'draft-b' }],
  }
  const before = structuredClone(rows)
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
          getAll: () => request(() => staged[name].filter(row => name === 'draftMeta')),
          delete(key: IDBValidKey) {
            deletes(name, key)
            return request(() => { staged[name] = staged[name].filter(row => JSON.stringify(row.key) !== JSON.stringify(key)) })
          },
          index(indexName: string) {
            expect(indexName).toBe('draftKey')
            return { getAllKeys(query: string) {
              return request(() => staged[name].filter(row => row.draftKey === query).map(row => row.key))
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
    queueMicrotask(() => req.onsuccess?.())
    return req
  })
  vi.stubGlobal('indexedDB', { open })
  return { store: new IndexedDbFinalDraftStore(), rows, before, deletes }
}

afterEach(() => vi.unstubAllGlobals())

describe('shared-device clearAll (X-05B)', () => {
  it('discards every draft with its answers and trials in one transaction', async () => {
    const f = fixture()
    await f.store.clearAll()
    expect(f.rows.draftMeta).toEqual([])
    expect(f.rows.draftAnswers).toEqual([])
    expect(f.rows.draftTrials).toEqual([])
  })

  it('preserves retention tombstones but drops their answer and trial records', async () => {
    const f = fixture({ retained: true })
    await f.store.clearAll()
    expect(f.rows.draftMeta.map(row => row.draftKey)).toEqual(['draft-b'])
    expect(f.rows.draftAnswers).toEqual([])
    expect(f.rows.draftTrials).toEqual([])
  })
})
