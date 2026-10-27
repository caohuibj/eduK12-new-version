import React, { StrictMode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createIstSnapshot } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/package'
import { IST_IDENTITY, IST_PROTOCOL, istPlan } from './generated/protocol'
import { digest, type IstContext, type IstPorts, type IstDraft } from './contracts'
import { IstTask } from './IstTask'
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function fixture(key: string) {
  const snapshot = createIstSnapshot('experience'), seed = 'ist-strictmode-synthetic', context: IstContext = { language: 'en', contextKey: key, randomSeed: seed, snapshot: { schemaVersion: 1, ...IST_IDENTITY, protocol: IST_PROTOCOL, config: snapshot.config, configHash: snapshot.configHash, protocolSignature: snapshot.protocolSignature, frozenAt: snapshot.frozenAt }, manifestHash: digest(istPlan(snapshot.config, seed)) }, saved: IstDraft[] = []
  const ports: IstPorts = { prepareLocalAttempt: vi.fn(async (c, manifest, realm) => ({ fresh: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: c, manifest, realm }) })), persistLocalDraft: vi.fn(async record => { saved.push(structuredClone(record)); return { retained: true as const, contextKey: record.contextKey, recordKey: record.recordKey, recordDigest: record.recordDigest } }), finalize: vi.fn(async () => { throw Error('No formal result expected in lifecycle assertion') }) }
  return { context, ports, saved }
}
afterEach(async () => { cleanup(); await flush(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('information sampling StrictMode lifecycle follow-up', () => {
  it('survives effect replay through preparation/start and saves a real unmount or context replacement through the original ports', async () => {
    let now = 100, next = 0; const frames = new Map<number, FrameRequestCallback>()
    vi.spyOn(performance, 'now').mockImplementation(() => now); vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next }); vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const start = async () => { fireEvent.click(screen.getByRole('button', { name: 'Prepare practice' })); await act(async () => flush()); fireEvent.click(screen.getByRole('button', { name: 'Start round' })); now++; const callbacks = [...frames.values()]; frames.clear(); await act(async () => { for (const cb of callbacks) cb(now); await flush() }); expect(screen.getAllByRole('button', { name: /Tile\d+ unopened/ })).toHaveLength(25) }
    const f = fixture('strict-original'); const first = render(<StrictMode><IstTask context={f.context} ports={f.ports} /></StrictMode>); await act(async () => flush()); expect(screen.getByRole('region', { name: 'Complete instructions and examples' })).toBeTruthy(); await start(); expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1); expect(f.ports.persistLocalDraft).not.toHaveBeenCalled()
    now++; first.unmount(); await act(async () => flush()); expect(f.saved).toHaveLength(1); expect(f.saved[0]).toMatchObject({ contextKey: 'strict-original', language: 'en', contextDigest: digest(f.context), phase: 'practice', raw: { status: 'interrupted', stopReason: 'context-disposed', state: { decision: null } } }); expect(f.ports.finalize).not.toHaveBeenCalled()
    const old = fixture('strict-old-context'), replacement = fixture('strict-replacement-context'), second = render(<StrictMode><IstTask context={old.context} ports={old.ports} /></StrictMode>); await act(async () => flush()); await start(); now++; second.rerender(<StrictMode><IstTask context={replacement.context} ports={replacement.ports} /></StrictMode>); await act(async () => flush()); expect(screen.getByRole('alert')).toBeTruthy(); expect(old.saved).toHaveLength(1); expect(old.saved[0].contextKey).toBe(old.context.contextKey); expect(replacement.ports.prepareLocalAttempt).not.toHaveBeenCalled(); expect(replacement.ports.persistLocalDraft).not.toHaveBeenCalled(); second.unmount(); await act(async () => flush()); expect(old.saved).toHaveLength(1)
  })
})
